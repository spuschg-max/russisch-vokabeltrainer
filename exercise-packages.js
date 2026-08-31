(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const HASH_PREFIX='#exercise=';
const HASH_GZIP_PREFIX='#exercise-gz=';
const HASH_PACK_PREFIX='#pack=';
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function saveStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}
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
function b64urlBytes(s){
  s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
  const bin=atob(s);return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
function b64urlDecode(s){return new TextDecoder().decode(b64urlBytes(s));}
async function gunzipBytes(bytes){
  if(typeof DecompressionStream!=='function')throw new Error('Dieser Browser unterstützt den komprimierten Import noch nicht.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
async function gzipUrlDecode(s){return gunzipBytes(b64urlBytes(s));}
async function decryptPrivatePack(packId,keyText){
  if(!crypto?.subtle)throw new Error('Dieser Browser unterstützt private Importlinks nicht.');
  if(!/^[a-z0-9_-]{1,40}$/i.test(packId))throw new Error('Ungültiger Paketname');
  const response=await fetch(`./private-packs/${packId}.txt`,{cache:'no-store'});if(!response.ok)throw new Error('Privates Übungspaket nicht gefunden');
  const payload=b64urlBytes((await response.text()).trim()),nonce=payload.slice(0,12),ciphertext=payload.slice(12);
  const key=await crypto.subtle.importKey('raw',b64urlBytes(keyText),{name:'AES-GCM'},false,['decrypt']);
  let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,ciphertext));}catch(e){throw new Error('Privater Importlink ist ungültig');}
  return JSON.parse(await gunzipBytes(plain));
}

function importObject(obj,sourceName='Importierte Übung'){
  const source=packageWords(obj);if(!source.length)throw new Error('Keine Vokabeln gefunden');
  const prefix='imp'+Date.now().toString(36)+'-';
  const words=source.map((w,i)=>sanitizeWord(w,i,prefix)).filter(Boolean);if(!words.length)throw new Error('Keine gültigen Vokabelpaare');
  const name=String(obj?.name||obj?.exercise?.name||sourceName||'Importierte Übung').trim();
  const description=String(obj?.description||obj?.exercise?.description||'Lokal importierte Vokabelsammlung').trim();
  const sourceId=String(obj?.sourceId||'').trim();
  let store=getStore();if(!store?.exercises||!store?.activeId)throw new Error('Übungsverwaltung ist noch nicht bereit. App bitte einmal neu öffnen.');
  syncActive(store);
  if(sourceId){
    const existingId=(store.order||[]).find(id=>store.exercises?.[id]?.sourceId===sourceId);
    if(existingId){store.activeId=existingId;saveStore(store);localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(store.exercises[existingId].state)));return {name:store.exercises[existingId].name||name,count:(store.exercises[existingId].state?.words||[]).length,existing:true};}
  }
  const id=uniqueId(store);store.exercises[id]={id,name,description,sourceId:sourceId||undefined,state:makeState(words)};store.order=Array.isArray(store.order)?store.order:[];store.order.push(id);store.activeId=id;saveStore(store);localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(store.exercises[id].state)));
  return {name,count:words.length,existing:false};
}

