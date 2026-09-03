(() => {
'use strict';
const $=s=>document.querySelector(s);
let waiting=false;
let bypass=false;
let skipNextAgain=false;

function panelOpen(){const p=$('#resultPanel');return !!p&&!p.classList.contains('hidden');}
function hideStableFeedback(){const o=$('#stableFeedback');if(o)o.classList.remove('show');}
function solution(){return ($('#solutionText')?.textContent||'').trim();}
function speakSolution(){
  const text=solution();if(!text||!('speechSynthesis'in window))return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang=/russisch/i.test($('#answerLabel')?.textContent||'')?'ru-RU':'de-DE';
    u.rate=u.lang==='ru-RU'?.68:.82;
    speechSynthesis.speak(u);
  }catch(e){}
}
function ensureBox(){
  let box=$('#wrongStudyPause');if(box)return box;
  box=document.createElement('div');box.id='wrongStudyPause';box.className='wrong-study-pause hidden';
  box.innerHTML='<div class="wrong-study-title">In Ruhe ansehen und einprägen</div><div class="wrong-study-note">Die richtige Lösung bleibt stehen. Du kannst sie noch einmal anhören und erst weitergehen, wenn du bereit bist.</div><div class="wrong-study-actions"><button id="wrongReplaySolution" type="button" class="secondary">🔊 Lösung hören</button><button id="wrongContinue" type="button" class="wrong-continue">Weiter</button></div>';
  $('#resultPanel')?.appendChild(box);
  box.querySelector('#wrongReplaySolution')?.addEventListener('click',speakSolution);
  box.querySelector('#wrongContinue')?.addEventListener('click',continueNow);
  return box;
}
function showPause(){
  if(waiting||!panelOpen())return;
  waiting=true;hideStableFeedback();document.body.classList.add('rvt-wrong-study');
  ensureBox()?.classList.remove('hidden');
  const s=$('#micStatus');if(s){s.textContent='Lösung ansehen – wenn du bereit bist, auf Weiter tippen.';s.classList.remove('listening');}
}
function clearPause(){
  waiting=false;document.body.classList.remove('rvt-wrong-study');ensureBox()?.classList.add('hidden');
}
function continueNow(){
  if(!waiting)return;
  clearPause();bypass=true;
  const btn=$('.rating[data-rating="again"]');if(btn)btn.click();
  setTimeout(()=>{bypass=false;},0);
}
function installStyles(){
  if($('#wrongStudyStyles'))return;
  const s=document.createElement('style');s.id='wrongStudyStyles';s.textContent=`
    .stable-feedback.wrong .stable-feedback-card{width:min(58vw,260px);border-width:7px}
    .stable-feedback.wrong .stable-feedback-symbol{font-size:clamp(76px,23vw,135px)}
    .stable-feedback.wrong .stable-feedback-label{font-size:clamp(20px,5vw,29px);margin-top:15px}
    .wrong-study-pause{margin-top:16px;padding:15px;border:2px solid #d47b16;border-radius:14px;background:#fff3df;text-align:center}
    body.dark .wrong-study-pause{background:#3a2b18;border-color:#e5973e}
    .wrong-study-pause.hidden{display:none!important}.wrong-study-title{font-size:17px;font-weight:900;color:#a65300}.wrong-study-note{font-size:13px;margin:5px 0 12px;color:var(--text)}
    .wrong-study-actions{display:flex;gap:9px;flex-wrap:wrap}.wrong-study-actions button{flex:1 1 145px}.wrong-continue{border:0;border-radius:11px;padding:11px 18px;background:#e8871a;color:#fff;font:inherit;font-weight:900;cursor:pointer}.wrong-continue:active{transform:translateY(1px)}
    body.rvt-wrong-study #resultPanel>.rating-grid{display:none!important}
    @media(max-width:650px){.wrong-study-actions button{flex-basis:100%}}
  `;document.head.appendChild(s);
}
function install(){
  installStyles();ensureBox();
  document.addEventListener('click',e=>{
    const reveal=e.target?.closest?.('#revealCurrent');
    if(reveal&&/^weiter$/i.test((reveal.textContent||'').trim())){skipNextAgain=true;setTimeout(()=>{skipNextAgain=false;},0);return;}
    const again=e.target?.closest?.('.rating[data-rating="again"]');if(!again)return;
    if(bypass||skipNextAgain||!panelOpen()||$('#resultPanel')?.dataset.rvtRevealed==='1')return;
    e.preventDefault();e.stopImmediatePropagation();showPause();
  },true);
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>clearPause()).observe(prompt,{childList:true,characterData:true,subtree:true});
}
setTimeout(install,980);
})();
