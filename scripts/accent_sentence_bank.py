#!/usr/bin/env python3
import csv
import io
import json
import re
import urllib.request
from collections import Counter
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
CASE_PREPS = {
    'dat': {'к', 'ко', 'благодаря', 'согласно', 'вопреки'},
    'gen': {'без', 'для', 'до', 'из', 'из-за', 'изо', 'от', 'ото', 'у', 'около', 'после', 'кроме', 'против', 'вместо', 'вокруг', 'возле', 'среди', 'ради'},
    'ins': {'перед', 'передо', 'между', 'над', 'надо'},
    'prep': {'о', 'об', 'обо', 'при'},
    'acc': {'через', 'про', 'сквозь'},
}
INSTR_WITH_S = {'мной', 'мною', 'тобой', 'тобою', 'ним', 'ней', 'нею', 'нами', 'вами', 'ними', 'собой', 'собою'}


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
    return str(s or '').replace(COMBINING, '').lower()


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


def ru_tokens(text):
    return [w.lower() for w in RU_WORD.findall(str(text or '').replace(COMBINING, ''))]


def add_evidence(out, case, phrase):
    row = [case, phrase]
    if row not in out:
        out.append(row)


def annotate_cases(text):
    words = ru_tokens(text)
    out = []
    for i, word in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else ''
        if not nxt:
            continue
        for case, preps in CASE_PREPS.items():
            if word in preps:
                add_evidence(out, case, f'{word} {nxt}')
        if word in {'с', 'со'} and nxt in INSTR_WITH_S:
            add_evidence(out, 'ins', f'{word} {nxt}')
        if word == 'несмотря' and nxt == 'на' and i + 2 < len(words):
            add_evidence(out, 'acc', f'несмотря на {words[i + 2]}')
    return out


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
    case_counts = Counter()
    annotated_pairs = 0
    for pair in pairs:
        if not isinstance(pair, list) or len(pair) < 2:
            continue
        before = pair[1]
        after = accent_sentence(before, mapping)
        if after != before:
            changed += 1
            stressed_words += after.count(COMBINING)
            pair[1] = after
        cases = annotate_cases(after)
        if len(pair) >= 3:
            pair[2] = cases
        else:
            pair.append(cases)
        if cases:
            annotated_pairs += 1
            for case in {row[0] for row in cases}:
                case_counts[case] += 1
    meta['stressAnnotatedPairs'] = changed
    meta['stressMarks'] = stressed_words
    meta['caseAnnotatedPairs'] = annotated_pairs
    meta['caseCounts'] = dict(case_counts)
    payload = 'window.RVT_SENTENCE_BANK=' + json.dumps(pairs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.RVT_SENTENCE_META=' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    BANK.write_text(payload, encoding='utf-8')
    print(f'Satzbetonung: {changed}/{len(pairs)} Satzpaare · {stressed_words} Akzentzeichen')
    print('Kasusmarkierung: ' + ' · '.join(f'{k}={case_counts[k]}' for k in ('acc','dat','gen','ins','prep')))
    if changed < len(pairs) * 0.7:
        raise RuntimeError('Zu wenige Satzlösungen konnten mit Betonung angereichert werden')
    for case in ('acc','dat','gen','ins','prep'):
        if case_counts[case] < 100:
            raise RuntimeError(f'Zu wenige eindeutige {case}-Sätze: {case_counts[case]}')


if __name__ == '__main__':
    main()
