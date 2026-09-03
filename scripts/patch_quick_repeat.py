#!/usr/bin/env python3
from pathlib import Path

path = Path('app.js')
text = path.read_text(encoding='utf-8')
original = text


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count == 0 and new in text:
        print(f'{label}: bereits vorhanden')
        return
    if count != 1:
        raise SystemExit(f'{label}: erwartet 1 Treffer, gefunden {count}')
    text = text.replace(old, new, 1)
    print(f'{label}: ergänzt')

replace_once(
    "postponed:false,dirStreak:{'ru-de':0,'de-ru':0}",
    "postponed:false,quickRepeat:false,dirStreak:{'ru-de':0,'de-ru':0}",
    'quickRepeat Standardwert',
)

replace_once(
    "if(typeof p.postponed!=='boolean')p.postponed=false;",
    "if(typeof p.postponed!=='boolean')p.postponed=false;if(typeof p.quickRepeat!=='boolean')p.quickRepeat=false;",
    'quickRepeat Migration',
)

replace_once(
    " extraMode=false;ensureActiveWindow();save();current=null;selectNext();renderProgress();}",
    " if(p.quickRepeat){p.active=true;p.postponed=false;p.reviewStage=0;p.due=0;p.nextTurn=state.sessionTurn+2;}\n extraMode=false;ensureActiveWindow();save();current=null;selectNext();renderProgress();}",
    'Schnelllern-Abstand nach Bewertung',
)

replace_once(
    " p.active=false;p.level=5;p.reviewStage=1;p.due=now()+7*DAY;p.nextTurn=state.sessionTurn;toast('Vokabel als sicher markiert – Wiederholung in einer Woche');",
    " p.active=false;p.level=5;p.reviewStage=1;p.due=now()+7*DAY;p.nextTurn=state.sessionTurn;if(p.quickRepeat){p.active=true;p.reviewStage=0;p.due=0;p.nextTurn=state.sessionTurn+2;toast('Schnelllernen bleibt aktiv – nach zwei anderen Vokabeln wieder');}else toast('Vokabel als sicher markiert – Wiederholung in einer Woche');",
    'Schnelllernen bei Kann ich',
)

bridge = """window.__rvtQuickRepeatCore={
 currentId:()=>current?.id||null,
 isOn:id=>!!(id&&state?.progress?.[id]?.quickRepeat),
 set:(id,on)=>{
  if(!id||!state?.words?.some(w=>w.id===id))return false;
  const p=pFor(id);p.quickRepeat=!!on;p.postponed=false;state.postponedIds=state.postponedIds.filter(x=>x!==id);
  if(p.quickRepeat){p.active=true;p.reviewStage=0;p.due=0;p.nextTurn=state.sessionTurn;}
  else if(wordSecure(p)){p.active=false;p.level=5;p.reviewStage=Math.max(1,p.reviewStage||1);p.due=now()+7*DAY;p.nextTurn=state.sessionTurn;}
  else{p.active=true;p.reviewStage=0;p.due=0;p.nextTurn=state.sessionTurn+5;}
  save();return true;
 }
};
"""

if 'window.__rvtQuickRepeatCore=' not in text:
    needle = 'function levelName(p){'
    if text.count(needle) != 1:
        raise SystemExit(f'Kernschnittstelle: erwartet 1 levelName, gefunden {text.count(needle)}')
    text = text.replace(needle, bridge + needle, 1)
    print('Kernschnittstelle: ergänzt')
else:
    print('Kernschnittstelle: bereits vorhanden')

if text == original:
    print('Keine Änderung nötig.')
else:
    path.write_text(text, encoding='utf-8')
    print('app.js aktualisiert.')

# Sicherheitsprüfungen
checks = [
    'quickRepeat:false',
    'if(typeof p.quickRepeat',
    'p.nextTurn=state.sessionTurn+2',
    'window.__rvtQuickRepeatCore=',
]
for item in checks:
    if item not in text:
        raise SystemExit(f'Prüfung fehlgeschlagen: {item}')
