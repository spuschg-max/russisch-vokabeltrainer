(() => {
'use strict';
const PREF_KEY='russischVokabeltrainer.voicePersistence.v1';
const QUICK_SILENCE_MS=1000;
const $=s=>document.querySelector(s);
const norm=s=>String(s||'').toLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/[́̀]/g,'').replace(/ё/g,'е').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/\s+/g,' ');
let prefs=loadPrefs();
let mainMicTimer=null;
let quickFinishTimer=null;
let explanationTimer=null;
let lastAnswerValue='';
let lastPrefaceKey='';

function loadPrefs(){
  try{return {autoMic:true,speakFeedback:true,speakAutoStart:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true,speakFeedback:true,speakAutoStart:true}}
}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function levenshtein(a,b){const m=a.length,n=b.length,d=Array(n+1).fill(0);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[n];}

function patchVisibleTexts(){
  const panel=$('#voiceSettingsPanel');
  const p=panel?.querySelector('p');
  if(p)p.textContent='Im Sprachmodus wird die neue Vokabel vorgelesen, danach hört das Mikrofon automatisch zu. Nach 1 Sekunde Sprechpause wird automatisch geprüft.';
  const st=$('#micStatus');
  if(st&&/2 Sekunden/.test(st.textContent||''))st.textContent=(st.textContent||'').replace('2 Sekunden','1 Sekunde');
}
function injectSettings(){
  const voicePanel=$('#voiceSettingsPanel');
  if(voicePanel&&!$('#persistentMicSetting')){
    const correction=$('#speakCorrectionSetting')?.closest('label');
    const mic=document.createElement('label');mic.className='check-row';mic.innerHTML='<input id="persistentMicSetting" type="checkbox"> Mikrofon nach jeder neuen Aufgabe automatisch wieder aktivieren';
    const detail=document.createElement('label');detail.className='check-row';detail.innerHTML='<input id="spokenFeedbackSetting" type="checkbox"> Bei „fast“ oder falsch Begründung und bessere Lösung vorlesen';
    if(correction){correction.insertAdjacentElement('afterend',mic);mic.insertAdjacentElement('afterend',detail)}else{voicePanel.append(mic,detail)}
    $('#persistentMicSetting').checked=prefs.autoMic;
    $('#spokenFeedbackSetting').checked=prefs.speakFeedback;
    $('#persistentMicSetting').addEventListener('change',e=>{prefs.autoMic=e.target.checked;savePrefs();if(prefs.autoMic)scheduleMainMic(150);else{clearTimeout(quickFinishTimer);quickFinishTimer=null;}});
    $('#spokenFeedbackSetting').addEventListener('change',e=>{prefs.speakFeedback=e.target.checked;savePrefs();});
  }
  const speakOptions=$('.speak-options');
  if(speakOptions&&!$('#speakAutoStartMic')){
    const label=document.createElement('label');label.className='check-row';label.innerHTML='<input id="speakAutoStartMic" type="checkbox"> Sprechmodus künftig automatisch mit Mikrofon starten';
    const note=speakOptions.querySelector('.speak-option-note');
    if(note)speakOptions.insertBefore(label,note);else speakOptions.appendChild(label);
    $('#speakAutoStartMic').checked=prefs.speakAutoStart;
    $('#speakAutoStartMic').addEventListener('change',e=>{prefs.speakAutoStart=e.target.checked;savePrefs();});
  }
  patchVisibleTexts();
}

