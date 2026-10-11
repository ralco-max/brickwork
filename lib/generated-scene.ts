import {z} from "zod";
import {SIGN_FACES,signPixels,LetteringError} from "./brick-lettering";
import {COLORS,PARTS} from "./bridge";
import {catalogPart} from "./part-catalog";
import {partDimensions,pieceCells,bottomConnectorOffsets,topConnectorOffsets,piecesIntersect} from "./part-spatial";
import {GenerationError} from "./generation-errors";
import {finishModel,packVoxels,voxelKey,smoothTops} from "./models";
import {carveSlopes} from "./slopes";
import {WHEELS} from "./bridge";
import type {Piece} from "./bridge";
import type {ColorKey} from "./bridge";
import type {BuildModel,VoxelMap} from "./models";
import {applyManual} from "./design-project";
import type {ManualEdits} from "./design-project";

const colors=Object.keys(COLORS) as [ColorKey,...ColorKey[]];
const vector=z.object({x:z.number().finite().min(0).max(80),y:z.number().finite().min(0).max(160),z:z.number().finite().min(0).max(80)}).strict();
const repeatSchema=z.object({count:z.number().int().min(1).max(32),offset:vector}).strict();
export const shapeSchema=z.object({
 id:z.string().min(1).max(80).optional(),component:z.string().min(1).max(80).optional(),repeat:repeatSchema.optional(),
 label:z.string().min(1).max(80),kind:z.enum(["box","ellipsoid","cylinder","cone","beam","lean","wheel","text","part"]),operation:z.enum(["add","subtract"]),axis:z.enum(["x","y","z"]).optional(),
 color:z.enum(colors),position:vector,size:vector,end:vector,radius:z.number().finite().min(.5).max(12),
 part:z.string().min(1).max(32).nullable().optional(),text:z.string().min(1).max(12).nullable().optional(),face:z.enum(SIGN_FACES).nullable().optional(),background:z.enum(colors).nullable().optional(),
}).strict();
export const sceneSchema=z.object({
 catalogVersion:z.literal(1).optional(),name:z.string().min(1).max(80),description:z.string().max(500),signature:z.array(z.string().min(1).max(80)).max(4).optional(),
 dimensions:z.object({x:z.number().int().min(8).max(80),y:z.number().int().min(8).max(160),z:z.number().int().min(8).max(80)}).strict(),
 shapes:z.array(shapeSchema).min(1).max(240),
}).strict();
export type Shape=z.infer<typeof shapeSchema>;
export type GeneratedScene=z.infer<typeof sceneSchema>;
export type SceneHeader=Omit<GeneratedScene,"shapes">;
const vecJSON={type:"object",properties:{x:{type:"number",minimum:0,maximum:80},y:{type:"number",minimum:0,maximum:160},z:{type:"number",minimum:0,maximum:80}},required:["x","y","z"],additionalProperties:false};
const shortText={type:"string",minLength:1,maxLength:80};
const dimensionJSON={type:"object",properties:{x:{type:"integer",minimum:8,maximum:80},y:{type:"integer",minimum:8,maximum:160},z:{type:"integer",minimum:8,maximum:80}},required:["x","y","z"],additionalProperties:false};
export const sceneJSONSchema={type:"object",properties:{
 catalogVersion:{type:"integer",enum:[1]},name:shortText,description:{type:"string",maxLength:500},dimensions:dimensionJSON,
 shapes:{type:"array",minItems:1,maxItems:240,items:{type:"object",properties:{id:shortText,component:shortText,label:shortText,kind:{type:"string",enum:["box","ellipsoid","cylinder","cone","beam","lean","wheel","text","part"]},operation:{type:"string",enum:["add","subtract"]},axis:{type:"string",enum:["x","y","z"]},color:{type:"string",enum:colors},part:{type:["string","null"],maxLength:32},text:{type:["string","null"],maxLength:12},face:{type:["string","null"],enum:[...SIGN_FACES,null]},background:{type:["string","null"],enum:[...colors,null]},position:vecJSON,size:vecJSON,end:vecJSON,radius:{type:"number",minimum:.5,maximum:12},repeat:{type:"object",properties:{count:{type:"integer",minimum:1,maximum:32},offset:vecJSON},required:["count","offset"],additionalProperties:false}},required:["id","component","label","kind","operation","axis","color","position","size","end","radius","repeat","text","face","background","part"],additionalProperties:false}},
},required:["catalogVersion","name","description","dimensions","shapes"],additionalProperties:false};

