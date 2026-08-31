(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const DAY=86400000, MIN=60000, HOUR=3600000;
const INTERVALS=[0,10*MIN,DAY,3*DAY,7*DAY,14*DAY,30*DAY,90*DAY,180*DAY,365*DAY];
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const now=()=>Date.now();
const FALLBACK_FORMS={
  v001:'иду = ich gehe; идёшь = du gehst; идёт = er/sie geht; идём = wir gehen; идёте = ihr/Sie geht/gehen; идут = sie gehen',
  v002:'хожу = ich gehe; ходишь = du gehst; ходит = er/sie geht; ходим = wir gehen; ходите = ihr/Sie geht/gehen; ходят = sie gehen',
  v003:'пойду = ich werde losgehen; пойдёшь = du wirst losgehen; пойдёт = er/sie wird losgehen; пойдём = wir werden losgehen; пойдёте = ihr/Sie werdet/werden losgehen; пойдут = sie werden losgehen',
  v004:'еду = ich fahre; едешь = du fährst; едет = er/sie fährt; едем = wir fahren; едете = ihr/Sie fahrt/fahren; едут = sie fahren',
  v005:'езжу = ich fahre; ездишь = du fährst; ездит = er/sie fährt; ездим = wir fahren; ездите = ihr/Sie fahrt/fahren; ездят = sie fahren',
  v006:'поеду = ich werde losfahren; поедешь = du wirst losfahren; поедет = er/sie wird losfahren; поедем = wir werden losfahren; поедете = ihr/Sie werdet/werden losfahren; поедут = sie werden losfahren'
};
let current=null;
let recognition=null;
let silenceTimer=null;
let transcript='';
let finalized=false;

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function saveState(s){localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}
function dateKey(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalizeRussian(s){return String(s||'').toLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/[́̀]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function levenshtein(a,b){const m=a.length,n=b.length,d=Array(n+1).fill(0);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[n];}
function parseForms(word){
  const raw=(word.forms||FALLBACK_FORMS[word.id]||'').trim();
  if(!raw)return [];
  return raw.split(';').map((part,index)=>{
    const p=part.trim();if(!p)return null;const eq=p.indexOf('=');if(eq<1)return null;
    const ru=p.slice(0,eq).trim(),de=p.slice(eq+1).trim();if(!ru||!de)return null;
    return {id:`${word.id}::form::${index}`,wordId:word.id,inf:word.ru,ru,de,index};
  }).filter(Boolean);
}
function baseProgress(state,id){return state.progress?.[id]||{level:0,seen:0};}
function formProgress(state,id){state.formProgress=state.formProgress||{};if(!state.formProgress[id])state.formProgress[id]={level:0,due:0,seen:0,correct:0,wrong:0,hard:0,lastReview:0,lastResult:null};return state.formProgress[id];}
function eligibleVerbs(state){
  if(!state)return [];
  return (state.words||[]).filter(w=>w.type==='verb'&&parseForms(w).length).filter(w=>state.settings?.infinitiveFirst===false||baseProgress(state,w.id).level>=5);
}
function lockedVerbs(state){
  if(!state)return [];
  return (state.words||[]).filter(w=>w.type==='verb'&&parseForms(w).length).filter(w=>state.settings?.infinitiveFirst!==false&&baseProgress(state,w.id).level<5);
}
function allEligibleForms(state){return eligibleVerbs(state).flatMap(parseForms);}
function todayForms(state){state.formDaily=state.formDaily||{};const k=dateKey();if(!state.formDaily[k])state.formDaily[k]={answers:0,newIntroduced:0,correct:0};return state.formDaily[k];}
function chooseNext(){
  const state=getState();if(!state){current=null;renderCard();return;}
  const forms=allEligibleForms(state),t=now();
  let pool=forms.filter(f=>{const p=formProgress(state,f.id);return p.seen>0&&p.due<=t}).sort((a,b)=>formProgress(state,a.id).due-formProgress(state,b.id).due);
  if(!pool.length){const daily=todayForms(state),remaining=Math.max(0,6-daily.newIntroduced);if(remaining>0)pool=forms.filter(f=>formProgress(state,f.id).seen===0).slice(0,remaining);}
  if(!pool.length)pool=forms.filter(f=>formProgress(state,f.id).seen>0).sort((a,b)=>(formProgress(state,a.id).lastReview||0)-(formProgress(state,b.id).lastReview||0)).slice(0,12);
  saveState(state);current=pool.length?pool[Math.floor(Math.random()*Math.min(pool.length,6))]:null;renderCard();renderStats();
}
function renderStats(){
  const state=getState();if(!state)return;const verbs=eligibleVerbs(state),forms=allEligibleForms(state),t=now();
  const due=forms.filter(f=>{const p=formProgress(state,f.id);return p.seen>0&&p.due<=t}).length;
  const secure=forms.filter(f=>formProgress(state,f.id).level>=5).length;
  if($('#formVerbCount'))$('#formVerbCount').textContent=verbs.length;
  if($('#formDueCount'))$('#formDueCount').textContent=due;
  if($('#formSecureCount'))$('#formSecureCount').textContent=secure;
  const locked=lockedVerbs(state);if($('#lockedForms'))$('#lockedForms').innerHTML=locked.length?`<strong>Noch gesperrt:</strong> ${locked.map(w=>escapeHtml(w.ru)).join(' · ')}<br><small>Diese Formen erscheinen erst, wenn der jeweilige Infinitiv in „Lernen“ sicher sitzt.</small>`:'Alle vorhandenen Verbformen sind freigeschaltet.';
  saveState(state);
}
function renderCard(){
  const card=$('#formCard'),empty=$('#formEmpty');if(!card||!empty)return;
  stopRecognition();
  if(!current){card.classList.add('hidden');empty.classList.remove('hidden');return;}
  card.classList.remove('hidden');empty.classList.add('hidden');
  $('#formInf').textContent=`Form von ${current.inf}`;$('#formPrompt').textContent=current.de;$('#formAnswer').value='';$('#formAnswer').disabled=false;$('#formCheck').disabled=false;$('#formResult').classList.add('hidden');$('#formStatus').textContent='';
  setTimeout(()=>$('#formAnswer')?.focus(),80);
}
function answerKind(){
  const a=normalizeRussian($('#formAnswer')?.value),b=normalizeRussian(current?.ru);if(!a||!b)return'wrong';if(a===b)return'correct';const dist=levenshtein(a,b);if((b.length>=4&&dist===1)||(b.length>=7&&dist<=2))return'almost';return'wrong';
}
function showResult(){
  if(!current)return;const kind=answerKind(),result=$('#formResult'),mark=$('#formResultMark');result.classList.remove('hidden');result.className=`form-result ${kind}`;mark.textContent=kind==='correct'?'✓ Richtig':kind==='almost'?'○ Fast richtig':'✕ Falsch';$('#formSolution').textContent=current.ru;$('#formAnswer').disabled=true;$('#formCheck').disabled=true;
  speak(current.ru,'ru-RU');
}
function review(rating){
  if(!current)return;const state=getState();if(!state)return;const p=formProgress(state,current.id),wasNew=p.seen===0,kind=answerKind(),daily=todayForms(state);p.seen++;p.lastReview=now();p.lastResult=rating;daily.answers++;if(kind==='correct')daily.correct++;if(wasNew)daily.newIntroduced++;
  if(rating==='again'){p.wrong++;p.level=Math.max(0,p.level-1);p.due=now()+5*MIN;}
  else if(rating==='hard'){p.hard++;p.level=Math.max(1,p.level);p.due=now()+Math.max(30*MIN,(INTERVALS[Math.max(1,p.level)]||DAY)*.45);}
  else if(rating==='good'){p.correct++;p.level=Math.min(9,Math.max(1,p.level+1));p.due=now()+INTERVALS[p.level];}
  else {p.correct++;p.level=Math.min(9,Math.max(2,p.level+2));p.due=now()+INTERVALS[p.level];}
  saveState(state);current=null;chooseNext();
}
function speak(text,lang='ru-RU'){if(!text||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.86;speechSynthesis.speak(u);}catch(e){}}
function stopRecognition(){clearTimeout(silenceTimer);silenceTimer=null;if(recognition){try{recognition.abort()}catch(e){}recognition=null;}const b=$('#formMic');if(b)b.textContent='🎙';}
function startRecognition(){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){$('#formStatus').textContent='Spracherkennung wird hier nicht unterstützt.';return;}
  stopRecognition();transcript='';finalized=false;const r=new C();recognition=r;r.lang='ru-RU';r.interimResults=true;r.continuous=true;$('#formMic').textContent='●';$('#formStatus').textContent='Ich höre …';
  r.onresult=e=>{let txt='';for(let i=0;i<e.results.length;i++)txt+=e.results[i][0].transcript+' ';transcript=txt.trim();$('#formAnswer').value=transcript;clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>{if(finalized)return;finalized=true;try{r.stop()}catch(e){}if(transcript&&$('#formResult').classList.contains('hidden'))showResult();},2000);};
  r.onerror=()=>{stopRecognition();$('#formStatus').textContent='Spracheingabe beendet. Du kannst erneut tippen oder sprechen.';};r.onend=()=>{if(recognition===r)recognition=null;$('#formMic').textContent='🎙';};try{r.start()}catch(e){stopRecognition();}
}
function showFormsView(){
  try{speechSynthesis.cancel()}catch(e){};$$('.tabs .tab').forEach(b=>b.classList.toggle('active',b.id==='formsTab'));$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-forms'));renderStats();chooseNext();
}
function inject(){
  if($('#formsTab'))return;const nav=$('.tabs');if(!nav)return;
  const tab=document.createElement('button');tab.id='formsTab';tab.className='tab';tab.type='button';tab.dataset.view='forms';tab.textContent='Formen';nav.appendChild(tab);
  const section=document.createElement('section');section.id='view-forms';section.className='view';section.innerHTML=`
    <div class="section-head"><div><h2>Verbformen</h2><p>Formen werden automatisch freigeschaltet, sobald der Infinitiv sicher gelernt ist.</p></div></div>
    <div class="summary-row"><div class="mini-stat"><strong id="formVerbCount">0</strong><span>Verben frei</span></div><div class="mini-stat"><strong id="formDueCount">0</strong><span>Formen fällig</span></div><div class="mini-stat"><strong id="formSecureCount">0</strong><span>Formen sicher</span></div></div>
    <div id="lockedForms" class="panel forms-lock-info"></div>
    <article id="formCard" class="learn-card form-card hidden">
      <div class="card-toolbar"><span id="formInf" class="pill">Form</span><button id="formSpeak" class="icon-btn small" type="button" title="Lösung vorlesen">🔊</button></div>
      <div class="side-label">Deutsch</div><div id="formPrompt" class="prompt-text form-prompt"></div>
      <div class="answer-zone"><label for="formAnswer">Russische Form</label><div class="answer-line"><input id="formAnswer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Form eingeben oder sprechen …"><button id="formMic" class="icon-btn" type="button">🎙</button></div><div id="formStatus" class="form-status"></div><button id="formCheck" class="primary" type="button">Prüfen</button></div>
      <div id="formResult" class="form-result hidden"><div id="formResultMark" class="form-result-mark"></div><div class="solution"><span>Richtige Form</span><strong id="formSolution"></strong></div><div class="rating-grid"><button class="form-rating rating wrong" data-rating="again">Falsch<br><small>noch einmal</small></button><button class="form-rating rating hard" data-rating="hard">Unsicher<br><small>früher wiederholen</small></button><button class="form-rating rating good" data-rating="good">Gewußt<br><small>normal weiter</small></button><button class="form-rating rating easy" data-rating="easy">Sehr sicher<br><small>später wiederholen</small></button></div></div>
    </article>
    <div id="formEmpty" class="empty-state"><div class="empty-icon">я</div><h2>Noch keine Form fällig</h2><p>Lerne zuerst die Infinitive sicher. Danach erscheinen ihre Verbformen hier automatisch.</p></div>`;
  $('main')?.appendChild(section);
  const style=document.createElement('style');style.id='formsStyles';style.textContent=`
    .tabs{grid-template-columns:repeat(6,1fr)!important}.forms-lock-info{font-size:13px;color:var(--muted)}.forms-lock-info strong{color:var(--text)}.form-card{min-height:490px}.form-prompt{font-size:34px}.form-status{min-height:21px;text-align:center;color:var(--muted);font-size:12px;margin-top:6px}.form-result{max-width:610px;margin:24px auto 0;border-top:1px solid var(--line);padding-top:20px}.form-result-mark{text-align:center;font-size:25px;font-weight:900;margin-bottom:9px}.form-result.correct .form-result-mark{color:#2f8b58}.form-result.almost .form-result-mark{color:#d18412}.form-result.wrong .form-result-mark{color:#b63b3b}
    @media(max-width:650px){.tabs{grid-template-columns:repeat(3,1fr)!important}.form-prompt{font-size:30px}}
  `;document.head.appendChild(style);
  tab.addEventListener('click',showFormsView);$$('.tabs .tab:not(#formsTab)').forEach(b=>b.addEventListener('click',stopRecognition));$('#formCheck').addEventListener('click',showResult);$('#formAnswer').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('#formResult').classList.contains('hidden')){e.preventDefault();showResult();}});$('#formMic').addEventListener('click',()=>recognition?stopRecognition():startRecognition());$('#formSpeak').addEventListener('click',()=>current&&speak(current.ru));$$('.form-rating').forEach(b=>b.addEventListener('click',()=>review(b.dataset.rating)));renderStats();
}
inject();
})();
