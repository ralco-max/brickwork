# Accuracy harness fixtures

Inputs for `scripts/run-accuracy.mjs` (`npm run accuracy`). See `docs/accuracy-evaluation.md` for how to run it.

## `responses/` — provider replies for `--mock`

One file per case, matched to the request by the case's exact `idea` text. Every file here is **synthetic**
(`"synthetic": true`): hand-written stand-ins for what the model might return, not recordings. They exist so
CI can exercise the whole pipeline at $0: the real `/api/research`, `/api/generate` and `/api/review` route
handlers, the budget ledger, scene parsing, compile, `designChecks`, review and judge parsing, and the
scorecard. **Their scores say nothing about real model quality.**

A hand-written file has:

- `research`: one entry per research pass (the second is used when the request carries `previousReference`):
  `sheet` (the model's JSON answer), `searches` (`query` plus consulted `sources`), optional `images`
  (`image_url`, `source_website_url`, `caption`), `reasoning`, `usage.reasoning_tokens` and
  `usage.search_content_tokens`.
- `design`: `scene` in the compact wire format (`n,d,f,dim,rm,sh`; null fields may be left out, the replay
  writes them like strict structured output does), `reasoning`, `usage.reasoning_tokens`.
- `review`: `review` with `composition`, `revision`, `summary`, `recognizable`, `improvements` and `features`
  keyed by feature name. Answers are aligned to the request's feature order; an unknown feature replays as
  `uncertain`.
- `judge`: `checks` and `features` keyed by their exact text, plus `summary`.

Replayed usage is built from the real request: input tokens are estimated from the request body (about 3
characters per token, 765 per image) plus `search_content_tokens`; output tokens are the answer's length plus
`reasoning_tokens`. Prompt changes therefore move the mock input cost, while output is fixture-defined.

### Recorded replies

`npm run accuracy -- --live --record` saves each case's raw provider replies (never the request, images or key)
to `<run folder>/fixtures/<case>.json` with `"synthetic": false`. Replay them with
`npm run accuracy -- --mock --fixtures <run folder>/fixtures`. Copy a recording here only if it is fine for
it to live in the repository; replace the synthetic file of the same case.

## `photo-cases.json` and `photos/`

The four photo cases (house, pet, vehicle, DC Metro station). Photos load from `<photos dir>/<case id>/` (JPEG,
PNG or WebP, at most 4, sorted by name), resized like the app does (longest side 1,024 px, JPEG quality 0.86).

The committed `photos/<case id>/` images are **labelled placeholder drawings** made by
`photos/make-placeholders.mjs`, not photographs. They keep the photo plumbing covered. Live runs skip
placeholder-only cases unless `--include-placeholder-photos` is passed, so money is not spent judging drawings.

For a meaningful live run, put real photos in the git-ignored `accuracy-photos/` folder:

```
accuracy-photos/
  photo-house/front.jpg
  photo-pet/sitting.jpg
  photo-vehicle/side.jpg
  photo-dc-metro/platform.jpg
  photo-dc-metro/vault.jpg
```

then run `npm run accuracy -- --live --photos accuracy-photos`. A case without a folder there falls back to its
placeholders (and is skipped live).
