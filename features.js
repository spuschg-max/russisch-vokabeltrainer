(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const VOICE_KEY='russischVokabeltrainer.voice.v2';
const SILENCE_MS=2000;
const $=s=>document.querySelector(s);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clone=x=>JSON.parse(JSON.stringify(x));

const defaultVoiceSettings={mode:'auto',speakPrompt:true,speakCorrection:true,advanceDelay:2600};
let voiceSettings=loadVoiceSettings();
let micRecognition=null;
let micTimer=null;
let micTranscript='';
let micFinalized=false;
let promptTimer=null;
let autoAdvanceTimer=null;
let feedbackKey='';
let speaking=false;
let autoAdvancing=false;

function showToast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function getMainState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function putMainState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function getExerciseStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function saveExerciseStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
function loadVoiceSettings(){
  try{return {...defaultVoiceSettings,...JSON.parse(localStorage.getItem(VOICE_KEY)||'{}')}}catch(e){return {...defaultVoiceSettings}}
}
function saveVoiceSettings(){localStorage.setItem(VOICE_KEY,JSON.stringify(voiceSettings));}

function ensureExerciseStore(){
  let store=getExerciseStore();
  const current=getMainState();
  if(!store||!store.exercises||!store.activeId){
    const id='exercise-1';
    store={version:1,activeId:id,order:[id],exercises:{[id]:{id,name:'Übung 1',description:'Aktuelle Vokabelsammlung',state:clone(current||{})}}};
    saveExerciseStore(store);
    return store;
  }
  if(!store.exercises[store.activeId])store.activeId=store.order.find(id=>store.exercises[id])||Object.keys(store.exercises)[0];
  if(current&&store.exercises[store.activeId]){
    store.exercises[store.activeId].state=clone(current);
    saveExerciseStore(store);
  }
  return store;
}
function syncCurrentExercise(){
  const store=getExerciseStore(),current=getMainState();
  if(!store||!current||!store.exercises?.[store.activeId])return;
  store.exercises[store.activeId].state=clone(current);
  saveExerciseStore(store);
}
function emptyStateFromCurrent(){
  const current=getMainState()||{};
  const ids=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);
  return {version:current.version||2,words:[],progress:{},settings:clone(current.settings||{}),daily:{},streak:{current:0,best:0,lastDate:null},deletedDefaultIds:ids,createdAt:new Date().toISOString()};
}
function switchExercise(id){
  const store=getExerciseStore();
  if(!store||!store.exercises?.[id]||id===store.activeId)return;
  stopAllVoice();syncCurrentExercise();
  const fresh=getExerciseStore();
  fresh.activeId=id;saveExerciseStore(fresh);putMainState(clone(fresh.exercises[id].state));location.reload();
}
function createExercise(){
  const name=$('#newExerciseName')?.value.trim();
  if(!name){showToast('Bitte zuerst einen Namen eingeben.');return;}
  stopAllVoice();syncCurrentExercise();
  const store=getExerciseStore(),id='exercise-'+Date.now();
  store.exercises[id]={id,name,description:$('#newExerciseDescription')?.value.trim()||'',state:emptyStateFromCurrent()};
  store.order.push(id);store.activeId=id;saveExerciseStore(store);putMainState(clone(store.exercises[id].state));location.reload();
}
function saveExerciseDetails(){
  const store=getExerciseStore(),ex=store?.exercises?.[store.activeId];
  if(!ex)return;
  const name=$('#exerciseName')?.value.trim();
  if(!name){showToast('Der Name darf nicht leer sein.');return;}
  ex.name=name;ex.description=$('#exerciseDescription')?.value.trim()||'';saveExerciseStore(store);renderExerciseUi();showToast('Übung gespeichert');
}
function deleteExercise(){
  stopAllVoice();syncCurrentExercise();
  const store=getExerciseStore();
  if(!store||store.order.length<=1){showToast('Mindestens eine Übung muß erhalten bleiben.');return;}
  const ex=store.exercises[store.activeId];
  if(!confirm(`„${ex.name}“ wirklich löschen?\n\nDie Vokabeln und der Lernstand dieser Übung werden entfernt.`))return;
  const oldId=store.activeId;store.order=store.order.filter(id=>id!==oldId);delete store.exercises[oldId];store.activeId=store.order[0];saveExerciseStore(store);putMainState(clone(store.exercises[store.activeId].state));location.reload();
}
function duplicateExercise(){
  stopAllVoice();syncCurrentExercise();
  const store=getExerciseStore(),source=store?.exercises?.[store.activeId];if(!source)return;
  const id='exercise-'+Date.now();store.exercises[id]={id,name:source.name+' – Kopie',description:source.description||'',state:clone(source.state)};store.order.push(id);store.activeId=id;saveExerciseStore(store);putMainState(clone(store.exercises[id].state));location.reload();
}

