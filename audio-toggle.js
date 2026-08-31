(() => {
'use strict';
const AUDIO_KEY='russischVokabeltrainer.audio.v1';
const VOICE_KEY='russischVokabeltrainer.voice.v2';
const MIGRATION_KEY='russischVokabeltrainer.voiceDefaults.2026.08.31.14';
const $=s=>document.querySelector(s);

function loadAudio(){
  try{return {muted:false,...JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}')}}catch(e){return {muted:false}}
}
let audio=loadAudio();
function saveAudio(){localStorage.setItem(AUDIO_KEY,JSON.stringify(audio));}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}

function migrateVoiceDefaults(){
  if(localStorage.getItem(MIGRATION_KEY))return;
  try{
    const voice=JSON.parse(localStorage.getItem(VOICE_KEY)||'{}');
    voice.mode='auto';
    voice.speakPrompt=true;
    localStorage.setItem(VOICE_KEY,JSON.stringify(voice));
  }catch(e){
    localStorage.setItem(VOICE_KEY,JSON.stringify({mode:'auto',speakPrompt:true,speakCorrection:true,advanceDelay:2600}));
  }
  audio.muted=false;saveAudio();
  localStorage.setItem(MIGRATION_KEY,'1');
}

function installSpeechMute(){
  if(!('speechSynthesis'in window)||speechSynthesis.__rvtMasterMute)return;
  const nativeSpeak=speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.__rvtMasterMute=true;
  speechSynthesis.speak=function(utterance){
    if(!audio.muted)return nativeSpeak(utterance);
    setTimeout(()=>{try{if(typeof utterance?.onend==='function')utterance.onend({type:'end',synthetic:true});}catch(e){}},0);
  };
}

function render(){
  const b=$('#audioQuickToggle');if(b){b.textContent=audio.muted?'🔇 Ton: AUS':'🔊 Ton: AN';b.setAttribute('aria-pressed',audio.muted?'true':'false');}
  const cb=$('#muteAllSoundSetting');if(cb)cb.checked=audio.muted;
}
function setMuted(value,announce=true){
  audio.muted=!!value;saveAudio();
  if(audio.muted&&'speechSynthesis'in window){try{speechSynthesis.cancel()}catch(e){}}
  if(!audio.muted&&'speechSynthesis'in window){try{speechSynthesis.resume()}catch(e){}}
  render();
  if(announce)toast(audio.muted?'Stummmodus eingeschaltet':'Ton eingeschaltet');
}
function toggle(){setMuted(!audio.muted);}
function unlockSpeech(){if(audio.muted||!('speechSynthesis'in window))return;try{speechSynthesis.resume()}catch(e){}}

function inject(){
  migrateVoiceDefaults();installSpeechMute();
  const auto=$('#voiceQuickToggle');
  if(auto&&!$('#audioQuickToggle')){
    const b=document.createElement('button');b.id='audioQuickToggle';b.className='secondary compact audio-quick';b.type='button';b.addEventListener('click',toggle);auto.insertAdjacentElement('afterend',b);
  }
  const panel=$('#voiceSettingsPanel');
  if(panel&&!$('#muteAllSoundSetting')){
    const prompt=$('#speakPromptSetting')?.closest('label');
    const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="muteAllSoundSetting" type="checkbox"> Stummmodus: alle Sprachausgaben ausschalten';
    if(prompt)prompt.insertAdjacentElement('beforebegin',label);else panel.appendChild(label);
    $('#muteAllSoundSetting').addEventListener('change',e=>setMuted(e.target.checked,false));
    const note=document.createElement('p');note.className='voice-note audio-note';note.textContent='Der Ton-Schalter gilt nur für die Sprachausgabe. Das Mikrofon wird ausschließlich über „Mikrofon: AN/AUS“ gesteuert.';label.insertAdjacentElement('afterend',note);
  }
  if(!$('#audioToggleStyles')){
    const s=document.createElement('style');s.id='audioToggleStyles';s.textContent=`
      #exerciseBar{grid-template-columns:auto minmax(160px,1fr) auto auto!important}.audio-quick{white-space:nowrap;padding:9px 11px}.audio-note{font-size:12px;color:var(--muted);margin:6px 0 10px!important}
      @media(max-width:650px){#exerciseBar{grid-template-columns:1fr 1fr!important}#exerciseBar .exercise-bar-label{grid-column:1/-1!important}#exerciseSelect{grid-column:1/-1!important}#voiceQuickToggle{grid-column:1!important}#audioQuickToggle{grid-column:2!important}#exerciseDescriptionTop{grid-column:1/-1!important}}
    `;document.head.appendChild(s);
  }
  render();
}

document.addEventListener('pointerdown',unlockSpeech,{passive:true});
document.addEventListener('touchstart',unlockSpeech,{passive:true});
setTimeout(inject,80);
setTimeout(inject,700);
})();
