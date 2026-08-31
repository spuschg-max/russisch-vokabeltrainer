(() => {
'use strict';
const PREF_KEY='russischVokabeltrainer.stableVoice.v1';
const AUDIO_KEY='russischVokabeltrainer.audio.v1';
const $=s=>document.querySelector(s);
let prefs=loadPrefs();
let recognition=null;
let transcript='';
let silenceTimer=null;
let restartTimer=null;
let advanceTimer=null;
let cardSerial=0;
let submittedSerial=-1;
let speaking=false;

function loadPrefs(){try{return {autoMic:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function muted(){try{return !!JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}').muted}catch(e){return false}}
function learnReady(){return !!$('#view-learn')?.classList.contains('active')&&!!$('#resultPanel')?.classList.contains('hidden');}
function answerLang(){return ($('#answerLabel')?.textContent||'').trim()==='Russisch'?'ru-RU':'de-DE';}
function promptLang(){return ($('#promptLabel')?.textContent||'').trim()==='Russisch'?'ru-RU':'de-DE';}
function setStatus(text,on=false){const s=$('#micStatus');if(!s)return;s.textContent=text||'';s.classList.toggle('listening',!!on);}
function listening(){return !!recognition;}
function resetMicButton(){const b=$('#micButton');if(b){b.textContent='🎙';b.disabled=false;b.setAttribute('aria-pressed','false');}}
function stopRecognition(){clearTimeout(silenceTimer);silenceTimer=null;clearTimeout(restartTimer);restartTimer=null;if(recognition){const r=recognition;recognition=null;try{r.abort()}catch(e){}}resetMicButton();}
function cancelSpeech(){speaking=false;try{if('speechSynthesis'in window)speechSynthesis.cancel()}catch(e){}}
function speak(text,lang){return new Promise(resolve=>{if(!text||muted()||!('speechSynthesis'in window)){resolve();return}cancelSpeech();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang.startsWith('ru')?.86:.94;speaking=true;let done=false;const finish=()=>{if(done)return;done=true;speaking=false;resolve()};u.onend=finish;u.onerror=finish;try{speechSynthesis.speak(u)}catch(e){finish()}setTimeout(finish,7000);});}
function updateToggle(){const b=$('#voiceQuickToggle');if(b){b.textContent=prefs.autoMic?'🎙 Mikrofon: AN':'🎙 Mikrofon: AUS';b.setAttribute('aria-pressed',prefs.autoMic?'true':'false')}const cb=$('#stableAutoMicSetting');if(cb)cb.checked=prefs.autoMic;}
function setAutoMic(v){prefs.autoMic=!!v;savePrefs();updateToggle();if(!prefs.autoMic){stopRecognition();setStatus('Mikrofon-Automatik ausgeschaltet.');}else if(learnReady())startCardFlow(false);}

function neutralizeOldVoiceAutomation(){
  const mode=$('#trainingMode');if(mode){mode.value='manual';mode.dispatchEvent(new Event('change',{bubbles:true}));const l=mode.closest('label');if(l)l.style.display='none';}
  const delay=$('#advanceDelay');if(delay){const l=delay.closest('label');if(l)l.style.display='none';}
  const prompt=$('#speakPromptSetting');if(prompt){prompt.checked=false;prompt.dispatchEvent(new Event('change',{bubbles:true}));const l=prompt.closest('label');if(l)l.style.display='none';}
  const corr=$('#speakCorrectionSetting');if(corr){corr.checked=false;corr.dispatchEvent(new Event('change',{bubbles:true}));const l=corr.closest('label');if(l)l.style.display='none';}
  const panel=$('#voiceSettingsPanel');if(panel){const p=panel.querySelector('p');if(p)p.textContent='Bei jeder neuen Vokabel wird zuerst vorgelesen und danach das Mikrofon automatisch eingeschaltet. Ton und Mikrofon lassen sich oben jederzeit getrennt ausschalten.';if(!$('#stableAutoMicSetting')){const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="stableAutoMicSetting" type="checkbox"> Mikrofon bei jeder neuen Vokabel automatisch einschalten';const note=panel.querySelector('.voice-note');if(note)note.insertAdjacentElement('beforebegin',label);else panel.appendChild(label);label.querySelector('input').addEventListener('change',e=>setAutoMic(e.target.checked));}}
}
function replaceControls(){
  const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.stableVoice){const mic=oldMic.cloneNode(true);mic.dataset.stableVoice='1';oldMic.replaceWith(mic);mic.addEventListener('click',()=>{if(listening()){stopRecognition();setStatus('Mikrofon pausiert.');}else startListening(true);});}
  const oldToggle=$('#voiceQuickToggle');if(oldToggle&&!oldToggle.dataset.stableVoice){const b=oldToggle.cloneNode(true);b.dataset.stableVoice='1';oldToggle.replaceWith(b);b.addEventListener('click',()=>setAutoMic(!prefs.autoMic));}
  updateToggle();
}
function startListening(manual=false){
  if(!learnReady())return;const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){setStatus('Spracherkennung wird von diesem Gerät nicht unterstützt.');return;}
  stopRecognition();transcript='';const serial=cardSerial;const r=new C();recognition=r;r.lang=answerLang();r.interimResults=true;r.continuous=false;r.maxAlternatives=3;
  const b=$('#micButton');if(b){b.textContent='●';b.setAttribute('aria-pressed','true');}setStatus('Ich höre …',true);
  r.onresult=e=>{if(serial!==cardSerial||submittedSerial===serial)return;let text='';let finalSeen=false;for(let i=0;i<e.results.length;i++){text+=(e.results[i][0]?.transcript||'')+' ';if(e.results[i].isFinal)finalSeen=true;}transcript=text.trim();const input=$('#answerInput');if(input&&transcript){input.value=transcript;input.classList.add('voice-recognized');}clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>submitVoice(serial),finalSeen?280:900);};
  r.onerror=e=>{if(recognition===r)recognition=null;resetMicButton();const code=e?.error||'';if(serial!==cardSerial)return;if(code==='not-allowed'||code==='service-not-allowed'){setStatus('Mikrofonzugriff ist nicht erlaubt.');return;}if(code==='no-speech'){setStatus('Keine Sprache erkannt.');if(prefs.autoMic)restartTimer=setTimeout(()=>{if(serial===cardSerial&&learnReady())startListening(false)},650);return;}if(code!=='aborted')setStatus('Mikrofon wurde beendet – neuer Versuch …');if(prefs.autoMic&&code!=='aborted')restartTimer=setTimeout(()=>{if(serial===cardSerial&&learnReady())startListening(false)},750);};
  r.onend=()=>{if(recognition===r)recognition=null;resetMicButton();if(serial!==cardSerial||submittedSerial===serial)return;if(transcript.trim()){setTimeout(()=>submitVoice(serial),180);}else if(prefs.autoMic&&!manual){setStatus('Ich höre gleich noch einmal zu …');restartTimer=setTimeout(()=>{if(serial===cardSerial&&learnReady())startListening(false)},650);}else if(!manual)setStatus('Keine Antwort erkannt. Tippe auf das Mikrofon für einen neuen Versuch.');};
  try{r.start()}catch(e){recognition=null;resetMicButton();setStatus('Mikrofon konnte nicht gestartet werden.');}
}
function submitVoice(serial){
  clearTimeout(silenceTimer);if(serial!==cardSerial||submittedSerial===serial||!learnReady())return;const value=($('#answerInput')?.value||transcript||'').trim();if(!value)return;submittedSerial=serial;stopRecognition();setStatus('Antwort erkannt – wird geprüft …');setTimeout(()=>{if(serial!==cardSerial)return;if($('#resultPanel')?.classList.contains('hidden'))$('#checkAnswer')?.click();},80);
}
function resultKind(){const m=$('#resultMark');if(m?.classList.contains('correct'))return'correct';if(m?.classList.contains('almost')||/fast richtig/i.test(m?.textContent||''))return'almost';return'wrong';}
function ratingFor(k){return k==='correct'?'good':k==='almost'?'hard':'again';}
function showStableFeedback(kind){let o=$('#stableFeedback');if(!o){o=document.createElement('div');o.id='stableFeedback';o.innerHTML='<div class="stable-feedback-card"><div class="stable-feedback-symbol"></div><div class="stable-feedback-label"></div></div>';document.body.appendChild(o);}o.className='stable-feedback '+kind+' show';o.querySelector('.stable-feedback-symbol').textContent=kind==='correct'?'✓':kind==='almost'?'○':'✕';o.querySelector('.stable-feedback-label').textContent=kind==='correct'?'Richtig':kind==='almost'?'Fast richtig':'Falsch';}
function hideStableFeedback(){const o=$('#stableFeedback');if(o)o.classList.remove('show');}
async function handleVisibleResult(){
  if($('#resultPanel')?.classList.contains('hidden'))return;clearTimeout(advanceTimer);stopRecognition();const serial=cardSerial,kind=resultKind();showStableFeedback(kind);setStatus('');
  if(kind!=='correct'){await new Promise(r=>setTimeout(r,350));if(serial===cardSerial)await speak($('#solutionText')?.textContent||'',answerLang());}
  const elapsedDelay=kind==='correct'?2100:1700;advanceTimer=setTimeout(()=>{if(serial!==cardSerial||$('#resultPanel')?.classList.contains('hidden'))return;hideStableFeedback();const btn=$(`.rating[data-rating="${ratingFor(kind)}"]`);if(btn)btn.click();},elapsedDelay);
}
async function startCardFlow(read=true){
  clearTimeout(advanceTimer);hideStableFeedback();stopRecognition();cancelSpeech();submittedSerial=-1;transcript='';const input=$('#answerInput');if(input)input.classList.remove('voice-recognized');if(!learnReady())return;const serial=cardSerial;
  if(read){setStatus(muted()?'':'Vokabel wird vorgelesen …');await speak($('#promptText')?.textContent?.trim()||'',promptLang());if(serial!==cardSerial)return;}
  if(prefs.autoMic){setStatus('');setTimeout(()=>{if(serial===cardSerial&&learnReady()&&prefs.autoMic)startListening(false)},220);}else setStatus('Mikrofon-Automatik ist aus.');
}
function installObservers(){
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{cardSerial++;setTimeout(()=>startCardFlow(true),260);}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(panel.classList.contains('hidden'))return;setTimeout(handleVisibleResult,100);}).observe(panel,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){stopRecognition();cancelSpeech();clearTimeout(advanceTimer);}else if(learnReady())setTimeout(()=>startCardFlow(true),400);});
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{if(!$('#view-learn')?.classList.contains('active')){stopRecognition();cancelSpeech();clearTimeout(advanceTimer);hideStableFeedback();}}));
}
function injectStyles(){if($('#stableVoiceStyles'))return;const s=document.createElement('style');s.id='stableVoiceStyles';s.textContent=`
  .manual-next{display:none!important}.stable-feedback{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(255,255,255,.12);opacity:0;transition:opacity .12s}.stable-feedback.show{opacity:1}.stable-feedback-card{width:min(78vw,360px);aspect-ratio:1/1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:9px solid currentColor;background:rgba(255,255,255,.96);box-shadow:0 22px 65px rgba(0,0,0,.22)}.stable-feedback-symbol{font-size:clamp(100px,31vw,190px);font-weight:900;line-height:.8}.stable-feedback-label{font-size:clamp(24px,7vw,38px);font-weight:900;margin-top:22px}.stable-feedback.correct{color:#2f8b58}.stable-feedback.almost{color:#d18412}.stable-feedback.wrong{color:#b63b3b}body.dark .stable-feedback-card{background:rgba(23,29,40,.97)}
`;document.head.appendChild(s);}
function install(){neutralizeOldVoiceAutomation();replaceControls();injectStyles();installObservers();cardSerial++;setTimeout(()=>startCardFlow(true),700);}
setTimeout(install,900);
})();
