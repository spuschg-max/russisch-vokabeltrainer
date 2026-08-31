#!/usr/bin/env python3
import csv
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SMARTOOL = {
    'A1': 'https://raw.githubusercontent.com/smartool/data-rus-eng/main/SMARTool_data_A1.csv',
    'A2': 'https://raw.githubusercontent.com/smartool/data-rus-eng/main/SMARTool_data_A2.csv',
    'B1': 'https://raw.githubusercontent.com/smartool/data-rus-eng/main/SMARTool_data_B1.csv',
}
OPENRUSSIAN = [
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/nouns.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/others.csv',
]

TOPICS = {
    'еда': 'Essen', 'магазин': 'Einkaufen', 'люди': 'Menschen',
    'учёба/работа': 'Lernen/Arbeit', 'путешествие': 'Reisen', 'жильё': 'Wohnen',
    'свободное время': 'Freizeit', 'описание': 'Beschreibung', 'время': 'Zeit',
    'здоровье': 'Gesundheit', 'погода': 'Wetter', 'общение': 'Kommunikation',
    'внутренний мир': 'Gefühle/Gedanken', 'мера': 'Maße/Zahlen',
    'животные/растения': 'Tiere/Pflanzen', 'транспорт': 'Verkehr',
    'политика': 'Gesellschaft/Politik', 'одежда': 'Kleidung',
}


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'russisch-vokabeltrainer-build/1.0'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode('utf-8-sig')


def norm(s):
    return re.sub(r'\s+', ' ', str(s or '').strip().lower()).replace('ё', 'е')


def clean_translation(s):
    s = re.sub(r'<[^>]+>', '', str(s or ''))
    s = s.replace('&quot;', '"').replace('&amp;', '&').strip()
    return re.sub(r'\s+', ' ', s)


def split_translations(s):
    raw = clean_translation(s)
    if not raw:
        return []
    parts = [clean_translation(x) for x in raw.split(';')]
    out = []
    for p in parts:
        if not p or p in out:
            continue
        out.append(p)
        if len(out) >= 6:
            break
    return out


def pick_col(fieldnames, choices):
    lookup = {norm(x): x for x in (fieldnames or []) if x}
    for c in choices:
        if norm(c) in lookup:
            return lookup[norm(c)]
    return None


def load_german():
    exact = {}
    folded = {}
    total = 0
    for url in OPENRUSSIAN:
        text = fetch(url)
        # Die OpenRussian-Dateien heißen .csv, sind tatsächlich aber TSV-Dateien.
        reader = csv.DictReader(io.StringIO(text), delimiter='\t')
        bare_col = pick_col(reader.fieldnames, ['bare', 'word', 'lemma'])
        de_col = pick_col(reader.fieldnames, ['translations_de', 'translation_de', 'de'])
        if not bare_col or not de_col:
            raise RuntimeError(f'OpenRussian-Spalten nicht gefunden in {url}: {reader.fieldnames}')
        for row in reader:
            bare = clean_translation(row.get(bare_col, ''))
            vals = split_translations(row.get(de_col, ''))
            if not bare or not vals:
                continue
            total += 1
            exact.setdefault(bare.lower(), [])
            folded.setdefault(norm(bare), [])
            for target in (exact[bare.lower()], folded[norm(bare)]):
                for v in vals:
                    if v not in target:
                        target.append(v)
    print(f'OpenRussian: {total} deutsch übersetzte Datensätze geladen')
    return exact, folded


def pos_type(pos):
    p = str(pos or '').strip().lower()
    if p.startswith('adv'):
        return 'adverb'
    if p.startswith('pron'):
        return 'pronoun'
    if p.startswith('v'):
        return 'verb'
    if p.startswith('n'):
        return 'noun'
    if p.startswith('a'):
        return 'adjective'
    return 'other'


def topic_text(level, raw):
    topics = []
    for item in re.split(r'\s*,\s*', str(raw or '').strip().strip('"')):
        item = item.strip()
        if not item:
            continue
        de = TOPICS.get(item, item)
        if de not in topics:
            topics.append(de)
    return level + ((' · ' + ' / '.join(topics[:3])) if topics else '')


