(() => {
'use strict';
const VERSION='2026.09.03.60';
const $=s=>document.querySelector(s);
let loading=false,loaded=false;

function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
function script(src,key){
  const existing=document.querySelector(`script[data-rvt-sentence-lazy="${key}"]`);
  if(existing)return Promise.resolve(true);
  return new Promise(resolve=>{
    const s=document.createElement('script');
    s.src=src+'?v='+encodeURIComponent(VERSION);s.async=false;s.dataset.rvtSentenceLazy=key;
    s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.body.appendChild(s);
  });
}
function bankReady(){
  const bank=window.RVT_SENTENCE_BANK,meta=window.RVT_SENTENCE_META;
  return Array.isArray(bank)&&bank.length>=1000&&!!meta?.pairs&&!!meta?.caseCounts;
}
function placeholder(){
  if(loaded||loading||$('#sentenceTab')||!$('.tabs'))return;
  const b=document.createElement('button');b.id='sentenceTab';b.className='tab';b.type='button';b.textContent='Sätze';b.dataset.rvtLazyPlaceholder='1';b.title='Satzübung öffnen';$('.tabs').appendChild(b);
}
async function openSentences(){
  if(loading||loaded)return;loading=true;
  const old=$('#sentenceTab[data-rvt-lazy-placeholder="1"]');if(old){old.disabled=true;old.textContent='Sätze …';}
  toast('Satzübung wird geladen …');
  try{
    old?.remove();
    const drillOk=await script('sentence-drill.js','drill');
    if(!drillOk)throw new Error('drill');
    const real=$('#sentenceTab');if(real){real.disabled=true;real.textContent='Sätze …';}
    try{delete window.RVT_SENTENCE_BANK;delete window.RVT_SENTENCE_META;}catch(e){}
    const bankOk=await script('sentence-bank-data.js','bank');
    if(!bankOk||!bankReady())throw new Error('bank');
    await script('sentence-voice-loop.js','voice');
    loaded=true;loading=false;
    if(real){real.disabled=false;real.textContent='Sätze';}
    document.dispatchEvent(new Event('rvt-sentence-bank-ready'));
    setTimeout(()=>$('#sentenceTab')?.click(),40);
  }catch(e){
    loading=false;loaded=false;
    $('#view-sentences')?.remove();$('#sentenceTab')?.remove();
    placeholder();toast('Satzübung konnte nicht geladen werden.');
  }
}
function init(){
  placeholder();
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('#sentenceTab[data-rvt-lazy-placeholder="1"]')){
      e.preventDefault();e.stopImmediatePropagation();openSentences();
    }
  },true);
  new MutationObserver(()=>{if(!loaded&&!loading)placeholder()}).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();