function learnActive(){return !!$('#view-learn')?.classList.contains('active');}
function resultHidden(){return !!$('#resultPanel')?.classList.contains('hidden');}
function micListening(){return ($('#micButton')?.textContent||'').trim()==='●';}
function setOneSecondStatus(){const st=$('#micStatus');if(st&&micListening())st.textContent='Ich höre … Nach 1 Sekunde Pause wird automatisch geprüft.';}
function scheduleMainMic(delay=450){clearTimeout(mainMicTimer);mainMicTimer=setTimeout(ensureMainMic,delay);}
function ensureMainMic(){
  if(!prefs.autoMic||!learnActive()||!resultHidden()||document.visibilityState==='hidden')return;
  if('speechSynthesis'in window&&speechSynthesis.speaking){scheduleMainMic(180);return;}
  const mic=$('#micButton');if(!mic||mic.disabled)return;
  if(micListening()){setOneSecondStatus();return;}
  const status=$('#micStatus')?.textContent||'';
  if(/nicht erlaubt|nicht verfügbar|nicht unterstützt/i.test(status))return;
  try{mic.click()}catch(e){}
  setTimeout(()=>{if(prefs.autoMic&&learnActive()&&resultHidden()&&!micListening())scheduleMainMic(350);},350);
}
function resetQuickWatch(){clearTimeout(quickFinishTimer);quickFinishTimer=null;lastAnswerValue=$('#answerInput')?.value?.trim()||'';}
function finishAfterOneSecond(){
  quickFinishTimer=null;
  if(!prefs.autoMic||!learnActive()||!resultHidden())return;
  const input=$('#answerInput'),value=input?.value?.trim()||'';if(!value)return;
  const mic=$('#micButton');
  if(micListening()&&mic){try{mic.click()}catch(e){}}
  const st=$('#micStatus');if(st)st.textContent='Antwort erkannt – wird geprüft …';
  setTimeout(()=>{if(resultHidden())$('#checkAnswer')?.click();},70);
}
function watchHandsFree(){
  patchVisibleTexts();
  if(!prefs.autoMic||!learnActive()||!resultHidden()||document.visibilityState==='hidden'){clearTimeout(quickFinishTimer);quickFinishTimer=null;return;}
  if('speechSynthesis'in window&&speechSynthesis.speaking){clearTimeout(quickFinishTimer);quickFinishTimer=null;return;}
  if(!micListening()){scheduleMainMic(80);return;}
  setOneSecondStatus();
  const value=$('#answerInput')?.value?.trim()||'';
  if(value&&value!==lastAnswerValue){lastAnswerValue=value;clearTimeout(quickFinishTimer);quickFinishTimer=setTimeout(finishAfterOneSecond,QUICK_SILENCE_MS);}
}
function installMainMicPersistence(){
  const prompt=$('#promptText');
  if(prompt)new MutationObserver(()=>{resetQuickWatch();scheduleMainMic(650);}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');
  if(panel)new MutationObserver(()=>{if(panel.classList.contains('hidden')){resetQuickWatch();scheduleMainMic(650);}else{clearTimeout(quickFinishTimer);quickFinishTimer=null;}scheduleExplanation();}).observe(panel,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{if(e.target?.id==='micButton'&&e.isTrusted){prefs.autoMic=true;savePrefs();const box=$('#persistentMicSetting');if(box)box.checked=true;const st=$('#micStatus');if(st&&/nicht erlaubt|nicht verfügbar/i.test(st.textContent||''))st.textContent='';setTimeout(setOneSecondStatus,80);}},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){resetQuickWatch();scheduleMainMic(650);}});
  setInterval(watchHandsFree,150);
  resetQuickWatch();scheduleMainMic(900);
}

