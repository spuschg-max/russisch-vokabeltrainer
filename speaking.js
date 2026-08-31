(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const SPEAK_KEY='russischVokabeltrainer.speaking.v1';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SILENCE_MS=2000;

let recognition=null;
let silenceTimer=null;
let transcript='';
let currentTask=null;
let speaking=false;
let waitingForNext=false;
let taskSerial=0;

const people=[
  {ru:'я',de:'ich',go:'gehe',drive:'fahre',idx:0},
  {ru:'ты',de:'du',go:'gehst',drive:'fährst',idx:1},
  {ru:'он',de:'er',go:'geht',drive:'fährt',idx:2},
  {ru:'она',de:'sie',go:'geht',drive:'fährt',idx:2},
  {ru:'мы',de:'wir',go:'gehen',drive:'fahren',idx:3},
  {ru:'вы',de:'ihr',go:'geht',drive:'fahrt',idx:4},
  {ru:'они',de:'sie',go:'gehen',drive:'fahren',idx:5}
];
const destinations=[
  {ru:'в кино',de:'ins Kino',ids:['v034']},
  {ru:'в музей',de:'ins Museum',ids:['v035']},
  {ru:'в кафе',de:'ins Café',ids:['v033']},
  {ru:'в парк',de:'in den Park',ids:['v032']},
  {ru:'на вокзал',de:'zum Bahnhof',ids:['v036']},
  {ru:'в супермаркет',de:'in den Supermarkt',ids:['v037']},
  {ru:'к врачу',de:'zum Arzt',ids:['v038']},
  {ru:'на работу',de:'zur Arbeit',ids:['v039']}
];
const verbSets={
  v001:{id:'v001',inf:'идти',forms:['иду','идёшь','идёт','идём','идёте','идут'],kind:'go',timeRu:'сегодня',timeDe:'Heute',timeIds:['v047'],mode:'present'},
  v002:{id:'v002',inf:'ходить',forms:['хожу','ходишь','ходит','ходим','ходите','ходят'],kind:'go',timeRu:'каждый понедельник',timeDe:'Jeden Montag',timeIds:['v051'],mode:'habit'},
  v004:{id:'v004',inf:'ехать',forms:['еду','едешь','едет','едем','едете','едут'],kind:'drive',timeRu:'сегодня',timeDe:'Heute',timeIds:['v047'],mode:'present'},
  v005:{id:'v005',inf:'ездить',forms:['езжу','ездишь','ездит','ездим','ездите','ездят'],kind:'drive',timeRu:'каждую пятницу',timeDe:'Jeden Freitag',timeIds:['v052'],mode:'habit'},
  v003:{id:'v003',inf:'пойти',forms:['пойду','пойдёшь','пойдёт','пойдём','пойдёте','пойдут'],kind:'go',timeRu:'завтра',timeDe:'Morgen',timeIds:['v048'],mode:'future'},
  v006:{id:'v006',inf:'поехать',forms:['поеду','поедешь','поедет','поедем','поедете','поедут'],kind:'drive',timeRu:'завтра',timeDe:'Morgen',timeIds:['v048'],mode:'future'}
};

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getExerciseStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function activeExerciseId(){return getExerciseStore()?.activeId||'exercise-1';}
function loadStore(){try{return JSON.parse(localStorage.getItem(SPEAK_KEY)||'{}')}catch(e){return {}}}
function saveStore(store){localStorage.setItem(SPEAK_KEY,JSON.stringify(store));}
function cfg(){
  const id=activeExerciseId(),store=loadStore();store.exercises=store.exercises||{};
  if(!store.exercises[id])store.exercises[id]={selected:[],autoNext:false,speakPrompt:true,speakModel:true,delay:2600};
  const c=store.exercises[id];
  c.selected=Array.isArray(c.selected)?c.selected:[];c.autoNext=!!c.autoNext;c.speakPrompt=c.speakPrompt!==false;c.speakModel=c.speakModel!==false;c.delay=Number(c.delay)||2600;
  saveStore(store);return c;
}
function updateCfg(patch){const id=activeExerciseId(),store=loadStore();store.exercises=store.exercises||{};store.exercises[id]={...cfg(),...patch};saveStore(store);}
function activeWords(){return getState()?.words||[];}
function supportedIds(){
  const ids=new Set();Object.keys(verbSets).forEach(x=>ids.add(x));destinations.forEach(d=>d.ids.forEach(x=>ids.add(x)));['v047','v048','v051','v052'].forEach(x=>ids.add(x));return ids;
}
function availableTargets(){const supported=supportedIds();return activeWords().filter(w=>supported.has(w.id));}
function ensureDefaultSelection(){
  const c=cfg();if(c.selected.length)return;
  const avail=availableTargets();const preferred=avail.filter(w=>verbSets[w.id]).slice(0,6).map(w=>w.id);updateCfg({selected:preferred.length?preferred:avail.slice(0,8).map(w=>w.id)});
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

function buildTasks(){
  const out=[];
  for(const v of Object.values(verbSets)){
    for(const p of people){
      for(const d of destinations){
        const form=v.forms[p.idx];
        const ru=`${v.timeRu} ${p.ru} ${form} ${d.ru}.`;
        const deVerb=v.kind==='go'?p.go:p.drive;
        const de=`${v.timeDe} ${p.de} ${deVerb} ${d.de}.`;
        out.push({ru,de,ids:[v.id,...v.timeIds,...d.ids],verb:v.inf});
      }
    }
  }
  return out;
}
const ALL_TASKS=buildTasks();

function selectedTasks(){
  const selected=new Set(cfg().selected);if(!selected.size)return [];
  return ALL_TASKS.filter(t=>t.ids.some(id=>selected.has(id)));
}
function nextTask(){
  const pool=selectedTasks();if(!pool.length)return null;
  let choices=pool;if(currentTask&&pool.length>1)choices=pool.filter(x=>x.ru!==currentTask.ru);
  return choices[Math.floor(Math.random()*choices.length)];
}

function injectUi(){
  if($('#speakTab'))return;
  const nav=$('.tabs');if(!nav)return;
  const tab=document.createElement('button');tab.id='speakTab';tab.className='tab';tab.type='button';tab.textContent='Sprechen';tab.dataset.view='speak';nav.appendChild(tab);
  const section=document.createElement('section');section.id='view-speak';section.className='view';section.innerHTML=`
    <div class="speak-head">
      <div><h2>Sprechen üben</h2><p>Leichte deutsche Sätze ins Russische übertragen. Wortstellung wird tolerant bewertet.</p></div>
      <button id="speakStart" class="primary" type="button">Starten</button>
    </div>
    <div class="speak-options panel">
      <label class="check-row"><input id="speakAutoNext" type="checkbox"> Nach der Korrektur automatisch weiter</label>
      <label class="check-row"><input id="speakPromptAudio" type="checkbox"> Deutsche Aufgabe vorlesen</label>
      <label class="check-row"><input id="speakModelAudio" type="checkbox"> Richtigen russischen Satz zur Kontrolle vorlesen</label>
      <p class="speak-option-note">Ist „automatisch weiter“ aus, wartet die App. Dann kannst du <strong>„Weiter“</strong> sagen oder auf den Weiter-Knopf tippen.</p>
    </div>
    <article id="speakCard" class="learn-card speak-card">
      <div class="card-toolbar"><span class="pill">Satztraining · A1/A2</span><button id="speakStop" class="secondary compact" type="button">Stop</button></div>
      <div class="side-label">Deutsch</div><div id="speakPrompt" class="prompt-text speak-prompt">Tippe auf „Starten“.</div>
      <div class="side-label speak-answer-label">Deine russische Antwort</div><div id="speakTranscript" class="speak-transcript">–</div>
      <div id="speakStatus" class="mic-status"></div>
      <div id="speakFeedback" class="speak-feedback hidden"><div id="speakFeedbackMark" class="speak-feedback-mark"></div><div id="speakFeedbackText"></div><div class="speak-model"><span>Mustersatz</span><strong id="speakModel"></strong></div><button id="speakReplay" class="secondary" type="button">🔊 Noch einmal hören</button><button id="speakNext" class="primary speak-next" type="button">Weiter</button></div>
    </article>
    <div class="panel speak-words"><div class="section-head"><div><h3>Wörter für diese Sprechübung</h3><p>Wähle aus, welche Wörter in den Sätzen besonders vorkommen sollen.</p></div><div class="button-wrap"><button id="selectSpeakAll" class="secondary compact" type="button">Alle</button><button id="selectSpeakNone" class="secondary compact" type="button">Keine</button></div></div><div id="speakWordList" class="speak-word-list"></div><p id="speakUnsupported" class="speak-option-note"></p></div>`;
  $('main')?.appendChild(section);
  injectStyles();
  tab.addEventListener('click',showSpeakView);
  $$('.tabs .tab:not(#speakTab)').forEach(b=>b.addEventListener('click',stopSession));
  $('#speakStart').addEventListener('click',startSession);
  $('#speakStop').addEventListener('click',stopSession);
  $('#speakNext').addEventListener('click',advance);
  $('#speakReplay').addEventListener('click',()=>currentTask&&speakText(currentTask.ru,'ru-RU'));
  $('#speakAutoNext').addEventListener('change',e=>updateCfg({autoNext:e.target.checked}));
  $('#speakPromptAudio').addEventListener('change',e=>updateCfg({speakPrompt:e.target.checked}));
  $('#speakModelAudio').addEventListener('change',e=>updateCfg({speakModel:e.target.checked}));
  $('#selectSpeakAll').addEventListener('click',()=>{updateCfg({selected:availableTargets().map(w=>w.id)});renderTargets();});
  $('#selectSpeakNone').addEventListener('click',()=>{updateCfg({selected:[]});renderTargets();});
}
function injectStyles(){
  if($('#speakingStyles'))return;const style=document.createElement('style');style.id='speakingStyles';style.textContent=`
    .tabs{grid-template-columns:repeat(5,1fr)}.speak-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.speak-head h2{margin:0}.speak-head p{margin:4px 0 0;color:var(--muted);font-size:13px}.speak-options{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:center}.speak-options .check-row{margin:0}.speak-option-note{width:100%;margin:0!important;color:var(--muted);font-size:12px}.speak-card{min-height:520px}.speak-prompt{font-size:34px}.speak-answer-label{margin-top:30px}.speak-transcript{min-height:58px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:700;padding:12px;border-radius:12px;background:var(--surface2)}.speak-feedback{max-width:650px;margin:22px auto 0;text-align:center;border-top:1px solid var(--line);padding-top:18px}.speak-feedback-mark{font-size:46px;font-weight:900}.speak-feedback.correct .speak-feedback-mark{color:#2f8b58}.speak-feedback.almost .speak-feedback-mark{color:#d18412}.speak-feedback.wrong .speak-feedback-mark{color:#b63b3b}.speak-feedback #speakFeedbackText{font-weight:800;margin:4px 0 12px}.speak-model span{display:block;color:var(--muted);font-size:12px}.speak-model strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:25px;margin:4px 0 12px}.speak-next{display:block;width:100%;margin-top:10px}.speak-word-list{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.speak-word-item{display:flex;align-items:center;gap:9px;border:1px solid var(--line);border-radius:11px;padding:10px;background:var(--surface2);font-size:13px}.speak-word-item input{width:18px;height:18px}.speak-word-item strong{font-family:Georgia,'Times New Roman',serif}.speak-words h3{margin:0}.speak-status-active{color:var(--accent)!important;font-weight:800}.speak-session-off #speakStop{opacity:.55}
    @media(max-width:650px){.tabs{grid-template-columns:repeat(5,1fr)}.tab{font-size:11px}.speak-head{align-items:stretch;flex-direction:column}.speak-head .primary{width:100%}.speak-options{display:grid;gap:10px}.speak-word-list{grid-template-columns:1fr 1fr}.speak-prompt{font-size:29px}.speak-transcript{font-size:23px}}
    @media(max-width:390px){.speak-word-list{grid-template-columns:1fr}.tab{font-size:10px}}
  `;document.head.appendChild(style);
}
function renderOptions(){const c=cfg();$('#speakAutoNext').checked=c.autoNext;$('#speakPromptAudio').checked=c.speakPrompt;$('#speakModelAudio').checked=c.speakModel;}
function renderTargets(){
  const c=cfg(),selected=new Set(c.selected),list=$('#speakWordList'),available=availableTargets();if(!list)return;
  list.innerHTML=available.map(w=>`<label class="speak-word-item"><input type="checkbox" data-id="${escapeHtml(w.id)}" ${selected.has(w.id)?'checked':''}><span><strong>${escapeHtml(w.ru)}</strong><br>${escapeHtml(w.de)}</span></label>`).join('')||'<p>In dieser Übung sind noch keine Wörter vorhanden, für die der Satzgenerator vorbereitet ist.</p>';
  list.querySelectorAll('input[data-id]').forEach(cb=>cb.addEventListener('change',()=>{const ids=[...list.querySelectorAll('input[data-id]:checked')].map(x=>x.dataset.id);updateCfg({selected:ids});}));
  const total=activeWords().length,supported=available.length;$('#speakUnsupported').textContent=total>supported?`${supported} von ${total} Vokabeln dieser Übung können derzeit in automatisch erzeugten Sätzen verwendet werden. Der Satzgenerator wird schrittweise erweitert.`:'';
}
function showSpeakView(){
  stopUnderlyingVoice();$$('.tabs .tab').forEach(b=>b.classList.toggle('active',b.id==='speakTab'));$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-speak'));renderOptions();renderTargets();
}
function stopUnderlyingVoice(){try{speechSynthesis.cancel()}catch(e){}const mic=$('#micButton');if(mic&&mic.textContent==='●'){try{mic.click()}catch(e){}}}

function normalizeRu(s){return String(s||'').toLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/[́̀]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function tokens(s){return normalizeRu(s).split(' ').filter(Boolean);}
function sortedTokens(s){return tokens(s).sort().join('|');}
function levenshtein(a,b){const m=a.length,n=b.length,d=Array(n+1).fill(0);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[n];}
function evaluate(answer,model){
  const a=normalizeRu(answer),b=normalizeRu(model);if(!a)return{kind:'wrong',order:false};if(a===b)return{kind:'correct',order:false};if(sortedTokens(a)===sortedTokens(b))return{kind:'correct',order:true};
  const at=tokens(a),bt=tokens(b);let matched=0,used=new Set();
  for(const x of at){let best=-1,bestD=99;for(let i=0;i<bt.length;i++){if(used.has(i))continue;const dist=levenshtein(x,bt[i]);if(dist<bestD){bestD=dist;best=i}}if(best>=0&&(bestD===0||(Math.max(x.length,bt[best].length)>=5&&bestD<=1))){matched++;used.add(best)}}
  const coverage=matched/Math.max(at.length,bt.length);if(coverage>=.78||((Math.abs(at.length-bt.length)<=1)&&coverage>=.7))return{kind:'almost',order:false};return{kind:'wrong',order:false};
}

function setStatus(text,active=false){const el=$('#speakStatus');if(!el)return;el.textContent=text||'';el.classList.toggle('speak-status-active',active);}
function stopRecognition(){clearTimeout(silenceTimer);silenceTimer=null;if(recognition){try{recognition.abort()}catch(e){}recognition=null;}}
function stopSession(){taskSerial++;waitingForNext=false;stopRecognition();speaking=false;try{speechSynthesis.cancel()}catch(e){}setStatus('');}
function speakText(text,lang){return new Promise(resolve=>{if(!text||!('speechSynthesis'in window)){resolve();return;}try{speechSynthesis.cancel()}catch(e){}const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.84:.92;speaking=true;let done=false;const finish=()=>{if(done)return;done=true;speaking=false;resolve();};u.onend=finish;u.onerror=finish;try{speechSynthesis.speak(u)}catch(e){finish();}setTimeout(finish,12000);});}

async function startSession(){ensureDefaultSelection();renderTargets();if(!selectedTasks().length){setStatus('Bitte unten zuerst mindestens ein geeignetes Wort auswählen.');return;}stopSession();await presentNext();}
async function presentNext(){
  const serial=++taskSerial;stopRecognition();waitingForNext=false;currentTask=nextTask();if(!currentTask){setStatus('Für diese Auswahl konnte kein Satz erzeugt werden.');return;}
  $('#speakPrompt').textContent=currentTask.de;$('#speakTranscript').textContent='–';$('#speakFeedback').className='speak-feedback hidden';$('#speakFeedbackText').textContent='';$('#speakModel').textContent='';setStatus('');
  const c=cfg();if(c.speakPrompt){setStatus('Aufgabe wird vorgelesen …');await speakText(currentTask.de,'de-DE');if(serial!==taskSerial)return;await sleep(250);}startAnswerRecognition(serial);
}
function startAnswerRecognition(serial){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){setStatus('Spracherkennung ist hier nicht verfügbar.');return;}stopRecognition();transcript='';const r=new C();recognition=r;r.lang='ru-RU';r.interimResults=true;r.continuous=true;r.maxAlternatives=3;setStatus('Ich höre … Nach 2 Sekunden Pause wird ausgewertet.',true);
  r.onresult=e=>{let text='';for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript+' ';transcript=text.trim();$('#speakTranscript').textContent=transcript||'–';clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>finishAnswer(serial),SILENCE_MS);};
  r.onerror=e=>{if(e?.error!=='aborted')setStatus(e?.error==='not-allowed'?'Mikrofon ist nicht erlaubt.':'Spracheingabe wurde beendet. Tippe auf Starten und versuche es erneut.');recognition=null;};
  r.onend=()=>{if(recognition===r)recognition=null;if(transcript&&!silenceTimer)silenceTimer=setTimeout(()=>finishAnswer(serial),SILENCE_MS);};
  try{r.start()}catch(e){recognition=null;setStatus('Spracheingabe konnte nicht gestartet werden.');}
}
async function finishAnswer(serial){
  clearTimeout(silenceTimer);silenceTimer=null;if(serial!==taskSerial||!currentTask)return;stopRecognition();const answer=transcript.trim();if(!answer){setStatus('Nichts erkannt. Tippe auf Starten und versuche es noch einmal.');return;}
  const ev=evaluate(answer,currentTask.ru),fb=$('#speakFeedback'),mark=$('#speakFeedbackMark'),text=$('#speakFeedbackText');fb.className='speak-feedback '+ev.kind;fb.classList.remove('hidden');$('#speakModel').textContent=currentTask.ru;
  if(ev.kind==='correct'){mark.textContent='✓';text.textContent=ev.order?'Richtig. Deine Wortstellung ist möglich; natürlicher klingt zum Beispiel der Mustersatz unten.':'Richtig.';}
  else if(ev.kind==='almost'){mark.textContent='○';text.textContent='Fast richtig. Besser so:';}
  else{mark.textContent='✕';text.textContent='Noch nicht. Richtig wäre:';}
  setStatus('');const c=cfg();if(c.speakModel){await sleep(300);if(serial!==taskSerial)return;await speakText(currentTask.ru,'ru-RU');if(serial!==taskSerial)return;}
  if(c.autoNext){setStatus('Nächster Satz kommt gleich …');await sleep(c.delay);if(serial===taskSerial)presentNext();}
  else{waitingForNext=true;setStatus('Sag „Weiter“ oder tippe auf Weiter.',true);startNextCommand(serial);}
}
function startNextCommand(serial){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C)return;stopRecognition();const r=new C();recognition=r;r.lang='de-DE';r.interimResults=true;r.continuous=true;r.maxAlternatives=2;
  r.onresult=e=>{let text='';for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript+' ';if(/\bweiter\b/i.test(text)&&waitingForNext&&serial===taskSerial){waitingForNext=false;stopRecognition();presentNext();}};
  r.onerror=()=>{if(recognition===r)recognition=null;};r.onend=()=>{if(recognition===r)recognition=null;};try{r.start()}catch(e){recognition=null;}
}
function advance(){if(!currentTask){startSession();return;}waitingForNext=false;stopRecognition();presentNext();}

window.addEventListener('pagehide',stopSession);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopSession();});
ensureDefaultSelection();injectUi();renderOptions();renderTargets();
})();