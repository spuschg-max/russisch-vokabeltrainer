#!/usr/bin/env python3
import csv
import io
import json
import re
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENRUSSIAN = [
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/nouns.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/others.csv',
]
CYRILLIC = re.compile(r'[А-Яа-яЁё]')
RU_WORD = re.compile(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*')
STRESS_AFTER_VOWEL = re.compile(r"([АЕЁИОУЫЭЮЯаеёиоуыэюя])['´]")
COMBINING = '\u0301'
ADJ_EXTRA_FIELDS = ['comparative', 'superlative', 'short_m', 'short_f', 'short_n', 'short_pl']
STANDARD_PACKS = [
    ('standard-a1a2-data.js', 'STANDARD_A1A2'),
    ('standard-b1-data.js', 'STANDARD_B1'),
]


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'russisch-vokabeltrainer-build/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read().decode('utf-8-sig')


def convert_stress(value):
    text = str(value or '').strip().replace('´', "'")
    if not text or not CYRILLIC.search(text) or "'" not in text:
        return None
    stressed = STRESS_AFTER_VOWEL.sub(lambda m: m.group(1) + COMBINING, text)
    if "'" in stressed:
        return None
    return stressed


def plain(value):
    return str(value or '').replace(COMBINING, '').strip()


def key(value):
    return re.sub(r'\s+', ' ', plain(value).lower()).strip()


def add_candidate(candidates, raw):
    for part in re.split(r'\s*;\s*', str(raw or '')):
        stressed = convert_stress(part)
        if not stressed:
            continue
        k = key(stressed)
        if not k or not CYRILLIC.search(k):
            continue
        candidates.setdefault(k, set()).add(stressed)


def load_standard_words(path, prefix):
    marker = f'window.{prefix}_VOCAB='
    if not path.exists():
        return []
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith(marker) and line.endswith(';'):
            return json.loads(line[len(marker):-1])
    return []


def core_keys():
    keys = set()
    for filename, prefix in STANDARD_PACKS:
        for word in load_standard_words(ROOT / filename, prefix):
            values = [word.get('ru', ''), *(word.get('altRu') or [])]
            for value in values:
                for token in RU_WORD.findall(str(value or '')):
                    k = key(token)
                    if k:
                        keys.add(k)
    return keys


def chunk_name(k):
    first = next((ch for ch in k if CYRILLIC.match(ch)), '')
    return f'u{ord(first):04x}.js' if first else None


def write_outputs(unique, ambiguous, rows):
    meta = {
        'source': 'OpenRussian / Russian Dictionary Data',
        'license': 'CC BY-SA 4.0',
        'entries': len(unique),
        'ambiguousOmitted': ambiguous,
        'rowsRead': rows,
        'scope': 'lemmas+adjective-short-forms',
    }

    # Volllexikon bleibt als Build-Ressource und für Satzverarbeitung vorhanden,
    # wird im Browser aber nicht mehr synchron beim App-Start geparst.
    full_payload = 'window.RVT_STRESS_LEXICON=' + json.dumps(unique, ensure_ascii=False, separators=(',', ':')) + ';\n'
    full_payload += 'window.RVT_STRESS_META=' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'stress-lexicon-data.js').write_text(full_payload, encoding='utf-8')

    needed = core_keys()
    core = {k: v for k, v in unique.items() if k in needed}
    core_meta = {**meta, 'entries': len(core), 'fullEntries': len(unique), 'scope': 'standard-a1a2+b1-core'}
    core_payload = 'window.RVT_STRESS_LEXICON=' + json.dumps(core, ensure_ascii=False, separators=(',', ':')) + ';\n'
    core_payload += 'window.RVT_STRESS_META=' + json.dumps(core_meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'stress-core-data.js').write_text(core_payload, encoding='utf-8')

    chunks_dir = ROOT / 'stress-chunks'
    if chunks_dir.exists():
        shutil.rmtree(chunks_dir)
    chunks_dir.mkdir(parents=True, exist_ok=True)
    chunks = {}
    for k, v in unique.items():
        if k in core:
            continue
        name = chunk_name(k)
        if name:
            chunks.setdefault(name, {})[k] = v
    for name, values in chunks.items():
        payload = 'window.RVT_STRESS_LEXICON=Object.assign(window.RVT_STRESS_LEXICON||{},' + json.dumps(values, ensure_ascii=False, separators=(',', ':')) + ');\n'
        (chunks_dir / name).write_text(payload, encoding='utf-8')

    print(f'Stress-Kern: {len(core)} Einträge · {len(chunks)} Bedarfspakete')
    if len(core) < 700:
        raise RuntimeError('Betonungs-Kern unerwartet klein; Standardwortschatz prüfen.')


def build():
    candidates = {}
    rows = 0
    for url in OPENRUSSIAN:
        text = fetch(url)
        reader = csv.DictReader(io.StringIO(text), delimiter='\t')
        if 'accented' not in (reader.fieldnames or []):
            raise RuntimeError(f'OpenRussian-Spalte accented fehlt in {url}')
        is_adjectives = url.endswith('/adjectives.csv')
        for row in reader:
            rows += 1
            add_candidate(candidates, row.get('accented', ''))
            if is_adjectives:
                for field in ADJ_EXTRA_FIELDS:
                    add_candidate(candidates, row.get(field, ''))
    unique = {k: next(iter(values)) for k, values in candidates.items() if len(values) == 1}
    ambiguous = sum(1 for values in candidates.values() if len(values) > 1)
    write_outputs(unique, ambiguous, rows)
    print(f'Stresslexikon: {len(unique)} eindeutige Lernformen; {ambiguous} mehrdeutige Formen ausgelassen; {rows} Quelldatensätze gelesen')
    if len(unique) < 20000:
        raise RuntimeError('Zu wenige Betonungsformen erzeugt; OpenRussian-Daten prüfen.')


if __name__ == '__main__':
    build()
