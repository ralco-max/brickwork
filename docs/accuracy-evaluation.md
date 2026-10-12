# Accuracy and cost evaluation

Status: **harness in place, live baseline not yet run.** `scripts/run-accuracy.mjs` measures fidelity and cost
for every benchmark case. The local (no AI) and mock baselines from 2026-10-12 are in
[`accuracy-baseline-2026-10-12.md`](accuracy-baseline-2026-10-12.md). The build environment had no OpenAI key,
so no live numbers exist yet. Run a live sweep on `main` **before** changing prompts, schemas or the packer, so
every later change can be compared with it.

## Running it

| Command | Cost | What it does |
|---|---|---|
| `npm run accuracy` | $0 | `--mock`: replays the synthetic fixtures in `tests/fixtures/accuracy/responses/` through the real pipeline. Tests the plumbing, not quality. |
| `npm run accuracy -- --baseline-local` | $0 | No AI. Compiles every worked example in `lib/design-examples.ts` and every landmark preset (small/medium/large), then runs `designChecks`, and tries the studio's "Add vertical supports". |
| `OPENAI_API_KEY=… npm run accuracy -- --live` | ≤ `--max-dollars` (default 6) | Runs the paid pipeline for real. Refuses to start without `OPENAI_API_KEY`. |
| `npm run accuracy -- --rescore <run folder>` | $0 | Applies the human grades in `<run folder>/grades.json` and rewrites the scorecard. |
| `npm run accuracy -- --compare <run A> <run B>` | $0 | Prints per-case deltas (status, pieces, check issues, proportion error, features, critical checks, $, time). |

