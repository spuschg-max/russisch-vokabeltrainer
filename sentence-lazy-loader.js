(() => {
'use strict';
let loading=null;
const $=s=>document.querySelector(s);

function renderState(text){
  const meta=$('#sentenceMeta');if(meta)meta.textContent=text;
}
function setStartDisabled(v){const b=$('#sentenceStart');if(b)b.disabled=!!v;}
function loadBank(){
  if(Array.isArray(window.RVT_SENTENCE_BANK)&&window.RVT_SENTENCE_BANK.length)return Promise.resolve(true);
  if(loading)return loading;
  setStartDisabled(true);renderState('Satzbank wird geladen …');
  loading=new Promise(resolve=>{
    const old=document.querySelector('script[data-rvt-sentence-bank]');
    if(old){old.addEventListener('load',()=>resolve(true),{once:true});old.addEventListener('error',()=>resolve(false),{once:true});return;}
    const s=document.createElement('script');s.src='sentence-bank-data.js';s.async=true;s.dataset.rvtSentenceBank='1';
    s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.body.appendChild(s);
  }).then(ok=>{
    loading=null;setStartDisabled(false);
    if(ok&&window.RVT_SENTENCE_META?.pairs){
      renderState(`${Number(window.RVT_SENTENCE_META.pairs).toLocaleString('de-DE')} deutsch-russische Satzpaare verfügbar.`);
      document.dispatchEvent(new Event('rvt-sentence-bank-ready'));
      return true;
    }
    renderState('Satzbank konnte nicht geladen werden. Bitte den Bereich erneut öffnen.');
    return false;
  });
  return loading;
}

document.addEventListener('click',e=>{
  if(e.target?.closest?.('#sentenceTab'))loadBank();
},true);

document.addEventListener('click',e=>{
  const b=e.target?.closest?.('#sentenceStart');if(!b)return;
  if(Array.isArray(window.RVT_SENTENCE_BANK)&&window.RVT_SENTENCE_BANK.length)return;
  e.preventDefault();e.stopImmediatePropagation();
  loadBank().then(ok=>{if(ok)setTimeout(()=>$('#sentenceStart')?.click(),30);});
},true);
})();
