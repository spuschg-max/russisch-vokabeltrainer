(() => {
'use strict';
const $=s=>document.querySelector(s);
let watchdog=null;
let key='';

function autoMode(){return ($('#voiceQuickToggle')?.textContent||'').includes('AN');}
function currentKey(){return `${$('#promptText')?.textContent||''}|${$('#answerInput')?.value||''}|${$('#resultMark')?.textContent||''}`;}
function rating(){const mark=$('#resultMark');if(mark?.classList.contains('correct'))return'good';if(mark?.classList.contains('almost')||/fast richtig/i.test(mark?.textContent||''))return'hard';return'again';}
function clear(){clearTimeout(watchdog);watchdog=null;}
function arm(){
  clear();
  const panel=$('#resultPanel');if(!panel||panel.classList.contains('hidden')||!autoMode())return;
  key=currentKey();
  watchdog=setTimeout(()=>{
    const p=$('#resultPanel');if(!p||p.classList.contains('hidden')||!autoMode()||currentKey()!==key)return;
    try{if('speechSynthesis'in window)speechSynthesis.cancel();}catch(e){}
    const overlay=$('#feedbackOverlay');if(overlay)overlay.classList.remove('show');
    const btn=$(`.rating[data-rating="${rating()}"]`);
    if(btn)btn.click();
  },6500);
}
function install(){
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(panel.classList.contains('hidden'))clear();else arm();}).observe(panel,{attributes:true,attributeFilter:['class'],childList:true,subtree:true,characterData:true});
  const prompt=$('#promptText');if(prompt)new MutationObserver(clear).observe(prompt,{childList:true,characterData:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')clear();else if(!$('#resultPanel')?.classList.contains('hidden'))arm();});
}
setTimeout(install,500);
})();
