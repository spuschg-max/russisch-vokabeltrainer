(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));

function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200);}
function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function splitList(v){if(Array.isArray(v))return v.map(x=>String(x).trim()).filter(Boolean);return String(v||'').split(';').map(x=>x.trim()).filter(Boolean)}
function b64urlBytes(s){s=String(s||'').trim().replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function gunzip(bytes){if(typeof DecompressionStream!=='function')throw new Error('Diese App-Version kann den Import noch nicht entpacken.');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return await new Response(stream).text()}
function sanitizeWord(raw,index,prefix){const ru=String(raw?.ru||raw?.russian||'').trim(),de=String(raw?.de||raw?.german||'').trim();if(!ru||!de)return null;const type=['verb','noun','adjective','adverb','pronoun','phrase','other'].includes(raw?.type)?raw.type:'other';return {id:String(raw?.id||`${prefix}${String(index+1).padStart(4,'0')}`),ru,de,altDe:splitList(raw?.altDe),altRu:splitList(raw?.altRu),type,topic:String(raw?.topic||'').trim(),note:String(raw?.note||'').trim(),forms:String(raw?.forms||'').trim()}}
function makeState(words){const current=getState()||{},defaults=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);return {version:2,words,progress:{},settings:clone(current.settings||{direction:'mixed',newLimit:12,typing:true,infinitiveFirst:true,autoplay:false,strict:false,dark:false}),daily:{},streak:{current:0,best:0,lastDate:null},deletedDefaultIds:defaults,formProgress:{},formDaily:{},createdAt:new Date().toISOString()}}
async function decryptCode(code){
  code=String(code||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9]{2,8}-[A-Z0-9]{4,16}$/.test(code))throw new Error('Importcode nicht erkannt.');
  const packId=code.split('-')[0].toLowerCase();
  const response=await fetch(`./private-packs/${packId}.txt`,{cache:'no-store'});if(!response.ok)throw new Error('Für diesen Code wurde keine Lektion gefunden.');
  const payload=b64urlBytes(await response.text()),nonce=payload.slice(0,12),ciphertext=payload.slice(12);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
  const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']);
  let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,ciphertext))}catch(e){throw new Error('Importcode ist nicht richtig.');}
  return JSON.parse(await gunzip(plain));
}
function installPackage(obj){
  const source=Array.isArray(obj?.words)?obj.words:Array.isArray(obj?.state?.words)?obj.state.words:[];if(!source.length)throw new Error('Die Lektion enthält keine Vokabeln.');
  const words=source.map((w,i)=>sanitizeWord(w,i,'code-'+Date.now().toString(36)+'-')).filter(Boolean);if(!words.length)throw new Error('Keine gültigen Vokabeln gefunden.');
  const store=getStore(),current=getState();if(!store?.exercises||!store?.activeId)throw new Error('Übungsverwaltung noch nicht bereit. App bitte einmal schließen und öffnen.');
  if(current&&store.exercises[store.activeId])store.exercises[store.activeId].state=clone(current);
  const sourceId=String(obj?.sourceId||'').trim();
  if(sourceId){const existing=(store.order||[]).find(id=>store.exercises?.[id]?.sourceId===sourceId);if(existing){store.activeId=existing;localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(store.exercises[existing].state)));return {name:store.exercises[existing].name,count:(store.exercises[existing].state?.words||[]).length,existing:true};}}
  let id='exercise-'+Date.now();while(store.exercises[id])id+='x';
  const name=String(obj?.name||'Private Übung').trim(),description=String(obj?.description||'').trim();
  store.exercises[id]={id,name,description,sourceId:sourceId||undefined,state:makeState(words)};store.order=Array.isArray(store.order)?store.order:[];store.order.push(id);store.activeId=id;
  localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));localStorage.setItem(STORAGE_KEY,JSON.stringify(clone(store.exercises[id].state)));
  return {name,count:words.length,existing:false};
}
async function doImport(){
  const input=$('#privateImportCode');
  try{const obj=await decryptCode(input?.value),r=installPackage(obj);toast(r.existing?`„${r.name}“ ist schon vorhanden und wurde geöffnet.`:`${r.count} Vokabeln als „${r.name}“ übernommen.`);setTimeout(()=>location.reload(),700)}catch(e){toast(e?.message||'Import nicht möglich.')}
}
function inject(){
  if($('#privateCodePanel'))return;
  const anchor=$('#exercisePackagePanel')||$('#exerciseSettingsPanel')||$('#installPanel');if(!anchor)return;
  const panel=document.createElement('div');panel.id='privateCodePanel';panel.className='panel';panel.innerHTML=`<h3>Private Lektion mit Importcode</h3><p>Kein Speichern und kein Linkkopieren: Code eingeben und die Lektion wird direkt in dieser App gespeichert.</p><div class="private-code-row"><input id="privateImportCode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="z. B. J10-AB12CD34"><button id="privateImportCodeButton" class="primary" type="button">Lektion übernehmen</button></div>`;
  anchor.insertAdjacentElement('afterend',panel);
  const style=document.createElement('style');style.textContent='.private-code-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px}.private-code-row input{width:100%;border:1px solid #cfd5dd;border-radius:11px;padding:12px 13px;background:var(--surface);color:var(--text);font:inherit;text-transform:uppercase}@media(max-width:560px){.private-code-row{grid-template-columns:1fr}.private-code-row button{width:100%}}';document.head.appendChild(style);
  $('#privateImportCodeButton').addEventListener('click',doImport);$('#privateImportCode').addEventListener('keydown',e=>{if(e.key==='Enter')doImport()});
}
setTimeout(inject,120);
})();