function injectExerciseUi(){
  if($('#exerciseBar'))return;
  const nav=$('.tabs');
  if(nav){
    const bar=document.createElement('section');bar.id='exerciseBar';bar.className='exercise-bar';
    bar.innerHTML=`<div class="exercise-bar-label">Aktive Übung</div><select id="exerciseSelect" aria-label="Aktive Übung auswählen"></select><button id="voiceQuickToggle" class="secondary compact voice-quick" type="button"></button><div id="exerciseDescriptionTop" class="exercise-bar-description"></div>`;
    nav.insertAdjacentElement('afterend',bar);
  }
  const install=$('#installPanel');
  if(install){
    const voice=document.createElement('div');voice.id='voiceSettingsPanel';voice.className='panel';
    voice.innerHTML=`
      <h3>Sprach- und Automatikmodus</h3>
      <p>Im Automatikmodus wird die neue Vokabel vorgelesen, danach hört das Mikrofon zu. Nach 2 Sekunden Sprechpause wird automatisch geprüft.</p>
      <div class="voice-settings-grid">
        <label>Betriebsart<select id="trainingMode"><option value="auto">Automatisch / freihändig</option><option value="manual">Manuell weiter</option></select></label>
        <label>Pause nach der Auswertung<select id="advanceDelay"><option value="2000">2 Sekunden</option><option value="2600">2,6 Sekunden</option><option value="3000">3 Sekunden</option><option value="4000">4 Sekunden</option></select></label>
      </div>
      <label class="check-row"><input id="speakPromptSetting" type="checkbox"> Neue Vokabel automatisch vorlesen</label>
      <label class="check-row"><input id="speakCorrectionSetting" type="checkbox"> Bei „fast“ oder falsch die richtige Lösung vorlesen</label>
      <p class="voice-note">Bewertung: <strong class="green-text">✓ richtig</strong> · <strong class="orange-text">○ fast richtig</strong> · <strong class="red-text">✕ falsch</strong>. Im manuellen Modus entscheidest du mit „Weiter“ selbst, wann die nächste Vokabel kommt.</p>`;
    install.insertAdjacentElement('beforebegin',voice);

    const panel=document.createElement('div');panel.id='exerciseSettingsPanel';panel.className='panel';
    panel.innerHTML=`
      <h3>Übungen verwalten</h3><p>Jede Übung hat eine eigene Vokabelsammlung und einen eigenen Lernstand.</p>
      <div class="exercise-settings-grid"><label>Name der aktiven Übung<input id="exerciseName" autocomplete="off"></label><label>Beschreibung<input id="exerciseDescription" autocomplete="off" placeholder="z. B. Grundwortschatz aus dem Cornelsen-Buch"></label></div>
      <div class="button-wrap exercise-actions"><button id="saveExerciseDetails" class="primary" type="button">Name speichern</button><button id="duplicateExercise" class="secondary" type="button">Übung kopieren</button><button id="deleteExercise" class="danger" type="button">Übung löschen</button></div>
      <hr class="exercise-divider"><h3>Neue Übung</h3>
      <div class="exercise-settings-grid"><label>Name<input id="newExerciseName" autocomplete="off" placeholder="z. B. Cornelsen Grundwortschatz"></label><label>Beschreibung<input id="newExerciseDescription" autocomplete="off" placeholder="optional"></label></div>
      <button id="createExercise" class="primary" type="button">+ Neue Übung anlegen</button>`;
    voice.insertAdjacentElement('beforebegin',panel);
  }
  injectStyles();
  $('#exerciseSelect')?.addEventListener('change',e=>switchExercise(e.target.value));
  $('#saveExerciseDetails')?.addEventListener('click',saveExerciseDetails);
  $('#createExercise')?.addEventListener('click',createExercise);
  $('#deleteExercise')?.addEventListener('click',deleteExercise);
  $('#duplicateExercise')?.addEventListener('click',duplicateExercise);
  $('#voiceQuickToggle')?.addEventListener('click',()=>{voiceSettings.mode=voiceSettings.mode==='auto'?'manual':'auto';saveVoiceSettings();renderVoiceSettings();stopAllVoice();schedulePrompt(250);});
  $('#trainingMode')?.addEventListener('change',e=>{voiceSettings.mode=e.target.value;saveVoiceSettings();renderVoiceSettings();stopAllVoice();schedulePrompt(250);});
  $('#advanceDelay')?.addEventListener('change',e=>{voiceSettings.advanceDelay=Number(e.target.value)||2600;saveVoiceSettings();});
  $('#speakPromptSetting')?.addEventListener('change',e=>{voiceSettings.speakPrompt=e.target.checked;saveVoiceSettings();stopAllVoice();schedulePrompt(250);});
  $('#speakCorrectionSetting')?.addEventListener('change',e=>{voiceSettings.speakCorrection=e.target.checked;saveVoiceSettings();});
}
function injectStyles(){
  if($('#featureStyles'))return;
  const style=document.createElement('style');style.id='featureStyles';style.textContent=`
    .exercise-bar{display:grid;grid-template-columns:auto minmax(180px,1fr) auto;gap:5px 12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:-6px 0 14px}
    .exercise-bar-label{font-size:12px;font-weight:800;color:var(--muted)}.exercise-bar select{width:100%;border:1px solid #cfd5dd;border-radius:10px;padding:9px 11px;background:var(--surface);color:var(--text);font-weight:800}.exercise-bar-description{grid-column:2;color:var(--muted);font-size:12px;min-height:15px}.voice-quick{white-space:nowrap;padding:9px 11px}
    .exercise-settings-grid,.voice-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.exercise-settings-grid label,.voice-settings-grid label{display:grid;gap:6px;font-size:13px;font-weight:700}.exercise-settings-grid input,.voice-settings-grid select{width:100%;border:1px solid #cfd5dd;border-radius:11px;padding:12px 13px;background:var(--surface);color:var(--text)}
    .exercise-actions{margin-bottom:14px}.exercise-divider{border:0;border-top:1px solid var(--line);margin:16px 0}.mic-status{min-height:20px;margin-top:7px;font-size:12px;color:var(--muted);text-align:center}.mic-status.listening{color:var(--accent);font-weight:800}.voice-note{margin-top:12px!important}.green-text{color:#2f7d54}.orange-text{color:#c17b10}.red-text{color:#a23b3b}
    .feedback-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(255,255,255,.12);backdrop-filter:blur(1px);opacity:0;transition:opacity .12s ease}.feedback-overlay.show{opacity:1}.feedback-card{width:min(82vw,420px);aspect-ratio:1/1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 24px 70px rgba(0,0,0,.22);border:10px solid currentColor;background:rgba(255,255,255,.94);transform:scale(.72);transition:transform .18s ease}.feedback-overlay.show .feedback-card{transform:scale(1)}.feedback-symbol{font-size:clamp(110px,35vw,220px);font-weight:900;line-height:.8}.feedback-label{font-size:clamp(25px,7vw,42px);font-weight:900;margin-top:24px}.feedback-overlay.correct{color:#2f8b58}.feedback-overlay.almost{color:#d18412}.feedback-overlay.wrong{color:#b63b3b}body.dark .feedback-card{background:rgba(23,29,40,.95)}
    .manual-next{width:100%;margin-top:14px;font-size:17px}.result-mark.almost{color:#c17b10}.answer-line input.voice-recognized{box-shadow:0 0 0 3px rgba(47,125,84,.18)}
    @media(max-width:650px){.exercise-bar{grid-template-columns:1fr auto}.exercise-bar-label{grid-column:1/-1}.exercise-bar select{grid-column:1}.voice-quick{grid-column:2}.exercise-bar-description{grid-column:1/-1}.exercise-settings-grid,.voice-settings-grid{grid-template-columns:1fr}.feedback-card{width:min(78vw,330px)}}`;
  document.head.appendChild(style);
}
function renderExerciseUi(){
  const store=getExerciseStore(),select=$('#exerciseSelect');if(!store||!select)return;
  select.innerHTML=store.order.filter(id=>store.exercises[id]).map((id,index)=>{const ex=store.exercises[id];return `<option value="${id}"${id===store.activeId?' selected':''}>${index+1}. ${escapeHtml(ex.name)}</option>`;}).join('');
  const ex=store.exercises[store.activeId];if($('#exerciseDescriptionTop'))$('#exerciseDescriptionTop').textContent=ex.description||'';if($('#exerciseName'))$('#exerciseName').value=ex.name||'';if($('#exerciseDescription'))$('#exerciseDescription').value=ex.description||'';
}
function renderVoiceSettings(){
  if($('#trainingMode'))$('#trainingMode').value=voiceSettings.mode;if($('#advanceDelay'))$('#advanceDelay').value=String(voiceSettings.advanceDelay);if($('#speakPromptSetting'))$('#speakPromptSetting').checked=voiceSettings.speakPrompt;if($('#speakCorrectionSetting'))$('#speakCorrectionSetting').checked=voiceSettings.speakCorrection;
  const quick=$('#voiceQuickToggle');if(quick)quick.textContent=voiceSettings.mode==='auto'?'Automatik: AN':'Automatik: AUS';
  updateManualNext();
}

