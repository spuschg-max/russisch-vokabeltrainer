#!/usr/bin/env python3
import csv
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / 'sentence-bank-data.js'
OPENRUSSIAN = [
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/nouns.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv',
    'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/others.csv',
]
TOKEN = re.compile(r"[А-Яа-яЁё'-]+")
RU_WORD = re.compile(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*')
STRESS = re.compile(r"([АЕЁИОУЫЭЮЯаеёиоуыэюя])'")
COMBINING = '\u0301'


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'russisch-vokabeltrainer-build/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read().decode('utf-8-sig')


def convert(token):
    if "'" not in token:
        return None
    out = STRESS.sub(lambda m: m.group(1) + COMBINING, token)
    if "'" in out:
        return None
    return out


def plain(s):
    return str(s or '').replace(COMBINING, '').lower().replace('ё', 'ё')


def build_map():
    candidates = {}
    for url in OPENRUSSIAN:
        reader = csv.DictReader(io.StringIO(fetch(url)), delimiter='\t')
        for row in reader:
            for cell in row.values():
                for token in TOKEN.findall(str(cell or '')):
                    stressed = convert(token)
                    if not stressed:
                        continue
                    key = plain(stressed)
                    candidates.setdefault(key, set()).add(stressed.lower())
    unique = {k: next(iter(v)) for k, v in candidates.items() if len(v) == 1}
    print(f'Betonungsformen für Satzbank: {len(unique)} eindeutige Wortformen')
    return unique


def case_like(source, target):
    if source.isupper():
        return target.upper()
    if source and source[0].isupper():
        return target[0].upper() + target[1:]
    return target


def accent_sentence(text, mapping):
    return RU_WORD.sub(lambda m: case_like(m.group(0), mapping.get(m.group(0).lower(), m.group(0))), text)


def main():
    if not BANK.exists():
        raise RuntimeError('sentence-bank-data.js fehlt')
    raw = BANK.read_text(encoding='utf-8').splitlines()
    pairs = meta = None
    for line in raw:
        if line.startswith('window.RVT_SENTENCE_BANK=') and line.endswith(';'):
            pairs = json.loads(line[len('window.RVT_SENTENCE_BANK='):-1])
        elif line.startswith('window.RVT_SENTENCE_META=') and line.endswith(';'):
            meta = json.loads(line[len('window.RVT_SENTENCE_META='):-1])
    if not isinstance(pairs, list) or meta is None:
        raise RuntimeError('Satzbankformat nicht erkannt')
    mapping = build_map()
    changed = 0
    stressed_words = 0
    for pair in pairs:
        if not isinstance(pair, list) or len(pair) < 2:
            continue
        before = pair[1]
        after = accent_sentence(before, mapping)
        if after != before:
            changed += 1
            stressed_words += after.count(COMBINING)
            pair[1] = after
    meta['stressAnnotatedPairs'] = changed
    meta['stressMarks'] = stressed_words
    payload = 'window.RVT_SENTENCE_BANK=' + json.dumps(pairs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.RVT_SENTENCE_META=' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    BANK.write_text(payload, encoding='utf-8')
    print(f'Satzbetonung: {changed}/{len(pairs)} Satzpaare · {stressed_words} Akzentzeichen')
    if changed < len(pairs) * 0.7:
        raise RuntimeError('Zu wenige Satzlösungen konnten mit Betonung angereichert werden')


if __name__ == '__main__':
    main()