Options: `--cases id,id` (exact ids or substrings), `--suite accuracy,design,photo`,
`--quality sol_low|sol_medium|standard|better|best` (overrides every case; accuracy cases otherwise use the
benchmark's `better`, the others the app default `sol_low`), `--no-render`, `--no-judge`,
`--photos <dir>`, `--include-placeholder-photos`, `--record`, `--fixtures <dir>`, `--concurrency N`,
`--out <dir>`.

Cases: the 4 cases in `tests/accuracy-benchmarks.json`, the 6 ideas in `tests/design-benchmarks.json`
(`design-N-…`), and the 4 photo cases in `tests/fixtures/accuracy/photo-cases.json` (house, pet, vehicle, DC Metro
station). The committed photos are labelled placeholder drawings. Put real photos in the git-ignored
`accuracy-photos/<case id>/` and pass `--photos accuracy-photos`. Live runs skip placeholder-only cases unless
told otherwise. See `tests/fixtures/accuracy/README.md`.

## What one case runs

The server half is the actual route handlers (`/api/research`, `/api/generate`, `/api/review`), with the budget
ledger in memory. The client half mirrors `run()` in `app/generator.tsx` for a first build. **Keep the mirrored
steps in sync when the client orchestration changes**, for example when auto-repair lands.

1. Research, including the second pass when the first is not ready. If the sheet is still not ready, the case
   ends as `clarification`, as the app would, and spends nothing on design.
2. `planSheet`: the target is recomputed from the sheet with `targetExtents`.
3. Design streamed onto the foundation scene, with the brief, sheet and photos.
4. Compile with the generation worker's options, then `designChecks` against the sheet's target.
5. Five review views rendered by `renderReviewViews` in headless Chromium with SwiftShader (Playwright). Without
   Playwright, live runs refuse unless `--no-render` is passed; then review and judge are skipped.
6. Review with the brief's features plus the designer's signature features, as `visual()` sends them.
7. A harness-only **judge** call (not part of the app, about $0.02–0.03 per case on Sol Low). It grades the case's
   critical checks and the research sheet's own source-backed `distinctive` and `silhouette` items. The app's
   review never grades those, because its rubric is the brief plus features the designer chose itself.

## Output

Each run writes `accuracy-runs/<UTC timestamp>-<mode>/`, which is git-ignored:

- `cases/<id>/`: `project.json` (opens in the studio and in `scripts/inspect-design.mjs`), `reference.json`,
  `scene.json`, `checks.json` (issues, problem locations, proportion), `review.json`, `judge.json`, `usage.json`
  (every `RequestUsage` with its stage, plus stage timings), and `renders/view-1…5.jpg` + `strip.jpg`.
- `scorecard.csv`: one row per case (columns below).
- `summary.md`: a readable table, the issues for each case and links to the render strips.
- `grades.json`: blank human grades for every critical check. `results.json` holds everything, and `log.txt`
  holds the routes' log lines.
- With `--record`, `fixtures/<id>.json` holds the raw provider replies, which `--mock --fixtures` can replay.

| Column | Meaning |
|---|---|
| `status` | `completed`, `clarification` (research asked a question), `failed` (`errorStage`/`errorCode`), `budget` (cap reached), `skipped` |
| `pieces`, `maxPieces`, `budgetUsePct` | Packed pieces vs the brief's piece limit |
| `sizeStuds`, `targetStuds` | Occupied x×z×y (studs, studs, plates) vs the research target |
| `propErrPct` | Largest per-axis deviation from the target ratios after uniform scaling, measured as `designChecks` does (above the base). Blank without research dimensions. |
| `checksPass`, `checkIssues`, `ungrounded`, `assemblies`, `unsupported`, `clutchOverloaded`, `overlaps` | `designChecks` result and its parts |
| `recognizable`, `composition`, `requiredVisible/Total`, `signatureVisible/Total` | App review: brief features and the designer's signature features marked visible |
| `sourceFeaturesPresent/Total` | Judge: research `distinctive` + first two `silhouette` items present |
| `criticalPassed/Failed/Uncertain/Total`, `criticalSource` | Benchmark critical checks. `judge` until a human grades them (`human`, or `human+judge` when mixed) |
| `calls`, token columns, `researchUSD`…`totalUSD` | Summed `RequestUsage` per stage (judge included, shown separately) |
| `wallSeconds` | Wall-clock time for the case, rendering included |

## Spending cap

`--live` runs the app's own atomic ledger in memory, seeded so that only `--max-dollars` remains (at most $10, the
ledger's limit). Every request reserves its worst-case cost (the counted input plus `max_output_tokens`) before it is
sent. A request that could cross the cap is refused before any call reaches OpenAI. The case is marked `budget` and
later cases are `skipped`. The run also reports summed `RequestUsage`, which equals the ledger's settled spend,
and any unresolved holds (for example an aborted stream), which count against the cap.

Expected cost, estimated from the cost audit (the first live run should replace these numbers): about $0.25–0.35
for a Sol Low case including review and judge, and about $0.45–0.6 for an accuracy case at `better`. The full
sweep comes to about $4–6, which is why the default cap is $6. Photo cases with only placeholders are skipped.

## Before/after protocol

1. On the commit before a change, run `npm run accuracy -- --live --record` and keep the folder. Pin
   `--quality` if you want cost comparable across tiers.
2. Grade the critical checks in `grades.json` by looking at the render strips next to the references, then run `--rescore`.
3. After the change, run the same command again, grade it, and run `npm run accuracy -- --compare <before> <after>`.
4. The mock run is the CI guard for the plumbing (`tests/accuracy-harness.test.mjs`). Because mock input tokens are
   measured from the real request bodies, prompt-size changes show up in mock cost at $0.

## Manual review protocol

The judge and the reviewer are models. A reviewer saying "recognizable" is not enough evidence: a human must
compare the rendered model with the references. Any critical layout error fails accuracy even if the brick
connections pass. Never treat unverified measurements as hard assertions.

For the primary accuracy cases (Dulles terminal, Golden Gate span, Saturn V), start with one run each and inspect
the results before paying for repetitions. Three independent runs per case expose variability. The whole-airport
Dulles case depends on getting a usable airfield plan, so a `clarification` result is the correct outcome
without one.

Report the first results and the results after **one** targeted correction separately. Do not regenerate
failures without saying so, change prompts partway through, or pick only the best-looking output. Report every
run, the median recorded cost and the worst layout failure. Keep API spend separate from the estimated cost of
buying the bricks, because catalog prices are not live quotes.

For each run, record or keep:

| Field | Measurement |
|---|---|
| Scope and composition | Included and excluded components, relative positions, chosen version and front |
| Initial accuracy | Pass, fail or uncertain for each critical check, with image evidence (render strips) |
| Silhouette | Whether the subject reads before texture is considered |
| Digital checks | Overlaps, grounding, support and clutch warnings, piece limit |
| Pieces | Finished packed count with the same smoothing and hollowing settings |
| API cost | Summed per-request usage, including research, reviews and revisions |
| Unresolved spend | Budget holds or missing usage, kept separate from confirmed cost |
| Calls and elapsed time | Research, design and review counts, and wall-clock time |
| Revision | The exact targeted instruction, its added cost and whether unrelated features were preserved |

`node scripts/inspect-design.mjs /absolute/path/project.json` extracts packed-model metrics from any exported
project, including the harness's `project.json`. Its output is local geometry evidence, not a certification
of the factual layout.
