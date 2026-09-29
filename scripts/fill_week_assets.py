#!/usr/bin/env python3
"""Fill Daily ESL News word packs with pictures + 8 Fish voices.

Reuse Word Factory / Picture Library. Never invent lemmas.
Skip dates with no JSON.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"
WF = Path.home() / ".hermes/projects/mrj-word-factory/packs"
LIB = Path.home() / "Library/CloudStorage/GoogleDrive-canadianvegetarian@gmail.com/My Drive/MRJ Picture Library/words"
FISH = Path.home() / ".hermes/scripts/fish_tts.py"
VOICES = {
    "us_m": ("c4195e6b653a4a73b50972eaf45b0da5", "[friendly teacher, warm and clear]"),
    "us_f": ("933563129e564b19a115bedd57b7406a", "[friendly teacher, warm and clear]"),
    "uk_m": ("8222a44a2837438dac706a5414562c8c", "[friendly teacher, warm and clear]"),
    "uk_f": ("32e344f53f114cfcbb7ed086f10f2403", "[friendly teacher, warm and clear]"),
    "grandma": ("0a90765966ac4556a6ecfd86ef8057d3", "[warm, kind]"),
    "leo": ("a60e9fc6e78c4bdca656702c6d27ba08", "[happy]"),
    "grandpa": ("86d2e997840443a1832c999ee71468b2", "[warm, kind]"),
    "robot": ("d08dc8d6e284412da4ecf9da71606563", "[friendly robot, clear and kind]"),
}
TMP = Path("/tmp/news_words_fish.txt")
YT = {
    "2026-09-18": "9Owaxc3c5Ms",
    "2026-09-17": "UtVo4frSZNM",
    "2026-09-16": "IphkFDdK-ws",
    "2026-09-15": "xkbSkLlHm0s",
    "2026-09-14": "8RecYxwM_hU",
}


def load_env() -> None:
    if os.environ.get("FISH_API_KEY"):
        return
    env_path = Path.home() / ".hermes/.env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if line.startswith("FISH_API_KEY="):
            os.environ["FISH_API_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            return


def weekdays(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def lemmas(js: Path) -> list[str]:
    data = json.loads(js.read_text())
    out = []
    for w in data.get("words") or []:
        en = str(w.get("en") or w.get("id") or "").strip().lower()
        if en:
            out.append(en)
    return out


def find_wf_png(lemma: str) -> Path | None:
    hits = sorted(WF.glob(f"**/{lemma}.png"), key=lambda p: p.stat().st_size, reverse=True)
    return hits[0] if hits else None


def find_lib_png(lemma: str) -> Path | None:
    letter = lemma[0] if lemma else "x"
    p = LIB / letter / f"{lemma}.png"
    return p if p.is_file() else None


def find_wf_mp3(voice: str, lemma: str) -> Path | None:
    hits = list(WF.glob(f"**/audio/{voice}/{lemma}.mp3"))
    hits = [h for h in hits if h.stat().st_size > 1500]
    return hits[0] if hits else None


def copy_file(src: Path, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 1500:
        return False
    shutil.copy2(src, dest)
    return True


def fish(text: str, voice_id: str, out: Path) -> None:
    if out.is_file() and out.stat().st_size > 1500:
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    TMP.write_text(text + "\n", encoding="utf-8")
    r = subprocess.run(
        [sys.executable, str(FISH), "--input", str(TMP), "--output", str(out), "--voice", voice_id],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if r.returncode != 0 or not out.is_file() or out.stat().st_size < 1500:
        raise SystemExit(f"FISH FAIL {out} {r.stderr[-300:]}")


def fill_youtube(js: Path, day: str) -> None:
    vid = YT.get(day)
    if not vid:
        return
    data = json.loads(js.read_text())
    url = f"https://youtu.be/{vid}"
    if data.get("youtube_url") == url:
        return
    data["youtube_url"] = url
    js.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    load_env()
    do_fish = "--fish" in sys.argv
    day_arg = None
    if "--day" in sys.argv:
        day_arg = sys.argv[sys.argv.index("--day") + 1]
    if day_arg:
        start = end = date.fromisoformat(day_arg)
    else:
        start = date(2026, 6, 25)
        end = date(2026, 9, 30)
    pic_miss: list[str] = []
    audio_miss: list[tuple[str, str, str]] = []
    copied_png = copied_mp3 = 0
    skipped_nojson = []
    for d in weekdays(start, end):
        day = d.isoformat()
        js = PACKS / f"news-{day}.json"
        if not js.is_file():
            skipped_nojson.append(day)
            continue
        fill_youtube(js, day)
        pdir = PACKS / f"news-{day}"
        pdir.mkdir(exist_ok=True)
        words = lemmas(js)
        if len(words) != 10:
            print(f"WARN {day} word_count={len(words)}", flush=True)
        for lemma in words:
            dest_png = pdir / f"{lemma}.png"
            if not (dest_png.is_file() and dest_png.stat().st_size > 1500):
                src = find_lib_png(lemma) or find_wf_png(lemma)
                if src:
                    if copy_file(src, dest_png):
                        copied_png += 1
                else:
                    pic_miss.append(f"{day}:{lemma}")
            for voice in VOICES:
                dest = pdir / "audio" / voice / f"{lemma}.mp3"
                if dest.is_file() and dest.stat().st_size > 1500:
                    continue
                src = find_wf_mp3(voice, lemma)
                if src:
                    if copy_file(src, dest):
                        copied_mp3 += 1
                elif do_fish:
                    fish(f"{VOICES[voice][1]} {lemma}", VOICES[voice][0], dest)
                    copied_mp3 += 1
                else:
                    audio_miss.append((day, voice, lemma))
        # shared letters already in packs/_shared
    miss_path = ROOT / "scripts" / "ASSET_MISS.json"
    miss_path.write_text(
        json.dumps(
            {
                "copied_png": copied_png,
                "copied_mp3": copied_mp3,
                "skipped_nojson": skipped_nojson,
                "pic_miss": sorted(set(pic_miss)),
                "audio_miss_count": len(audio_miss),
                "audio_lemmas": sorted({a[2] for a in audio_miss}),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("copied_png", copied_png, "copied_mp3", copied_mp3, flush=True)
    print("skipped_nojson", skipped_nojson, flush=True)
    print("pic_miss", len(set(pic_miss)), flush=True)
    print("audio_miss", len(audio_miss), "lemmas", len({a[2] for a in audio_miss}), flush=True)
    print("wrote", miss_path, flush=True)
    if day_arg and (pic_miss or audio_miss):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