function getCurrentWordFromEditor(){
  stopAllVoice(false);const edit=$('#editCurrent'),dialog=$('#wordDialog');if(!edit||!dialog)return null;edit.click();const id=$('#editId')?.value,ru=$('#editRu')?.value||'',de=$('#editDe')?.value||'';if(dialog.open)dialog.close();return id?{id,ru,de}:null;
}
function discardCurrent(){
  const word=getCurrentWordFromEditor();if(!word)return;const store=getExerciseStore(),ex=store?.exercises?.[store.activeId],exName=ex?.name||'dieser Übung';
  if(!confirm(`„${word.ru} – ${word.de}“ aus „${exName}“ verwerfen?\n\nDie Vokabel erscheint in dieser Übung danach nicht mehr. Du kannst sie dort später neu aufnehmen.`)){schedulePrompt(350);return;}
  try{const state=getMainState();if(!state||!Array.isArray(state.words))throw new Error('state');state.words=state.words.filter(w=>w.id!==word.id);if(state.progress)delete state.progress[word.id];if(word.id.startsWith('v')){state.deletedDefaultIds=Array.isArray(state.deletedDefaultIds)?state.deletedDefaultIds:[];if(!state.deletedDefaultIds.includes(word.id))state.deletedDefaultIds.push(word.id)}putMainState(state);if(ex){ex.state=clone(state);saveExerciseStore(store)}showToast('Vokabel aus dieser Übung verworfen');setTimeout(()=>location.reload(),350)}catch(e){alert('Die Vokabel konnte nicht verworfen werden.');}
}

