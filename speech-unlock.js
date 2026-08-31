(() => {
'use strict';
const $=s=>document.querySelector(s);
let unlocked=false;
let pending=null;
let originalSpeak=null;
let installed=false;

function muted(){try{return !!JSON.parse(localStorage.getItem('russischVokabeltrainer.audio.v1')||'{}').muted}catch(e){return false}}
function langForPrompt(){return /russisch/i.test($('#promptLabel')?.textContent||'')?'ru-RU':'de-DE';}
function currentPrompt(){return ($('#promptText')?.textContent||'').trim();}
function pickVoice(lang){const voices=speechSynthesis.getVoices?.()||[];const base=String(lang||'').toLowerCase().slice(0,2);return voices.find(v=>String(v.lang||'').toLowerCase()===String(lang||'').toLowerCase())||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base))||null;}
function makeUtterance(text,lang){const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.68:.82;u.pitch=1;const voice=pickVoice(lang);if(voice)u.voice=voice;return u;}
function render(){
  let b=$('#speechUnlockButton');
  if(!b){
    b=document.createElement('button');b.id='speechUnlockButton';b.type='button';b.className='secondary compact speech-unlock';
    const audio=$('#audioQuickToggle'),auto=$('#voiceQuickToggle');
    if(audio)audio.insertAdjacentElement('afterend',b);else if(auto)auto.insertAdjacentElement('afterend',b);
    else document.body.appendChild(b);
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();unlockAndSpeak(true);});
  }
  b.textContent=unlocked?'🔊 Wort vorlesen':'🔊 Sprache starten';
  b.title=unlocked?'Aktuelle Vokabel noch einmal vorlesen':'Einmal antippen, damit iOS die Sprachausgabe freigibt';
}
function directSpeak(u){
  if(!u||muted()||!originalSpeak)return false;
  try{speechSynthesis.resume();originalSpeak(u);return true}catch(e){return false}
}
function unlockAndSpeak(forceCurrent=false){
  if(muted()||!originalSpeak)return;
  unlocked=true;render();
  let u=null;
  if(forceCurrent){const text=currentPrompt();if(text)u=makeUtterance(text,langForPrompt());}
  if(!u&&pending){u=pending;pending=null;}
  if(u)directSpeak(u);
}
function install(){
  if(installed||!('speechSynthesis'in window)||typeof speechSynthesis.speak!=='function')return;
  installed=true;
  originalSpeak=speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak=function(u){
    if(muted())return originalSpeak(u);
    if(unlocked)return originalSpeak(u);
    pending=u;
    render();
  };
  try{speechSynthesis.getVoices()}catch(e){}
  speechSynthesis.addEventListener?.('voiceschanged',()=>{try{speechSynthesis.getVoices()}catch(e){}});
  document.addEventListener('pointerdown',()=>{if(!unlocked)unlockAndSpeak(false);},{capture:true});
  document.addEventListener('touchend',()=>{if(!unlocked)unlockAndSpeak(false);},{capture:true});
  render();
  if(!$('#speechUnlockStyles')){const s=document.createElement('style');s.id='speechUnlockStyles';s.textContent=`.speech-unlock{white-space:nowrap;padding:9px 11px}@media(max-width:650px){#exerciseBar{grid-template-columns:1fr 1fr!important}#speechUnlockButton{grid-column:1/-1!important}}`;document.head.appendChild(s);}
}
setTimeout(install,120);
setTimeout(()=>{install();render();},800);
})();
