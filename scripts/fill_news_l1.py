#!/usr/bin/env python3
"""Fill 15 L1 glosses on every news-words pack JSON.

Marketing source is English-only (def_en). Factory adds native-language WORDS
(not translated definition sentences). English UI keeps explanation sentences.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"
STATE = ROOT / "scripts" / "fill_news_l1_state.json"

L1 = [
    "en", "ko", "zh-Hans", "ja", "es", "hi", "de", "vi",
    "pt-BR", "id", "fr", "ar", "tr", "it", "pl",
]
NEED = [c for c in L1 if c != "en"]
MODEL = "deepseek-chat"
BATCH = 8


def load_key() -> str:
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


def looks_english(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return True
    return all(ord(c) < 128 for c in s)


def pack_files() -> list[Path]:
    files = sorted(PACKS.glob("news-*.json"))
    return [p for p in files if p.is_file()]


def needs_fill(w: dict) -> bool:
    l1 = w.get("l1") if isinstance(w.get("l1"), dict) else {}
    if looks_english(w.get("ko") or ""):
        return True
    for loc in NEED:
        val = (l1.get(loc) or "").strip()
        if not val:
            return True
        if loc == "ko" and looks_english(val):
            return True
    return False


def chat(key: str, payload: list[dict]) -> list[dict]:
    body = {
        "model": MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You map English lemmas to the common native HEADWORD "
                    "in each locale, matching the given sense. "
                    "Return ONLY JSON: {\"items\":[{\"en\":\"word\","
                    "\"l1\":{locale:word}}]}. "
                    "Locales required: " + ",".join(NEED) + ". "
                    "ONE dictionary word or short compound (max 3 words). "
                    "NEVER a definition/explanation sentence. NEVER translate "
                    "the English explanation. Example: cat → ko 고양이, "
                    "zh-Hans 猫, ja 猫, es gato. Korean Hangul. No 것 style."
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


def merge_l1(word: dict, got: dict) -> None:
    en = word.get("en") or ""
    l1 = dict(word.get("l1") or {})
    en_def = (l1.get("en") or word.get("ko") or en).strip()
    l1["en"] = en_def
    incoming = got.get("l1") if isinstance(got.get("l1"), dict) else got
    for loc in NEED:
        val = str((incoming or {}).get(loc) or "").strip()
        if not val:
            continue
        if loc == "ko" and looks_english(val):
            continue
        l1[loc] = val
    word["l1"] = l1
    if l1.get("ko") and not looks_english(l1["ko"]):
        word["ko"] = l1["ko"]
    ww = word.get("ww") if isinstance(word.get("ww"), dict) else None
    if ww is not None:
        defs = ww.get("def") if isinstance(ww.get("def"), dict) else {"en": en_def}
        defs["en"] = defs.get("en") or en_def
        for loc in NEED:
            if l1.get(loc):
                defs[loc] = l1[loc]
        ww["def"] = defs
        word["ww"] = ww


def main() -> None:
    key = load_key()
    files = pack_files()
    todo: list[tuple[Path, dict, dict]] = []
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):
            continue
        for w in doc.get("words") or []:
            if isinstance(w, dict) and w.get("en") and needs_fill(w):
                todo.append((path, doc, w))
    print("PACKS", len(files), "WORDS_NEED_L1", len(todo), flush=True)
    done = 0
    i = 0
    while i < len(todo):
        chunk = todo[i : i + BATCH]
        payload = []
        for _path, _doc, w in chunk:
            l1 = w.get("l1") or {}
            payload.append({
                "en": w.get("en"),
                "sense": (l1.get("en") or w.get("ko") or ""),
            })
        got = None
        last = None
        for attempt in range(4):
            try:
                got = chat(key, payload)
                break
            except Exception as e:
                last = e
                time.sleep(2 * (attempt + 1))
        if got is None:
            raise SystemExit(f"translate failed: {last}")
        by_en = {}
        for item in got:
            if isinstance(item, dict) and item.get("en"):
                by_en[str(item["en"]).lower()] = item
        touched: dict[Path, dict] = {}
        for path, doc, w in chunk:
            item = by_en.get(str(w.get("en") or "").lower())
            if not item:
                print("MISS", w.get("en"), flush=True)
                continue
            merge_l1(w, item)
            if needs_fill(w):
                print("STILL_GAP", w.get("en"), flush=True)
            else:
                done += 1
            touched[path] = doc
        for path, doc in touched.items():
            path.write_text(
                json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            # keep folder copy in sync if present
            folder = PACKS / path.stem / (path.name)
            if folder.exists():
                folder.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        i += BATCH
        print("PROGRESS", min(i, len(todo)), "/", len(todo), "ok", done, flush=True)
        time.sleep(0.4)
    still = 0
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        for w in doc.get("words") or []:
            if isinstance(w, dict) and needs_fill(w):
                still += 1
                print("GAP", path.name, w.get("en"))
    print("FILL_NEWS_L1_DONE need_was", len(todo), "still", still, flush=True)
    if still:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
