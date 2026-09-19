# Daily ESL News — Word practice

Live: https://mrjkorea.github.io/news-words/

Static GitHub Pages. No sign-in. Word Master path: Meet → Learn → Dictation → Write.

## Add a weekday

1. Copy that day’s `quizlet_MMDD.txt` into `news-YYYY-MM-DD.json` (10 words).
2. Save as `packs/news-YYYY-MM-DD.json`.
3. Append a row to `packs/index.json`.
4. Rebuild the date list: `python3 scripts/build_days.py` (writes `days.html`). Never put LearnWorlds on the site.
5. Commit and push `main`. Pages updates in about a minute.

Deep link: `https://mrjkorea.github.io/news-words/play.html?date=YYYY-MM-DD`

Keep the last 100 weekdays only.
