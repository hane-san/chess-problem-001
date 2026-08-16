# Chess Problem 001 — Mate in Two Lab

A design-first prototype for solving orthodox **#2 (mate in two)** chess problems in the browser.

## What this prototype is testing

- A board-first, mobile-friendly problem-solving UI
- `key → defence → mate` as the primary interaction model
- Explicit handling of **try / refutation**, rather than a generic “wrong” state
- FEN-first problem storage so thousands of positions can be added without image assets
- A data/UI split: problems live in `data/problems.js`, while the interface stays unchanged

## Run locally

Because the app uses ES modules, serve the folder over HTTP rather than opening `index.html` directly.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Data shape

Each problem stores:

- FEN
- composer / source / year
- key
- known tries and refutations
- representative black defences
- mating replies and short commentary

The first sample is D. J. Shire, *The Problemist Supplement* (1997), reproduced as a learning prototype from the BCPS beginners' page.

## Prototype limitations

Version 0.1 validates the authored #2 solution tree rather than implementing a full chess legality engine. This is deliberate: the goal is to iterate quickly on the problem-solving UX first. A later version can add `chess.js` for full legal-move validation without changing the data-first architecture.

## Next likely iterations

1. Full orthodox legality validation (`chess.js`)
2. Bulk JSON ingestion and schema validation
3. Random / sequential problem navigation
4. Theme, composer, year and difficulty filters
5. Attempt history and local progress
6. “Why this try fails” / “show one refutation” teaching modes
7. GitHub Pages deployment for Notion embedding
