import catalog from "./data/lego-elements.json";
import type {ColorKey,PartId} from "./bridge";
import {isMinifig} from "./minifig";

export const LEGO_CATALOG_INFO={sourceUrl:catalog.sourceUrl,updatedAt:catalog.updatedAt,attribution:catalog.attribution};
export type LegoElementMatch={elementId?:string;status:"matched"|"missing"|"assembly";source:string;alternatives?:string[]};

/** An exact catalog match, not a promise of current Pick a Brick availability. */
export function resolveLegoElement(part:PartId,color:ColorKey):LegoElementMatch{
 const source=catalog.sourceUrl;
 // A minifigure is several elements (head, torso with arms and hands, hips with legs), never one element ID.
 if(isMinifig(part)||catalog.assemblyParts.includes(part))return {status:"assembly",source};
 const ids=(catalog.elements as Record<string,string[]>)[`${part}:${color}`];
 return ids?.length?{status:"matched",elementId:ids[0],alternatives:ids.slice(1),source}:{status:"missing",source};
}
