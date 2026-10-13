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
if(!sourceDir||!shadowDir)throw Error("Usage: node scripts/compile-part-catalog.mjs --ldraw /path/ldraw --shadow /path/LDCadShadowLibrary [--shadow-commit sha]");
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
// Glass and doors have no studs: they clip or hinge into their frame, so each is compiled as
// the frame's fitted element, never as a part of its own. Its placement comes from an official
// LDraw shortcut (60592c01 is 60592 with 60601), or from the matching finger snaps that both
// shadow files document for a hinge (a door's 132 LDU knuckle in the frame's 2/132/2 slot).
const identity=[1,0,0,0,1,0,0,0,1];
async function fittedPlacement(frame,fitted){
 const line=l=>{const t=l.trim().split(/\s+/);return t[0]==="1"&&t.length>=15?{file:t.slice(14).join(" ").toLowerCase(),position:t.slice(2,5).map(Number),matrix:t.slice(5,14).map(Number)}:null;};
 if(fitted.shortcut){
  // Loaded like a part so the shortcut's own header, licence and hash join the provenance manifest.
  const shortcut=await loadLDrawPart(sourceDir,fitted.shortcut),refs=shortcut.dependencies.get(`${fitted.shortcut}.dat`).split(/\r?\n/).map(line).filter(Boolean);
  for(const s of shortcut.sources)sources.set(s.path,s);
  const host=refs.find(r=>r.file===`${frame}.dat`),insert=refs.find(r=>r.file===`${fitted.id}.dat`);
  if(refs.length!==2||!host||!insert||host.position.some(Boolean)||host.matrix.some((v,i)=>v!==identity[i]))throw Error(`Shortcut ${fitted.shortcut} does not place ${fitted.id} in ${frame}`);
  return {position:insert.position,matrix:insert.matrix,source:`LDraw ${fitted.shortcut}.dat`};
 }
 const snaps=async id=>(await fs.readFile(path.join(shadowDir,"parts",`${id}.dat`),"utf8")).split(/\r?\n/).filter(l=>/SNAP_FGR/i.test(l)&&l.includes(`[group=${fitted.hinge}]`)&&!/\[ori=/i.test(l)).map(l=>({pos:l.match(/\[pos=([^\]]+)\]/)[1].trim().split(/\s+/).map(Number),seq:l.match(/\[seq=([^\]]+)\]/)[1].trim().split(/\s+/).map(Number)}));
 const slots=(await snaps(frame)).filter(s=>s.seq.length===3),[knuckle]=await snaps(fitted.id);
 // The hinge on the left (lowest x) of the frame, so the door opens like the LDraw reference.
 const slot=slots.sort((a,b)=>a.pos[0]-b.pos[0]||a.pos[2]-b.pos[2])[0];
 if(!slot||!knuckle||knuckle.seq.length!==1||slot.seq[1]!==knuckle.seq[0])throw Error(`No documented ${fitted.hinge} hinge joins ${fitted.id} to ${frame}`);
 return {position:slot.pos.map((v,i)=>snap(v-knuckle.pos[i])),matrix:identity,source:`LDCad shadow SNAP_FGR [group=${fitted.hinge}] ${frame} (${slot.pos.join(" ")}) with ${fitted.id} (${knuckle.pos.join(" ")})`};
}
const transformRaw=(raw,{position:p,matrix:m})=>({...raw,triangles:raw.triangles.map(t=>({...t,vertices:t.vertices.map(([x,y,z])=>[m[0]*x+m[1]*y+m[2]*z+p[0],m[3]*x+m[4]*y+m[5]*z+p[1],m[6]*x+m[7]*y+m[8]*z+p[2]].map(snap))}))});
for(const candidate of selection.parts){
 if(candidate.legacy||choice.length&&!choice.includes(candidate.id))continue;if(Object.keys(parts).length>=limit)break;
 try{
  const raw=await loadLDrawPart(sourceDir,candidate.id),connectors=connectorCompiler.load(candidate.id),female=connectors.filter(c=>c.gender==="F");
  if(!female.length)throw Error("No documented upright anti-stud sockets");
  // A stud drawn inline instead of with a stud primitive (the notched outer studs of 60594
  // and 60596) is still a documented stud: geometry inside its cylinder is not body.
  const male=connectors.filter(c=>c.gender==="M"),inStud=v=>male.some(c=>Math.hypot(v[0]-c.position[0],v[2]-c.position[2])<=6+latticeTolerance&&v[1]>=c.position[1]-4-latticeTolerance&&v[1]<=c.position[1]+latticeTolerance);
  for(const t of raw.triangles)if(!t.stud&&t.vertices.every(inStud))t.stud=true;
  raw.bodyBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const t of raw.triangles)if(!t.stud)for(const v of t.vertices)for(let i=0;i<3;i++){raw.bodyBounds.min[i]=Math.min(raw.bodyBounds.min[i],v[i]);raw.bodyBounds.max[i]=Math.max(raw.bodyBounds.max[i],v[i]);}
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
  const fit=candidate.fitted&&selection.parts.find(p=>p.id===candidate.fitted.id);
  if(candidate.fitted&&(!fit||!fit.colors.includes(candidate.fitted.default)))throw Error(`Fitted element ${candidate.fitted.id} needs a curated candidate offered in its default colour`);
  const placement=fit&&await fittedPlacement(candidate.id,candidate.fitted),fittedSource=fit&&await loadLDrawPart(sourceDir,fit.id),fittedRaw=fit&&transformRaw(fittedSource,placement);
  const outside=v=>v[0]<minX-latticeTolerance||v[0]>minX+w*20+latticeTolerance||v[1]>maxY+latticeTolerance||v[1]<maxY-h*8-latticeTolerance||v[2]<minZ-latticeTolerance||v[2]>minZ+d*20+latticeTolerance;
  if(fittedRaw&&fittedRaw.triangles.some(t=>!t.stud&&t.vertices.some(outside)))throw Error(`Fitted ${fit.id} extends outside its frame`);
  // A closed door or fitted glass fills the opening, so the frame's cells include it.
  const occupancy=occupiedCells(fittedRaw?{triangles:[...raw.triangles,...fittedRaw.triangles]}:raw,{w,d,h,origin});if(!occupancy.length)throw Error("Empty occupied-cell mask");
  const occupied=new Set(occupancy.map(p=>p.join(",")));
  if(bottomSockets.some(([x,y,z])=>!occupied.has(`${x},${y},${z}`)))throw Error("Socket has no body cell above its interface");
  if(topStuds.some(([x,y,z])=>!occupied.has(`${x},${y-1},${z}`)))throw Error("Stud has no body cell below its interface");
  const mesh=await compileLDrawMesh(raw,{w,d,h,bodyOrigin:origin});
  await fs.writeFile(path.join(out,`${candidate.id}.json`),JSON.stringify(mesh)+"\n");
  await fs.writeFile(path.join(out,`${candidate.id}.svg`),meshThumbnail(mesh));
  const price=Math.round(Math.max(.08,.065+(w*d*h)*.013)*100)/100;
  let fitted;
  if(fit){
   // Compiled in the frame's placement box, so it renders, rotates and exports with the frame.
   const id=`${candidate.id}-${fit.id}`,line=[...placement.position,...placement.matrix].join(" ");
   const wrapper={id,dependencies:new Map([[`${id}.dat`,`0 ${fit.name} fitted in ${candidate.name}\n0 Name: ${id}.dat\n1 16 ${line} ${fit.id}.dat\n`],...fittedSource.dependencies])};
   const fittedMesh={...await compileLDrawMesh(wrapper,{w,d,h,bodyOrigin:origin}),part:fit.id};
   await fs.writeFile(path.join(out,`${id}.json`),JSON.stringify(fittedMesh)+"\n");
   await fs.writeFile(path.join(out,`${fit.id}.svg`),meshThumbnail(fittedMesh));
   fitted={part:fit.id,name:fit.name,colors:fit.colors,default:candidate.fitted.default,price,ldraw:{position:placement.position,matrix:placement.matrix},placement:placement.source,mesh:`/parts/ldraw/${id}.json`,thumbnail:`/parts/ldraw/${fit.id}.svg`,sourcePart:fit.rebrickableId};
   for(const s of fittedSource.sources)sources.set(s.path,s);
  }
  parts[candidate.id]={name:candidate.name,w,d,h,price,family:candidate.family,colors:candidate.colors,...(candidate.handedness?{handedness:candidate.handedness}:{}),...(candidate.counterpart?{counterpart:candidate.counterpart}:{}),topStuds,bottomSockets,occupancy,ldrawOffset:origin.map(n=>-n||0),mesh:`/parts/ldraw/${candidate.id}.json`,thumbnail:`/parts/ldraw/${candidate.id}.svg`,sourcePart:candidate.rebrickableId,...(fitted?{fitted}:{})};
  for(const s of raw.sources)sources.set(s.path,s);
  if(Object.keys(parts).length%25===0)console.log(`Compiled ${Object.keys(parts).length} supported parts`);
 }catch(error){const hosts=selection.parts.filter(p=>p.fitted?.id===candidate.id).map(p=>p.id);rejected.push({id:candidate.id,reason:error.message,...(hosts.length?{fittedIn:hosts}:{})});}
}
if(choice.length){console.log({compiled:Object.keys(parts),rejected});}
// Colour availability beyond the classic palette is owned by refresh-part-colors.mjs; carry it over.
const previous=JSON.parse(await fs.readFile(path.join(root,"lib/data/parts-catalog.json"),"utf8").catch(()=>"{}"));
const output={version:1,updatedAt:"2026-10-11",geometrySource:"https://www.ldraw.org/",connectionSource:"https://github.com/RolandMelkert/LDCadShadowLibrary",...(previous.colorEvidence?{colorEvidence:previous.colorEvidence,legacyColors:previous.legacyColors}:{}),parts};
await fs.writeFile(path.join(root,"lib/data/parts-catalog.json"),JSON.stringify(output)+"\n");
await fs.writeFile(path.join(root,"public/parts/catalog.json"),JSON.stringify({...output,license:"CC BY-SA 4.0",attribution:"LDraw Parts Library and LDCad Shadow Library contributors; modifications by Bricks"})+"\n");
await fs.mkdir(path.join(root,"public/licenses/ldcad"),{recursive:true});await fs.copyFile(path.join(shadowDir,"LICENSE.md"),path.join(root,"public/licenses/ldcad/LICENSE.md"));
// A per-file mirror (scripts/fetch-part-sources.mjs) is not a checkout, so it names its pinned commit.
const shadowCommit=arg("--shadow-commit")||execFileSync("git",["rev-parse","HEAD"],{cwd:shadowDir,encoding:"utf8"}).trim();
const attribution={geometry:{...selection.sources.ldraw,files:[...sources.values()].sort((a,b)=>a.path.localeCompare(b.path))},connections:{url:output.connectionSource,commit:shadowCommit,license:"CC BY-SA 4.0",attribution:"LDCad Shadow Library contributors",modifications:"Filtered to upright System stud/anti-stud connectors, transformed to the application's whole-stud and plate grid.",files:connectorCompiler.sources()},collision:"Conservative stud-cell envelopes computed from LDraw body meshes; sub-stud interlocking and side connectors are not simulated.",fitted:"Glass and doors that clip or hinge into a frame are compiled with it: placed as the frame's LDraw shortcut places them, or where the LDCad finger snaps of both shadow files meet, and counted in the frame's collision cells. A door's stud handle stands 2.75 LDU proud of its frame and is drawn, not collided.",prices:"Formula-based planning estimates, not seller quotes",rejected};
await fs.writeFile(path.join(root,"public/parts/attribution.json"),JSON.stringify(attribution,null,2)+"\n");
console.log(JSON.stringify({supported:Object.keys(parts).length,rejected:rejected.length,reasons:rejected.reduce((m,r)=>(m[r.reason]=(m[r.reason]||0)+1,m),{})}));
