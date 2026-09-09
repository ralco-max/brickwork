import {z} from "zod";
import {COLORS,PARTS,auditModel} from "./bridge";
import type {Piece} from "./bridge";
import {finishModel,intersects} from "./models";
import type {BuildModel,VoxelMap} from "./models";
import {validateScene,sceneVoxels,compileScene} from "./generated-scene";
import {simulateClutch} from "./clutch";
import type {GeneratedScene} from "./generated-scene";

export const briefSchema=z.object({idea:z.string().min(3).max(2000),size:z.enum(["small","medium","large"]),detail:z.enum(["balanced","detailed","signature"]),maxPieces:z.number().int().min(100).max(16000),maxWidth:z.number().int().min(16).max(80),maxDepth:z.number().int().min(16).max(80),maxHeight:z.number().int().min(16).max(160),features:z.array(z.string().min(1).max(160)).max(12),style:z.string().max(120),hollow:z.boolean(),finish:z.enum(["smooth","studded"]).optional()}).strict();
export type DesignBrief=z.infer<typeof briefSchema>;
export const defaultBrief=(idea=""):DesignBrief=>({idea,size:"medium",detail:"detailed",maxPieces:600,maxWidth:48,maxDepth:48,maxHeight:96,features:[],style:"Sculptural display with rich surface detail",hollow:false,finish:"smooth"});
export type Cuboid=Pick<Piece,"x"|"y"|"z"|"w"|"h"|"d">;
export type ManualEdits={erase:Cuboid[];bricks:Piece[]};
export type VisualReview={revision?:{status:"visible"|"missing"|"uncertain"|"not_requested";evidence:string};summary:string;recognizable:boolean;features:{feature:string;status:"visible"|"missing"|"uncertain";evidence:string}[];improvements:string[]};
export type DesignContext={brief:DesignBrief;manual:ManualEdits;locked:string[];revisions:{request:string;summary:string;at:string}[];review?:VisualReview;reviewStale?:boolean};
export type Quote={available:number;unitPrice:number;url:string;checkedAt:string};
export type ShoppingState={owned:Record<string,number>;elementIds:Record<string,string>;priceOverrides:Record<string,number>;quotes:Record<string,Quote>};
export const emptyShopping=():ShoppingState=>({owned:{},elementIds:{},priceOverrides:{},quotes:{}});
export const emptyManual=():ManualEdits=>({erase:[],bricks:[]});
const boxSchema=z.object({x:z.number().int().min(0).max(192),y:z.number().int().min(0).max(240),z:z.number().int().min(0).max(192),w:z.number().int().min(1).max(8),h:z.number().int().min(1).max(3),d:z.number().int().min(1).max(8)});
const manualBrick=boxSchema.extend({id:z.number().int(),part:z.string(),color:z.string(),rotated:z.boolean(),stage:z.number().int()}).refine(p=>Object.hasOwn(PARTS,p.part)&&Object.hasOwn(COLORS,p.color)&&p.x+p.w<=192&&p.y+p.h<=240&&p.z+p.d<=192).refine(p=>{const t=PARTS[p.part as keyof typeof PARTS];return !!t&&p.w===(p.rotated?t.d:t.w)&&p.d===(p.rotated?t.w:t.d)&&p.h===t.h;});
export const manualSchema=z.object({erase:z.array(boxSchema).max(32000),bricks:z.array(manualBrick).max(16000)});
const reviewSchema=z.object({revision:z.object({status:z.enum(["visible","missing","uncertain","not_requested"]),evidence:z.string().max(500)}).optional(),summary:z.string().max(1000),recognizable:z.boolean(),features:z.array(z.object({feature:z.string().max(160),status:z.enum(["visible","missing","uncertain"]),evidence:z.string().max(500)})).max(12),improvements:z.array(z.string().max(500)).max(8)});
export {reviewSchema};
const contextSchema=z.object({brief:briefSchema,manual:manualSchema,locked:z.array(z.string().max(80)).max(240),revisions:z.array(z.object({request:z.string().max(2000),summary:z.string().max(1000),at:z.string().max(40)})).max(50),review:reviewSchema.optional(),reviewStale:z.boolean().optional()});
const recordKey=z.string().regex(/^\d{4,5}b?:(red|orange|blue|navy|black|gray|white|green|tan|yellow|brown|pink)$/);
const shoppingSchema=z.object({owned:z.record(recordKey,z.number().int().min(0).max(16000)),elementIds:z.record(recordKey,z.string().regex(/^\d{0,8}$/)),priceOverrides:z.record(recordKey,z.number().finite().min(0).max(10000)),quotes:z.record(recordKey,z.object({available:z.number().int().min(0).max(100000),unitPrice:z.number().finite().min(0).max(10000),url:z.string().url().max(1000).refine(s=>/^https:\/\//.test(s)),checkedAt:z.string().datetime()}))});
const pieceKey=(p:Piece)=>`${p.part}:${p.color}:${p.x}:${p.y}:${p.z}:${p.rotated}`;
export function editModel(model:BuildModel,pieces:Piece[]):BuildModel{
 const meta={...model,recipe:undefined,bridgeConfig:undefined,source:"custom" as const};
 if(model.generation){const before=new Set(model.pieces.map(pieceKey)),after=new Set(pieces.map(pieceKey)),removed=model.pieces.filter(p=>!after.has(pieceKey(p))),added=pieces.filter(p=>!before.has(pieceKey(p)));
  const prior=model.design||{brief:defaultBrief(model.description||model.name),manual:emptyManual(),locked:[],revisions:[]};
  const erase=[...prior.manual.erase,...removed.map(({x,y,z,w,h,d})=>({x,y,z,w,h,d}))];
  const unique=[...new Map(erase.map(b=>[JSON.stringify(b),b])).values()];
  meta.design={...prior,manual:{erase:unique,bricks:[...prior.manual.bricks.filter(p=>!removed.some(b=>intersects(p,b))),...added]},reviewStale:true};
 }
 return finishModel(meta.generation&&meta.design?compileScene(meta.generation,{manual:meta.design.manual,hollow:meta.design.brief.hollow,smooth:meta.design.brief.finish==="smooth"}).pieces:pieces,meta);
}
export function applyManual(voxels:VoxelMap,manual:ManualEdits){
 for(const p of [...manual.erase,...manual.bricks])for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++)voxels.delete(`${x},${y},${z}`);
 return voxels;
}
export function projectJSON(model:BuildModel,shopping:ShoppingState){return JSON.stringify({format:"brickwork",version:3,name:model.name,description:model.description,pieces:model.pieces,generation:model.generation,design:model.design,shopping},null,2);}
export function readProjectMetadata(data:Record<string,unknown>,pieces:Piece[]):Partial<BuildModel>{
 if(data.version!==3)return {};
 if(data.format!=="brickwork")throw Error("This is not a Brickwork project.");
 const generation=data.generation?validateScene(data.generation):undefined;
 const parsed=data.design?contextSchema.safeParse(data.design):null;
 if(parsed&&!parsed.success)throw Error("The project's design history or protected edits are invalid.");
 const design=parsed?.success?parsed.data as DesignContext:undefined;
 const shop=data.shopping?shoppingSchema.safeParse(data.shopping):null;if(shop&&!shop.success)throw Error("The project's shopping data is invalid.");
 if(design&&!generation)throw Error("The project is missing its generation scene.");
 if(generation){const rebuilt=compileScene(generation,{manual:design?.manual,hollow:design?.brief.hollow,smooth:design?.brief.finish==="smooth"});const expected=[...pieces].map(pieceKey).sort(),actual=rebuilt.pieces.map(pieceKey).sort();if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error("The scene and protected edits do not match the saved bricks. Restore a complete project export.");}
 return {generation,design,detail:design?.brief.size,shopping:shop?.success?shop.data:emptyShopping()};
}
export function designChecks(model:BuildModel,brief:DesignBrief){
 const audit=auditModel(model.pieces),issues:string[]=[];
 if(audit.overlaps)issues.push(`${audit.overlaps} overlapping volume cells.`);
 if(audit.ungrounded.length)issues.push(`${audit.ungrounded.length} pieces have no stud path to the ground.`);
 if(audit.groups>1)issues.push(`${audit.groups} separate assemblies. Connect them with overlapping studded plates.`);
 if(audit.unsupported.length)issues.push(`${audit.unsupported.length} pieces cannot be placed with support in a bottom-up sequence.`);
 const clutch=simulateClutch(model.pieces);
 if(clutch.overloaded.length)issues.push(`${clutch.overloaded.length} joints exceed the estimated clutch strength of their studs (hanging or cantilevered mass). Support them from below or widen their stud contact.`);
 if(model.pieces.length>brief.maxPieces)issues.push(`${model.pieces.length} pieces exceeds the ${brief.maxPieces} piece limit.`);
 if(model.length>brief.maxWidth||model.width>brief.maxDepth||model.height>brief.maxHeight)issues.push(`Occupied dimensions ${model.length} × ${model.width} × ${model.height} exceed the ${brief.maxWidth} × ${brief.maxDepth} × ${brief.maxHeight} stud/plate limits.`);
 const bad=new Set([...audit.disconnected,...audit.unsupported,...clutch.overloaded]);const locations=model.pieces.filter(p=>bad.has(p.id)).slice(0,12).map(p=>`piece ${p.id}: (${p.x},${p.y},${p.z}), size ${p.w}×${p.h}×${p.d}${clutch.ratios.has(p.id)?`, clutch load ${Math.round(clutch.ratios.get(p.id)!*100)}%`:""}`);
 return {audit,clutch,issues,locations,pass:issues.length===0};
}
export function sceneDiff(before:GeneratedScene|undefined,after:GeneratedScene){
 if(!before)return {added:after.shapes.length,changed:0,removed:0};const prev=new Map(before.shapes.map(s=>[s.id||s.label,JSON.stringify(s)])),next=new Map(after.shapes.map(s=>[s.id||s.label,JSON.stringify(s)]));
 return {added:[...next.keys()].filter(k=>!prev.has(k)).length,changed:[...next].filter(([k,v])=>prev.has(k)&&prev.get(k)!==v).length,removed:[...prev.keys()].filter(k=>!next.has(k)).length};
}
export function enforceLocks(previous:GeneratedScene,next:GeneratedScene,locked:string[],options:{manual?:ManualEdits;hollow?:boolean;smooth?:boolean}={}){
 if(!locked.length)return;
 previous=validateScene(previous);next=validateScene(next);
 if(JSON.stringify(previous.dimensions)!==JSON.stringify(next.dimensions))throw Error("Locked components require the same build area. Keep the original dimensions or unlock them.");
 const protectedShapes=previous.shapes.filter(s=>locked.includes(s.component||s.label));
 const protectedIds=new Set(protectedShapes.map(s=>s.id||s.label));
 const nextProtected=next.shapes.filter(s=>protectedIds.has(s.id||s.label)||locked.includes(s.component||s.label));
 if(JSON.stringify(protectedShapes)!==JSON.stringify(nextProtected))throw Error("A revision changed a locked component. Its previous design has been kept.");
 const cells=(model:BuildModel)=>{const map:VoxelMap=new Map();for(const p of model.pieces)for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++)map.set(`${x},${y},${z}`,p.color);return map;};
 const before=options.hollow?cells(compileScene(previous,options)):sceneVoxels(previous),after=options.hollow?cells(compileScene(next,options)):sceneVoxels(next);
 // Include carved space as well as occupied cells in each protected component's mask.
 const mask=sceneVoxels({...previous,shapes:protectedShapes.map(s=>({...s,operation:"add" as const}))});
 for(const cell of mask.keys())if(before.get(cell)!==after.get(cell))throw Error("A change overlaps a locked component. Unlock that component to reshape this area.");
}
