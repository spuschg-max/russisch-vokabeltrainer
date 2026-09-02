(() => {
'use strict';
const STORAGE='russischVokabeltrainer.v2';
const EXERCISES='russischVokabeltrainer.exercises.v1';

function stripMarks(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function norm(s){return stripMarks(s).toLocaleLowerCase().trim().replace(/ё/g,'е').replace(/\s+/g,' ');}
function hasSixForms(w){
  const raw=String(w?.forms||'').trim();
  return raw&&raw.split(';').filter(Boolean).length>=6;
}
function hasSixStress(w){return Array.isArray(w?.formsStress)&&w.formsStress.filter(Boolean).length>=6;}
function sourceIndex(){
  const all=[
    ...(Array.isArray(window.STANDARD_A1A2_VOCAB)?window.STANDARD_A1A2_VOCAB:[]),
    ...(Array.isArray(window.STANDARD_B1_VOCAB)?window.STANDARD_B1_VOCAB:[])
  ];
  const map=new Map();
  for(const w of all){
    if(w?.type!=='verb'||!hasSixForms(w))continue;
    map.set(norm(w.ru),w);
  }
  return map;
}
function enrichWords(words,index){
  if(!Array.isArray(words)||!index.size)return false;
  let changed=false;
  for(const w of words){
    if(w?.type!=='verb')continue;
    const src=index.get(norm(w.ru));if(!src)continue;
    if(!hasSixForms(w)&&hasSixForms(src)){w.forms=src.forms;changed=true;}
    if(!hasSixStress(w)&&hasSixStress(src)){w.formsStress=[...src.formsStress];changed=true;}
    if(!w.aspect&&src.aspect){w.aspect=src.aspect;changed=true;}
  }
  return changed;
}
function patch(){
  const index=sourceIndex();if(!index.size)return false;
  try{
    const state=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(state&&enrichWords(state.words,index))localStorage.setItem(STORAGE,JSON.stringify(state));
  }catch(e){}
  try{
    const store=JSON.parse(localStorage.getItem(EXERCISES)||'null');let changed=false;
    if(store?.exercises){
      for(const ex of Object.values(store.exercises)){
        if(ex?.state&&enrichWords(ex.state.words,index))changed=true;
      }
    }
    if(changed)localStorage.setItem(EXERCISES,JSON.stringify(store));
  }catch(e){}
  window.dispatchEvent(new CustomEvent('rvt-conjugations-enriched'));
  return true;
}
let tries=0;
const timer=setInterval(()=>{tries++;if(patch()||tries>=60)clearInterval(timer)},100);
})();