def load_smartool(levels):
    items = {}
    order = []
    for level in levels:
        text = fetch(SMARTOOL[level])
        reader = csv.DictReader(io.StringIO(text))
        lemma_col = pick_col(reader.fieldnames, ['Target language lemma'])
        pos_col = pick_col(reader.fieldnames, ['POS'])
        level_col = pick_col(reader.fieldnames, ['Level'])
        topic_col = pick_col(reader.fieldnames, ['Topic(s)'])
        if not lemma_col or not pos_col or not level_col:
            raise RuntimeError(f'SMARTool-Spalten nicht gefunden: {reader.fieldnames}')
        for row in reader:
            if str(row.get(level_col, '')).strip() != level:
                continue
            lemma = clean_translation(row.get(lemma_col, ''))
            pos = clean_translation(row.get(pos_col, ''))
            if not lemma or not pos or 'deleted' in lemma.lower():
                continue
            key = norm(lemma)
            if key not in items:
                items[key] = {
                    'ru': lemma,
                    'level': level,
                    'type': pos_type(pos),
                    'topics': [],
                }
                order.append(key)
            raw_topic = clean_translation(row.get(topic_col, '')) if topic_col else ''
            if raw_topic and raw_topic not in items[key]['topics']:
                items[key]['topics'].append(raw_topic)
    print(f"SMARTool {'/'.join(levels)}: {len(items)} eindeutige Lemmata")
    return [items[k] for k in order]


def build_pack(exact, folded, levels, out_name, js_prefix, id_prefix, name, description, min_words):
    smart = load_smartool(levels)
    words = []
    missing = []
    for item in smart:
        ru = item['ru']
        vals = exact.get(ru.lower()) or folded.get(norm(ru)) or []
        vals = [v for v in vals if v]
        if not vals:
            missing.append(ru)
            continue
        vals = sorted(dict.fromkeys(vals), key=lambda x: (len(x) > 55, len(x)))
        primary = vals[0]
        alternatives = [x for x in vals[1:6] if x != primary]
        topic_raw = ', '.join(item['topics'])
        words.append({
            'id': f"{id_prefix}::{norm(ru)}",
            'ru': ru,
            'de': primary,
            'altDe': alternatives,
            'altRu': [],
            'type': item['type'],
            'topic': topic_text(item['level'], topic_raw),
            'note': f"Standardwortschatz {item['level']}",
            'forms': '',
            'cefr': item['level'],
        })
    level_order = {level: i for i, level in enumerate(levels)}
    words.sort(key=lambda w: (level_order.get(w['cefr'], 99), w['ru']))
    meta = {
        'version': 1,
        'name': name,
        'description': description,
        'license': 'CC BY-SA 4.0 (kombinierter Datenbestand)',
        'sources': [
            {'name': 'SMARTool data-rus-eng', 'license': 'CC BY 4.0', 'url': 'https://github.com/smartool/data-rus-eng'},
            {'name': 'OpenRussian / Russian Dictionary Data', 'license': 'CC BY-SA 4.0', 'url': 'https://github.com/Badestrand/russian-dictionary'},
        ],
        'levels': list(levels),
        'missingGermanCount': len(missing),
        'wordCount': len(words),
    }
    out = ROOT / out_name
    payload = f'window.{js_prefix}_META=' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += f'window.{js_prefix}_VOCAB=' + json.dumps(words, ensure_ascii=False, separators=(',', ':')) + ';\n'
    out.write_text(payload, encoding='utf-8')
    print(f'Erzeugt: {out.name} mit {len(words)} Vokabeln; {len(missing)} ohne deutsche Zuordnung übersprungen')
    if missing:
        print(f"Ohne deutsche Zuordnung {name} (erste 40): " + ', '.join(missing[:40]))
    if len(words) < min_words:
        raise RuntimeError(f'Zu wenige Wörter für {name} erzeugt; Quelldaten prüfen.')


def build():
    exact, folded = load_german()
    build_pack(
        exact, folded,
        ('A1', 'A2'),
        'standard-a1a2-data.js',
        'STANDARD_A1A2',
        'std-a1a2',
        'Standardwortschatz A1/A2',
        'Freier russischer A1/A2-Grundwortschatz: CEFR-Auswahl nach SMARTool, deutsche Bedeutungen aus OpenRussian.',
        400,
    )
    build_pack(
        exact, folded,
        ('B1',),
        'standard-b1-data.js',
        'STANDARD_B1',
        'std-b1',
        'Standardwortschatz B1',
        'Freier russischer B1-Aufbauwortschatz: B1-Auswahl nach SMARTool, deutsche Bedeutungen aus OpenRussian. A1/A2 bleiben als eigene Übung getrennt.',
        300,
    )


if __name__ == '__main__':
    build()
