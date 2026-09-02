#!/usr/bin/env python3
import csv
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERBS_URL = "https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv"
PACKS = [
    ("standard-a1a2-data.js", "STANDARD_A1A2"),
    ("standard-b1-data.js", "STANDARD_B1"),
]
PERSON_DE = ["ich", "du", "er/sie", "wir", "ihr/Sie", "sie"]
PRESENT_FIELDS = [
    "presfut_sg1",
    "presfut_sg2",
    "presfut_sg3",
    "presfut_pl1",
    "presfut_pl2",
    "presfut_pl3",
]
VOWELS = "АЕЁИОУЫЭЮЯаеёиоуыэюя"


def fetch(url):
    req = urllib.request.Request(
        url, headers={"User-Agent": "russisch-vokabeltrainer-build/1.0"}
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read().decode("utf-8-sig")


def strip_marks(s):
    # OpenRussian uses an apostrophe after the stressed vowel.
    return str(s or "").replace("'", "").replace("´", "")


def norm(s):
    text = strip_marks(str(s or "")).lower().replace("ё", "е")
    return re.sub(r"\s+", " ", text.strip())


def primary_form(s):
    text = str(s or "").strip().replace("*", "")
    # Rare source entries contain alternative forms separated by commas/slashes.
    # The trainer needs one unambiguous answer form; keep the first listed variant.
    text = re.split(r"\s*[,/]\s*", text, maxsplit=1)[0].strip()
    return text


def stressed_form(s):
    text = primary_form(s)
    text = text.replace("´", "'")
    text = re.sub(rf"([{VOWELS}])'", r"\1\u0301", text)
    return text.replace("'", "")


def plain_form(s):
    return strip_marks(primary_form(s))


def load_conjugations():
    text = fetch(VERBS_URL)
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    missing = [
        field
        for field in ["bare", "aspect", *PRESENT_FIELDS]
        if field not in (reader.fieldnames or [])
    ]
    if missing:
        raise RuntimeError(f"OpenRussian-Verbspalten fehlen: {missing}")

    by_lemma = {}
    for row in reader:
        bare = str(row.get("bare", "") or "").strip()
        raw_forms = [row.get(field, "") for field in PRESENT_FIELDS]
        plain = [plain_form(value) for value in raw_forms]
        stressed = [stressed_form(value) for value in raw_forms]
        if not bare or not all(plain) or not all(stressed):
            continue
        # Skip malformed forms. Russian reflexive forms and ё are allowed.
        if any(re.search(r"\s", form) for form in plain):
            continue
        by_lemma[norm(bare)] = {
            "plain": plain,
            "stressed": stressed,
            "aspect": str(row.get("aspect", "") or "").strip(),
        }
    print(f"OpenRussian: {len(by_lemma)} Verben mit sechs Personenformen geladen")
    return by_lemma


def parse_pack(path, prefix):
    meta_prefix = f"window.{prefix}_META="
    vocab_prefix = f"window.{prefix}_VOCAB="
    meta_raw = vocab_raw = None
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(meta_prefix) and line.endswith(";"):
            meta_raw = line[len(meta_prefix) : -1]
        elif line.startswith(vocab_prefix) and line.endswith(";"):
            vocab_raw = line[len(vocab_prefix) : -1]
    if meta_raw is None or vocab_raw is None:
        raise RuntimeError(f"Standarddatenformat nicht erkannt: {path.name}")
    return json.loads(meta_raw), json.loads(vocab_raw)


def write_pack(path, prefix, meta, words):
    payload = (
        f"window.{prefix}_META="
        + json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    payload += (
        f"window.{prefix}_VOCAB="
        + json.dumps(words, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    path.write_text(payload, encoding="utf-8")


def enrich_pack(path, prefix, conjugations):
    meta, words = parse_pack(path, prefix)
    enriched = 0
    for word in words:
        if str(word.get("type", "")).lower() != "verb":
            continue
        data = conjugations.get(norm(word.get("ru", "")))
        if not data:
            continue
        word["forms"] = "; ".join(
            f"{form} = {PERSON_DE[i]}" for i, form in enumerate(data["plain"])
        )
        word["formsStress"] = data["stressed"]
        if data["aspect"]:
            word["aspect"] = data["aspect"]
        enriched += 1
    meta["conjugationFormsCount"] = enriched
    write_pack(path, prefix, meta, words)
    print(f"{path.name}: {enriched} Verben mit sechs Formen + Betonung ergänzt")
    return enriched


def main():
    conjugations = load_conjugations()
    total = 0
    for filename, prefix in PACKS:
        path = ROOT / filename
        if not path.exists():
            raise RuntimeError(f"Standarddatei fehlt: {filename}")
        total += enrich_pack(path, prefix, conjugations)
    if total < 50:
        raise RuntimeError(
            f"Nur {total} Verben konnten ergänzt werden; Quelldaten/Spalten prüfen."
        )


if __name__ == "__main__":
    main()
