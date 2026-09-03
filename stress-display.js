(() => {
'use strict';
const MAP=()=>window.RVT_STRESS_LEXICON||{};
const CYR=/[А-Яа-яЁё]/;
const WORD=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
const ACUTE='\u0301';
const requestedChunks=new Set();
const $=s=>document.querySelector(s);

function stripStress(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function key(s){return stripStress(s).toLocaleLowerCase().trim().replace(/\s+/g,' ');}
function matchCase(source,stressed){
  if(!source||!stressed)return stressed;
  const letters=source.replace(/[^А-Яа-яЁё]/g,'');
  if(letters&&letters===letters.toLocaleUpperCase())return stressed.toLocaleUpperCase();
  const first=source.match(/[А-Яа-яЁё]/)?.[0];
  if(first&&first===first.toLocaleUpperCase()){
    const i=stressed.search(/[А-Яа-яЁё]/);if(i>=0)return stressed.slice(0,i)+stressed[i].toLocaleUpperCase()+stressed.slice(i+1);
  }
  return stressed;
}
function requestChunk(text,onload){
  const k=key(text),first=[...k].find(ch=>CYR.test(ch));if(!first)return;
  const name='u'+first.codePointAt(0).toString(16).padStart(4,'0');
  if(requestedChunks.has(name))return;
  requestedChunks.add(name);
  const s=document.createElement('script');s.src=`stress-chunks/${name}.js?v=${encodeURIComponent(window.__RVT_BUILD||'1')}`;s.async=true;
  s.onload=()=>onload?.();s.onerror=()=>{};document.body.appendChild(s);
}
function lookup(text,onload){const hit=MAP()[key(text)];if(hit)return matchCase(text,hit);requestChunk(text,onload);return null;}
function accentize(text,onload){
  const raw=String(text??'');if(!CYR.test(raw))return raw;
  const exact=lookup(raw,onload);if(exact)return exact;
  return raw.replace(WORD,token=>lookup(token,onload)||token);
}
function setOverlay(el,stressed){
  if(!el)return;
  const raw=stripStress(el.textContent||'');
  if(stressed&&stressed!==raw&&stressed.includes(ACUTE)){
    el.dataset.rvtStressed=stressed;el.classList.add('rvt-stress-element-overlay','rvt-russian-font');
  }else{delete el.dataset.rvtStressed;el.classList.remove('rvt-stress-element-overlay','rvt-russian-font');}
}
function accentOverlay(el){
  if(!el)return;const raw=stripStress(el.textContent||'');
  if(!CYR.test(raw)){setOverlay(el,'');return;}
  setOverlay(el,accentize(raw,()=>setTimeout(()=>accentOverlay(el),0)));
}
function accentWordRows(){document.querySelectorAll('.word-ru').forEach(accentOverlay);}
function accentDifficult(){document.querySelectorAll('#difficultList strong').forEach(accentOverlay);}
function updateCore(){
  accentOverlay($('#promptText'));accentOverlay($('#solutionText'));accentOverlay($('#acceptedText'));
  accentOverlay($('#conjVerb'));accentOverlay($('#conjSolution'));accentOverlay($('#formPrompt'));accentOverlay($('#formSolution'));accentOverlay($('#sentenceSolution'));
}
function installStyles(){
  if($('#rvtStressStyles'))return;
  const s=document.createElement('style');s.id='rvtStressStyles';s.textContent=`
    .rvt-russian-font,.rvt-stress-element-overlay::after{font-family:"Times New Roman",Times,serif!important}
    .rvt-stress-element-overlay{position:relative;visibility:hidden!important}
    .rvt-stress-element-overlay::after{content:attr(data-rvt-stressed);position:absolute;inset:0;visibility:visible;color:inherit;font:inherit;line-height:inherit;letter-spacing:inherit;text-align:inherit;white-space:pre-wrap;pointer-events:none}
  `;document.head.appendChild(s);
}
function observe(el,fn){if(!el)return;new MutationObserver(()=>setTimeout(fn,0)).observe(el,{childList:true,characterData:true,subtree:true});}
function init(){
  installStyles();updateCore();
  observe($('#promptText'),()=>accentOverlay($('#promptText')));
  observe($('#solutionText'),()=>accentOverlay($('#solutionText')));
  observe($('#acceptedText'),()=>accentOverlay($('#acceptedText')));
  observe($('#wordList'),accentWordRows);
  observe($('#difficultList'),accentDifficult);
  observe($('#conjVerb'),updateCore);observe($('#conjSolution'),updateCore);observe($('#formPrompt'),updateCore);observe($('#formSolution'),updateCore);observe($('#sentenceSolution'),updateCore);
  document.addEventListener('click',e=>{const b=e.target?.closest?.('.tab');if(!b)return;setTimeout(()=>{updateCore();accentWordRows();accentDifficult();},80)});
}
window.__rvtStress={accentize,lookup,stripStress};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
