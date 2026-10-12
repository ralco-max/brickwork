// Compile only ordinary upright stud/anti-stud connections from the official
// LDCad shadow library. Derived connector data is CC BY-SA 4.0, separately from
// application code. Never infer sockets from a part's rectangular bounds.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const I=[1,0,0,0,1,0,0,0,1],zero=[0,0,0];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const mv=(m,v)=>[dot(m.slice(0,3),v),dot(m.slice(3,6),v),dot(m.slice(6,9),v)];
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const norm=v=>Math.hypot(...v),near=(a,b)=>Math.abs(a-b)<1e-5;
const numbers=s=>s.trim().split(/\s+/).map(Number);
function parameters(line){return Object.fromEntries([...line.matchAll(/\[([^=\]]+)=([^\]]*)\]/g)].map(m=>[m[1].toLowerCase(),m[2].trim()]));}
function grids(text){
 if(!text)return [zero];const t=text.split(/\s+/);let n=0;
 const count=()=>{const centered=t[n]?.toUpperCase()==="C";if(centered)n++;const value=Number(t[n++]);return {centered,value};};
 const x=count(),z=count(),dx=Number(t[n++]),dz=Number(t[n++]);
 if(!Number.isInteger(x.value)||!Number.isInteger(z.value)||x.value<1||z.value<1||x.value*z.value>4096||![dx,dz].every(Number.isFinite))throw Error(`Invalid shadow grid: ${text}`);
 return Array.from({length:x.value*z.value},(_,i)=>[(i% x.value-(x.centered?(x.value-1)/2:0))*dx,0,(Math.floor(i/x.value)-(z.centered?(z.value-1)/2:0))*dz]);
}
function transformed(c,m,pos){
 const x=mv(m,c.bx),y=mv(m,c.by),z=mv(m,c.bz),sx=norm(x),sy=norm(y),sz=norm(z);
 if(Math.min(sx,sy,sz)<1e-8)return null;
 if(Math.abs(dot(x,y)/(sx*sy))>1e-5||Math.abs(dot(x,z)/(sx*sz))>1e-5||Math.abs(dot(z,y)/(sz*sy))>1e-5)return null;
 const radiusScaled=!near(sx,1)||!near(sz,1),heightScaled=!near(sy,1),policy=c.scale.toLowerCase();
 if(radiusScaled&&(!near(sx,sz)||!["ronly","yandr"].includes(policy)))return null;
 if(heightScaled&&!["yonly","yandr"].includes(policy))return null;
 const det=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
 if(det<0&&c.mirror==="none")return null;
 return {...c,pos:plus(mv(m,c.pos),pos),bx:x.map(v=>v/sx),by:y.map(v=>v/sy),bz:z.map(v=>v/sz),radius:c.radius*sx,length:c.length*sy};
}
export function createConnectorCompiler(sourceDir,shadowDir){
 const cache=new Map(),sourceCache=new Map(),used=new Map();
 function resolve(name,root){
  name=name.replaceAll("\\","/").toLowerCase();if(name.includes("..")||path.isAbsolute(name))throw Error("Invalid LDraw reference");
  for(const relative of ["parts/"+name,"p/"+name,name]){const filename=path.join(root,relative);if(fs.existsSync(filename)&&fs.statSync(filename).isFile())return {filename,relative};}
  return null;
 }
 function read(file){if(!sourceCache.has(file))sourceCache.set(file,fs.readFileSync(file,"utf8"));return sourceCache.get(file);}
 function load(name,stack=[],shadowOnly=false){
  const key=(shadowOnly?"shadow:":"")+name.toLowerCase();if(cache.has(key))return cache.get(key);
  if(stack.includes(key)||stack.length>64)throw Error(`Cyclic shadow reference: ${name}`);
  const source=resolve(name,sourceDir),shadow=resolve(name,shadowDir);if(!source&&!shadow)return [];
  let result=[];const next=[...stack,key];
  if(source&&!shadowOnly){
   for(const line of read(source.filename).split(/\r?\n/)){
    const t=line.trim().split(/\s+/);if(t[0]!=="1"||t.length<15)continue;
    const values=t.slice(2,14).map(Number);if(!values.every(Number.isFinite))throw Error(`Invalid LDraw transform: ${name}`);
    const [a,b,c,...m]=values;
    for(const child of load(t.slice(14).join(" "),next)){const v=transformed(child,m,[a,b,c]);if(v)result.push(v);}
   }
  }
  if(shadow){
   const text=read(shadow.filename);used.set(shadow.relative,{file:shadow.relative,sha256:createHash("sha256").update(text).digest("hex")});
   for(const line of text.split(/\r?\n/)){
    const match=line.match(/^0\s+!LDCAD\s+(SNAP_\w+)\s*(.*)$/i);if(!match)continue;
    const kind=match[1].toUpperCase(),p=parameters(match[2]);
    if(kind==="SNAP_CLEAR"){result=p.id?result.filter(c=>c.id!==p.id):[];continue;}
    if(!["SNAP_CYL","SNAP_INCL"].includes(kind))continue;
    const pos=p.pos?numbers(p.pos):zero,ori=p.ori?numbers(p.ori):I;
    if(pos.length!==3||ori.length!==9||![...pos,...ori].every(Number.isFinite))throw Error(`Invalid shadow transform: ${name}`);
    if(kind==="SNAP_INCL"){
     if(!p.ref)throw Error(`Missing shadow include: ${name}`);
     const scale=p.scale?numbers(p.scale):[1,1,1];if(scale.length!==3||!scale.every(Number.isFinite))throw Error(`Invalid include scale: ${name}`);
     const m=ori.map((v,i)=>v*scale[i%3]);
     // Include the referenced shadow metas, not that part's geometry inheritance.
     for(const g of grids(p.grid))for(const child of load(p.ref,next,true)){const v=transformed(child,m,plus(pos,mv(ori,g)));if(v)result.push({...v,...(p.id?{id:p.id}:{})});}
     continue;
    }
    const sections=(p.secs||"").split(/\s+/),gender=(p.gender||"M").toUpperCase();
    // 6141's authoritative replacement snap combines its round plate body and
    // its ordinary top stud in one cylinder. Extract only the documented stud
    // section, at the end of the 3 LDU body section, not the slideable body.
    const compoundStud=gender==="M"&&sections.join(" ")==="R 10 3 R 6 4"&&(p.caps||"").toLowerCase()==="none"&&p.slide==="true";
    if(sections.length!==3&&!compoundStud)continue;
    const radius=compoundStud?6:Number(sections[1]),length=compoundStud?4:Number(sections[2]);
    if(!["R","S"].includes(sections[0])||![radius,length].every(Number.isFinite)||p.group||p.center==="true"||p.slide==="true"&&!compoundStud)continue;
    const caps=compoundStud?"one":(p.caps||"one").toLowerCase();
    if(gender==="M"&&(!near(radius,6)||!near(length,4)||!["one","a"].includes(caps)||sections[0]!=="R"))continue;
    if(gender==="F"&&(!near(radius,6)||length<4||!["one","b"].includes(caps)))continue;
    if(!["M","F"].includes(gender))continue;
    const base={id:p.id,gender,pos:zero,bx:[1,0,0],by:[0,1,0],bz:[0,0,1],radius,length,scale:p.scale||"none",mirror:p.mirror||"cor",source:shadow.relative};
    for(const g of grids(p.grid)){const location=plus(g,compoundStud?[0,-3,0]:zero),v=transformed(base,ori,plus(pos,mv(ori,location)));if(v)result.push(v);}
   }
  }
  cache.set(key,result);return result;
 }
 return {
  load(part){
   const entries=load(part.endsWith(".dat")?part:part+".dat");
   // Upright ordinary studs/anti-studs only. Side studs, pins, bars, axles and
   // half-stud/off-grid connections remain outside this builder's contract.
   return entries.filter(c=>near(c.radius,6)&&near(c.by[0],0)&&near(c.by[1],1)&&near(c.by[2],0)).map(c=>({gender:c.gender,position:c.pos,source:c.source}));
  },
  sources(){return [...used.values()].sort((a,b)=>a.file.localeCompare(b.file));}
 };
}
