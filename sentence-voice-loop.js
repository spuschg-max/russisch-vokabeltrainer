(() => {
'use strict';
const $=s=>document.querySelector(s);
let recognition=null,restartTimer=null,armed=false,lastPrompt='';
function R(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
function inSentenceView(){return !!$('#view-sentences')?.classList.contains('active')}
function solutionVisible(){return !$('#sentenceSolutionBox')?.classList.contains('hidden')}
function stop(){armed=false;clearTimeout(restartTimer);restartTimer=null;if(recognition){try{recognition.onend=null;recognition.onerror=null;recognition.stop()}catch(e){}recognition=null}const b=$('#sentenceMic');if(b)b.textContent='🎙'}
function schedule(ms=350){clearTimeout(restartTimer);restartTimer=setTimeout(()=>{if(armed&&inSentenceView()&&!solutionVisible())start()},ms)}
function start(){
  const C=R();if(!C||!inSentenceView()||solutionVisible())return;
  if(recognition){try{recognition.abort()}catch(e){}recognition=null}
  const r=new C();recognition=r;r.lang='ru-RU';r.continuous=false;r.interimResults=true;r.maxAlternatives=5;
  const b=$('#sentenceMic');if(b)b.textContent='●';
  r.onresult=e=>{let text='';for(let i=0;i<e.results.length;i++)text+=(e.results[i][0]?.transcript||'')+' ';const input=$('#sentenceAnswer');if(input)input.value=text.trim()};
  r.onerror=e=>{recognition=null;const b=$('#sentenceMic');if(b)b.textContent='🎙';if(armed&&e?.error!=='not-allowed'&&e?.error!=='service-not-allowed')schedule(500)};
  r.onend=()=>{recognition=null;const b=$('#sentenceMic');if(b)b.textContent='🎙';if(armed&&!solutionVisible())schedule(300)};
  try{r.start()}catch(e){recognition=null;schedule(600)}
}
function arm(){armed=true;start()}
function speakGermanPrompt(){
  const text=$('#sentencePrompt')?.textContent?.trim();if(!text||text===lastPrompt||!('speechSynthesis'in window))return;lastPrompt=text;
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='de-DE';u.rate=.84;const was=armed;stop();u.onend=()=>{if(was){armed=true;schedule(220)}};u.onerror=()=>{if(was){armed=true;schedule(220)}};speechSynthesis.speak(u)}catch(e){}
}
function observePrompt(){const p=$('#sentencePrompt');if(!p)return;new MutationObserver(()=>{if(!inSentenceView())return;setTimeout(()=>{speakGermanPrompt();if(!armed)arm();},120)}).observe(p,{childList:true,subtree:true,characterData:true})}
function install(){
  const tab=$('#sentenceTab'),mic=$('#sentenceMic');if(!tab||!mic)return false;
  mic.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();armed?stop():arm()},true);
  tab.addEventListener('click',()=>setTimeout(()=>{speakGermanPrompt();if(!solutionVisible())arm()},180));
  document.addEventListener('click',e=>{
    const id=e.target?.id||'';
    if(id==='sentenceNext'||id==='sentenceAgain'||id==='sentenceStart'){stop();setTimeout(()=>{speakGermanPrompt();arm()},450)}
    if(id==='sentenceShow')stop();
    if(id==='sentenceRepeat'){setTimeout(()=>arm(),250)}
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  observePrompt();return true;
}
let n=0;const t=setInterval(()=>{n++;if(install()||n>40)clearInterval(t)},250);
})();
