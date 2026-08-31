(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const $=s=>document.querySelector(s);

function clone(x){return JSON.parse(JSON.stringify(x));}
function showToast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function getMainState(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}
}
function putMainState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function getExerciseStore(){
  try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}
}
function saveExerciseStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}

function ensureExerciseStore(){
  let store=getExerciseStore();
  const current=getMainState();
  if(!store||!store.exercises||!store.activeId){
    const id='exercise-1';
    store={
      version:1,
      activeId:id,
      order:[id],
      exercises:{
        [id]:{
          id,
          name:'Übung 1',
          description:'Aktuelle Vokabelsammlung',
          state:clone(current||{})
        }
      }
    };
    saveExerciseStore(store);
    return store;
  }
  if(!store.exercises[store.activeId]){
    store.activeId=store.order.find(id=>store.exercises[id])||Object.keys(store.exercises)[0];
  }
  if(current&&store.exercises[store.activeId]){
    store.exercises[store.activeId].state=clone(current);
    saveExerciseStore(store);
  }
  return store;
}

function syncCurrentExercise(){
  const store=getExerciseStore();
  const current=getMainState();
  if(!store||!current||!store.exercises?.[store.activeId])return;
  store.exercises[store.activeId].state=clone(current);
  saveExerciseStore(store);
}

function emptyStateFromCurrent(){
  const current=getMainState()||{};
  const ids=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);
  return {
    version:current.version||2,
    words:[],
    progress:{},
    settings:clone(current.settings||{}),
    daily:{},
    streak:{current:0,best:0,lastDate:null},
    deletedDefaultIds:ids,
    createdAt:new Date().toISOString()
  };
}

function switchExercise(id){
  const store=getExerciseStore();
  if(!store||!store.exercises?.[id]||id===store.activeId)return;
  syncCurrentExercise();
  const fresh=getExerciseStore();
  fresh.activeId=id;
  saveExerciseStore(fresh);
  putMainState(clone(fresh.exercises[id].state));
  location.reload();
}

function createExercise(){
  const name=$('#newExerciseName')?.value.trim();
  if(!name){showToast('Bitte zuerst einen Namen eingeben.');return;}
  syncCurrentExercise();
  const store=getExerciseStore();
  const id='exercise-'+Date.now();
  store.exercises[id]={
    id,
    name,
    description:$('#newExerciseDescription')?.value.trim()||'',
    state:emptyStateFromCurrent()
  };
  store.order.push(id);
  store.activeId=id;
  saveExerciseStore(store);
  putMainState(clone(store.exercises[id].state));
  location.reload();
}

function saveExerciseDetails(){
  const store=getExerciseStore();
  const ex=store?.exercises?.[store.activeId];
  if(!ex)return;
  const name=$('#exerciseName')?.value.trim();
  if(!name){showToast('Der Name darf nicht leer sein.');return;}
  ex.name=name;
  ex.description=$('#exerciseDescription')?.value.trim()||'';
  saveExerciseStore(store);
  renderExerciseUi();
  showToast('Übung gespeichert');
}

function deleteExercise(){
  syncCurrentExercise();
  const store=getExerciseStore();
  if(!store||store.order.length<=1){showToast('Mindestens eine Übung muß erhalten bleiben.');return;}
  const ex=store.exercises[store.activeId];
  if(!confirm(`„${ex.name}“ wirklich löschen?\n\nDie Vokabeln und der Lernstand dieser Übung werden entfernt.`))return;
  const oldId=store.activeId;
  store.order=store.order.filter(id=>id!==oldId);
  delete store.exercises[oldId];
  store.activeId=store.order[0];
  saveExerciseStore(store);
  putMainState(clone(store.exercises[store.activeId].state));
  location.reload();
}

function duplicateExercise(){
  syncCurrentExercise();
  const store=getExerciseStore();
  const source=store?.exercises?.[store.activeId];
  if(!source)return;
  const id='exercise-'+Date.now();
  store.exercises[id]={
    id,
    name:source.name+' – Kopie',
    description:source.description||'',
    state:clone(source.state)
  };
  store.order.push(id);
  store.activeId=id;
  saveExerciseStore(store);
  putMainState(clone(store.exercises[id].state));
  location.reload();
}

