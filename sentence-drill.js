(() => {
'use strict';
const STORAGE='russischVokabeltrainer.v2';
const EXERCISES='russischVokabeltrainer.exercises.v1';
const CFG_KEY='russischVokabeltrainer.sentences.v1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const RU_WORD=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
const DE_WORD=/[A-Za-zÄÖÜäöüß]+(?:[-’'][A-Za-zÄÖÜäöüß]+)*/g;
let round=[],pos=0,answerRecognition=null,dictRecognition=null,dictating=false;

function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch(e){return fallback}}
function saveCfg(c){localStorage.setItem(CFG_KEY,JSON.stringify(c))}
function cfg(){const c=loadJson(CFG_KEY,{});return {source:c.source||'a1a2',roundSize:Math.max(5,Math.min(50,Number(c.roundSize)||20)),customLang:c.customLang==='ru'?'ru':'de',custom:Array.isArray(c.custom)?c.custom:[],history:Array.isArray(c.history)?c.history:[]}}
function patchCfg(p){const c={...cfg(),...p};saveCfg(c);return c}
function state(){return loadJson(STORAGE,{words:[]})}
function store(){return loadJson(EXERCISES,{exercises:{},order:[]})}
function stripStress(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC')}
function nRu(s){return stripStress(s).toLocaleLowerCase().replace(/ё/g,'е').replace(/[^а-я -]/g,' ').replace(/\s+/g,' ').trim()}
function nDe(s){return String(s||'').toLocaleLowerCase('de-DE').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z -]/g,' ').replace(/\s+/g,' ').trim()}
function coreRu(s){return String(s||'').replace(/\s*\+\s*(?:Dat\.?|Dativ|Akk\.?|Akkusativ|Gen\.?|Genitiv|Instr\.?|Instrumental|Präp\.?|Praep\.?|Präpositiv|Praepositiv|Lok\.?|Lokativ).*$/i,'').trim()}
function parseForms(w){return String(w?.forms||'').split(';').map(x=>(x.split('=')[0]||'').trim()).filter(Boolean)}
function uniqueByRu(words){const m=new Map();for(const w of words||[]){const k=nRu(coreRu(w?.ru));if(k&&!m.has(k))m.set(k,w)}return [...m.values()]}
function allKnownWords(){
  const s=store(),out=[...(window.STANDARD_A1A2_VOCAB||[]),...(window.STANDARD_B1_VOCAB||[]),...(state().words||[])];
  for(const ex of Object.values(s.exercises||{}))out.push(...(ex?.state?.words||[]));
  return uniqueByRu(out);
}
function sourceWords(value){
  if(value==='a1a2')return window.STANDARD_A1A2_VOCAB||[];
  if(value==='b1')return window.STANDARD_B1_VOCAB||[];
  if(value.startsWith('exercise:'))return store().exercises?.[value.slice(9)]?.state?.words||[];
  if(value==='custom')return cfg().custom.map(x=>x.word||x);
  return state().words||[];
}
function ruTokens(text){return (stripStress(text).match(RU_WORD)||[]).map(nRu).filter(Boolean)}
function deTokens(text){return (String(text||'').match(DE_WORD)||[]).map(nDe).filter(Boolean)}
function stemRu(token){token=nRu(token);if(token.length<6)return'';return token.slice(0,Math.max(4,token.length-3))}
function stemDe(token){token=nDe(token);if(token.length<6)return'';return token.slice(0,Math.max(4,token.length-2))}
function makeMatcher(words){
  const ruExact=new Set(),ruStem=new Set(),ruPhrases=[];
  for(const w of words||[]){
    const terms=[coreRu(w?.ru),...(w?.altRu||[]),...parseForms(w)].filter(Boolean);
    for(const term of terms){const nt=nRu(term);if(!nt)continue;const tt=ruTokens(nt);if(tt.length>1){ruPhrases.push(nt);continue;}const t=tt[0]||nt;ruExact.add(t);const st=stemRu(t);if(st)ruStem.add(st);}
  }
  return {ruExact,ruStem,ruPhrases};
}
function matcherHas(pair,m){
  const ru=nRu(pair[1]);for(const p of m.ruPhrases)if(ru.includes(p))return true;
  for(const t of ruTokens(pair[1])){if(m.ruExact.has(t))return true;const s=stemRu(t);if(s&&m.ruStem.has(s))return true;}
  return false;
}
function customTermHas(pair,item){
  const w=item.word;
  if(w)return matcherHas(pair,makeMatcher([w]));
  const raw=String(item.label||'').trim();if(!raw)return false;
  if(item.lang==='ru'){
    const needle=nRu(raw),tokens=ruTokens(pair[1]);if(needle.includes(' '))return nRu(pair[1]).includes(needle);
    if(tokens.includes(needle))return true;const s=stemRu(needle);return !!s&&tokens.some(t=>stemRu(t)===s);
  }
  const needle=nDe(raw),tokens=deTokens(pair[0]);if(needle.includes(' '))return nDe(pair[0]).includes(needle);
  if(tokens.includes(needle))return true;const s=stemDe(needle);return !!s&&tokens.some(t=>stemDe(t)===s);
}
function pairId(pair){let h=2166136261;const s=pair[0]+'\u0000'+pair[1];for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function shuffled(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function sentenceBank(){return Array.isArray(window.RVT_SENTENCE_BANK)?window.RVT_SENTENCE_BANK:[]}
function buildRound(){
  const c=cfg(),bank=sentenceBank(),history=new Set(c.history.slice(-250)),limit=c.roundSize;let picked=[];
  if(!bank.length)return [];
  if(c.source==='custom'){
    const items=c.custom.filter(x=>x?.label||x?.word?.ru);if(!items.length)return[];
    const buckets=items.map(item=>shuffled(bank.map((p,i)=>[p,i]).filter(([p])=>customTermHas(p,item)).map(x=>x[1])));
    const used=new Set();let guard=0;
    while(picked.length<limit&&guard<limit*items.length*8){guard++;const bi=(picked.length+guard-1)%items.length,b=buckets[bi];if(!b?.length)continue;let idx=b.find(i=>!used.has(i)&&!history.has(pairId(bank[i])));if(idx===undefined)idx=b.find(i=>!used.has(i));if(idx===undefined)continue;used.add(idx);picked.push(bank[idx]);}
    if(picked.length<limit){const any=shuffled(bank.map((p,i)=>[p,i]).filter(([p])=>items.some(x=>customTermHas(p,x))));for(const [p,i] of any){if(picked.length>=limit)break;if(used.has(i))continue;used.add(i);picked.push(p);}}
  }else{
    const words=sourceWords(c.source),m=makeMatcher(words);const candidates=bank.filter(p=>matcherHas(p,m));
    const fresh=shuffled(candidates.filter(p=>!history.has(pairId(p)))),old=shuffled(candidates.filter(p=>history.has(pairId(p))));picked=[...fresh,...old].slice(0,limit);
  }
  return picked;
}
function populateSources(){
  const sel=$('#sentenceSource');if(!sel)return;const c=cfg(),s=store();let html='<option value="a1a2">A1/A2 – gesamter Pool</option><option value="b1">B1 – gesamter Pool</option>';
  for(const id of (s.order||[])){const ex=s.exercises?.[id];if(ex)html+=`<option value="exercise:${esc(id)}">Übung: ${esc(ex.name||id)}</option>`;}
  html+='<option value="custom">Eigene Wörter – gesprochen/eingegeben</option>';sel.innerHTML=html;if([...sel.options].some(o=>o.value===c.source))sel.value=c.source;else sel.value='a1a2';
  toggleCustom();
}
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function showView(){stopRecognitions();$$('.tabs .tab').forEach(b=>b.classList.toggle('active',b.id==='sentenceTab'));$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-sentences'));populateSources();renderCustom();renderMeta();}
function toggleCustom(){const box=$('#sentenceCustomBox');if(box)box.classList.toggle('hidden',$('#sentenceSource')?.value!=='custom')}
function renderMeta(){const m=window.RVT_SENTENCE_META||{},el=$('#sentenceMeta');if(el)el.textContent=m.pairs?`${m.pairs.toLocaleString('de-DE')} kurze deutsch-russische Satzpaare verfügbar · Satzquelle: Tatoeba (CC BY 2.0 FR).`: 'Satzbank wird geladen …'}
function renderCustom(){
  const c=cfg(),box=$('#sentenceCustomChips');if(!box)return;$('#sentenceDictLang').value=c.customLang;
  box.innerHTML=c.custom.map((x,i)=>`<button class="sentence-chip" type="button" data-i="${i}" title="Entfernen">${esc(x.label||x.word?.de||x.word?.ru)}${x.word?` <small>→ ${esc(x.lang==='ru'?x.word.de:x.word.ru)}</small>`:''} ×</button>`).join('')||'<span class="sentence-empty-chips">Noch keine eigenen Wörter.</span>';
  box.querySelectorAll('[data-i]').forEach(b=>b.addEventListener('click',()=>{const n=cfg();n.custom.splice(Number(b.dataset.i),1);saveCfg(n);renderCustom()}));
}
function resolveKnown(raw,lang){
  const target=lang==='ru'?nRu(raw):nDe(raw);if(!target)return null;
  let best=null;
  for(const w of allKnownWords()){
    const vals=lang==='ru'?[coreRu(w.ru),...(w.altRu||[])]:[w.de,...(w.altDe||[])];
    if(vals.some(v=>(lang==='ru'?nRu(v):nDe(v))===target)){best=w;break;}
  }
  return best;
}
function addCustom(raw,lang){raw=String(raw||'').trim();if(!raw)return 0;let chunks=[raw],whole=resolveKnown(raw,lang);if(!whole){const parts=raw.split(/[,;]+/).map(x=>x.trim()).filter(Boolean);chunks=parts.length>1?parts:raw.split(/\s+/).filter(Boolean)}
  const c=cfg();let added=0;
  for(const chunk of chunks){const w=resolveKnown(chunk,lang),label=chunk,key=w?`w:${nRu(coreRu(w.ru))}`:`${lang}:${lang==='ru'?nRu(chunk):nDe(chunk)}`;if(!key||c.custom.some(x=>x.key===key))continue;c.custom.push({key,label:chunk,lang,word:w?{id:w.id,ru:w.ru,de:w.de,altRu:w.altRu||[],forms:w.forms||'',type:w.type||'other'}:null});added++;}
  c.source='custom';saveCfg(c);if($('#sentenceSource'))$('#sentenceSource').value='custom';toggleCustom();renderCustom();return added;
}
function addManual(){const inp=$('#sentenceCustomInput'),lang=$('#sentenceDictLang').value;addCustom(inp.value,lang);inp.value='';inp.focus()}
function recognitionCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
function stopDictation(){dictating=false;if(dictRecognition)try{dictRecognition.stop()}catch(e){};dictRecognition=null;const b=$('#sentenceDictate');if(b)b.textContent='🎙 Wörter diktieren';}
function toggleDictation(){if(dictating){stopDictation();return}const R=recognitionCtor();if(!R){alert('Spracherkennung wird auf diesem Gerät nicht unterstützt.');return}dictating=true;const lang=$('#sentenceDictLang').value;patchCfg({customLang:lang});const b=$('#sentenceDictate');b.textContent='● Diktat stoppen';
  const start=()=>{if(!dictating)return;const r=new R();dictRecognition=r;r.lang=lang==='ru'?'ru-RU':'de-DE';r.continuous=true;r.interimResults=false;r.maxAlternatives=3;r.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)addCustom(e.results[i][0].transcript,lang)};r.onerror=()=>{};r.onend=()=>{if(dictating)setTimeout(start,180)};try{r.start()}catch(e){setTimeout(start,300)}};start();
}
function stopAnswerRec(){if(answerRecognition)try{answerRecognition.stop()}catch(e){};answerRecognition=null;const b=$('#sentenceMic');if(b)b.textContent='🎙';}
function startAnswerRec(){if($('#sentenceSolutionBox')&&!$('#sentenceSolutionBox').classList.contains('hidden'))return;const R=recognitionCtor();if(!R)return;stopAnswerRec();const r=new R();answerRecognition=r;r.lang='ru-RU';r.interimResults=true;r.continuous=false;r.maxAlternatives=3;$('#sentenceMic').textContent='●';r.onresult=e=>{let t='';for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript+' ';$('#sentenceAnswer').value=t.trim()};r.onend=()=>stopAnswerRec();r.onerror=()=>stopAnswerRec();try{r.start()}catch(e){stopAnswerRec()}}
function stopRecognitions(){stopDictation();stopAnswerRec();try{speechSynthesis.cancel()}catch(e){}}
function startRound(){stopRecognitions();const c=patchCfg({source:$('#sentenceSource').value,roundSize:Number($('#sentenceRoundSize').value)||20,customLang:$('#sentenceDictLang').value});round=buildRound();pos=0;if(!round.length){$('#sentenceCard').classList.add('hidden');$('#sentenceEmpty').classList.remove('hidden');$('#sentenceEmpty').innerHTML='<strong>Keine passenden Sätze gefunden.</strong><br>Wähle einen anderen Pool oder ergänze weitere eigene Wörter.';return}$('#sentenceEmpty').classList.add('hidden');$('#sentenceCard').classList.remove('hidden');showSentence()}
function showSentence(){const p=round[pos];if(!p)return finishRound();$('#sentencePrompt').textContent=p[0];$('#sentenceAnswer').value='';$('#sentenceSolution').textContent=p[1];$('#sentenceSolutionBox').classList.add('hidden');$('#sentenceShow').classList.remove('hidden');$('#sentenceProgress').textContent=`Satz ${pos+1}/${round.length}`;setTimeout(()=>$('#sentenceAnswer').focus(),50)}
function showSolution(){stopAnswerRec();$('#sentenceSolutionBox').classList.remove('hidden');$('#sentenceShow').classList.add('hidden');}
function repeatSentence(){try{speechSynthesis.cancel()}catch(e){};$('#sentenceSolutionBox').classList.add('hidden');$('#sentenceShow').classList.remove('hidden');$('#sentenceAnswer').value='';$('#sentenceAnswer').focus()}
function nextSentence(){const p=round[pos];if(p){const c=cfg();c.history=[...c.history,pairId(p)].slice(-250);saveCfg(c)}pos++;if(pos>=round.length)finishRound();else showSentence()}
function finishRound(){$('#sentenceCard').classList.add('hidden');const e=$('#sentenceEmpty');e.classList.remove('hidden');e.innerHTML='<strong>Runde geschafft.</strong><br><button id="sentenceAgain" class="primary" type="button">Noch 20 neue Sätze</button>';$('#sentenceAgain')?.addEventListener('click',startRound)}
function speakSolution(){const p=round[pos];if(!p||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(stripStress(p[1]));u.lang='ru-RU';u.rate=.76;speechSynthesis.speak(u)}catch(e){}}
function inject(){
  if($('#sentenceTab'))return true;const nav=$('.tabs'),main=$('main');if(!nav||!main)return false;
  const tab=document.createElement('button');tab.id='sentenceTab';tab.className='tab';tab.type='button';tab.textContent='Sätze';nav.appendChild(tab);
  const sec=document.createElement('section');sec.id='view-sentences';sec.className='view';sec.innerHTML=`
    <div class="sentence-head"><div><h2>Sätze übersetzen</h2><p>Jeder deutsche Satz enthält mindestens eine Vokabel aus dem gewählten Pool. Übersetze den ganzen Satz ins Russische.</p></div><button id="sentenceStart" class="primary" type="button">Runde starten</button></div>
    <div class="panel sentence-settings"><label>Vokabelquelle<select id="sentenceSource"></select></label><label>Sätze pro Runde<input id="sentenceRoundSize" type="number" min="5" max="50" step="5" value="20"></label><p id="sentenceMeta" class="sentence-meta"></p></div>
    <div id="sentenceCustomBox" class="panel sentence-custom hidden"><h3>Eigene Wörter</h3><p>Du kannst mehrere Wörter auf Deutsch oder Russisch diktieren. Erkannte bekannte Vokabeln werden automatisch zugeordnet.</p><div class="sentence-custom-controls"><select id="sentenceDictLang"><option value="de">Ich spreche Deutsch</option><option value="ru">Ich spreche Russisch</option></select><button id="sentenceDictate" class="secondary" type="button">🎙 Wörter diktieren</button></div><div class="sentence-manual"><input id="sentenceCustomInput" placeholder="Wort zusätzlich eingeben …"><button id="sentenceCustomAdd" class="secondary" type="button">Hinzufügen</button></div><div id="sentenceCustomChips" class="sentence-chips"></div></div>
    <article id="sentenceCard" class="learn-card sentence-card hidden"><div class="card-toolbar"><span id="sentenceProgress" class="pill"></span><span class="sentence-direction">Deutsch → Russisch</span></div><div class="side-label">Deutsch</div><div id="sentencePrompt" class="prompt-text sentence-prompt"></div><div class="answer-zone"><label for="sentenceAnswer">Deine russische Übersetzung</label><div class="answer-line"><input id="sentenceAnswer" autocomplete="off" autocapitalize="off" spellcheck="false"><button id="sentenceMic" class="icon-btn" type="button">🎙</button></div><button id="sentenceShow" class="primary" type="button">Lösung zeigen</button></div><div id="sentenceSolutionBox" class="sentence-solution hidden"><span>Musterlösung</span><strong id="sentenceSolution"></strong><div class="sentence-buttons"><button id="sentenceSpeak" class="secondary" type="button">🔊 Lösung hören</button><button id="sentenceRepeat" class="secondary" type="button">↪ Satz noch einmal</button><button id="sentenceNext" class="sentence-next" type="button">Weiter</button></div><p>Deine Übersetzung darf natürlich anders formuliert sein, solange sie dasselbe bedeutet.</p></div></article>
    <div id="sentenceEmpty" class="empty-state"><div class="empty-icon">文</div><h2>Eigene Satzrunde</h2><p>Wähle oben einen Vokabelpool und starte eine Runde.</p></div>`;main.appendChild(sec);
  const style=document.createElement('style');style.textContent=`.sentence-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:12px}.sentence-head h2{margin:0}.sentence-head p{margin:5px 0 0;color:var(--muted);font-size:13px}.sentence-settings{display:grid;grid-template-columns:minmax(220px,1fr) 150px;gap:12px}.sentence-settings label{display:grid;gap:5px;font-weight:800}.sentence-settings select,.sentence-settings input,.sentence-custom select,.sentence-manual input{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface);color:var(--text);font:inherit}.sentence-meta{grid-column:1/-1;margin:0;color:var(--muted);font-size:12px}.sentence-custom h3{margin-top:0}.sentence-custom-controls,.sentence-manual{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:9px}.sentence-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.sentence-chip{border:1px solid var(--line);background:var(--surface2);border-radius:999px;padding:7px 10px;color:var(--text)}.sentence-chip small{color:var(--muted)}.sentence-empty-chips{color:var(--muted);font-size:13px}.sentence-card{min-height:500px}.sentence-direction{color:var(--muted);font-size:12px;font-weight:800}.sentence-prompt{font-size:32px;line-height:1.25}.sentence-solution{margin-top:22px;padding:18px;border:2px solid #dc8a18;border-radius:14px;background:rgba(220,138,24,.08);text-align:center}.sentence-solution>span{display:block;color:var(--muted);font-size:12px;font-weight:800}.sentence-solution>strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:27px;margin:7px 0 14px}.sentence-buttons{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.sentence-next{border:0;border-radius:11px;background:#e58a16;color:#fff;font-weight:900;padding:12px}.sentence-solution p{margin:12px 0 0;color:var(--muted);font-size:12px}@media(max-width:650px){.sentence-head{align-items:stretch;flex-direction:column}.sentence-head .primary{width:100%}.sentence-settings{grid-template-columns:1fr}.sentence-meta{grid-column:1}.sentence-custom-controls,.sentence-manual{grid-template-columns:1fr}.sentence-buttons{grid-template-columns:1fr}.sentence-prompt{font-size:27px}}`;document.head.appendChild(style);
  tab.addEventListener('click',showView);$$('.tabs .tab:not(#sentenceTab)').forEach(b=>b.addEventListener('click',stopRecognitions));
  $('#sentenceSource').addEventListener('change',e=>{patchCfg({source:e.target.value});toggleCustom()});$('#sentenceRoundSize').value=cfg().roundSize;$('#sentenceRoundSize').addEventListener('change',e=>patchCfg({roundSize:Number(e.target.value)||20}));
  $('#sentenceDictLang').addEventListener('change',e=>patchCfg({customLang:e.target.value}));$('#sentenceDictate').addEventListener('click',toggleDictation);$('#sentenceCustomAdd').addEventListener('click',addManual);$('#sentenceCustomInput').addEventListener('keydown',e=>{if(e.key==='Enter')addManual()});
  $('#sentenceStart').addEventListener('click',startRound);$('#sentenceShow').addEventListener('click',showSolution);$('#sentenceMic').addEventListener('click',startAnswerRec);$('#sentenceSpeak').addEventListener('click',speakSolution);$('#sentenceRepeat').addEventListener('click',repeatSentence);$('#sentenceNext').addEventListener('click',nextSentence);
  populateSources();renderCustom();renderMeta();return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(inject()||tries>60)clearInterval(timer)},200);
})();
