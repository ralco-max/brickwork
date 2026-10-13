# LEGO element matching

The shopping list maps each supported part and color to an element ID automatically, without a customer API key. `lib/data/lego-elements.json` is the small subset of Rebrickable's public catalog needed by Brickwork. It records the source URLs, retrieval date and SHA-256 digests of the source CSVs. Rebrickable recommends its bulk downloads for catalog use: <https://rebrickable.com/api/v3/docs/>.

Refresh from the public source files with Node 22+ and the project's installed dependencies:

```sh
node scripts/refresh-lego-elements.mjs
```

For a reproducible local refresh, use decompressed `elements.csv`, `colors.csv` and `parts.csv` in a directory:

```sh
node scripts/refresh-lego-elements.mjs --source-dir /path/to/catalog --date 2026-10-11
```

The importer validates the app's color names and transparency against each color's **Rebrickable ID** (`rebrickable` in `lib/colors.ts`), never its LDraw code: Trans-Light Blue is Rebrickable 41 but LDraw 43, and Rebrickable 43 is Trans-Very Lt Blue. Each refresh records the colors it covered in `colors`. Parts match the exact Rebrickable part number; the sole alias is `3040` to `3040b`, corroborated by the source's `design_id`. Tile suffixes are retained. All known element IDs for each pair are stored. Highest numeric ID is a deterministic default only; it is not evidence that an ID is newer, stocked, or sold by LEGO today.

The 2026-10-11 snapshot covers 4,054 exact part/color combinations across the expanded catalog. All classic colors offered for the 438 newly enabled shapes have element IDs; the added colors are offered on production evidence instead (see `docs/part-catalog-sources.md`), and unrecorded colors are excluded from generation and placement choices. The original core still has 421 of 429 non-wheel combinations. The three wheel entries in Brickwork represent wheels with tires, while their catalog IDs identify only rims, so they are explicitly excluded from complete automatic matches. A rim alone must not be represented as a complete wheel assembly.

The 2026-10-11 snapshot predates the twelve colors added on 2026-10-13 (dark bluish gray through flat silver) and has no `colors` field, so it covers the classic 13 only. Until the next official refresh, a part in an added color it is evidenced in (`lib/part-colors.ts`) resolves as `missing` with `pending: true`, and the shopping list says "No exact LEGO element yet — verify on BrickLink". A part/color pair the catalog does not list at all, which placing, painting and generation refuse but an imported or older project can still hold, resolves as `missing` with `unlisted: true` and says "Not listed in this color", in any color. The BrickLink wanted list includes them with the correct BrickLink color IDs. No substitute element ID is ever filled in from another source or color. Rerunning `node scripts/refresh-lego-elements.mjs` with network access adds the new colors automatically.

Saved manual ID overrides remain optional. Quantities subtract owned pieces and identical element IDs merge. Missing matches remain visible and do not block exporting matched rows; the full BrickLink list stays available. LEGO upload batches contain at most 400 different element IDs. The live LEGO CSV template was checked on 2026-10-11: `elementId,quantity`, with CRLF rows.

Catalog data is not a price or stock feed. Prices in Brickwork remain estimates or clearly labeled user quotes. LEGO checks availability after a list is uploaded. No shopping cart or checkout action is performed automatically.
