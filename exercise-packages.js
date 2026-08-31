(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function saveStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600);}
function safeArray(v){return Array.isArray(v)?v:[];}
function splitList(v){if(Array.isArray(v))return v.map(x=>String(x).trim()).filter(Boolean);return String(v||'').split(';').map(x=>x.trim()).filter(Boolean);}
function sanitizeWord(raw,index,prefix){
  const ru=String(raw?.ru||raw?.russian||'').trim(),de=String(raw?.de||raw?.german||'').trim();if(!ru||!de)return null;
  const type=['verb','noun','adjective','adverb','pronoun','phrase','other'].includes(raw?.type)?raw.type:'other';
  return {id:String(raw?.id||`${prefix}${String(index+1).padStart(4,'0')}`),ru,de,altDe:splitList(raw?.altDe),altRu:splitList(raw?.altRu),type,topic:String(raw?.topic||'').trim(),note:String(raw?.note||'').trim(),forms:String(raw?.forms||'').trim()};
}
function currentSettings(){return clone(getState()?.settings||{direction:'mixed',newLimit:12,typing:true,infinitiveFirst:true,autoplay:false,strict:false,dark:false});}
function packageWords(obj){return safeArray(obj?.words).length?obj.words:safeArray(obj?.state?.words);}
function makeState(words){
  const defaults=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);
  return {version:2,words,progress:{},settings:currentSettings(),daily:{},streak:{current:0,best:0,lastDate:null},deletedDefaultIds:defaults,formProgress:{},formDaily:{},createdAt:new Date().toISOString()};
}
function syncActive(store){const state=getState();if(state&&store?.exercises?.[store.activeId])store.exercises[store.activeId].state=clone(state);}
function uniqueId(store){let id='exercise-'+Date.now();while(store.exercises?.[id])id+='x';return id;}

async function importPackage(file){
  try{
    const text=await file.text(),obj=JSON.parse(text);
    const source=packageWords(obj);if(!source.length)throw new Error('Keine Vokabeln gefunden');
    const prefix='imp'+Date.now().toString(36)+'-';
    const words=source.map((w,i)=>sanitizeWord(w,i,prefix)).filter(Boolean);if(!words.length)throw new Error('Keine gültigen Vokabelpaare');
    const name=String(obj?.name||obj?.exercise?.name||file.name.replace(/\.json$/i,'')||'Importierte Übung').trim();
    const description=String(obj?.description||obj?.exercise?.description||'Lokal importierte Vokabelsammlung').trim();
    let store=getStore();if(!store?.exercises||!store?.activeId){toast('Übungsverwaltung ist noch nicht bereit. App bitte einmal neu öffnen.');return;}
    syncActive(store);const id=uniqueId(store);store.exercises[id]={id,name,description,state:makeState(words)};store.order=Array.isArray(store.order)?store.order:[];store.order.push(id);store.activeId=id;saveStore(store);localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(store.exercises[id].state)));
    toast(`${words.length} Vokabeln als „${name}“ importiert.`);setTimeout(()=>location.reload(),650);
  }catch(e){toast('Import nicht möglich: '+(e?.message||'ungültige Datei'));}
}
function exportActive(){
  const store=getStore(),state=getState(),ex=store?.exercises?.[store.activeId];if(!ex||!state){toast('Aktive Übung nicht gefunden.');return;}
  const payload={app:'Russisch-Vokabeltrainer',kind:'exercise-package',version:1,exportedAt:new Date().toISOString(),name:ex.name||'Übung',description:ex.description||'',words:clone(state.words||[])};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(ex.name||'russisch-uebung').replace(/[^a-z0-9а-яёäöüß_-]+/gi,'_')+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
function inject(){
  if($('#exercisePackagePanel'))return;
  const anchor=$('#exerciseSettingsPanel')||$('#installPanel');if(!anchor)return;
  const panel=document.createElement('div');panel.id='exercisePackagePanel';panel.className='panel';panel.innerHTML=`
    <h3>Übung lokal importieren</h3>
    <p>Eine Übungsdatei wird nur auf diesem Gerät eingelesen. Die Vokabeln werden dabei nicht zu GitHub oder auf einen Server hochgeladen.</p>
    <div class="button-wrap">
      <label class="secondary file-button">Übung aus Datei importieren<input id="importExercisePackage" type="file" accept="application/json,.json"></label>
      <button id="exportExercisePackage" class="secondary" type="button">Aktive Übung als Datei</button>
    </div>
    <p class="exercise-package-note">Der Import legt eine neue, getrennte Übung mit eigenem Lernstand an. Damit lassen sich persönliche oder selbst erstellte Vokabelsammlungen verwenden, ohne sie in die öffentliche App einzubauen.</p>`;
  anchor.insertAdjacentElement('afterend',panel);
  $('#importExercisePackage').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importPackage(f);e.target.value='';});
  $('#exportExercisePackage').addEventListener('click',exportActive);
  const style=document.createElement('style');style.textContent='.exercise-package-note{font-size:12px;color:var(--muted);margin-top:10px!important}';document.head.appendChild(style);
}
setTimeout(inject,50);
})();
