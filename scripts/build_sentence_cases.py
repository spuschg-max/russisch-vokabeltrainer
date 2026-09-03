#!/usr/bin/env python3
import csv, io, json, re, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BANK=ROOT/'sentence-bank-data.js'
OUT=ROOT/'sentence-case-data.js'
BASE='https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/'
SOURCES=['nouns.csv','adjectives.csv','others.csv']
CASE_FIELDS={
 'acc':['acc','accusative','_acc'],
 'dat':['dat','dative','_dat'],
 'gen':['gen','genitive','_gen'],
 'ins':['inst','instr','instrumental','_inst'],
 'pre':['prep','prepositional','locative','_prep'],
}
WORD_RE=re.compile(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*')


def fetch(name):
    req=urllib.request.Request(BASE+name,headers={'User-Agent':'russisch-vokabeltrainer-build/1.0'})
    with urllib.request.urlopen(req,timeout=90) as r:
        return r.read().decode('utf-8-sig')

def norm(s):
    s=str(s or '').lower().replace('ё','е').replace("'",'').replace('´','')
    s=re.sub(r'[\u0300-\u036f]','',s)
    return re.sub(r'[^а-я-]','',s)

def variants(raw):
    raw=str(raw or '').strip()
    if not raw:return []
    vals=[]
    for part in re.split(r'[;,/]',raw):
        p=norm(part.strip(' ()*'))
        if p: vals.append(p)
    return vals

def detect_case(field):
    f=field.lower()
    for case,needles in CASE_FIELDS.items():
        if any(n in f for n in needles): return case
    return None

def build_form_map():
    forms={}
    for name in SOURCES:
        try:text=fetch(name)
        except Exception as e:
            print(f'{name}: übersprungen ({e})');continue
        reader=csv.DictReader(io.StringIO(text),delimiter='\t')
        case_cols=[(h,detect_case(h)) for h in (reader.fieldnames or [])]
        case_cols=[x for x in case_cols if x[1]]
        rows=0
        for row in reader:
            rows+=1
            for col,case in case_cols:
                for v in variants(row.get(col,'')):
                    forms.setdefault(v,set()).add(case)
        print(f'{name}: {rows} Datensätze · {len(case_cols)} Kasusspalten')
    # Nur Formen behalten, die morphologisch genau einem der Zielkasus zugeordnet sind.
    unique={k:next(iter(v)) for k,v in forms.items() if len(v)==1}
    print(f'Eindeutige Kasusformen: {len(unique)}')
    return unique

def load_bank():
    text=BANK.read_text(encoding='utf-8')
    m=re.search(r'window\.RVT_SENTENCE_BANK=(\[.*?\]);\s*window\.RVT_SENTENCE_META=',text,re.S)
    if not m: raise RuntimeError('Satzbankformat nicht erkannt')
    return json.loads(m.group(1))

def main():
    form_case=build_form_map();pairs=load_bank();rows=[];counts={k:0 for k in CASE_FIELDS}
    for de,ru,*_ in pairs:
        found={}
        for token in WORD_RE.findall(ru):
            n=norm(token);case=form_case.get(n)
            if case and case not in found: found[case]=token
        mask=''.join(c for c in 'adgip' if {'a':'acc','d':'dat','g':'gen','i':'ins','p':'pre'}[c] in found)
        ex=[found.get('acc',''),found.get('dat',''),found.get('gen',''),found.get('ins',''),found.get('pre','')]
        rows.append([mask,*ex])
        for case in found: counts[case]+=1
    OUT.write_text('window.RVT_SENTENCE_CASES='+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print('Kasus-Sätze: '+' · '.join(f'{k} {v}' for k,v in counts.items()))
    if min(counts.values())<500: raise RuntimeError(f'Zu wenige Sätze für mindestens einen Kasus: {counts}')

if __name__=='__main__':main()
