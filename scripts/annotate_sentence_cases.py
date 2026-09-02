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
]
CASE_BITS = {'acc': 1, 'dat': 2, 'gen': 4, 'inst': 8, 'prep': 16}
CASE_NAMES = {'acc': 'Akkusativ', 'dat': 'Dativ', 'gen': 'Genitiv', 'inst': 'Instrumental', 'prep': 'Präpositiv'}
TOKEN = re.compile(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*')
COMBINING = '\u0301'


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
    return None


def build_form_masks():
    forms = defaultdict(int)
    rows = 0
    for url in OPENRUSSIAN:
        reader = csv.DictReader(io.StringIO(fetch(url)), delimiter='\t')
        case_fields = [(field, field_case(field)) for field in (reader.fieldnames or [])]
        case_fields = [(field, case) for field, case in case_fields if case]
        for row in reader:
            rows += 1
            for field, case in case_fields:
                bit = CASE_BITS[case]
                for token in TOKEN.findall(str(row.get(field, '') or '').replace(COMBINING, '')):
                    key = plain(token)
                    if key:
                        forms[key] |= bit
    # Nur Wortformen behalten, die global eindeutig genau einem Zielkasus zugeordnet sind.
    unique = {form: mask for form, mask in forms.items() if mask and (mask & (mask - 1)) == 0}
    print(f'Kasusformen: {len(unique)} eindeutige Wortformen aus {rows} Datensätzen')
    return unique


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
    mask = 0
    first_example = {}
    # Betonungszeichen entfernen, bevor Wörter tokenisiert werden.
    clean = str(text or '').replace(COMBINING, '')
    for token in TOKEN.findall(clean):
        key = plain(token)
        bit = forms.get(key, 0)
        if not bit:
            continue
        mask |= bit
        for case, case_bit in CASE_BITS.items():
            if bit == case_bit and case not in first_example:
                first_example[case] = token
    evidence = [[case, first_example[case]] for case in CASE_BITS if case in first_example]
    return mask, evidence


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
    payload = 'window.RVT_SENTENCE_BANK=' + json.dumps(pairs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.RVT_SENTENCE_META=' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    BANK.write_text(payload, encoding='utf-8')
    print('Kasus-Satzanzahl: ' + ' · '.join(f'{CASE_NAMES[k]} {counts[k]}' for k in CASE_BITS))
    if min(counts.values() or [0]) < 500:
        raise RuntimeError('Für mindestens einen Kasus wurden zu wenige eindeutige Sätze markiert')


if __name__ == '__main__':
    main()
