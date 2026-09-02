(() => {
'use strict';
const STORAGE='russischVokabeltrainer.v2';
const EXERCISES='russischVokabeltrainer.exercises.v1';
const STORE='russischVokabeltrainer.conjugation.v1';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const PERSONS=['я','ты','он/она','мы','вы','они'];
const PERSONS_DE=['ich','du','er/sie','wir','ihr/Sie','sie'];
const FALLBACK={
  v001:'иду = ich gehe; идёшь = du gehst; идёт = er/sie geht; идём = wir gehen; идёте = ihr/Sie geht/gehen; идут = sie gehen',
  v002:'хожу = ich gehe; ходишь = du gehst; ходит = er/sie geht; ходим = wir gehen; ходите = ihr/Sie geht/gehen; ходят = sie gehen',
  v003:'пойду = ich werde losgehen; пойдёшь = du wirst losgehen; пойдёт = er/sie wird losgehen; пойдём = wir werden losgehen; пойдёте = ihr/Sie werdet/werden losgehen; пойдут = sie werden losgehen',
  v004:'еду = ich fahre; едешь = du fährst; едет = er/sie fährt; едем = wir fahren; едете = ihr/Sie fahrt/fahren; едут = sie fahren',
  v005:'езжу = ich fahre; ездишь = du fährst; ездит = er/sie fährt; ездим = wir fahren; ездите = ihr/Sie fahrt/fahren; ездят = sie fahren',
  v006:'поеду = ich werde losfahren; поедешь = du wirst losfahren; поедет = er/sie wird losfahren; поедем = wir werden losfahren; поедете = ihr/Sie werdet/werden losfahren; поедут = sie werden losfahren'
};
let current=null,wholeVerb=null,wholePerson=0,lastMixed=null,recognition=null,restartTimer=null,submitTimer=null,speechStarted=false,heard='';

function mainState(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch(e){return {}}}
function exerciseId(){try{return JSON.parse(localStorage.getItem(EXERCISES)||'{}').activeId||'exercise-1'}catch(e){return'exercise-1'}}
function readStore(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return {}}}
function writeStore(s){localStorage.setItem(STORE,JSON.stringify(s));}
function config(){
  const s=readStore(),id=exerciseId();s.exercises=s.exercises||{};
  if(!s.exercises[id])s.exercises[id]={mode:'whole',poolSize:10,autoMic:true,activeIds:[],progress:{},cursor:0};
  const c=s.exercises[id];c.mode=c.mode==='mixed'?'mixed':'whole';c.poolSize=Math.max(1,Math.min(20,Number(c.poolSize)||10));c.autoMic=c.autoMic!==false;c.activeIds=Array.isArray(c.activeIds)?c.activeIds:[];c.progress=c.progress||{};c.cursor=Number(c.cursor)||0;writeStore(s);return c;
}
function saveConfig(c){const s=readStore(),id=exerciseId();s.exercises=s.exercises||{};s.exercises[id]=c;writeStore(s);}
function patchConfig(p){const c=config();Object.assign(c,p);saveConfig(c);return c;}
function norm(s){return String(s||'').toLocaleLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').replace(/[.,!?;:()„“"'’]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ')}
function lev(a,b){const n=b.length,d=Array(n+1);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const old=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old}}return d[n]}
function parseForms(w){const raw=String(w?.forms||FALLBACK[w?.id]||'').trim();if(!raw)return[];const f=raw.split(';').map(x=>{const i=x.indexOf('=');if(i<1)return null;const ru=x.slice(0,i).trim(),de=x.slice(i+1).trim();return ru&&de?{ru,de}:null}).filter(Boolean);return f.length>=6?f.slice(0,6):[]}
function allVerbs(){return (mainState().words||[]).filter(w=>w.type==='verb'&&parseForms(w).length===6)}
function progress(c,id){if(!c.progress[id])c.progress[id]={forms:[0,0,0,0,0,0],correct:0,wrong:0};const p=c.progress[id];p.forms=Array.from({length:6},(_,i)=>Math.max(0,Math.min(5,Number(p.forms?.[i])||0)));return p}
function mastered(c,id){return progress(c,id).forms.every(x=>x>=5)}
function ensurePool(){
  const c=config(),all=allVerbs(),valid=new Set(all.map(w=>w.id));
  c.activeIds=c.activeIds.filter(id=>valid.has(id)&&!mastered(c,id)).slice(0,c.poolSize);
  for(const w of all){if(c.activeIds.length>=c.poolSize)break;if(mastered(c,w.id)||c.activeIds.includes(w.id))continue;c.activeIds.push(w.id)}
  saveConfig(c);return c;
}
function poolWords(c=ensurePool()){const map=new Map(allVerbs().map(w=>[w.id,w]));return c.activeIds.map(id=>map.get(id)).filter(Boolean)}
function weakestPerson(c,id){const a=progress(c,id).forms,m=Math.min(...a),choices=a.map((v,i)=>v===m?i:-1).filter(i=>i>=0);return choices[Math.floor(Math.random()*choices.length)]}
function chooseWhole(c,pool){
  if(!pool.length)return null;
  if(!wholeVerb||!pool.some(w=>w.id===wholeVerb)){wholeVerb=pool[c.cursor%pool.length].id;wholePerson=0}
  const w=pool.find(x=>x.id===wholeVerb)||pool[0],person=wholePerson;wholePerson++;
  if(wholePerson>=6){const idx=pool.findIndex(x=>x.id===w.id);c.cursor=(idx+1)%Math.max(1,pool.length);saveConfig(c);wholeVerb=null;wholePerson=0}
  return {word:w,person,form:parseForms(w)[person]};
}
function chooseMixed(c,pool){
  if(!pool.length)return null;let choices=pool.length>1&&lastMixed?pool.filter(w=>w.id!==lastMixed):pool;if(!choices.length)choices=pool;
  let min=Infinity;for(const w of choices)min=Math.min(min,...progress(c,w.id).forms);
  const weak=choices.filter(w=>Math.min(...progress(c,w.id).forms)===min),w=weak[Math.floor(Math.random()*weak.length)];lastMixed=w.id;const person=weakestPerson(c,w.id);return {word:w,person,form:parseForms(w)[person]};
}
function next(){stopMic();const c=ensurePool(),pool=poolWords(c);current=c.mode==='whole'?chooseWhole(c,pool):chooseMixed(c,pool);render()}
function pText(c,w){return progress(c,w.id).forms.map((v,i)=>`${PERSONS[i]} ${v}/5`).join(' · ')}
function renderPool(c,pool){
  if($('#conjMode'))$('#conjMode').value=c.mode;if($('#conjPoolSize'))$('#conjPoolSize').value=c.poolSize;if($('#conjAutoMic'))$('#conjAutoMic').checked=c.autoMic;
  if($('#conjPoolCount'))$('#conjPoolCount').textContent=`${pool.length}/${c.poolSize}`;if($('#conjDoneCount'))$('#conjDoneCount').textContent=allVerbs().filter(w=>mastered(c,w.id)).length;
  const list=$('#conjPoolList');if(list)list.innerHTML=pool.map(w=>`<div class="conj-pool-row"><strong>${esc(w.ru)}</strong><span>${pText(c,w)}</span></div>`).join('')||'<p>Noch keine Verben im Pool.</p>';
}
function render(){
  const c=ensurePool(),pool=poolWords(c);renderPool(c,pool);const card=$('#conjCard'),empty=$('#conjEmpty');if(!card||!empty)return;
  if(!current){card.classList.add('hidden');empty.classList.remove('hidden');$('#conjEmptyText').textContent=allVerbs().length?'Alle verfügbaren Verben sind in allen sechs Formen 5/5 sicher.':'In dieser Vokabelübung sind noch keine Verben mit sechs hinterlegten Formen vorhanden.';return}
  card.classList.remove('hidden');empty.classList.add('hidden');$('#conjVerb').textContent=current.word.ru;$('#conjMeaning').textContent=current.word.de||'';$('#conjPerson').textContent=PERSONS[current.person];$('#conjPersonDe').textContent=PERSONS_DE[current.person];$('#conjProgress').textContent=pText(c,current.word);
  const input=$('#conjAnswer');input.value='';input.disabled=false;input.classList.remove('voice-recognized');$('#conjCheck').disabled=false;$('#conjResult').className='conj-result hidden';$('#conjSolution').textContent='';$('#conjStatus').textContent='';$('#conjContinue').classList.add('hidden');setTimeout(()=>input.focus(),40);if(c.autoMic)setTimeout(startMic,300)
}
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function kind(value=$('#conjAnswer')?.value){const a=norm(value),b=norm(current?.form?.ru);if(!a||!b)return'wrong';if(a===b)return'correct';const d=lev(a,b);return (b.length>=5&&d===1)||(b.length>=8&&d<=2)?'almost':'wrong'}
function result(){
  if(!current||!$('#conjResult')?.classList.contains('hidden'))return;stopMic();const k=kind(),box=$('#conjResult');box.className=`conj-result ${k}`;$('#conjResultMark').textContent=k==='correct'?'✓ Richtig':k==='almost'?'○ Fast richtig':'✕ Falsch';$('#conjSolution').textContent=current.form.ru;$('#conjAnswer').disabled=true;$('#conjCheck').disabled=true;
  const c=config(),p=progress(c,current.word.id);if(k==='correct'){p.forms[current.person]=Math.min(5,p.forms[current.person]+1);p.correct++}else if(k==='almost'){p.forms[current.person]=Math.max(0,p.forms[current.person]-1)}else{p.forms[current.person]=0;p.wrong++}saveConfig(c);speak(current.form.ru);renderPool(ensurePool(),poolWords());
  if(k==='correct')setTimeout(()=>{if(!$('#conjResult')?.classList.contains('hidden'))next()},1100);else $('#conjContinue').classList.remove('hidden')
}
function speak(text){if(!text||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';u.rate=.82;speechSynthesis.speak(u)}catch(e){}}
function stopMic(){clearTimeout(restartTimer);clearTimeout(submitTimer);restartTimer=submitTimer=null;if(recognition){try{recognition.abort()}catch(e){}recognition=null}speechStarted=false;heard='';if($('#conjMic'))$('#conjMic').textContent='🎙'}
function best(res){const target=norm(current?.form?.ru),forms=[];for(let i=0;i<Math.min(5,res.length);i++){const s=(res[i]?.transcript||'').trim(),n=norm(s);if(!n)continue;if(n===target)return current.form.ru;const score=1-lev(n,target)/Math.max(n.length,target.length);forms.push({s,score})}forms.sort((a,b)=>b.score-a.score);if(forms[0]&&target.length>=5&&forms[0].score>=.78)return current.form.ru;return forms[0]?.s||''}
function startMic(){
  if(!$('#view-conjugation')?.classList.contains('active')||!current||!$('#conjResult')?.classList.contains('hidden'))return;const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C)return;stopMic();const r=new C();recognition=r;r.lang='ru-RU';r.interimResults=true;r.continuous=true;r.maxAlternatives=5;speechStarted=false;heard='';
  try{const P=window.SpeechRecognitionPhrase;if(P&&'phrases'in r)r.phrases=[new P(current.form.ru,7)]}catch(e){}$('#conjMic').textContent='●';$('#conjStatus').textContent='Ich höre …';r.onspeechstart=()=>{if(recognition===r)speechStarted=true};
  r.onresult=e=>{if(recognition!==r||!speechStarted)return;let final=false,text='';for(let i=e.resultIndex;i<e.results.length;i++){const x=best(e.results[i]);if(x)text+=(text?' ':'')+x;if(e.results[i].isFinal)final=true}if(!text)return;heard=text.trim();$('#conjAnswer').value=heard;$('#conjAnswer').classList.add('voice-recognized');if(final){clearTimeout(submitTimer);submitTimer=setTimeout(()=>{if($('#conjResult')?.classList.contains('hidden'))result()},1100)}};
  r.onerror=e=>{if(recognition!==r)return;const code=e?.error||'';recognition=null;if($('#conjMic'))$('#conjMic').textContent='🎙';if(code!=='aborted'&&code!=='no-speech')$('#conjStatus').textContent='Spracheingabe kurz unterbrochen.';if(config().autoMic&&$('#conjResult')?.classList.contains('hidden'))restartTimer=setTimeout(startMic,500)};
  r.onend=()=>{if(recognition!==r)return;recognition=null;if($('#conjMic'))$('#conjMic').textContent='🎙';if(!heard&&config().autoMic&&$('#conjResult')?.classList.contains('hidden'))restartTimer=setTimeout(startMic,400)};try{r.start()}catch(e){recognition=null;if($('#conjMic'))$('#conjMic').textContent='🎙'}
}
function showView(){try{speechSynthesis.cancel()}catch(e){}stopMic();$$('.tabs .tab').forEach(b=>b.classList.toggle('active',b.id==='conjugationTab'));$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-conjugation'));wholeVerb=null;wholePerson=0;lastMixed=null;next()}
function inject(){
  if($('#conjugationTab'))return;const nav=$('.tabs');if(!nav)return;const tab=document.createElement('button');tab.id='conjugationTab';tab.className='tab';tab.type='button';tab.dataset.view='conjugation';tab.textContent='Konjugation';nav.appendChild(tab);
  const section=document.createElement('section');section.id='view-conjugation';section.className='view';section.innerHTML=`<div class="section-head"><div><h2>Konjugation</h2><p>Getrennte Übung: fester Verbpool, eigener Lernstand für jede der sechs Personenformen.</p></div></div><div class="panel conj-settings"><label>Abfrageart<select id="conjMode"><option value="whole">Ganzes Verb – alle sechs nacheinander</option><option value="mixed">Gemischt – immer nur eine Form</option></select></label><label>Verben im Pool<input id="conjPoolSize" type="number" min="1" max="20" value="10"></label><label class="check-row"><input id="conjAutoMic" type="checkbox" checked> Mikrofon automatisch</label></div><div class="summary-row"><div class="mini-stat"><strong id="conjPoolCount">0/10</strong><span>aktiver Pool</span></div><div class="mini-stat"><strong id="conjDoneCount">0</strong><span>Verben 6× 5/5</span></div></div><article id="conjCard" class="learn-card conj-card hidden"><div class="card-toolbar"><span class="pill">Konjugation</span><button id="conjSpeak" class="icon-btn small" type="button">🔊</button></div><div class="conj-verb"><strong id="conjVerb"></strong><span id="conjMeaning"></span></div><div class="side-label">Person</div><div class="conj-person"><strong id="conjPerson"></strong><span id="conjPersonDe"></span></div><div id="conjProgress" class="conj-progress"></div><div class="answer-zone"><label for="conjAnswer">Russische Form</label><div class="answer-line"><input id="conjAnswer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Form sagen oder eingeben …"><button id="conjMic" class="icon-btn" type="button">🎙</button></div><div id="conjStatus" class="form-status"></div><button id="conjCheck" class="primary" type="button">Prüfen</button></div><div id="conjResult" class="conj-result hidden"><div id="conjResultMark" class="conj-result-mark"></div><div class="solution"><span>Richtige Form</span><strong id="conjSolution"></strong></div><div id="conjContinue" class="conj-continue hidden"><button id="conjHear" class="secondary" type="button">🔊 Noch einmal hören</button><button id="conjNext" class="conj-next" type="button">Weiter</button></div></div></article><div id="conjEmpty" class="empty-state"><div class="empty-icon">я</div><h2>Keine Konjugation verfügbar</h2><p id="conjEmptyText"></p></div><div class="panel"><h3>Aktueller Verbpool</h3><div id="conjPoolList" class="conj-pool-list"></div></div>`;$('main')?.appendChild(section);
  const s=document.createElement('style');s.id='conjugationStyles';s.textContent=`.tabs{grid-template-columns:repeat(7,1fr)!important}.conj-settings{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;align-items:end}.conj-settings label{display:grid;gap:5px;font-size:13px;font-weight:700}.conj-settings select,.conj-settings input[type=number]{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface);color:var(--text)}.conj-settings .check-row{display:flex;align-items:center;padding-bottom:10px}.conj-card{min-height:520px}.conj-verb{text-align:center;margin:10px 0 24px}.conj-verb strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:35px}.conj-verb span{color:var(--muted);font-size:15px}.conj-person{text-align:center;margin:4px 0 8px}.conj-person strong{font-family:Georgia,'Times New Roman',serif;font-size:42px}.conj-person span{display:block;color:var(--muted)}.conj-progress{text-align:center;color:var(--muted);font-size:12px;margin-bottom:18px}.conj-result{max-width:610px;margin:22px auto 0;border-top:1px solid var(--line);padding-top:18px}.conj-result-mark{text-align:center;font-size:27px;font-weight:900;margin-bottom:8px}.conj-result.correct .conj-result-mark{color:#2f8b58}.conj-result.almost .conj-result-mark{color:#d18412}.conj-result.wrong .conj-result-mark{color:#b63b3b}.conj-continue{margin-top:14px;padding:13px;border:1px solid #d18412;border-radius:13px;background:rgba(209,132,18,.12);display:flex;gap:10px}.conj-continue.hidden{display:none!important}.conj-next{flex:1;border:0;border-radius:10px;padding:12px 16px;font-weight:900;background:#d18412;color:#fff}.conj-pool-list{display:grid;gap:6px}.conj-pool-row{display:grid;grid-template-columns:140px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px}.conj-pool-row strong{font-family:Georgia,'Times New Roman',serif;font-size:16px}.conj-pool-row span{color:var(--muted)}@media(max-width:650px){.tabs{grid-template-columns:repeat(4,1fr)!important}.conj-settings{grid-template-columns:1fr}.conj-settings .check-row{padding:0}.conj-pool-row{grid-template-columns:1fr}.conj-verb strong{font-size:31px}.conj-person strong{font-size:38px}}`;document.head.appendChild(s);
  tab.addEventListener('click',showView);$$('.tabs .tab:not(#conjugationTab)').forEach(b=>b.addEventListener('click',stopMic));$('#conjMode').addEventListener('change',e=>{patchConfig({mode:e.target.value});wholeVerb=null;wholePerson=0;lastMixed=null;next()});$('#conjPoolSize').addEventListener('change',e=>{patchConfig({poolSize:Math.max(1,Math.min(20,Number(e.target.value)||10))});wholeVerb=null;next()});$('#conjAutoMic').addEventListener('change',e=>{patchConfig({autoMic:e.target.checked});e.target.checked?startMic():stopMic()});$('#conjCheck').addEventListener('click',result);$('#conjAnswer').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('#conjResult').classList.contains('hidden')){e.preventDefault();result()}});$('#conjMic').addEventListener('click',()=>recognition?stopMic():startMic());$('#conjSpeak').addEventListener('click',()=>current&&speak(current.form.ru));$('#conjHear').addEventListener('click',()=>current&&speak(current.form.ru));$('#conjNext').addEventListener('click',next);renderPool(ensurePool(),poolWords())
}
setTimeout(inject,450);
})();
