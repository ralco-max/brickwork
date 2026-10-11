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

The importer validates the app's color names against the source color IDs. Parts match the exact Rebrickable part number; the sole alias is `3040` to `3040b`, corroborated by the source's `design_id`. Tile suffixes are retained. All known element IDs for each pair are stored. Highest numeric ID is a deterministic default only; it is not evidence that an ID is newer, stocked, or sold by LEGO today.

The 2026-10-11 snapshot covers 421 of 429 non-wheel combinations. Eight absent color/part combinations remain unresolved. The three wheel entries in Brickwork represent wheels with tires, while their catalog IDs identify only rims, so they are explicitly excluded from complete automatic matches. A rim alone must not be represented as a complete wheel assembly.

Saved manual ID overrides remain optional. Quantities subtract owned pieces and identical element IDs merge. Missing matches remain visible and do not block exporting matched rows; the full BrickLink list stays available. LEGO upload batches contain at most 400 different element IDs. The live LEGO CSV template was checked on 2026-10-11: `elementId,quantity`, with CRLF rows.

Catalog data is not a price or stock feed. Prices in Brickwork remain estimates or clearly labeled user quotes. LEGO checks availability after a list is uploaded. No shopping cart or checkout action is performed automatically.
