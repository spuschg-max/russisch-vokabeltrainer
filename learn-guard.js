(() => {
'use strict';
const $=s=>document.querySelector(s);
let fallbackRecognition=null,lastPrompt='';
function learnActive(){return !!$('#view-learn')?.classList.contains('active')&&!$('#learnCard')?.classList.contains('hidden');}
function resultOpen(){return !$('#resultPanel')?.classList.contains('hidden');}
function keepInputsAlive(){
  if(!learnActive()||resultOpen())return;
  const input=$('#answerInput'),check=$('#checkAnswer');
  if(input)input.disabled=false;if(check)check.disabled=false;
}
function speakPromptFallback(){
  if(!learnActive()||!('speechSynthesis'in window))return;
  const text=($('#promptText')?.textContent||'').trim();if(!text)return;
  const lang=/russisch/i.test($('#promptLabel')?.textContent||'')?'ru-RU':'de-DE';
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC'));u.lang=lang;u.rate=lang==='ru-RU'?.68:.82;speechSynthesis.speak(u);}catch(e){}
}
function startMicFallback(){
  if(!learnActive()||resultOpen())return;
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C)return;
  try{if(fallbackRecognition)fallbackRecognition.abort()}catch(e){}
  const r=new C();fallbackRecognition=r;r.lang=/russisch/i.test($('#answerLabel')?.textContent||'')?'ru-RU':'de-DE';r.interimResults=true;r.continuous=false;r.maxAlternatives=3;
  const b=$('#micButton');if(b)b.textContent='●';
  r.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=(e.results[i][0]?.transcript||'')+' ';const input=$('#answerInput');if(input){input.disabled=false;input.value=t.trim();}};
  const done=()=>{if(fallbackRecognition===r)fallbackRecognition=null;if(b)b.textContent='🎙';keepInputsAlive();};r.onend=done;r.onerror=done;
  try{r.start()}catch(e){done()}
}
function install(){
  const input=$('#answerInput'),check=$('#checkAnswer'),speak=$('#speakPrompt'),mic=$('#micButton');if(!input||!check||!speak||!mic)return false;
  keepInputsAlive();
  input.addEventListener('pointerdown',keepInputsAlive,true);input.addEventListener('focus',keepInputsAlive,true);
  speak.addEventListener('click',()=>setTimeout(()=>{const text=($('#promptText')?.textContent||'').trim();if(text&&text===lastPrompt)return;lastPrompt=text;speakPromptFallback();setTimeout(()=>{lastPrompt='';},800);},0),true);
  mic.addEventListener('click',()=>setTimeout(()=>{if(mic.textContent.trim()!=='●'&&learnActive()&&!resultOpen())startMicFallback();},500),true);
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{lastPrompt='';setTimeout(keepInputsAlive,20);setTimeout(keepInputsAlive,400)}).observe(prompt,{childList:true,characterData:true,subtree:true});
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(!resultOpen())setTimeout(keepInputsAlive,20)}).observe(panel,{attributes:true,attributeFilter:['class']});
  setInterval(keepInputsAlive,1200);
  return true;
}
let n=0,t=setInterval(()=>{n++;if(install()||n>30)clearInterval(t)},200);
})();
