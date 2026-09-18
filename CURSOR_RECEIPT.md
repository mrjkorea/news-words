# CURSOR_RECEIPT — news-words Word Master port

- **Command**: Copy real Word Master player from `~/.hermes/projects/mrj-word-master-web/` into `mrjkorea/news-words`; date-based packs only.
- **Model**: composer-2.5
- **Date**: 2026-09-19 (KST)

## Files touched (main)

| Area | Paths |
|------|--------|
| Player | `index.html`, `css/app.css`, `js/app.js`, `js/i18n.js`, `js/factory-algo.js`, `games/`, `audio/ding.wav` |
| Catalog | `days.html`, `packs/index.json` |
| Redirect | `play.html` → `index.html?date=` |
| Packs | All `packs/news-*.json` → Word Master shape; `packs/_shared/audio/letters/` (26 clips from nouns100) |
| Pictures (2026-09-18) | `packs/news-2026-09-18/*.png` (10/10); coin + discover from MRJ Picture Library; 8 generated + registered |
| Tooling | `scripts/convert_packs.py` |
| Removed | `js/play.js` (old news-word-practice UI) |

## Deep link

- `index.html?date=YYYY-MM-DD` → pack id `news-YYYY-MM-DD` (`newsPackIdFromUrl()` / `currentPackId()`)
- `play.html?date=` redirects to same

## Audio note

Per-word Fish/`packs/.../audio/{voice}/*.mp3` not generated for news packs; letter dictation uses `packs/_shared/audio/letters/` with Web Speech fallback for word audio (Word Master behavior).

## Proof (run after push)

```bash
curl -sI 'https://mrjkorea.github.io/news-words/index.html?date=2026-09-18'
curl -sI 'https://mrjkorea.github.io/news-words/packs/news-2026-09-18/detector.png'
```

```
$ curl -sI 'https://mrjkorea.github.io/news-words/index.html?date=2026-09-18' | head -1
HTTP/2 200
$ curl -sI 'https://mrjkorea.github.io/news-words/js/app.js' | head -1
HTTP/2 200
$ curl -sI 'https://mrjkorea.github.io/news-words/packs/news-2026-09-18/detector.png' | head -1
HTTP/2 200
```

## Picture library register

```
python3 ~/.hermes/scripts/picture_library.py register <word> packs/news-2026-09-18/<word>.png --pack news-2026-09-18 --engine cursor-nano-banana-pro
```

Registered: detector, hoard, silver, jewelry, treasure, ancient, museum, container.
