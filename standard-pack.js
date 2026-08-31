(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));

const PACKS=[
  {
    sourceId:'open-standard-a1a2-v1',
    idBase:'exercise-standard-a1a2',
    idPrefix:'std-a1a2::',
    fallbackName:'Standardwortschatz A1/A2',
    getWords:()=>window.STANDARD_A1A2_VOCAB,
    getMeta:()=>window.STANDARD_A1A2_META
  },
  {
    sourceId:'open-standard-b1-v1',
    idBase:'exercise-standard-b1',
    idPrefix:'std-b1::',
    fallbackName:'Standardwortschatz B1',
    getWords:()=>window.STANDARD_B1_VOCAB,
    getMeta:()=>window.STANDARD_B1_META
  }
];

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function saveStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
function stateFor(words,current){
  const starterIds=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);
  return {version:current?.version||2,words:clone(words),progress:{},settings:clone(current?.settings||{}),daily:{},streak:{current:0,best:0,lastDate:null},deletedDefaultIds:starterIds,formProgress:{},formDaily:{},createdAt:new Date().toISOString()};
}
function uniqueExerciseId(store,base){let id=base,n=2;while(store.exercises[id])id=`${base}-${n++}`;return id;}
function addOrUpdatePack(store,current,pack){
  const words=pack.getWords(),meta=pack.getMeta();
  if(!Array.isArray(words)||!words.length||!meta)return false;
  let id=store.order?.find(x=>store.exercises?.[x]?.sourceId===pack.sourceId);
  if(!id){
    id=uniqueExerciseId(store,pack.idBase);
    store.exercises[id]={id,sourceId:pack.sourceId,name:meta.name||pack.fallbackName,description:meta.description||'',state:stateFor(words,current)};
    store.order=Array.isArray(store.order)?store.order:[];
    store.order.push(id);
    return true;
  }
  const ex=store.exercises[id],old=ex.state||stateFor([],current),validIds=new Set(words.map(w=>w.id));
  ex.name=meta.name||ex.name;ex.description=meta.description||ex.description;ex.sourceId=pack.sourceId;
  ex.state={...old,words:clone(words),progress:old.progress||{},settings:old.settings||clone(current?.settings||{}),daily:old.daily||{},streak:old.streak||{current:0,best:0,lastDate:null},deletedDefaultIds:(window.DEFAULT_VOCABULARY||[]).map(w=>w.id),formProgress:old.formProgress||{},formDaily:old.formDaily||{}};
  for(const pid of Object.keys(ex.state.progress))if(pid.startsWith(pack.idPrefix)&&!validIds.has(pid))delete ex.state.progress[pid];
  if(store.activeId===id)localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(ex.state)));
  return true;
}
function addOrUpdateStandardExercises(){
  const store=getStore(),current=getState();if(!store?.exercises||!store?.activeId)return;
  let changed=false;
  for(const pack of PACKS)changed=addOrUpdatePack(store,current,pack)||changed;
  if(changed)saveStore(store);
}
function injectAttribution(){
  if($('#standardSourcePanel'))return;const settings=$('#view-settings');if(!settings)return;
  const a1=window.STANDARD_A1A2_META,b1=window.STANDARD_B1_META;if(!a1&&!b1)return;
  const counts=[];
  if(a1)counts.push(`<strong>${Number(a1.wordCount)||0} A1/A2-Vokabeln</strong>`);
  if(b1)counts.push(`<strong>${Number(b1.wordCount)||0} B1-Vokabeln</strong>`);
  const panel=document.createElement('div');panel.id='standardSourcePanel';panel.className='panel';
  panel.innerHTML=`<h3>Freier Standardwortschatz</h3><p>${counts.join(' und ')} sind als getrennte Übungen verfügbar. Die CEFR-Einstufung stammt aus SMARTool; die deutschen Bedeutungen aus OpenRussian.</p><p class="standard-source-note">Datenquellen: <a href="https://github.com/smartool/data-rus-eng" target="_blank" rel="noopener">SMARTool data-rus-eng</a> (CC BY 4.0) · <a href="https://github.com/Badestrand/russian-dictionary" target="_blank" rel="noopener">OpenRussian</a> (CC BY-SA 4.0). Der kombinierte Vokabelbestand wird unter CC BY-SA 4.0 verwendet.</p>`;
  const danger=settings.querySelector('.danger-zone');if(danger)danger.insertAdjacentElement('beforebegin',panel);else settings.appendChild(panel);
  const style=document.createElement('style');style.textContent='.standard-source-note{font-size:12px;color:var(--muted)}.standard-source-note a{color:inherit;text-decoration:underline}';document.head.appendChild(style);
}
function renderExerciseListSoon(){
  const select=$('#exerciseSelect');if(!select)return;const store=getStore();if(!store)return;
  select.innerHTML=store.order.filter(id=>store.exercises[id]).map((id,index)=>{const ex=store.exercises[id],esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<option value="${esc(id)}"${id===store.activeId?' selected':''}>${index+1}. ${esc(ex.name)}</option>`}).join('');
}
function init(){addOrUpdateStandardExercises();setTimeout(()=>{renderExerciseListSoon();injectAttribution();},120);}
init();
})();