(() => {
'use strict';
const PREF_KEY='russischVokabeltrainer.stableVoice.v2';
const AUDIO_KEY='russischVokabeltrainer.audio.v1';
const $=s=>document.querySelector(s);
let prefs=loadPrefs();
let recognition=null;
let recognitionCard=-1;
let cardSerial=0;
let restartTimer=null;
let submitTimer=null;
let advanceTimer=null;
let speechFallbackTimer=null;
let ownSpeech=false;
let userTyping=false;
let manualStop=false;

function loadPrefs(){
  try{return {autoMic:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true}}
}
function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch(e){}}
function muted(){try{return !!JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}').muted}catch(e){return false}}
function learnActive(){return !!$('#view-learn')?.classList.contains('active')}
function answerReady(){return learnActive()&&!!$('#resultPanel')?.classList.contains('hidden')}
function answerLang(){return /russisch/i.test($('#answerLabel')?.textContent||'')?'ru-RU':'de-DE'}
function promptLang(){return /russisch/i.test($('#promptLabel')?.textContent||'')?'ru-RU':'de-DE'}
function answerLanguageName(){return answerLang()==='ru-RU'?'Russisch':'Deutsch'}
function setStatus(text,on=false){const s=$('#micStatus');if(!s)return;s.textContent=text||'';s.classList.toggle('listening',!!on)}
function setMicButton(on){const b=$('#micButton');if(!b)return;b.textContent=on?'●':'🎙';b.disabled=false;b.setAttribute('aria-pressed',on?'true':'false')}
function enableAnswerControls(){const i=$('#answerInput'),b=$('#checkAnswer');if(i){i.disabled=false;i.style.pointerEvents='auto'}if(b){b.disabled=false;b.style.pointerEvents='auto'}}
function clearTimers(){clearTimeout(restartTimer);clearTimeout(submitTimer);clearTimeout(speechFallbackTimer);restartTimer=submitTimer=speechFallbackTimer=null}
function updateToggle(){const b=$('#voiceQuickToggle');if(b){b.textContent=prefs.autoMic?'🎙 Mikrofon: AN':'🎙 Mikrofon: AUS';b.setAttribute('aria-pressed',prefs.autoMic?'true':'false')}const cb=$('#stableAutoMicSetting');if(cb)cb.checked=prefs.autoMic}

function stopRecognition(permanent=false){
  clearTimeout(restartTimer);restartTimer=null;
  if(permanent)manualStop=true;
  const r=recognition;recognition=null;recognitionCard=-1;setMicButton(false);
  if(r){try{r.onend=null;r.onerror=null;r.abort()}catch(e){}}
}
function scheduleFreshRecognition(serial,delay=420){
  clearTimeout(restartTimer);
  if(!prefs.autoMic||manualStop||ownSpeech||userTyping||serial!==cardSerial||!answerReady()||document.visibilityState==='hidden')return;
  restartTimer=setTimeout(()=>startRecognition(serial,false),delay);
}
function cleanTranscript(text){return String(text||'').replace(/\s+/g,' ').trim()}
function startRecognition(serial,manual=false){
  if(serial!==cardSerial||!answerReady()||!learnActive())return false;
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!C){setStatus('Spracherkennung wird von diesem Gerät nicht unterstützt.');return false}
  manualStop=false;userTyping=false;stopRecognition(false);
  const r=new C();recognition=r;recognitionCard=serial;
  r.lang=answerLang();r.interimResults=true;r.continuous=false;r.maxAlternatives=3;
  let transcript='';let gotFinal=false;
  r.onstart=()=>{if(recognition!==r||serial!==cardSerial)return;setMicButton(true);setStatus(`Ich höre ${answerLanguageName()} …`,true)};
  r.onresult=e=>{
    if(recognition!==r||serial!==cardSerial||!answerReady()||ownSpeech)return;
    let latest='';let final=false;
    for(let i=0;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(t)latest+=(latest?' ':'')+t;if(e.results[i].isFinal)final=true}
    latest=cleanTranscript(latest);if(!latest)return;transcript=latest;
    const input=$('#answerInput');if(input&&!userTyping){input.value=latest;input.classList.add('voice-recognized')}
    if(final){
      gotFinal=true;setStatus('Antwort erkannt – wird geprüft …');
      clearTimeout(submitTimer);submitTimer=setTimeout(()=>{
        if(serial!==cardSerial||!answerReady())return;
        stopRecognition(false);$('#checkAnswer')?.click();
      },520);
    }
  };
  r.onerror=e=>{
    if(recognition!==r)return;
    const code=e?.error||'';
    if(code==='not-allowed'||code==='service-not-allowed'){
      recognition=null;recognitionCard=-1;setMicButton(false);setStatus('Mikrofonzugriff ist nicht erlaubt. Bitte einmal auf das Mikrofon tippen.');return;
    }
    if(code==='aborted')return;
    recognition=null;recognitionCard=-1;setMicButton(false);
    if(serial===cardSerial&&answerReady()&&!gotFinal&&!transcript&&!userTyping)scheduleFreshRecognition(serial,650);
  };
  r.onend=()=>{
    if(recognition!==r)return;
    recognition=null;recognitionCard=-1;setMicButton(false);
    if(serial!==cardSerial||!answerReady()||gotFinal||transcript||userTyping||ownSpeech)return;
    scheduleFreshRecognition(serial,650);
  };
  try{r.start();return true}catch(e){recognition=null;recognitionCard=-1;setMicButton(false);if(manual)setStatus('Mikrofon konnte nicht gestartet werden.');else scheduleFreshRecognition(serial,700);return false}
}

function finishOwnSpeech(serial){
  ownSpeech=false;window.__rvtAppSpeaking=false;clearTimeout(speechFallbackTimer);speechFallbackTimer=null;
  if(serial!==cardSerial||!answerReady())return;
  enableAnswerControls();scheduleFreshRecognition(serial,320);
}
function speakPromptForCard(serial){
  if(serial!==cardSerial||!answerReady())return;
  const text=$('#promptText')?.textContent?.trim()||'';
  if(!text||muted()||!('speechSynthesis'in window)){scheduleFreshRecognition(serial,180);return}
  stopRecognition(false);ownSpeech=true;window.__rvtAppSpeaking=true;
  try{speechSynthesis.cancel()}catch(e){}
  const u=new SpeechSynthesisUtterance(text);u.lang=promptLang();u.rate=u.lang.startsWith('ru')?.72:.86;u.pitch=1;
  let done=false;const finish=()=>{if(done)return;done=true;finishOwnSpeech(serial)};
  u.onend=finish;u.onerror=finish;
  try{speechSynthesis.speak(u);speechFallbackTimer=setTimeout(finish,6000)}catch(e){finish()}
}
function startCard(read=true){
  clearTimeout(advanceTimer);clearTimeout(submitTimer);submitTimer=null;clearTimeout(speechFallbackTimer);speechFallbackTimer=null;
  try{speechSynthesis.cancel()}catch(e){}
  ownSpeech=false;window.__rvtAppSpeaking=false;userTyping=false;manualStop=false;stopRecognition(false);enableAnswerControls();
  const input=$('#answerInput');if(input){input.classList.remove('voice-recognized');input.dataset.voiceRaw=''}
  if(!answerReady())return;const serial=cardSerial;
  if(read)setTimeout(()=>{if(serial===cardSerial&&answerReady())speakPromptForCard(serial)},120);else scheduleFreshRecognition(serial,180);
}

function resultKind(){const m=$('#resultMark');if(m?.classList.contains('correct'))return'correct';if(m?.classList.contains('almost')||/fast richtig/i.test(m?.textContent||''))return'almost';return'wrong'}
function ratingFor(k){return k==='correct'?'good':k==='almost'?'hard':'again'}
function showFeedback(kind){let o=$('#stableFeedback');if(!o){o=document.createElement('div');o.id='stableFeedback';o.innerHTML='<div class="stable-feedback-card"><div class="stable-feedback-symbol"></div><div class="stable-feedback-label"></div></div>';document.body.appendChild(o)}o.className='stable-feedback '+kind+' show';o.querySelector('.stable-feedback-symbol').textContent=kind==='correct'?'✓':kind==='almost'?'○':'✕';o.querySelector('.stable-feedback-label').textContent=kind==='correct'?'Richtig':kind==='almost'?'Fast richtig':'Falsch'}
function hideFeedback(){const o=$('#stableFeedback');if(o)o.classList.remove('show')}
function handleResult(){
  if($('#resultPanel')?.classList.contains('hidden'))return;
  stopRecognition(false);clearTimeout(submitTimer);submitTimer=null;
  const serial=cardSerial,kind=resultKind();showFeedback(kind);setStatus('');
  clearTimeout(advanceTimer);advanceTimer=setTimeout(()=>{
    if(serial!==cardSerial||$('#resultPanel')?.classList.contains('hidden'))return;
    hideFeedback();const b=$(`.rating[data-rating="${ratingFor(kind)}"]`);if(b)b.click();
  },2200);
}

function neutralizeCompetingAutoplay(){
  const auto=$('#settingAutoplay');if(auto&&auto.checked){auto.checked=false;auto.dispatchEvent(new Event('change',{bubbles:true}))}
  const mode=$('#trainingMode');if(mode){mode.value='manual';mode.dispatchEvent(new Event('change',{bubbles:true}));const l=mode.closest('label');if(l)l.style.display='none'}
  for(const id of ['advanceDelay','speakPromptSetting','speakCorrectionSetting']){const el=$('#'+id);if(!el)continue;if(el.type==='checkbox'&&el.checked){el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}))}const l=el.closest('label');if(l)l.style.display='none'}
  const panel=$('#voiceSettingsPanel');if(panel){if(!$('#stableAutoMicSetting')){const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="stableAutoMicSetting" type="checkbox"> Mikrofon bei jeder neuen Vokabel automatisch starten';panel.appendChild(label);label.querySelector('input').addEventListener('change',e=>setAutoMic(e.target.checked))}const p=panel.querySelector('p');if(p)p.textContent='Auf dem iPhone wird für jede neue Vokabel eine frische Spracherkennung gestartet. Dadurch bleibt keine alte Mikrofonsitzung zwischen zwei Karten hängen.'}
}
function setAutoMic(v){prefs.autoMic=!!v;savePrefs();manualStop=!prefs.autoMic;updateToggle();if(!prefs.autoMic){stopRecognition(true);setStatus('Mikrofon-Automatik ausgeschaltet.')}else{manualStop=false;userTyping=false;scheduleFreshRecognition(cardSerial,120)}}
function replaceControls(){
  const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.voiceControllerV2){const b=oldMic.cloneNode(true);b.dataset.voiceControllerV2='1';oldMic.replaceWith(b);b.addEventListener('click',()=>{if(!prefs.autoMic){setAutoMic(true);return}manualStop=false;userTyping=false;startRecognition(cardSerial,true)})}
  const oldToggle=$('#voiceQuickToggle');if(oldToggle&&!oldToggle.dataset.voiceControllerV2){const b=oldToggle.cloneNode(true);b.dataset.voiceControllerV2='1';oldToggle.replaceWith(b);b.addEventListener('click',()=>setAutoMic(!prefs.autoMic))}
  updateToggle();
}
function installInputProtection(){
  const input=$('#answerInput');if(input&&!input.dataset.voiceControllerV2){input.dataset.voiceControllerV2='1';input.addEventListener('keydown',()=>{userTyping=true;stopRecognition(false);enableAnswerControls()});input.addEventListener('input',e=>{if(e.isTrusted){userTyping=true;stopRecognition(false);enableAnswerControls()}})}
  const check=$('#checkAnswer');if(check&&!check.dataset.voiceControllerV2){check.dataset.voiceControllerV2='1';check.addEventListener('click',()=>stopRecognition(false),true)}
}
function installObservers(){
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{cardSerial++;hideFeedback();startCard(true)}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(!panel.classList.contains('hidden'))setTimeout(handleResult,40)}).observe(panel,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){stopRecognition(false);try{speechSynthesis.cancel()}catch(e){}}else if(learnActive()&&answerReady()){cardSerial++;startCard(true)}});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#speakPrompt')){stopRecognition(false);const serial=cardSerial;setTimeout(()=>{const resume=()=>{if(serial!==cardSerial||!answerReady())return;if('speechSynthesis'in window&&speechSynthesis.speaking){setTimeout(resume,180);return}scheduleFreshRecognition(serial,180)};resume()},220)}},true);
}
function injectStyles(){if($('#stableVoiceStyles'))return;const s=document.createElement('style');s.id='stableVoiceStyles';s.textContent='.manual-next{display:none!important}#feedbackOverlay{display:none!important}.stable-feedback{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(255,255,255,.10);opacity:0;transition:opacity .12s}.stable-feedback.show{opacity:1}.stable-feedback-card{width:min(70vw,330px);aspect-ratio:1/1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:8px solid currentColor;background:rgba(255,255,255,.96);box-shadow:0 18px 55px rgba(0,0,0,.18)}.stable-feedback-symbol{font-size:clamp(90px,28vw,170px);font-weight:900;line-height:.8}.stable-feedback-label{font-size:clamp(22px,6vw,34px);font-weight:900;margin-top:18px}.stable-feedback.correct{color:#2f8b58}.stable-feedback.almost{color:#d18412}.stable-feedback.wrong{color:#b63b3b}body.dark .stable-feedback-card{background:rgba(23,29,40,.97)';document.head.appendChild(s)}
function install(){neutralizeCompetingAutoplay();replaceControls();installInputProtection();injectStyles();installObservers();cardSerial++;startCard(true)}
setTimeout(install,650);
})();