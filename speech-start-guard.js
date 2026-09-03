(() => {
'use strict';
const Native=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!Native||Native.__rvtSpeechStartGuardWrapped)return;

function GuardedRecognition(){
  const r=new Native();
  let speechWindow=false;
  let closeTimer=null;
  const openSpeechWindow=()=>{clearTimeout(closeTimer);closeTimer=null;speechWindow=true;};
  const closeSpeechWindowSoon=()=>{clearTimeout(closeTimer);closeTimer=setTimeout(()=>{speechWindow=false;closeTimer=null;},1200);};
  const closeSpeechWindow=()=>{clearTimeout(closeTimer);closeTimer=null;speechWindow=false;};

  try{r.addEventListener('speechstart',openSpeechWindow,true);}catch(e){}
  try{r.addEventListener('speechend',closeSpeechWindowSoon,true);}catch(e){}
  try{r.addEventListener('end',closeSpeechWindow,true);}catch(e){}
  try{r.addEventListener('error',e=>{const code=e?.error||'';if(code==='no-speech'||code==='aborted')closeSpeechWindow();},true);}catch(e){}
  try{
    r.addEventListener('result',e=>{
      if(speechWindow)return;
      try{e.stopImmediatePropagation();}catch(err){}
      try{e.preventDefault();}catch(err){}
    },true);
  }catch(e){}
  return r;
}

try{Object.setPrototypeOf(GuardedRecognition,Native);GuardedRecognition.prototype=Native.prototype;}catch(e){}
GuardedRecognition.__rvtSpeechStartGuardWrapped=true;
if(window.SpeechRecognition===Native)window.SpeechRecognition=GuardedRecognition;
if(window.webkitSpeechRecognition===Native)window.webkitSpeechRecognition=GuardedRecognition;
})();
