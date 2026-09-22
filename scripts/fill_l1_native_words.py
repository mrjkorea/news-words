#!/usr/bin/env python3
"""Jay 22SEP HARD: non-English L1 = native WORD only, never a translated definition.

English l1.en / ww.def.en stay explanation sentences.
ko + l1[ko,ja,...] become the dictionary headword (cat → 고양이).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.request
from pathlib import Path

NEED = [
    "ko",
    "zh-Hans",
    "ja",
    "es",
    "hi",
    "de",
    "vi",
    "pt-BR",
    "id",
    "fr",
    "ar",
    "tr",
    "it",
    "pl",
]
MODEL = "deepseek-chat"
BATCH = 8

def looks_sentence(s: str) -> bool:
    t = (s or "").strip()
    if not t:
        return True
    if any(ch in t for ch in "!?。"):
        return True
    if "." in t and len(t) > 8:
        return True
    if "하는" in t:
        return True
    if "것" in t and " " in t:
        return True
    hangul = sum(1 for c in t if "\uac00" <= c <= "\ud7a3")
    if hangul >= 1:
        return hangul > 10
    return len(t.split()) > 4


def load_key() -> str:
    try:
        key = subprocess.check_output(
            ["security", "find-generic-password", "-s", "deepseek_api", "-w"],
            text=True,
        ).strip()
        if key:
            return key
    except Exception:
        pass
    for p in (
        Path.home() / ".hermes" / "profiles" / "research" / ".env",
        Path.home() / ".hermes" / ".env",
    ):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no DEEPSEEK_API_KEY")


def english_sense(w: dict) -> str:
    l1 = w.get("l1") if isinstance(w.get("l1"), dict) else {}
    ww = w.get("ww") if isinstance(w.get("ww"), dict) else {}
    defin = ww.get("def") if isinstance(ww.get("def"), dict) else {}
    return str(defin.get("en") or l1.get("en") or w.get("ko") or "").strip()


def needs_fill(w: dict, force: bool) -> bool:
    if not w.get("en"):
        return False
    l1 = w.get("l1") if isinstance(w.get("l1"), dict) else {}
    if force:
        return True
    for loc in NEED:
        val = str(l1.get(loc) or "").strip()
        if loc == "ko" and not val:
            val = str(w.get("ko") or "").strip()
        if not val or looks_sentence(val):
            return True
    return False


def chat(key: str, payload: list[dict], model: str) -> list[dict]:
    body = {
        "model": model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You map English lemmas to the common native-language HEADWORD "
                    "in each locale, matching the given sense. "
                    "Return ONLY JSON: "
                    '{"items":[{"en":"cat","l1":{locale:word}}]}. '
                    "Locales required: " + ",".join(NEED) + ". "
                    "ONE everyday word or common loanword (max TWO tokens). "
                    "NEVER a definition or explanation sentence. "
                    "NEVER translate the English explanation. "
                    "Vietnamese/German/Spanish: one word (drone→drone, not a description). "
                    "Example: en=cat, sense='a small animal people keep as a pet' "
                    "→ ko=고양이, zh-Hans=猫, ja=猫, es=gato, hi=बिल्ली, de=Katze, "
                    "vi=mèo, pt-BR=gato, id=kucing, fr=chat, ar=قطة, tr=kedi, "
                    "it=gatto, pl=kot. "
                    "Korean must be Hangul. No 것 / 하는 것 definition style. "
                    "If the English item is a proper name, transliterate."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({"items": payload}, ensure_ascii=False),
            },
        ],
    }
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = json.loads(r.read().decode())
    text = raw["choices"][0]["message"]["content"]
    data = json.loads(text)
    items = data.get("items") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise RuntimeError("bad json shape")
    return items


def merge(word: dict, got: dict) -> None:
    l1 = dict(word.get("l1") or {})
    sense = english_sense(word)
    if sense:
        l1["en"] = sense
    incoming = got.get("l1") if isinstance(got.get("l1"), dict) else got
    for loc in NEED:
        val = str((incoming or {}).get(loc) or "").strip()
        if not val or looks_sentence(val):
            continue
        l1[loc] = val
    word["l1"] = l1
    if l1.get("ko") and not looks_sentence(l1["ko"]):
        word["ko"] = l1["ko"]
    ww = word.get("ww") if isinstance(word.get("ww"), dict) else None
    if ww is not None:
        defs = ww.get("def") if isinstance(ww.get("def"), dict) else {}
        if sense:
            defs["en"] = sense
        # bilingual defs are unused on screen; keep English sentence only
        ww["def"] = defs
        word["ww"] = ww


def pack_files(packs: Path) -> list[Path]:
    files = sorted(p for p in packs.glob("*.json") if p.is_file())
    out = []
    for p in files:
        if p.name == "index.json":
            continue
        out.append(p)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--packs", required=True)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    packs = Path(args.packs).expanduser().resolve()
    key = load_key()
    files = pack_files(packs)
    todo: list[tuple[Path, dict, dict]] = []
    docs: dict[Path, dict] = {}
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):
            continue
        docs[path] = doc
        for w in doc.get("words") or []:
            if isinstance(w, dict) and needs_fill(w, args.force):
                todo.append((path, doc, w))
    print("PACKS", len(files), "WORDS_NEED_NATIVE", len(todo), flush=True)
    models = [MODEL, "deepseek-chat", "deepseek-flash"]
    done = 0
    i = 0
    while i < len(todo):
        chunk = todo[i : i + BATCH]
        payload = []
        for _path, _doc, w in chunk:
            payload.append({"en": w.get("en"), "sense": english_sense(w)})
        got = None
        last = None
        for model in models:
            for attempt in range(3):
                try:
                    got = chat(key, payload, model)
                    break
                except Exception as e:
                    last = e
                    time.sleep(2 * (attempt + 1))
            if got is not None:
                break
        if got is None:
            raise SystemExit(f"translate failed: {last}")
        by_en = {}
        for item in got:
            if isinstance(item, dict) and item.get("en"):
                by_en[str(item["en"]).lower()] = item
        touched: set[Path] = set()
        for path, doc, w in chunk:
            item = by_en.get(str(w.get("en") or "").lower())
            if not item:
                print("MISS", path.name, w.get("en"), flush=True)
                continue
            merge(w, item)
            if needs_fill(w, False):
                print("STILL_GAP", path.name, w.get("en"), flush=True)
            else:
                done += 1
            touched.add(path)
        for path in touched:
            doc = docs[path]
            path.write_text(
                json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            folder = packs / path.stem / path.name
            if folder.exists():
                folder.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        i += BATCH
        print("PROGRESS", min(i, len(todo)), "/", len(todo), "ok", done, flush=True)
        time.sleep(0.25)
    still = 0
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        for w in doc.get("words") or []:
            if isinstance(w, dict) and needs_fill(w, False):
                still += 1
                print("GAP", path.name, w.get("en"), flush=True)
    print("FILL_L1_NATIVE_DONE need_was", len(todo), "still", still, flush=True)
    if still:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
