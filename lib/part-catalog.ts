import data from "./data/parts-catalog.json";
import {COLORS} from "./colors";
import type {ColorKey} from "./colors";

export type CatalogCell=[number,number,number];
/** Glass or a door that clips or hinges into its frame. It has no studs of its own, so the compiler places it
 * in the frame's box (from an LDraw shortcut or the shadow library's hinge snaps) and it is never placed alone. */
// clearance: cells just outside the frame's box that the element's drawn studs reach (a door's handle), in the frame's
// unrotated cells. They hold no body, so they are not occupancy, but no other piece may fill them.
export type FittedElement={part:string;name:string;colors:ColorKey[];default:ColorKey;price:number;ldraw:{position:CatalogCell;matrix:number[]};placement:string;mesh:string;thumbnail:string;sourcePart:string;clearance?:CatalogCell[]};
export type ExpandedPart={
 name:string;w:number;d:number;h:number;price:number;family:string;
 colors:ColorKey[];handedness?:"left"|"right";counterpart?:string;
 topStuds:CatalogCell[];bottomSockets:CatalogCell[];occupancy:CatalogCell[];
 /** Translation of the original LDraw origin into the unrotated placement box, in LDU. */
 ldrawOffset:CatalogCell;mesh:string;thumbnail:string;sourcePart:string;fitted?:FittedElement;
};
// The offline compiler and catalog integrity tests validate every coordinate;
// JSON imports otherwise widen each fixed three-coordinate tuple to number[].
export const EXPANDED_PARTS=data.parts as unknown as Record<string,ExpandedPart>;
export const PART_CATALOG_INFO={version:data.version,updatedAt:data.updatedAt,geometrySource:data.geometrySource,connectionSource:data.connectionSource};
export function catalogPart(id:string):ExpandedPart|undefined{return Object.hasOwn(EXPANDED_PARTS,id)?EXPANDED_PARTS[id]:undefined;}
export const fittedElement=(id:string)=>catalogPart(id)?.fitted;
// Fitted elements by their own ID: shopping lists and exports name them, the builder never places them alone.
export const FITTED_ELEMENTS:Readonly<Record<string,FittedElement>>=Object.fromEntries(Object.values(EXPANDED_PARTS).flatMap(p=>p.fitted?[[p.fitted.part,p.fitted]]:[]));
/** A frame's glass or door colour: the piece's own, or the element's most-made colour. Like any saved colour it is
 * kept on opening even if the provisional availability data no longer lists it. */
export function fittedColor(p:{part:string;fitted?:ColorKey}):ColorKey|undefined{
 const f=fittedElement(p.part);return f?(p.fitted&&Object.hasOwn(COLORS,p.fitted)?p.fitted:f.default):undefined;
}
