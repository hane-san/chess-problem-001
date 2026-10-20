# MATE / TWO — Chess Problem Lab / AI development contract

This is the canonical `hane-san/chess-problem-001` repository: a static mate-in-two (#2) chess problem app.
It is independent from the ARPG-01, ARPG-02, SRPG and ADV games; do not share rules, assets or storage with them.
Read [README](README.md) (current behaviour), [DEVELOPMENT](docs/DEVELOPMENT.md) and the approved Issue before editing.
Claude Code imports this contract from `CLAUDE.md`; PR supervision steps are in `.claude/skills/steward/SKILL.md`.

## Shared AI development contract (same policy as the other games)

- The human producer decides specifications, playtest acceptance and integration into main. Distinguish approved, proposed, deferred and unverified items; do not invent missing chat context.
- Handoff: human adoption in Chat -> Issue with acceptance criteria -> Codex or Claude Code work branch -> PR -> CI -> risk-based independent review -> human playtest/approval -> main.
- Never push directly to main, force-push, approve, merge or enable auto-merge. Fetch current main, inspect open PRs and preserve other contributors' work (merge commits, no rebases on shared branches).
- Risk: low = docs/wording; medium = UI, input, animation, sound; high = problem data, legality/mate proofs, vendored chess.js, saved-state format. Self-review is not independent review. Mark unavailable review or device tests as **unverified**.
- Record tested commit SHA, executed checks, unverified work and human iPhone steps in the PR. WebKit/Chromium emulation is not an iPhone test.
- Never commit credentials, private chat, `test-results/`, `playwright-report/` or local tooling artifacts.

## Run and verify

- `npm ci`, then `npm start` serves http://localhost:8000 (no build step).
- `npm run check:vendor && npm run validate && npm run test:unit` — vendored chess.js lock, unique key / all 13 defences mate, tactics unit tests.
- `npm run test:browser` — Playwright on iPhone-sized Chromium + WebKit and desktop Chromium. With `CHROMIUM_EXECUTABLE` set, Chromium projects use that binary (cloud sessions); run `--project=iphone-chromium --project=desktop-chromium` where WebKit is unavailable and leave WebKit to CI.
- CI: `.github/workflows/pages.yml` job `build` on PRs; pushes to main also deploy GitHub Pages.

## Invariants

1. Every Black defence is generated from legal moves; the key stays unique and every defence admits mate-in-1 (`npm run validate`).
2. `vendor/chess.js` stays pinned to the locked version with its licence (`npm run check:vendor`). No runtime CDN, external fonts or downloaded audio.
3. BGM defaults OFF, effects ON, each persisted independently; audio must never block play. Storage failure still allows solving; reset cancels queued operations.
4. Safe areas, 320px width, landscape and enlarged text keep the board square and main controls reachable.
5. New problems, scoring, hints policy or presentation styles require human approval in an Issue.
