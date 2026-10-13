// Mirror exactly the pinned LDraw and LDCad shadow files the catalog compiler reads,
// one file at a time, for environments where the archives cannot be downloaded.
// Every referenced subfile and primitive is fetched, plus each one's shadow file and
// the shadow-only files their SNAP_INCL metas name, so no connector is silently lost.
//   node scripts/fetch-part-sources.mjs --out /tmp/part-sources [--ids 60592,60601]
//   node scripts/compile-part-catalog.mjs --ldraw /tmp/part-sources/ldraw --shadow /tmp/part-sources/shadow --shadow-commit <commit>
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
const arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const out=arg("--out");if(!out)throw Error("Usage: node scripts/fetch-part-sources.mjs --out /path [--ids a,b]");
const selection=JSON.parse(await fs.readFile(path.join(root,"scripts/part-catalog-selection.json"),"utf8"));
const LDRAW=`https://raw.githubusercontent.com/kulits/ldraw-parts/${selection.sources.ldraw.commit}/ldraw/`;
const SHADOW_COMMIT="9b1131fb1991f8c0bfc072325e4e12f6271aba35",SHADOW=`https://raw.githubusercontent.com/RolandMelkert/LDCadShadowLibrary/${SHADOW_COMMIT}/`;
const ids=arg("--ids","").split(",").filter(Boolean),wanted=ids.length?ids:selection.parts.filter(p=>!p.legacy).map(p=>p.id);
// A frame's fitted glass or door, and the LDraw shortcut that places it, are read with the frame.
const extra=selection.parts.filter(p=>p.fitted&&(!ids.length||ids.includes(p.id))).flatMap(p=>[p.fitted.id,...(p.fitted.shortcut?[p.fitted.shortcut]:[])]),missing=[],fetched={ldraw:0,shadow:0};
const clean=name=>{const file=name.replaceAll("\\","/").toLowerCase();if(file.startsWith("/")||file.split("/").includes(".."))throw Error(`Unsafe LDraw reference: ${name}`);return file;};
let active=0;const waiting=[];
const slot=async()=>{if(active>=24)await new Promise(r=>waiting.push(r));active++;};
const release=()=>{active--;waiting.shift()?.();};
async function request(url){await slot();try{const response=await fetch(url);return {ok:response.ok,status:response.status,text:response.ok?await response.text():""};}catch{return {ok:false,status:0,text:""};}finally{release();}}
async function get(base,relative,dir){
 const target=path.join(out,dir,relative);
 try{return await fs.readFile(target,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
 for(let attempt=0;;attempt++){
  const response=await request(base+relative);
  if(response.status===404)return null;
  // The shadow repository checks .dat files out with CRLF (.gitattributes), which its recorded hashes cover.
  if(response.ok){const text=dir==="shadow"&&relative.endsWith(".dat")?response.text.replace(/\r?\n/g,"\r\n"):response.text;await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);fetched[dir]++;return text;}
  if(attempt>=3)throw Error(`${base+relative} returned ${response.status}`);await new Promise(r=>setTimeout(r,500*(attempt+1)));
 }
}
// The compiler resolves a name in the LDraw folder as <name>, parts/<name>, p/<name>,
// and in the shadow folder as parts/<name>, p/<name>, <name>.
const ldrawSeen=new Map(),shadowSeen=new Map();
function ldraw(name){
 const file=clean(name);if(ldrawSeen.has(file))return ldrawSeen.get(file);
 const job=(async()=>{
  let text=null;for(const relative of [`parts/${file}`,`p/${file}`]){text=await get(LDRAW,relative,"ldraw");if(text!==null)break;}
  if(text===null){missing.push(file);return;}
  const children=[];for(const line of text.split(/\r?\n/)){const t=line.trim().split(/\s+/);if(t[0]==="1"&&t.length>=15)children.push(t.slice(14).join(" "));}
  await Promise.all([shadow(file),...children.map(ldraw)]);
 })();
 ldrawSeen.set(file,job);return job;
}
function shadow(name){
 const file=clean(name);if(shadowSeen.has(file))return shadowSeen.get(file);
 const job=(async()=>{
  const texts=(await Promise.all([`parts/${file}`,`p/${file}`].map(relative=>get(SHADOW,relative,"shadow")))).filter(t=>t!==null);
  const refs=texts.flatMap(text=>[...text.matchAll(/^0\s+!LDCAD\s+SNAP_INCL\b.*\[ref=([^\]]+)\]/gim)].map(m=>m[1].trim()));
  await Promise.all(refs.map(shadow));
 })();
 shadowSeen.set(file,job);return job;
}
// Bounded concurrency: one part tree at a time per worker.
const queue=[...new Set([...wanted,...extra])];let cursor=0;
await Promise.all(Array.from({length:12},async()=>{while(cursor<queue.length)await ldraw(`${queue[cursor++]}.dat`);}));
await fs.mkdir(path.join(out,"shadow"),{recursive:true});
await get(SHADOW,"LICENSE.md","shadow");
await fs.writeFile(path.join(out,"SOURCES.json"),JSON.stringify({ldraw:{mirror:LDRAW},shadow:{mirror:SHADOW,commit:SHADOW_COMMIT},parts:queue.length,files:{ldraw:ldrawSeen.size,shadow:shadowSeen.size},missing},null,1)+"\n");
console.log(JSON.stringify({parts:queue.length,ldrawNames:ldrawSeen.size,shadowNames:shadowSeen.size,fetched,missing,shadowCommit:SHADOW_COMMIT}));
