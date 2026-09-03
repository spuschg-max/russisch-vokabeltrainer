(() => {
'use strict';
const STORAGE='russischVokabeltrainer.v2';
const MAP=()=>window.RVT_STRESS_LEXICON||{};
const CYR=/[А-Яа-яЁё]/;
const WORD=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
const PERSONS=['я','ты','он/она','мы','вы','они'];
const ACUTE='\u0301';
let timer=null,updating=false;

function stripStress(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function key(s){return stripStress(s).toLocaleLowerCase().trim().replace(/\s+/g,' ');}
function matchCase(source,stressed){
  if(!source||!stressed)return stressed;
  const letters=source.replace(/[^А-Яа-яЁё]/g,'');
  if(letters&&letters===letters.toLocaleUpperCase())return stressed.toLocaleUpperCase();
  const first=source.match(/[А-Яа-яЁё]/)?.[0];
  if(first&&first===first.toLocaleUpperCase()){
    const i=stressed.search(/[А-Яа-яЁё]/);
    if(i>=0)return stressed.slice(0,i)+stressed[i].toLocaleUpperCase()+stressed.slice(i+1);
  }
  return stressed;
}
function lookup(text){const hit=MAP()[key(text)];return hit?matchCase(text,hit):null;}
function accentize(text){
  const raw=String(text??'');if(!CYR.test(raw))return raw;
  const exact=lookup(raw);if(exact)return exact;
  return raw.replace(WORD,token=>lookup(token)||token);
}
function makeVisualSpan(raw,stressed){
  const span=document.createElement('span');
  span.className='rvt-stress-render';
  span.dataset.rvtStressed=stressed;
  span.textContent=stripStress(raw);
  return span;
}
function accentTextNode(node){
  if(!node||node.nodeType!==Node.TEXT_NODE||node.parentElement?.closest('.rvt-stress-render')||!CYR.test(node.nodeValue||''))return false;
  const raw=String(node.nodeValue||'');
  const stressed=raw.includes(ACUTE)?raw:accentize(raw);
  if(!stressed.includes(ACUTE))return false;
  node.replaceWith(makeVisualSpan(raw,stressed));
  return true;
}
function accentElement(el){
  if(!el)return false;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest('.rvt-stress-render')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  let changed=false;for(const node of nodes)if(accentTextNode(node))changed=true;
  return changed;
}
function setOverlay(el,stressed){
  if(!el)return;
  const raw=stripStress(el.textContent||'');
  if(stressed&&stressed!==raw&&stressed.includes(ACUTE)){
    el.dataset.rvtStressed=stressed;
    el.classList.add('rvt-stress-element-overlay','rvt-russian-font');
  }else{
    delete el.dataset.rvtStressed;
    el.classList.remove('rvt-stress-element-overlay');
  }
}
function accentPromptWithoutMutation(){
  const el=document.getElementById('promptText');if(!el)return;
  const raw=stripStress(el.textContent||'');
  if(!CYR.test(raw)){delete el.dataset.rvtStressed;el.classList.remove('rvt-stress-element-overlay','rvt-russian-font');return;}
  setOverlay(el,accentize(raw));
}
function stressConjugationSolution(){
  const verb=document.getElementById('conjVerb'),person=document.getElementById('conjPerson'),solution=document.getElementById('conjSolution');
  if(!solution)return;
  let stressed='';
  if(verb&&person&&CYR.test(solution.textContent||'')){
    const pi=PERSONS.indexOf(stripStress(person.textContent).trim());
    if(pi>=0){
      try{
        const words=JSON.parse(localStorage.getItem(STORAGE)||'{}').words||[];
        const word=words.find(w=>key(w?.ru)===key(verb.textContent));
        const forms=Array.isArray(word?.formsStress)?word.formsStress:[];
        if(forms.length>=6&&forms[pi])stressed=String(forms[pi]);
      }catch(e){}
    }
  }
  if(!stressed)stressed=accentize(stripStress(solution.textContent||''));
  setOverlay(solution,stressed);
}
function installStyles(){
  if(document.getElementById('rvtStressStyles'))return;
  const s=document.createElement('style');s.id='rvtStressStyles';s.textContent=`
    .rvt-russian-font,.rvt-stress-render,.rvt-stress-render::after,.rvt-stress-element-overlay::after{font-family:"Times New Roman",Times,serif!important}
    .rvt-stress-render{position:relative;display:inline-block;visibility:hidden;font:inherit;line-height:inherit;letter-spacing:inherit;white-space:pre-wrap;vertical-align:baseline}
    .rvt-stress-render::after{content:attr(data-rvt-stressed);position:absolute;inset:0;visibility:visible;color:inherit;font:inherit;line-height:inherit;letter-spacing:inherit;white-space:pre-wrap;pointer-events:none}
    .rvt-stress-element-overlay{position:relative;visibility:hidden!important}
    .rvt-stress-element-overlay::after{content:attr(data-rvt-stressed);position:absolute;inset:0;visibility:visible;color:inherit;font:inherit;line-height:inherit;letter-spacing:inherit;text-align:inherit;white-space:pre-wrap;pointer-events:none}
  `;document.head.appendChild(s);
}
function update(){
  if(updating)return;updating=true;
  try{
    accentPromptWithoutMutation();
    stressConjugationSolution();
    const ids=[
      'solutionText','acceptedText','wordList','difficultList',
      'conjVerb','conjPoolList','conjStudyList',
      'speakModel','speakWordList',
      'formPrompt','formSolution','formsList','sentenceSolution'
    ];
    ids.forEach(id=>accentElement(document.getElementById(id)));
  }finally{updating=false;}
}
function schedule(){
  if(updating)return;
  clearTimeout(timer);timer=setTimeout(update,45);
}
function init(){
  installStyles();update();
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  window.addEventListener('rvt-conjugations-enriched',schedule);
}
window.__rvtStress={accentize,lookup,stripStress};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
