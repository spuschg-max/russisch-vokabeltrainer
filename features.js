(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const $=s=>document.querySelector(s);

function showToast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1800);
}

function getCurrentWordFromEditor(){
  const edit=$('#editCurrent'), dialog=$('#wordDialog');
  if(!edit||!dialog)return null;
  edit.click();
  const id=$('#editId')?.value;
  const ru=$('#editRu')?.value||'';
  const de=$('#editDe')?.value||'';
  if(dialog.open)dialog.close();
  return id?{id,ru,de}:null;
}

function discardCurrent(){
  const word=getCurrentWordFromEditor();
  if(!word)return;
  const ok=confirm(`„${word.ru} – ${word.de}“ aus Übung 1 verwerfen?\n\nDie Vokabel erscheint dort danach nicht mehr. Du kannst sie später über „+ Vokabel“ neu aufnehmen.`);
  if(!ok)return;
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const state=raw?JSON.parse(raw):null;
    if(!state||!Array.isArray(state.words))throw new Error('state');
    state.words=state.words.filter(w=>w.id!==word.id);
    if(state.progress)delete state.progress[word.id];
    if(word.id.startsWith('v')){
      state.deletedDefaultIds=Array.isArray(state.deletedDefaultIds)?state.deletedDefaultIds:[];
      if(!state.deletedDefaultIds.includes(word.id))state.deletedDefaultIds.push(word.id);
    }
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    showToast('Vokabel verworfen');
    setTimeout(()=>location.reload(),450);
  }catch(e){
    alert('Die Vokabel konnte nicht verworfen werden.');
  }
}

let deferredInstallPrompt=null;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

function updateInstallPanel(){
  const btn=$('#installApp'), hint=$('#installHint');
  if(!btn||!hint)return;
  if(isStandalone()){
    btn.hidden=true;
    hint.textContent='Die App ist bereits vom Home-Bildschirm aus geöffnet.';
    return;
  }
  btn.hidden=false;
  hint.textContent=isIOS()
    ?'Auf dem iPhone wird sie über Safari zum Home-Bildschirm hinzugefügt und danach wie eine eigene App geöffnet.'
    :'Du kannst den Trainer als App auf dem Startbildschirm installieren.';
}

async function installApp(){
  if(isStandalone())return;
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    try{await deferredInstallPrompt.userChoice}catch(e){}
    deferredInstallPrompt=null;
    updateInstallPanel();
    return;
  }
  if(isIOS()){
    alert('Auf dem iPhone:\n\n1. Diese Seite in Safari öffnen.\n2. Unten auf „Teilen“ (Quadrat mit Pfeil nach oben) tippen.\n3. „Zum Home-Bildschirm“ wählen.\n4. Oben rechts „Hinzufügen“ tippen.\n\nDanach erscheint „Russisch“ mit eigenem Symbol wie eine normale App auf dem Home-Bildschirm.');
  }else{
    alert('Öffne das Browser-Menü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.');
  }
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  updateInstallPanel();
});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;updateInstallPanel();});

$('#discardCurrent')?.addEventListener('click',discardCurrent);
$('#installApp')?.addEventListener('click',installApp);
updateInstallPanel();
})();
