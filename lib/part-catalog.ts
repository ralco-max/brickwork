import data from "./data/parts-catalog.json";
import type {ColorKey} from "./bridge";

export type CatalogCell=[number,number,number];
export type ExpandedPart={
 name:string;w:number;d:number;h:number;price:number;family:string;
 colors:ColorKey[];handedness?:"left"|"right";counterpart?:string;
 topStuds:CatalogCell[];bottomSockets:CatalogCell[];occupancy:CatalogCell[];
 /** Translation of the original LDraw origin into the unrotated placement box, in LDU. */
 ldrawOffset:CatalogCell;mesh:string;thumbnail:string;sourcePart:string;
};
// The offline compiler and catalog integrity tests validate every coordinate;
// JSON imports otherwise widen each fixed three-coordinate tuple to number[].
export const EXPANDED_PARTS=data.parts as unknown as Record<string,ExpandedPart>;
export const PART_CATALOG_INFO={version:data.version,updatedAt:data.updatedAt,geometrySource:data.geometrySource,connectionSource:data.connectionSource};
export function catalogPart(id:string):ExpandedPart|undefined{return Object.hasOwn(EXPANDED_PARTS,id)?EXPANDED_PARTS[id]:undefined;}
