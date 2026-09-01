(() => {
'use strict';
const api=window.__rvtSpeechCandidates;
if(!api||typeof api.assessRussian!=='function'||api.__segmentationEnhanced)return;

function stripMarks(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC');}
function norm(s){return stripMarks(s).toLocaleLowerCase().trim().replace(/[.,!?;:()„“"'’]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ');}
function compact(s){return norm(s).replace(/\s+/g,'');}
function levenshtein(a,b){const n=b.length,d=Array(n+1);for(let j=0;j<=n;j++)d[j]=j;for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const old=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return d[n];}
function sim(a,b){if(!a||!b)return 0;if(a===b)return 1;return 1-levenshtein(a,b)/Math.max(a.length,b.length);}
function phonetic(s){return compact(s).replace(/[ьъ]/g,'').replace(/[аеёиоуыэюя]/g,'a').replace(/[бп]/g,'p').replace(/[вф]/g,'f').replace(/[гк]/g,'k').replace(/[дт]/g,'t').replace(/[жшщч]/g,'s').replace(/[зсц]/g,'z').replace(/[ий]/g,'i');}
function splitWordMatch(raw){
  const source=norm(raw),parts=source.split(' ').filter(Boolean);
  if(parts.length<2||parts.length>3)return null;
  const candidates=typeof api.russian==='function'?api.russian():[];
  let best=null;
  for(const targetRaw of candidates){
    const target=norm(targetRaw);
    if(!target||target.includes(' '))continue;
    const t=compact(target),s=compact(source),len=t.length;
    if(len<6)continue;
    const charScore=sim(s,t),phonScore=sim(phonetic(s),phonetic(t));
    const accept=s===t||charScore>=0.72||(charScore>=0.52&&phonScore>=0.78)||(len>=9&&charScore>=0.48&&phonScore>=0.72);
    if(!accept)continue;
    const score=Math.max(charScore,phonScore*0.94);
    if(!best||score>best.score)best={source:raw,target:targetRaw,score};
  }
  return best;
}

const base=api.assessRussian.bind(api);
api.assessRussian=function(raw){
  const result=base(raw)||{accepted:false,grossMismatch:false,bestScore:0};
  if(result.accepted)return result;
  const match=splitWordMatch(raw);
  if(match)return {accepted:true,grossMismatch:false,bestScore:match.score,match};
  return result;
};
api.__segmentationEnhanced=true;
})();