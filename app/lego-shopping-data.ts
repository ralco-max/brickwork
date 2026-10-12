import type {InventoryRow} from "@/lib/bridge";
import {resolveLegoElement} from "@/lib/lego-elements";

type Resolver=typeof resolveLegoElement;
export type LegoShoppingRow=InventoryRow&{needed:number;elementId?:string;match:"catalog"|"manual"|"missing"|"assembly";catalog:ReturnType<Resolver>};
export function prepareLegoShopping(inventory:InventoryRow[],owned:Record<string,number>,overrides:Record<string,string>,resolve:Resolver=resolveLegoElement){
 const rows:LegoShoppingRow[]=inventory.flatMap(row=>{
  const ownedQuantity=Number.isFinite(owned[row.key])?Math.max(0,Math.floor(owned[row.key])):0,needed=Math.max(0,row.quantity-ownedQuantity);
  if(!needed)return [];
  const catalog=resolve(row.part,row.color),manual=overrides[row.key]?.trim(),candidate=manual&&/^\d{6,8}$/.test(manual)?manual:catalog.status==="matched"?catalog.elementId:undefined,elementId=candidate&&/^\d{6,8}$/.test(candidate)?candidate:undefined;
  const match:LegoShoppingRow["match"]=elementId?(elementId===manual?"manual":"catalog"):catalog.status==="assembly"?"assembly":"missing";
  return [{...row,needed,elementId,match,catalog}];
 });
 const matched=rows.filter(row=>!!row.elementId),unmatched=rows.filter(row=>!row.elementId);
 return {rows,matched,unmatched,catalogCount:matched.filter(r=>r.match==="catalog").length,manualCount:matched.filter(r=>r.match==="manual").length,pieceCount:rows.reduce((sum,row)=>sum+row.needed,0)};
}
export const MAX_LEGO_UPLOAD_TYPES=400;
type UploadRow=Pick<LegoShoppingRow,"elementId"|"needed">;
function uploadEntries(rows:UploadRow[]){
 const quantities=new Map<string,number>();
 for(const row of rows)if(row.elementId&&/^\d{6,8}$/.test(row.elementId)&&Number.isInteger(row.needed)&&row.needed>0)quantities.set(row.elementId,(quantities.get(row.elementId)||0)+row.needed);
 return [...quantities];
}
const entriesCSV=(entries:[string,number][])=>["elementId,quantity",...entries.map(([elementId,quantity])=>`${elementId},${quantity}`)].join("\r\n");
export function legoUploadCSV(rows:UploadRow[]){return entriesCSV(uploadEntries(rows));}
export function legoUploadBatches(rows:UploadRow[]){
 const entries=uploadEntries(rows),batches:{csv:string;types:number;pieces:number}[]=[];
 for(let start=0;start<entries.length;start+=MAX_LEGO_UPLOAD_TYPES){const batch=entries.slice(start,start+MAX_LEGO_UPLOAD_TYPES);batches.push({csv:entriesCSV(batch),types:batch.length,pieces:batch.reduce((sum,[,quantity])=>sum+quantity,0)});}
 return batches;
}
