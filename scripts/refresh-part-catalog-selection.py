#!/usr/bin/env python3
"""Refresh metadata for the explicitly curated part candidates, without network access.

python scripts/refresh-part-catalog-selection.py \
  --ldraw-dir /path/to/ldraw --rebrickable-dir /path/to/rebrickable --check

The input directories contain the upstream official LDraw library and decompressed
Rebrickable parts.csv, elements.csv, and colors.csv. This does not automatically
enable parts: the separate geometry/connection compiler decides support.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def header(text: str, field: str) -> str:
    match = re.search(r"^0 " + re.escape(field) + r" (.+)$", text, re.MULTILINE)
    if not match:
        raise ValueError(f"Missing LDraw header field: {field}")
    return match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ldraw-dir", type=Path, required=True)
    parser.add_argument("--rebrickable-dir", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="Validate without writing")
    args = parser.parse_args()
    target = Path(__file__).with_name("part-catalog-selection.json")
    manifest = json.loads(target.read_text())
    parts = {row["part_num"]: row for row in rows(args.rebrickable_dir / "parts.csv")}
    colors = {int(row["id"]): row for row in rows(args.rebrickable_dir / "colors.csv")}
    color_ids = manifest["colorIds"]
    evidenced = set(manifest.get("colorEvidence", {}).get("colors", []))
    for name, color_id in color_ids.items():
        if color_id not in colors:
            raise ValueError(f"Unknown Rebrickable color {name}: {color_id}")
    elements: dict[str, set[int]] = {}
    for row in rows(args.rebrickable_dir / "elements.csv"):
        if row["element_id"].isdigit():
            elements.setdefault(row["part_num"], set()).add(int(row["color_id"]))
    result = []
    seen: set[str] = set()
    for original in manifest["parts"]:
        part = dict(original)
        part_id = part["id"]
        if part_id in seen:
            raise ValueError(f"Duplicate catalog candidate: {part_id}")
        seen.add(part_id)
        filename = part["ldrawFile"]
        if not re.fullmatch(r"[0-9]+[a-z]?\.dat", filename):
            raise ValueError(f"Not an unpatterned base part: {filename}")
        text = (args.ldraw_dir / "parts" / filename).read_text(encoding="utf-8-sig")
        release = header(text, "!LDRAW_ORG")
        description = text.splitlines()[0].removeprefix("0 ").strip()
        if not release.startswith("Part UPDATE ") or description.startswith(("~", "=")):
            raise ValueError(f"Not a certified original shape: {filename}")
        license_text = header(text, "!LICENSE")
        if not any(license in license_text for license in ("CC BY 4.0", "CC BY 2.0", "CCAL version 2.0", "CC0")):
            raise ValueError(f"Unrecognized source license: {filename}: {license_text}")
        rb_id = part["rebrickableId"]
        if rb_id not in parts:
            raise ValueError(f"No exact Rebrickable part: {rb_id}")
        # Colours added after the classic palette are evidenced by scripts/refresh-part-colors.mjs
        # (element IDs or set inventories); keep its result rather than recomputing from elements alone.
        available = [key for key, value in color_ids.items()
                     if (key in part["colors"] if key in evidenced else value in elements.get(rb_id, set()))]
        if not available:
            raise ValueError(f"No catalog element in the supported palette: {part_id}")
        part.update(name=parts[rb_id]["name"], colors=available, ldrawName=description,
                    author=header(text, "Author:"), license=license_text, release=release)
        result.append(part)
    by_name = {part["ldrawName"]: part["id"] for part in result}
    for part in result:
        part.pop("handedness", None)
        part.pop("counterpart", None)
        for hand, other in (("Left", "Right"), ("Right", "Left")):
            if re.search(r"\b" + hand + r"\b", part["ldrawName"]):
                part["handedness"] = hand.lower()
                opposite = re.sub(r"\b" + hand + r"\b", other, part["ldrawName"])
                if opposite in by_name:
                    part["counterpart"] = by_name[opposite]
    manifest["parts"] = result
    if args.check:
        current = json.loads(target.read_text())
        if current != manifest:
            raise SystemExit("Source metadata changed. Rerun without --check and review the diff.")
        print(f"Validated {len(result)} curated candidates against their source catalogs.")
    else:
        target.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"Updated {len(result)} candidates. Compile connections before enabling new parts.")


if __name__ == "__main__":
    main()
