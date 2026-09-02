(() => {
'use strict';
const KEY='russischVokabeltrainer.sentences.v1';
const $=s=>document.querySelector(s);
const CASES={
  any:{label:'beliebig'},
  acc:{label:'Akkusativ',patterns:[/(?:^|\s)(?:через|про|сквозь)\s+/iu]},
  dat:{label:'Dativ',patterns:[/(?:^|\s)(?:к|ко|благодаря|вопреки|согласно)\s+/iu]},
  gen:{label:'Genitiv',patterns:[/(?:^|\s)(?:без|для|до|из|изо|от|ото|у|около|после|кроме|против|вокруг|возле|вместо)\s+/iu]},
  ins:{label:'Instrumental',patterns:[/(?:^|\s)(?:над|перед|передо|между)\s+/iu]},
  prep:{label:'Präpositiv',patterns:[/(?:^|\s)(?:о|об|обо|при)\s+/iu]}
};
function cfg(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}}
function save(p){const c={...cfg(),...p};localStorage.setItem(KEY,JSON.stringify(c));}
function inject(){
  if($('#sentenceCase'))return true;
  const src=$('#sentenceSource');if(!src)return false;
  const wrap=src.closest('.sentence-field')||src.parentElement;if(!wrap)return false;
  const box=document.createElement('label');box.className='sentence-field sentence-case-field';box.innerHTML='<span>Kasus</span><select id="sentenceCase"><option value="any">beliebig</option><option value="acc">Akkusativ</option><option value="dat">Dativ</option><option value="gen">Genitiv</option><option value="ins">Instrumental</option><option value="prep">Präpositiv</option></select><small id="sentenceCaseHint"></small>';
  wrap.insertAdjacentElement('afterend',box);
  const c=cfg(),sel=$('#sentenceCase');sel.value=CASES[c.caseMode]?c.caseMode:'any';
  sel.addEventListener('change',()=>{save({caseMode:sel.value});renderHint();window.dispatchEvent(new CustomEvent('rvt-sentence-case-change',{detail:{caseMode:sel.value}}));});
  const style=document.createElement('style');style.textContent='.sentence-case-field small{display:block;margin-top:5px;color:var(--muted);font-size:12px}.sentence-case-badge{display:inline-block;margin-left:8px;padding:3px 8px;border-radius:999px;background:#f4a340;color:#2c1a00;font-weight:900;font-size:12px}';document.head.appendChild(style);
  renderHint();return true;
}
function renderHint(){const v=$('#sentenceCase')?.value||'any',h=$('#sentenceCaseHint');if(!h)return;h.textContent=v==='any'?'Kein Kasusfilter.':`Jeder Satz soll eine eindeutige ${CASES[v].label}-Konstruktion enthalten.`;}
function matches(text,mode){if(mode==='any')return true;const c=CASES[mode];return !!c&&c.patterns.some(r=>r.test(String(text||'')));}
function annotateSolution(){const mode=$('#sentenceCase')?.value||cfg().caseMode||'any';const sol=$('#sentenceSolution');if(!sol||mode==='any')return;const box=$('#sentenceSolutionBox');if(!box||box.querySelector('.sentence-case-badge'))return;const b=document.createElement('span');b.className='sentence-case-badge';b.textContent=CASES[mode].label;sol.insertAdjacentElement('afterend',b);}
function expose(){window.__rvtSentenceCase={matches,mode:()=>$('#sentenceCase')?.value||cfg().caseMode||'any',label:m=>CASES[m]?.label||''};}
function watch(){const sol=$('#sentenceSolutionBox');if(sol)new MutationObserver(()=>{if(!sol.classList.contains('hidden'))annotateSolution()}).observe(sol,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});}
let tries=0;const timer=setInterval(()=>{tries++;if(inject()){clearInterval(timer);watch();expose()}else if(tries>80)clearInterval(timer)},125);
})();