function mainKind(){
  const mark=$('#resultMark');if(!mark)return'';
  if(mark.classList.contains('almost')||/fast richtig/i.test(mark.textContent||''))return'almost';
  if(mark.classList.contains('incorrect'))return'wrong';
  if(mark.classList.contains('correct'))return'correct';
  return'';
}
function mainExplanation(){
  const kind=mainKind(),answer=$('#answerInput')?.value?.trim()||'',solution=$('#solutionText')?.textContent?.trim()||'';
  if(!answer||!solution)return'';
  if(kind==='almost'){
    const a=norm(answer),b=norm(solution),lang=($('#answerLabel')?.textContent||'').trim();
    if(a.includes(b)||b.includes(a))return `Die Grundbedeutung stimmt. Genauer heißt es hier „${solution}“.`;
    const dist=levenshtein(a,b);
    if(dist<=2)return `Nur eine kleine Abweichung. Besser: „${solution}“.`;
    if(lang==='Russisch')return `Fast richtig. Die russische Form ist noch leicht abweichend. Besser: „${solution}“.`;
    return `Fast richtig. Deine Antwort „${answer}“ liegt nahe dran. Besser: „${solution}“.`;
  }
  if(kind==='wrong')return `Deine Antwort war „${answer}“. Richtig ist „${solution}“.`;
  return'';
}
function scheduleExplanation(){clearTimeout(explanationTimer);explanationTimer=setTimeout(renderMainExplanation,100);}
function renderMainExplanation(){
  if(resultHidden())return;const kind=mainKind();if(kind!=='almost'&&kind!=='wrong')return;
  const detail=mainExplanation();if(!detail)return;
  let el=$('#vocabFeedbackDetail');if(!el){el=document.createElement('div');el.id='vocabFeedbackDetail';el.className='vocab-feedback-detail';$('#resultMark')?.insertAdjacentElement('afterend',el);}
  el.textContent=detail;el.classList.toggle('almost-detail',kind==='almost');el.classList.toggle('wrong-detail',kind==='wrong');
}

