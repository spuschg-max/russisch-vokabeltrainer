(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const CONJ_KEY='russischVokabeltrainer.conjugation.v1';
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const PERSONS=['я','ты','он/она','мы','вы','они'];
const PERSON_DE=['ich','du','er/sie','wir','ihr/Sie','sie'];
const FALLBACK_FORMS={
  v001:'иду = ich gehe; идёшь = du gehst; идёт = er/sie geht; идём = wir gehen; идёте = ihr/Sie geht/gehen; идут = sie gehen',
  v002:'хожу = ich gehe; ходишь = du gehst; ходит = er/sie geht; ходим = wir gehen; ходите = ihr/Sie geht/gehen; ходят = sie gehen',
  v003:'пойду = ich werde losgehen; пойдёшь = du wirst losgehen; пойдёт = er/sie wird losgehen; пойдём = wir werden losgehen; пойдёте = ihr/Sie werdet/werden losgehen; пойдут = sie werden losgehen',
  v004:'еду = ich fahre; едешь = du fährst; едет = er/sie fährt; едем = wir fahren; едете = ihr/Sie fahrt/fahren; едут = sie fahren',
  v005:'езжу = ich fahre; ездишь = du fährst; ездит = er/sie fährt; ездим = wir fahren; ездите = ihr/Sie fahrt/fahren; ездят = sie fahren',
  v006:'поеду = ich werde losfahren; поедешь = du wirst losfahren; поедёт = er/sie wird losfahren; поедем = wir werden losfahren; поедете = ihr/Sie werdet/werden losfahren; поедут = sie werden losfahren'
};
let current=null,wholeVerbId=null,wholePerson=0,lastMixedVerbId=null;
let recognition=null,restartTimer=null,submitTimer=null,speechStarted=false,heard='';

function clone(x){return JSON.parse(JSON.stringify(x));}
function mainState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch(e){return {}}}
function activeExerciseId(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'{}').activeId||'exercise-1'}catch(e){return'exercise-1'}}
function loadStore(){try{return JSON.parse(localStorage.getItem(CONJ_KEY)||'{}')}catch(e){return {}}}
function saveStore(store){localStorage.setItem(CONJ_KEY,JSON.stringify(store));}
function cfg(){
  const store=loadStore(),id=activeExerciseId();store.exercises=store.exercises||{};
  if(!store.exercises[id])store.exercises[id]={mode:'whole',poolSize:10,autoMic:true,activeIds:[],progress:{},verbCursor:0};
  const c=store.exercises[id];c.mode=c.mode==='mixed'?'mixed':'whole';c.poolSize=Math.max(1,Math.min(20,Number(c.poolSize)||10));c.autoMic=c.autoMic!==false;c.activeIds=Array.isArray(c.activeIds)?c.activeIds:[];c.progress=c.progress||{};c.verbCursor=Number(c.verbCursor)||0;saveStore(store);return c;
}
function updateCfg(patch){const store=loadStore(),id=activeExerciseId();store.exercises=store.exercises||{};store.exercises[id]={...cfg(),...patch};saveStore(store);}
function normalize(s){return String(s||'').toLocaleLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').replace(/[.,!?;:()„“"'’]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function lev(a,b){const n=b.length,d=Array(n+1);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const old=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return d[n];}
function parseForms(word){
  const raw=String(word?.forms||FALLBACK_FORMS[word?.id]||'').trim();if(!raw)return[];
  const arr=raw.split(';').map(part=>{const p=part.trim(),i=p.indexOf('=');if(i<1)return null;const ru=p.slice(0,i).trim(),de=p.slice(i+1).trim();return ru&&de?{ru,de}:null;}).filter(Boolean);
  return arr.length>=6?arr.slice(0,6):[];
}
function verbs(){return (mainState().words||[]).filter(w=>w.type==='verb'&&parseForms(w).length===6);}
function pFor(c,id){if(!c.progress[id])c.progress[id]={forms:[0,0,0,0,0,0],correct:0,wrong:0};const p=c.progress[id];p.forms=Array.from({length:6},(_,i)=>Math.max(0,Math.min(5,Number(p.forms?.[i])||0)));return p;}
function complete(c,id){return pFor(c,id).forms.every(x=>x>=5);}
function ensurePool(){
  const store=loadStore(),id=activeExerciseId(),c=cfg(),all=verbs(),valid=new Set(all.map(w=>w.id));
  c.activeIds=c.activeIds.filter(x=>valid.has(x)&&!complete(c,x));
  for(const w of all){if(c.activeIds.length>=c.poolSize)break;if(complete(c,w.id)||c.activeIds.includes(w.id))continue;c.activeIds.push(w.id);}
  store.exercises=store.exercises||{};store.exercises[id]=c;saveStore(store);return c;
}
function activeVerbs(c=ensurePool()){const map=new Map(verbs().map(w=>[w.id,w]));return c.activeIds.map(id=>map.get(id)).filter(Boolean);}
function weakestPerson(c,id){const f=pFor(c,id).forms,min=Math.min(...f);const inds=f.map((v,i)=>v===min?i:-1).filter(i=>i>=0);return inds[Math.floor(Math.random()*inds.length)];}
function nextWhole(c,pool){
  if(!pool.length)return null;
  if(!wholeVerbId||!pool.some(w=>w.id===wholeVerbId)){
    const idx=((c.verbCursor%pool.length)+pool.length)%pool.length;wholeVerbId=pool[idx].id;wholePerson=0;
  }
  const w=pool.find(x=>x.id===wholeVerbId)||pool[0],person=wholePerson;
  wholePerson++;
  if(wholePerson>=6){wholePerson=0;const idx=pool.findIndex(x=>x.id===w.id);c.verbCursor=(idx+1)%Math.max(1,pool.length);wholeVerbId=null;updateCfg({verbCursor:c.verbCursor});}
  return {word:w,person,form:parseForms(w)[person]};
}
function nextMixed(c,pool){
  if(!pool.length)return null;let choices=pool;
  if(pool.length>1&&lastMixedVerbId)choices=pool.filter(w=>w.id!==lastMixedVerbId);
  choices=choices.length?choices:pool;
  let minScore=Infinity;for(const w of choices){const s=Math.min(...pFor(c,w.id).forms);if(s<minScore)minScore=s;}
  const weak=choices.filter(w=>Math.min(...pFor(c,w.id).forms)===minScore);const w=weak[Math.floor(Math.random()*weak.length)];lastMixedVerbId=w.id;const person=weakestPerson(c,w.id);
  return {word:w,person,form:parseForms(w)[person]};
}
function chooseNext(){
  stopRecognition();clearTimeout(submitTimer);const c=ensurePool(),pool=activeVerbs(c);current=c.mode==='whole'?nextWhole(c,pool):nextMixed(c,pool);render();
}
function progressText(c,w){return pFor(c,w.id).forms.map((x,i)=>`${PERSONS[i]} ${x}/5`).join(' · ');}
function render(){
  const c=ensurePool(),pool=activeVerbs(c),card=$('#conjCard'),empty=$('#conjEmpty');renderPool(c,pool);
  if(!card||!empty)return;
  if(!current){card.classList.add('hidden');empty.classList.remove('hidden');$('#conjEmptyText').textContent=verbs().length?'Alle verfügbaren Verben sind in allen sechs Formen 5/5 sicher.':'In dieser Vokabelübung sind noch keine Verben mit sechs hinterlegten Formen vorhanden.';return;}
  card.classList.remove('hidden');empty.classList.add('hidden');
  $('#conjVerb').textContent=current.word.ru;$('#conjMeaning').textContent=current.word.de||'';$('#conjPerson').textContent=PERSONS[current.person];$('#conjPersonDe').textContent=PERSON_DE[current.person];$('#conjProgress').textContent=progressText(c,current.word);
  const input=$('#conjAnswer');input.value='';input.disabled=false;input.classList.remove('voice-recognized');$('#conjCheck').disabled=false;$('#conjResult').className='conj-result hidden';$('#conjSolution').textContent='';$('#conjStatus').textContent='';$('#conjContinue').classList.add('hidden');
  setTimeout(()=>input.focus(),40);if(c.autoMic)setTimeout(startRecognition,260);
}
function renderPool(c,pool){
  if($('#conjMode'))$('#conjMode').value=c.mode;if($('#conjPoolSize'))$('#conjPoolSize').value=c.poolSize;if($('#conjAutoMic'))$('#conjAutoMic').checked=c.autoMic;
  if($('#conjPoolCount'))$('#conjPoolCount').textContent=`${pool.length}/${c.poolSize}`;
  const all=verbs(),done=all.filter(w=>complete(c,w.id)).length;if($('#conjDoneCount'))$('#conjDoneCount').textContent=done;
  const list=$('#conjPoolList');if(list)list.innerHTML=pool.map(w=>`<div class="conj-pool-row"><strong>${escapeHtml(w.ru)}</strong><span>${progressText(c,w)}</span></div>`).join('')||'<p>Noch keine Verben im Pool.</p>';
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function answerKind(value=$('#conjAnswer')?.value){const a=normalize(value),b=normalize(current?.form?.ru);if(!a||!b)return'wrong';if(a===b)return'correct';const d=lev(a,b);return (b.length>=5&&d===1)||(b.length>=8&&d<=2)?'almost':'wrong';}
function showResult(){
  if(!current||!$('#conjResult')?.classList.contains('hidden'))return;stopRecognition();const kind=answerKind(),r=$('#conjResult');r.className=`conj-result ${kind}`;$('#conjResultMark').textContent=kind==='correct'?'✓ Richtig':kind==='almost'?'○ Fast richtig':'✕ Falsch';$('#conjSolution').textContent=current.form.ru;$('#conjAnswer').disabled=true;$('#conjCheck').disabled=true;
  const c=cfg(),p=pFor(c,current.word.id);if(kind==='correct'){p.forms[current.person]=Math.min(5,p.forms[current.person]+1);p.correct++;}else if(kind==='almost'){p.forms[current.person]=Math.max(0,p.forms[current.person]-1);}else{p.forms[current.person]=0;p.wrong++;}
  updateCfg({progress:c.progress});speak(current.form.ru);
  if(kind==='correct')setTimeout(()=>{if(!$('#conjResult')?.classList.contains('hidden'))chooseNext();},1100);else $('#conjContinue').classList.remove('hidden');renderPool(ensurePool(),activeVerbs());
}
function speak(text){if(!text||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';u.rate=.82;speechSynthesis.speak(u);}catch(e){}}
function stopRecognition(){clearTimeout(restartTimer);restartTimer=null;clearTimeout(submitTimer);submitTimer=null;if(recognition){try{recognition.abort()}catch(e){}recognition=null;}speechStarted=false;heard='';const b=$('#conjMic');if(b)b.textContent='🎙';}
function bestRecognized(result){
  if(!current)return'';const target=normalize(current.form.ru);let best='',bestScore=-99;
  for(let i=0;i<Math.min(5,result.length);i++){const s=(result[i]?.transcript||'').trim(),n=normalize(s);if(!n)continue;const d=lev(n,target),score=1-d/Math.max(n.length,target.length);if(n===target)return current.form.ru;if(score>bestScore){bestScore=score;best=s;}}
  if(target.length>=5&&bestScore>=.78)return current.form.ru;return best;
}
function startRecognition(){
  if(!$('#view-conjugation')?.classList.contains('active')||!current||!$('#conjResult')?.classList.contains('hidden'))return;const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C)return;
  stopRecognition();const r=new C();recognition=r;r.lang='ru-RU';r.interimResults=true;r.continuous=true;r.maxAlternatives=5;speechStarted=false;heard='';
  try{const Phrase=window.SpeechRecognitionPhrase;if(Phrase&&'phrases'in r)r.phrases=[new Phrase(current.form.ru,7)];}catch(e){}
  $('#conjMic').textContent='●';$('#conjStatus').textContent='Ich höre …';
  r.onspeechstart=()=>{if(recognition===r)speechStarted=true;};
  r.onresult=e=>{if(recognition!==r||!speechStarted)return;let final=false,text='';for(let i=e.resultIndex;i<e.results.length;i++){const res=e.results[i],picked=bestRecognized(res);if(picked)text+=(text?' ':'')+picked;if(res.isFinal)final=true;}if(!text)return;heard=text.trim();$('#conjAnswer').value=heard;$('#conjAnswer').classList.add('voice-recognized');if(final){clearTimeout(submitTimer);submitTimer=setTimeout(()=>{if(recognition===r)try{r.stop()}catch(e){};if($('#conjResult')?.classList.contains('hidden'))showResult();},1100);}};
  r.onerror=e=>{if(recognition!==r)return;const code=e?.error||'';recognition=null;$('#conjMic').textContent='🎙';if(code!=='aborted'&&code!=='no-speech')$('#conjStatus').textContent='Spracheingabe kurz unterbrochen.';if(cfg().autoMic&&$('#conjResult')?.classList.contains('hidden'))restartTimer=setTimeout(startRecognition,500);};
  r.onend=()=>{if(recognition!==r)return;recognition=null;$('#conjMic').textContent='🎙';if(!heard&&cfg().autoMic&&$('#conjResult')?.classList.contains('hidden'))restartTimer=setTimeout(startRecognition,400);};
  try{r.start();}catch(e){recognition=null;$('#conjMic').textContent='🎙';}
}
function showView(){
  try{speechSynthesis.cancel()}catch(e){};stopRecognition();$$('.tabs .tab').forEach(b=>b.classList.toggle('active',b.id==='conjugationTab'));$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-conjugation'));wholeVerbId=null;wholePerson=0;lastMixedVerbId=null;chooseNext();
}
function inject(){
  if($('#conjugationTab'))return;const nav=$('.tabs');if(!nav)return;
  const tab=document.createElement('button');tab.id='conjugationTab';tab.className='tab';tab.type='button';tab.textContent='Konjugation';tab.dataset.view='conjugation';nav.appendChild(tab);
  const section=document.createElement('section');section.id='view-conjugation';section.className='view';section.innerHTML=`
    <div class="section-head"><div><h2>Konjugation</h2><p>Eigene Übung mit einem festen Verbpool. Jede der sechs Personenformen hat einen eigenen 0–5-Lernstand.</p></div></div>
    <div class="panel conj-settings"><label>Abfrageart<select id="conjMode"><option value="whole">Ganzes Verb – alle sechs nacheinander</option><option value="mixed">Gemischt – immer nur eine Form</option></select></label><label>Verben im Pool<input id="conjPoolSize" type="number" min="1" max="20" value="10"></label><label class="check-row"><input id="conjAutoMic" type="checkbox" checked> Mikrofon automatisch</label></div>
    <div class="summary-row"><div class="mini-stat"><strong id="conjPoolCount">0/10</strong><span>aktiver Pool</span></div><div class="mini-stat"><strong id="conjDoneCount">0</strong><span>Verben 6× 5/5</span></div></div>
    <article id="conjCard" class="learn-card conj-card hidden"><div class="card-toolbar"><span class="pill">Konjugation</span><button id="conjSpeak" class="icon-btn small" type="button">🔊</button></div><div class="conj-verb"><strong id="conjVerb"></strong><span id="conjMeaning"></span></div><div class="side-label">Person</div><div class="conj-person"><strong id="conjPerson"></strong><span id="conjPersonDe"></span></div><div id="conjProgress" class="conj-progress"></div><div class="answer-zone"><label for="conjAnswer">Russische Form</label><div class="answer-line"><input id="conjAnswer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Form sagen oder eingeben …"><button id="conjMic" class="icon-btn" type="button">🎙</button></div><div id="conjStatus" class="form-status"></div><button id="conjCheck" class="primary" type="button">Prüfen</button></div><div id="conjResult" class="conj-result hidden"><div id="conjResultMark" class="conj-result-mark"></div><div class="solution"><span>Richtige Form</span><strong id="conjSolution"></strong></div><div id="conjContinue" class="conj-continue hidden"><button id="conjListenSolution" class="secondary" type="button">🔊 Noch einmal hören</button><button id="conjNext" class="conj-next" type="button">Weiter</button></div></div></article>
    <div id="conjEmpty" class="empty-state"><div class="empty-icon">я</div><h2>Keine Konjugation verfügbar</h2><p id="conjEmptyText"></p></div><div class="panel"><h3>Aktueller Verbpool</h3><div id="conjPoolList" class="conj-pool-list"></div></div>`;
  $('main')?.appendChild(section);
  const style=document.createElement('style');style.id='conjugationStyles';style.textContent=`
    .tabs{grid-template-columns:repeat(7,1fr)!important}.conj-settings{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;align-items:end}.conj-settings label{display:grid;gap:5px;font-size:13px;font-weight:700}.conj-settings select,.conj-settings input[type=number]{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface);color:var(--text)}.conj-settings .check-row{display:flex;align-items:center;padding-bottom:10px}.conj-card{min-height:520px}.conj-verb{text-align:center;margin:10px 0 24px}.conj-verb strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:35px}.conj-verb span{color:var(--muted);font-size:15px}.conj-person{text-align:center;margin:4px 0 8px}.conj-person strong{font-family:Georgia,'Times New Roman',serif;font-size:42px}.conj-person span{display:block;color:var(--muted)}.conj-progress{text-align:center;color:var(--muted);font-size:12px;margin-bottom:18px}.conj-result{max-width:610px;margin:22px auto 0;border-top:1px solid var(--line);padding-top:18px}.conj-result-mark{text-align:center;font-size:27px;font-weight:900;margin-bottom:8px}.conj-result.correct .conj-result-mark{color:#2f8b58}.conj-result.almost .conj-result-mark{color:#d18412}.conj-result.wrong .conj-result-mark{color:#b63b3b}.conj-continue{margin-top:14px;padding:13px;border:1px solid #d18412;border-radius:13px;background:rgba(209,132,18,.12);display:flex;gap:10px}.conj-continue.hidden{display:none!important}.conj-next{flex:1;border:0;border-radius:10px;padding:12px 16px;font-weight:900;background:#d18412;color:#fff}.conj-pool-list{display:grid;gap:6px}.conj-pool-row{display:grid;grid-template-columns:140px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px}.conj-pool-row strong{font-family:Georgia,'Times New Roman',serif;font-size:16px}.conj-pool-row span{color:var(--muted)}
    @media(max-width:650px){.tabs{grid-template-columns:repeat(4,1fr)!important}.conj-settings{grid-template-columns:1fr}.conj-settings .check-row{padding:0}.conj-pool-row{grid-template-columns:1fr}.conj-verb strong{font-size:31px}.conj-person strong{font-size:38px}}
  `;document.head.appendChild(style);
  tab.addEventListener('click',showView);$$('.tabs .tab:not(#conjugationTab)').forEach(b=>b.addEventListener('click',stopRecognition));
  $('#conjMode').addEventListener('change',e=>{updateCfg({mode:e.target.value});wholeVerbId=null;wholePerson=0;lastMixedVerbId=null;chooseNext();});
  $('#conjPoolSize').addEventListener('change',e=>{updateCfg({poolSize:Math.max(1,Math.min(20,Number(e.target.value)||10))});wholeVerbId=null;chooseNext();});
  $('#conjAutoMic').addEventListener('change',e=>{updateCfg({autoMic:e.target.checked});if(e.target.checked)startRecognition();else stopRecognition();});
  $('#conjCheck').addEventListener('click',showResult);$('#conjAnswer').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('#conjResult').classList.contains('hidden')){e.preventDefault();showResult();}});$('#conjMic').addEventListener('click',()=>recognition?stopRecognition():startRecognition());$('#conjSpeak').addEventListener('click',()=>current&&speak(current.form.ru));$('#conjListenSolution').addEventListener('click',()=>current&&speak(current.form.ru));$('#conjNext').addEventListener('click',chooseNext);
  renderPool(ensurePool(),activeVerbs());
}
setTimeout(inject,350);
})();
