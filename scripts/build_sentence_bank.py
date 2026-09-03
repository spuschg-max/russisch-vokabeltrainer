#!/usr/bin/env python3
import bz2
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get('TATOEBA_CACHE', str(ROOT / '.cache' / 'tatoeba')))
CACHE.mkdir(parents=True, exist_ok=True)

URLS = {
    'deu': 'https://downloads.tatoeba.org/exports/per_language/deu/deu_sentences_detailed.tsv.bz2',
    'rus': 'https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences_detailed.tsv.bz2',
    'links': 'https://downloads.tatoeba.org/exports/per_language/deu/deu-rus_links.tsv.bz2',
}
MAX_PAIRS = 30000
CASE_QUOTA = 4500
WORD_RE = re.compile(r"[A-Za-zÄÖÜäöüßА-Яа-яЁё]+(?:[-’'][A-Za-zÄÖÜäöüßА-Яа-яЁё]+)*")
RU_WORD_RE = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")
BAD_RE = re.compile(r'https?://|www\.|@|\d{3,}|[_{}<>]|\\')

# Diese Hinweise dienen nur dazu, beim Zusammenstellen der kleinen Offline-
# Satzbank genügend Kandidaten für jeden Kasus zu reservieren. Die eigentliche
# Kasusbestimmung erfolgt anschließend in annotate_sentence_cases.py anhand
# von Präposition + morphologisch passender Flexionsform.
CASE_CUES = {
    'dat': ({'к', 'по', 'благодаря', 'согласно', 'вопреки'}, set()),
    'acc': ({'через', 'про'}, {'в', 'на'}),
    'inst': ({'с', 'над', 'перед', 'между', 'под', 'за'}, set()),
    'prep': ({'о', 'об', 'обо', 'при'}, {'в', 'на'}),
    'gen': ({'без', 'у', 'из', 'от', 'до', 'для', 'около', 'возле', 'после', 'кроме', 'против', 'вокруг', 'среди', 'из-за', 'из-под'}, set()),
}


def download(name, url):
    path = CACHE / f'{name}.tsv.bz2'
    if path.exists() and path.stat().st_size > 1000:
        return path
    req = urllib.request.Request(url, headers={'User-Agent': 'russisch-vokabeltrainer-build/1.0'})
    with urllib.request.urlopen(req, timeout=180) as r, open(path, 'wb') as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    return path


def iter_bz2(path):
    with bz2.open(path, 'rt', encoding='utf-8', errors='replace') as f:
        for line in f:
            yield line.rstrip('\n\r')


def sentence_texts(path, wanted):
    out = {}
    for line in iter_bz2(path):
        parts = line.split('\t')
        if len(parts) < 3:
            continue
        sid = parts[0]
        if sid in wanted:
            out[sid] = parts[2].strip()
    return out


def good_text(text, lang):
    if not text or BAD_RE.search(text) or '\n' in text or '\r' in text:
        return False
    if len(text) < 8 or len(text) > 125:
        return False
    words = WORD_RE.findall(text)
    if len(words) < 2 or len(words) > 16:
        return False
    if lang == 'rus' and not re.search(r'[А-Яа-яЁё]', text):
        return False
    if lang == 'deu' and not re.search(r'[A-Za-zÄÖÜäöüß]', text):
        return False
    return True


def score_pair(de, ru):
    dw = len(WORD_RE.findall(de))
    rw = len(WORD_RE.findall(ru))
    length = dw + rw
    balance = abs(dw - rw)
    punctuation_penalty = (de.count(';') + ru.count(';')) * 2
    quote_penalty = (de.count('„') + de.count('“') + ru.count('«') + ru.count('»'))
    return (length + balance * 1.4 + punctuation_penalty + quote_penalty, max(dw, rw), len(de) + len(ru))


def ru_tokens(text):
    return {w.lower().replace('ё', 'е') for w in RU_WORD_RE.findall(text)}


