(() => {
'use strict';
const BANK_VERSION='2026.09.03.57';
let loading=null;
const $=s=>document.querySelector(s);

function renderState(text){
  const meta=$('#sentenceMeta');if(meta)meta.textContent=text;
}
function setStartDisabled(v){const b=$('#sentenceStart');if(b)b.disabled=!!v;}
function bankReady(){
  const bank=window.RVT_SENTENCE_BANK,meta=window.RVT_SENTENCE_META;
  if(!Array.isArray(bank)||bank.length<1000||!meta?.pairs||!meta?.caseCounts)return false;
  const probe=bank.find(p=>Array.isArray(p)&&p.length>=4&&Number(p[2])>0&&Array.isArray(p[3]));
  return !!probe;
}
function clearOldBank(){
  try{delete window.RVT_SENTENCE_BANK;delete window.RVT_SENTENCE_META;}catch(e){window.RVT_SENTENCE_BANK=[];window.RVT_SENTENCE_META={};}
  document.querySelectorAll('script[data-rvt-sentence-bank]').forEach(s=>s.remove());
}
function loadBank(){
  if(bankReady())return Promise.resolve(true);
  if(loading)return loading;
  clearOldBank();setStartDisabled(true);renderState('Aktuelle Satzbank mit Kasusdaten wird geladen …');
  loading=new Promise(resolve=>{
    const s=document.createElement('script');
    s.src='sentence-bank-data.js?v='+encodeURIComponent(BANK_VERSION);
    s.async=true;s.dataset.rvtSentenceBank=BANK_VERSION;
    s.onload=()=>resolve(bankReady());s.onerror=()=>resolve(false);document.body.appendChild(s);
  }).then(ok=>{
    loading=null;setStartDisabled(false);
    if(ok){
      const m=window.RVT_SENTENCE_META||{},c=m.caseCounts||{};
      renderState(`${Number(m.pairs||0).toLocaleString('de-DE')} Satzpaare · Kasusdaten geladen`);
      document.dispatchEvent(new Event('rvt-sentence-bank-ready'));
      return true;
    }
    renderState('Aktuelle Satzbank konnte nicht geladen werden. Bitte den Bereich erneut öffnen.');
    return false;
  });
  return loading;
}

document.addEventListener('click',e=>{
  if(e.target?.closest?.('#sentenceTab'))loadBank();
},true);

document.addEventListener('click',e=>{
  const b=e.target?.closest?.('#sentenceStart');if(!b)return;
  if(bankReady())return;
  e.preventDefault();e.stopImmediatePropagation();
  loadBank().then(ok=>{if(ok)setTimeout(()=>$('#sentenceStart')?.click(),30);});
},true);
})();
