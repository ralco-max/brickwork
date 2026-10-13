# Part catalog sources

The curated candidate list is `scripts/part-catalog-selection.json`. A candidate
is not automatically a supported building part. The geometry and connection
compiler only enables parts with supported, upright geometry and stud/socket
connections on Brickwork's grid. Patterned pieces, aliases, and cosmetic mold
duplicates do not count as additional shapes.

## Geometry

This software uses the [LDraw Parts Library](https://www.ldraw.org/).

The source library is the official LDraw library distributed at
<https://library.ldraw.org/library/updates/complete.zip>. The pinned source was
retrieved from the unmodified daily distribution mirror
<https://github.com/kulits/ldraw-parts>, commit
`0eda020f43fe3af7d45444580dd56a9ce0c716ab` (October 1, 2026). Its updater downloads
the official archive. Direct archive downloads were unavailable in the editing
environment. Per-file official release, author, and license headers are retained
in the candidate manifest.

The LDraw source includes CC BY 4.0, CC BY 2.0, and mixed-license files. The
applicable header is preserved for each source part. Source agreement and full
license texts are distributed under `public/licenses/ldraw/`. Converted meshes
are derived from the LDraw Parts Library; geometry conversion, normalization,
and metadata extraction are modifications made by Brickwork. The upstream
license applies to those data, independently of the application code's license.

The [LDraw contributor agreement](https://www.ldraw.org/article/349.html) and
[attribution guidance](https://www.ldraw.org/the-ldraw-organization/link-to-ldraw.html)
describe the source licensing and attribution. LDraw and LEGO are trademarks of
their respective owners; this application is not endorsed by either organization.

## Catalog names and colors

Names and known element/color combinations come from Rebrickable's public
[catalog downloads](https://rebrickable.com/downloads/), retrieved October 11,
2026:

- <https://cdn.rebrickable.com/media/downloads/parts.csv.gz>
- <https://cdn.rebrickable.com/media/downloads/elements.csv.gz>
- <https://cdn.rebrickable.com/media/downloads/colors.csv.gz>

Only exact part-number matches are used in the expanded catalog. Color matches
are exact Rebrickable color IDs recorded in the manifest. Known catalog colors
do not establish current LEGO Pick a Brick availability or pricing. Element IDs
are part-and-color identifiers; design IDs identify shapes and must not be
substituted for element IDs in a shopping export.

## Colors added after the classic palette (provisional)

The palette grew from 13 to 25 colors on 2026-10-13: dark bluish gray, dark tan,
dark red, sand green, dark green, medium azure (instead of the nearly retired
medium blue), lime, medium nougat, trans-clear, trans-light blue, pearl gold and
flat silver. `lib/colors.ts` gives each its LDraw code, BrickLink ID and
**Rebrickable ID**. These are not always the same number: Trans-Light Blue is
Rebrickable 41, LDraw 43 and BrickLink 15, while Rebrickable 43 is Trans-Very Lt
Blue (BrickLink 113). Source data is always joined on the Rebrickable ID, never on
the LDraw code; a join on the LDraw code silently picks up the wrong colour.

A part is offered in one of these colors only where that exact part number is
evidenced in it. Legacy core parts keep every classic color (as before) and gain
only their evidenced new colors, recorded in `legacyColors` in the catalog.

The official downloads at `cdn.rebrickable.com` were unreachable when these were
added, so the current evidence is a **provisional offline substitute**, marked
`colorEvidence: {source: "rebrickable-2022-elements+2026-inventories",
provisional: true}` in `scripts/part-catalog-selection.json`,
`lib/data/parts-catalog.json` and `public/parts/catalog.json`:

- Rebrickable `colors.csv.gz` and `elements.csv.gz` as mirrored by TidyTuesday on
  2022-09-06:
  <https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2022/2022-09-06/>
- non-spare set inventories (sets up to 2026) from the Rebrickable SQLite snapshot
  bundled in the `lego-oracle` 0.1.2 npm package
  (<https://registry.npmjs.org/lego-oracle/-/lego-oracle-0.1.2.tgz>, npm shasum
  `44cbaad151fcdf4395cd5fb72cb848e82f92dfe5`). Its `is_trans` flags are all 0, so
  transparency is checked against the 2022 color table.

Colors were cross-checked by Rebrickable ID against three independent caches of
the Rebrickable color API (BrickLink and LDraw external IDs) and the LDraw
`LDConfig.ldr` at the pinned mirror commit. Calibrated on the classic colors,
this substitute finds about 93% of the official part/color combinations with
about 1% extra. Per-combination evidence (2022 element-ID count, set count, last
set year) and SHA-256 digests of the files used are in
`scripts/part-color-evidence.json`. The provisional data was produced with:

```sh
node scripts/refresh-part-colors.mjs --from-local /path/to/snapshot
```

where the directory holds `tidytuesday-2022/{colors,elements}.csv.gz` and
`lego-oracle-0.1.2/package/dist/data/lego.sqlite`. With network access, replace
it with official data (element IDs and non-spare set inventories, joined on the
Rebrickable color ID) and review the diff:

```sh
node scripts/refresh-part-colors.mjs                       # downloads from cdn.rebrickable.com
node scripts/refresh-part-colors.mjs --source-dir /path    # decompressed colors, elements,
                                                           # inventory_parts, inventories, sets CSVs
node scripts/refresh-part-colors.mjs --check               # fails if anything would change
```

The script owns only the added colors; classic colors keep their element-ID
evidence from `refresh-part-catalog-selection.py`, which preserves the added
colors' lists, and `compile-part-catalog.mjs` carries `colorEvidence` and
`legacyColors` over when it rebuilds the catalog. LEGO element IDs for the added
colors come only from `scripts/refresh-lego-elements.mjs` (see
`docs/lego-elements.md`); this evidence never supplies an element ID.

## Reproducing metadata

Extract the pinned LDraw library and decompress the Rebrickable CSVs, then run:

```sh
python scripts/refresh-part-catalog-selection.py \
  --ldraw-dir /path/to/ldraw \
  --rebrickable-dir /path/to/rebrickable \
  --check
```

Omit `--check` to refresh metadata for the explicitly curated IDs. This command
does not fetch data or enable additional parts. Source upgrades require updating
the provenance, reviewing the metadata diff, and regenerating and validating
the geometry and connection data.

## Connections and rebuilding the supported catalog

Documented connection metadata comes from the
[LDCad Shadow Library](https://github.com/RolandMelkert/LDCadShadowLibrary), pinned
at commit `9b1131fb1991f8c0bfc072325e4e12f6271aba35` (September 10, 2026). It is
licensed under **CC BY-SA 4.0**; the original license is distributed at
`public/licenses/ldcad/LICENSE.md`. Attribution belongs to the LDCad Shadow Library
contributors. Brickwork's modifications filter supported connections, apply
source transforms, and express the result on its stud and plate grid.

The connection parser handles inherited transforms, include grids, explicit
clears, and applicable scaling rules. It does not turn arbitrary underside tubes
or rectangular bounds into sockets. Parts requiring unsupported connections stay
outside the enabled catalog.

After checking the candidate metadata, rebuild with the pinned source folders:

```sh
node scripts/compile-part-catalog.mjs \
  --ldraw /path/to/ldraw \
  --shadow /path/to/LDCadShadowLibrary
node --test tests/ldcad-connectors.test.mjs tests/ldraw-geometry.test.mjs
```

The compiler writes runtime data to `lib/data/parts-catalog.json`, meshes and
thumbnails to `public/parts/ldraw/`, and a redistributable copy of the derived
catalog to `public/parts/catalog.json`. The public catalog retains the **CC BY-SA
4.0** license and attribution; this applies to the derived data separately from
the application code. `public/parts/attribution.json` records source revisions,
per-file provenance and hashes, transformation notes, and rejected candidates.
It also identifies prices as planning estimates rather than seller quotes.

Use the full rebuild command above for a release. The compiler's `--ids` and
`--limit` options are diagnostics: they write a partial catalog and must be
followed by a full rebuild before deployment.

## Requested new shells

LEGO lists design `8432` as “Left shell 3 x 8 x 2, with bow and angle” and `8431`
as its right counterpart. These shells are absent from the pinned certified
LDraw source, so they remain unavailable instead of being represented by an
approximate block or an unrelated part. They are recorded separately in the
candidate manifest and do not count toward the supported-part total.

The requested curved left 1 x 2 part is design `29120`; its right counterpart is
`29119`. Both have exact certified LDraw geometry in the pinned library.

## Minifigures

The minifigure (`k minifig` in scenes, part `minifig` in projects) is assembled
from unmodified LDraw parts at the same pinned mirror commit: head `3626c`,
torso `973`, arms `3818`/`3819`, hands `3820`, hips `3815b` and legs
`3816c`/`3817c` (the current LDraw files for BrickLink 970/971/972). Assembly
offsets follow the LDraw shortcuts `973c01` (torso, arms, hands) and `3815c01`
(hips at y=32, legs at y=44) with the head at y=-24. Regenerate with:

```sh
node scripts/compile-minifig.mjs            # fetches from the pinned mirror
node scripts/compile-minifig.mjs --ldraw /path/to/ldraw
```

This writes one mesh per element to `public/parts/minifig/`, per-file
provenance to `public/parts/minifig/attribution.json` and the assembly manifest
to `lib/data/minifig.json`. The figure is plain: printed faces and torso
decals are not included.
