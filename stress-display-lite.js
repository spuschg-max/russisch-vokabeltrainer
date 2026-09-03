(() => {
'use strict';
const MAP=()=>window.RVT_STRESS_LEXICON||{};
const CYR=/[А-Яа-яЁё]/;
const WORD=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
function stripStress(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function key(s){return stripStress(s).toLocaleLowerCase('ru-RU').trim().replace(/\s+/g,' ');}
function matchCase(source,stressed){
  if(!source||!stressed)return stressed;
  const letters=source.replace(/[^А-Яа-яЁё]/g,'');
  if(letters&&letters===letters.toLocaleUpperCase('ru-RU'))return stressed.toLocaleUpperCase('ru-RU');
  const first=source.match(/[А-Яа-яЁё]/)?.[0];
  if(first&&first===first.toLocaleUpperCase('ru-RU')){const i=stressed.search(/[А-Яа-яЁё]/);if(i>=0)return stressed.slice(0,i)+stressed[i].toLocaleUpperCase('ru-RU')+stressed.slice(i+1);}
  return stressed;
}
function lookup(text){const hit=MAP()[key(text)];return hit?matchCase(text,hit):null;}
function accentize(text){const raw=String(text??'');if(!CYR.test(raw))return raw;const exact=lookup(raw);if(exact)return exact;return raw.replace(WORD,w=>lookup(w)||w);}
function refresh(el){
  if(!el)return;const raw=el.textContent||'';const stressed=accentize(raw);
  if(CYR.test(raw)&&stressed!==raw){el.dataset.rvtStress=stressed;el.classList.add('rvt-stress-lite');}
  else{delete el.dataset.rvtStress;el.classList.remove('rvt-stress-lite');}
}
function watch(id){const el=document.getElementById(id);if(!el)return;refresh(el);new MutationObserver(()=>refresh(el)).observe(el,{childList:true,characterData:true,subtree:true});}
function init(){
  const s=document.createElement('style');s.id='rvtStressLiteStyles';s.textContent='.rvt-stress-lite{position:relative!important;color:transparent!important}.rvt-stress-lite::after{content:attr(data-rvt-stress);position:absolute;inset:0;color:var(--text);font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;font-size:inherit;font-weight:inherit;font-style:inherit;line-height:1.32;text-align:inherit;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none}.prompt-text.rvt-stress-lite{padding-top:.10em;padding-bottom:.10em}.solution strong.rvt-stress-lite{display:inline-block;min-width:1ch;padding-top:.08em}.rvt-stress-lite::selection{background:transparent}';document.head.appendChild(s);
  ['promptText','solutionText','formPrompt','formSolution'].forEach(watch);
}
window.__rvtStressLite={accentize,lookup,stripStress};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();