def reserve_case_candidates(candidates):
    """Keep the bank small but guarantee broad material for every case."""
    selected = []
    selected_keys = set()
    buckets = {case: [] for case in CASE_CUES}

    for item in candidates:
        tokens = ru_tokens(item[3])
        for case, (strong, broad) in CASE_CUES.items():
            strong_norm = {x.replace('ё', 'е') for x in strong}
            broad_norm = {x.replace('ё', 'е') for x in broad}
            if tokens & strong_norm:
                buckets[case].append((0, item))
            elif broad_norm and tokens & broad_norm:
                buckets[case].append((1, item))

    # Dativ/Akkusativ zuerst: sie waren im rein nach Kürze sortierten Pool
    # besonders unterrepräsentiert. Innerhalb eines Kasus kommen eindeutige
    # Präpositionen vor den breiteren Hinweisen в/на.
    for case in ('dat', 'acc', 'inst', 'prep', 'gen'):
        bucket = sorted(buckets[case], key=lambda x: (x[0], x[1][0], x[1][1]))
        added = 0
        for _, item in bucket:
            if added >= CASE_QUOTA or len(selected) >= MAX_PAIRS:
                break
            key = (item[2].casefold(), item[3].casefold())
            if key in selected_keys:
                continue
            selected.append(item)
            selected_keys.add(key)
            added += 1
        print(f'Kasus-Kandidaten reserviert {case}: {added}')

    # Rest mit den kürzesten/übersichtlichsten allgemeinen Sätzen auffüllen.
    for item in candidates:
        if len(selected) >= MAX_PAIRS:
            break
        key = (item[2].casefold(), item[3].casefold())
        if key in selected_keys:
            continue
        selected.append(item)
        selected_keys.add(key)

    selected.sort(key=lambda x: (x[0], x[1]))
    return selected[:MAX_PAIRS]


def main():
    paths = {name: download(name, url) for name, url in URLS.items()}
    links = []
    deu_ids, rus_ids = set(), set()
    for line in iter_bz2(paths['links']):
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        a, b = parts[0].strip(), parts[1].strip()
        if not a or not b:
            continue
        links.append((a, b))
        deu_ids.add(a)
        rus_ids.add(b)
    print(f'Tatoeba-Links DE-RU: {len(links)}')

    deu = sentence_texts(paths['deu'], deu_ids)
    rus = sentence_texts(paths['rus'], rus_ids)
    print(f'Sätze geladen: DE {len(deu)} · RU {len(rus)}')

    candidates = []
    seen = set()
    for did, rid in links:
        de, ru = deu.get(did, ''), rus.get(rid, '')
        if not good_text(de, 'deu') or not good_text(ru, 'rus'):
            continue
        key = (re.sub(r'\s+', ' ', de).casefold(), re.sub(r'\s+', ' ', ru).casefold())
        if key in seen:
            continue
        seen.add(key)
        candidates.append((score_pair(de, ru), int(did) if did.isdigit() else 0, de, ru))

    candidates.sort(key=lambda x: (x[0], x[1]))
    selected = reserve_case_candidates(candidates)
    pairs = [[de, ru] for _, _, de, ru in selected]
    out = ROOT / 'sentence-bank-data.js'
    payload = 'window.RVT_SENTENCE_BANK=' + json.dumps(pairs, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.RVT_SENTENCE_META=' + json.dumps({
        'source': 'Tatoeba German-Russian sentence pairs',
        'license': 'CC BY 2.0 FR',
        'pairs': len(pairs),
        'candidatePairs': len(candidates),
        'selection': 'case-balanced-short-sentences',
    }, ensure_ascii=False, separators=(',', ':')) + ';\n'
    out.write_text(payload, encoding='utf-8')
    print(f'Satzbank: {len(pairs)} Paare · {out.stat().st_size / 1024 / 1024:.2f} MiB')
    if len(pairs) < 5000:
        raise RuntimeError('Zu wenige deutsch-russische Satzpaare erzeugt.')


if __name__ == '__main__':
    main()
