(() => {
'use strict';
const Native=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!Native||Native.__rvtSpeechStartGuardWrapped)return;

function GuardedRecognition(){
  const r=new Native();
  let speechWindow=false;
  let soundWindow=false;
  let closeSpeechTimer=null;
  let closeSoundTimer=null;
  const openSpeechWindow=()=>{clearTimeout(closeSpeechTimer);speechWindow=true;};
  const openSoundWindow=()=>{clearTimeout(closeSoundTimer);soundWindow=true;};
  const closeSpeechSoon=()=>{clearTimeout(closeSpeechTimer);closeSpeechTimer=setTimeout(()=>{speechWindow=false;closeSpeechTimer=null;},1400);};
  const closeSoundSoon=()=>{clearTimeout(closeSoundTimer);closeSoundTimer=setTimeout(()=>{soundWindow=false;closeSoundTimer=null;},1800);};
  const closeAll=()=>{clearTimeout(closeSpeechTimer);clearTimeout(closeSoundTimer);closeSpeechTimer=closeSoundTimer=null;speechWindow=false;soundWindow=false;};

  try{r.addEventListener('soundstart',openSoundWindow,true);}catch(e){}
  try{r.addEventListener('soundend',closeSoundSoon,true);}catch(e){}
  try{r.addEventListener('speechstart',()=>{openSoundWindow();openSpeechWindow();},true);}catch(e){}
  try{r.addEventListener('speechend',closeSpeechSoon,true);}catch(e){}
  try{r.addEventListener('end',closeAll,true);}catch(e){}
  try{r.addEventListener('error',e=>{const code=e?.error||'';if(code==='no-speech'||code==='aborted')closeAll();},true);}catch(e){}
  try{
    r.addEventListener('result',e=>{
      // Safari liefert bei einer dauerhaft laufenden Erkennung nicht immer für jede
      // neue Äußerung ein eigenes speechstart. Ein echtes soundstart reicht daher
      // ebenfalls aus. Reine Resultate nach völliger Stille werden weiter blockiert.
      if(speechWindow||soundWindow)return;
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
