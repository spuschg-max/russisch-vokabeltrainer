(() => {
'use strict';
const BUILD='2026.09.02.52';
const $=s=>document.querySelector(s);
let lastCheck=0;
function showVersion(){const install=$('#installPanel');if(!install||$('#appBuildInfo'))return;const p=document.createElement('p');p.id='appBuildInfo';p.className='app-build-info';p.textContent=`App-Version ${BUILD} · Updates werden beim Öffnen automatisch geprüft.`;install.appendChild(p);const s=document.createElement('style');s.textContent='.app-build-info{margin-top:10px!important;font-size:12px;color:var(--muted)}';document.head.appendChild(s)}
async function checkForUpdate(force=false){if(!('serviceWorker'in navigator))return;const t=Date.now();if(!force&&t-lastCheck<60000)return;lastCheck=t;try{const reg=await navigator.serviceWorker.ready;await reg.update()}catch(e){}}
function loadScript(src,key){const existing=document.querySelector(`script[data-helper="${key}"]`);if(existing)return Promise.resolve();return new Promise(resolve=>{const s=document.createElement('script');s.src=src+'?v='+BUILD;s.dataset.helper=key;s.async=false;s.onload=resolve;s.onerror=resolve;document.body.appendChild(s)})}
async function loadHelpers(){
  // Sprachmodus zuerst: Die große Satzbank darf den normalen Vokabelstart nicht blockieren.
  await loadScript('audio-toggle.js','audio-toggle');
  await loadScript('speech-unlock.js','speech-unlock');
  await loadScript('speech-tolerance.js','speech-tolerance');
  await loadScript('speech-segmentation.js','speech-segmentation');
  await loadScript('voice-controller.js','voice-controller');
  await loadScript('voice-selfcheck.js','voice-selfcheck');
  await loadScript('wrong-study-pause.js','wrong-study-pause');

  loadScript('stress-display.js','stress-display');
  loadScript('import-code.js','import-code');
  loadScript('voice-add.js','voice-add');
  loadScript('learning-ui.js','learning-ui');
  loadScript('motion-hints.js','motion-hints');
  loadScript('reveal-answer.js','reveal-answer');
  loadScript('problem-vocab.js','problem-vocab');
  loadScript('conjugation-data-bridge.js','conjugation-data-bridge');
  await loadScript('conjugation-drill.js','conjugation-drill');
  await loadScript('conjugation-flow-fix.js','conjugation-flow-fix');
  loadScript('conjugation-study.js','conjugation-study');

  // Nur die kleine Satz-Oberfläche laden. Die 80.000 Satzpaare werden erst
  // beim Öffnen von „Sätze“ nachgeladen und belasten die Vokabelrunde nicht.
  await loadScript('sentence-lazy-loader.js','sentence-lazy-loader');
  await loadScript('sentence-drill.js','sentence-drill');
  await loadScript('sentence-voice-loop.js','sentence-voice-loop');
}
function installUpdateHooks(){showVersion();loadHelpers();checkForUpdate(true);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate()});window.addEventListener('pageshow',()=>checkForUpdate());if('serviceWorker'in navigator){navigator.serviceWorker.addEventListener('controllerchange',()=>{const t=$('#toast');if(t){t.textContent='Neue App-Version ist geladen. Beim nächsten Öffnen ist sie vollständig aktiv.';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200)}})}}
installUpdateHooks();
})();
