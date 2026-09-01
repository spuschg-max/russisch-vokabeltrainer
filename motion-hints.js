(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const $=s=>document.querySelector(s);
const HINTS={
  'идти':'zielgerichtet · unvollendet',
  'ходить':'nicht zielgerichtet · unvollendet',
  'пойти':'zielgerichtet · vollendet',
  'ехать':'zielgerichtet · unvollendet',
  'ездить':'nicht zielgerichtet · unvollendet',
  'поехать':'zielgerichtet · vollendet',
  'кататься':'nicht zielgerichtet · unvollendet'
};
function stripMarks(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function norm(s){return stripMarks(s).toLocaleLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/\s+/g,' ');}
function coreRu(s){return norm(String(s||'').replace(/\s*\+\s*(?:Dat(?:iv)?|Akk(?:usativ)?|Gen(?:itiv)?|Instr(?:umental)?|Präp(?:ositional)?|Präp\.?|Lok(?:ativ)?|Nom(?:inativ)?)[^,;]*/gi,''));}
function loadState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch(e){return {}}}
function progressFor(state,id){return state.progress?.[id]||{};}
function wordIndex(state,id){return (state.words||[]).findIndex(w=>w.id===id);}
function selectedWord(state){
  const words=Array.isArray(state.words)?state.words:[],turn=Number(state.sessionTurn||0),t=Date.now();
  const due=words.filter(w=>{const p=progressFor(state,w.id);return Number(p.seen||0)>0&&!p.active&&!p.postponed&&Number(p.reviewStage||0)>0&&Number(p.due||0)<=t;}).sort((a,b)=>Number(progressFor(state,a.id).due||0)-Number(progressFor(state,b.id).due||0)||wordIndex(state,a.id)-wordIndex(state,b.id));
  if(due.length)return due[0];
  const active=words.filter(w=>{const p=progressFor(state,w.id);return !!p.active&&!p.postponed&&Number(p.nextTurn||0)<=turn;}).sort((a,b)=>Number(progressFor(state,a.id).nextTurn||0)-Number(progressFor(state,b.id).nextTurn||0)||wordIndex(state,a.id)-wordIndex(state,b.id));
  if(active.length)return active[0];
  const prompt=($('#promptText')?.textContent||'').trim(),label=$('#promptLabel')?.textContent||'';
  if(/deutsch/i.test(label)){
    const matches=words.filter(w=>norm(w.de)===norm(prompt));if(matches.length===1)return matches[0];
  }else if(/russisch/i.test(label)){
    const matches=words.filter(w=>coreRu(w.ru)===coreRu(prompt));if(matches.length===1)return matches[0];
  }
  return null;
}
function render(){
  let el=$('#motionGrammarHint');
  if(!el){el=document.createElement('div');el.id='motionGrammarHint';el.className='motion-grammar-hint';$('#promptText')?.insertAdjacentElement('afterend',el);}
  if(!el)return;
  if(!/deutsch/i.test($('#promptLabel')?.textContent||'')){el.textContent='';el.classList.add('hidden');return;}
  const state=loadState(),w=selectedWord(state),hint=HINTS[coreRu(w?.ru)];
  if(!hint){el.textContent='';el.classList.add('hidden');return;}
  el.textContent=`(${hint})`;el.classList.remove('hidden');
}
function install(){
  if(!$('#motionHintStyles')){const s=document.createElement('style');s.id='motionHintStyles';s.textContent='.motion-grammar-hint{text-align:center;color:var(--muted);font-size:13px;font-weight:600;margin-top:-3px;min-height:18px}.motion-grammar-hint.hidden{display:none}';document.head.appendChild(s);}
  const p=$('#promptText');if(p)new MutationObserver(()=>setTimeout(render,0)).observe(p,{childList:true,characterData:true,subtree:true});
  setTimeout(render,50);
}
setTimeout(install,150);
})();