// A leaning member: stepped brick courses from p (bottom centre) to e (top centre), each course a box
// size.x studs wide across the lean, size.y plates tall, long enough along the lean to overlap the
// course below by at least a stud. Its bounding box is the two endpoints padded by its width.
function leanCourses(s:Shape){
 const w=Math.max(1,Math.round(s.size.x)),ch=s.size.y>=3?3:1,y0=Math.min(s.position.y,s.end.y),y1=Math.max(s.position.y,s.end.y);
 const bottom=s.position.y<=s.end.y?s.position:s.end,top=s.position.y<=s.end.y?s.end:s.position;
 const dx=top.x-bottom.x,dz=top.z-bottom.z,run=Math.hypot(dx,dz),ux=run?dx/run:1,uz=run?dz/run:0;
 const height=Math.max(ch,Math.round(y1)-Math.round(y0)),courses=Math.max(1,Math.ceil(height/ch)),runPer=run/courses,diagonal=Math.abs(ux)>.05&&Math.abs(uz)>.05;
 const len=Math.max(diagonal?3:2,Math.ceil(runPer)+(diagonal?2:1));
 const out:{cx:number;cz:number;y:number;h:number;len:number;w:number;ux:number;uz:number}[]=[];
 for(let k=0;k<courses;k++){const t=(k+.5)/courses;out.push({cx:bottom.x+dx*t,cz:bottom.z+dz*t,y:Math.round(y0)+k*ch,h:ch,len,w,ux,uz});}
 return out;
}
// A wheel shape becomes one real wheel element: the catalog wheel nearest the requested diameter,
// centred on the shape's position, its axle along the shape's axis (z unless x is given).
export function wheelPiece(s:Shape):Piece{
 const want=Math.max(1,s.size.x||3),part=(Object.keys(WHEELS) as (keyof typeof WHEELS)[]).reduce((best,id)=>Math.abs(WHEELS[id].diameter-want)<Math.abs(WHEELS[best].diameter-want)?id:best,"56145" as keyof typeof WHEELS);
 const {diameter,width}=WHEELS[part],h=Math.round(diameter*2.5),rotated=s.axis==="x";
 const w=rotated?width:diameter,d=rotated?diameter:width;
 return {id:0,part:part as Piece["part"],color:s.color,x:Math.max(0,Math.round(s.position.x-w/2)),y:Math.max(0,Math.round(s.position.y-h/2)),z:Math.max(0,Math.round(s.position.z-d/2)),w,d,h,rotated,stage:0};
}
// Explicit catalog parts keep their real occupied cells and connection sites.
// Shape sizes are descriptive only: a part can turn, never stretch.
export function catalogPiece(s:Shape):Piece{
 if(!s.part||!Object.hasOwn(PARTS,s.part))throw new GenerationError("The design requested an unknown catalog part. Choose a supported part ID.","INVALID_GEOMETRY");
 if(s.operation!=="add")throw new GenerationError("Remove a catalog part by its shape ID; real parts cannot subtract volume.","INVALID_GEOMETRY");
 if(!Object.values(s.position).every(Number.isInteger))throw new GenerationError("Place catalog parts on whole studs and plate layers.","INVALID_GEOMETRY");
 const entry=catalogPart(s.part);
 if(entry&&!entry.colors.includes(s.color))throw new GenerationError(`The catalog does not list part ${s.part} in ${s.color}. Choose one of its listed colors.`,"INVALID_GEOMETRY");
 const face=s.face||"pz",dims=partDimensions(s.part,face==="px"||face==="nx",face);
 return {id:0,part:s.part as Piece["part"],color:s.color,x:s.position.x,y:s.position.y,z:s.position.z,...dims,face,stage:0};
}
function bounds(s:Shape,d:GeneratedScene["dimensions"]){
 if(s.kind==="part"){const p=catalogPiece(s);if(p.x+p.w>d.x||p.y+p.h>d.y||p.z+p.d>d.z)throw new GenerationError("A catalog part extends outside the build area. Move it inward or choose a smaller part.","INVALID_GEOMETRY");return {x0:p.x,y0:p.y,z0:p.z,x1:p.x+p.w,y1:p.y+p.h,z1:p.z+p.d};}
 if(s.kind==="text"){
  if(!s.text||!s.face||!s.background)throw new LetteringError("A sign needs exact text, an outward-facing side and a background color.");
  if(s.operation!=="add")throw new LetteringError("Remove a sign by its shape ID; lettering panels cannot subtract volume.");
  if(s.color===s.background)throw new LetteringError("Use different letter and background colors so the sign can be read.");
  if(!Object.values(s.position).every(Number.isInteger))throw new LetteringError("Place sign panels on whole studs and plate layers.");
  signPixels(s.text,s.size,s.face);
 }
 if(s.kind==="wheel"){if(s.position.x>d.x||s.position.y>d.y||s.position.z>d.z)throw Error("A generated wheel sits outside the build area.");return {x0:0,y0:0,z0:0,x1:0,y1:0,z1:0};}
 if(s.kind==="lean"){const pad=Math.max(1,Math.round(s.size.x))+2;const lo={x:Math.min(s.position.x,s.end.x)-pad,y:Math.min(s.position.y,s.end.y),z:Math.min(s.position.z,s.end.z)-pad},hi={x:Math.max(s.position.x,s.end.x)+pad,y:Math.max(s.position.y,s.end.y)+3,z:Math.max(s.position.z,s.end.z)+pad};
  if([s.position,s.end].some(p=>p.x>d.x||p.y>d.y||p.z>d.z))throw Error("A generated leaning member extends outside the build area.");
  return {x0:Math.max(0,Math.floor(lo.x)),y0:Math.max(0,Math.floor(lo.y)),z0:Math.max(0,Math.floor(lo.z)),x1:Math.min(d.x,Math.ceil(hi.x)),y1:Math.min(d.y,Math.ceil(hi.y)),z1:Math.min(d.z,Math.ceil(hi.z))};}
 const lo=s.kind==="beam"?{x:Math.min(s.position.x,s.end.x)-s.radius,y:Math.min(s.position.y,s.end.y)-s.radius/.4,z:Math.min(s.position.z,s.end.z)-s.radius}:s.position;
 const hi=s.kind==="beam"?{x:Math.max(s.position.x,s.end.x)+s.radius,y:Math.max(s.position.y,s.end.y)+s.radius/.4,z:Math.max(s.position.z,s.end.z)+s.radius}:{x:lo.x+s.size.x,y:lo.y+s.size.y,z:lo.z+s.size.z};
 // A shape with no volume draws nothing, so it is skipped rather than failing the whole design.
 if(s.kind!=="beam"&&Math.min(s.size.x,s.size.y,s.size.z)<=0)return {x0:0,y0:0,z0:0,x1:0,y1:0,z1:0};
 if(s.kind!=="beam"&&(hi.x>d.x||hi.y>d.y||hi.z>d.z))throw Error("A generated shape extends outside the build area. Try a smaller design.");
 if(s.kind==="beam"&&[s.position,s.end].some(p=>p.x>d.x||p.y>d.y||p.z>d.z))throw Error("A generated beam extends outside the build area.");
 return {x0:Math.max(0,Math.floor(lo.x)),y0:Math.max(0,Math.floor(lo.y)),z0:Math.max(0,Math.floor(lo.z)),x1:Math.min(d.x,Math.ceil(hi.x)),y1:Math.min(d.y,Math.ceil(hi.y)),z1:Math.min(d.z,Math.ceil(hi.z))};
}
export function validateScene(raw:unknown):GeneratedScene{
 const parsed=sceneSchema.safeParse(raw);if(!parsed.success)throw Error("The generator returned an incomplete design. Try again; your current build is safe.");
 const scene=parsed.data;scene.shapes=scene.shapes.map(s=>{if(s.kind!=="part")return s;const p=catalogPiece(s);return {...s,size:{x:p.w,y:p.h,z:p.d},face:p.face||"pz"};});let evaluations=0;
 const ids=scene.shapes.filter(s=>s.id).map(s=>s.id);if(new Set(ids).size!==ids.length)throw Error("The design has duplicate shape IDs.");
 const expanded=expandShapes(scene.shapes),reserved=new Set<string>(),wheels=expanded.filter(s=>s.kind==="wheel"&&s.operation==="add").map(wheelPiece);
 for(const s of expanded){
  const b=bounds(s,scene.dimensions);evaluations+=(b.x1-b.x0)*(b.y1-b.y0)*(b.z1-b.z0);if(evaluations>4000000)throw Error("This design is too complex. Reduce repeated details or large overlapping shapes.");
  if(s.kind==="part"){
   const p=catalogPiece(s);if(wheels.some(w=>piecesIntersect(p,w)))throw new GenerationError("A catalog part overlaps a wheel. Leave clearance for both real elements.","INVALID_GEOMETRY");
   for(const [x,y,z] of pieceCells(p)){const key=voxelKey(x,y,z);if(reserved.has(key))throw new GenerationError("Two catalog parts overlap. Move or remove one of the explicit parts.","INVALID_GEOMETRY");reserved.add(key);}
  }
 }
 return scene;
}
export function expandShapes(shapes:Shape[]){const out:Shape[]=[];for(const s of shapes){for(let i=0;i<(s.repeat?.count||1);i++){const offset=s.repeat?.offset||{x:0,y:0,z:0};const shift=(p:Shape["position"])=>({x:p.x+i*offset.x,y:p.y+i*offset.y,z:p.z+i*offset.z});out.push({...s,position:shift(s.position),end:s.kind==="beam"||s.kind==="lean"?shift(s.end):s.end});if(out.length>1400)throw Error("This design repeats too many details. Keep fewer than 1,400 instances.");}}return out;}
// protect keeps leaning courses and lettering out of slope carving. Lettering also
// keeps its full backing during hollowing so every colored pixel has stud support.
export function sceneVoxels(raw:unknown,protect?:Set<string>,wheels?:Piece[],owners?:Map<string,string>,letteringProtect?:Set<string>,parts?:Piece[]):VoxelMap{
 const scene=validateScene(raw),voxels:VoxelMap=new Map();
 // Signs are applied after structural shapes so a later roof or wall cannot
 // erase individual letters. Revisions remove/replace the sign by its stable ID.
 const expanded=expandShapes(scene.shapes);
 for(const s of [...expanded.filter(s=>s.kind!=="text"&&s.kind!=="part"),...expanded.filter(s=>s.kind==="text"),...expanded.filter(s=>s.kind==="part")]){const b=bounds(s,scene.dimensions);
  if(s.kind==="part"){
   const p=catalogPiece(s);parts?.push(p);
   for(const [x,y,z] of pieceCells(p)){const key=voxelKey(x,y,z);voxels.set(key,p.color);protect?.add(key);owners?.set(key,s.component||s.label);}
   if(voxels.size>200000)throw Error("This design needs too many bricks. Try hollow structures or a smaller size.");
   continue;
  }
  if(s.kind==="wheel"){if(s.operation==="add")wheels?.push(wheelPiece(s));continue;}
  const courses=s.kind==="lean"?leanCourses(s):null;
  const lettering=s.kind==="text"?new Set(signPixels(s.text!,s.size,s.face!).map(p=>voxelKey(p.x+s.position.x,p.y+s.position.y,p.z+s.position.z))):null;
  for(let x=b.x0;x<b.x1;x++)for(let y=b.y0;y<b.y1;y++)for(let z=b.z0;z<b.z1;z++){
   const nx=(x+.5-s.position.x)/s.size.x,ny=(y+.5-s.position.y)/s.size.y,nz=(z+.5-s.position.z)/s.size.z;
   let inside=nx>=0&&nx<1&&ny>=0&&ny<1&&nz>=0&&nz<1;
   if(courses){const c=courses.find(c=>y>=c.y&&y<c.y+c.h);if(!c){inside=false;}else{const px=x+.5-c.cx,pz=z+.5-c.cz,along=px*c.ux+pz*c.uz,across=-px*c.uz+pz*c.ux;inside=Math.abs(along)<=c.len/2&&Math.abs(across)<=c.w/2;}}
   if(s.kind==="ellipsoid")inside=(2*nx-1)**2+(2*ny-1)**2+(2*nz-1)**2<=1;
   // A cylinder or cone runs along its axis: y stands upright, x lies left to right (wheels, logs), z lies front to back.
   if(s.kind==="cylinder"||s.kind==="cone"){const axis=s.axis||"y",[a,b,t]=axis==="y"?[nx,nz,ny]:axis==="x"?[ny,nz,nx]:[nx,ny,nz];const r=s.kind==="cone"?1-t:1;inside=inside&&(2*a-1)**2+(2*b-1)**2<=r*r;}
   if(s.kind==="beam"){
    const dx=s.end.x-s.position.x,dy=(s.end.y-s.position.y)*.4,dz=s.end.z-s.position.z;
    const px=x+.5-s.position.x,py=(y+.5-s.position.y)*.4,pz=z+.5-s.position.z;
    const length=dx*dx+dy*dy+dz*dz,t=length?Math.max(0,Math.min(1,(px*dx+py*dy+pz*dz)/length)):0;
    inside=(px-t*dx)**2+(py-t*dy)**2+(pz-t*dz)**2<=s.radius*s.radius;
   }
   if(!inside)continue;const key=voxelKey(x,y,z);if(s.operation==="subtract"){voxels.delete(key);protect?.delete(key);owners?.delete(key);}else{voxels.set(key,lettering&&!lettering.has(key)?s.background!:s.color);if(courses||lettering)protect?.add(key);if(lettering)letteringProtect?.add(key);owners?.set(key,s.component||s.label);}
   if(voxels.size>200000)throw Error("This design needs too many bricks. Try hollow structures or a smaller size.");
  }
 }
 return voxels;
}
// Bricks only hold through stud contact, so a cell with nothing above or below
// it and at most one neighbour beside it can never be a real brick: it is a
// sliver left by a curved subtraction or a rounding edge. Remove those, then
// remove small clusters of cells that no longer touch the ground through the
// remaining cells. Large floating masses are kept: a body carved free of its
// footing is a support problem the checks report, not debris to delete.
// Both passes repeat until the volume is stable.
const FLOATING_DEBRIS_CELLS=48;
export function tidyVoxels(voxels:VoxelMap,retain:ReadonlySet<string>=new Set()){
 const at=(x:number,y:number,z:number)=>voxels.has(voxelKey(x,y,z));
 const parse=(key:string)=>key.split(",").map(Number) as [number,number,number];
 let removed=0,changed=true;
 while(changed){
  changed=false;
  for(const key of [...voxels.keys()]){
   const [x,y,z]=parse(key);if(y===0||retain.has(key))continue;
   if(at(x,y-1,z)||at(x,y+1,z))continue;
   const beside=[at(x-1,y,z),at(x+1,y,z),at(x,y,z-1),at(x,y,z+1)].filter(Boolean).length;
   if(beside<=1){voxels.delete(key);removed++;changed=true;}
  }
  // Flood from the ground layer through face-adjacent cells; everything unreached floats.
  const seen=new Set<string>(),queue:string[]=[];
  for(const key of voxels.keys())if(parse(key)[1]===0){seen.add(key);queue.push(key);}
  while(queue.length){const [x,y,z]=parse(queue.pop()!);for(const [a,b,c] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const next=voxelKey(x+a,y+b,z+c);if(voxels.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}}}
  // Group the unreached cells into clusters; drop only the small ones.
  const unreached=[...voxels.keys()].filter(key=>!seen.has(key)),visited=new Set<string>();
  for(const start of unreached){if(visited.has(start))continue;const cluster:string[]=[start];visited.add(start);for(let i=0;i<cluster.length;i++){const [x,y,z]=parse(cluster[i]);for(const [a,b,c] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const next=voxelKey(x+a,y+b,z+c);if(voxels.has(next)&&!seen.has(next)&&!visited.has(next)){visited.add(next);cluster.push(next);}}}
   if(cluster.length<FLOATING_DEBRIS_CELLS&&!cluster.some(key=>retain.has(key))){for(const key of cluster){voxels.delete(key);removed++;changed=true;}}}
 }
 return removed;
}
export function compileScene(raw:unknown,options:{manual?:ManualEdits;hollow?:boolean;smooth?:boolean;slopes?:boolean}={}){
 const scene=validateScene(raw),protect=new Set<string>(),letteringProtect=new Set<string>(),wheels:Piece[]=[],explicit:Piece[]=[],voxels=sceneVoxels(scene,protect,wheels,undefined,letteringProtect,explicit);
 const maskedErase=new Set<string>(),eraseBoxes=options.manual?.erase.filter(b=>!b.cells)||[];
 for(const b of options.manual?.erase||[])for(const [x,y,z] of b.cells||[])maskedErase.add(voxelKey(b.x+x,b.y+y,b.z+z));
 const erased=(p:Piece)=>options.manual&&([...pieceCells(p)].some(([x,y,z])=>maskedErase.has(voxelKey(x,y,z))||eraseBoxes.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h&&z>=b.z&&z<b.z+b.d))||options.manual.bricks.some(b=>piecesIntersect(p,b)));
 // A real part is indivisible: erasing any occupied part cell removes that
 // element, while an edit in a window/arch opening leaves its frame intact.
 const kept:Piece[]=[],removed:Piece[]=[];for(const p of explicit)(erased(p)?removed:kept).push(p);
 const contextualManual=explicit.length?options.manual?.bricks||[]:[],retain=new Set<string>(),reserved=new Set<string>();
 for(const p of [...kept,...contextualManual]){
  for(const [x,y,z] of pieceCells(p)){const key=voxelKey(x,y,z);reserved.add(key);retain.add(key);protect.add(key);}
  // A socket may be inside the part's bounding height, not at its minimum.
  for(const [x,y,z] of bottomConnectorOffsets(p)){const key=voxelKey(p.x+x,p.y+y-1,p.z+z);retain.add(key);protect.add(key);}
  for(const [x,y,z] of topConnectorOffsets(p)){const key=voxelKey(p.x+x,p.y+y,p.z+z);retain.add(key);protect.add(key);}
 }
 // Wheels are real elements: whatever the scene drew inside a wheel gives way to it.
 for(const wh of wheels)for(const [x,y,z] of pieceCells(wh))voxels.delete(voxelKey(x,y,z));
 if(options.hollow){
  // Keep the exterior, two-cell walls, horizontal diaphragms and vertical ribs.
  let inner=new Set(voxels.keys());const adjacent=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(let pass=0;pass<2;pass++){const next=new Set<string>();for(const key of inner){const [x,y,z]=key.split(",").map(Number);if(adjacent.every(([a,b,c])=>inner.has(voxelKey(x+a,y+b,z+c))))next.add(key);}inner=next;}
  for(const key of inner){const [x,y,z]=key.split(",").map(Number);if(!letteringProtect.has(key)&&!retain.has(key)&&y>5&&y%12>2&&x%8>1&&z%8>1)voxels.delete(key);}
 }
 if(options.manual)applyManual(voxels,options.manual);
 for(const p of removed)for(const [x,y,z] of pieceCells(p))voxels.delete(voxelKey(x,y,z));
 for(const p of contextualManual)for(const [x,y,z] of pieceCells(p))voxels.set(voxelKey(x,y,z),p.color);
 // Include actual catalog occupancy in the connectivity pass. Small real
 // parts and their support cells must never be mistaken for voxel debris;
 // unattached elements remain visible for the support audit to reject.
 tidyVoxels(voxels,retain);
 for(const key of reserved)voxels.delete(key);
 // Stepped curves and pitches get real slope parts; the packer fills the rest.
 const slopes=options.slopes===false?[]:carveSlopes(voxels,protect);
 const packed=[...packVoxels(voxels,{expanded:scene.catalogVersion===1}),...slopes,...wheels,...(options.manual?.bricks||[]),...kept],pieces=options.smooth?smoothTops(packed,new Set([...kept,...contextualManual])):packed;
 if(!pieces.length)throw Error("The generated draft is empty. Try again.");if(pieces.length>16000)throw Error("The design exceeds the 16,000 piece limit.");
 return finishModel(pieces,{name:scene.name,description:scene.description,source:"custom"});
}

