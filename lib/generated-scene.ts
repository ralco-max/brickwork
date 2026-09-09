import {z} from "zod";
import {COLORS} from "./bridge";
import {finishModel,packVoxels,voxelKey,smoothTops} from "./models";
import type {ColorKey} from "./bridge";
import type {VoxelMap} from "./models";
import {applyManual} from "./design-project";
import type {ManualEdits} from "./design-project";

const colors=Object.keys(COLORS) as [ColorKey,...ColorKey[]];
const vector=z.object({x:z.number().finite().min(0).max(80),y:z.number().finite().min(0).max(160),z:z.number().finite().min(0).max(80)}).strict();
const repeatSchema=z.object({count:z.number().int().min(1).max(32),offset:vector}).strict();
export const shapeSchema=z.object({
 id:z.string().min(1).max(80).optional(),component:z.string().min(1).max(80).optional(),repeat:repeatSchema.optional(),
 label:z.string().min(1).max(80),kind:z.enum(["box","ellipsoid","cylinder","cone","beam"]),operation:z.enum(["add","subtract"]),
 color:z.enum(colors),position:vector,size:vector,end:vector,radius:z.number().finite().min(.5).max(12),
}).strict();
export const sceneSchema=z.object({
 name:z.string().min(1).max(80),description:z.string().max(500),
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
 name:shortText,description:{type:"string",maxLength:500},dimensions:dimensionJSON,
 shapes:{type:"array",minItems:1,maxItems:240,items:{type:"object",properties:{id:shortText,component:shortText,label:shortText,kind:{type:"string",enum:["box","ellipsoid","cylinder","cone","beam"]},operation:{type:"string",enum:["add","subtract"]},color:{type:"string",enum:colors},position:vecJSON,size:vecJSON,end:vecJSON,radius:{type:"number",minimum:.5,maximum:12},repeat:{type:"object",properties:{count:{type:"integer",minimum:1,maximum:32},offset:vecJSON},required:["count","offset"],additionalProperties:false}},required:["id","component","label","kind","operation","color","position","size","end","radius","repeat"],additionalProperties:false}},
},required:["name","description","dimensions","shapes"],additionalProperties:false};

