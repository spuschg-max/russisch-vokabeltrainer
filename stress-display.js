(() => {
'use strict';
const STORAGE='russischVokabeltrainer.v2';
const MAP=()=>window.RVT_STRESS_LEXICON||{};
const CYR=/[А-Яа-яЁё]/;
const WORD=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
const PERSONS=['я','ты','он/она','мы','вы','они'];
const ACUTE='\u0301';
let scheduled=false,mutating=false;

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
function makeVisualFragment(stressed){
  const frag=document.createDocumentFragment(),chars=Array.from(String(stressed||''));
  let buffer='';
  const flush=()=>{if(buffer){frag.appendChild(document.createTextNode(buffer));buffer='';}};
  for(let i=0;i<chars.length;i++){
    const ch=chars[i];
    if(ch===ACUTE)continue;
    if(chars[i+1]===ACUTE){
      flush();
      const span=document.createElement('span');span.className='rvt-stress-vowel';span.textContent=ch;frag.appendChild(span);i++;
    }else buffer+=ch;
  }
  flush();return frag;
}
function accentTextNode(node){
  if(!node||node.nodeType!==Node.TEXT_NODE||node.parentElement?.closest('.rvt-stress-vowel')||!CYR.test(node.nodeValue||''))return;
  const raw=String(node.nodeValue||'');
  const stressed=raw.includes(ACUTE)?raw:accentize(raw);
  if(!stressed.includes(ACUTE))return;
  node.replaceWith(makeVisualFragment(stressed));
}
function accentElement(el){
  if(!el)return;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest('.rvt-stress-vowel')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(accentTextNode);
}
function accentPromptWithoutMutation(){
  const el=document.getElementById('promptText');if(!el)return;
  const raw=String(el.textContent||'');
  const stressed=accentize(raw);
  if(stressed!==raw&&stressed.includes(ACUTE)){
    el.dataset.rvtStressed=stressed;
    el.classList.add('rvt-stress-prompt-overlay');
  }else{
    delete el.dataset.rvtStressed;
    el.classList.remove('rvt-stress-prompt-overlay');
  }
}
function stressConjugationSolution(){
  const verb=document.getElementById('conjVerb'),person=document.getElementById('conjPerson'),solution=document.getElementById('conjSolution');
  if(!verb||!person||!solution||!CYR.test(solution.textContent||''))return;
  const pi=PERSONS.indexOf(stripStress(person.textContent).trim());if(pi<0)return;
  try{
    const words=JSON.parse(localStorage.getItem(STORAGE)||'{}').words||[];
    const word=words.find(w=>key(w?.ru)===key(verb.textContent));
    const forms=Array.isArray(word?.formsStress)?word.formsStress:[];
    if(forms.length>=6&&forms[pi])solution.textContent=forms[pi];
  }catch(e){}
}
function installStyles(){
  if(document.getElementById('rvtStressStyles'))return;
  const s=document.createElement('style');s.id='rvtStressStyles';s.textContent=`
    .rvt-stress-vowel{position:relative;display:inline-block;line-height:inherit;vertical-align:baseline}
    .rvt-stress-vowel::after{content:'';position:absolute;pointer-events:none;left:56%;top:-.06em;width:.055em;height:.24em;border-radius:999px;background:currentColor;transform:translateX(-50%) rotate(18deg);transform-origin:50% 100%}
    #promptText.rvt-stress-prompt-overlay{position:relative;color:transparent!important}
    #promptText.rvt-stress-prompt-overlay::after{content:attr(data-rvt-stressed);position:absolute;inset:0;color:var(--text);font:inherit;line-height:inherit;letter-spacing:inherit;text-align:inherit;white-space:inherit;pointer-events:none}
  `;document.head.appendChild(s);
}
function update(){
  if(mutating)return;scheduled=false;mutating=true;
  try{
    accentPromptWithoutMutation();
    stressConjugationSolution();
    const ids=[
      'solutionText','acceptedText','wordList','difficultList',
      'conjVerb','conjSolution','conjPoolList','conjStudyList',
      'speakModel','speakWordList',
      'formPrompt','formSolution','formsList','sentenceSolution'
    ];
    ids.forEach(id=>accentElement(document.getElementById(id)));
  }finally{mutating=false;}
}
function schedule(){if(scheduled||mutating)return;scheduled=true;requestAnimationFrame(update);}
function init(){
  installStyles();update();
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  window.addEventListener('rvt-conjugations-enriched',schedule);
}
window.__rvtStress={accentize,lookup,stripStress};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
