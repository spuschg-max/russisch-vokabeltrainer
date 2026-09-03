#!/usr/bin/env python3
import csv
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FILES=['data.js','standard-a1a2-data.js','standard-b1-data.js']
OPENRUSSIAN=[
 'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/nouns.csv',
 'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv',
 'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv',
 'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/others.csv',
]
CYR_TOKEN=re.compile(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*')
STRESS_AFTER_VOWEL=re.compile(r"([АЕЁИОУЫЭЮЯаеёиоуыэюя])['´]")
COMBINING='\u0301'
ADJ_EXTRA=['comparative','superlative','short_m','short_f','short_n','short_pl']

def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'russisch-vokabeltrainer-build/1.0'})
 with urllib.request.urlopen(req,timeout=90) as r:return r.read().decode('utf-8-sig')

def plain(s):return str(s or '').replace(COMBINING,'').strip().lower().replace('ё','е')

def stressed(raw):
 text=str(raw or '').strip().replace('´',"'")
 if "'" not in text:return None
 out=STRESS_AFTER_VOWEL.sub(lambda m:m.group(1)+COMBINING,text)
 return out if "'" not in out else None

def wanted_tokens():
 out=set()
 for name in FILES:
  p=ROOT/name
  if not p.exists():continue
  text=p.read_text(encoding='utf-8')
  for token in CYR_TOKEN.findall(text):
   if len(token)>1:out.add(plain(token))
 return out

def add(candidates,wanted,raw):
 for part in re.split(r'\s*;\s*',str(raw or '')):
  s=stressed(part)
  if not s:continue
  k=plain(s)
  if k in wanted:candidates.setdefault(k,set()).add(s)

def build():
 wanted=wanted_tokens();candidates={};rows=0
 for url in OPENRUSSIAN:
  reader=csv.DictReader(io.StringIO(fetch(url)),delimiter='\t');is_adj=url.endswith('/adjectives.csv')
  for row in reader:
   rows+=1;add(candidates,wanted,row.get('accented',''))
   if is_adj:
    for field in ADJ_EXTRA:add(candidates,wanted,row.get(field,''))
 unique={k:next(iter(v)) for k,v in candidates.items() if len(v)==1}
 payload='window.RVT_STRESS_LEXICON='+json.dumps(unique,ensure_ascii=False,separators=(',',':'))+';\n'
 payload+='window.RVT_STRESS_META='+json.dumps({'source':'OpenRussian / Russian Dictionary Data','license':'CC BY-SA 4.0','entries':len(unique),'scope':'active-vocabulary-only'},ensure_ascii=False,separators=(',',':'))+';\n'
 (ROOT/'stress-lexicon-data.js').write_text(payload,encoding='utf-8')
 print(f'Aktives Betonungslexikon: {len(unique)} Einträge für {len(wanted)} vorkommende russische Tokens')
 if len(unique)<300:raise RuntimeError('Zu wenige Betonungsformen erzeugt')
if __name__=='__main__':build()
