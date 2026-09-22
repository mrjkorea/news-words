#!/usr/bin/env python3
"""Convert news pack JSON to Word Master pack shape."""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"
LIB = Path.home() / (
    "Library/CloudStorage/GoogleDrive-canadianvegetarian@gmail.com/"
    "My Drive/MRJ Picture Library/words"
)

POS_MAP = {
    "noun": "n",
    "verb": "v",
    "adjective": "adj",
    "adverb": "adv",
    "n": "n",
    "v": "v",
}


def word_id(en: str) -> str:
    return re.sub(r"[^a-z]", "", (en or "").lower())


def pos_short(pos: str) -> str:
    p = (pos or "noun").strip().lower()
    return POS_MAP.get(p, "n")


def picture_prompt(en: str, def_en: str) -> str:
    base = (def_en or en or "").strip()
    if len(base) > 80:
        base = base[:77] + "..."
    return f"a clear photo of {en}: {base}" if base else f"a clear photo of {en}"


def convert_word(w: dict) -> dict:
    en = (w.get("en") or "").strip()
    wid = word_id(en)
    def_en = (w.get("def_en") or w.get("def") or "").strip()
    ex_en = (w.get("example_en") or w.get("example") or "").strip()
    p = pos_short(w.get("pos") or "noun")
    out = {
        "id": wid,
        "en": en,
        "ko": "",
        "l1": {"en": def_en},
        "ww": {
            "pos": p,
            "def": {"en": def_en},
            "example": {"en": ex_en},
        },
        "picture_prompt": picture_prompt(en, def_en),
    }
    if w.get("sense_note"):
        out["sense_note"] = w["sense_note"]
    return out


def convert_pack(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("id") and data.get("words") and data["words"][0].get("ww"):
        return  # already converted
    date = data.get("date") or path.stem.replace("news-", "")
    pack_id = f"news-{date}"
    words = [convert_word(w) for w in data.get("words") or []]
    out = {
        "id": pack_id,
        "title": f"News {date}",
        "date": date,
        "headline": data.get("headline") or data.get("title") or f"News {date}",
        "youtube_url": data.get("youtube_url") or "",
        "words": words,
    }
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    img_dir = PACKS / pack_id
    img_dir.mkdir(parents=True, exist_ok=True)
    for w in words:
        wid = w["id"]
        dest = img_dir / f"{wid}.png"
        if dest.is_file() and dest.stat().st_size > 500:
            continue
        letter = wid[:1] if wid else "_"
        src = LIB / letter / f"{wid}.png"
        if src.is_file():
            shutil.copy2(src, dest)


def main():
    for path in sorted(PACKS.glob("news-*.json")):
        convert_pack(path)
    print("converted", len(list(PACKS.glob("news-*.json"))), "packs")


if __name__ == "__main__":
    main()