function bounds(s:Shape,d:GeneratedScene["dimensions"]){
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
 const scene=parsed.data;let evaluations=0;
 const ids=scene.shapes.filter(s=>s.id).map(s=>s.id);if(new Set(ids).size!==ids.length)throw Error("The design has duplicate shape IDs.");
 for(const s of expandShapes(scene.shapes)){const b=bounds(s,scene.dimensions);evaluations+=(b.x1-b.x0)*(b.y1-b.y0)*(b.z1-b.z0);if(evaluations>4000000)throw Error("This design is too complex. Reduce repeated details or large overlapping shapes.");}
 return scene;
}
export function expandShapes(shapes:Shape[]){const out:Shape[]=[];for(const s of shapes){for(let i=0;i<(s.repeat?.count||1);i++){const offset=s.repeat?.offset||{x:0,y:0,z:0};const shift=(p:Shape["position"])=>({x:p.x+i*offset.x,y:p.y+i*offset.y,z:p.z+i*offset.z});out.push({...s,position:shift(s.position),end:s.kind==="beam"?shift(s.end):s.end});if(out.length>1400)throw Error("This design repeats too many details. Keep fewer than 1,400 instances.");}}return out;}
export function sceneVoxels(raw:unknown):VoxelMap{
 const scene=validateScene(raw),voxels:VoxelMap=new Map();
 for(const s of expandShapes(scene.shapes)){const b=bounds(s,scene.dimensions);
  for(let x=b.x0;x<b.x1;x++)for(let y=b.y0;y<b.y1;y++)for(let z=b.z0;z<b.z1;z++){
   const nx=(x+.5-s.position.x)/s.size.x,ny=(y+.5-s.position.y)/s.size.y,nz=(z+.5-s.position.z)/s.size.z;
   let inside=nx>=0&&nx<1&&ny>=0&&ny<1&&nz>=0&&nz<1;
   if(s.kind==="ellipsoid")inside=(2*nx-1)**2+(2*ny-1)**2+(2*nz-1)**2<=1;
   if(s.kind==="cylinder"||s.kind==="cone"){const r=s.kind==="cone"?1-ny:1;inside=inside&&(2*nx-1)**2+(2*nz-1)**2<=r*r;}
   if(s.kind==="beam"){
    const dx=s.end.x-s.position.x,dy=(s.end.y-s.position.y)*.4,dz=s.end.z-s.position.z;
    const px=x+.5-s.position.x,py=(y+.5-s.position.y)*.4,pz=z+.5-s.position.z;
    const length=dx*dx+dy*dy+dz*dz,t=length?Math.max(0,Math.min(1,(px*dx+py*dy+pz*dz)/length)):0;
    inside=(px-t*dx)**2+(py-t*dy)**2+(pz-t*dz)**2<=s.radius*s.radius;
   }
   if(!inside)continue;const key=voxelKey(x,y,z);if(s.operation==="subtract")voxels.delete(key);else voxels.set(key,s.color);
   if(voxels.size>200000)throw Error("This design needs too many bricks. Try hollow structures or a smaller size.");
  }
 }
 return voxels;
}
// Bricks only hold through stud contact, so a cell with nothing above or below
// it and at most one neighbour beside it can never be a real brick: it is a
// sliver left by a curved subtraction or a rounding edge. Remove those, then
// remove any cluster of cells that no longer touches the ground through the
// remaining cells. Both passes repeat until the volume is stable.
export function tidyVoxels(voxels:VoxelMap){
 const at=(x:number,y:number,z:number)=>voxels.has(voxelKey(x,y,z));
 const parse=(key:string)=>key.split(",").map(Number) as [number,number,number];
 let removed=0,changed=true;
 while(changed){
  changed=false;
  for(const key of [...voxels.keys()]){
   const [x,y,z]=parse(key);if(y===0)continue;
   if(at(x,y-1,z)||at(x,y+1,z))continue;
   const beside=[at(x-1,y,z),at(x+1,y,z),at(x,y,z-1),at(x,y,z+1)].filter(Boolean).length;
   if(beside<=1){voxels.delete(key);removed++;changed=true;}
  }
  // Flood from the ground layer through face-adjacent cells; everything unreached floats.
  const seen=new Set<string>(),queue:string[]=[];
  for(const key of voxels.keys())if(parse(key)[1]===0){seen.add(key);queue.push(key);}
  while(queue.length){const [x,y,z]=parse(queue.pop()!);for(const [a,b,c] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const next=voxelKey(x+a,y+b,z+c);if(voxels.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}}}
  for(const key of [...voxels.keys()])if(!seen.has(key)){voxels.delete(key);removed++;changed=true;}
 }
 return removed;
}
export function compileScene(raw:unknown,options:{manual?:ManualEdits;hollow?:boolean;smooth?:boolean}={}){
 const scene=validateScene(raw),voxels=sceneVoxels(scene);
 if(options.hollow){
  // Keep the exterior, two-cell walls, horizontal diaphragms and vertical ribs.
  let inner=new Set(voxels.keys());const adjacent=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(let pass=0;pass<2;pass++){const next=new Set<string>();for(const key of inner){const [x,y,z]=key.split(",").map(Number);if(adjacent.every(([a,b,c])=>inner.has(voxelKey(x+a,y+b,z+c))))next.add(key);}inner=next;}
  for(const key of inner){const [x,y,z]=key.split(",").map(Number);if(y>5&&y%12>2&&x%8>1&&z%8>1)voxels.delete(key);}
 }
 if(options.manual)applyManual(voxels,options.manual);
 tidyVoxels(voxels);
 const packed=[...packVoxels(voxels),...(options.manual?.bricks||[])],pieces=options.smooth?smoothTops(packed):packed;if(!pieces.length)throw Error("The generated draft is empty. Try again.");if(pieces.length>16000)throw Error("The design exceeds the 16,000 piece limit.");
 return finishModel(pieces,{name:scene.name,description:scene.description,source:"custom"});
}

// Extract only completed shape objects from streamed JSON. Braces inside strings
// and escaped quotes must never finish a shape early.
export class SceneStreamParser{
 private text="";private cursor=0;private shapeStart=-1;private depth=0;private quoted=false;private escaped=false;private inShapes=false;
 header:SceneHeader|null=null;shapes:Shape[]=[];
 push(delta:string){
  this.text+=delta;if(this.text.length>350000)throw Error("The generated response is too large.");
  if(!this.inShapes){const match=/"shapes"\s*:\s*\[/.exec(this.text);if(!match)return;
   const prefix=this.text.slice(0,match.index);this.header=JSON.parse(prefix+'"shapes":[]}');this.cursor=match.index+match[0].length;this.inShapes=true;}
  for(;this.cursor<this.text.length;this.cursor++){
   const c=this.text[this.cursor];if(this.quoted){if(this.escaped)this.escaped=false;else if(c==="\\")this.escaped=true;else if(c==='"')this.quoted=false;continue;}
   if(c==='"'){this.quoted=true;continue;}if(c==="{"){if(this.depth===0)this.shapeStart=this.cursor;this.depth++;}else if(c==="}"){this.depth--;if(this.depth===0&&this.shapeStart>=0){const s=shapeSchema.parse(JSON.parse(this.text.slice(this.shapeStart,this.cursor+1)));this.shapes.push(s);if(this.shapes.length>240)throw Error("The generator exceeded the shape limit.");this.shapeStart=-1;}}else if(c==="]"&&this.depth===0){this.cursor++;break;}
  }
 }
 finish(){return validateScene(JSON.parse(this.text));}
}

export function normalizeScene(scene:GeneratedScene):GeneratedScene{const taken=new Set(scene.shapes.filter(s=>s.id).map(s=>s.id));return {...scene,shapes:scene.shapes.map((s,i)=>{let id=s.id||`shape-${i+1}`;while(!s.id&&taken.has(id))id+="-legacy";taken.add(id);return {...s,id,component:s.component||s.label,repeat:s.repeat||{count:1,offset:{x:0,y:0,z:0}}};})};}