function injectExerciseUi(){
  if($('#exerciseBar'))return;
  const nav=$('.tabs');
  if(nav){
    const bar=document.createElement('section');
    bar.id='exerciseBar';
    bar.className='exercise-bar';
    bar.innerHTML=`
      <div class="exercise-bar-label">Aktive Übung</div>
      <select id="exerciseSelect" aria-label="Aktive Übung auswählen"></select>
      <div id="exerciseDescriptionTop" class="exercise-bar-description"></div>`;
    nav.insertAdjacentElement('afterend',bar);
  }
  const install=$('#installPanel');
  if(install){
    const panel=document.createElement('div');
    panel.id='exerciseSettingsPanel';
    panel.className='panel';
    panel.innerHTML=`
      <h3>Übungen verwalten</h3>
      <p>Jede Übung hat eine eigene Vokabelsammlung und einen eigenen Lernstand.</p>
      <div class="exercise-settings-grid">
        <label>Name der aktiven Übung<input id="exerciseName" autocomplete="off"></label>
        <label>Beschreibung<input id="exerciseDescription" autocomplete="off" placeholder="z. B. Grundwortschatz aus dem Cornelsen-Buch"></label>
      </div>
      <div class="button-wrap exercise-actions">
        <button id="saveExerciseDetails" class="primary" type="button">Name speichern</button>
        <button id="duplicateExercise" class="secondary" type="button">Übung kopieren</button>
        <button id="deleteExercise" class="danger" type="button">Übung löschen</button>
      </div>
      <hr class="exercise-divider">
      <h3>Neue Übung</h3>
      <div class="exercise-settings-grid">
        <label>Name<input id="newExerciseName" autocomplete="off" placeholder="z. B. Cornelsen Grundwortschatz"></label>
        <label>Beschreibung<input id="newExerciseDescription" autocomplete="off" placeholder="optional"></label>
      </div>
      <button id="createExercise" class="primary" type="button">+ Neue Übung anlegen</button>`;
    install.insertAdjacentElement('beforebegin',panel);
  }
  const style=document.createElement('style');
  style.textContent=`
    .exercise-bar{display:grid;grid-template-columns:auto minmax(180px,1fr);gap:5px 12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:-6px 0 14px}
    .exercise-bar-label{font-size:12px;font-weight:800;color:var(--muted)}
    .exercise-bar select{width:100%;border:1px solid #cfd5dd;border-radius:10px;padding:9px 11px;background:var(--surface);color:var(--text);font-weight:800}
    .exercise-bar-description{grid-column:2;color:var(--muted);font-size:12px;min-height:15px}
    .exercise-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .exercise-settings-grid label{display:grid;gap:6px;font-size:13px;font-weight:700}
    .exercise-settings-grid input{width:100%;border:1px solid #cfd5dd;border-radius:11px;padding:12px 13px;background:var(--surface);color:var(--text)}
    .exercise-actions{margin-bottom:14px}.exercise-divider{border:0;border-top:1px solid var(--line);margin:16px 0}
    .mic-status{min-height:20px;margin-top:7px;font-size:12px;color:var(--muted);text-align:center}
    .mic-status.listening{color:var(--accent);font-weight:800}
    @media(max-width:650px){.exercise-bar{grid-template-columns:1fr}.exercise-bar-description{grid-column:1}.exercise-settings-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  $('#exerciseSelect')?.addEventListener('change',e=>switchExercise(e.target.value));
  $('#saveExerciseDetails')?.addEventListener('click',saveExerciseDetails);
  $('#createExercise')?.addEventListener('click',createExercise);
  $('#deleteExercise')?.addEventListener('click',deleteExercise);
  $('#duplicateExercise')?.addEventListener('click',duplicateExercise);
}

function renderExerciseUi(){
  const store=getExerciseStore();
  const select=$('#exerciseSelect');
  if(!store||!select)return;
  select.innerHTML=store.order.filter(id=>store.exercises[id]).map((id,index)=>{
    const ex=store.exercises[id];
    return `<option value="${id}"${id===store.activeId?' selected':''}>${index+1}. ${escapeHtml(ex.name)}</option>`;
  }).join('');
  const ex=store.exercises[store.activeId];
  if($('#exerciseDescriptionTop'))$('#exerciseDescriptionTop').textContent=ex.description||'';
  if($('#exerciseName'))$('#exerciseName').value=ex.name||'';
  if($('#exerciseDescription'))$('#exerciseDescription').value=ex.description||'';
}

function getCurrentWordFromEditor(){
  const edit=$('#editCurrent'), dialog=$('#wordDialog');
  if(!edit||!dialog)return null;
  edit.click();
  const id=$('#editId')?.value;
  const ru=$('#editRu')?.value||'';
  const de=$('#editDe')?.value||'';
  if(dialog.open)dialog.close();
  return id?{id,ru,de}:null;
}

function discardCurrent(){
  const word=getCurrentWordFromEditor();
  if(!word)return;
  const store=getExerciseStore();
  const ex=store?.exercises?.[store.activeId];
  const exName=ex?.name||'dieser Übung';
  const ok=confirm(`„${word.ru} – ${word.de}“ aus „${exName}“ verwerfen?\n\nDie Vokabel erscheint in dieser Übung danach nicht mehr. Du kannst sie dort später neu aufnehmen.`);
  if(!ok)return;
  try{
    const state=getMainState();
    if(!state||!Array.isArray(state.words))throw new Error('state');
    state.words=state.words.filter(w=>w.id!==word.id);
    if(state.progress)delete state.progress[word.id];
    if(word.id.startsWith('v')){
      state.deletedDefaultIds=Array.isArray(state.deletedDefaultIds)?state.deletedDefaultIds:[];
      if(!state.deletedDefaultIds.includes(word.id))state.deletedDefaultIds.push(word.id);
    }
    putMainState(state);
    if(ex){ex.state=clone(state);saveExerciseStore(store);}
    showToast('Vokabel aus dieser Übung verworfen');
    setTimeout(()=>location.reload(),350);
  }catch(e){
    alert('Die Vokabel konnte nicht verworfen werden.');
  }
}

let micRecognition=null;
let micTimer=null;
let micTranscript='';
let micFinalized=false;
const SILENCE_MS=2000;

function setMicStatus(text,listening=false){
  const el=$('#micStatus');
  if(!el)return;
  el.textContent=text||'';
  el.classList.toggle('listening',!!listening);
}
function resetMicUi(){
  const b=$('#micButton');
  if(b){b.textContent='🎙';b.disabled=false;}
}
function finishSpeechAfterPause(){
  clearTimeout(micTimer);
  micTimer=setTimeout(()=>{
    if(micFinalized)return;
    micFinalized=true;
    try{micRecognition?.stop()}catch(e){}
    resetMicUi();
    if(!micTranscript.trim()){
      setMicStatus('Nichts erkannt. Du kannst erneut auf das Mikrofon tippen.');
      return;
    }
    const input=$('#answerInput');
    if(input)input.value=micTranscript.trim();
    setMicStatus('Antwort erkannt – wird geprüft …');
    setTimeout(()=>{
      const result=$('#resultPanel');
      if(result?.classList.contains('hidden'))$('#checkAnswer')?.click();
      setMicStatus('');
    },120);
  },SILENCE_MS);
}
function installSmartMicrophone(){
  const old=$('#micButton');
  if(!old||old.dataset.smartMic==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.smartMic='1';
  old.replaceWith(fresh);
  let status=$('#micStatus');
  if(!status){
    status=document.createElement('div');
    status.id='micStatus';
    status.className='mic-status';
    $('.answer-line')?.insertAdjacentElement('afterend',status);
  }
  fresh.addEventListener('click',startSmartListening);
}
function startSmartListening(){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!C){
    setMicStatus('Spracherkennung wird von diesem Browser nicht unterstützt.');
    showToast('Für Spracheingabe bitte Safari oder die Home-Bildschirm-App verwenden.');
    return;
  }
  if(micRecognition){
    try{micRecognition.abort()}catch(e){}
    micRecognition=null;
  }
  clearTimeout(micTimer);
  micTranscript='';
  micFinalized=false;
  const r=new C();
  micRecognition=r;
  r.lang=$('#promptLabel')?.textContent==='Russisch'?'de-DE':'ru-RU';
  r.interimResults=true;
  r.continuous=true;
  r.maxAlternatives=3;
  const b=$('#micButton');
  if(b){b.textContent='●';b.disabled=false;}
  setMicStatus('Ich höre … Nach 2 Sekunden Pause wird automatisch geprüft.',true);
  r.onresult=e=>{
    let text='';
    for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript+' ';
    micTranscript=text.trim();
    const input=$('#answerInput');
    if(input)input.value=micTranscript;
    setMicStatus('Ich höre … Nach 2 Sekunden Pause wird automatisch geprüft.',true);
    finishSpeechAfterPause();
  };
  r.onerror=e=>{
    clearTimeout(micTimer);
    micRecognition=null;
    resetMicUi();
    const code=e?.error||'';
    if(code==='not-allowed'||code==='service-not-allowed'){
      setMicStatus('Mikrofonzugriff ist nicht erlaubt. Bitte die Mikrofonfreigabe für diese Seite aktivieren.');
    }else if(code==='no-speech'){
      setMicStatus('Keine Sprache erkannt. Tippe erneut auf das Mikrofon.');
    }else{
      setMicStatus('Die Spracheingabe wurde beendet. Du kannst sofort erneut versuchen.');
    }
  };
  r.onend=()=>{
    micRecognition=null;
    resetMicUi();
    if(micTranscript.trim()&&!micFinalized)finishSpeechAfterPause();
    else if(!micTranscript.trim()&&!micFinalized)setMicStatus('Keine Sprache erkannt. Tippe erneut auf das Mikrofon.');
  };
  try{r.start()}catch(e){
    micRecognition=null;
    resetMicUi();
    setMicStatus('Die Spracheingabe konnte nicht gestartet werden.');
  }
}

let deferredInstallPrompt=null;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function updateInstallPanel(){
  const btn=$('#installApp'), hint=$('#installHint');
  if(!btn||!hint)return;
  if(isStandalone()){
    btn.hidden=true;
    hint.textContent='Die App ist bereits vom Home-Bildschirm aus geöffnet.';
    return;
  }
  btn.hidden=false;
  hint.textContent=isIOS()
    ?'Auf dem iPhone wird sie über Safari zum Home-Bildschirm hinzugefügt und danach wie eine eigene App geöffnet.'
    :'Du kannst den Trainer als App auf dem Startbildschirm installieren.';
}
async function installApp(){
  if(isStandalone())return;
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    try{await deferredInstallPrompt.userChoice}catch(e){}
    deferredInstallPrompt=null;
    updateInstallPanel();
    return;
  }
  if(isIOS()){
    alert('Auf dem iPhone:\n\n1. Diese Seite in Safari öffnen.\n2. Unten auf „Teilen“ (Quadrat mit Pfeil nach oben) tippen.\n3. „Zum Home-Bildschirm“ wählen.\n4. Oben rechts „Hinzufügen“ tippen.\n\nDanach erscheint „Russisch“ mit eigenem Symbol wie eine normale App auf dem Home-Bildschirm.');
  }else{
    alert('Öffne das Browser-Menü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.');
  }
}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  updateInstallPanel();
});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;updateInstallPanel();});
window.addEventListener('pagehide',syncCurrentExercise);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')syncCurrentExercise();});

ensureExerciseStore();
injectExerciseUi();
renderExerciseUi();
installSmartMicrophone();
$('#discardCurrent')?.addEventListener('click',discardCurrent);
$('#installApp')?.addEventListener('click',installApp);
updateInstallPanel();
})();