// ---------------------------------------------------------------------------
// Wire format. The model reads and writes a compact form of the scene: short
// keys, vectors as arrays, and nulls where a field does not apply, which is
// about half the tokens of the full form. Everything inside the app still
// uses the full Shape/GeneratedScene types.
//   {n,d,f:[signature features],dim:[x,y,z],rm:[ids removed],sh:[{i,c,l,k,o,a,col,p:[x,y,z],s:[x,y,z],e:[x,y,z]|null,r|null,rep:[count,dx,dy,dz]|null}]}
// ---------------------------------------------------------------------------
const vec3=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
export const compactShapeSchema=z.object({
 i:z.string().min(1).max(80),c:z.string().min(1).max(80),l:z.string().min(1).max(80),
 k:z.enum(["box","ellipsoid","cylinder","cone","beam","lean","wheel","text","part"]),o:z.enum(["add","subtract"]),a:z.enum(["x","y","z"]).nullable().optional(),col:z.enum(colors),
 txt:z.string().min(1).max(12).nullable().optional(),face:z.enum(SIGN_FACES).nullable().optional(),bg:z.enum(colors).nullable().optional(),pid:z.string().min(1).max(32).nullable().optional(),
 p:vec3,s:vec3,e:vec3.nullable().optional(),r:z.number().finite().nullable().optional(),rep:z.tuple([z.number(),z.number(),z.number(),z.number()]).nullable().optional(),
}).strict();
export type CompactShape=z.infer<typeof compactShapeSchema>;
export type CompactScene={n:string;d:string;f:string[];dim:[number,number,number];rm?:string[]|null;sh:CompactShape[]};
const vec3JSON={type:"array",items:{type:"number"},minItems:3,maxItems:3};
const nullable=(schema:Record<string,unknown>)=>({anyOf:[schema,{type:"null"}]});
export const compactJSONSchema={type:"object",additionalProperties:false,properties:{
 n:shortText,d:{type:"string",maxLength:500},f:{type:"array",items:shortText,maxItems:4},dim:vec3JSON,rm:{type:"array",items:{type:"string"}},
 sh:{type:"array",maxItems:240,items:{type:"object",additionalProperties:false,properties:{
  i:shortText,c:shortText,l:shortText,k:{type:"string",enum:["box","ellipsoid","cylinder","cone","beam","lean","wheel","text","part"]},o:{type:"string",enum:["add","subtract"]},a:nullable({type:"string",enum:["x","y","z"]}),col:{type:"string",enum:colors},
  txt:nullable({type:"string",minLength:1,maxLength:12}),face:nullable({type:"string",enum:SIGN_FACES}),bg:nullable({type:"string",enum:colors}),pid:nullable({type:"string",minLength:1,maxLength:32}),
  p:vec3JSON,s:vec3JSON,e:nullable(vec3JSON),r:nullable({type:"number",minimum:.5,maximum:12}),rep:nullable({type:"array",items:{type:"number"},minItems:4,maxItems:4}),
 },required:["i","c","l","k","o","a","col","p","s","e","r","rep","txt","face","bg","pid"]}},
},required:["n","d","f","dim","rm","sh"]};
const clampAxis=(v:number,max:number)=>Math.min(max,Math.max(0,Number.isFinite(v)?v:0));
const toVec=(v:[number,number,number])=>({x:clampAxis(v[0],80),y:clampAxis(v[1],160),z:clampAxis(v[2],80)});
export function expandCompactShape(c:CompactShape):Shape{
 const beam=c.k==="beam",lean=c.k==="lean",round=c.k==="cylinder"||c.k==="cone"||c.k==="wheel";
 // Fields that do not apply to this kind are ignored rather than failing the design: a model that
 // writes r: 0 for a box, or an axis for an ellipsoid, has not drawn anything wrong.
 const radius=beam?Math.min(12,Math.max(.5,Number(c.r)||1)):1;
 const rep=c.rep&&c.rep[0]>1?{count:Math.min(32,Math.max(1,Math.round(c.rep[0]))),offset:{x:Math.max(0,c.rep[1]),y:Math.max(0,c.rep[2]),z:Math.max(0,c.rep[3])}}:{count:1,offset:{x:0,y:0,z:0}};
 return shapeSchema.parse({id:c.i,component:c.c,label:c.l,kind:c.k,operation:c.o,...(c.k==="text"?{text:c.txt??undefined,face:c.face??undefined,background:c.bg??undefined}:c.k==="part"?{part:c.pid??undefined,face:c.face||"pz"}:{}),...(round&&c.a?{axis:c.a}:{}),color:c.col,position:toVec(c.p),size:beam?{x:1,y:1,z:1}:lean?{x:Math.min(8,Math.max(1,Math.round(Number(c.s?.[0])||1))),y:Number(c.s?.[1])>=3?3:1,z:1}:c.k==="wheel"?{x:Math.min(8,Math.max(1,Number(c.s?.[0])||4)),y:1,z:1}:toVec(c.s),end:(beam||lean)&&c.e?toVec(c.e):{x:0,y:0,z:0},radius,repeat:rep});
}
export function compactShape(s:Shape):CompactShape{
 const beam=s.kind==="beam",lean=s.kind==="lean",rep=s.repeat&&s.repeat.count>1?s.repeat:null;
 return {i:s.id||s.label,c:s.component||s.label,l:s.label,k:s.kind,o:s.operation,a:s.axis&&s.axis!=="y"?s.axis:null,col:s.color,p:[s.position.x,s.position.y,s.position.z],s:[s.size.x,s.size.y,s.size.z],e:beam||lean?[s.end.x,s.end.y,s.end.z]:null,r:beam?s.radius:null,rep:rep?[rep.count,rep.offset.x,rep.offset.y,rep.offset.z]:null,txt:s.kind==="text"?s.text??null:null,face:s.kind==="text"||s.kind==="part"?s.face??"pz":null,bg:s.kind==="text"?s.background??null:null,pid:s.kind==="part"?s.part??null:null};
}
export function compactScene(scene:GeneratedScene):CompactScene{return {n:scene.name,d:scene.description,f:scene.signature||[],dim:[scene.dimensions.x,scene.dimensions.y,scene.dimensions.z],rm:[],sh:scene.shapes.map(compactShape)};}
export function expandCompactHeader(raw:{n?:unknown;d?:unknown;f?:unknown;dim?:unknown}):SceneHeader{
 const dim=Array.isArray(raw.dim)&&raw.dim.length===3?raw.dim as number[]:[0,0,0];
 const signature=Array.isArray(raw.f)?raw.f.filter(x=>typeof x==="string"&&x.trim()).map(x=>String(x).trim().slice(0,80)).slice(0,4):[];
 return {catalogVersion:1,name:String(raw.n??"Untitled design").slice(0,80),description:String(raw.d??"").slice(0,500),...(signature.length?{signature}:{}),dimensions:{x:Number(dim[0]),y:Number(dim[1]),z:Number(dim[2])}};
}
// A revision returns only new and changed shapes plus the ids it removed; the
// result is the previous scene with those applied, changed shapes keeping their
// place in the operation order and new ones appended in the order given.
export function mergeRevision(previous:GeneratedScene,header:SceneHeader,removed:string[],shapes:Shape[]):GeneratedScene{
 const gone=new Set(removed),incoming=new Map(shapes.map(s=>[s.id||s.label,s]));
 const kept=previous.shapes.filter(s=>!gone.has(s.id||s.label)).map(s=>incoming.get(s.id||s.label)||s);
 const seen=new Set(kept.map(s=>s.id||s.label));
 // A revision that names no signature features keeps the ones already declared.
 const {catalogVersion:_incomingVersion,...metadata}=header;
 return {...metadata,...(previous.catalogVersion?{catalogVersion:previous.catalogVersion}:{}),...(header.signature?.length?{}:previous.signature?.length?{signature:previous.signature}:{}),shapes:[...kept,...shapes.filter(s=>!seen.has(s.id||s.label))]};
}

