#!/usr/bin/env python3
import csv
import io
import json
import re
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
STRESS_AFTER_VOWEL = re.compile(r"([АЕЁИОУЫЭЮЯаеёиоуыэюя])['´]")
COMBINING = '\u0301'
ADJ_EXTRA_FIELDS = ['comparative', 'superlative', 'short_m', 'short_f', 'short_n', 'short_pl']


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
    # A few source fields contain alternative forms separated by semicolon.
    for part in re.split(r'\s*;\s*', str(raw or '')):
        stressed = convert_stress(part)
        if not stressed:
            continue
        k = key(stressed)
        if not k or not CYRILLIC.search(k):
            continue
        candidates.setdefault(k, set()).add(stressed)


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
            # Die Grundform deckt die normale Vokabelabfrage ab. Bei Adjektiven
            # nehmen wir zusätzlich die kurzen Formen auf, weil Lehrbücher sie
            # oft als eigene Vokabeln führen (z. B. виноват -> винова́т).
            add_candidate(candidates, row.get('accented', ''))
            if is_adjectives:
                for field in ADJ_EXTRA_FIELDS:
                    add_candidate(candidates, row.get(field, ''))
    unique = {k: next(iter(values)) for k, values in candidates.items() if len(values) == 1}
    ambiguous = sum(1 for values in candidates.values() if len(values) > 1)
    payload = 'window.RVT_STRESS_LEXICON=' + json.dumps(unique, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.RVT_STRESS_META=' + json.dumps({
        'source': 'OpenRussian / Russian Dictionary Data',
        'license': 'CC BY-SA 4.0',
        'entries': len(unique),
        'ambiguousOmitted': ambiguous,
        'rowsRead': rows,
        'scope': 'lemmas+adjective-short-forms',
    }, ensure_ascii=False, separators=(',', ':')) + ';\n'
    out = ROOT / 'stress-lexicon-data.js'
    out.write_text(payload, encoding='utf-8')
    print(f'Stresslexikon: {len(unique)} eindeutige Lernformen; {ambiguous} mehrdeutige Formen ausgelassen; {rows} Quelldatensätze gelesen')
    if len(unique) < 20000:
        raise RuntimeError('Zu wenige Betonungsformen erzeugt; OpenRussian-Daten prüfen.')


if __name__ == '__main__':
    build()
