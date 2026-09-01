(() => {
'use strict';
const STORAGE_KEY='russischVokabeltrainer.v2';
const $=s=>document.querySelector(s);
const TYPE_LABEL={verb:'Verb',noun:'Substantiv',adjective:'Adjektiv',adverb:'Adverb',pronoun:'Pronomen',phrase:'Wendung',other:'Vokabel'};
let latestAlternatives=[];
let latestPrompt='';
let latestAt=0;

function stripMarks(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function normBasic(s){return stripMarks(s).toLocaleLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/\s+/g,' ');}
function normDe(s){return normBasic(s).replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');}
function normRu(s){return normBasic(s).replace(/ё/g,'е');}
function unique(arr){return [...new Set(arr.map(x=>String(x||'').trim()).filter(Boolean))];}
function stripGrammar(s){return String(s||'').replace(/\s*\+\s*(?:Dat(?:iv)?|Akk(?:usativ)?|Gen(?:itiv)?|Instr(?:umental)?|Präp(?:ositional)?|Präp\.?|Lok(?:ativ)?|Nom(?:inativ)?)[^,;]*/gi,'').trim();}
function stateWords(){try{const state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return Array.isArray(state.words)?state.words:[]}catch(e){return []}}
function narrowMatches(matches){
  if(matches.length<=1)return matches;
  const tag=$('#cardTag')?.textContent||'';
  const narrowed=matches.filter(w=>(!w.type||tag.includes(TYPE_LABEL[w.type]||''))&&(!w.topic||tag.includes(w.topic)));
  return narrowed.length?narrowed:matches;
}
function currentRussianCandidates(){
  if(!/russisch/i.test($('#answerLabel')?.textContent||''))return [];
  const prompt=($('#promptText')?.textContent||'').trim();if(!prompt)return [];
  let matches=narrowMatches(stateWords().filter(w=>normDe(w?.de)===normDe(prompt)));
  return unique(matches.flatMap(w=>[stripGrammar(w.ru),...(w.altRu||[]).map(stripGrammar)]));
}
function currentGermanCandidates(){
  if(!/deutsch/i.test($('#answerLabel')?.textContent||''))return [];
  const prompt=($('#promptText')?.textContent||'').trim();if(!prompt)return [];
  let matches=narrowMatches(stateWords().filter(w=>normRu(stripGrammar(w?.ru))===normRu(stripGrammar(prompt))));
  return unique(matches.flatMap(w=>[w.de,...(w.altDe||[])]));
}
function levenshtein(a,b){const m=a.length,n=b.length,d=Array(n+1).fill(0);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[n]}
function similarity(a,b){a=normRu(a);b=normRu(b);if(!a||!b)return 0;if(a===b)return 1;return 1-levenshtein(a,b)/Math.max(a.length,b.length);}
function phonetic(s){return normRu(s).replace(/[ьъ]/g,'').replace(/[аеёиоуыэюя]/g,'a').replace(/[бп]/g,'p').replace(/[вф]/g,'f').replace(/[гк]/g,'k').replace(/[дт]/g,'t').replace(/[жшщч]/g,'s').replace(/[зсц]/g,'z').replace(/[ий]/g,'i');}
function phoneticSimilarity(a,b){const x=phonetic(a),y=phonetic(b);if(!x||!y)return 0;if(x===y)return 1;return 1-levenshtein(x,y)/Math.max(x.length,y.length);}
function bestSourceForms(raw){
  const prompt=($('#promptText')?.textContent||'').trim();
  if(prompt!==latestPrompt||Date.now()-latestAt>5000)return [raw];
  return unique([raw,...latestAlternatives]);
}
function scorePair(source,target){
  const s=normRu(source),t=normRu(target);if(!s||!t)return {score:0,accept:false};
  if(s===t)return {score:1,accept:true};
  const targetWords=t.split(' '),sourceWords=s.split(' ');
  let charSim=similarity(s,t),bestToken=0;
  if(targetWords.length===1&&sourceWords.length>1){for(const w of sourceWords)bestToken=Math.max(bestToken,similarity(w,t));}
  const sim=Math.max(charSim,bestToken),len=t.replace(/\s/g,'').length,dist=levenshtein(s,t);let accept=false;
  if(targetWords.length===1){
    if(len<=3)accept=sim===1;else if(len<=5)accept=sim>=0.80||dist<=1;else if(len<=8)accept=sim>=0.72||dist<=2;else accept=sim>=0.70||dist<=3;
    const ph=Math.max(phoneticSimilarity(s,t),...sourceWords.map(w=>phoneticSimilarity(w,t)));
    if(!accept&&len>=5&&sim>=0.58&&ph>=0.86)accept=true;
    return {score:Math.max(sim,ph*0.92),accept};
  }
  if(sourceWords.length>=targetWords.length){let tokenSum=0,matched=0;for(const tw of targetWords){let best=0;for(const sw of sourceWords)best=Math.max(best,similarity(sw,tw));tokenSum+=best;if(best>=0.7)matched++;}const avg=tokenSum/targetWords.length;if(avg>=0.82&&matched===targetWords.length)accept=true;charSim=Math.max(charSim,avg);}
  if(charSim>=0.78)accept=true;return {score:charSim,accept};
}
function bestRussianMatch(raw){
  const candidates=currentRussianCandidates();if(!candidates.length)return null;
  const sources=bestSourceForms(raw);let best=null;
  for(const source of sources)for(const target of candidates){if(!/[а-яё]/i.test(target))continue;const r=scorePair(source,target);if(r.accept&&(!best||r.score>best.score))best={source,target,score:r.score};}
  return best;
}
function bestGermanExactAlternative(raw){
  const candidates=currentGermanCandidates();if(!candidates.length)return null;
  const sources=bestSourceForms(raw);
  for(const target of candidates){const nt=normDe(target);if(!nt)continue;for(const source of sources)if(normDe(source)===nt)return {source,target};}
  return null;
}
function germanNearMiss(raw){
  const candidates=currentGermanCandidates(),s=normDe(raw);if(!s)return false;
  for(const target of candidates){const t=normDe(target);if(!t||t.includes(' ')||s.includes(' '))continue;const len=t.length;if(len>=4&&len<=7&&s.length===len&&levenshtein(s,t)===1)return true;}
  return false;
}
function rememberResults(e){
  const prompt=($('#promptText')?.textContent||'').trim();if(prompt!==latestPrompt){latestAlternatives=[];latestPrompt=prompt;}
  const arr=[];try{const combined=[];for(let i=0;i<e.results.length;i++){const res=e.results[i];if(res?.[0]?.transcript)combined.push(res[0].transcript);for(let j=0;j<Math.min(5,res.length);j++)if(res[j]?.transcript)arr.push(res[j].transcript);}if(combined.length)arr.unshift(combined.join(' '));}catch(err){}
  latestAlternatives=unique(arr).slice(0,24);latestAt=Date.now();
}
function installRecognitionWrapper(){
  const Native=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Native||Native.__rvtToleranceWrapped)return;
  function Wrapped(){
    const r=new Native();try{r.addEventListener('result',rememberResults);}catch(e){}
    try{const phrases=[...currentRussianCandidates(),...currentGermanCandidates()];const Phrase=window.SpeechRecognitionPhrase;if(Phrase&&'phrases'in r&&phrases.length)r.phrases=phrases.slice(0,12).map(x=>new Phrase(x,4.5));}catch(e){}
    return r;
  }
  try{Object.setPrototypeOf(Wrapped,Native);Wrapped.prototype=Native.prototype;}catch(e){}Wrapped.__rvtToleranceWrapped=true;if(window.SpeechRecognition===Native)window.SpeechRecognition=Wrapped;if(window.webkitSpeechRecognition===Native)window.webkitSpeechRecognition=Wrapped;
}
function installSubmissionCorrection(){
  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('#checkAnswer');if(!btn)return;
    const input=$('#answerInput');if(!input?.classList.contains('voice-recognized'))return;
    const raw=input.value.trim();if(!raw)return;
    if(/russisch/i.test($('#answerLabel')?.textContent||'')){
      const match=bestRussianMatch(raw);if(!match)return;input.dataset.voiceRaw=raw;input.value=match.target;return;
    }
    if(/deutsch/i.test($('#answerLabel')?.textContent||'')){
      const exact=bestGermanExactAlternative(raw);if(exact){input.dataset.voiceRaw=raw;input.value=exact.target;return;}
      if(germanNearMiss(raw)){
        e.preventDefault();e.stopImmediatePropagation();input.value='';input.classList.remove('voice-recognized');document.dispatchEvent(new CustomEvent('rvt-voice-retry',{detail:{reason:'german-near-miss'}}));
      }
    }
  },true);
}
function install(){installRecognitionWrapper();installSubmissionCorrection();}
install();
})();