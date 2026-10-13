import {z} from "zod";
import {revisionRegionSchema} from "./revision-region";
import type {RevisionRegion} from "./revision-region";
import {SIGN_TEXT_PATTERN,SIGN_TEXT_HELP,normalizedSignText,signPixels} from "./brick-lettering";
import {referenceSheetSchema} from "./design-research";
import {referencePhotoSchema,referencePhotosSchema,collectReferencePhotos,MAX_REFERENCE_PHOTOS} from "./reference-photos";
import type {ReferenceSheet} from "./design-research";
import {COLORS,PARTS,auditModel} from "./bridge";
import type {Piece} from "./bridge";
import {finishModel,intersects} from "./models";
import type {BuildModel,VoxelMap} from "./models";
import {validateScene,sceneVoxels,compileScene,looseByComponent,expandShapes,splitCaption,CAPTION_MAX,sceneSchema} from "./generated-scene";
import {clipSentence} from "./utils";
import {simulateClutch} from "./clutch";
import {catalogPart} from "./part-catalog";
import {forEachPieceCell,pieceCellOffsets,partDimensions} from "./part-spatial";
import type {GeneratedScene} from "./generated-scene";

export const briefSchema=z.object({idea:z.string().min(3).max(2000),size:z.enum(["small","medium","large"]),detail:z.enum(["balanced","detailed","signature"]),maxPieces:z.number().int().min(100).max(16000),maxWidth:z.number().int().min(16).max(80),maxDepth:z.number().int().min(16).max(80),maxHeight:z.number().int().min(16).max(160),features:z.array(z.string().min(1).max(160)).max(12),style:z.string().max(120),scope:z.enum(["subject","site"]).optional(),composition:z.string().max(600).optional(),signText:z.string().max(12,SIGN_TEXT_HELP).regex(SIGN_TEXT_PATTERN,SIGN_TEXT_HELP).optional(),hollow:z.boolean(),finish:z.enum(["smooth","studded"]).optional(),quality:z.enum(["standard","better","best","sol_low","sol_medium"]).optional(),autoRepair:z.boolean().optional()}).strict();
export type DesignBrief=z.infer<typeof briefSchema>;
export const defaultBrief=(idea=""):DesignBrief=>({idea,size:"medium",detail:"detailed",maxPieces:600,maxWidth:48,maxDepth:48,maxHeight:96,features:[],style:"Recognizable proportions and purposeful detail",scope:"subject",composition:"",hollow:false,finish:"smooth",quality:"sol_low"});
export type Cuboid=Pick<Piece,"x"|"y"|"z"|"w"|"h"|"d">&{cells?:[number,number,number][]};
export type ManualEdits={erase:Cuboid[];bricks:Piece[]};
export type FeatureStatus="visible"|"missing"|"uncertain";
// The rubric is what the research and the designer say defines the subject, checked beside (never merged into) the brief's features.
export type RubricKind="distinctive"|"silhouette"|"signature";
// scope "targeted": a change checked in three views without the reference; its layout verdict is the last full review's.
export type VisualReview={composition?:{status:"matches"|"mismatch"|"uncertain"|"not_applicable";evidence:string};revision?:{status:"visible"|"missing"|"uncertain"|"not_requested";evidence:string};summary:string;recognizable:boolean;criticalMismatch?:boolean;features:{feature:string;status:FeatureStatus;evidence:string}[];rubric?:{feature:string;kind:RubricKind;status:FeatureStatus;evidence:string}[];improvements:string[];thinking?:string;scope?:"targeted"};
export type DesignReference={sheet?:ReferenceSheet;photo?:string;photos?:string[];identityHint?:string;briefKey:string};
export const referenceKey=(b:DesignBrief)=>JSON.stringify([b.idea.trim(),b.scope||"subject",b.composition||"",b.features]);
// A revision's summary is the caption the owner sees; builder is what the designer is told (the review's verdict and its private notes).
// checked: whether the repaired candidate was re-reviewed; one the local checks already rejected is not.
export type AutoRepairRecord={at:string;reasons:string[];kept:boolean;fixed:number;cost:number;checked?:boolean};
// A kept version for $0 undo: what recompiles to the same bricks (scene, protected edits, locks, brief) plus its review.
// n counts up for the design's life; only the last MAX_VERSIONS are kept. opened: the design as it was first opened, from
// before versions were kept, so its scene notes may be a migrated caption rather than the builder's own.
export type DesignVersion={n:number;at:string;label:string;scene:GeneratedScene;manual:ManualEdits;locked:string[];brief:DesignBrief;review?:VisualReview;pieces:number;opened?:boolean};
export const MAX_VERSIONS=10;
export type DesignContext={unfinished?:boolean;reviewRequest?:string;reviewRegion?:RevisionRegion;reference?:DesignReference;brief:DesignBrief;manual:ManualEdits;locked:string[];revisions:{request:string;summary:string;at:string;builder?:string}[];review?:VisualReview;reviewStale?:boolean;autoRepairs?:AutoRepairRecord[];versions?:DesignVersion[]};
export type Quote={available:number;unitPrice:number;url:string;checkedAt:string};
export type ShoppingState={owned:Record<string,number>;elementIds:Record<string,string>;priceOverrides:Record<string,number>;quotes:Record<string,Quote>};
export const emptyShopping=():ShoppingState=>({owned:{},elementIds:{},priceOverrides:{},quotes:{}});
export const emptyManual=():ManualEdits=>({erase:[],bricks:[]});
const boxSchema=z.object({x:z.number().int().min(0).max(192),y:z.number().int().min(0).max(240),z:z.number().int().min(0).max(192),w:z.number().int().min(1).max(32),h:z.number().int().min(1).max(48),d:z.number().int().min(1).max(32)});
const manualBrick=boxSchema.extend({id:z.number().int(),part:z.string(),color:z.string(),rotated:z.boolean(),stage:z.number().int(),face:z.enum(["px","nx","pz","nz"]).optional(),support:z.boolean().optional(),legs:z.string().optional(),skin:z.string().optional()}).refine(p=>Object.hasOwn(PARTS,p.part)&&Object.hasOwn(COLORS,p.color)&&[p.legs,p.skin].every(c=>c===undefined||p.part==="minifig"&&Object.hasOwn(COLORS,c))&&p.x+p.w<=192&&p.y+p.h<=240&&p.z+p.d<=192).refine(p=>{if(!Object.hasOwn(PARTS,p.part))return false;const t=partDimensions(p.part,p.rotated,p.face),c=catalogPart(p.part);return p.w===t.w&&p.d===t.d&&p.h===t.h&&p.rotated===t.rotated&&(!c||c.colors.includes(p.color as Piece["color"]));});
const eraseSchema=boxSchema.extend({cells:z.array(z.tuple([z.number().int().min(0),z.number().int().min(0),z.number().int().min(0)])).min(1).max(8192).optional()}).refine(p=>!p.cells||p.cells.every(([x,y,z])=>x<p.w&&y<p.h&&z<p.d));
export const manualSchema=z.object({erase:z.array(eraseSchema).max(32000),bricks:z.array(manualBrick).max(16000)});
// The judge sometimes writes long; long text is trimmed at a sentence or word, never a reason to lose the review.
// Imported and shared files reach this too, so the input is bounded before any sentence work.
const clip=(n:number)=>z.string().transform(v=>v.length<=n?v:clipSentence(v.slice(0,n*4),n));
const featureStatus=z.enum(["visible","missing","uncertain"]);
const reviewSchema=z.object({composition:z.object({status:z.enum(["matches","mismatch","uncertain","not_applicable"]),evidence:clip(1000)}).optional(),revision:z.object({status:z.enum(["visible","missing","uncertain","not_requested"]),evidence:clip(500)}).optional(),summary:clip(1500),recognizable:z.boolean(),criticalMismatch:z.boolean().optional(),features:z.array(z.object({feature:z.string().max(160),status:featureStatus,evidence:clip(500)})).max(12),rubric:z.array(z.object({feature:clip(80),kind:z.enum(["distinctive","silhouette","signature"]),status:featureStatus,evidence:clip(500)})).max(12).optional(),improvements:z.array(clip(500)).max(8),thinking:clip(4000).optional(),scope:z.literal("targeted").optional()});
export {reviewSchema};
export const contextSchema=z.object({unfinished:z.boolean().optional(),reviewRequest:z.string().max(2000).optional(),reviewRegion:revisionRegionSchema.optional(),reference:z.object({sheet:referenceSheetSchema.optional(),photo:referencePhotoSchema.optional(),photos:referencePhotosSchema.optional(),identityHint:z.string().max(300).optional(),briefKey:z.string().max(5000)}).refine(r=>collectReferencePhotos(r.photo,r.photos).length<=MAX_REFERENCE_PHOTOS,"Use at most four reference photos.").optional(),brief:briefSchema,manual:manualSchema,locked:z.array(z.string().max(80)).max(240),revisions:z.array(z.object({request:z.string().max(2000),summary:z.string().max(1000),at:z.string().max(40),builder:z.string().max(1000).optional()})).max(50),review:reviewSchema.optional(),reviewStale:z.boolean().optional(),autoRepairs:z.array(z.object({at:z.string().max(40),reasons:z.array(z.string().max(300)).max(8),kept:z.boolean(),fixed:z.number().int().min(0).max(100),cost:z.number().finite().min(0).max(100),checked:z.boolean().optional()})).max(20).optional(),versions:z.array(z.object({n:z.number().int().min(1).max(1e6),at:z.string().max(40),label:z.string().max(300),scene:z.lazy(()=>sceneSchema),manual:manualSchema,locked:z.array(z.string().max(80)).max(240),brief:briefSchema,review:reviewSchema.optional(),pieces:z.number().int().min(0).max(16000),opened:z.boolean().optional()})).max(MAX_VERSIONS).optional()});
const recordKey=z.string().max(40).refine(key=>{const [part,color,...extra]=key.split(":");return !extra.length&&Object.hasOwn(PARTS,part)&&Object.hasOwn(COLORS,color);});
const shoppingSchema=z.object({owned:z.record(recordKey,z.number().int().min(0).max(16000)),elementIds:z.record(recordKey,z.string().regex(/^\d{0,8}$/)),priceOverrides:z.record(recordKey,z.number().finite().min(0).max(10000)),quotes:z.record(recordKey,z.object({available:z.number().int().min(0).max(100000),unitPrice:z.number().finite().min(0).max(10000),url:z.string().url().max(1000).refine(s=>/^https:\/\//.test(s)),checkedAt:z.string().datetime()}))});
const pieceKey=(p:Piece)=>`${p.part}:${p.color}:${p.x}:${p.y}:${p.z}:${p.rotated}:${p.face||(p.rotated?"px":"pz")}${p.legs||p.skin?`:${p.legs||""}:${p.skin||""}`:""}`;
export function editModel(model:BuildModel,pieces:Piece[]):BuildModel{
 const meta={...model,recipe:undefined,bridgeConfig:undefined,source:"custom" as const,edited:true};
 if(model.generation){const before=new Set(model.pieces.map(pieceKey)),after=new Set(pieces.map(pieceKey)),removed=model.pieces.filter(p=>!after.has(pieceKey(p))),added=pieces.filter(p=>!before.has(pieceKey(p)));
  const prior=model.design||{brief:defaultBrief(model.description||model.name),manual:emptyManual(),locked:[],revisions:[]};
  const erase=[...prior.manual.erase,...removed.map(p=>({x:p.x,y:p.y,z:p.z,w:p.w,h:p.h,d:p.d,...(catalogPart(p.part)?{cells:pieceCellOffsets(p).map(c=>[...c] as [number,number,number])}:{})}))];
  const unique=[...new Map(erase.map(b=>[JSON.stringify(b),b])).values()];
  meta.design={...prior,manual:{erase:unique,bricks:[...prior.manual.bricks.filter(p=>!removed.some(b=>intersects(p,b))),...added]},reviewStale:true};
 }
 return finishModel(meta.generation&&meta.design?compileScene(meta.generation,{manual:meta.design.manual,hollow:meta.design.brief.hollow,smooth:meta.design.brief.finish==="smooth"}).pieces:pieces,meta);
}
export function applyManual(voxels:VoxelMap,manual:ManualEdits){
 for(const p of manual.erase){if(p.cells){for(const [x,y,z] of p.cells)voxels.delete(`${p.x+x},${p.y+y},${p.z+z}`);}else for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++)voxels.delete(`${x},${y},${z}`);}
 for(const p of manual.bricks)forEachPieceCell(p,(x,y,z)=>voxels.delete(`${x},${y},${z}`));
 return voxels;
}
// Saves from before the caption/notes split carry up to 500 chars of builder caveats in the
// description, often cut mid-word. On load the leading whole sentences stay the caption, the rest
// become private scene notes (never shown), and history entries that repeated the old text show
// the caption. Idempotent, so every load path can apply it.
export function migrateCaption<M extends Pick<BuildModel,"description"|"generation"|"design">>(model:M):M{
 const scene=model.generation,legacy=scene&&!scene.notes?.length&&scene.description.length>CAPTION_MAX?scene.description:undefined;
 if(!legacy&&model.description.length<=CAPTION_MAX)return model;
 const caption=(text:string)=>text.length>CAPTION_MAX?splitCaption(text).description:text,split=legacy===undefined?undefined:splitCaption(legacy);
 const settle=(s:string)=>s===legacy||s.length>CAPTION_MAX&&!/[.!?…]["'”’)\]]*$/.test(s)?splitCaption(s).description:s;
 return {...model,description:caption(model.description),
  ...(scene&&split?{generation:{...scene,description:split.description,...(split.notes.length?{notes:split.notes}:{})}}:{}),
  ...(split&&model.design?{design:{...model.design,revisions:model.design.revisions.map(r=>({...r,summary:settle(r.summary)}))}}:{})};
}
// "Your edition": AI-made, converted from the user's own file, or changed by hand. Source does not
// survive a save (every reopened project is "custom"), so the project file carries the mark instead;
// an untouched preset never has it, even after it is saved, featured or shared.
export const isYourEdition=(m:Pick<BuildModel,"generation"|"source"|"edited">)=>Boolean(m.generation||m.edited)||m.source==="mosaic"||m.source==="mesh";
export function projectJSON(model:BuildModel,shopping:ShoppingState){return JSON.stringify({format:"brickwork",version:3,name:model.name,description:model.description,edited:isYourEdition(model)||undefined,pieces:model.pieces,generation:model.generation,design:model.design,shopping},null,2);}
// The mark is read for every version: a design reopened as its bricks alone is still the user's.
export function readProjectMetadata(data:Record<string,unknown>,pieces:Piece[]):Partial<BuildModel>{return {...(data.edited===true?{edited:true}:{}),...readProjectContent(data,pieces)};}
function readProjectContent(data:Record<string,unknown>,pieces:Piece[]):Partial<BuildModel>{
 if(data.version!==3)return {};
 if(data.format!=="brickwork")throw Error("This is not a Bricks project.");
 const generation=data.generation?validateScene(data.generation):undefined;
 const parsed=data.design?contextSchema.safeParse(data.design):null;
 if(parsed&&!parsed.success)throw Error("The project's design history or protected edits are invalid.");
 const design=parsed?.success?parsed.data as DesignContext:undefined;
 const shop=data.shopping?shoppingSchema.safeParse(data.shopping):null;if(shop&&!shop.success)throw Error("The project's shopping data is invalid.");
 if(design&&!generation)throw Error("The project is missing its generation scene.");
 // Exports and share links packed before the display base was kept out of slope carving verify against that packing.
 if(generation){const packed=(carveBase:boolean)=>JSON.stringify(compileScene(generation,{manual:design?.manual,hollow:design?.brief.hollow,smooth:design?.brief.finish==="smooth",carveBase}).pieces.map(pieceKey).sort()),expected=JSON.stringify([...pieces].map(pieceKey).sort());if(expected!==packed(false)&&expected!==packed(true))throw Error("The scene and protected edits do not match the saved bricks. Restore a complete project export.");}
 return {generation,design,detail:design?.brief.size,shopping:shop?.success?shop.data:emptyShopping()};
}
// The body above the base against the planned target at one scale. A declared vertical exaggeration accepts any
// height from true to exaggerated. A faithful section (scaleConflict fit "section") keeps its full height, which sets
// the scale, and may show less of the footprint (section, cutaway or partial length), so only an over-long axis counts.
// error is the worst axis's relative miss; the check fails past 25% (or 1 stud / 3 plates on tiny models).
export type ProportionTarget={x:number;y:number;z:number;vertical?:number};
export function proportionCheck(model:Pick<BuildModel,"pieces">,target:ProportionTarget,conflict?:{fit:"section"|"whole"}){
 const body=model.pieces.filter(p=>p.y>=2);if(!body.length)return null;
 const extent=(axis:"x"|"y"|"z",size:"w"|"h"|"d")=>Math.max(...body.map(p=>p[axis]+p[size]))-Math.min(...body.map(p=>p[axis]));
 const actual=[extent("x","w"),extent("y","h"),extent("z","d")],section=conflict?.fit==="section",v=Math.max(1,target.vertical||1);
 let wanted=[target.x,target.y,target.z],scale:number;
 if(section)scale=actual[1]/wanted[1];
 else{
  if(v>1){const xz=Math.sqrt(actual[0]/wanted[0]*(actual[2]/wanted[2]));wanted=[wanted[0],Math.min(wanted[1],Math.max(wanted[1]/v,actual[1]/xz)),wanted[2]];}
  scale=actual.map((a,i)=>a/wanted[i]).sort((a,b)=>a-b)[1];
 }
 const miss=actual.map((a,i)=>section&&i!==1?Math.max(0,a-wanted[i]*scale):Math.abs(a-wanted[i]*scale));
 return {actual,wanted,scale,section,error:Math.max(...miss.map((m,i)=>m/(wanted[i]*scale||1))),pass:!miss.some((m,i)=>m>Math.max(i===1?3:1,wanted[i]*scale*.25))};
}
export function designChecks(model:BuildModel,brief:DesignBrief,target?:ProportionTarget,conflict?:{fit:"section"|"whole"}){
 const audit=auditModel(model.pieces),issues:string[]=[];let loose:{component:string;pieces:number}[]=[];
 if(brief.signText!==undefined&&!brief.signText.trim()&&model.generation?.shapes.some(s=>s.kind==="text"))issues.push("Remove the existing sign lettering: the exact sign field has been cleared.");
 if(brief.signText?.trim()){try{
  const wanted=normalizedSignText(brief.signText),signs=model.generation?expandShapes(model.generation.shapes).filter(s=>s.kind==="text"&&s.text&&normalizedSignText(s.text)===wanted):[];
  if(!signs.length)issues.push(`The exact sign “${wanted}” is missing. Add a text shape with this spelling; do not approximate letters with separate boxes.`);
  else{
   const occupied:VoxelMap=new Map();for(const p of model.pieces)forEachPieceCell(p,(x,y,z)=>occupied.set(`${x},${y},${z}`,p.color));
   for(const sign of signs){
    const pixels=signPixels(sign.text!,sign.size,sign.face!).map(p=>({x:p.x+sign.position.x,y:p.y+sign.position.y,z:p.z+sign.position.z}));
    const glyph=new Set(pixels.map(p=>`${p.x},${p.y},${p.z}`)),axis=sign.face==="px"||sign.face==="nx"?"x":"z",step=sign.face==="px"||sign.face==="pz"?1:-1,limit=model.generation!.dimensions[axis];
    let altered=false;
    const width=axis==="x"?sign.size.z:sign.size.x;
    for(let u=0;u<width;u++)for(let y=0;y<sign.size.y;y++){
     const x=sign.position.x+(axis==="x"?(step===1?sign.size.x-1:0):u),z=sign.position.z+(axis==="z"?(step===1?sign.size.z-1:0):u),key=`${x},${sign.position.y+y},${z}`;
     if(occupied.get(key)!==(glyph.has(key)?sign.color:sign.background))altered=true;
    }
    if(altered){issues.push(`The sign “${wanted}” has missing or altered letter pixels. Restore its lettering or remove conflicting manual edits.`);continue;}
    if(pixels.some(p=>{for(let at=p[axis]+step;at>=0&&at<limit;at+=step){const q={...p,[axis]:at};if(occupied.has(`${q.x},${q.y},${q.z}`))return true;}return false;}))issues.push(`The sign “${wanted}” is obscured. Put its lettered face on the outside of the building.`);
   }
  }
 }catch(error){issues.push(error instanceof Error?error.message:"The sign text is invalid.");}}
 if(audit.overlaps)issues.push(`${audit.overlaps} overlapping volume cells.`);
 if(audit.ungrounded.length){const by=loose=model.generation?looseByComponent(model.generation,audit.ungrounded,model):[];issues.push(`${audit.ungrounded.length} pieces have no stud path to the ground${by.length?`: ${by.slice(0,6).map(r=>`${r.component} ${r.pieces}`).join(", ")}. Root each of those components into a mass by extending its shapes at least one cell into the mass or onto a studded surface`:""}.`);}
 if(audit.groups>1)issues.push(`${audit.groups} separate assemblies. Connect them with overlapping studded plates.`);
 if(audit.unsupported.length)issues.push(`${audit.unsupported.length} pieces cannot be placed with support in a bottom-up sequence.`);
 const clutch=simulateClutch(model.pieces);
 const proportion=target?proportionCheck(model,target,conflict):null;
 if(proportion&&!proportion.pass){const [x,y,z]=proportion.actual;issues.push(proportion.section?`The faithful section's proportions differ from the plan: above the base it measures ${x} × ${z} studs and ${y} plates. Keep its cross-section at the planned ${target!.z} studs deep and ${target!.y} plates tall, and show no more than ${target!.x} studs of length.`:`Subject proportions differ from the reference: above the base it measures ${x} × ${z} studs and ${y} plates. Preserve the reference ratio ${target!.x} × ${target!.z} × ${target!.y}${(target!.vertical||1)>1?` (heights may be exaggerated up to ${target!.vertical}×)`:""}; resize uniformly rather than stretching one axis.`);}
 if(clutch.overloaded.length)issues.push(`${clutch.overloaded.length} joints exceed the estimated clutch strength of their studs (hanging or cantilevered mass). Support them from below or widen their stud contact.`);
 if(model.pieces.length>brief.maxPieces)issues.push(`${model.pieces.length} pieces exceeds the ${brief.maxPieces} piece limit.`);
 if(model.length>brief.maxWidth||model.width>brief.maxDepth||model.height>brief.maxHeight)issues.push(`Occupied dimensions ${model.length} × ${model.width} × ${model.height} exceed the ${brief.maxWidth} × ${brief.maxDepth} × ${brief.maxHeight} stud/plate limits.`);
 const bad=new Set([...audit.disconnected,...audit.unsupported,...clutch.overloaded]);const locations=model.pieces.filter(p=>bad.has(p.id)).slice(0,12).map(p=>`piece ${p.id}: (${p.x},${p.y},${p.z}), size ${p.w}×${p.h}×${p.d}${clutch.ratios.has(p.id)?`, clutch load ${Math.round(clutch.ratios.get(p.id)!*100)}%`:""}`);
 return {audit,clutch,issues,locations,loose,proportion,pass:issues.length===0};
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
 const cells=(model:BuildModel)=>{const map:VoxelMap=new Map();for(const p of model.pieces)forEachPieceCell(p,(x,y,z)=>map.set(`${x},${y},${z}`,p.color));return map;};
 const before=options.hollow?cells(compileScene(previous,options)):sceneVoxels(previous),after=options.hollow?cells(compileScene(next,options)):sceneVoxels(next);
 // Include carved space as well as occupied cells in each protected component's mask.
 const mask=sceneVoxels({...previous,shapes:protectedShapes.map(s=>({...s,operation:"add" as const}))});
 for(const cell of mask.keys())if(before.get(cell)!==after.get(cell))throw Error("A change overlaps a locked component. Unlock that component to reshape this area.");
}
