# Lying Capiro — local static site

Editorial / talk-radio catchphrase board for **Brian Shapiro** (Pushing The Limits).
Numbers come from transcript-grounded `phrase_ranks.json` (do not invent counts).

## Open locally

```bash
cd /workspace/lying-capiro/site
python3 -m http.server 8766
```

Then open: [http://127.0.0.1:8766/](http://127.0.0.1:8766/)

**Important:** open via the local server, not `file://` — the page loads data with `fetch('./data/phrase_ranks.json')`.

## Files

| Path | Role |
|------|------|
| `index.html` | Shell + TDS meter + large-quote board |
| `styles.css` | Dark studio / editorial large-quote theme |
| `app.js` | Fetch JSON, filters, quote cards, accordion drawer, TDS |
| `data/phrase_ranks.json` | Copied from `/workspace/lying-capiro/data/` |
| `brand/avatar.png` | Optional; shown in header if present |
| `data/phrase_audio.json` | Optional catchphrase audio map (board ▶) |
| `audio/` | Short AAC m4a snips for board ▶ buttons |

## Features

1. Editorial large-quote list — top `TOP_N` (default 8) dominate the page; each card is a **key phrase** group
2. Click a quote → accordion drawer: **associated lines** (variants + counts), sample quotes, YouTube
3. "Show more" reveals ranks beyond top N in a slightly compact list
4. TDS meter 0–100 — see formula comment at top of `app.js`
5. Category filter chips (filters the quote list)
6. Footer corpus stats from JSON
7. Optional catchphrase ▶ audio via `data/phrase_audio.json` + `audio/*.m4a` (hide control when missing)

## Refresh data

```bash
cp /workspace/lying-capiro/data/phrase_ranks.json /workspace/lying-capiro/site/data/phrase_ranks.json
```
