(() => {
'use strict';
const $=s=>document.querySelector(s);
let pending=false;
let retrying=false;

function isVoiceWrong(){
  const panel=$('#resultPanel'),input=$('#answerInput'),mark=$('#resultMark');
  if(!panel||panel.classList.contains('hidden')||panel.dataset.rvtRevealed==='1')return false;
  if(!input?.classList.contains('voice-recognized'))return false;
  if(mark?.classList.contains('correct'))return false;
  return true;
}

function ensureBox(){
  let box=$('#voiceSelfcheck');
  if(box)return box;
  box=document.createElement('div');box.id='voiceSelfcheck';box.className='voice-selfcheck hidden';
  box.innerHTML=`<div class="voice-selfcheck-title">Spracherkennung unsicher</div><div class="voice-selfcheck-heard"></div><div class="voice-selfcheck-question">Hast du die richtige Antwort gesagt?</div><div class="voice-selfcheck-actions"><button type="button" class="primary" data-selfcheck="yes">Ja, richtig gesagt</button><button type="button" class="secondary" data-selfcheck="retry">Nochmal sprechen</button><button type="button" class="secondary" data-selfcheck="no">Nein, war falsch</button></div>`;
  const panel=$('#resultPanel');panel?.appendChild(box);
  box.addEventListener('click',e=>{const b=e.target.closest?.('[data-selfcheck]');if(!b)return;const action=b.dataset.selfcheck;if(action==='yes')acceptAsCorrect();else if(action==='retry')retrySpeech();else if(action==='no')acceptAsWrong();});
  return box;
}

function hideBox(){const box=$('#voiceSelfcheck');if(box)box.classList.add('hidden');document.body.classList.remove('rvt-voice-selfcheck');pending=false;}

function showBox(){
  if(!isVoiceWrong()||document.body.classList.contains('rvt-answer-revealed'))return;
  const box=ensureBox();if(!box)return;
  pending=true;document.body.classList.add('rvt-voice-selfcheck');
  const input=$('#answerInput');const raw=(input?.dataset.voiceRaw||input?.value||'').trim();
  const heard=box.querySelector('.voice-selfcheck-heard');
  if(heard)heard.textContent=raw?`Erkannt wurde: „${raw}“`:'Die Spracheingabe war nicht eindeutig.';
  box.classList.remove('hidden');
}

function acceptAsCorrect(){
  if(!pending)return;
  const input=$('#answerInput'),solution=$('#solutionText')?.textContent?.trim();
  hideBox();
  if(input&&solution){input.value=solution;input.classList.add('voice-recognized');input.dataset.voiceSelfConfirmed='1';}
  $('.rating[data-rating="good"]')?.click();
}

function acceptAsWrong(){
  if(!pending)return;
  hideBox();
  $('.rating[data-rating="again"]')?.click();
}

function retrySpeech(){
  if(!pending)return;
  retrying=true;hideBox();
  const panel=$('#resultPanel'),input=$('#answerInput'),check=$('#checkAnswer');
  if(panel)panel.classList.add('hidden');
  if(input){input.disabled=false;input.value='';input.classList.remove('voice-recognized');delete input.dataset.voiceRaw;delete input.dataset.voiceSelfConfirmed;}
  if(check)check.disabled=false;
  const prompt=$('#promptText');if(prompt)prompt.appendChild(document.createTextNode(''));
  setTimeout(()=>{retrying=false;},250);
}

function installStyles(){
  if($('#voiceSelfcheckStyles'))return;
  const s=document.createElement('style');s.id='voiceSelfcheckStyles';s.textContent=`
    .voice-selfcheck{margin-top:16px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--card,#fff)}
    .voice-selfcheck.hidden{display:none!important}
    .voice-selfcheck-title{font-weight:800;font-size:17px;margin-bottom:6px}
    .voice-selfcheck-heard{font-size:13px;color:var(--muted);margin-bottom:8px;overflow-wrap:anywhere}
    .voice-selfcheck-question{font-weight:700;margin-bottom:10px}
    .voice-selfcheck-actions{display:flex;gap:8px;flex-wrap:wrap}
    .voice-selfcheck-actions button{flex:1 1 140px}
    body.rvt-voice-selfcheck .stable-feedback{display:none!important}
    body.rvt-voice-selfcheck #resultPanel>.rating-grid{display:none!important}
    @media(max-width:650px){.voice-selfcheck-actions button{flex-basis:100%;padding:10px 9px}}
  `;document.head.appendChild(s);
}

function install(){
  installStyles();ensureBox();
  const panel=$('#resultPanel');if(panel)new MutationObserver(()=>{if(!panel.classList.contains('hidden'))setTimeout(showBox,15);else if(!retrying)hideBox();}).observe(panel,{attributes:true,attributeFilter:['class']});
  const prompt=$('#promptText');if(prompt)new MutationObserver(()=>{if(!retrying)hideBox();}).observe(prompt,{childList:true,characterData:true,subtree:true});
  document.addEventListener('click',e=>{if(!pending)return;const rating=e.target?.closest?.('.rating');if(!rating)return;e.preventDefault();e.stopImmediatePropagation();},true);
}
setTimeout(install,900);
})();