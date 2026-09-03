(() => {
'use strict';
const KEY='russischVokabeltrainer.carMode.v1';
const VOICE_KEY='russischVokabeltrainer.stableVoice.v1';
const $=s=>document.querySelector(s);
function read(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
function forceAutoMic(){try{const p=JSON.parse(localStorage.getItem(VOICE_KEY)||'{}');p.autoMic=true;localStorage.setItem(VOICE_KEY,JSON.stringify(p));}catch(e){}}
window.__RVT_CAR_MODE=read();
if(window.__RVT_CAR_MODE)forceAutoMic();
function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}
function install(){
  const panel=$('#voiceSettingsPanel');if(!panel||$('#rvtCarModeSetting'))return;
  const box=document.createElement('div');box.id='rvtCarModeSetting';box.className='rvt-car-mode-setting';
  box.innerHTML='<label class="check-row"><input id="rvtCarModeToggle" type="checkbox"> 🚗 Auto-Modus – empfindlichere Spracherkennung</label><p>Für Fahrtgeräusche und leisere Sprache. Kann Radio, Beifahrer oder andere Hintergrundstimmen eher mit aufnehmen.</p>';
  panel.appendChild(box);
  const cb=$('#rvtCarModeToggle');cb.checked=window.__RVT_CAR_MODE;
  cb.addEventListener('change',()=>{try{localStorage.setItem(KEY,cb.checked?'1':'0')}catch(e){}if(cb.checked)forceAutoMic();toast(cb.checked?'Auto-Modus wird aktiviert …':'Normalmodus wird aktiviert …');setTimeout(()=>location.reload(),180);});
  const s=document.createElement('style');s.textContent='.rvt-car-mode-setting{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.rvt-car-mode-setting p{margin:5px 0 0!important;font-size:12px!important;color:var(--muted)!important}.rvt-car-mode-badge{font-size:12px;font-weight:800;margin-left:7px}';document.head.appendChild(s);
  if(window.__RVT_CAR_MODE){const status=$('#micStatus');if(status&&!$('#rvtCarBadge')){const b=document.createElement('span');b.id='rvtCarBadge';b.className='rvt-car-mode-badge';b.textContent='🚗 Auto';status.insertAdjacentElement('afterend',b);}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,1050),{once:true});else setTimeout(install,1050);
})();