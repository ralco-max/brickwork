import data from "./data/parts-catalog.json";
import {FITTED_ELEMENTS,catalogPart} from "./part-catalog";
import {COLORS,CLASSIC_COLORS} from "./colors";
import type {ColorKey} from "./colors";

// Provenance of colours added after the classic palette (scripts/refresh-part-colors.mjs).
export const PART_COLOR_EVIDENCE=data.colorEvidence as {source:string;provisional:boolean;updatedAt:string;colors:ColorKey[];rule:string;evidence:string};
const LEGACY_COLORS=data.legacyColors as Record<string,ColorKey[]>,ALL_COLORS=Object.keys(COLORS) as ColorKey[];
// The colours a part is made in. Catalog parts list theirs, as does glass or a door fitted into a frame;
// legacy parts allow every classic colour plus the newer colours they are evidenced in; a minifigure is
// painted per region, so any colour.
export function partColors(id:string):readonly ColorKey[]{
 const entry=catalogPart(id);if(entry)return entry.colors;
 if(Object.hasOwn(FITTED_ELEMENTS,id))return FITTED_ELEMENTS[id].colors;
 return Object.hasOwn(LEGACY_COLORS,id)?LEGACY_COLORS[id]:id==="minifig"?ALL_COLORS:CLASSIC_COLORS;
}
export const partAllowsColor=(id:string,color:ColorKey)=>partColors(id).includes(color);