// Extract only completed shape objects from streamed compact JSON. Braces
// inside strings and escaped quotes must never finish a shape early.
export class SceneStreamParser{
 private text="";private cursor=0;private shapeStart=-1;private depth=0;private quoted=false;private escaped=false;private inShapes=false;
 header:SceneHeader|null=null;removed:string[]=[];shapes:Shape[]=[];
 push(delta:string){
  this.text+=delta;if(this.text.length>350000)throw Error("The generated response is too large.");
  if(!this.inShapes){const match=/"sh"\s*:\s*\[/.exec(this.text);if(!match)return;
   const prefix=this.text.slice(0,match.index);const raw=JSON.parse(prefix+'"sh":[]}');this.header=expandCompactHeader(raw);this.removed=Array.isArray(raw.rm)?raw.rm.filter((x:unknown)=>typeof x==="string").slice(0,240):[];this.cursor=match.index+match[0].length;this.inShapes=true;}
  for(;this.cursor<this.text.length;this.cursor++){
   const c=this.text[this.cursor];if(this.quoted){if(this.escaped)this.escaped=false;else if(c==="\\")this.escaped=true;else if(c==='"')this.quoted=false;continue;}
   if(c==='"'){this.quoted=true;continue;}if(c==="{"){if(this.depth===0)this.shapeStart=this.cursor;this.depth++;}else if(c==="}"){this.depth--;if(this.depth===0&&this.shapeStart>=0){const s=expandCompactShape(compactShapeSchema.parse(JSON.parse(this.text.slice(this.shapeStart,this.cursor+1))));this.shapes.push(s);if(this.shapes.length>240)throw Error("The generator exceeded the shape limit.");this.shapeStart=-1;}}else if(c==="]"&&this.depth===0){this.cursor++;break;}
  }
 }
 // The complete compact document, expanded. Callers merge revisions and validate.
 finish():{header:SceneHeader;removed:string[];shapes:Shape[]}{
  const raw=JSON.parse(this.text);const header=expandCompactHeader(raw);
  const shapes=(Array.isArray(raw.sh)?raw.sh:[]).map((c:unknown)=>expandCompactShape(compactShapeSchema.parse(c)));
  return {header,removed:Array.isArray(raw.rm)?raw.rm.filter((x:unknown)=>typeof x==="string"):[],shapes};
 }
}

export function normalizeScene(scene:GeneratedScene):GeneratedScene{const taken=new Set(scene.shapes.filter(s=>s.id).map(s=>s.id));return {...scene,shapes:scene.shapes.map((s,i)=>{let id=s.id||`shape-${i+1}`;while(!s.id&&taken.has(id))id+="-legacy";taken.add(id);return {...s,id,component:s.component||s.label,repeat:s.repeat||{count:1,offset:{x:0,y:0,z:0}}};})};}

// Where the pieces go, by component: the scene is packed and each piece is charged to the
// component that owns its cells (a wheel element to the wheel's component). The designer reads
// this when it has to cut, so it must reflect real pieces, not cell counts: a dense base packs
// into a few big plates while a thin skin is all slivers.
const placementKey=(p:Piece)=>`${p.part}:${p.x}:${p.y}:${p.z}:${p.face||(p.rotated?"px":"pz")}`;
function explicitOwners(scene:GeneratedScene){return new Map(expandShapes(scene.shapes).filter(s=>s.kind==="part").map(s=>[placementKey(catalogPiece(s)),s.component||s.label]));}
export function componentBudget(scene:GeneratedScene,model:Pick<BuildModel,"pieces">):{component:string;pieces:number}[]{
 const owners=new Map<string,string>(),wheelShapes=scene.shapes.filter(s=>s.kind==="wheel");sceneVoxels(scene,undefined,undefined,owners);
 const count=new Map<string,number>(),parts=explicitOwners(scene);
 for(const p of model.pieces){
  let owner=parts.get(placementKey(p));
  if(!owner&&WHEELS[p.part]){const cx=p.x+p.w/2,cy=p.y+p.h/2,cz=p.z+p.d/2;let best=Infinity;for(const w of wheelShapes){const d=Math.hypot(w.position.x-cx,(w.position.y-cy)*.4,w.position.z-cz);if(d<best){best=d;owner=w.component||w.label;}}}
  else if(!owner){for(const [x,y,z] of pieceCells(p)){const o=owners.get(voxelKey(x,y,z));if(o){owner=o;break;}}}
  const key=owner||"Other";count.set(key,(count.get(key)||0)+1);
 }
 return [...count].map(([component,pieces])=>({component,pieces})).sort((a,b)=>b.pieces-a.pieces);
}

// Which components' pieces have no stud path to the ground, by count, so the designer is told
// "Mirrors: 4 loose" instead of "93 pieces have no stud path".
export function looseByComponent(scene:GeneratedScene,looseIds:number[],model:{pieces:Piece[]}):{component:string;pieces:number}[]{
 if(!looseIds.length)return [];
 const owners=new Map<string,string>();sceneVoxels(scene,undefined,undefined,owners);
 const wheelShapes=scene.shapes.filter(s=>s.kind==="wheel"),loose=new Set(looseIds),count=new Map<string,number>(),parts=explicitOwners(scene);
 for(const p of model.pieces){
  if(!loose.has(p.id))continue;let owner=parts.get(placementKey(p));
  if(!owner&&WHEELS[p.part]){const cx=p.x+p.w/2,cy=p.y+p.h/2,cz=p.z+p.d/2;let best=Infinity;for(const w of wheelShapes){const d=Math.hypot(w.position.x-cx,(w.position.y-cy)*.4,w.position.z-cz);if(d<best){best=d;owner=w.component||w.label;}}}
  else if(!owner){for(const [x,y,z] of pieceCells(p)){const o=owners.get(voxelKey(x,y,z));if(o){owner=o;break;}}}
  const key=owner||"Other";count.set(key,(count.get(key)||0)+1);
 }
 return [...count].map(([component,pieces])=>({component,pieces})).sort((a,b)=>b.pieces-a.pieces);
}
