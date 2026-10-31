# Lying Capiro (`lyingshapiro.com`)

Editorial / talk-radio catchphrase board, soundboard, and transcript-grounded debate corpus for **Brian Shapiro** (*Pushing The Limits* — not Ben Shapiro).

- **Production Domain:** [https://lyingshapiro.com](https://lyingshapiro.com)
- **Cloudflare Pages:** [https://lying-capiro.pages.dev](https://lying-capiro.pages.dev)

## Routes

- `/` — Ask Brian Anything. The homepage. Intro loader, ask box, clip podium.
- `/archive` — the catchphrase board, soundboard, Dodge Lab, debates, clips and X receipts, in `site/archive.html`.
- `/admin` — D1 analytics dashboard, bearer token in `localStorage`.

## Features

- **Ranked Catchphrase Leaderboard:** 20 topical catchphrase clusters + Floor Control (`708` hits across `205` debates), grounded in `364` debates (`3.07M` words, `5,205` total phrase hits).
- **Instant Soundboard & Mashup Reel:** 14 playable audio mashups and meltdown cuts (`site/audio/*.m4a`) with sequential **"▶ Play All Mashups"** reel mode and timestamped YouTube source chips.
- **The "Polite Dodge" Tracker:** `164` timestamped debate windows (`49` explicit pivot markers + `115` 90-second topic abandons) with side-by-side Opener → Pivot quotes and direct YouTube timestamp links.
- **The Andrew Wilson Files:** Head-to-head breakdown across all `14` indexed Andrew Wilson vs. Brian Shapiro debates.
- **Watch Brian Video Rail:** `9` vertical `9:16` clips and supercuts (`site/clips/*.mp4`).
- **Interactive TDS Meter:** Corpus-weighted Trump Derangement Syndrome gauge with expandable topic-bucket breakdown.

## Local Development

```bash
cd site
python3 -m http.server 8766
```

Then open `http://127.0.0.1:8766/`.

## Deploy to Cloudflare Pages

```bash
wrangler pages deploy site --project-name lying-capiro --branch main
```
