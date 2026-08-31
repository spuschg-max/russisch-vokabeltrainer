(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const SOURCE_ID='open-standard-a1a2-v1';
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function saveStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
function stateFor(words,current){
  const starterIds=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);
  return {version:current?.version||2,words:clone(words),progress:{},settings:clone(current?.settings||{}),daily:{},streak:{current:0,best:0,lastDate:null},deletedDefaultIds:starterIds,formProgress:{},formDaily:{},createdAt:new Date().toISOString()};
}
function addOrUpdateStandardExercise(){
  const words=window.STANDARD_A1A2_VOCAB,meta=window.STANDARD_A1A2_META;
  if(!Array.isArray(words)||!words.length||!meta)return;
  const store=getStore(),current=getState();if(!store?.exercises||!store?.activeId)return;
  let id=store.order?.find(x=>store.exercises?.[x]?.sourceId===SOURCE_ID);
  if(!id){
    id='exercise-standard-a1a2';let n=2;while(store.exercises[id])id=`exercise-standard-a1a2-${n++}`;
    store.exercises[id]={id,sourceId:SOURCE_ID,name:meta.name||'Standardwortschatz A1/A2',description:meta.description||'',state:stateFor(words,current)};
    store.order=Array.isArray(store.order)?store.order:[];store.order.push(id);saveStore(store);return;
  }
  const ex=store.exercises[id],old=ex.state||stateFor([],current),validIds=new Set(words.map(w=>w.id));
  ex.name=meta.name||ex.name;ex.description=meta.description||ex.description;ex.sourceId=SOURCE_ID;
  ex.state={...old,words:clone(words),progress:old.progress||{},settings:old.settings||clone(current?.settings||{}),daily:old.daily||{},streak:old.streak||{current:0,best:0,lastDate:null},deletedDefaultIds:(window.DEFAULT_VOCABULARY||[]).map(w=>w.id),formProgress:old.formProgress||{},formDaily:old.formDaily||{}};
  for(const pid of Object.keys(ex.state.progress))if(pid.startsWith('std-a1a2::')&&!validIds.has(pid))delete ex.state.progress[pid];
  saveStore(store);
  if(store.activeId===id){localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(ex.state)));}
}
function injectAttribution(){
  if($('#standardSourcePanel'))return;const settings=$('#view-settings'),meta=window.STANDARD_A1A2_META;if(!settings||!meta)return;
  const panel=document.createElement('div');panel.id='standardSourcePanel';panel.className='panel';
  panel.innerHTML=`<h3>Freier Standardwortschatz A1/A2</h3><p><strong>${Number(meta.wordCount)||0} Vokabeln</strong> sind als eigene Übung verfügbar. Die A1/A2-Einstufung stammt aus SMARTool; die deutschen Bedeutungen aus OpenRussian.</p><p class="standard-source-note">Datenquellen: <a href="https://github.com/smartool/data-rus-eng" target="_blank" rel="noopener">SMARTool data-rus-eng</a> (CC BY 4.0) · <a href="https://github.com/Badestrand/russian-dictionary" target="_blank" rel="noopener">OpenRussian</a> (CC BY-SA 4.0). Der kombinierte Vokabelbestand wird unter CC BY-SA 4.0 verwendet.</p>`;
  const danger=settings.querySelector('.danger-zone');if(danger)danger.insertAdjacentElement('beforebegin',panel);else settings.appendChild(panel);
  const style=document.createElement('style');style.textContent='.standard-source-note{font-size:12px;color:var(--muted)}.standard-source-note a{color:inherit;text-decoration:underline}';document.head.appendChild(style);
}
function renderExerciseListSoon(){
  const select=$('#exerciseSelect');if(!select)return;const store=getStore();if(!store)return;
  select.innerHTML=store.order.filter(id=>store.exercises[id]).map((id,index)=>{const ex=store.exercises[id],esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<option value="${esc(id)}"${id===store.activeId?' selected':''}>${index+1}. ${esc(ex.name)}</option>`}).join('');
}
function init(){addOrUpdateStandardExercise();setTimeout(()=>{renderExerciseListSoon();injectAttribution();},120);}
init();
})();