async function importPackage(file){
  try{
    const text=await file.text(),obj=JSON.parse(text),r=importObject(obj,file.name.replace(/\.json$/i,''));
    toast(r.existing?`„${r.name}“ ist bereits vorhanden und wurde geöffnet.`:`${r.count} Vokabeln als „${r.name}“ importiert.`);setTimeout(()=>location.reload(),650);
  }catch(e){toast('Import nicht möglich: '+(e?.message||'ungültige Datei'));}
}
async function objectFromImportText(text){
  text=String(text||'').trim();if(!text)throw new Error('Bitte zuerst den privaten Import-Link kopieren.');
  let hash=text;
  try{if(/^https?:\/\//i.test(text))hash=new URL(text).hash;}catch(e){}
  if(hash.startsWith(HASH_PACK_PREFIX)){
    const token=hash.slice(HASH_PACK_PREFIX.length),dot=token.indexOf('.');if(dot<1)throw new Error('Ungültiger privater Importlink');
    return await decryptPrivatePack(token.slice(0,dot),token.slice(dot+1));
  }
  if(hash.startsWith(HASH_GZIP_PREFIX))return JSON.parse(await gzipUrlDecode(hash.slice(HASH_GZIP_PREFIX.length)));
  if(hash.startsWith(HASH_PREFIX))return JSON.parse(b64urlDecode(hash.slice(HASH_PREFIX.length)));
  if(/^pack=/i.test(text)){
    const token=text.slice(5),dot=token.indexOf('.');if(dot<1)throw new Error('Ungültiger privater Importlink');
    return await decryptPrivatePack(token.slice(0,dot),token.slice(dot+1));
  }
  return JSON.parse(text);
}
async function importClipboard(){
  try{
    let text='';
    if(navigator.clipboard?.readText){try{text=await navigator.clipboard.readText();}catch(e){}}
    if(!text)text=$('#exercisePasteText')?.value||'';
    const obj=await objectFromImportText(text),r=importObject(obj,'Importierte Übung');
    toast(r.existing?`„${r.name}“ ist bereits vorhanden und wurde geöffnet.`:`${r.count} Vokabeln als „${r.name}“ importiert.`);setTimeout(()=>location.reload(),650);
  }catch(e){toast('Import nicht möglich: '+(e?.message||'ungültiger Link oder Text'));}
}
async function importFromHash(){
  const isPack=location.hash.startsWith(HASH_PACK_PREFIX),isGzip=location.hash.startsWith(HASH_GZIP_PREFIX),isPlain=location.hash.startsWith(HASH_PREFIX);
  if(!isPack&&!isGzip&&!isPlain)return false;
  try{
    const obj=await objectFromImportText(location.hash),r=importObject(obj,'Importierte Übung');
    history.replaceState(null,'',location.pathname+location.search);
    toast(r.existing?`„${r.name}“ ist bereits vorhanden und wurde geöffnet.`:`${r.count} Vokabeln als „${r.name}“ importiert.`);setTimeout(()=>location.reload(),650);return true;
  }catch(e){
    history.replaceState(null,'',location.pathname+location.search);
    toast('Link-Import nicht möglich: '+(e?.message||'ungültiger Link'));return false;
  }
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
    <h3>Private Übung importieren</h3>
    <p>Für die installierte iPhone-App: privaten Import-Link kopieren und hier auf <strong>Import-Link aus Zwischenablage</strong> tippen. Die Übung wird dann direkt in dieser App gespeichert.</p>
    <div class="button-wrap">
      <button id="importExerciseClipboard" class="primary" type="button">Import-Link aus Zwischenablage</button>
      <label class="secondary file-button">Aus Datei importieren<input id="importExercisePackage" type="file" accept="application/json,.json"></label>
      <button id="exportExercisePackage" class="secondary" type="button">Aktive Übung als Datei</button>
    </div>
    <details class="paste-details"><summary>Falls Zugriff auf die Zwischenablage nicht erlaubt ist</summary><textarea id="exercisePasteText" rows="5" placeholder="Privaten Import-Link hier einfügen …"></textarea><button id="importExercisePaste" class="secondary" type="button">Eingefügten Link importieren</button></details>
    <p class="exercise-package-note">Private Kurzlinks laden nur verschlüsselte Übungsdaten. Der Entschlüsselungsschlüssel steht ausschließlich hinter dem # im Link und wird vom Browser nicht an den Server übertragen.</p>`;
  anchor.insertAdjacentElement('afterend',panel);
  $('#importExercisePackage').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importPackage(f);e.target.value='';});
  $('#importExerciseClipboard').addEventListener('click',importClipboard);
  $('#importExercisePaste').addEventListener('click',importClipboard);
  $('#exportExercisePackage').addEventListener('click',exportActive);
  const style=document.createElement('style');style.textContent='.exercise-package-note{font-size:12px;color:var(--muted);margin-top:10px!important}.paste-details{margin-top:12px}.paste-details summary{cursor:pointer;font-weight:700}.paste-details textarea{width:100%;margin:10px 0;border:1px solid #cfd5dd;border-radius:11px;padding:12px;background:var(--surface);color:var(--text);font:inherit}';document.head.appendChild(style);
  setTimeout(importFromHash,30);
}
setTimeout(inject,50);
})();
