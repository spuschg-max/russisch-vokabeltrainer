(() => {
'use strict';
const PREF_KEY='russischVokabeltrainer.stableVoice.v1';
const AUDIO_KEY='russischVokabeltrainer.audio.v1';
const $=s=>document.querySelector(s);
let prefs=loadPrefs();
let recognition=null;
let recognitionRunning=false;
let recognitionStarting=false;
let recognitionLang='';
let restartTimer=null;
let submitTimer=null;
let advanceTimer=null;
let speechWatchdog=null;
let cardSerial=0;
let submittedSerial=-1;
let handledResultSerial=-1;
let speaking=false;
let acceptingAnswer=false;
let userStopped=false;
let userSpeechDetected=false;
let suppressRecognitionUntil=0;
let lastResultCount=0;
let cardResultStartIndex=0;
let resultSegments=new Map();
let cardTranscript='';

function loadPrefs(){try{return {autoMic:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function muted(){try{return !!JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}').muted}catch(e){return false}}
function learnViewActive(){return !!$('#view-learn')?.classList.contains('active');}
function answerReady(){return learnViewActive()&&!!$('#resultPanel')?.classList.contains('hidden');}
function answerLang(){return /russisch/i.test($('#answerLabel')?.textContent||'')?'ru-RU':'de-DE';}
function answerLanguageName(){return answerLang()==='ru-RU'?'Russisch':'Deutsch';}
function promptLang(){return /russisch/i.test($('#promptLabel')?.textContent||'')?'ru-RU':'de-DE';}
function listeningStatus(){return `Ich höre ${answerLanguageName()} …`;}
function setStatus(text,on=false){const s=$('#micStatus');if(!s)return;s.textContent=text||'';s.classList.toggle('listening',!!on);}
function setMicButton(active){const b=$('#micButton');if(!b)return;b.textContent=active?'●':'🎙';b.disabled=false;b.setAttribute('aria-pressed',active?'true':'false');}
function clearSubmitTimer(){clearTimeout(submitTimer);submitTimer=null;}
function resetTranscript(){clearSubmitTimer();userSpeechDetected=false;cardResultStartIndex=lastResultCount;resultSegments.clear();cardTranscript='';const input=$('#answerInput');if(input){input.classList.remove('voice-recognized');input.value='';}}
function cancelSpeech(){clearTimeout(speechWatchdog);speechWatchdog=null;speaking=false;try{if('speechSynthesis'in window)speechSynthesis.cancel()}catch(e){}}
function pickVoice(lang){
  if(!('speechSynthesis'in window))return null;
  const voices=speechSynthesis.getVoices?.()||[];
  const exact=String(lang||'').toLowerCase();const base=exact.slice(0,2);
  return voices.find(v=>String(v.lang||'').toLowerCase()===exact)||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base))||null;
}
function finishOwnSpeech(){
  speaking=false;clearTimeout(speechWatchdog);speechWatchdog=null;
  suppressRecognitionUntil=Date.now()+280;
  userSpeechDetected=false;cardResultStartIndex=lastResultCount;resultSegments.clear();cardTranscript='';clearSubmitTimer();
  const input=$('#answerInput');if(input&&input.classList.contains('voice-recognized')){input.value='';input.classList.remove('voice-recognized');}
  if(answerReady()&&prefs.autoMic)setStatus(listeningStatus(),recognitionRunning||recognitionStarting);
}
function speakNow(text,lang){
  if(!text||muted()||!('speechSynthesis'in window))return false;
  cancelSpeech();speaking=true;userSpeechDetected=false;clearSubmitTimer();
  try{speechSynthesis.resume()}catch(e){}
  const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.68:.82;u.pitch=1;
  const voice=pickVoice(lang);if(voice)u.voice=voice;
  u.onstart=()=>{speaking=true;userSpeechDetected=false;};u.onend=finishOwnSpeech;u.onerror=finishOwnSpeech;
  try{speechSynthesis.speak(u)}catch(e){finishOwnSpeech();return false;}
  speechWatchdog=setTimeout(finishOwnSpeech,Math.min(5200,Math.max(1800,900+String(text).length*85)));
  return true;
}
function updateToggle(){const b=$('#voiceQuickToggle');if(b){b.textContent=prefs.autoMic?'🎙 Mikrofon: AN':'🎙 Mikrofon: AUS';b.setAttribute('aria-pressed',prefs.autoMic?'true':'false')}const cb=$('#stableAutoMicSetting');if(cb)cb.checked=prefs.autoMic;}

function stopRecognition(permanent=false){
  clearSubmitTimer();clearTimeout(restartTimer);restartTimer=null;recognitionStarting=false;acceptingAnswer=false;userSpeechDetected=false;
  if(permanent)userStopped=true;
  const r=recognition;recognition=null;recognitionRunning=false;recognitionLang='';
  if(r){try{r.abort()}catch(e){}}
  setMicButton(false);
}
function scheduleRecognitionRestart(delay=260){
  clearTimeout(restartTimer);
  if(!prefs.autoMic||userStopped||document.visibilityState==='hidden'||!learnViewActive())return;
  restartTimer=setTimeout(()=>ensureRecognition(false),delay);
}
function composeTranscript(){
  const parts=[...resultSegments.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v).filter(Boolean);
  return parts.join(' ').replace(/\s+/g,' ').trim();
}
function ensureRecognition(manual=false){
  if(!learnViewActive())return false;
  const targetLang=answerLang();
  if((recognitionRunning||recognitionStarting)&&recognitionLang===targetLang){setMicButton(true);return true;}
  if((recognitionRunning||recognitionStarting)&&recognitionLang!==targetLang){
    clearTimeout(restartTimer);restartTimer=null;
    const old=recognition;recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';
    if(old){try{old.abort()}catch(e){}}
    setMicButton(false);
  }
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!C){setStatus('Spracherkennung wird von diesem Gerät nicht unterstützt.');return false;}
  clearTimeout(restartTimer);restartTimer=null;userStopped=false;recognitionStarting=true;recognitionLang=targetLang;
  const r=new C();recognition=r;r.lang=targetLang;r.interimResults=true;r.continuous=true;r.maxAlternatives=3;
  r.onstart=()=>{if(recognition!==r)return;recognitionStarting=false;recognitionRunning=true;setMicButton(true);if(acceptingAnswer)setStatus(listeningStatus(),true);};
  r.onspeechstart=()=>{
    if(recognition!==r||!acceptingAnswer||speaking||Date.now()<suppressRecognitionUntil||!answerReady()||submittedSerial===cardSerial)return;
    clearSubmitTimer();
    if(!userSpeechDetected){userSpeechDetected=true;cardResultStartIndex=lastResultCount;resultSegments.clear();cardTranscript='';}
    setStatus(listeningStatus(),true);
  };
  r.onresult=e=>{
    if(recognition!==r)return;
    lastResultCount=Math.max(lastResultCount,e.results.length);
    if(!acceptingAnswer||speaking||Date.now()<suppressRecognitionUntil||!answerReady()||submittedSerial===cardSerial||!userSpeechDetected)return;
    let hasText=false,hasFinal=false;
    const start=Math.max(0,cardResultStartIndex);
    for(let i=start;i<e.results.length;i++){
      const piece=(e.results[i][0]?.transcript||'').trim();
      if(!piece)continue;
      resultSegments.set(i,piece);hasText=true;if(e.results[i].isFinal)hasFinal=true;
    }
    if(!hasText)return;
    cardTranscript=composeTranscript();
    const input=$('#answerInput');if(input&&cardTranscript){input.value=cardTranscript;input.classList.add('voice-recognized');}
    setStatus(listeningStatus(),true);
    clearSubmitTimer();
    if(hasFinal)submitTimer=setTimeout(()=>submitVoice(cardSerial),950);
  };
  r.onspeechend=()=>{
    if(recognition!==r||!userSpeechDetected||submittedSerial===cardSerial||!answerReady())return;
    if(cardTranscript.trim()){clearSubmitTimer();submitTimer=setTimeout(()=>submitVoice(cardSerial),950);}
  };
  r.onerror=e=>{
    if(recognition!==r)return;
    const code=e?.error||'';
    if(code==='not-allowed'||code==='service-not-allowed'){
      recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';setMicButton(false);setStatus('Mikrofonzugriff ist nicht erlaubt. Bitte einmal auf das Mikrofon tippen.');return;
    }
    if(code==='aborted')return;
    if(code==='no-speech'){
      clearSubmitTimer();userSpeechDetected=false;resultSegments.clear();cardTranscript='';cardResultStartIndex=lastResultCount;
      const input=$('#answerInput');if(input&&input.classList.contains('voice-recognized')){input.value='';input.classList.remove('voice-recognized');}
      setStatus(answerReady()&&prefs.autoMic?listeningStatus():'',answerReady()&&prefs.autoMic);return;
    }
    setStatus('Spracherkennung wurde kurz unterbrochen – ich verbinde neu …');
  };
  r.onend=()=>{
    if(recognition!==r)return;
    recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';setMicButton(false);clearSubmitTimer();userSpeechDetected=false;
    if(prefs.autoMic&&!userStopped&&document.visibilityState!=='hidden'&&learnViewActive())scheduleRecognitionRestart(220);
  };
  try{r.start();return true}catch(e){recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';setMicButton(false);if(manual)setStatus('Mikrofon konnte nicht gestartet werden.');else setStatus('Tippe einmal auf das Mikrofon, um den Sprachmodus zu starten.');return false;}
}
function setAutoMic(v){
  prefs.autoMic=!!v;savePrefs();updateToggle();
  if(!prefs.autoMic){stopRecognition(true);setStatus('Mikrofon-Automatik ausgeschaltet.');}
  else{userStopped=false;acceptingAnswer=answerReady();ensureRecognition(false);if(answerReady())setStatus(listeningStatus(),true);}
}

function neutralizeOldVoiceAutomation(){
  const mode=$('#trainingMode');if(mode){mode.value='manual';mode.dispatchEvent(new Event('change',{bubbles:true}));const l=mode.closest('label');if(l)l.style.display='none';}
  const delay=$('#advanceDelay');if(delay){const l=delay.closest('label');if(l)l.style.display='none';}
  const prompt=$('#speakPromptSetting');if(prompt){prompt.checked=false;prompt.dispatchEvent(new Event('change',{bubbles:true}));const l=prompt.closest('label');if(l)l.style.display='none';}
  const corr=$('#speakCorrectionSetting');if(corr){corr.checked=false;corr.dispatchEvent(new Event('change',{bubbles:true}));const l=corr.closest('label');if(l)l.style.display='none';}
  const panel=$('#voiceSettingsPanel');if(panel){
    const p=panel.querySelector('p');if(p)p.textContent='Neue Vokabeln werden automatisch und langsam vorgelesen. Es gibt keine Denkzeitbegrenzung: Erst wenn du tatsächlich sprichst, wird eine Antwort erfasst. Das Mikrofon wechselt passend zwischen Russisch und Deutsch.';
    if(!$('#stableAutoMicSetting')){const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="stableAutoMicSetting" type="checkbox"> Mikrofon während der Lernrunde automatisch aktiv halten';const note=panel.querySelector('.voice-note');if(note)note.insertAdjacentElement('beforebegin',label);else panel.appendChild(label);label.querySelector('input').addEventListener('change',e=>setAutoMic(e.target.checked));}
  }
}
function replaceControls(){
  const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.stableVoice){const mic=oldMic.cloneNode(true);mic.dataset.stableVoice='5';oldMic.replaceWith(mic);mic.addEventListener('click',()=>{if(!prefs.autoMic)setAutoMic(true);userStopped=false;acceptingAnswer=answerReady();if(recognitionRunning&&recognitionLang===answerLang()){setStatus(acceptingAnswer?listeningStatus():'Mikrofon ist bereit.',acceptingAnswer);}else ensureRecognition(true);});}
  const oldToggle=$('#voiceQuickToggle');if(oldToggle&&!oldToggle.dataset.stableVoice){const b=oldToggle.cloneNode(true);b.dataset.stableVoice='5';oldToggle.replaceWith(b);b.addEventListener('click',()=>setAutoMic(!prefs.autoMic));}
  updateToggle();
}
function submitVoice(serial){
  clearSubmitTimer();
  if(serial!==cardSerial||submittedSerial===serial||!answerReady()||!userSpeechDetected)return;
  const value=($('#answerInput')?.value||cardTranscript||'').trim();if(!value)return;
  submittedSerial=serial;acceptingAnswer=false;userSpeechDetected=false;setStatus('Antwort erkannt – wird geprüft …');
  setTimeout(()=>{if(serial!==cardSerial)return;if($('#resultPanel')?.classList.contains('hidden'))$('#checkAnswer')?.click();},90);
}
function resultKind(){const m=$('#resultMark');if(m?.classList.contains('correct'))return'correct';if(m?.classList.contains('almost')||/fast richtig/i.test(m?.textContent||''))return'almost';return'wrong';}
function ratingFor(k){return k==='correct'?'good':k==='almost'?'hard':'again';}
function showStableFeedback(kind){let o=$('#stableFeedback');if(!o){o=document.createElement('div');o.id='stableFeedback';o.innerHTML='<div class="stable-feedback-card"><div class="stable-feedback-symbol"></div><div class="stable-feedback-label"></div></div>';document.body.appendChild(o);}o.className='stable-feedback '+kind+' show';o.querySelector('.stable-feedback-symbol').textContent=kind==='correct'?'✓':kind==='almost'?'○':'✕';o.querySelector('.stable-feedback-label').textContent=kind==='correct'?'Richtig':kind==='almost'?'Fast richtig':'Falsch';}
function hideStableFeedback(){const o=$('#stableFeedback');if(o)o.classList.remove('show');}
function handleVisibleResult(){
  if($('#resultPanel')?.classList.contains('hidden')||handledResultSerial===cardSerial)return;
  handledResultSerial=cardSerial;clearTimeout(advanceTimer);clearSubmitTimer();acceptingAnswer=false;userSpeechDetected=false;
  const serial=cardSerial,kind=resultKind();showStableFeedback(kind);setStatus('Mikrofon bleibt für die nächste Vokabel bereit.',recognitionRunning||recognitionStarting);
  if(kind!=='correct')setTimeout(()=>{if(serial===cardSerial)speakNow($('#solutionText')?.textContent||'',answerLang());},260);
  advanceTimer=setTimeout(()=>{if(serial!==cardSerial||$('#resultPanel')?.classList.contains('hidden'))return;hideStableFeedback();const btn=$(`.rating[data-rating="${ratingFor(kind)}"]`);if(btn)btn.click();},2400);
}
function startCardFlow(read=true){
  clearTimeout(advanceTimer);hideStableFeedback();submittedSerial=-1;handledResultSerial=-1;acceptingAnswer=!!prefs.autoMic;resetTranscript();
  if(!answerReady())return;const serial=cardSerial;
  if(prefs.autoMic){ensureRecognition(false);setStatus(listeningStatus(),true);}else setStatus('Mikrofon-Automatik ist aus.');
  if(read&&!muted())setTimeout(()=>{if(serial===cardSerial&&answerReady())speakNow($('#promptText')?.textContent?.trim()||'',promptLang());},20);
}
function installObservers(){
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{cardSerial++;startCardFlow(true);}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(panel.classList.contains('hidden'))return;setTimeout(handleVisibleResult,70);}).observe(panel,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){acceptingAnswer=false;cancelSpeech();clearTimeout(advanceTimer);clearSubmitTimer();stopRecognition(false);}else if(learnViewActive()){userStopped=false;if(prefs.autoMic)ensureRecognition(false);if(answerReady())setTimeout(()=>startCardFlow(true),120);}});
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{setTimeout(()=>{if(!learnViewActive()){acceptingAnswer=false;cancelSpeech();clearTimeout(advanceTimer);clearSubmitTimer();hideStableFeedback();stopRecognition(false);}else if(prefs.autoMic){userStopped=false;ensureRecognition(false);}},20);}));
}
function injectStyles(){if($('#stableVoiceStyles'))return;const s=document.createElement('style');s.id='stableVoiceStyles';s.textContent=`
  .manual-next{display:none!important}#feedbackOverlay{display:none!important}.stable-feedback{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(255,255,255,.12);opacity:0;transition:opacity .12s}.stable-feedback.show{opacity:1}.stable-feedback-card{width:min(78vw,360px);aspect-ratio:1/1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:9px solid currentColor;background:rgba(255,255,255,.96);box-shadow:0 22px 65px rgba(0,0,0,.22)}.stable-feedback-symbol{font-size:clamp(100px,31vw,190px);font-weight:900;line-height:.8}.stable-feedback-label{font-size:clamp(24px,7vw,38px);font-weight:900;margin-top:22px}.stable-feedback.correct{color:#2f8b58}.stable-feedback.almost{color:#d18412}.stable-feedback.wrong{color:#b63b3b}body.dark .stable-feedback-card{background:rgba(23,29,40,.97)}
`;document.head.appendChild(s);}
function install(){neutralizeOldVoiceAutomation();replaceControls();injectStyles();installObservers();cardSerial++;userStopped=false;if(prefs.autoMic)ensureRecognition(false);setTimeout(()=>startCardFlow(true),420);}
setTimeout(install,700);
})();
