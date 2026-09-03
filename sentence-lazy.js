(() => {
'use strict';
const BUILD=window.__RVT_BUILD||Date.now();
let loading=false,loaded=false;
const $=s=>document.querySelector(s);
function load(src,key){
  const existing=document.querySelector(`script[data-sentence-lazy="${key}"]`);
  if(existing)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=src+'?v='+BUILD;s.dataset.sentenceLazy=key;s.async=false;
    s.onload=resolve;s.onerror=()=>reject(new Error(src));document.body.appendChild(s);
  });
}
function makeTab(){
  if($('#sentenceTab'))return;
  const nav=$('.tabs');if(!nav)return;
  const b=document.createElement('button');b.id='sentenceTab';b.className='tab';b.type='button';b.textContent='Sätze';
  b.title='Satzübung laden';nav.appendChild(b);
  b.addEventListener('click',async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    if(loading)return;loading=true;b.disabled=true;b.textContent='Sätze …';
    try{
      b.remove();
      await load('sentence-bank-data.js','bank');
      await load('sentence-drill.js','drill');
      loaded=true;
      setTimeout(()=>$('#sentenceTab')?.click(),40);
    }catch(err){
      loading=false;loaded=false;makeTab();
      const n=$('#sentenceTab');if(n){n.disabled=false;n.textContent='Sätze';}
      const t=$('#toast');if(t){t.textContent='Satzübung konnte nicht geladen werden.';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}
    }
  },true);
}
function init(){if(loaded)return;makeTab();new MutationObserver(()=>{if(!loaded&&!loading)makeTab()}).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
