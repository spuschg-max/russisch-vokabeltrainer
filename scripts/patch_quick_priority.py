#!/usr/bin/env python3
from pathlib import Path

path=Path('app.js')
text=path.read_text(encoding='utf-8')
old="""function selectNext(){
 ensureActiveWindow();let pool=longReviewWords();currentMode='review';
 if(!pool.length){currentMode='learning';const active=activeLearningWords();pool=active.filter(w=>pFor(w.id).nextTurn<=state.sessionTurn).sort((a,b)=>pFor(a.id).nextTurn-pFor(b.id).nextTurn||wordIndex(a.id)-wordIndex(b.id));"""
new="""function selectNext(){
 ensureActiveWindow();const quick=activeLearningWords().filter(w=>pFor(w.id).quickRepeat&&pFor(w.id).nextTurn<=state.sessionTurn).sort((a,b)=>pFor(a.id).nextTurn-pFor(b.id).nextTurn||wordIndex(a.id)-wordIndex(b.id));let pool=quick;currentMode='learning';
 if(!pool.length){pool=longReviewWords();currentMode='review';}
 if(!pool.length){currentMode='learning';const active=activeLearningWords();pool=active.filter(w=>pFor(w.id).nextTurn<=state.sessionTurn).sort((a,b)=>pFor(a.id).nextTurn-pFor(b.id).nextTurn||wordIndex(a.id)-wordIndex(b.id));"""
if new in text:
    print('Schnelllern-Priorität bereits vorhanden.')
elif text.count(old)==1:
    text=text.replace(old,new,1)
    path.write_text(text,encoding='utf-8')
    print('Schnelllern-Priorität ergänzt.')
else:
    raise SystemExit(f'Erwarteten selectNext-Block nicht eindeutig gefunden: {text.count(old)}')
if 'const quick=activeLearningWords().filter(w=>pFor(w.id).quickRepeat' not in text:
    raise SystemExit('Prüfung fehlgeschlagen: Schnelllern-Priorität fehlt')