function unmatchedTokens(answer,model){
  const a=norm(answer).split(' ').filter(Boolean),b=norm(model).split(' ').filter(Boolean),used=new Set(),pairs=[],extra=[];
  for(const x of a){let exact=-1;for(let i=0;i<b.length;i++){if(!used.has(i)&&x===b[i]){exact=i;break}}if(exact>=0){used.add(exact);continue}let best=-1,bestD=99;for(let i=0;i<b.length;i++){if(used.has(i))continue;const d=levenshtein(x,b[i]);if(d<bestD){bestD=d;best=i}}if(best>=0&&bestD<=2){pairs.push([x,b[best],bestD]);used.add(best)}else extra.push(x);}
  const missing=b.filter((_,i)=>!used.has(i));return{pairs,extra,missing};
}
function speakKind(){
  const fb=$('#speakFeedback');if(!fb||fb.classList.contains('hidden'))return'';
  if(fb.classList.contains('almost'))return'almost';if(fb.classList.contains('wrong'))return'wrong';if(fb.classList.contains('correct'))return'correct';return'';
}
function speakingExplanation(){
  const kind=speakKind(),answer=$('#speakTranscript')?.textContent?.trim()||'',model=$('#speakModel')?.textContent?.trim()||'';if(!model)return'';
  const shown=$('#speakFeedbackText')?.textContent||'';
  if(kind==='correct'&&/wortstellung/i.test(shown))return'Deine Wortstellung ist möglich. Der Mustersatz klingt hier etwas natürlicher.';
  if(kind==='almost'){
    const diff=unmatchedTokens(answer,model),changed=diff.pairs.find(p=>p[2]>0);
    if(changed)return `Fast richtig. „${changed[0]}“ sollte hier „${changed[1]}“ heißen.`;
    if(diff.missing.length===1)return `Fast richtig. Es fehlt „${diff.missing[0]}“.`;
    if(diff.extra.length===1)return `Fast richtig. „${diff.extra[0]}“ ist hier zu viel.`;
    return'Fast richtig. Ein kleiner Teil des Satzes weicht noch vom Mustersatz ab.';
  }
  if(kind==='wrong')return'Der Satz ist noch nicht nah genug am Mustersatz. Vergleiche besonders Verbform, Ziel und Zeitangabe.';
  return'';
}
function renderSpeakingExplanation(){
  const fb=$('#speakFeedback');if(!fb||fb.classList.contains('hidden'))return;const kind=speakKind();if(!kind)return;
  const reason=speakingExplanation();if(!reason)return;
  let el=$('#speakFeedbackReason');if(!el){el=document.createElement('div');el.id='speakFeedbackReason';el.className='speak-feedback-reason';$('#speakFeedbackText')?.insertAdjacentElement('afterend',el);}el.textContent=reason;
}
function installSpeakingHooks(){
  const fb=$('#speakFeedback');if(fb)new MutationObserver(()=>setTimeout(renderSpeakingExplanation,40)).observe(fb,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  const tab=$('#speakTab');if(tab)tab.addEventListener('click',()=>{if(!prefs.speakAutoStart)return;setTimeout(()=>{if(!$('#view-speak')?.classList.contains('active'))return;$('#speakStart')?.click();},450);});
}

function feedbackPrefaceFor(utterance){
  if(!prefs.speakFeedback||!utterance)return'';const spoken=String(utterance.text||'').trim();
  if(!resultHidden()){
    const kind=mainKind(),solution=$('#solutionText')?.textContent?.trim()||'';
    if((kind==='almost'||kind==='wrong')&&spoken===solution){
      const key=`main|${kind}|${$('#promptText')?.textContent||''}|${$('#answerInput')?.value||''}|${solution}`;if(key===lastPrefaceKey)return'';lastPrefaceKey=key;
      if(kind==='almost'){const reason=mainExplanation().replace(/\s*Besser:.*$/,'').replace(/\s*Genauer heißt es hier.*$/,'');return `${reason||'Fast richtig.'} Besser so:`;}
      return'Das war noch nicht richtig. Richtig ist:';
    }
  }
  const fb=$('#speakFeedback'),model=$('#speakModel')?.textContent?.trim()||'';
  if(fb&&!fb.classList.contains('hidden')&&spoken===model){
    const kind=speakKind(),key=`speak|${kind}|${$('#speakTranscript')?.textContent||''}|${model}`;if(key===lastPrefaceKey)return'';lastPrefaceKey=key;
    const reason=speakingExplanation();if(kind==='correct'&&reason)return `Richtig. ${reason} Zum Vergleich:`;if(kind==='almost')return `${reason||'Fast richtig.'} Besser so:`;if(kind==='wrong')return `${reason||'Noch nicht richtig.'} Richtig wäre:`;
  }
  return'';
}
function installSpeechPreface(){
  if(!('speechSynthesis'in window)||speechSynthesis.__rvtFeedbackWrapped)return;
  const nativeSpeak=speechSynthesis.speak.bind(speechSynthesis);speechSynthesis.__rvtFeedbackWrapped=true;
  speechSynthesis.speak=function(utterance){
    const prefix=feedbackPrefaceFor(utterance);if(!prefix)return nativeSpeak(utterance);
    const pre=new SpeechSynthesisUtterance(prefix);pre.lang='de-DE';pre.rate=.92;let forwarded=false;
    const forward=()=>{if(forwarded)return;forwarded=true;nativeSpeak(utterance);};pre.onend=forward;pre.onerror=forward;nativeSpeak(pre);setTimeout(forward,9000);
  };
}
function injectStyles(){
  if($('#voicePersistenceStyles'))return;const s=document.createElement('style');s.id='voicePersistenceStyles';s.textContent=`
    .vocab-feedback-detail{max-width:560px;margin:8px auto 14px;padding:10px 12px;border-radius:10px;background:var(--surface2);font-size:14px;line-height:1.4;text-align:center}.vocab-feedback-detail.almost-detail{border:1px solid rgba(193,123,16,.35)}.vocab-feedback-detail.wrong-detail{border:1px solid rgba(162,59,59,.3)}
    .speak-feedback-reason{margin:0 auto 12px;max-width:600px;padding:10px 12px;border-radius:10px;background:var(--surface2);font-size:14px;line-height:1.4;font-weight:600}.speak-options #speakAutoStartMic{width:auto}
  `;document.head.appendChild(s);
}

injectSettings();injectStyles();installSpeechPreface();installMainMicPersistence();installSpeakingHooks();
setTimeout(()=>{injectSettings();renderMainExplanation();renderSpeakingExplanation();scheduleMainMic(200);},700);
})();