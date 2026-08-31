(() => {
'use strict';
const AUDIO_KEY='russischVokabeltrainer.audio.v1';
const VOICE_KEY='russischVokabeltrainer.voice.v2';
const $=s=>document.querySelector(s);

function loadAudio(){
  try{return {muted:false,...JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}')}}catch(e){return {muted:false}}
}
let audio=loadAudio();
function saveAudio(){localStorage.setItem(AUDIO_KEY,JSON.stringify(audio));}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}
function automaticMode(){return ($('#voiceQuickToggle')?.textContent||'').includes('AN');}
function learnReady(){return !!$('#view-learn')?.classList.contains('active')&&!!$('#resultPanel')?.classList.contains('hidden');}
function listening(){return ($('#micButton')?.textContent||'').trim()==='●';}

function ensurePromptAudioDefault(){
  if(localStorage.getItem(AUDIO_KEY)!==null)return;
  try{
    const voice=JSON.parse(localStorage.getItem(VOICE_KEY)||'{}');
    voice.speakPrompt=true;
    localStorage.setItem(VOICE_KEY,JSON.stringify(voice));
    const cb=$('#speakPromptSetting');if(cb)cb.checked=true;
  }catch(e){}
  saveAudio();
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

function maybeRestartMic(){
  if(!audio.muted||!automaticMode()||!learnReady()||listening())return;
  const mic=$('#micButton');if(!mic||mic.disabled)return;
  setTimeout(()=>{if(audio.muted&&automaticMode()&&learnReady()&&!listening()){try{mic.click()}catch(e){}}},260);
}

function render(){
  const b=$('#audioQuickToggle');if(b){b.textContent=audio.muted?'🔇 Ton: AUS':'🔊 Ton: AN';b.setAttribute('aria-pressed',audio.muted?'true':'false');}
  const cb=$('#muteAllSoundSetting');if(cb)cb.checked=audio.muted;
}
function setMuted(value,announce=true){
  audio.muted=!!value;saveAudio();
  if(audio.muted&&'speechSynthesis'in window){try{speechSynthesis.cancel()}catch(e){}}
  render();
  if(announce)toast(audio.muted?'Stummmodus eingeschaltet':'Ton eingeschaltet');
  if(audio.muted)maybeRestartMic();
}
function toggle(){setMuted(!audio.muted);}

function inject(){
  ensurePromptAudioDefault();installSpeechMute();
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
    const note=document.createElement('p');note.className='voice-note audio-note';note.textContent='Der Ton-Schalter gilt für Vokabeln und Korrekturen. Das Mikrofon bleibt auch im Stummmodus nutzbar.';label.insertAdjacentElement('afterend',note);
  }
  if(!$('#audioToggleStyles')){
    const s=document.createElement('style');s.id='audioToggleStyles';s.textContent=`
      #exerciseBar{grid-template-columns:auto minmax(160px,1fr) auto auto!important}.audio-quick{white-space:nowrap;padding:9px 11px}.audio-note{font-size:12px;color:var(--muted);margin:6px 0 10px!important}
      @media(max-width:650px){#exerciseBar{grid-template-columns:1fr 1fr!important}#exerciseBar .exercise-bar-label{grid-column:1/-1!important}#exerciseSelect{grid-column:1/-1!important}#voiceQuickToggle{grid-column:1!important}#audioQuickToggle{grid-column:2!important}#exerciseDescriptionTop{grid-column:1/-1!important}}
    `;document.head.appendChild(s);
  }
  render();
}

setTimeout(inject,80);
setTimeout(inject,700);
})();
