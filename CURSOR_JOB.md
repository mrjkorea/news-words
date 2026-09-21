Build a static GitHub Pages Word Master for Daily ESL News. This folder IS the product.

LIVE URL: https://mrjkorea.github.io/news-words/
REPO: mrjkorea/news-words (create/push with gh as mrjkorea if needed)
GitHub Pages: main branch, / root. Include .nojekyll.

DATA (already here — do not invent words):
- packs/index.json = date catalog (newest first)
- packs/news-YYYY-MM-DD.json = 10-word packs
Marketing SOURCE json is English-only (def_en). Student pack JSON on GitHub
MUST include 15 L1 glosses per word (en,ko,zh-Hans,ja,es,hi,de,vi,pt-BR,id,fr,ar,tr,it,pl)
plus `ko` = Hangul gloss. Factory fills L1. Never ship l1.en-only.

STUDENT PATH:
1. days.html lists dates only (newest first). Mobile-first. Whole row is the tap.
2. Deep link ?date=YYYY-MM-DD opens THAT pack only. No pack picker. Not Nouns 1–100.
3. Flow: Meet → Learn → Dictation → Write. Score this visit only. Button 다시 풀기.
4. No sign-in. No cookies-consent analytics. localStorage for today’s score/attempts only.
5. Voice switcher: us_m us_f uk_m uk_f grandma leo grandpa robot. If audio/*.mp3 missing, use Web Speech API speechSynthesis. Never block the lesson because audio is missing.
6. Pictures optional: if packs/<date>/<word>.png missing, show a letter tile, do not break.

REFERENCE (read-only, do NOT copy nouns100 into this repo):
/Users/andreclouthier/.hermes/projects/mrj-word-master-web

GEO/AEO on days.html (JSON-LD only — keep the visible page sparse):
- Brand: Mr. Jay / MRJ English
- JSON-LD EducationalOrganization name "MRJ English", areaServed "Tongyeong, South Korea"
- EN entity sentence verbatim in JSON-LD: "Private English tutor with 25+ years of ESL experience specializing in structured reading programs and systematic grammar building."
- url: https://mrjkorea.github.io/news-words/  (NEVER LearnWorlds)
- Visible page: title + “Tap a day” + big date taps. No bio essay. No extra links.

README.md: how a bot adds a new weekday JSON + index row.

Then: git add/commit/push origin main, enable Pages, write CURSOR_RECEIPT.md with command, model composer-2.5, files, and `curl -sI https://mrjkorea.github.io/news-words/` result.

Do not put GitHub tokens in files. Do not copy word-master nouns pack.
