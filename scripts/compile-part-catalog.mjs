// Build the supported intersection of exact geometry, known colors, and standard
// upright connectors. No network or API key is needed during app use.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {Box3,Triangle,Vector3,Ray} from "three";
import {loadLDrawPart,compileLDrawMesh,meshThumbnail} from "./ldraw-geometry.mjs";
import {createConnectorCompiler} from "./ldcad-connectors.mjs";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
const arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const sourceDir=arg("--ldraw"),shadowDir=arg("--shadow");
if(!sourceDir||!shadowDir)throw Error("Usage: node scripts/compile-part-catalog.mjs --ldraw /path/ldraw --shadow /path/LDCadShadowLibrary");
const selection=JSON.parse(await fs.readFile(path.join(root,"scripts/part-catalog-selection.json"),"utf8"));
const connectorCompiler=createConnectorCompiler(sourceDir,shadowDir),parts={},rejected=[],sources=new Map();
const epsilon=1e-5,latticeTolerance=.01,near=(a,b)=>Math.abs(a-b)<epsilon,mod=(n,d)=>((n%d)+d)%d;
const out=path.join(root,"public/parts/ldraw");await fs.mkdir(out,{recursive:true});
const choice=arg("--ids","").split(",").filter(Boolean),limit=Number(arg("--limit","10000"));
const snap=n=>Math.round(n*1e6)/1e6;
function lattice(values,step){const count=new Map();for(const v of values){const p=snap(mod(v,step));count.set(p,(count.get(p)||0)+1);}return [...count].sort((a,b)=>b[1]-a[1])[0][0];}
function occupiedCells(raw,{w,d,h,origin}){
 const convert=p=>new Vector3((p[0]-origin[0])/20,(origin[1]-p[1])/8,(p[2]-origin[2])/20);
 const triangles=raw.triangles.filter(t=>!t.stud).map(t=>{const vs=t.vertices.map(convert),triangle=new Triangle(...vs),box=new Box3().setFromPoints(vs);return {triangle,box};});
 const occupied=new Set(),box=new Box3(),point=new Vector3();
 for(const {triangle,box:bound} of triangles){
  const start=[Math.max(0,Math.floor(bound.min.x+epsilon)),Math.max(0,Math.floor(bound.min.y+epsilon)),Math.max(0,Math.floor(bound.min.z+epsilon))];
  const end=[Math.min(w-1,Math.floor(bound.max.x-epsilon)),Math.min(h-1,Math.floor(bound.max.y-epsilon)),Math.min(d-1,Math.floor(bound.max.z-epsilon))];
  // A face exactly on the outside boundary still occupies its interior cell.
  for(let axis=0;axis<3;axis++)if(start[axis]>end[axis]){const size=[w,h,d][axis],v=[bound.min.x,bound.min.y,bound.min.z][axis];start[axis]=end[axis]=Math.max(0,Math.min(size-1,Math.floor(v===size?v-epsilon:v)));}
  for(let x=start[0];x<=end[0];x++)for(let y=start[1];y<=end[1];y++)for(let z=start[2];z<=end[2];z++){
   box.min.set(x+epsilon,y+epsilon,z+epsilon);box.max.set(x+1-epsilon,y+1-epsilon,z+1-epsilon);
   // Include exterior faces at the edge of the placement box only; internal
   // grid-plane faces are reserved conservatively on their material side by
   // nearby faces/inside tests rather than occupying an empty neighboring stud.
   if(x===0)box.min.x=-epsilon;if(y===0)box.min.y=-epsilon;if(z===0)box.min.z=-epsilon;
   if(x===w-1)box.max.x=w+epsilon;if(y===h-1)box.max.y=h+epsilon;if(z===d-1)box.max.z=d+epsilon;
   if(box.intersectsTriangle(triangle))occupied.add(`${x},${y},${z}`);
  }
 }
 // Include interiors of closed solid features as well as their surface cells.
 const ray=new Ray(new Vector3(),new Vector3(1,0,0));
 for(let x=0;x<w;x++)for(let y=0;y<h;y++)for(let z=0;z<d;z++){
  const key=`${x},${y},${z}`;if(occupied.has(key))continue;ray.origin.set(x+.500137,y+.500173,z+.500191);const hits=[];
  for(const {triangle,box:bound} of triangles){if(bound.max.x<ray.origin.x||ray.origin.y<bound.min.y||ray.origin.y>bound.max.y||ray.origin.z<bound.min.z||ray.origin.z>bound.max.z)continue;const hit=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,point);if(hit)hits.push(hit.x);}
  hits.sort((a,b)=>a-b);if(hits.filter((n,i)=>!i||!near(n,hits[i-1])).length%2)occupied.add(key);
 }
 return [...occupied].map(k=>k.split(",").map(Number)).sort((a,b)=>a[1]-b[1]||a[2]-b[2]||a[0]-b[0]);
}
for(const candidate of selection.parts){
 if(candidate.legacy||choice.length&&!choice.includes(candidate.id))continue;if(Object.keys(parts).length>=limit)break;
 try{
  const raw=await loadLDrawPart(sourceDir,candidate.id),connectors=connectorCompiler.load(candidate.id),female=connectors.filter(c=>c.gender==="F");
  if(!female.length)throw Error("No documented upright anti-stud sockets");
  const phaseX=lattice(female.map(c=>c.position[0]+10),20),phaseZ=lattice(female.map(c=>c.position[2]+10),20),phaseY=lattice(female.map(c=>c.position[1]),8);
  // Rounded primitive coordinates may overshoot an exact stud boundary by a
  // few ten-thousandths of an LDU. Do not grow a 2x2 part into a 4x4 box.
  const minX=phaseX+Math.floor((raw.bodyBounds.min[0]-phaseX+latticeTolerance)/20)*20,minZ=phaseZ+Math.floor((raw.bodyBounds.min[2]-phaseZ+latticeTolerance)/20)*20,maxY=phaseY+Math.ceil((raw.bodyBounds.max[1]-phaseY-latticeTolerance)/8)*8;
  const origin=[minX,maxY,minZ],w=Math.ceil((raw.bodyBounds.max[0]-minX-latticeTolerance)/20),d=Math.ceil((raw.bodyBounds.max[2]-minZ-latticeTolerance)/20),h=Math.ceil((maxY-raw.bodyBounds.min[1]-latticeTolerance)/8);
  if(w<1||d<1||h<1||w>32||d>32||h>48||w*d*h>8192)throw Error("Outside supported upright dimensions");
  const local=c=>[(c.position[0]-minX)/20-.5,(maxY-c.position[1])/8,(c.position[2]-minZ)/20-.5];
  const grid=c=>{const p=local(c);return p.every(v=>near(v,Math.round(v)))&&p[0]>=0&&p[0]<w&&p[1]>=0&&p[1]<=h&&p[2]>=0&&p[2]<d;};
  const cells=gender=>[...new Map(connectors.filter(c=>c.gender===gender&&grid(c)).map(c=>{const p=local(c).map(Math.round);return [p.join(","),p];})).values()];
  const topStuds=cells("M"),bottomSockets=cells("F");if(!bottomSockets.length)throw Error("Documented sockets are outside the upright whole-stud grid");
  const occupancy=occupiedCells(raw,{w,d,h,origin});if(!occupancy.length)throw Error("Empty occupied-cell mask");
  const occupied=new Set(occupancy.map(p=>p.join(",")));
  if(bottomSockets.some(([x,y,z])=>!occupied.has(`${x},${y},${z}`)))throw Error("Socket has no body cell above its interface");
  if(topStuds.some(([x,y,z])=>!occupied.has(`${x},${y-1},${z}`)))throw Error("Stud has no body cell below its interface");
  const mesh=await compileLDrawMesh(raw,{w,d,h,bodyOrigin:origin});
  await fs.writeFile(path.join(out,`${candidate.id}.json`),JSON.stringify(mesh)+"\n");
  await fs.writeFile(path.join(out,`${candidate.id}.svg`),meshThumbnail(mesh));
  const price=Math.round(Math.max(.08,.065+(w*d*h)*.013)*100)/100;
  parts[candidate.id]={name:candidate.name,w,d,h,price,family:candidate.family,colors:candidate.colors,...(candidate.handedness?{handedness:candidate.handedness}:{}),...(candidate.counterpart?{counterpart:candidate.counterpart}:{}),topStuds,bottomSockets,occupancy,ldrawOffset:origin.map(n=>-n||0),mesh:`/parts/ldraw/${candidate.id}.json`,thumbnail:`/parts/ldraw/${candidate.id}.svg`,sourcePart:candidate.rebrickableId};
  for(const s of raw.sources)sources.set(s.path,s);
  if(Object.keys(parts).length%25===0)console.log(`Compiled ${Object.keys(parts).length} supported parts`);
 }catch(error){rejected.push({id:candidate.id,reason:error.message});}
}
if(choice.length){console.log({compiled:Object.keys(parts),rejected});}
const output={version:1,updatedAt:"2026-10-11",geometrySource:"https://www.ldraw.org/",connectionSource:"https://github.com/RolandMelkert/LDCadShadowLibrary",parts};
await fs.writeFile(path.join(root,"lib/data/parts-catalog.json"),JSON.stringify(output)+"\n");
await fs.writeFile(path.join(root,"public/parts/catalog.json"),JSON.stringify({...output,license:"CC BY-SA 4.0",attribution:"LDraw Parts Library and LDCad Shadow Library contributors; modifications by Bricks"})+"\n");
await fs.mkdir(path.join(root,"public/licenses/ldcad"),{recursive:true});await fs.copyFile(path.join(shadowDir,"LICENSE.md"),path.join(root,"public/licenses/ldcad/LICENSE.md"));
const shadowCommit=execFileSync("git",["rev-parse","HEAD"],{cwd:shadowDir,encoding:"utf8"}).trim();
const attribution={geometry:{...selection.sources.ldraw,files:[...sources.values()].sort((a,b)=>a.path.localeCompare(b.path))},connections:{url:output.connectionSource,commit:shadowCommit,license:"CC BY-SA 4.0",attribution:"LDCad Shadow Library contributors",modifications:"Filtered to upright System stud/anti-stud connectors, transformed to the application's whole-stud and plate grid.",files:connectorCompiler.sources()},collision:"Conservative stud-cell envelopes computed from LDraw body meshes; sub-stud interlocking and side connectors are not simulated.",prices:"Formula-based planning estimates, not seller quotes",rejected};
await fs.writeFile(path.join(root,"public/parts/attribution.json"),JSON.stringify(attribution,null,2)+"\n");
console.log(JSON.stringify({supported:Object.keys(parts).length,rejected:rejected.length,reasons:rejected.reduce((m,r)=>(m[r.reason]=(m[r.reason]||0)+1,m),{})}));
