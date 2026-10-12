// Compile the classic LEGO minifigure from unmodified LDraw sources: one mesh per
// element in its own LDraw frame, plus the standard LDraw assembly transforms
// (973c01 torso/arms/hands shortcut, 3815c01 hips/legs offsets, head at y=-24).
// Sources are fetched from the pinned LDraw mirror, or read from --ldraw /path/ldraw.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {loadLDrawPart,compileLDrawMesh} from "./ldraw-geometry.mjs";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
const arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const COMMIT="0eda020f43fe3af7d45444580dd56a9ce0c716ab",MIRROR=`https://raw.githubusercontent.com/kulits/ldraw-parts/${COMMIT}/ldraw/`;
const local=arg("--ldraw"),cache=local||arg("--cache",path.join(root,"node_modules/.cache/ldraw-minifig"));
// Region decides the color: skin (head, hands), torso (torso, arms), legs (hips, legs).
// position/matrix are the LDraw type-1 placement in the minifig frame (torso origin, y down).
const I=[1,0,0,0,1,0,0,0,1];
export const ASSEMBLY=[
 {id:"3626c",name:"Minifig Head with Hollow Stud",region:"skin",position:[0,-24,0],matrix:I},
 {id:"973",name:"Minifig Torso",region:"torso",position:[0,0,0],matrix:I},
 {id:"3818",name:"Minifig Arm Right",region:"torso",position:[-15.552,9,0],matrix:[.985,-.17,0,.17,.985,0,0,0,1]},
 {id:"3819",name:"Minifig Arm Left",region:"torso",position:[15.552,9,0],matrix:[.985,.17,0,-.17,.985,0,0,0,1]},
 {id:"3820",name:"Minifig Hand",region:"skin",position:[-23.6904,26.774,-9.8982],matrix:[.985,-.1202,.1202,.17,.6964,-.6964,0,.707,.707]},
 {id:"3820",name:"Minifig Hand",region:"skin",position:[23.6904,26.774,-9.8982],matrix:[.985,.1202,-.1202,-.17,.6964,-.6964,0,.707,.707]},
 {id:"3815b",name:"Minifig Hips",region:"legs",position:[0,32,0],matrix:I},
 {id:"3816c",name:"Minifig Leg Right",region:"legs",position:[0,44,0],matrix:I},
 {id:"3817c",name:"Minifig Leg Left",region:"legs",position:[0,44,0],matrix:I},
];
async function fetchSource(name){
 const file=name.replaceAll("\\","/").toLowerCase();
 if(file.startsWith("/")||file.split("/").includes(".."))throw Error(`Unsafe LDraw reference: ${name}`);
 for(const dir of ["parts","p"]){
  const target=path.join(cache,dir,file);
  try{return await fs.readFile(target,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
  if(local)continue;
  const response=await fetch(`${MIRROR}${dir}/${file}`);if(response.status===404)continue;if(!response.ok)throw Error(`LDraw mirror returned ${response.status} for ${dir}/${file}`);
  const text=await response.text();await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);return text;
 }
 throw Error(`Missing LDraw source ${name}`);
}
// Fetch every referenced subfile and primitive so the offline loader sees a complete library.
async function gather(name,seen=new Set()){
 const key=name.replaceAll("\\","/").toLowerCase();if(seen.has(key))return;seen.add(key);
 const text=await fetchSource(key);
 for(const line of text.split(/\r?\n/)){const tokens=line.trim().split(/\s+/);if(tokens[0]==="1"&&tokens.length>=15)await gather(tokens.slice(14).join(" "),seen);}
}
const ids=[...new Set(ASSEMBLY.map(a=>a.id))],out=path.join(root,"public/parts/minifig"),sources=new Map(),meshes={};
await fs.mkdir(out,{recursive:true});
const round=n=>Math.round(n*1e4)/1e4||0;
for(const id of ids){
 await gather(`${id}.dat`);
 const raw=await loadLDrawPart(cache,id);for(const s of raw.sources)sources.set(s.path,s);
 // w=d=h=0 and a zero origin keep the element in its own LDraw frame: world = (x, -y, z) / 20.
 const {groups:_groups,...mesh}=await compileLDrawMesh(raw,{w:0,d:0,h:0,bodyOrigin:[0,0,0]});
 await fs.writeFile(path.join(out,`${id}.json`),JSON.stringify(mesh)+"\n");
 meshes[id]={description:raw.description,bounds:{min:raw.fullBounds.min.map(round),max:raw.fullBounds.max.map(round)},vertices:mesh.positions.length/3,triangles:mesh.indices.length/3};
}
// The assembled envelope in the minifig frame (LDU, y down), from the actual transformed vertices.
const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},positions={};
for(const id of ids)positions[id]=JSON.parse(await fs.readFile(path.join(out,`${id}.json`),"utf8")).positions;
for(const a of ASSEMBLY){const v=positions[a.id],m=a.matrix;for(let i=0;i<v.length;i+=3){const x=v[i]*20,y=-v[i+1]*20,z=v[i+2]*20,p=[0,1,2].map(r=>m[r*3]*x+m[r*3+1]*y+m[r*3+2]*z+a.position[r]);for(let k=0;k<3;k++){box.min[k]=Math.min(box.min[k],p[k]);box.max[k]=Math.max(box.max[k],p[k]);}}}
// The leg anti-stud holes sit at x=±10 and z=-1.25 (3816c: "Move at z=1.25 relative to stud grid"),
// 28 LDU below the leg origin. That point fixes the figure on the stud grid.
// The body is 12 plates (4 bricks) from sole to the top of the head; the head stud stands above
// it like any stud, so it is not counted as an occupied layer.
const feet=44+28,anchor=[-20,feet,-11.25],h=Math.floor((feet-box.min[1])/8);
const manifest={version:1,source:{mirror:"https://github.com/kulits/ldraw-parts",commit:COMMIT,license:"CC BY 4.0 (LDraw Parts Library)",attribution:"This software uses the LDraw Parts Library."},
 footprint:{w:2,d:1,h},anchor,front:[0,0,-1],sockets:[[-10,feet,-1.25],[10,feet,-1.25]],envelope:{min:box.min.map(round),max:box.max.map(round)},
 parts:ASSEMBLY.map(({id,name,region,position,matrix})=>({id,name,region,position,matrix,mesh:`/parts/minifig/${id}.json`})),meshes};
await fs.writeFile(path.join(root,"lib/data/minifig.json"),JSON.stringify(manifest)+"\n");
await fs.writeFile(path.join(out,"attribution.json"),JSON.stringify({geometry:{url:"https://library.ldraw.org/library/updates/complete.zip",mirror:manifest.source.mirror,commit:COMMIT,attribution:manifest.source.attribution,modifications:"Converted to indexed triangle meshes in world units (1 unit = 20 LDU, y up) by Bricks; assembly offsets follow LDraw shortcuts 973c01 and 3815c01.",files:[...sources.values()].sort((a,b)=>a.path.localeCompare(b.path))}},null,2)+"\n");
console.log(JSON.stringify({parts:ids.length,files:sources.size,height:h,envelope:manifest.envelope}));