function speechRecognitionSupported(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition)}
function setMicStatus(text,listening=false){const el=$('#micStatus');if(!el)return;el.textContent=text||'';el.classList.toggle('listening',!!listening);}
function resetMicUi(){const b=$('#micButton');if(b){b.textContent='🎙';b.disabled=false;}}
function stopListening(){clearTimeout(micTimer);micTimer=null;if(micRecognition){try{micRecognition.abort()}catch(e){}micRecognition=null;}resetMicUi();}
function stopSpeaking(){if('speechSynthesis'in window){try{speechSynthesis.cancel()}catch(e){}}speaking=false;}
function stopAllVoice(clearStatus=true){clearTimeout(promptTimer);promptTimer=null;clearTimeout(autoAdvanceTimer);autoAdvanceTimer=null;stopListening();stopSpeaking();if(clearStatus)setMicStatus('');hideFeedback();}

function installSmartMicrophone(){
  const old=$('#micButton');if(!old)return;const fresh=old.cloneNode(true);fresh.dataset.smartMic='2';old.replaceWith(fresh);
  let status=$('#micStatus');if(!status){status=document.createElement('div');status.id='micStatus';status.className='mic-status';$('.answer-line')?.insertAdjacentElement('afterend',status);}
  fresh.addEventListener('click',()=>{if(micRecognition){stopListening();setMicStatus('Aufnahme beendet.');}else startSmartListening(false);});
}
function answerLanguage(){return ($('#answerLabel')?.textContent||'').trim()==='Russisch'?'ru-RU':'de-DE';}
function promptLanguage(){return ($('#promptLabel')?.textContent||'').trim()==='Russisch'?'ru-RU':'de-DE';}
function startSmartListening(automatic=false){
  if(!$('#view-learn')?.classList.contains('active'))return;if(!$('#resultPanel')?.classList.contains('hidden'))return;
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){setMicStatus('Spracherkennung wird von diesem Browser nicht unterstützt.');if(automatic)showToast('Spracheingabe ist hier nicht verfügbar. Du kannst tippen.');return;}
  stopListening();micTranscript='';micFinalized=false;feedbackKey='';const r=new C();micRecognition=r;r.lang=answerLanguage();r.interimResults=true;r.continuous=true;r.maxAlternatives=3;
  const b=$('#micButton');if(b){b.textContent='●';b.disabled=false;}setMicStatus('Ich höre … Nach 2 Sekunden Pause wird automatisch geprüft.',true);
  r.onresult=e=>{
    let text='';for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript+' ';micTranscript=text.trim();const input=$('#answerInput');if(input){input.value=micTranscript;input.classList.add('voice-recognized');}setMicStatus('Ich höre … Nach 2 Sekunden Pause wird automatisch geprüft.',true);scheduleSpeechFinish();
  };
  r.onerror=e=>{
    clearTimeout(micTimer);micRecognition=null;resetMicUi();const code=e?.error||'';
    if(code==='not-allowed'||code==='service-not-allowed')setMicStatus('Mikrofonzugriff ist nicht erlaubt. Du kannst weiterhin tippen.');else if(code==='no-speech')setMicStatus('Keine Sprache erkannt. Tippe erneut auf das Mikrofon.');else if(code!=='aborted')setMicStatus('Die Spracheingabe wurde beendet. Du kannst sofort erneut versuchen.');
  };
  r.onend=()=>{if(micRecognition===r)micRecognition=null;resetMicUi();if(micTranscript.trim()&&!micFinalized)scheduleSpeechFinish();else if(!micTranscript.trim()&&!micFinalized&&!automatic)setMicStatus('Keine Sprache erkannt. Tippe erneut auf das Mikrofon.');};
  try{r.start()}catch(e){micRecognition=null;resetMicUi();setMicStatus('Die Spracheingabe konnte nicht gestartet werden.');}
}
function scheduleSpeechFinish(){clearTimeout(micTimer);micTimer=setTimeout(finalizeSpokenAnswer,SILENCE_MS);}
function finalizeSpokenAnswer(){
  clearTimeout(micTimer);if(micFinalized)return;micFinalized=true;if(micRecognition){try{micRecognition.stop()}catch(e){}}resetMicUi();
  if(!micTranscript.trim()){setMicStatus('Nichts erkannt. Du kannst erneut sprechen oder tippen.');return;}
  const input=$('#answerInput');if(input)input.value=micTranscript.trim();setMicStatus('Antwort erkannt – wird geprüft …');
  setTimeout(()=>{if($('#resultPanel')?.classList.contains('hidden'))$('#checkAnswer')?.click();setMicStatus('');setTimeout(handleResult,40);},120);
}

