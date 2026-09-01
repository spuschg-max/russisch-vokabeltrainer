(() => {
'use strict';
const $=s=>document.querySelector(s);
let revealed=false;

function resetReveal(){
  revealed=false;
  document.body.classList.remove('rvt-answer-revealed');
  const panel=$('#resultPanel');if(panel)delete panel.dataset.rvtRevealed;
  const b=$('#revealCurrent');if(b){b.textContent='Auflösen';b.title='Übersetzung anzeigen; zählt anschließend als Fehlversuch';}
}

function revealCurrent(){
  const panel=$('#resultPanel'),input=$('#answerInput'),check=$('#checkAnswer'),btn=$('#revealCurrent');
  if(!panel||!input||!check||!btn||!$('#view-learn')?.classList.contains('active'))return;
  if(!revealed){
    if(!panel.classList.contains('hidden'))return;
    revealed=true;document.body.classList.add('rvt-answer-revealed');panel.dataset.rvtRevealed='1';
    input.value='';input.classList.remove('voice-recognized');delete input.dataset.voiceRaw;
    check.click();
    const mark=$('#resultMark');if(mark){mark.className='result-mark incorrect';mark.textContent='↪ Aufgelöst – zählt als falsch';}
    btn.textContent='Weiter';btn.title='Fehlversuch speichern und mit der nächsten Karte weitermachen';
    return;
  }
  revealed=false;document.body.classList.remove('rvt-answer-revealed');delete panel.dataset.rvtRevealed;
  btn.textContent='Auflösen';btn.title='Übersetzung anzeigen; zählt anschließend als Fehlversuch';
  const wrong=$('.rating[data-rating="again"]');if(wrong)wrong.click();
}

function installButton(){
  if($('#revealCurrent'))return;
  const anchor=$('#masterCurrent')||$('#postponeCurrent')||$('#discardCurrent');if(!anchor)return;
  const b=document.createElement('button');b.id='revealCurrent';b.className='secondary compact';b.type='button';b.textContent='Auflösen';b.title='Übersetzung anzeigen; zählt anschließend als Fehlversuch';
  anchor.insertAdjacentElement('afterend',b);b.addEventListener('click',revealCurrent);
}

function installStyles(){
  if($('#revealAnswerStyles'))return;
  const s=document.createElement('style');s.id='revealAnswerStyles';s.textContent=`
    body.rvt-answer-revealed .stable-feedback{display:none!important}
    body.rvt-answer-revealed #resultPanel .rating-grid{display:none!important}
    body.rvt-answer-revealed #masterCurrent,
    body.rvt-answer-revealed #postponeCurrent,
    body.rvt-answer-revealed #discardCurrent,
    body.rvt-answer-revealed #editCurrent{pointer-events:none;opacity:.5}
  `;document.head.appendChild(s);
}

function install(){
  installStyles();installButton();
  document.addEventListener('click',e=>{
    if(!revealed)return;
    const rating=e.target?.closest?.('.rating');if(!rating)return;
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{resetReveal();setTimeout(installButton,30);}).observe(prompt,{childList:true,characterData:true,subtree:true});
}
setTimeout(install,250);setTimeout(install,1000);
})();