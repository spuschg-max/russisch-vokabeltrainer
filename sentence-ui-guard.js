(() => {
'use strict';
const $=s=>document.querySelector(s);
let sentenceMode=false;
let vocabMicWasOn=false;

function vocabMicOn(){
  const b=$('#voiceQuickToggle');
  return !!b&&(b.getAttribute('aria-pressed')==='true'||/AN/i.test(b.textContent||''));
}
function pauseVocabularyMic(){
  if(!sentenceMode)return;
  const toggle=$('#voiceQuickToggle');
  if(!toggle||!vocabMicOn())return;
  vocabMicWasOn=true;
  try{toggle.click();}catch(e){}
  setTimeout(()=>{
    if(!sentenceMode||!toggle||vocabMicOn())return;
    try{toggle.click();}catch(e){}
  },40);
}
function resumeVocabularyMic(){
  if(!vocabMicWasOn)return;
  setTimeout(()=>{
    if(!$('#view-learn')?.classList.contains('active'))return;
    const toggle=$('#voiceQuickToggle'),mic=$('#micButton');
    if(toggle&&!vocabMicOn())try{toggle.click()}catch(e){}
    if(mic&&vocabMicOn())try{mic.click()}catch(e){}
    vocabMicWasOn=false;
  },140);
}
function keepSentenceControlsAlive(){
  if(!sentenceMode)return;
  const input=$('#sentenceAnswer');
  if(input){input.disabled=false;input.readOnly=false;input.style.pointerEvents='auto';}
  for(const id of ['sentenceMic','sentenceShow','sentenceSpeak','sentenceRepeat','sentenceNext','sentenceStart']){
    const b=$('#'+id);if(b){b.disabled=false;b.style.pointerEvents='auto';}
  }
}
function enter(){
  if(sentenceMode)return;
  sentenceMode=true;document.body.classList.add('rvt-sentence-mode');
  document.documentElement.classList.add('rvt-sentence-mode-root');
  const show=$('#sentenceShow');if(show)show.textContent='Prüfen';
  keepSentenceControlsAlive();
  setTimeout(pauseVocabularyMic,60);
  setTimeout(keepSentenceControlsAlive,180);
}
function leave(){
  if(!sentenceMode)return;
  sentenceMode=false;document.body.classList.remove('rvt-sentence-mode');
  document.documentElement.classList.remove('rvt-sentence-mode-root');
  resumeVocabularyMic();
}
function installStyles(){
  if($('#rvtSentenceUiGuardStyles'))return;
  const s=document.createElement('style');s.id='rvtSentenceUiGuardStyles';s.textContent=`
    html.rvt-sentence-mode-root,body.rvt-sentence-mode{overflow-y:auto!important;overscroll-behavior-y:auto!important;touch-action:pan-y!important}
    body.rvt-sentence-mode .stable-feedback,
    body.rvt-sentence-mode #voiceSelfcheck,
    body.rvt-sentence-mode #wrongStudyPause{display:none!important}
    body.rvt-sentence-mode #view-sentences{position:relative;z-index:2;pointer-events:auto!important;touch-action:pan-y!important}
    body.rvt-sentence-mode #view-sentences .panel,
    body.rvt-sentence-mode #sentenceCard,
    body.rvt-sentence-mode #sentenceAnswer,
    body.rvt-sentence-mode #sentenceMic,
    body.rvt-sentence-mode #sentenceShow,
    body.rvt-sentence-mode #sentenceSolutionBox,
    body.rvt-sentence-mode #sentenceSolutionBox button{pointer-events:auto!important}
    body.rvt-sentence-mode #sentenceAnswer{-webkit-user-select:text!important;user-select:text!important;touch-action:manipulation!important;opacity:1!important}
    body.rvt-sentence-mode #sentenceMic,
    body.rvt-sentence-mode #sentenceShow,
    body.rvt-sentence-mode #sentenceSolutionBox button{touch-action:manipulation!important}
  `;document.head.appendChild(s);
}
function install(){
  installStyles();
  document.addEventListener('click',e=>{
    const tab=e.target?.closest?.('.tab');
    if(tab){
      if(tab.id==='sentenceTab')setTimeout(()=>{if($('#view-sentences')?.classList.contains('active'))enter()},20);
      else setTimeout(()=>{if(!$('#view-sentences')?.classList.contains('active'))leave()},30);
    }
  },true);
  for(const ev of ['pointerdown','touchstart','focus']){
    document.addEventListener(ev,e=>{if(e.target?.closest?.('#sentenceAnswer,#sentenceMic,#sentenceShow,#sentenceSolutionBox button'))keepSentenceControlsAlive()},true);
  }
  const view=$('#view-sentences');if(view)new MutationObserver(()=>{if(view.classList.contains('active'))enter();else leave()}).observe(view,{attributes:true,attributeFilter:['class']});
  if(view?.classList.contains('active'))enter();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
