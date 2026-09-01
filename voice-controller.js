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
let cardSerial=0;
let submittedSerial=-1;
let handledResultSerial=-1;
let acceptingAnswer=false;
let userStopped=false;
let speechDetected=false;
let suppressUntil=0;
let sessionResultCount=0;
let utteranceStart=0;
let resultSegments=new Map();
let cardTranscript='';
let ownSpeech=false;
let speechStartedAt=0;
let shortSoundStartedAt=0;
let startupVoiceGuard=true;
let uncertainRetryUsed=false;

function loadPrefs(){try{return {autoMic:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function muted(){try{return !!JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}').muted}catch(e){return false}}
function learnActive(){return !!$('#view-learn')?.classList.contains('active');}
function answerReady(){return learnActive()&&!!$('#resultPanel')?.classList.contains('hidden');}
function answerLang(){return /russisch/i.test($('#answerLabel')?.textContent||'')?'ru-RU':'de-DE';}
function promptLang(){return /russisch/i.test($('#promptLabel')?.textContent||'')?'ru-RU':'de-DE';}
function answerLanguageName(){return answerLang()==='ru-RU'?'Russisch':'Deutsch';}
function statusListening(){return `Ich höre ${answerLanguageName()} …`;}
function setStatus(text,on=false){const s=$('#micStatus');if(!s)return;s.textContent=text||'';s.classList.toggle('listening',!!on);}
function setMicButton(on){const b=$('#micButton');if(!b)return;b.textContent=on?'●':'🎙';b.disabled=false;b.setAttribute('aria-pressed',on?'true':'false');}
function clearSubmit(){clearTimeout(submitTimer);submitTimer=null;}
function normWord(w){return String(w||'').toLocaleLowerCase().replace(/^[\s.,!?;:„“"'()\[\]{}…-]+|[\s.,!?;:„“"'()\[\]{}…-]+$/g,'');}
function russianCore(s){const text=String(s||'').trim();const m=text.match(/^(.+?)\s*\+\s*(?:Dat\.?|Dativ|Akk\.?|Akkusativ|Gen\.?|Genitiv|Instr\.?|Instrumental|Präp\.?|Praep\.?|Präpositiv|Praepositiv|Lok\.?|Lokativ)\b/i);return (m?m[1]:text).trim();}
function singleRussianTarget(){
  if(answerLang()!=='ru-RU')return'';
  try{
    const list=window.__rvtSpeechCandidates?.russian?.()||[];
    const singles=[...new Set(list.map(russianCore).filter(x=>/^[а-яё]$/i.test(x)))];
    return singles.length===1?singles[0]:'';
  }catch(e){return'';}
}
function assessRussian(text){try{return window.__rvtSpeechCandidates?.assessRussian?.(text)||null}catch(e){return null}}
function cleanTranscript(text){
  let words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  if(!words.length)return'';
  const filler=new Set(['äh','ähm','öhm','hm','hmm','mhm','uh','uhm','um','huh']);
  while(words.length>1&&filler.has(normWord(words[0])))words.shift();
  if(words.length>=3){
    const first=normWord(words[0]),a=normWord(words[1]),b=normWord(words[2]);
    if(first&&/^([a-zäöüß]{1,3})\1$/i.test(first)&&a&&a===b)words.shift();
  }
  const out=[];
  for(const word of words){const n=normWord(word);if(!n)continue;if(out.length&&normWord(out[out.length-1])===n)continue;out.push(word);}
  if(out.length>=2&&out.length%2===0){
    const half=out.length/2;let same=true;
    for(let i=0;i<half;i++){if(normWord(out[i])!==normWord(out[i+half])){same=false;break;}}
    if(same)out.splice(half);
  }
  return out.join(' ').replace(/\s+/g,' ').trim();
}
function resetAnswerCapture(clearInput=true){
  clearSubmit();speechDetected=false;speechStartedAt=0;shortSoundStartedAt=0;utteranceStart=sessionResultCount;resultSegments.clear();cardTranscript='';
  if(clearInput){const input=$('#answerInput');if(input){input.value='';input.classList.remove('voice-recognized');}}
}
function composeTranscript(){
  const text=[...resultSegments.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v).filter(Boolean).join(' ');
  return cleanTranscript(text);
}
function appSpeaking(){return ownSpeech||!!window.__rvtAppSpeaking;}
function fillSingleRussianFallback(){
  if(cardTranscript.trim()||submittedSerial===cardSerial||!answerReady()||appSpeaking())return false;
  const target=singleRussianTarget();if(!target)return false;
  const start=speechStartedAt||shortSoundStartedAt;if(!start)return false;
  const duration=Date.now()-start;if(duration<35||duration>1100)return false;
  speechDetected=true;cardTranscript=target;
  const input=$('#answerInput');if(input){input.value=target;input.classList.add('voice-recognized');input.dataset.voiceRaw='[kurzer Laut ohne Transkript]';}
  setStatus(`Kurzes russisches Wort „${target}“ erkannt …`,true);return true;
}

function markSpeechStart(){ownSpeech=true;window.__rvtAppSpeaking=true;clearSubmit();speechDetected=false;resultSegments.clear();cardTranscript='';}
function markSpeechEnd(){ownSpeech=false;window.__rvtAppSpeaking=false;suppressUntil=Date.now()+380;resetAnswerCapture(true);if(answerReady()&&prefs.autoMic)setStatus(statusListening(),recognitionRunning||recognitionStarting);}
function pickVoice(lang){if(!('speechSynthesis'in window))return null;const voices=speechSynthesis.getVoices?.()||[];const exact=String(lang).toLowerCase(),base=exact.slice(0,2);return voices.find(v=>String(v.lang||'').toLowerCase()===exact)||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base))||null;}
function speak(text,lang){
  if(!text||muted()||!('speechSynthesis'in window))return false;
  const spoken=lang.startsWith('ru')?russianCore(text):String(text||'');
  const u=new SpeechSynthesisUtterance(spoken);u.lang=lang;u.rate=lang.startsWith('ru')?.68:.82;u.pitch=1;const voice=pickVoice(lang);if(voice)u.voice=voice;
  let started=false,finished=false;
  const finish=()=>{if(finished)return;finished=true;if(started)markSpeechEnd();};
  u.onstart=()=>{started=true;markSpeechStart();};u.onend=finish;u.onerror=finish;
  try{speechSynthesis.speak(u);return true}catch(e){finish();return false;}
}

function updateToggle(){const b=$('#voiceQuickToggle');if(b){b.textContent=prefs.autoMic?'🎙 Mikrofon: AN':'🎙 Mikrofon: AUS';b.setAttribute('aria-pressed',prefs.autoMic?'true':'false')}const cb=$('#stableAutoMicSetting');if(cb)cb.checked=prefs.autoMic;}
function stopRecognition(permanent=false){
  clearSubmit();clearTimeout(restartTimer);restartTimer=null;recognitionStarting=false;acceptingAnswer=false;
  if(permanent)userStopped=true;
  const r=recognition;recognition=null;recognitionRunning=false;recognitionLang='';sessionResultCount=0;utteranceStart=0;resultSegments.clear();speechDetected=false;speechStartedAt=0;shortSoundStartedAt=0;
  if(r){try{r.abort()}catch(e){}}
  setMicButton(false);
}
function scheduleRestart(delay=260){
  clearTimeout(restartTimer);if(!prefs.autoMic||userStopped||document.visibilityState==='hidden'||!learnActive())return;
  restartTimer=setTimeout(()=>ensureRecognition(false),delay);
}
function scheduleSubmit(delay=1300){
  clearSubmit();if(!speechDetected||!cardTranscript.trim()||submittedSerial===cardSerial||!answerReady())return;
  submitTimer=setTimeout(()=>submitVoice(cardSerial),delay);
}
function beginUserSpeech(startIndex){
  if(!acceptingAnswer||appSpeaking()||Date.now()<suppressUntil||!answerReady()||submittedSerial===cardSerial)return false;
  clearSubmit();
  if(!speechDetected){speechDetected=true;speechStartedAt=Date.now();utteranceStart=Math.max(0,startIndex);resultSegments.clear();cardTranscript='';}
  setStatus(statusListening(),true);return true;
}
function ensureRecognition(manual=false){
  if(!learnActive())return false;const target=answerLang();
  if((recognitionRunning||recognitionStarting)&&recognitionLang===target){setMicButton(true);return true;}
  if(recognitionRunning||recognitionStarting){const old=recognition;recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';sessionResultCount=0;utteranceStart=0;resultSegments.clear();speechDetected=false;speechStartedAt=0;shortSoundStartedAt=0;if(old){try{old.abort()}catch(e){}}}
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){setStatus('Spracherkennung wird von diesem Gerät nicht unterstützt.');return false;}
  clearTimeout(restartTimer);restartTimer=null;userStopped=false;recognitionStarting=true;recognitionLang=target;sessionResultCount=0;utteranceStart=0;resultSegments.clear();speechDetected=false;speechStartedAt=0;shortSoundStartedAt=0;
  const r=new C();recognition=r;r.lang=target;r.interimResults=true;r.continuous=true;r.maxAlternatives=5;
  r.onstart=()=>{if(recognition!==r)return;recognitionStarting=false;recognitionRunning=true;setMicButton(true);if(acceptingAnswer)setStatus(statusListening(),true);};
  r.onsoundstart=()=>{if(recognition!==r||!acceptingAnswer||appSpeaking()||Date.now()<suppressUntil||!singleRussianTarget())return;shortSoundStartedAt=Date.now();};
  r.onsoundend=()=>{if(recognition!==r||!shortSoundStartedAt||cardTranscript.trim()||submittedSerial===cardSerial||!answerReady())return;setTimeout(()=>{if(recognition===r&&!cardTranscript.trim()&&submittedSerial!==cardSerial&&fillSingleRussianFallback())scheduleSubmit(260);},220);};
  r.onspeechstart=()=>{if(recognition!==r)return;beginUserSpeech(sessionResultCount);};
  r.onresult=e=>{
    if(recognition!==r)return;
    const previousCount=sessionResultCount;sessionResultCount=e.results.length;
    if(!speechDetected){if(!beginUserSpeech(Math.min(e.resultIndex,previousCount)))return;}
    if(!acceptingAnswer||appSpeaking()||Date.now()<suppressUntil||!answerReady()||submittedSerial===cardSerial)return;
    let hasText=false,hasFinal=false;
    const start=Math.max(0,utteranceStart);
    for(let i=start;i<e.results.length;i++){
      const piece=(e.results[i][0]?.transcript||'').trim();
      if(!piece)continue;resultSegments.set(i,piece);hasText=true;if(e.results[i].isFinal)hasFinal=true;
    }
    if(!hasText)return;
    cardTranscript=composeTranscript();
    setStatus(statusListening(),true);
    if(hasFinal){
      const input=$('#answerInput');let shown=cardTranscript;
      if(answerLang()==='ru-RU'){
        const a=assessRussian(cardTranscript);if(a?.accepted&&a.match?.target){if(input)input.dataset.voiceRaw=cardTranscript;shown=a.match.target;cardTranscript=shown;}
      }
      if(input&&shown){input.value=shown;input.classList.add('voice-recognized');}
      scheduleSubmit(1700);
    }else clearSubmit();
  };
  r.onspeechend=()=>{if(recognition!==r||submittedSerial===cardSerial||!answerReady())return;if(cardTranscript.trim())scheduleSubmit(1300);else if(fillSingleRussianFallback())scheduleSubmit(260);};
  r.onerror=e=>{
    if(recognition!==r)return;const code=e?.error||'';
    if(code==='not-allowed'||code==='service-not-allowed'){recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';setMicButton(false);setStatus('Mikrofonzugriff ist nicht erlaubt. Bitte einmal auf das Mikrofon tippen.');return;}
    if(code==='aborted')return;
    if(code==='no-speech'){
      if(cardTranscript.trim()){scheduleSubmit(700);return;}
      if(fillSingleRussianFallback()){scheduleSubmit(260);return;}
      resetAnswerCapture(true);setStatus(answerReady()&&prefs.autoMic?statusListening():'',answerReady()&&prefs.autoMic);return;
    }
    setStatus('Spracherkennung wurde kurz unterbrochen – ich verbinde neu …');
  };
  r.onend=()=>{
    if(recognition!==r)return;
    if(!cardTranscript.trim())fillSingleRussianFallback();
    const pending=speechDetected&&!!cardTranscript.trim()&&submittedSerial!==cardSerial&&answerReady();
    recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';setMicButton(false);
    if(pending){scheduleSubmit(420);return;}
    resetAnswerCapture(false);sessionResultCount=0;utteranceStart=0;
    if(prefs.autoMic&&!userStopped&&document.visibilityState!=='hidden'&&learnActive())scheduleRestart(240);
  };
  try{r.start();return true}catch(e){recognition=null;recognitionRunning=false;recognitionStarting=false;recognitionLang='';setMicButton(false);if(manual)setStatus('Mikrofon konnte nicht gestartet werden.');else setStatus('Tippe einmal auf das Mikrofon, um den Sprachmodus zu starten.');return false;}
}
function setAutoMic(v){prefs.autoMic=!!v;savePrefs();updateToggle();if(!prefs.autoMic){stopRecognition(true);setStatus('Mikrofon-Automatik ausgeschaltet.');}else{userStopped=false;acceptingAnswer=answerReady();ensureRecognition(false);if(answerReady())setStatus(statusListening(),true);}}

function neutralizeLegacy(){
  const mode=$('#trainingMode');if(mode){mode.value='manual';mode.dispatchEvent(new Event('change',{bubbles:true}));const l=mode.closest('label');if(l)l.style.display='none';}
  for(const id of ['advanceDelay','speakPromptSetting','speakCorrectionSetting']){const el=$('#'+id);if(el){if(el.type==='checkbox'){el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));}const l=el.closest('label');if(l)l.style.display='none';}}
  const panel=$('#voiceSettingsPanel');if(panel){const p=panel.querySelector('p');if(p)p.textContent='Keine Denkzeitbegrenzung: Die App wartet beliebig lange auf deine Antwort. Erkannte Zwischenwörter werden korrigiert statt angehängt; offensichtliche Doppelungen werden vor der Bewertung entfernt.';if(!$('#stableAutoMicSetting')){const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="stableAutoMicSetting" type="checkbox"> Mikrofon während der Lernrunde automatisch aktiv halten';panel.appendChild(label);label.querySelector('input').addEventListener('change',e=>setAutoMic(e.target.checked));}}
}
function replaceControls(){
  const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.voiceController){const mic=oldMic.cloneNode(true);mic.dataset.voiceController='1';oldMic.replaceWith(mic);mic.addEventListener('click',()=>{if(!prefs.autoMic)setAutoMic(true);userStopped=false;acceptingAnswer=answerReady();if(recognitionRunning&&recognitionLang===answerLang())setStatus(statusListening(),true);else ensureRecognition(true);});}
  const oldToggle=$('#voiceQuickToggle');if(oldToggle&&!oldToggle.dataset.voiceController){const b=oldToggle.cloneNode(true);b.dataset.voiceController='1';oldToggle.replaceWith(b);b.addEventListener('click',()=>setAutoMic(!prefs.autoMic));}
  updateToggle();
}
function submitVoice(serial){
  clearSubmit();if(serial!==cardSerial||submittedSerial===serial||!answerReady()||!speechDetected)return;
  const input=$('#answerInput');const cleaned=cleanTranscript(input?.value||cardTranscript);if(!cleaned)return;
  if(answerLang()==='ru-RU'&&!/[а-яё]/i.test(cleaned)){
    resetAnswerCapture(true);acceptingAnswer=true;setStatus('Russisch nicht sicher erkannt – ich höre weiter …',true);return;
  }
  if(answerLang()==='ru-RU'){
    const a=assessRussian(cleaned);
    if(a?.accepted&&a.match?.target){cardTranscript=a.match.target;if(input){input.dataset.voiceRaw=input.dataset.voiceRaw||cleaned;input.value=cardTranscript;input.classList.add('voice-recognized');}}
    else if(a?.grossMismatch&&!uncertainRetryUsed){uncertainRetryUsed=true;resetAnswerCapture(true);acceptingAnswer=true;setStatus('Spracherkennung unsicher – bitte noch einmal sprechen.',true);return;}
  }
  cardTranscript=cardTranscript||cleaned;if(input){input.value=cardTranscript;input.classList.add('voice-recognized');}
  submittedSerial=serial;acceptingAnswer=false;speechDetected=false;setStatus('Antwort erkannt – wird geprüft …');
  setTimeout(()=>{if(serial===cardSerial&&$('#resultPanel')?.classList.contains('hidden'))$('#checkAnswer')?.click();},100);
}
function resultKind(){const m=$('#resultMark');if(m?.classList.contains('correct'))return'correct';if(m?.classList.contains('almost')||/fast richtig/i.test(m?.textContent||''))return'almost';return'wrong';}
function ratingFor(k){return k==='correct'?'good':k==='almost'?'hard':'again';}
function showFeedback(kind){let o=$('#stableFeedback');if(!o){o=document.createElement('div');o.id='stableFeedback';o.innerHTML='<div class="stable-feedback-card"><div class="stable-feedback-symbol"></div><div class="stable-feedback-label"></div></div>';document.body.appendChild(o);}o.className='stable-feedback '+kind+' show';o.querySelector('.stable-feedback-symbol').textContent=kind==='correct'?'✓':kind==='almost'?'○':'✕';o.querySelector('.stable-feedback-label').textContent=kind==='correct'?'Richtig':kind==='almost'?'Fast richtig':'Falsch';}
function hideFeedback(){const o=$('#stableFeedback');if(o)o.classList.remove('show');}
function retryStartupVoiceResult(){
  const panel=$('#resultPanel'),input=$('#answerInput'),check=$('#checkAnswer');
  if(panel)panel.classList.add('hidden');
  if(input){input.disabled=false;input.value='';input.classList.remove('voice-recognized');}
  if(check)check.disabled=false;
  submittedSerial=-1;handledResultSerial=-1;acceptingAnswer=!!prefs.autoMic;resetAnswerCapture(true);
  setStatus('Erste Spracherkennung war unsicher – bitte noch einmal sprechen.',true);
}
function handleResult(){
  if($('#resultPanel')?.classList.contains('hidden')||handledResultSerial===cardSerial)return;
  clearTimeout(advanceTimer);clearSubmit();acceptingAnswer=false;speechDetected=false;
  const serial=cardSerial,kind=resultKind(),voiceAnswer=$('#answerInput')?.classList.contains('voice-recognized');
  if(startupVoiceGuard&&voiceAnswer){startupVoiceGuard=false;if(kind==='wrong'){retryStartupVoiceResult();return;}}
  handledResultSerial=cardSerial;showFeedback(kind);setStatus('Mikrofon bleibt für die nächste Vokabel bereit.',recognitionRunning||recognitionStarting);
  if(kind!=='correct')setTimeout(()=>{if(serial===cardSerial)speak($('#solutionText')?.textContent||'',answerLang());},260);
  advanceTimer=setTimeout(()=>{if(serial!==cardSerial||$('#resultPanel')?.classList.contains('hidden'))return;hideFeedback();const btn=$(`.rating[data-rating="${ratingFor(kind)}"]`);if(btn)btn.click();},2400);
}
function startCard(read=true){
  clearTimeout(advanceTimer);hideFeedback();submittedSerial=-1;handledResultSerial=-1;uncertainRetryUsed=false;acceptingAnswer=!!prefs.autoMic;resetAnswerCapture(true);
  if(!answerReady())return;const serial=cardSerial;
  if(prefs.autoMic){ensureRecognition(false);setStatus(statusListening(),true);}else setStatus('Mikrofon-Automatik ist aus.');
  if(read&&!muted())setTimeout(()=>{if(serial===cardSerial&&answerReady())speak($('#promptText')?.textContent?.trim()||'',promptLang());},20);
}
function installObservers(){
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{cardSerial++;startCard(true);}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(!panel.classList.contains('hidden'))setTimeout(handleResult,70);}).observe(panel,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){acceptingAnswer=false;clearTimeout(advanceTimer);clearSubmit();stopRecognition(false);}else if(learnActive()){userStopped=false;if(prefs.autoMic)ensureRecognition(false);if(answerReady())setTimeout(()=>startCard(true),120);}});
  document.addEventListener('rvt-app-speech-start',()=>{ownSpeech=true;clearSubmit();});
  document.addEventListener('rvt-app-speech-end',()=>{ownSpeech=false;suppressUntil=Date.now()+380;resetAnswerCapture(true);if(answerReady()&&prefs.autoMic)setStatus(statusListening(),recognitionRunning||recognitionStarting);});
}
function injectStyles(){if($('#stableVoiceStyles'))return;const s=document.createElement('style');s.id='stableVoiceStyles';s.textContent=`.manual-next{display:none!important}#feedbackOverlay{display:none!important}.stable-feedback{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(255,255,255,.12);opacity:0;transition:opacity .12s}.stable-feedback.show{opacity:1}.stable-feedback-card{width:min(78vw,360px);aspect-ratio:1/1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:9px solid currentColor;background:rgba(255,255,255,.96);box-shadow:0 22px 65px rgba(0,0,0,.22)}.stable-feedback-symbol{font-size:clamp(100px,31vw,190px);font-weight:900;line-height:.8}.stable-feedback-label{font-size:clamp(24px,7vw,38px);font-weight:900;margin-top:22px}.stable-feedback.correct{color:#2f8b58}.stable-feedback.almost{color:#d18412}.stable-feedback.wrong{color:#b63b3b}body.dark .stable-feedback-card{background:rgba(23,29,40,.97)}`;document.head.appendChild(s);}
function install(){neutralizeLegacy();replaceControls();injectStyles();installObservers();cardSerial++;userStopped=false;if(prefs.autoMic)ensureRecognition(false);setTimeout(()=>startCard(true),420);}
setTimeout(install,700);
})();