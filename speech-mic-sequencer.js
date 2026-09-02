(() => {
'use strict';
if(!('speechSynthesis'in window)||typeof speechSynthesis.speak!=='function')return;
const $=s=>document.querySelector(s);
const previousSpeak=speechSynthesis.speak.bind(speechSynthesis);
let restoring=false;

function learnActive(){return !!$('#view-learn')?.classList.contains('active');}
function speechUnlocked(){return ($('#speechUnlockButton')?.textContent||'').includes('Wort vorlesen');}
function autoMicOn(){return $('#voiceQuickToggle')?.getAttribute('aria-pressed')==='true';}
function turnMicOff(){
  const b=$('#voiceQuickToggle');
  if(!b||!autoMicOn())return false;
  try{b.click();return true}catch(e){return false;}
}
function turnMicOn(){
  if(restoring||!learnActive()||autoMicOn())return;
  const b=$('#voiceQuickToggle');if(!b)return;
  restoring=true;try{b.click()}catch(e){}finally{setTimeout(()=>{restoring=false},0)}
}

speechSynthesis.speak=function(u){
  if(!u)return previousSpeak(u);
  // Vor der ersten iOS-Freigabe lässt speech-unlock automatische Ausgaben bewusst
  // fallen. Dann darf das Mikrofon keinesfalls abgeschaltet werden.
  const sequence=learnActive()&&speechUnlocked()&&autoMicOn();
  if(!sequence)return previousSpeak(u);

  const micWasStopped=turnMicOff();
  if(!micWasStopped)return previousSpeak(u);

  let started=false,finished=false;
  const oldStart=u.onstart,oldEnd=u.onend,oldError=u.onerror;
  let watchdog=null;
  const restore=()=>{
    if(finished)return;finished=true;
    clearTimeout(watchdog);
    setTimeout(turnMicOn,180);
  };
  u.onstart=e=>{started=true;clearTimeout(watchdog);try{oldStart?.call(u,e)}catch(x){}};
  u.onend=e=>{restore();try{oldEnd?.call(u,e)}catch(x){}};
  u.onerror=e=>{restore();try{oldError?.call(u,e)}catch(x){}};

  watchdog=setTimeout(()=>{
    if(started||finished)return;
    // Safari hat den Auftrag angenommen, aber nicht begonnen: Warteschlange
    // freigeben und das Mikrofon zuverlässig zurückholen.
    try{speechSynthesis.cancel()}catch(e){}
    restore();
  },1200);

  try{return previousSpeak(u)}catch(e){restore();throw e;}
};
})();
