(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const DAY=86400000;
const $=s=>document.querySelector(s);

function loadState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch(e){return {}}}
function saveState(state){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  try{
    const store=JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null');
    if(store?.exercises?.[store.activeId]){store.exercises[store.activeId].state=JSON.parse(JSON.stringify(state));localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
  }catch(e){}
}
function progressFor(state,id){return state.progress?.[id]||{};}
function wordIndex(state,id){return (state.words||[]).findIndex(w=>w.id===id);}
function stripStress(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function normRu(s){return stripStress(s).toLocaleLowerCase().replace(/ё/g,'е').replace(/\s*\+\s*(?:Dat\.?|Dativ|Akk\.?|Akkusativ|Gen\.?|Genitiv|Instr\.?|Instrumental|Präp\.?|Praep\.?|Präpositiv|Praepositiv|Lok\.?|Lokativ).*$/i,'').replace(/\s+/g,' ').trim();}
function normDe(s){return String(s||'').toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim();}
function currentDirection(){return /russisch/i.test($('#promptLabel')?.textContent||'')?'ru-de':'de-ru';}
function todayKey(){const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${d.getFullYear()}-${m}-${day}`;}
function selectedWord(state){
  const words=Array.isArray(state.words)?state.words:[],turn=Number(state.sessionTurn||0),t=Date.now();
  const prompt=($('#promptText')?.textContent||'').trim(),label=$('#promptLabel')?.textContent||'';
  if(/russisch/i.test(label)){
    const q=normRu(prompt),m=words.filter(w=>normRu(w.ru)===q||(w.altRu||[]).some(x=>normRu(x)===q));
    if(m.length===1)return m[0];
  }
  if(/deutsch/i.test(label)){
    const q=normDe(prompt),m=words.filter(w=>normDe(w.de)===q||(w.altDe||[]).some(x=>normDe(x)===q));
    if(m.length===1)return m[0];
  }
  const due=words.filter(w=>{const p=progressFor(state,w.id);return Number(p.seen||0)>0&&!p.active&&!p.postponed&&Number(p.reviewStage||0)>0&&Number(p.due||0)<=t;}).sort((a,b)=>Number(progressFor(state,a.id).due||0)-Number(progressFor(state,b.id).due||0)||wordIndex(state,a.id)-wordIndex(state,b.id));
  if(due.length)return due[0];
  const active=words.filter(w=>{const p=progressFor(state,w.id);return !!p.active&&!p.postponed&&Number(p.nextTurn||0)<=turn;}).sort((a,b)=>Number(progressFor(state,a.id).nextTurn||0)-Number(progressFor(state,b.id).nextTurn||0)||wordIndex(state,a.id)-wordIndex(state,b.id));
  return active[0]||null;
}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800);}
function ensureProgress(state,id){state.progress=state.progress||{};state.progress[id]=state.progress[id]||{level:0,due:0,seen:0,correct:0,wrong:0,hard:0,lapses:0,lastReview:0,lastResult:null,active:false,streak:0,nextTurn:0,reviewStage:0,postponed:false,dirStreak:{'ru-de':0,'de-ru':0}};return state.progress[id];}
function makeDailyIfSecure(state,p){
  if(!p?.problem||p.active||Number(p.level||0)<5)return false;
  p.reviewStage=1;p.due=Date.now()+DAY;p.nextTurn=Number(state.sessionTurn||0);return true;
}
function toggleProblem(){
  const state=loadState(),w=selectedWord(state);if(!w){toast('Aktuelle Vokabel konnte nicht bestimmt werden');return;}
  const p=ensureProgress(state,w.id);p.problem=!p.problem;
  p.problemDailyDate='';p.problemDailyDone=[];
  if(p.problem){
    if(!p.active&&Number(p.level||0)>=5){p.reviewStage=1;p.due=Date.now()+DAY;p.nextTurn=Number(state.sessionTurn||0);}
    toast('Problemvokabel markiert – gilt für Deutsch→Russisch und Russisch→Deutsch');
  }else{
    if(!p.active&&Number(p.level||0)>=5){p.reviewStage=Math.max(1,Number(p.reviewStage||1));p.due=Date.now()+7*DAY;}
    toast('Problemstatus entfernt – wieder normaler Lernabstand');
  }
  saveState(state);render();
}
function finishProblemAction(id,dir,wasDailyReview,wholeWordKnown=false){
  const state=loadState(),p=state.progress?.[id];if(!p?.problem)return;
  if(wholeWordKnown){
    p.problemDailyDate='';p.problemDailyDone=[];makeDailyIfSecure(state,p);saveState(state);render();return;
  }
  if(!wasDailyReview){if(makeDailyIfSecure(state,p)){saveState(state);}render();return;}
  if(p.active){p.problemDailyDate='';p.problemDailyDone=[];saveState(state);render();return;}
  const day=todayKey();if(p.problemDailyDate!==day){p.problemDailyDate=day;p.problemDailyDone=[];}
  const done=new Set(Array.isArray(p.problemDailyDone)?p.problemDailyDone:[]);done.add(dir);p.problemDailyDone=[...done];
  if(done.size<2){
    const other=dir==='ru-de'?'de-ru':'ru-de';
    p.dirStreak=p.dirStreak||{'ru-de':5,'de-ru':5};p.dirStreak[dir]=5;p.dirStreak[other]=Math.min(4,Number(p.dirStreak[other]??5));
    p.active=false;p.level=5;p.reviewStage=1;p.due=Date.now()-1000;p.nextTurn=Number(state.sessionTurn||0);
    saveState(state);toast('Problemvokabel: Jetzt noch die Gegenrichtung');setTimeout(()=>location.reload(),260);return;
  }
  p.dirStreak=p.dirStreak||{};p.dirStreak['ru-de']=5;p.dirStreak['de-ru']=5;p.active=false;p.level=5;p.reviewStage=1;p.due=Date.now()+DAY;p.nextTurn=Number(state.sessionTurn||0);p.problemDailyDone=[];
  saveState(state);toast('Problemvokabel heute in beiden Richtungen wiederholt');setTimeout(()=>location.reload(),260);
}
function render(){
  const b=$('#problemCurrent');if(!b)return;
  const state=loadState(),w=selectedWord(state),on=!!(w&&state.progress?.[w.id]?.problem);
  b.classList.toggle('problem-active',on);b.setAttribute('aria-pressed',on?'true':'false');
  b.textContent=on?'⚠ Problem: beide Richtungen':'⚠ Problemvokabel';
  b.title=on?'Problemstatus für diese Vokabel ausschalten':'Diese Vokabel täglich in Deutsch→Russisch UND Russisch→Deutsch wiederholen';
  let info=$('#problemVocabInfo');
  if(!info){info=document.createElement('small');info.id='problemVocabInfo';info.className='problem-vocab-info';($('#activePoolInfo')||$('#cardTag'))?.insertAdjacentElement('afterend',info);}
  if(info){info.textContent=on?'⚠ Problemvokabel: täglich · beide Richtungen':'';info.classList.toggle('hidden',!on);}
  decorateWordList(state);
}
function decorateWordList(state=loadState()){
  document.querySelectorAll('.word-row[data-id]').forEach(row=>{
    const on=!!state.progress?.[row.dataset.id]?.problem;row.classList.toggle('problem-word-row',on);
    let badge=row.querySelector('.problem-word-badge');
    if(on&&!badge){badge=document.createElement('span');badge.className='problem-word-badge';badge.textContent='⚠ täglich · beide Richtungen';row.appendChild(badge);}else if(on&&badge)badge.textContent='⚠ täglich · beide Richtungen';else if(!on&&badge)badge.remove();
  });
}
function installButton(){
  if($('#problemCurrent'))return true;
  const actions=$('#learnCard .card-actions')||$('.card-actions');
  const anchor=$('#masterCurrent')||$('#postponeCurrent')||$('#discardCurrent');
  if(!actions&&!anchor)return false;
  const b=document.createElement('button');b.id='problemCurrent';b.className='secondary compact';b.type='button';b.textContent='⚠ Problemvokabel';b.setAttribute('aria-pressed','false');b.dataset.scope='whole-word-both-directions';b.title='Diese Vokabel täglich in Deutsch→Russisch UND Russisch→Deutsch wiederholen';b.addEventListener('click',toggleProblem);
  if(anchor)anchor.insertAdjacentElement('afterend',b);else actions.prepend(b);
  render();return true;
}
function installStyles(){
  if($('#problemVocabStyles'))return;
  const s=document.createElement('style');s.id='problemVocabStyles';s.textContent=`
    #problemCurrent.problem-active{font-weight:800;border-width:2px}
    .problem-vocab-info{display:block;margin-top:4px;font-size:11px;font-weight:800;color:var(--muted)}
    .problem-vocab-info.hidden{display:none!important}
    .problem-word-row{position:relative}.problem-word-badge{font-size:11px;font-weight:800;color:var(--muted);white-space:nowrap}
  `;document.head.appendChild(s);
}
function install(){
  installStyles();installButton();render();
  const card=$('#learnCard');if(card)new MutationObserver(()=>setTimeout(()=>{installButton();render();},30)).observe(card,{childList:true,subtree:true,characterData:true});
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>setTimeout(()=>{installButton();render();},40)).observe(prompt,{childList:true,characterData:true,subtree:true});
  const list=$('#wordList');if(list)new MutationObserver(()=>decorateWordList()).observe(list,{childList:true,subtree:true});
  let tries=0;const retry=setInterval(()=>{tries++;installButton();if($('#problemCurrent')||tries>=80)clearInterval(retry)},250);
  document.addEventListener('click',e=>{
    const action=e.target?.closest?.('.rating,#masterCurrent');if(!action)return;
    const state=loadState(),w=selectedWord(state);if(!w)return;const p=state.progress?.[w.id];if(!p?.problem)return;
    const id=w.id,dir=currentDirection(),wholeWordKnown=action.id==='masterCurrent';
    const wasDailyReview=!p.active&&Number(p.reviewStage||0)>0&&Number(p.due||0)<=Date.now();
    setTimeout(()=>finishProblemAction(id,dir,wasDailyReview,wholeWordKnown),150);
  },true);
}
setTimeout(install,300);
})();
