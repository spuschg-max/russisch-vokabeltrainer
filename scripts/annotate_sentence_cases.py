#!/usr/bin/env python3
import csv
import io
import json
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / 'sentence-bank-data.js'
OPENRUSSIAN = [
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/nouns.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/others.csv',
]
CASE_BITS = {'acc': 1, 'dat': 2, 'gen': 4, 'inst': 8, 'prep': 16}
CASE_NAMES = {'acc': 'Akkusativ', 'dat': 'Dativ', 'gen': 'Genitiv', 'inst': 'Instrumental', 'prep': 'Präpositiv'}
TOKEN = re.compile(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*')
COMBINING = '\u0301'

# Wir markieren bewusst nur kontextgesicherte Kasus. Eine russische Wortform
# allein kann mit einem Adverb/Namen oder einem anderen Kasus zusammenfallen
# (z. B. там, потом). Die Präposition + morphologisch passende Flexionsform
# ist für eine Lernübung wesentlich verlässlicher.
PREPS = {
    'acc': {'в', 'на', 'через', 'про'},
    'dat': {'к', 'по', 'благодаря', 'согласно', 'вопреки'},
    'gen': {'без', 'у', 'из', 'от', 'до', 'для', 'около', 'возле', 'после', 'кроме', 'против', 'вокруг', 'среди', 'из-за', 'из-под'},
    'inst': {'с', 'над', 'перед', 'между', 'под', 'за'},
    'prep': {'о', 'об', 'обо', 'при', 'в', 'на'},
}

# Häufige Pronomen, die in der Nomen-/Adjektivtabelle nicht zuverlässig
# als Deklinationsreihe vorliegen. Mehrdeutigkeit wird erst durch die
# Präposition aufgelöst.
MANUAL = {
    'меня': {'gen', 'acc'}, 'мне': {'dat', 'prep'}, 'мной': {'inst'}, 'мною': {'inst'},
    'тебя': {'gen', 'acc'}, 'тебе': {'dat', 'prep'}, 'тобой': {'inst'}, 'тобою': {'inst'},
    'его': {'gen', 'acc'}, 'ему': {'dat'}, 'им': {'dat', 'inst'}, 'нем': {'prep'}, 'нём': {'prep'},
    'ее': {'gen', 'acc'}, 'её': {'gen', 'acc'}, 'ей': {'dat', 'inst', 'prep'}, 'нее': {'gen', 'acc'}, 'неё': {'gen', 'acc'}, 'ней': {'inst', 'prep'},
    'нас': {'gen', 'acc', 'prep'}, 'нам': {'dat'}, 'нами': {'inst'},
    'вас': {'gen', 'acc', 'prep'}, 'вам': {'dat'}, 'вами': {'inst'},
    'их': {'gen', 'acc'}, 'них': {'gen', 'acc', 'prep'}, 'ими': {'inst'},
    'себя': {'gen', 'acc'}, 'себе': {'dat', 'prep'}, 'собой': {'inst'}, 'собою': {'inst'},
}


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'russisch-vokabeltrainer-build/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read().decode('utf-8-sig')


def plain(value):
    text = str(value or '').replace(COMBINING, '').replace("'", '').replace('´', '')
    return text.lower().replace('ё', 'е').strip()


def field_case(field):
    f = str(field or '').lower()
    for case in CASE_BITS:
        if f.endswith('_' + case) or ('_' + case + '_') in f:
            return case
    # Manche Quellen verwenden loc/prepos statt prep.
    if f.endswith('_loc') or '_loc_' in f or f.endswith('_prepos') or '_prepos_' in f:
        return 'prep'
    return None


def build_form_masks():
    forms = defaultdict(int)
    rows = 0
    fields_seen = set()
    for url in OPENRUSSIAN:
        reader = csv.DictReader(io.StringIO(fetch(url)), delimiter='\t')
        case_fields = [(field, field_case(field)) for field in (reader.fieldnames or [])]
        case_fields = [(field, case) for field, case in case_fields if case]
        fields_seen.update(field for field, _ in case_fields)
        for row in reader:
            rows += 1
            for field, case in case_fields:
                bit = CASE_BITS[case]
                for token in TOKEN.findall(str(row.get(field, '') or '').replace(COMBINING, '')):
                    key = plain(token)
                    if key:
                        forms[key] |= bit
    for token, cases in MANUAL.items():
        for case in cases:
            forms[plain(token)] |= CASE_BITS[case]
    if len(forms) < 10000:
        raise RuntimeError(f'Kasuslexikon unplausibel klein: {len(forms)} Wortformen')
    print(f'Kasusformen: {len(forms)} Wortformen aus {rows} Datensätzen · {len(fields_seen)} Flexionsspalten')
    return forms


def read_bank():
    pairs = meta = None
    for line in BANK.read_text(encoding='utf-8').splitlines():
        if line.startswith('window.RVT_SENTENCE_BANK=') and line.endswith(';'):
            pairs = json.loads(line[len('window.RVT_SENTENCE_BANK='):-1])
        elif line.startswith('window.RVT_SENTENCE_META=') and line.endswith(';'):
            meta = json.loads(line[len('window.RVT_SENTENCE_META='):-1])
    if not isinstance(pairs, list) or not isinstance(meta, dict):
        raise RuntimeError('Satzbankformat nicht erkannt')
    return pairs, meta


def sentence_cases(text, forms):
    clean = str(text or '').replace(COMBINING, '')
    tokens = [(plain(m.group(0)), m.group(0)) for m in TOKEN.finditer(clean)]
    mask = 0
    evidence = []
    seen = set()

    for i in range(1, len(tokens)):
        prev_key, prev_surface = tokens[i - 1]
        key, surface = tokens[i]
        possible = forms.get(key, 0)
        if not possible:
            continue
        for case, bit in CASE_BITS.items():
            if not (possible & bit):
                continue
            if prev_key not in {plain(p) for p in PREPS[case]}:
                continue
            # в/на können Akkusativ ODER Präpositiv regieren. Die tatsächliche
            # Flexionsform muss deshalb den Zielkasus zulassen. Wenn eine Form
            # laut Morphologie beide Fälle zulässt, markieren wir sie nicht.
            if prev_key in {'в', 'на'} and case in {'acc', 'prep'}:
                competing = CASE_BITS['prep' if case == 'acc' else 'acc']
                if possible & competing:
                    continue
            mask |= bit
            item = [case, f'{prev_surface} + {surface}']
            k = tuple(item)
            if k not in seen:
                evidence.append(item)
                seen.add(k)

    # Pro Kasus höchstens zwei Hinweise speichern; das hält die Offline-Datei klein.
    compact = []
    per_case = Counter()
    for case, label in evidence:
        if per_case[case] >= 2:
            continue
        compact.append([case, label])
        per_case[case] += 1
    return mask, compact


def main():
    if not BANK.exists():
        raise RuntimeError('sentence-bank-data.js fehlt')
    forms = build_form_masks()
    pairs, meta = read_bank()
    counts = Counter()
    tagged = 0
    for pair in pairs:
        if not isinstance(pair, list) or len(pair) < 2:
            continue
        mask, evidence = sentence_cases(pair[1], forms)
        if len(pair) >= 3:
            pair[2] = mask
        else:
            pair.append(mask)
        if len(pair) >= 4:
            pair[3] = evidence
        else:
            pair.append(evidence)
        if mask:
            tagged += 1
        for case, bit in CASE_BITS.items():
            if mask & bit:
                counts[case] += 1
    meta['caseAnnotatedPairs'] = tagged
    meta['caseCounts'] = {CASE_NAMES[k]: counts[k] for k in CASE_BITS}
    meta['caseAnnotationMethod'] = 'preposition+morphology'
    payload = 'window.RVT_SENTENCE_BANK=' + json.dumps(pairs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.RVT_SENTENCE_META=' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    BANK.write_text(payload, encoding='utf-8')
    print('Kasus-Satzanzahl: ' + ' · '.join(f'{CASE_NAMES[k]} {counts[k]}' for k in CASE_BITS))
    if min(counts.values() or [0]) < 300:
        raise RuntimeError('Für mindestens einen Kasus wurden zu wenige kontextgesicherte Sätze markiert')


if __name__ == '__main__':
    main()
