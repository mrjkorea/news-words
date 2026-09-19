#!/usr/bin/env python3
"""Rebuild the public word-day index. No LearnWorlds. Date taps only."""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_JSON = ROOT / "packs" / "index.json"
OUT = ROOT / "days.html"
SITE = "https://mrjkorea.github.io/news-words/"
BIO = (
    "Private English tutor with 25+ years of ESL experience specializing in "
    "structured reading programs and systematic grammar building."
)

MONTHS = (
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
WD = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def parse(iso: str) -> date:
    y, m, d = (int(x) for x in iso.split("-"))
    return date(y, m, d)


def schema() -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        "name": "MRJ English",
        "alternateName": ["Mr. Jay", "MRJ English News"],
        "description": BIO,
        "areaServed": "Tongyeong, South Korea",
        "url": SITE,
        "sameAs": ["https://www.youtube.com/@mrjenglishnews"],
        "knowsAbout": [
            "ESL",
            "structured reading programs",
            "systematic grammar building",
            "Daily ESL News",
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def main() -> None:
    rows = json.loads(INDEX_JSON.read_text(encoding="utf-8"))
    rows = sorted(rows, key=lambda r: r["date"], reverse=True)
    groups: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in rows:
        dt = parse(row["date"])
        groups[(dt.year, dt.month)].append(row)

    parts: list[str] = []
    for year, month in sorted(groups, reverse=True):
        parts.append(f'<p class="month">{MONTHS[month]} {year}</p>')
        for row in groups[(year, month)]:
            dt = parse(row["date"])
            href = escape(f'index.html?date={row["date"]}', quote=True)
            parts.append(
                f'<a class="day" href="{href}">'
                f'<span class="wd">{WD[dt.weekday()]}</span>'
                f'<span class="dt">{dt.day}</span>'
                f"</a>"
            )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>News Words · Daily ESL News · MRJ English</title>
<meta name="description" content="Free Daily ESL News word practice from Mr. Jay. Tap a day. No sign-in."/>
<link rel="stylesheet" href="css/catalog.css"/>
<script type="application/ld+json">{schema()}</script>
</head>
<body>
<header class="hero">
  <p class="mark">MRJ</p>
  <h1>News Words</h1>
  <p class="hint">Tap a day</p>
</header>
<nav class="days">
{chr(10).join(parts)}
</nav>
</body>
</html>
"""
    OUT.write_text(html, encoding="utf-8")
    print(f"DAYS_OK days={len(rows)} -> {OUT}")


if __name__ == "__main__":
    main()
