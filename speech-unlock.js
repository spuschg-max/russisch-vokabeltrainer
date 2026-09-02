(() => {
'use strict';
const $=s=>document.querySelector(s);
let unlocked=false;
let originalSpeak=null;
let installed=false;
let gestureUntil=0;

function muted(){try{return !!JSON.parse(localStorage.getItem('russischVokabeltrainer.audio.v1')||'{}').muted}catch(e){return false}}
function langForPrompt(){return /russisch/i.test($('#promptLabel')?.textContent||'')?'ru-RU':'de-DE';}
function currentPrompt(){return ($('#promptText')?.textContent||'').trim();}
function pickVoice(lang){const voices=speechSynthesis.getVoices?.()||[];const base=String(lang||'').toLowerCase().slice(0,2);return voices.find(v=>String(v.lang||'').toLowerCase()===String(lang||'').toLowerCase())||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base))||null;}
function makeUtterance(text,lang){const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.68:.82;u.pitch=1;const voice=pickVoice(lang);if(voice)u.voice=voice;return u;}
function signalUtterance(u){
  if(!u||u.__rvtSignalled)return u;u.__rvtSignalled=true;
  const oldStart=u.onstart,oldEnd=u.onend,oldError=u.onerror;let started=false,finished=false;
  u.onstart=e=>{started=true;unlocked=true;render();window.__rvtAppSpeaking=true;document.dispatchEvent(new Event('rvt-app-speech-start'));try{oldStart?.call(u,e)}catch(x){}};
  const finish=(e,old)=>{if(finished)return;finished=true;if(started){window.__rvtAppSpeaking=false;document.dispatchEvent(new Event('rvt-app-speech-end'));}try{old?.call(u,e)}catch(x){}};
  u.onend=e=>finish(e,oldEnd);u.onerror=e=>finish(e,oldError);return u;
}
function render(){
  let b=$('#speechUnlockButton');
  if(!b){
    b=document.createElement('button');b.id='speechUnlockButton';b.type='button';b.className='secondary compact speech-unlock';
    const audio=$('#audioQuickToggle'),auto=$('#voiceQuickToggle');
    if(audio)audio.insertAdjacentElement('afterend',b);else if(auto)auto.insertAdjacentElement('afterend',b);else document.body.appendChild(b);
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();unlockAndSpeak();});
  }
  b.textContent=unlocked?'🔊 Wort vorlesen':'🔊 Sprache starten';
  b.title=unlocked?'Aktuelle Vokabel noch einmal vorlesen':'iOS-Sprachausgabe einmal bewusst freigeben';
}
function nativeSpeak(u){if(!u||muted()||!originalSpeak)return false;try{speechSynthesis.resume();originalSpeak(signalUtterance(u));return true}catch(e){return false}}
function unlockAndSpeak(){
  if(muted()||!originalSpeak)return;
  const text=currentPrompt();if(!text)return;
  unlocked=true;gestureUntil=performance.now()+1200;render();
  try{speechSynthesis.cancel();speechSynthesis.resume();}catch(e){}
  nativeSpeak(makeUtterance(text,langForPrompt()));
}
function gesture(){gestureUntil=performance.now()+700;}
function install(){
  if(installed||!('speechSynthesis'in window)||typeof speechSynthesis.speak!=='function')return;installed=true;originalSpeak=speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak=function(u){
    if(!u)return;
    const signalled=signalUtterance(u);
    if(muted())return originalSpeak(signalled);
    // Auf iOS darf ein blockierter automatischer Sprachauftrag NICHT bei jedem
    // späteren Fingertipp erneut in die Warteschlange gelegt werden. Vor der
    // ersten echten Benutzerfreigabe wird der automatische Versuch deshalb
    // einfach verworfen. Ein Fingertipp erlaubt nur Sprachaufrufe, die durch
    // genau diese Benutzeraktion ausgelöst werden; er spielt nichts nachträglich ab.
    if(!unlocked&&performance.now()>gestureUntil){render();return;}
    try{speechSynthesis.resume();return originalSpeak(signalled);}catch(e){render();}
  };
  try{speechSynthesis.getVoices()}catch(e){}
  speechSynthesis.addEventListener?.('voiceschanged',()=>{try{speechSynthesis.getVoices()}catch(e){}});
  document.addEventListener('pointerdown',gesture,{capture:true,passive:true});
  document.addEventListener('touchstart',gesture,{capture:true,passive:true});
  render();
  if(!$('#speechUnlockStyles')){const s=document.createElement('style');s.id='speechUnlockStyles';s.textContent=`.speech-unlock{white-space:nowrap;padding:9px 11px}@media(max-width:650px){#exerciseBar{grid-template-columns:1fr 1fr!important}#speechUnlockButton{grid-column:1/-1!important}}`;document.head.appendChild(s);}
}
setTimeout(install,120);setTimeout(()=>{install();render();},800);
})();
