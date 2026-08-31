(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const PREF_KEY='russischVokabeltrainer.formsVoice.v1';
const $=s=>document.querySelector(s);
let prefs=loadPrefs();
let micTimer=null;
let feedbackTimer=null;
let lastFeedbackKey='';

function loadPrefs(){
  try{return {autoMic:true,speakFeedback:true,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch(e){return {autoMic:true,speakFeedback:true}}
}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function norm(s){return String(s||'').toLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/[́̀]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function levenshtein(a,b){const m=a.length,n=b.length,d=Array(n+1).fill(0);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[n];}
function formsActive(){return !!$('#view-forms')?.classList.contains('active');}
function formReady(){return formsActive()&&!$('#formCard')?.classList.contains('hidden')&&!!$('#formResult')?.classList.contains('hidden')&&!$('#formAnswer')?.disabled;}

function injectControls(){
  const lock=$('#lockedForms');
  if(!lock||$('#formVoiceOptions'))return;
  const panel=document.createElement('div');panel.id='formVoiceOptions';panel.className='panel form-voice-options';panel.innerHTML=`
    <label class="check-row"><input id="formAutoMicSetting" type="checkbox"> Mikrofon bei jeder neuen Form automatisch aktivieren</label>
    <label class="check-row"><input id="formSpeakFeedbackSetting" type="checkbox"> Bei „fast“ oder falsch die Begründung und richtige Form vorlesen</label>
    <p>Wenn du das Mikrofon einmal benutzt, merkt sich die App diese Einstellung dauerhaft.</p>`;
  lock.insertAdjacentElement('afterend',panel);
  $('#formAutoMicSetting').checked=prefs.autoMic;
  $('#formSpeakFeedbackSetting').checked=prefs.speakFeedback;
  $('#formAutoMicSetting').addEventListener('change',e=>{prefs.autoMic=e.target.checked;savePrefs();if(prefs.autoMic)scheduleMic(250);});
  $('#formSpeakFeedbackSetting').addEventListener('change',e=>{prefs.speakFeedback=e.target.checked;savePrefs();});
}
function injectStyles(){
  if($('#formsVoiceStyles'))return;const s=document.createElement('style');s.id='formsVoiceStyles';s.textContent=`
    .form-voice-options{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center}.form-voice-options .check-row{margin:0}.form-voice-options p{width:100%;margin:0!important;color:var(--muted);font-size:12px}.form-feedback-detail{margin:8px auto 14px;max-width:580px;padding:10px 12px;border-radius:10px;background:var(--surface2);text-align:center;font-size:14px;line-height:1.45}.form-result.almost .form-feedback-detail{border:1px solid rgba(193,123,16,.35)}.form-result.wrong .form-feedback-detail{border:1px solid rgba(162,59,59,.3)}
    @media(max-width:650px){.form-voice-options{display:grid;gap:9px}}
  `;document.head.appendChild(s);
}

function scheduleMic(delay=450){clearTimeout(micTimer);micTimer=setTimeout(()=>ensureMic(0),delay);}
function ensureMic(attempt){
  if(!prefs.autoMic||!formReady()||document.visibilityState==='hidden')return;
  if('speechSynthesis'in window&&speechSynthesis.speaking){if(attempt<50)micTimer=setTimeout(()=>ensureMic(attempt+1),140);return;}
  const mic=$('#formMic');if(!mic||mic.disabled||(mic.textContent||'').trim()==='●')return;
  try{mic.click()}catch(e){}
}

function parseForms(word){
  const raw=String(word?.forms||'').trim();if(!raw)return[];
  return raw.split(';').map(part=>{const p=part.trim(),i=p.indexOf('=');if(i<1)return null;const ru=p.slice(0,i).trim(),de=p.slice(i+1).trim();return ru&&de?{ru,de}:null;}).filter(Boolean);
}
function currentVerbForms(){
  const state=getState(),label=$('#formInf')?.textContent||'',inf=label.replace(/^Form von\s+/,'').trim();
  const word=(state?.words||[]).find(w=>w.ru===inf);return word?parseForms(word):[];
}
function resultKind(){
  const r=$('#formResult');if(!r||r.classList.contains('hidden'))return'';
  if(r.classList.contains('almost'))return'almost';if(r.classList.contains('wrong'))return'wrong';if(r.classList.contains('correct'))return'correct';return'';
}
function explanation(){
  const kind=resultKind(),answer=$('#formAnswer')?.value?.trim()||'',solution=$('#formSolution')?.textContent?.trim()||'',question=$('#formPrompt')?.textContent?.trim()||'';
  if(!kind||kind==='correct'||!solution)return'';
  const a=norm(answer),b=norm(solution),forms=currentVerbForms();
  const other=forms.find(f=>norm(f.ru)===a&&norm(f.ru)!==b);
  if(other)return `Du hast „${answer}“ gesagt. Das ist die Form für „${other.de}“. Gefragt war „${question}“. Richtig ist „${solution}“.`;
  if(kind==='almost'){
    const d=levenshtein(a,b);
    if(d<=2)return `Fast richtig. Die Form war nur leicht abweichend. Du hast „${answer}“ gesagt; richtig ist „${solution}“.`;
    return `Fast richtig. Gefragt war „${question}“. Besser so: „${solution}“.`;
  }
  return answer?`Das war noch nicht die passende Form. Gefragt war „${question}“. Richtig ist „${solution}“.`:`Richtig ist „${solution}“.`;
}
function renderFeedback(){
  const kind=resultKind();if(kind!=='almost'&&kind!=='wrong')return;
  const detail=explanation();if(!detail)return;
  const key=`${kind}|${$('#formPrompt')?.textContent||''}|${$('#formAnswer')?.value||''}|${$('#formSolution')?.textContent||''}`;
  let el=$('#formFeedbackDetail');if(!el){el=document.createElement('div');el.id='formFeedbackDetail';el.className='form-feedback-detail';$('#formResultMark')?.insertAdjacentElement('afterend',el);}el.textContent=detail;
  if(key!==lastFeedbackKey&&prefs.speakFeedback){lastFeedbackKey=key;setTimeout(()=>speakCorrection(detail,$('#formSolution')?.textContent||''),120);}
}
function speakOne(text,lang,rate){return new Promise(resolve=>{if(!text||!('speechSynthesis'in window)){resolve();return;}const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=rate;let done=false;const finish=()=>{if(done)return;done=true;resolve();};u.onend=finish;u.onerror=finish;try{speechSynthesis.speak(u)}catch(e){finish();}setTimeout(finish,10000);});}
async function speakCorrection(reason,solution){
  try{speechSynthesis.cancel()}catch(e){}
  await speakOne(reason,'de-DE',.92);
  await new Promise(r=>setTimeout(r,180));
  await speakOne(solution,'ru-RU',.84);
}
function scheduleFeedback(){clearTimeout(feedbackTimer);feedbackTimer=setTimeout(renderFeedback,70);}

function installHooks(){
  injectControls();injectStyles();
  const prompt=$('#formPrompt');if(prompt)new MutationObserver(()=>{lastFeedbackKey='';const old=$('#formFeedbackDetail');if(old)old.remove();scheduleMic(520);}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const result=$('#formResult');if(result)new MutationObserver(()=>{if(result.classList.contains('hidden'))scheduleMic(420);else scheduleFeedback();}).observe(result,{attributes:true,attributeFilter:['class'],childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target?.id==='formMic'&&e.isTrusted){prefs.autoMic=true;savePrefs();const box=$('#formAutoMicSetting');if(box)box.checked=true;}},true);
  $('#formsTab')?.addEventListener('click',()=>setTimeout(()=>{injectControls();scheduleMic(650);},60));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleMic(700);});
  setTimeout(()=>{injectControls();scheduleMic(850);},500);
}
installHooks();
})();