(() => {
'use strict';
const STORAGE='russischVokabeltrainer.v2';
const $=s=>document.querySelector(s);
const PERSONS=['я','ты','он/она','мы','вы','они'];
const FALLBACK={
  'идти':['иду','идёшь','идёт','идём','идёте','идут'],
  'ходить':['хожу','ходишь','ходит','ходим','ходите','ходят'],
  'пойти':['пойду','пойдёшь','пойдёт','пойдём','пойдёте','пойдут'],
  'ехать':['еду','едешь','едет','едем','едете','едут'],
  'ездить':['езжу','ездишь','ездит','ездим','ездите','ездят'],
  'поехать':['поеду','поедешь','поедет','поедем','поедете','поедут']
};
const STRESSED={
  'идти':['иду́','идёшь','идёт','идём','идёте','иду́т'],
  'ходить':['хожу́','хо́дишь','хо́дит','хо́дим','хо́дите','хо́дят'],
  'пойти':['пойду́','пойдёшь','пойдёт','пойдём','пойдёте','пойду́т'],
  'ехать':['е́ду','е́дешь','е́дет','е́дем','е́дете','е́дут'],
  'ездить':['е́зжу','е́здишь','е́здит','е́здим','е́здите','е́здят'],
  'поехать':['пое́ду','пое́дешь','пое́дет','пое́дем','пое́дете','пое́дут']
};
let speakingAll=false,stopRequested=false;
function stripMarks(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function norm(s){return stripMarks(s).toLocaleLowerCase().trim().replace(/ё/g,'е');}
function accentNotation(s){return String(s||'').replace(/([аеёиоуыэюяАЕЁИОУЫЭЮЯ])['´]/g,'$1\u0301');}
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function mainWords(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}').words||[]}catch(e){return[]}}
function parseWordForms(w){
  const raw=String(w?.forms||'').trim();if(!raw)return[];
  return raw.split(';').map(x=>{const i=x.indexOf('=');return accentNotation((i>=0?x.slice(0,i):x).trim())}).filter(Boolean).slice(0,6);
}
function currentData(){
  const lemma=String($('#conjVerb')?.textContent||'').trim();if(!lemma)return null;
  const key=norm(lemma),w=mainWords().find(x=>norm(x?.ru)===key),fromWord=parseWordForms(w);
  const plain=fromWord.length===6?fromWord:(FALLBACK[key]||[]);
  if(plain.length!==6)return null;
  const stressed=(STRESSED[key]||plain).map(accentNotation);
  return {lemma,w,forms:stressed};
}
function micWasListening(){return $('#conjMic')?.textContent?.trim()==='●';}
function pauseMic(){const b=$('#conjMic');if(micWasListening()&&b){try{b.click()}catch(e){}}}
function resumeMic(wasListening){
  if(!wasListening||!$('#conjAutoMic')?.checked||!$('#view-conjugation')?.classList.contains('active'))return;
  setTimeout(()=>{const b=$('#conjMic');if(b&&b.textContent.trim()!=='●'&&$('#conjResult')?.classList.contains('hidden'))try{b.click()}catch(e){}},650);
}
function speakText(text,{cancel=true,rate=.72,onend}={}){
  if(!text||!('speechSynthesis'in window)){onend?.();return;}
  try{
    if(cancel)speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(stripMarks(text));u.lang='ru-RU';u.rate=rate;u.pitch=1;
    u.onend=()=>onend?.();u.onerror=()=>onend?.();speechSynthesis.speak(u);
  }catch(e){onend?.();}
}
function speakOne(text){
  const was=micWasListening();pauseMic();
  speakText(text,{cancel:true,rate:.72,onend:()=>resumeMic(was)});
}
function setAllButton(){const b=$('#conjSpeakAll');if(!b)return;b.textContent=speakingAll?'■ Stoppen':'▶ Los – alle sechs langsam vorlesen';b.classList.toggle('playing',speakingAll);}
function stopAll(){stopRequested=true;speakingAll=false;try{speechSynthesis.cancel()}catch(e){}setAllButton();}
function speakAll(){
  if(speakingAll){stopAll();return;}
  const d=currentData();if(!d)return;const was=micWasListening();pauseMic();speakingAll=true;stopRequested=false;setAllButton();
  let i=0;
  const next=()=>{
    if(stopRequested||i>=d.forms.length){speakingAll=false;setAllButton();resumeMic(was);return;}
    const text=d.forms[i++];
    speakText(text,{cancel:false,rate:.66,onend:()=>setTimeout(next,520)});
  };
  try{speechSynthesis.cancel()}catch(e){};setTimeout(next,120);
}
function render(){
  const box=$('#conjStudyList'),d=currentData();if(!box)return;
  if(!d){box.innerHTML='<p class="conj-study-empty">Für dieses Verb sind noch keine sechs Formen hinterlegt.</p>';return;}
  box.innerHTML=d.forms.map((f,i)=>`<div class="conj-study-row"><span class="conj-study-person">${PERSONS[i]}</span><strong>${esc(f)}</strong><button type="button" class="conj-study-one" data-i="${i}" aria-label="${esc(PERSONS[i])} vorlesen">🔊</button></div>`).join('');
  box.querySelectorAll('.conj-study-one').forEach(b=>b.addEventListener('click',()=>speakOne(d.forms[Number(b.dataset.i)])));
}
function inject(){
  if($('#conjStudy'))return;const card=$('#conjCard');if(!card)return false;
  const details=document.createElement('details');details.id='conjStudy';details.className='panel conj-study';details.innerHTML=`<summary>📖 Formen ansehen & hören</summary><div class="conj-study-inner"><p class="conj-study-note">Alle sechs Formen mit Betonungszeichen. Einzelne Form mit 🔊 oder die ganze Reihe langsam nacheinander.</p><div id="conjStudyList"></div><button id="conjSpeakAll" class="secondary conj-speak-all" type="button">▶ Los – alle sechs langsam vorlesen</button></div>`;
  card.parentNode.insertBefore(details,card.nextSibling);
  const style=document.createElement('style');style.textContent=`.conj-study{margin-top:14px}.conj-study summary{cursor:pointer;font-weight:900;font-size:15px}.conj-study-inner{padding-top:12px}.conj-study-note{margin:0 0 10px;color:var(--muted);font-size:13px}.conj-study-row{display:grid;grid-template-columns:78px 1fr 44px;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line)}.conj-study-row:last-child{border-bottom:0}.conj-study-person{font-weight:800;color:var(--muted)}.conj-study-row strong{font-family:Georgia,'Times New Roman',serif;font-size:23px}.conj-study-one{border:1px solid var(--line);background:var(--surface);border-radius:9px;min-height:38px;font-size:18px}.conj-speak-all{width:100%;margin-top:14px;font-weight:900}.conj-speak-all.playing{border-color:#d18412}.conj-study-empty{color:var(--muted)}@media(max-width:650px){.conj-study-row{grid-template-columns:68px 1fr 42px}.conj-study-row strong{font-size:22px}}`;document.head.appendChild(style);
  details.addEventListener('toggle',()=>{if(details.open)render();else if(speakingAll)stopAll()});
  $('#conjSpeakAll').addEventListener('click',speakAll);
  const verb=$('#conjVerb');if(verb)new MutationObserver(()=>{if(speakingAll)stopAll();if(details.open)render()}).observe(verb,{childList:true,subtree:true,characterData:true});
  render();return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(inject()||tries>40)clearInterval(timer)},250);
})();
