(() => {
'use strict';
const MAP=()=>window.RVT_STRESS_LEXICON||{};
const CYR=/[А-Яа-яЁё]/;
const WORD=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
let scheduled=false;

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
function accentTextNode(node){
  if(!node||node.nodeType!==Node.TEXT_NODE||!CYR.test(node.nodeValue||''))return;
  const next=accentize(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;
}
function accentElement(el){
  if(!el)return;
  if(el.children.length===0){
    const next=accentize(el.textContent);if(next!==el.textContent)el.textContent=next;return;
  }
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(accentTextNode);
}
function update(){
  scheduled=false;
  const ids=[
    'promptText','solutionText','acceptedText',
    'conjVerb','conjSolution','conjPoolList','conjStudyList',
    'speakModel','speakWordList',
    'formPrompt','formSolution','formsList'
  ];
  ids.forEach(id=>accentElement(document.getElementById(id)));
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(update);}
function init(){
  update();
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  window.addEventListener('rvt-conjugations-enriched',schedule);
}
window.__rvtStress={accentize,lookup,stripStress};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