function speakText(text,lang){
  return new Promise(resolve=>{
    if(!text||!('speechSynthesis'in window)){resolve();return;}
    stopSpeaking();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.86:.94;speaking=true;let done=false;
    const finish=()=>{if(done)return;done=true;speaking=false;resolve();};u.onend=finish;u.onerror=finish;try{speechSynthesis.speak(u)}catch(e){finish();}setTimeout(finish,10000);
  });
}
async function speakPromptAndMaybeListen(){
  if(!$('#view-learn')?.classList.contains('active')||!$('#resultPanel')?.classList.contains('hidden'))return;
  const text=$('#promptText')?.textContent?.trim();if(!text)return;
  if(voiceSettings.speakPrompt){setMicStatus('Vokabel wird vorgelesen …');await speakText(text,promptLanguage());await sleep(250);}
  if(voiceSettings.mode==='auto'){setMicStatus('');startSmartListening(true);}else setMicStatus(voiceSettings.speakPrompt?'Du kannst antworten oder das Mikrofon antippen.':'');
}
function schedulePrompt(delay=450){
  clearTimeout(promptTimer);promptTimer=setTimeout(()=>{if($('#resultPanel')?.classList.contains('hidden'))speakPromptAndMaybeListen();},delay);
}

function normalizeGerman(s){return String(s||'').toLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/\s+/g,' ');}
function normalizeRussian(s){return String(s||'').toLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/[́̀]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function levenshtein(a,b){const m=a.length,n=b.length,d=Array(n+1).fill(0);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[n];}
function acceptedSolutions(){
  const arr=[$('#solutionText')?.textContent||''];const txt=$('#acceptedText')?.textContent||'';if(txt.includes(':'))txt.split(':').slice(1).join(':').split('·').map(x=>x.trim()).filter(Boolean).forEach(x=>arr.push(x));return arr;
}
function isAlmostAnswer(){
  const answer=$('#answerInput')?.value||'',lang=answerLanguage(),norm=lang==='ru-RU'?normalizeRussian:normalizeGerman,a=norm(answer);if(a.length<3)return false;
  return acceptedSolutions().some(sol=>{const b=norm(sol);if(!b||a===b)return false;const max=Math.max(a.length,b.length),min=Math.min(a.length,b.length);if(min>=4&&(a.includes(b)||b.includes(a))&&min/max>=.52)return true;const dist=levenshtein(a,b);if(lang==='ru-RU')return (max>=4&&dist===1)||(max>=7&&dist<=2);return (max>=5&&dist<=1)||(max>=8&&dist<=2);});
}
function classifyResult(){
  const mark=$('#resultMark');if(mark?.classList.contains('correct'))return'correct';if(mark?.classList.contains('incorrect')&&isAlmostAnswer())return'almost';return'wrong';
}
function ratingFor(kind){return kind==='correct'?'good':kind==='almost'?'hard':'again';}
function showFeedback(kind){
  let overlay=$('#feedbackOverlay');if(!overlay){overlay=document.createElement('div');overlay.id='feedbackOverlay';overlay.className='feedback-overlay';overlay.innerHTML='<div class="feedback-card"><div class="feedback-symbol"></div><div class="feedback-label"></div></div>';document.body.appendChild(overlay);}
  overlay.className='feedback-overlay '+kind;overlay.querySelector('.feedback-symbol').textContent=kind==='correct'?'✓':kind==='almost'?'○':'✕';overlay.querySelector('.feedback-label').textContent=kind==='correct'?'Richtig':kind==='almost'?'Fast richtig':'Falsch';requestAnimationFrame(()=>overlay.classList.add('show'));
}
function hideFeedback(){const o=$('#feedbackOverlay');if(o)o.classList.remove('show');}
function updateManualNext(kind){
  let b=$('#manualNext');if(!b&&$('#resultPanel')){b=document.createElement('button');b.id='manualNext';b.className='primary manual-next hidden';b.type='button';b.textContent='Weiter';$('#resultPanel').appendChild(b);b.addEventListener('click',()=>advanceWithRating(b.dataset.rating||'good'));}
  if(!b)return;if(voiceSettings.mode==='manual'&&!$('#resultPanel')?.classList.contains('hidden')){b.dataset.rating=ratingFor(kind||classifyResult());b.classList.remove('hidden');}else b.classList.add('hidden');
}
function advanceWithRating(rating){
  clearTimeout(autoAdvanceTimer);hideFeedback();setMicStatus('');feedbackKey='';autoAdvancing=true;const btn=$(`.rating[data-rating="${rating}"]`);if(btn)btn.click();autoAdvancing=false;
}
async function handleResult(){
  if($('#resultPanel')?.classList.contains('hidden'))return;stopListening();const key=($('#promptText')?.textContent||'')+'|'+($('#answerInput')?.value||'');if(key===feedbackKey)return;feedbackKey=key;
  const kind=classifyResult(),mark=$('#resultMark');if(kind==='almost'&&mark){mark.classList.remove('incorrect');mark.classList.add('almost');mark.textContent='○ Fast richtig';}
  showFeedback(kind);updateManualNext(kind);
  const correctionPromise=(kind!=='correct'&&voiceSettings.speakCorrection)?(async()=>{await sleep(350);await speakText($('#solutionText')?.textContent||'',answerLanguage());})():Promise.resolve();
  if(voiceSettings.mode==='auto'){
    await Promise.all([sleep(voiceSettings.advanceDelay),correctionPromise]);if(feedbackKey===key)advanceWithRating(ratingFor(kind));
  }else{
    await Promise.race([correctionPromise,sleep(voiceSettings.advanceDelay)]);setTimeout(hideFeedback,450);
  }
}

function installResultHooks(){
  $('#checkAnswer')?.addEventListener('click',()=>setTimeout(handleResult,60));
  $$('.rating').forEach(b=>b.addEventListener('click',()=>{if(!autoAdvancing){clearTimeout(autoAdvanceTimer);stopSpeaking();hideFeedback();feedbackKey='';}}));
  const prompt=$('#promptText');if(prompt){new MutationObserver(()=>{feedbackKey='';stopListening();stopSpeaking();hideFeedback();const input=$('#answerInput');if(input)input.classList.remove('voice-recognized');schedulePrompt(420);}).observe(prompt,{childList:true,characterData:true,subtree:true});}
  $$('.tab').forEach(tab=>tab.addEventListener('click',()=>setTimeout(()=>{if($('#view-learn')?.classList.contains('active'))schedulePrompt(300);else stopAllVoice();},40)));
  $('#editCurrent')?.addEventListener('click',()=>stopAllVoice());
  $('#addWord')?.addEventListener('click',()=>stopAllVoice());
  document.addEventListener('close',()=>schedulePrompt(300),true);
}

let deferredInstallPrompt=null;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function updateInstallPanel(){const btn=$('#installApp'),hint=$('#installHint');if(!btn||!hint)return;if(isStandalone()){btn.hidden=true;hint.textContent='Die App ist bereits vom Home-Bildschirm aus geöffnet.';return;}btn.hidden=false;hint.textContent=isIOS()?'Auf dem iPhone wird sie über Safari zum Home-Bildschirm hinzugefügt und danach wie eine eigene App geöffnet.':'Du kannst den Trainer als App auf dem Startbildschirm installieren.';}
async function installApp(){if(isStandalone())return;if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}catch(e){}deferredInstallPrompt=null;updateInstallPanel();return;}if(isIOS())alert('Auf dem iPhone:\n\n1. Diese Seite in Safari öffnen.\n2. Unten auf „Teilen“ tippen.\n3. „Zum Home-Bildschirm“ wählen.\n4. Oben rechts „Hinzufügen“ tippen.');else alert('Öffne das Browser-Menü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.');}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;updateInstallPanel();});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;updateInstallPanel();});
window.addEventListener('pagehide',()=>{stopAllVoice();syncCurrentExercise();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){stopAllVoice();syncCurrentExercise();}else if($('#view-learn')?.classList.contains('active'))schedulePrompt(400);});

ensureExerciseStore();injectExerciseUi();renderExerciseUi();renderVoiceSettings();installSmartMicrophone();installResultHooks();$('#discardCurrent')?.addEventListener('click',discardCurrent);$('#installApp')?.addEventListener('click',installApp);updateInstallPanel();schedulePrompt(650);
})();
