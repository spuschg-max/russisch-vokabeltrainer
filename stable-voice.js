(() => {
'use strict';
const PREF_KEY='russischVokabeltrainer.stableVoice.v1';
const AUDIO_KEY='russischVokabeltrainer.audio.v1';
const $=s=>document.querySelector(s);
let prefs=loadPrefs();
let recognition=null;
let recognitionRunning=false;
let recognitionStarting=false;
let cardTranscript='';
let silenceTimer=null;
let restartTimer=null;
let advanceTimer=null;
let cardSerial=0;
let submittedSerial=-1;
let handledResultSerial=-1;
let speaking=false;
let acceptingAnswer=false;
let userStopped=false;

function loadPrefs(){try{return {autoMic:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function muted(){try{return !!JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}').muted}catch(e){return false}}
function learnViewActive(){return !!$('#view-learn')?.classList.contains('active');}
function answerReady(){return learnViewActive()&&!!$('#resultPanel')?.classList.contains('hidden');}
function answerLang(){return ($('#answerLabel')?.textContent||'').trim()==='Russisch'?'ru-RU':'de-DE';}
function promptLang(){return ($('#promptLabel')?.textContent||'').trim()==='Russisch'?'ru-RU':'de-DE';}
function setStatus(text,on=false){const s=$('#micStatus');if(!s)return;s.textContent=text||'';s.classList.toggle('listening',!!on);}
function setMicButton(active){const b=$('#micButton');if(!b)return;b.textContent=active?'●':'🎙';b.disabled=false;b.setAttribute('aria-pressed',active?'true':'false');}
function clearSpeechTimer(){clearTimeout(silenceTimer);silenceTimer=null;}
function cancelSpeech(){speaking=false;try{if('speechSynthesis'in window)speechSynthesis.cancel()}catch(e){}}
function speak(text,lang){return new Promise(resolve=>{if(!text||muted()||!('speechSynthesis'in window)){resolve();return}cancelSpeech();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.86:.94;speaking=true;let done=false;const finish=()=>{if(done)return;done=true;speaking=false;resolve()};u.onend=finish;u.onerror=finish;try{speechSynthesis.speak(u)}catch(e){finish()}setTimeout(finish,7000);});}
function updateToggle(){const b=$('#voiceQuickToggle');if(b){b.textContent=prefs.autoMic?'🎙 Mikrofon: AN':'🎙 Mikrofon: AUS';b.setAttribute('aria-pressed',prefs.autoMic?'true':'false')}const cb=$('#stableAutoMicSetting');if(cb)cb.checked=prefs.autoMic;}

function stopRecognition(permanent=false){
  clearSpeechTimer();clearTimeout(restartTimer);restartTimer=null;recognitionStarting=false;acceptingAnswer=false;
  if(permanent)userStopped=true;
  const r=recognition;recognition=null;recognitionRunning=false;
  if(r){try{r.abort()}catch(e){}}
  setMicButton(false);
}
function scheduleRecognitionRestart(delay=300){
  clearTimeout(restartTimer);
  if(!prefs.autoMic||userStopped||document.visibilityState==='hidden'||!learnViewActive())return;
  restartTimer=setTimeout(()=>ensureRecognition(false),delay);
}
function ensureRecognition(manual=false){
  if(!learnViewActive())return false;
  if(recognitionRunning||recognitionStarting){setMicButton(true);return true;}
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!C){setStatus('Spracherkennung wird von diesem Gerät nicht unterstützt.');return false;}
  clearTimeout(restartTimer);restartTimer=null;userStopped=false;recognitionStarting=true;
  const r=new C();recognition=r;r.lang=answerLang();r.interimResults=true;r.continuous=true;r.maxAlternatives=3;
  r.onstart=()=>{if(recognition!==r)return;recognitionStarting=false;recognitionRunning=true;setMicButton(true);if(acceptingAnswer)setStatus('Ich höre …',true);};
  r.onresult=e=>{
    if(recognition!==r||!acceptingAnswer||speaking||!answerReady()||submittedSerial===cardSerial)return;
    let changed=false;
    for(let i=e.resultIndex;i<e.results.length;i++){
      const piece=(e.results[i][0]?.transcript||'').trim();
      if(!piece)continue;
      cardTranscript=(cardTranscript+' '+piece).trim();changed=true;
      clearSpeechTimer();silenceTimer=setTimeout(()=>submitVoice(cardSerial),e.results[i].isFinal?420:1050);
    }
    if(changed){const input=$('#answerInput');if(input){input.value=cardTranscript;input.classList.add('voice-recognized');}setStatus('Ich höre …',true);}
  };
  r.onerror=e=>{
    if(recognition!==r)return;
    const code=e?.error||'';
    if(code==='not-allowed'||code==='service-not-allowed'){
      recognition=null;recognitionRunning=false;recognitionStarting=false;setMicButton(false);setStatus('Mikrofonzugriff ist nicht erlaubt. Bitte einmal auf das Mikrofon tippen.');return;
    }
    if(code==='aborted')return;
    if(code==='no-speech'){setStatus(acceptingAnswer?'Ich höre weiter …':'');return;}
    setStatus('Spracherkennung wurde kurz unterbrochen – ich verbinde neu …');
  };
  r.onend=()=>{
    if(recognition===r)recognition=null;
    recognitionRunning=false;recognitionStarting=false;setMicButton(false);
    if(prefs.autoMic&&!userStopped&&document.visibilityState!=='hidden'&&learnViewActive())scheduleRecognitionRestart(220);
  };
  try{r.start();return true}catch(e){recognition=null;recognitionRunning=false;recognitionStarting=false;setMicButton(false);if(manual)setStatus('Mikrofon konnte nicht gestartet werden.');else setStatus('Tippe einmal auf das Mikrofon, um den Sprachmodus zu starten.');return false;}
}
function setAutoMic(v){
  prefs.autoMic=!!v;savePrefs();updateToggle();
  if(!prefs.autoMic){stopRecognition(true);setStatus('Mikrofon-Automatik ausgeschaltet.');}
  else{userStopped=false;ensureRecognition(false);if(answerReady()&&!speaking){acceptingAnswer=true;setStatus('Ich höre …',true);}}
}

function neutralizeOldVoiceAutomation(){
  const mode=$('#trainingMode');if(mode){mode.value='manual';mode.dispatchEvent(new Event('change',{bubbles:true}));const l=mode.closest('label');if(l)l.style.display='none';}
  const delay=$('#advanceDelay');if(delay){const l=delay.closest('label');if(l)l.style.display='none';}
  const prompt=$('#speakPromptSetting');if(prompt){prompt.checked=false;prompt.dispatchEvent(new Event('change',{bubbles:true}));const l=prompt.closest('label');if(l)l.style.display='none';}
  const corr=$('#speakCorrectionSetting');if(corr){corr.checked=false;corr.dispatchEvent(new Event('change',{bubbles:true}));const l=corr.closest('label');if(l)l.style.display='none';}
  const panel=$('#voiceSettingsPanel');if(panel){const p=panel.querySelector('p');if(p)p.textContent='Der Sprachmodus hält das Mikrofon während der Lernrunde möglichst dauerhaft aktiv. Während die App selbst spricht, wird die Erkennung kurz ignoriert und danach sofort wieder für deine Antwort freigegeben.';if(!$('#stableAutoMicSetting')){const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="stableAutoMicSetting" type="checkbox"> Mikrofon während der Lernrunde automatisch aktiv halten';const note=panel.querySelector('.voice-note');if(note)note.insertAdjacentElement('beforebegin',label);else panel.appendChild(label);label.querySelector('input').addEventListener('change',e=>setAutoMic(e.target.checked));}}
}
function replaceControls(){
  const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.stableVoice){const mic=oldMic.cloneNode(true);mic.dataset.stableVoice='2';oldMic.replaceWith(mic);mic.addEventListener('click',()=>{if(!prefs.autoMic)setAutoMic(true);userStopped=false;if(recognitionRunning){acceptingAnswer=answerReady()&&!speaking;setStatus(acceptingAnswer?'Ich höre …':'Mikrofon ist bereit.',acceptingAnswer);}else ensureRecognition(true);});}
  const oldToggle=$('#voiceQuickToggle');if(oldToggle&&!oldToggle.dataset.stableVoice){const b=oldToggle.cloneNode(true);b.dataset.stableVoice='2';oldToggle.replaceWith(b);b.addEventListener('click',()=>setAutoMic(!prefs.autoMic));}
  updateToggle();
}
function submitVoice(serial){
  clearSpeechTimer();if(serial!==cardSerial||submittedSerial===serial||!answerReady())return;const value=($('#answerInput')?.value||cardTranscript||'').trim();if(!value)return;
  submittedSerial=serial;acceptingAnswer=false;setStatus('Antwort erkannt – wird geprüft …');
  setTimeout(()=>{if(serial!==cardSerial)return;if($('#resultPanel')?.classList.contains('hidden'))$('#checkAnswer')?.click();},90);
}
function resultKind(){const m=$('#resultMark');if(m?.classList.contains('correct'))return'correct';if(m?.classList.contains('almost')||/fast richtig/i.test(m?.textContent||''))return'almost';return'wrong';}
function ratingFor(k){return k==='correct'?'good':k==='almost'?'hard':'again';}
function showStableFeedback(kind){let o=$('#stableFeedback');if(!o){o=document.createElement('div');o.id='stableFeedback';o.innerHTML='<div class="stable-feedback-card"><div class="stable-feedback-symbol"></div><div class="stable-feedback-label"></div></div>';document.body.appendChild(o);}o.className='stable-feedback '+kind+' show';o.querySelector('.stable-feedback-symbol').textContent=kind==='correct'?'✓':kind==='almost'?'○':'✕';o.querySelector('.stable-feedback-label').textContent=kind==='correct'?'Richtig':kind==='almost'?'Fast richtig':'Falsch';}
function hideStableFeedback(){const o=$('#stableFeedback');if(o)o.classList.remove('show');}
async function handleVisibleResult(){
  if($('#resultPanel')?.classList.contains('hidden')||handledResultSerial===cardSerial)return;
  handledResultSerial=cardSerial;clearTimeout(advanceTimer);acceptingAnswer=false;const serial=cardSerial,kind=resultKind();showStableFeedback(kind);setStatus('Mikrofon bleibt für die nächste Vokabel bereit.',recognitionRunning);
  if(kind!=='correct'){await new Promise(r=>setTimeout(r,300));if(serial===cardSerial)await speak($('#solutionText')?.textContent||'',answerLang());}
  advanceTimer=setTimeout(()=>{if(serial!==cardSerial||$('#resultPanel')?.classList.contains('hidden'))return;hideStableFeedback();const btn=$(`.rating[data-rating="${ratingFor(kind)}"]`);if(btn)btn.click();},2300);
}
async function startCardFlow(read=true){
  clearTimeout(advanceTimer);hideStableFeedback();clearSpeechTimer();submittedSerial=-1;handledResultSerial=-1;cardTranscript='';acceptingAnswer=false;
  const input=$('#answerInput');if(input){input.classList.remove('voice-recognized');input.value='';}
  if(!answerReady())return;const serial=cardSerial;
  if(prefs.autoMic&&!recognitionRunning&&!recognitionStarting)ensureRecognition(false);
  if(read){setStatus(muted()?'Mikrofon ist bereit.':'Vokabel wird vorgelesen …',recognitionRunning);await speak($('#promptText')?.textContent?.trim()||'',promptLang());if(serial!==cardSerial)return;await new Promise(r=>setTimeout(r,260));}
  if(prefs.autoMic){if(!recognitionRunning&&!recognitionStarting)ensureRecognition(false);acceptingAnswer=true;setStatus('Ich höre …',true);}else setStatus('Mikrofon-Automatik ist aus.');
}
function installObservers(){
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{cardSerial++;setTimeout(()=>startCardFlow(true),180);}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(panel.classList.contains('hidden'))return;setTimeout(handleVisibleResult,90);}).observe(panel,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){acceptingAnswer=false;cancelSpeech();clearTimeout(advanceTimer);stopRecognition(false);}else if(learnViewActive()){userStopped=false;ensureRecognition(false);if(answerReady())setTimeout(()=>startCardFlow(true),350);}});
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{setTimeout(()=>{if(!learnViewActive()){acceptingAnswer=false;cancelSpeech();clearTimeout(advanceTimer);hideStableFeedback();stopRecognition(false);}else if(prefs.autoMic){userStopped=false;ensureRecognition(false);}},20);}));
}
function injectStyles(){if($('#stableVoiceStyles'))return;const s=document.createElement('style');s.id='stableVoiceStyles';s.textContent=`
  .manual-next{display:none!important}#feedbackOverlay{display:none!important}.stable-feedback{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(255,255,255,.12);opacity:0;transition:opacity .12s}.stable-feedback.show{opacity:1}.stable-feedback-card{width:min(78vw,360px);aspect-ratio:1/1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:9px solid currentColor;background:rgba(255,255,255,.96);box-shadow:0 22px 65px rgba(0,0,0,.22)}.stable-feedback-symbol{font-size:clamp(100px,31vw,190px);font-weight:900;line-height:.8}.stable-feedback-label{font-size:clamp(24px,7vw,38px);font-weight:900;margin-top:22px}.stable-feedback.correct{color:#2f8b58}.stable-feedback.almost{color:#d18412}.stable-feedback.wrong{color:#b63b3b}body.dark .stable-feedback-card{background:rgba(23,29,40,.97)}
`;document.head.appendChild(s);}
function install(){neutralizeOldVoiceAutomation();replaceControls();injectStyles();installObservers();cardSerial++;userStopped=false;if(prefs.autoMic)ensureRecognition(false);setTimeout(()=>startCardFlow(true),650);}
setTimeout(install,850);
})();
