(() => {
'use strict';
const $=s=>document.querySelector(s);
let desiredAuto=true,sequence=0,installed=false,announceTimer=null;

function active(){return !!$('#view-conjugation')?.classList.contains('active')}
function resultHidden(){return !!$('#conjResult')?.classList.contains('hidden')}
function micOn(){return ($('#conjMic')?.textContent||'').trim()==='●'}
function setAuto(value){
  const cb=$('#conjAutoMic');if(!cb)return;
  if(cb.checked===!!value)return;
  cb.checked=!!value;
  cb.dispatchEvent(new Event('change',{bubbles:true}));
}
function pauseAuto(remember=true){
  const cb=$('#conjAutoMic');
  if(remember&&cb)desiredAuto=cb.checked;
  setAuto(false);
  if(micOn())try{$('#conjMic').click()}catch(e){}
}
function personForSpeech(){const p=($('#conjPerson')?.textContent||'').trim();return p==='он/она'?'он или она':p}
function speechBusy(){try{return !!(speechSynthesis.speaking||speechSynthesis.pending)}catch(e){return false}}
function speak(text,rate=.76){
  return new Promise(resolve=>{
    if(!text||!('speechSynthesis'in window)){resolve();return}
    let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(fallback);resolve()};
    const fallback=setTimeout(finish,4500);
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';u.rate=rate;u.pitch=1;u.onend=finish;u.onerror=finish;
      speechSynthesis.speak(u);
    }catch(e){finish()}
  });
}
async function announceTask(){
  announceTimer=null;
  const my=++sequence;if(!active()||!resultHidden())return;
  pauseAuto(false);
  const verb=($('#conjVerb')?.textContent||'').trim(),person=personForSpeech();
  const status=$('#conjStatus');if(status)status.textContent='Aufgabe wird vorgelesen …';
  await speak([verb,person].filter(Boolean).join('. '),.73);
  if(my!==sequence||!active()||!resultHidden())return;
  if(status)status.textContent=desiredAuto?'Ich höre …':'';
  if(desiredAuto){
    setAuto(true);
    setTimeout(()=>{if(active()&&resultHidden()&&!micOn())try{$('#conjMic').click()}catch(e){}},180);
  }
}
function scheduleAnnounce(delay=120){clearTimeout(announceTimer);announceTimer=setTimeout(announceTask,delay)}
function waitUntilSpeechEnds(){
  return new Promise(resolve=>{
    const started=Date.now();
    const tick=()=>{
      if(!speechBusy()||Date.now()-started>5000){resolve();return}
      setTimeout(tick,90);
    };
    setTimeout(tick,80);
  });
}
async function finishCorrect(){
  const box=$('#conjResult');if(!box||!box.classList.contains('correct')||box.dataset.rvtHeld==='1')return;
  const my=++sequence;pauseAuto(true);box.dataset.rvtHeld='1';box.classList.add('hidden','rvt-conj-hold');
  await waitUntilSpeechEnds();
  if(my!==sequence||!active())return;
  box.classList.remove('rvt-conj-hold');delete box.dataset.rvtHeld;
  // hidden bleibt bis zur neuen Karte: dadurch kann der alte 1,1-s-Timer nicht selbst weiterschalten.
  const next=$('#conjNext');if(next)next.click();
}
function prepareNext(){
  const cb=$('#conjAutoMic');
  // Bei einem automatischen Weiter nach richtiger Antwort ist Auto bereits absichtlich pausiert.
  pauseAuto(!!cb?.checked);
  ++sequence;scheduleAnnounce(120);
}
function installStyle(){if($('#rvtConjFlowStyle'))return;const s=document.createElement('style');s.id='rvtConjFlowStyle';s.textContent='.conj-result.hidden.rvt-conj-hold{display:block!important}';document.head.appendChild(s)}
function install(){
  if(installed||!$('#conjugationTab')||!$('#conjResult'))return false;installed=true;installStyle();
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('#conjugationTab')){pauseAuto(true);++sequence;scheduleAnnounce(170);return}
    if(e.target?.closest?.('#conjNext')){prepareNext();return}
  },true);
  document.addEventListener('change',e=>{
    if(e.target?.matches?.('#conjMode,#conjPoolSize')){pauseAuto(true);++sequence;scheduleAnnounce(150)}
  },true);
  const result=$('#conjResult');new MutationObserver(()=>{
    if(result.classList.contains('correct')&&!result.classList.contains('hidden'))setTimeout(finishCorrect,0);
  }).observe(result,{attributes:true,attributeFilter:['class']});
  const person=$('#conjPerson');if(person)new MutationObserver(()=>{
    if(active()&&resultHidden())scheduleAnnounce(100);
  }).observe(person,{childList:true,subtree:true,characterData:true});
  return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>60)clearInterval(timer)},200);
})();
