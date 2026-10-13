import catalog from "./data/lego-elements.json";
import type {ColorKey,PartId} from "./bridge";
import {CLASSIC_COLORS} from "./colors";
import {isMinifig} from "./minifig";
import {partAllowsColor} from "./part-colors";

export const LEGO_CATALOG_INFO={sourceUrl:catalog.sourceUrl,updatedAt:catalog.updatedAt,attribution:catalog.attribution};
// pending: the part is made in this colour, but the colour was added after this element snapshot, so its IDs are
// unknown, not absent. unlisted: the catalog does not list the part in this colour at all (a painted or imported
// piece), so there is no element to look up and it is probably not made.
export type LegoElementMatch={elementId?:string;status:"matched"|"missing"|"assembly";source:string;alternatives?:string[];pending?:boolean;unlisted?:boolean};
// Colours this element snapshot was refreshed for. Snapshots record theirs; the 2026-10-11 one predates
// the field and covers the classic palette.
const refreshed=Object.keys((catalog as unknown as {colors?:Record<string,number>}).colors||{}) as ColorKey[];
export const LEGO_CATALOG_COLORS:readonly ColorKey[]=refreshed.length?refreshed:CLASSIC_COLORS;
// The parts this snapshot looked up. A part enabled after it (a window frame, its glass) has unknown element IDs,
// not absent ones, until the next refresh.
const covered=new Set([...Object.keys(catalog.elements),...catalog.missing].map(key=>key.slice(0,key.lastIndexOf(":"))));

/** An exact catalog match, not a promise of current Pick a Brick availability. */
export function resolveLegoElement(part:PartId,color:ColorKey):LegoElementMatch{
 const source=catalog.sourceUrl;
 // A minifigure is several elements (head, torso with arms and hands, hips with legs), never one element ID.
 if(isMinifig(part)||catalog.assemblyParts.includes(part))return {status:"assembly",source};
 const listed=partAllowsColor(part,color);
 if(!LEGO_CATALOG_COLORS.includes(color)||!covered.has(part))return listed?{status:"missing",source,pending:true}:{status:"missing",source,unlisted:true};
 const ids=(catalog.elements as Record<string,string[]>)[`${part}:${color}`];
 return ids?.length?{status:"matched",elementId:ids[0],alternatives:ids.slice(1),source}:{status:"missing",source,...(listed?{}:{unlisted:true})};
}
