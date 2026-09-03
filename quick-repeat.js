(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const $=s=>document.querySelector(s);

function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
function core(){return window.__rvtQuickRepeatCore||null;}
function currentId(){return core()?.currentId?.()||null;}
function syncExercise(){
  try{
    const state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    const store=JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null');
    if(state&&store?.exercises?.[store.activeId]){
      store.exercises[store.activeId].state=JSON.parse(JSON.stringify(state));
      localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));
    }
  }catch(e){}
}
function toggleQuick(){
  const c=core(),id=currentId();if(!c||!id)return;
  const on=!c.isOn(id);if(!c.set(id,on))return;
  syncExercise();render();
  toast(on?'⏱ Schnelllernen an – diese Vokabel kommt nach zwei anderen wieder':'Schnelllernen aus – wieder normaler Lernabstand');
}
function installQuickButton(){
  if($('#quickRepeatCurrent'))return true;
  const problem=$('#problemCurrent');
  const anchor=problem||$('#masterCurrent')||$('#postponeCurrent')||$('#discardCurrent');if(!anchor)return false;
  const b=document.createElement('button');b.id='quickRepeatCurrent';b.className='quick-repeat-btn';b.type='button';b.textContent='⏱';b.title='Schnelllernen: Diese Vokabel nach jeweils zwei anderen wiederholen';b.setAttribute('aria-label','Schnelllernen für diese Vokabel');b.setAttribute('aria-pressed','false');b.addEventListener('click',toggleQuick);
  if(problem)problem.insertAdjacentElement('beforebegin',b);else anchor.insertAdjacentElement('afterend',b);
  return true;
}
function installRepeatButton(){
  if($('#repeatWordInline'))return true;
  const prompt=$('#promptText');if(!prompt)return false;
  let row=$('#promptRepeatRow');
  if(!row){row=document.createElement('div');row.id='promptRepeatRow';row.className='prompt-repeat-row';prompt.parentNode.insertBefore(row,prompt);row.appendChild(prompt);}
  const b=document.createElement('button');b.id='repeatWordInline';b.className='inline-repeat-word';b.type='button';b.textContent='🔊';b.title='Russische Vokabel noch einmal anhören';b.setAttribute('aria-label','Vokabel noch einmal vorlesen');b.addEventListener('click',()=>$('#speakPrompt')?.click());row.appendChild(b);return true;
}
function render(){
  installQuickButton();installRepeatButton();
  const c=core(),id=currentId(),quick=$('#quickRepeatCurrent');
  const on=!!(c&&id&&c.isOn(id));
  if(quick){quick.classList.toggle('quick-repeat-active',on);quick.setAttribute('aria-pressed',on?'true':'false');quick.title=on?'Schnelllernen ausschalten':'Schnelllernen: Diese Vokabel nach jeweils zwei anderen wiederholen';}
  const repeat=$('#repeatWordInline'),isRu=/russisch/i.test($('#promptLabel')?.textContent||'');if(repeat)repeat.classList.toggle('hidden',!isRu);
}
function installStyles(){
  if($('#quickRepeatStyles'))return;
  const s=document.createElement('style');s.id='quickRepeatStyles';s.textContent=`
    .quick-repeat-btn{width:34px;height:34px;display:inline-grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--brand);font-size:18px;line-height:1;padding:0;font-weight:800}
    .quick-repeat-btn.quick-repeat-active{border:2px solid #d27a12;background:#fff1d9;box-shadow:0 0 0 2px rgba(210,122,18,.10)}
    body.dark .quick-repeat-btn.quick-repeat-active{background:#3b2b16;color:#ffd28a}
    .prompt-repeat-row{display:flex;align-items:center;justify-content:center;gap:8px;margin:12px 0 8px;min-width:0}
    .prompt-repeat-row #promptText{margin:0;min-width:0}
    .inline-repeat-word{flex:0 0 auto;width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--line);border-radius:999px;background:var(--surface2);color:var(--text);font-size:16px;padding:0}
    .inline-repeat-word:active{transform:scale(.96)}
    @media(max-width:650px){.quick-repeat-btn{width:32px;height:32px;font-size:17px}.inline-repeat-word{width:30px;height:30px;font-size:15px}.prompt-repeat-row{gap:6px}}
  `;document.head.appendChild(s);
}
function install(){
  installStyles();
  let tries=0;const timer=setInterval(()=>{tries++;installQuickButton();installRepeatButton();render();if((core()&&$('#quickRepeatCurrent')&&$('#repeatWordInline'))||tries>40)clearInterval(timer);},100);
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>setTimeout(render,0)).observe(prompt,{childList:true,characterData:true,subtree:true});
  const label=$('#promptLabel');if(label)new MutationObserver(()=>setTimeout(render,0)).observe(label,{childList:true,characterData:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target?.closest?.('.rating,#masterCurrent,#problemCurrent,#quickRepeatCurrent'))setTimeout(render,80);},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
