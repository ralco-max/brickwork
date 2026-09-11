# Live accuracy comparison

Status: **not run**. No live API key was available during implementation. Unit-test geometry and mocked reviews are not visual-quality results.

Compare baseline commit `10079cb908663ddb601065f03ef6b874954baf27` and the reference workflow using the exact prompts, defaults and source constraints in `tests/accuracy-benchmarks.json`. Use independent checkouts and the same provider model/version. Keep the same scope wording in the baseline prompt, which lacks a dedicated scope field.

For each primary case (Dulles terminal, Golden Gate span, Saturn V), start with one run per workflow. Inspect all results before spending on repetitions. If affordable within the existing $10 guard, use three independent runs per case to expose variability. The full-airport Dulles case is an additional scope challenge, contingent on obtaining a usable airfield plan.

For every run save the exported project and screenshots of front, perspective, rear and overhead views. Save the actual reference pack and source photo used, with the date. Record these fields:

| Field | Measurement |
|---|---|
| Scope and composition | Included/excluded components, relative positions, chosen version and front |
| Initial accuracy | Each critical check pass/fail/uncertain, with image evidence |
| Silhouette | Whether the subject reads before texture is considered |
| Digital checks | Overlaps, groundedness, support/clutch warnings, piece limit |
| Pieces | Finished packed count with the same smoothing/hollowing settings |
| API cost | Sum per-request recorded usage, including research/reviews/revisions |
| Unresolved spend | Budget holds or missing usage, separately from confirmed cost |
| Calls and elapsed time | Research/design/review counts and wall-clock time |
| Revision | Exact targeted instruction, added cost and unrelated-feature preservation |

Any critical layout error fails accuracy even if the brick connections pass. A reviewer saying "recognizable" is not sufficient evidence: a human must compare the rendered model with the references. Never treat unverified measurements as hard assertions.

Report initial results and results after **one** targeted correction separately. Do not silently regenerate failures, change prompts midway or select only the best-looking output. Report all runs, median recorded cost and the worst layout failure. Distinguish API spend from estimated brick purchase cost; catalog prices are not live quotes.

Use `node scripts/inspect-design.mjs /absolute/path/project.json` to extract reproducible packed-model metrics from an exported project. Its output is local geometry evidence, not a factual-layout certification. The application shows recorded per-run API usage; for an exact experiment retain the API usage events or ledger records as well, because project geometry alone does not prove spend.
