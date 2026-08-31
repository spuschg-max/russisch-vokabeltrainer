(() => {
'use strict';
const $=s=>document.querySelector(s);
let promptKey='';
let retries=0;
let retryTimer=null;

function automaticMode(){return ($('#voiceQuickToggle')?.textContent||'').includes('AN');}
function learnReady(){return !!$('#view-learn')?.classList.contains('active')&&!!$('#resultPanel')?.classList.contains('hidden');}
function listening(){return ($('#micButton')?.textContent||'').trim()==='●';}
function clearRetry(){clearTimeout(retryTimer);retryTimer=null;}
function scheduleRecovery(delay=700){
  clearRetry();
  retryTimer=setTimeout(()=>{
    if(!automaticMode()||!learnReady()||document.visibilityState==='hidden'||listening()||retries>=2)return;
    if('speechSynthesis'in window&&speechSynthesis.speaking){scheduleRecovery(350);return;}
    const input=$('#answerInput')?.value?.trim()||'';
    const status=$('#micStatus')?.textContent||'';
    const failedEmpty=!input&&(/ich höre/i.test(status)||/keine sprache erkannt/i.test(status)||/keine antwort/i.test(status));
    if(!failedEmpty)return;
    const mic=$('#micButton');if(!mic||mic.disabled)return;
    retries++;
    const st=$('#micStatus');if(st)st.textContent=retries===1?'Keine Antwort angekommen – ich höre noch einmal zu …':'Noch kein Ergebnis – ein letzter Versuch …';
    try{mic.click()}catch(e){}
  },delay);
}
function resetForPrompt(){
  const key=$('#promptText')?.textContent||'';if(key===promptKey)return;
  promptKey=key;retries=0;clearRetry();setTimeout(scheduleRecovery,900);
}
function install(){
  const prompt=$('#promptText');if(prompt)new MutationObserver(resetForPrompt).observe(prompt,{childList:true,characterData:true,subtree:true});
  const status=$('#micStatus');if(status)new MutationObserver(()=>{if(!listening())scheduleRecovery(550);}).observe(status,{childList:true,characterData:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){retries=0;scheduleRecovery(800);}else clearRetry();});
  setInterval(()=>{if(automaticMode()&&learnReady()&&!listening())scheduleRecovery(500);},1200);
  resetForPrompt();
}
setTimeout(install,650);
})();
