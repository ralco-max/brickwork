# Accuracy baseline, 2026-10-12

These numbers come from commit `ce6474c`, before any of the Wave A–C prompt, schema or packer changes. They were
produced by `scripts/run-accuracy.mjs` (see [`accuracy-evaluation.md`](accuracy-evaluation.md)). The build
environment had no OpenAI key, so this file covers the two free modes only. **A live sweep is still needed
before Wave B:** `OPENAI_API_KEY=… npm run accuracy -- --live --record` (about $4–6, capped at $6).

## Local baseline (no AI): `npm run accuracy -- --baseline-local`

Examples are checked against the app's default brief (600 pieces, 48×48×96). Landmark presets have no piece
budget, so only their structural checks count. "With supports" applies the studio's existing "Add vertical
supports" (`supportLoosePieces`) and runs the checks again.

| Kind | Item | Pieces | Size x×z×y | Structural | App limits | Loose / assemblies / unplaceable / clutch | With supports |
|---|---|---|---|---|---|---|---|
| example | car | 183 / 600 | 26x14x20 | fail | pass | 2 / 2 / 2 / 0 | +2 pieces, pass |
| example | cottage | 458 / 600 | 24x20x40 | pass | pass | 0 / 1 / 0 / 0 | – |
| example | lattice | 888 / 600 | 28x28x100 | fail | fail | 0 / 1 / 0 / 5 | – |
| example | animal | 311 / 600 | 24x14x26 | fail | pass | 4 / 3 / 4 / 0 | +8 pieces, pass |
| example | minifigs | 128 / 600 | 20x12x22 | fail | pass | 0 / 16 / 0 / 0 | – |
| landmark | bridge (small) | 1704 | 67x14x59 | fail | – | 14 / 57 / 14 / 14 | +50 pieces, still fails |
| landmark | bridge (medium) | 3208 | 96x19x84 | fail | – | 12 / 13 / 12 / 21 | +84 pieces, still fails |
| landmark | bridge (large) | 3208 | 96x19x84 | fail | – | 12 / 13 / 12 / 21 | +84 pieces, still fails |
| landmark | castle (small) | 3638 | 48x25x107 | fail | – | 148 / 46 / 148 / 5 | +207 pieces, pass |
| landmark | castle (medium) | 5000 | 64x33x139 | fail | – | 26 / 10 / 26 / 2 | +117 pieces, pass |
| landmark | castle (large) | 8456 | 80x42x178 | fail | – | 81 / 21 / 81 / 3 | +379 pieces, pass |
| landmark | lighthouse (small) | 1413 | 30x24x121 | fail | – | 8 / 6 / 8 / 3 | +22 pieces, pass |
| landmark | lighthouse (medium) | 2748 | 40x32x161 | fail | – | 26 / 13 / 26 / 5 | +92 pieces, pass |
| landmark | lighthouse (large) | 4607 | 50x40x201 | fail | – | 38 / 17 / 38 / 8 | +159 pieces, pass |
| landmark | rocket (small) | 1105 | 24x24x148 | fail | – | 58 / 47 / 58 / 43 | +116 pieces, pass |
| landmark | rocket (medium) | 1451 | 32x32x197 | fail | – | 64 / 43 / 64 / 42 | +168 pieces, still fails |
| landmark | rocket (large) | 2305 | 38x38x236 | fail | – | 142 / 56 / 142 / 48 | +301 pieces, still fails |

**Structural pass: 1 of 17.** Only the cottage example passes. Four of the five worked examples that the designer
is told to imitate fail the app's own checks, and so does every bundled landmark preset. The existing
support step alone brings 10 of 17 to a full pass: car, animal, all castles, all lighthouses and the small
rocket. The minifigs example fails only because slope carving cuts its base into 16 assemblies, and the lattice
example fails on clutch and on the default limits. The bridge presets still fail after supports because their
deck hangs from cables, which the bottom-up audit cannot model. The medium and large bridge presets are the
same model.

## Mock baseline (synthetic fixtures, $0): `npm run accuracy`

All 14 cases ran through the real routes, ledger, compiler, checks, review and judge parsing. 13 completed, and
the whole-airport Dulles case correctly stopped at the clarification gate after two research passes, with
no design spend. **The fixture designs and their review and judge verdicts are hand-written, so their quality
scores mean nothing.** Two things from this run are real measurements of the current commit:

- **Request sizes**, estimated from the actual request bodies at about 3 characters per token and 765 tokens per image:

  | Stage | Calls | Input tokens (median and range unless noted) |
  |---|---|---|
  | Research, before search content | 15 | about 2,100–2,200 without photos (2,671 for the second pass); about 2,900 with one photo and 3,778 with two |
  | Design, first build | 13 | 11,419 (10,254–13,072) |
  | Review | 13 | 5,776 (5,469–7,332) |
  | Judge (harness only) | 13 | 5,148 (4,744–6,635) |

  These are within about 20% of the cost audit's o200k counts: 2.4k for research, 13.7k for a first design, and
  8.5k for a review with two web images. Prompt-slimming work in Wave B should lower the design row, and a mock
  run shows that at $0.
- **The scale problem shows up through the real `targetExtents`.** The Golden Gate span target is 78×1×23
  (x×z×y) and the miniature-bridge target is 46×1×10. Any buildable bridge deck then fails the proportion
  check by several hundred percent. The DC Metro target is 46×8×12 inside the default 48-stud envelope.

## What to watch in the live sweep

- Critical checks per accuracy case (judge first, then human grades in `grades.json`), and the share of
  `clarification` outcomes.
- `checkIssues` and `propErrPct` per case. These two are the expected triggers for auto-repair, so they show
  how often it would fire before anyone enables it.
- `designUSD` and `totalUSD` per case at `sol_low` compared with `better`, to calibrate the cost estimates.
