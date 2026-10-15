# Daily ESL News — Word practice

Live: https://mrjkorea.github.io/news-words/

Static GitHub Pages. **This repo holds word packs only, plus thin redirect pages.**
The app is the one Word Master: https://mrjkorea.github.io/word-master/ — news packs open there in
public mode (no sign-in, no assignment, nothing saved), the same way `word-master-toeic` packs do.

| Old URL | Goes to |
|---|---|
| `news-words/` or `index.html` (no date) | `days.html` (date list) |
| `index.html?date=YYYY-MM-DD` | `word-master/?packsrc=https://mrjkorea.github.io/news-words/packs/news-YYYY-MM-DD.json` |
| `play.html?date=YYYY-MM-DD` | `index.html?date=…` → Word Master |
| `packs/news-YYYY-MM-DD.json` | unchanged (raw pack, served as is) |

## Add a weekday

1. Copy that day’s `quizlet_MMDD.txt` into `news-YYYY-MM-DD.json` (10 words).
2. Save as `packs/news-YYYY-MM-DD.json`.
3. Append a row to `packs/index.json`.
4. Rebuild the date list: `python3 scripts/build_days.py` (writes `days.html`). Never put LearnWorlds on the site.
5. Commit and push `main`. Pages updates in about a minute.

Deep link: `https://mrjkorea.github.io/news-words/index.html?date=YYYY-MM-DD` (old `play.html?date=` still works).
Do not add app code (js/, games/, css/app.css) here; change Word Master instead.

Keep the last 100 weekdays only.
