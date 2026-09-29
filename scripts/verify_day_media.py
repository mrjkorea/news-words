#!/usr/bin/env python3
"""Hard gate for one Daily ESL News word day.

A day is illegal unless it has 10 words, 10 png, and 80 mp3
(8 voices x 10 words). Each file must be >1500 bytes.
With --live, the same files must also be HTTP 200 on GitHub Pages.

speechSynthesis, letter tiles, and a JSON-only pack are not a pass.
Prints MEDIA_OK or MEDIA_FAIL. Exit 0 only on MEDIA_OK.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"
VOICES = ("us_m", "us_f", "uk_m", "uk_f", "grandma", "leo", "grandpa", "robot")
SITE = "https://mrjkorea.github.io/news-words"
MIN_BYTES = 1500


def lemmas(data: dict) -> list[str]:
    out = []
    for w in data.get("words") or []:
        en = str(w.get("en") or w.get("id") or "").strip().lower()
        if en:
            out.append(en)
    return out


def live_ok(url: str) -> tuple[bool, int]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            body = resp.read(64)
            code = getattr(resp, "status", 200)
            length = resp.headers.get("Content-Length")
            size = int(length) if length and length.isdigit() else len(body)
            # GitHub may omit Content-Length on small files; read the rest.
            if size < MIN_BYTES:
                rest = resp.read()
                size = len(body) + len(rest)
            return code == 200 and size > MIN_BYTES, size
    except Exception as exc:
        print(f"LIVE_FAIL {url} {exc}", flush=True)
        return False, 0


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--live"]
    live = "--live" in sys.argv[1:]
    if not args:
        print("MEDIA_FAIL missing date YYYY-MM-DD")
        return 1
    day = args[0]
    js = PACKS / f"news-{day}.json"
    pdir = PACKS / f"news-{day}"
    if not js.is_file():
        print(f"MEDIA_FAIL {day} missing {js.name}")
        return 1
    data = json.loads(js.read_text(encoding="utf-8"))
    words = lemmas(data)
    if len(words) != 10 or len(set(words)) != 10:
        print(f"MEDIA_FAIL {day} words={len(words)} unique={len(set(words))}")
        return 1
    missing = []
    png_ok = 0
    mp3_ok = 0
    for w in words:
        png = pdir / f"{w}.png"
        if png.is_file() and png.stat().st_size > MIN_BYTES:
            png_ok += 1
        else:
            missing.append(f"png:{w}")
        for voice in VOICES:
            mp3 = pdir / "audio" / voice / f"{w}.mp3"
            if mp3.is_file() and mp3.stat().st_size > MIN_BYTES:
                mp3_ok += 1
            else:
                missing.append(f"mp3:{voice}/{w}")
    if png_ok != 10 or mp3_ok != 80:
        print(f"MEDIA_FAIL {day} local png={png_ok}/10 mp3={mp3_ok}/80 missing={len(missing)}")
        for item in missing[:12]:
            print(f"  {item}")
        return 1
    if live:
        urls = [f"{SITE}/packs/news-{day}.json"]
        urls += [f"{SITE}/packs/news-{day}/{w}.png" for w in words]
        urls += [
            f"{SITE}/packs/news-{day}/audio/{voice}/{w}.mp3"
            for voice in VOICES
            for w in words
        ]
        bad = []
        for url in urls:
            ok, size = live_ok(url)
            if not ok:
                bad.append(f"{url} size={size}")
        if bad:
            print(f"MEDIA_FAIL {day} live {len(bad)}/{len(urls)}")
            for item in bad[:12]:
                print(f"  {item}")
            return 1
        print(f"MEDIA_OK {day} local png=10 mp3=80 live={len(urls)}")
        return 0
    print(f"MEDIA_OK {day} local png=10 mp3=80")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
