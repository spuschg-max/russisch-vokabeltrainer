(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const EXERCISE_KEY='russischVokabeltrainer.exercises.v1';
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));
let recognition=null;
let dictating=false;
let restartTimer=null;
let resolved=[];

function getState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(e){return null}}
function getStore(){try{return JSON.parse(localStorage.getItem(EXERCISE_KEY)||'null')}catch(e){return null}}
function saveStore(store){localStorage.setItem(EXERCISE_KEY,JSON.stringify(store));}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normDe(s){return String(s||'').toLocaleLowerCase('de-DE').trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/\s+/g,' ');}
function normRu(s){return String(s||'').toLocaleLowerCase('ru-RU').trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function stripArticle(s){return normDe(s).replace(/^(der|die|das|ein|eine|einen|einem|einer|eines)\s+/,'');}
function splitList(v){return Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean):String(v||'').split(';').map(x=>x.trim()).filter(Boolean);}
function allWordPool(){
  const out=[],seen=new Set();
  const add=list=>{for(const w of (Array.isArray(list)?list:[])){if(!w?.de||!w?.ru)continue;const k=normRu(w.ru)+'|'+normDe(w.de);if(seen.has(k))continue;seen.add(k);out.push(w);}};
  add(getState()?.words);
  const store=getStore();if(store?.exercises)for(const id of (store.order||Object.keys(store.exercises)))add(store.exercises?.[id]?.state?.words);
  add(window.STANDARD_A1A2_VOCAB);add(window.STANDARD_B1_VOCAB);add(window.DEFAULT_VOCABULARY);
  return out;
}
function findLocal(de){
  const full=normDe(de),bare=stripArticle(de);if(!full)return null;
  let best=null;
  for(const w of allWordPool()){
    const vals=[w.de,...splitList(w.altDe)];
    for(const v of vals){const n=normDe(v),b=stripArticle(v);if(full===n||full===b||bare===n||bare===b){best=w;break;}}
    if(best)break;
  }
  return best?clone(best):null;
}
function cleanWikiValue(s){
  let x=String(s||'').trim();
  x=x.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1');
  x=x.replace(/<[^>]+>/g,'').replace(/'''?/g,'').replace(/\{\{[^{}]*\}\}/g,'').trim();
  return x;
}
async function wiktionaryCandidates(de){
  const url='https://de.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&origin=*&titles='+encodeURIComponent(String(de||'').trim());
  const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Wörterbuch nicht erreichbar');
  const data=await r.json(),page=data?.query?.pages?.[0],text=page?.revisions?.[0]?.slots?.main?.content||'';if(!text)return[];
  let section=text;const dePos=text.indexOf('{{Sprache|Deutsch}}');if(dePos>=0){const next=text.indexOf('{{Sprache|',dePos+20);section=text.slice(dePos,next>dePos?next:text.length);}
  const found=[],seen=new Set(),re=/\{\{Ü[^|}\n]*\|ru\|([^|}\n]+)/g;let m;
  while((m=re.exec(section))){const val=cleanWikiValue(m[1]);if(!/[А-Яа-яЁё]/.test(val))continue;const key=normRu(val);if(!key||seen.has(key))continue;seen.add(key);found.push(val);if(found.length>=6)break;}
  return found;
}
function activeExerciseName(){const store=getStore(),ex=store?.exercises?.[store.activeId];return ex?.name||'aktive Übung';}
function updateTargetUi(){const isNew=$('#voiceAddTarget')?.value==='new';$('#voiceAddNewNameWrap')?.classList.toggle('hidden',!isNew);}
function setStatus(text,on=false){const s=$('#voiceAddStatus');if(!s)return;s.textContent=text||'';s.classList.toggle('listening',!!on);}
function linesFromTextarea(){return String($('#voiceAddText')?.value||'').split(/\n+/).map(x=>x.trim().replace(/^[,;]+|[,;]+$/g,'')).filter(Boolean);}
function setLines(lines){const uniq=[];for(const x of lines){if(!x)continue;if(!uniq.some(y=>normDe(y)===normDe(x)))uniq.push(x);}if($('#voiceAddText'))$('#voiceAddText').value=uniq.join('\n');}
function splitRecognized(text){
  const raw=String(text||'').trim();if(!raw)return[];
  if(/[;,\n]/.test(raw))return raw.split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
  if(findLocal(raw))return[raw];
  const words=raw.split(/\s+/).filter(Boolean);
  if(words.length>1&&words.length<=8&&words.every(w=>!!findLocal(w)))return words;
  return[raw];
}
function stopDictation(permanent=true){
  clearTimeout(restartTimer);restartTimer=null;if(permanent)dictating=false;
  const r=recognition;recognition=null;if(r){try{r.abort()}catch(e){}}
  const b=$('#voiceAddMic');if(b)b.textContent='🎙 Diktat starten';
  if(permanent)setStatus('Diktat beendet. Du kannst die Liste noch bearbeiten.');
}
function startRecognitionSession(){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){setStatus('Spracherkennung wird auf diesem Gerät nicht unterstützt.');dictating=false;return;}
  const r=new C();recognition=r;r.lang='de-DE';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;const finals=new Map();
  r.onstart=()=>{if(recognition!==r)return;const b=$('#voiceAddMic');if(b)b.textContent='■ Diktat stoppen';setStatus('Ich höre Deutsch … kurze Pause zwischen den Vokabeln.',true);};
  r.onresult=e=>{
    if(recognition!==r||!dictating)return;let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const text=(e.results[i][0]?.transcript||'').trim();if(!text)continue;
      if(e.results[i].isFinal){if(finals.get(i)===text)continue;finals.set(i,text);const lines=linesFromTextarea();for(const item of splitRecognized(text))lines.push(item);setLines(lines);}else interim=text;
    }
    setStatus(interim?'Ich höre: '+interim:'Ich höre Deutsch …',true);
  };
  r.onerror=e=>{if(recognition!==r)return;const code=e?.error||'';if(code==='not-allowed'||code==='service-not-allowed'){dictating=false;setStatus('Mikrofonzugriff ist nicht erlaubt.');const b=$('#voiceAddMic');if(b)b.textContent='🎙 Diktat starten';return;}if(code!=='aborted')setStatus('Mikrofon wurde kurz unterbrochen – ich verbinde neu …');};
  r.onend=()=>{if(recognition!==r)return;recognition=null;if(dictating){restartTimer=setTimeout(startRecognitionSession,260);}else{const b=$('#voiceAddMic');if(b)b.textContent='🎙 Diktat starten';}};
  try{r.start();}catch(e){recognition=null;dictating=false;setStatus('Mikrofon konnte nicht gestartet werden.');}
}
function toggleDictation(){if(dictating){stopDictation(true);return;}dictating=true;resolved=[];$('#voiceAddPreview').innerHTML='';startRecognitionSession();}
async function resolveOne(de){
  const local=findLocal(de);if(local)return{de:String(local.de||de),spokenDe:de,ru:String(local.ru||''),source:'Vorhandener Wortschatz',alternatives:[],meta:local};
  try{const c=await wiktionaryCandidates(de);if(c.length)return{de,spokenDe:de,ru:c[0],source:'Wiktionary',alternatives:c.slice(1),meta:{type:'other',altDe:[],altRu:[],topic:'Eigene Ergänzung',note:'',forms:''}};}catch(e){}
  return{de,spokenDe:de,ru:'',source:'Nicht automatisch gefunden',alternatives:[],meta:{type:'other',altDe:[],altRu:[],topic:'Eigene Ergänzung',note:'',forms:''}};
}
function renderPreview(){
  const box=$('#voiceAddPreview');if(!box)return;
  if(!resolved.length){box.innerHTML='';return;}
  box.innerHTML=resolved.map((r,i)=>`<div class="voice-add-row" data-index="${i}"><div class="voice-add-fields"><label>Deutsch<input class="voice-add-de" value="${esc(r.de)}"></label><label>Russisch<input class="voice-add-ru" value="${esc(r.ru)}" placeholder="russische Übersetzung"></label></div><div class="voice-add-source">${esc(r.source)}${r.alternatives.length?' · weitere: '+esc(r.alternatives.join(' · ')):''}</div><button class="secondary compact voice-add-remove" type="button" data-remove="${i}">Entfernen</button></div>`).join('');
  box.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{resolved.splice(Number(b.dataset.remove),1);renderPreview();}));
}
async function resolveList(){
  stopDictation(true);const lines=linesFromTextarea();if(!lines.length){toast('Bitte zuerst deutsche Vokabeln diktieren oder eintragen.');return;}
  const b=$('#voiceAddResolve');if(b){b.disabled=true;b.textContent='Suche Übersetzungen …';}
  setStatus('Suche zuerst im vorhandenen Wortschatz, danach im Wörterbuch …');resolved=[];
  for(let i=0;i<lines.length;i++){setStatus(`Übersetzungen suchen: ${i+1} von ${lines.length} …`);resolved.push(await resolveOne(lines[i]));renderPreview();}
  if(b){b.disabled=false;b.textContent='Übersetzungen suchen';}
  const missing=resolved.filter(x=>!x.ru).length;setStatus(missing?`${resolved.length-missing} gefunden, ${missing} bitte noch auf Russisch ergänzen.`:`${resolved.length} Vokabeln bereit. Bitte kurz prüfen und dann hinzufügen.`);
}
function makeWord(row,i){
  const idx=Number(row.dataset.index),base=resolved[idx]||{},meta=base.meta||{};
  const de=row.querySelector('.voice-add-de')?.value.trim()||'',ru=row.querySelector('.voice-add-ru')?.value.trim()||'';if(!de||!ru)return null;
  return {id:'voice-'+Date.now().toString(36)+'-'+String(i+1).padStart(3,'0'),ru,de,altDe:splitList(meta.altDe),altRu:splitList(meta.altRu),type:['verb','noun','adjective','adverb','pronoun','phrase','other'].includes(meta.type)?meta.type:'other',topic:String(meta.topic||'Eigene Ergänzung'),note:String(meta.note||''),forms:String(meta.forms||'')};
}
function stateWithWords(words,current){
  const defaults=(window.DEFAULT_VOCABULARY||[]).map(w=>w.id);
  return {version:Math.max(3,Number(current?.version||3)),words,progress:{},settings:clone(current?.settings||{direction:'mixed',newLimit:12,typing:true,infinitiveFirst:true,autoplay:false,strict:false,dark:false}),daily:{},streak:{current:0,best:0,lastDate:null},sessionTurn:0,postponedIds:[],deletedDefaultIds:defaults,formProgress:{},formDaily:{},createdAt:new Date().toISOString()};
}
function saveResolved(){
  const rows=[...document.querySelectorAll('#voiceAddPreview .voice-add-row')],words=rows.map((r,i)=>makeWord(r,i)).filter(Boolean);if(!words.length){toast('Es fehlen noch gültige Deutsch-Russisch-Paare.');return;}
  const target=$('#voiceAddTarget')?.value||'active',store=getStore(),current=getState();if(!store?.exercises||!store.activeId||!current){toast('Übungsverwaltung ist nicht bereit.');return;}
  if(target==='new'){
    const name=$('#voiceAddNewName')?.value.trim()||'Diktierte Vokabeln';let id='exercise-'+Date.now();while(store.exercises[id])id+='x';
    const st=stateWithWords(words,current);store.exercises[id]={id,name,description:'Per Sprache hinzugefügte Vokabeln',state:clone(st)};store.order=Array.isArray(store.order)?store.order:[];store.order.push(id);store.activeId=id;saveStore(store);localStorage.setItem(STORAGE_KEY,JSON.stringify(st));
    toast(`${words.length} Vokabeln als „${name}“ angelegt.`);setTimeout(()=>location.reload(),650);return;
  }
  const existing=new Set((current.words||[]).map(w=>normRu(w.ru)+'|'+normDe(w.de)));let added=0;
  for(const w of words){const key=normRu(w.ru)+'|'+normDe(w.de);if(existing.has(key))continue;existing.add(key);current.words.push(w);added++;}
  if(!added){toast('Diese Vokabeln sind in der aktiven Übung bereits vorhanden.');return;}
  localStorage.setItem(STORAGE_KEY,JSON.stringify(current));store.exercises[store.activeId].state=clone(current);saveStore(store);toast(`${added} Vokabel${added===1?'':'n'} zu „${store.exercises[store.activeId].name||'der aktiven Übung'}“ hinzugefügt.`);setTimeout(()=>location.reload(),650);
}
function openDialog(){
  resolved=[];$('#voiceAddText').value='';$('#voiceAddPreview').innerHTML='';$('#voiceAddTarget').value='active';$('#voiceAddNewName').value='';updateTargetUi();setStatus(`Ziel: „${activeExerciseName()}“. Sprich jedes Wort oder jede kurze Wendung mit einer kleinen Pause.`);$('#voiceAddDialog').showModal();
}
function closeDialog(){stopDictation(true);$('#voiceAddDialog')?.close();}
function inject(){
  if($('#voiceAddDialog'))return;
  const add=$('#addWord');if(add&&!$('#voiceAddOpen')){const b=document.createElement('button');b.id='voiceAddOpen';b.className='secondary compact';b.type='button';b.textContent='🎙 Liste diktieren';add.insertAdjacentElement('beforebegin',b);b.addEventListener('click',openDialog);}
  const d=document.createElement('dialog');d.id='voiceAddDialog';d.innerHTML=`<form method="dialog" class="voice-add-form"><div class="dialog-head"><h2>Vokabeln diktieren</h2><button id="voiceAddClose" class="icon-btn" type="button">×</button></div><p>Sprich deutsche Wörter oder kurze Wendungen. Zwischen zwei Vokabeln kurz pausieren. Du kannst die erkannte Liste jederzeit unten verbessern.</p><label>Ziel<select id="voiceAddTarget"><option value="active">Zur aktiven Übung hinzufügen</option><option value="new">Neue Übung aus der Liste anlegen</option></select></label><label id="voiceAddNewNameWrap" class="hidden">Name der neuen Übung<input id="voiceAddNewName" autocomplete="off" placeholder="z. B. Eigene Vokabeln"></label><button id="voiceAddMic" class="primary" type="button">🎙 Diktat starten</button><div id="voiceAddStatus" class="voice-add-status"></div><label>Erkannte deutsche Vokabeln – eine pro Zeile<textarea id="voiceAddText" rows="7" placeholder="Urlaub\nWerkstatt\nFeiertag"></textarea></label><button id="voiceAddResolve" class="secondary" type="button">Übersetzungen suchen</button><div id="voiceAddPreview" class="voice-add-preview"></div><div class="dialog-actions"><button id="voiceAddCancel" class="secondary" type="button">Abbrechen</button><button id="voiceAddSave" class="primary" type="button">Zur Übung hinzufügen</button></div><p class="voice-add-note">Suche: zuerst aktuelle und vorhandene A1/A2-/B1-Vokabeln, danach – nur bei unbekannten Wörtern und mit Internetverbindung – deutsches Wiktionary. Vor dem Speichern bleibt alles editierbar.</p></form>`;document.body.appendChild(d);
  $('#voiceAddClose').addEventListener('click',closeDialog);$('#voiceAddCancel').addEventListener('click',closeDialog);$('#voiceAddMic').addEventListener('click',toggleDictation);$('#voiceAddResolve').addEventListener('click',resolveList);$('#voiceAddSave').addEventListener('click',saveResolved);$('#voiceAddTarget').addEventListener('change',updateTargetUi);d.addEventListener('close',()=>stopDictation(true));
  const style=document.createElement('style');style.id='voiceAddStyles';style.textContent=`#voiceAddDialog{width:min(94vw,720px);max-height:88vh}.voice-add-form{display:grid;gap:12px}.voice-add-form>label{display:grid;gap:6px;font-weight:700}.voice-add-form select,.voice-add-form input,.voice-add-form textarea{width:100%;border:1px solid #cfd5dd;border-radius:11px;padding:11px 12px;background:var(--surface);color:var(--text);font:inherit}.voice-add-status{min-height:20px;font-size:13px;color:var(--muted)}.voice-add-status.listening{color:var(--accent);font-weight:800}.voice-add-preview{display:grid;gap:10px;max-height:36vh;overflow:auto}.voice-add-row{border:1px solid var(--line);border-radius:12px;padding:10px;display:grid;gap:7px}.voice-add-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.voice-add-fields label{display:grid;gap:4px;font-size:12px;font-weight:800}.voice-add-source,.voice-add-note{font-size:12px;color:var(--muted)}.voice-add-remove{justify-self:start}@media(max-width:650px){.voice-add-fields{grid-template-columns:1fr}}`;document.head.appendChild(style);
}
setTimeout(inject,900);
})();
