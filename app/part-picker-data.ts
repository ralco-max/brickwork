import {COLORS,PARTS} from "@/lib/bridge";
import type {ColorKey,PartId} from "@/lib/bridge";
import {catalogPart} from "@/lib/part-catalog";

export type PartOption={id:PartId;name:string;family:string;w:number;d:number;h:number;colors?:ColorKey[];handedness?:string;counterpart?:PartId};
export const PART_PICKER_PAGE_SIZE=24;
export function familyLabel(family:string){return family.replace(/[-_]/g," ").replace(/\b\w/g,letter=>letter.toUpperCase());}
const legacyFamily=(name:string)=>/wheel/i.test(name)?"wheels":/slope/i.test(name)?"slopes":/tile/i.test(name)?"tiles":/plate/i.test(name)?"plates":"bricks";
export function catalogOptions():PartOption[]{
 return Object.entries(PARTS).map(([id,part])=>{
  const catalog=catalogPart(id);
  return {id:id as PartId,name:part.name,w:part.w,d:part.d,h:part.h,family:catalog?.family||legacyFamily(part.name),...(catalog?{colors:catalog.colors.filter((color):color is ColorKey=>Object.hasOwn(COLORS,color)),handedness:catalog.handedness,counterpart:catalog.counterpart as PartId|undefined}:{})};
 }).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
const normalized=(value:string)=>value.toLowerCase().replace(/[×*]/g,"x").replace(/(\d)\s*x\s*(\d)/g,"$1x$2").replace(/[^a-z0-9]+/g," ").trim();
export function searchParts(options:PartOption[],query:string,family="all"){
 const search=normalized(query),terms=search.split(/\s+/).filter(Boolean);
 return options.filter(part=>{
  if(family!=="all"&&part.family!==family)return false;
  const haystack=normalized(`${part.id} ${part.name} ${part.family} ${part.handedness||""} ${part.w}x${part.d} ${part.d}x${part.w} ${part.h} plates`);
  return terms.every(term=>haystack.includes(term));
 }).sort((a,b)=>Number(b.id===search)-Number(a.id===search));
}
export function partPage(options:PartOption[],requestedPage:number){
 const pages=Math.max(1,Math.ceil(options.length/PART_PICKER_PAGE_SIZE)),page=Math.max(0,Math.min(pages-1,Math.floor(requestedPage)||0));
 return {page,pages,results:options.slice(page*PART_PICKER_PAGE_SIZE,(page+1)*PART_PICKER_PAGE_SIZE)};
}
export function partColorAllowed(part:PartId,color:ColorKey){const known=catalogPart(part)?.colors;return !known||known.includes(color);}
