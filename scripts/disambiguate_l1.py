#!/usr/bin/env python3
"""Jay 23 Sep 2026 HARD: one pack must never show two identical answers.

If two English words share a headword in the same language, append the
shortest unique English prefix so the buttons can be told apart.

  release / rollout → 출시 (Re) / 출시 (Ro)
  hoard / treasure  → tesoro (H) / tesoro (T)

One letter when that letter is unique. More letters only when it is not.
Re-running is safe: an existing hint that is a prefix of the English word
is stripped before the check, then written again only if still needed.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

LANGS = [
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
HINT_RE = re.compile(r"\s+\(([A-Za-z][A-Za-z'\-]*)\)\s*$")
SPLIT_RE = re.compile(r"\s*[/／,，;；]\s*")


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text or "").strip()


def lemma_letters(en: str) -> str:
    letters = re.sub(r"[^A-Za-z]", "", en or "")
    return letters or nfc(en) or "?"


def strip_hint(text: str, en: str) -> str:
    raw = nfc(text)
    match = HINT_RE.search(raw)
    if not match:
        return raw
    hint = match.group(1)
    if lemma_letters(en).lower().startswith(hint.lower()):
        return raw[: match.start()].strip()
    return raw


def norm_key(text: str) -> str:
    return nfc(text).casefold()


def unique_hints(lemmas: list[str]) -> list[str]:
    cleaned = [lemma_letters(en) for en in lemmas]
    if not cleaned:
        return []
    max_n = max(len(item) for item in cleaned)
    n = 1
    prefs = cleaned[:]
    while n <= max_n:
        prefs = [item[:n] if len(item) >= n else item for item in cleaned]
        keys = [item.casefold() for item in prefs]
        if len(set(keys)) == len(keys):
            break
        n += 1
    else:
        prefs = [item[:max_n] if len(item) >= max_n else item for item in cleaned]
    seen: dict[str, int] = {}
    out = []
    for pref in prefs:
        key = pref.casefold()
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > 1:
            pref = f"{pref}{seen[key]}"
        shown = pref[:1].upper() + pref[1:].lower()
        out.append(shown)
    return out


def answer_tokens(text: str, en: str) -> list[str]:
    """One headword, or each piece if a field lists two glosses."""
    base = strip_hint(text, en)
    parts = [nfc(part) for part in SPLIT_RE.split(base) if nfc(part)]
    return parts or ([base] if base else [])


def displayed(text: str) -> str:
    return nfc(text)


def collisions(doc: dict) -> list[tuple[str, str, list[str]]]:
    """Identical button text in one language. Hints count — they are what students see."""
    words = [w for w in (doc.get("words") or []) if isinstance(w, dict)]
    found = []
    for loc in LANGS:
        buckets: dict[str, list[str]] = defaultdict(list)
        shown: dict[str, str] = {}
        for w in words:
            l1_raw = w.get("l1")
            l1 = l1_raw if isinstance(l1_raw, dict) else {}
            raw = displayed(str(l1.get(loc) or (w.get("ko") if loc == "ko" else "") or ""))
            en = str(w.get("en") or "")
            if not raw:
                continue
            pieces = answer_tokens(raw, en)
            # The button shows the whole field. Also flag a field that lists the same gloss twice.
            keys = [norm_key(raw)]
            if len(pieces) > 1 and len({norm_key(p) for p in pieces}) < len(pieces):
                keys.append(norm_key(pieces[0]) + "#inside")
            for key in keys:
                buckets[key].append(en)
                shown.setdefault(key, raw)
        for key, ens in buckets.items():
            if len(ens) > 1 and not key.endswith("#inside"):
                found.append((loc, shown[key], ens))
            elif key.endswith("#inside"):
                found.append((loc, shown[key], ens))
    return found


def disambiguate_doc(doc: dict) -> int:
    words = [w for w in (doc.get("words") or []) if isinstance(w, dict)]
    changes = 0
    for loc in LANGS:
        groups: dict[str, list[dict]] = defaultdict(list)
        bare: dict[int, str] = {}
        for w in words:
            l1 = w.get("l1") if isinstance(w.get("l1"), dict) else None
            if l1 is None:
                w["l1"] = {}
                l1 = w["l1"]
            raw = str(l1.get(loc) or (w.get("ko") if loc == "ko" else "") or "")
            en = str(w.get("en") or "")
            base = strip_hint(raw, en)
            if not base:
                continue
            bare[id(w)] = base
            groups[norm_key(base)].append(w)
        for group in groups.values():
            if len(group) < 2:
                continue
            hints = unique_hints([str(w.get("en") or "") for w in group])
            for w, hint in zip(group, hints):
                base = bare[id(w)]
                new = f"{base} ({hint})"
                l1 = w["l1"]
                if str(l1.get(loc) or "") != new:
                    l1[loc] = new
                    changes += 1
                if loc == "ko" and str(w.get("ko") or "") != new:
                    w["ko"] = new
                ww = w.get("ww") if isinstance(w.get("ww"), dict) else None
                defs = ww.get("def") if ww and isinstance(ww.get("def"), dict) else None
                if defs is not None:
                    current = str(defs.get(loc) or "")
                    current_base = strip_hint(current, str(w.get("en") or ""))
                    if current and current_base == base and current != new:
                        defs[loc] = new
    return changes


def write_doc(path: Path, doc: dict) -> None:
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def pack_files(root: Path) -> list[Path]:
    files = []
    for path in sorted(root.glob("*.json")):
        if not path.is_file() or path.name == "index.json":
            continue
        files.append(path)
    return files


def run(root: Path) -> int:
    files = pack_files(root)
    changed_files = 0
    change_fields = 0
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or not isinstance(doc.get("words"), list):
            continue
        n = disambiguate_doc(doc)
        left = collisions(doc)
        if left:
            print("STILL_COLLIDE", path.name, left)
            return 1
        if n:
            write_doc(path, doc)
            changed_files += 1
            change_fields += n
            print("FIXED", path.name, "fields", n)
    print("DISAMBIGUATE_OK", "files", changed_files, "fields", change_fields, "scanned", len(files))
    return 0


def main() -> int:
    root = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "packs"
    if not root.is_dir():
        print("not a directory:", root)
        return 2
    return run(root)


if __name__ == "__main__":
    raise SystemExit(main())
