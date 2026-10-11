// Refresh the small subset of Rebrickable's public element catalog used by Brickwork.
// No API key and no per-user requests are needed. This is not a stock/price feed.
import {build} from "esbuild";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
const sourceDir=option("--source-dir"),updatedAt=option("--date")||new Date().toISOString().slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt))throw Error("Use an ISO date with --date.");
const bundle=await build({stdin:{contents:'export {PARTS,COLORS,WHEELS} from "./lib/bridge";',resolveDir:root,loader:"ts"},bundle:true,platform:"node",format:"esm",write:false});
const {PARTS,COLORS,WHEELS}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// A full CSV parser is necessary: source descriptions can contain quoted commas.
function csv(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===","&&!quoted){row.push(field);field="";}
  else if(c==="\n"&&!quoted){row.push(field.replace(/\r$/,""));if(row.some(Boolean))rows.push(row);row=[];field="";}
  else field+=c;
 }
 if(quoted)throw Error("Incomplete source CSV.");
 if(field||row.length){row.push(field.replace(/\r$/,""));rows.push(row);}
 const headers=rows.shift();if(!headers)throw Error("Empty source CSV.");
 return rows.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]||""])));
}
const sources=[];
async function download(name){
 const url=`https://cdn.rebrickable.com/media/downloads/${name}.csv.gz`;
 const raw=sourceDir?await readFile(path.resolve(sourceDir,`${name}.csv`)):await (async()=>{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Catalog download failed: ${name} (${response.status})`);return gunzipSync(Buffer.from(await response.arrayBuffer()));})();
 sources.push({url,sha256:createHash("sha256").update(raw).digest("hex")});return csv(raw.toString("utf8"));
}
const [elements,colors,parts]=await Promise.all([download("elements"),download("colors"),download("parts")]);
if(!elements.length||!Object.hasOwn(elements[0],"element_id")||!Object.hasOwn(elements[0],"design_id"))throw Error("The upstream element schema changed.");
// This alias is evidenced by elements.design_id=3040 and parts.part_num=3040b.
const aliases={"3040":"3040b"};
for(const [key,color] of Object.entries(COLORS)){
 const actual=colors.find(row=>row.id===String(color.ldraw));
 if(!actual||actual.is_trans!=="False"||actual.name.toLowerCase()!==color.name.toLowerCase())throw Error(`Verify the source color mapping for ${key} before refreshing.`);
}
const catalog={},missing=[];
for(const part of Object.keys(PARTS).sort()){
 if(Object.hasOwn(WHEELS,part))continue; // App wheels include a tire; catalog numbers identify the rim only.
 const sourcePart=aliases[part]||part;
 if(!parts.some(row=>row.part_num===sourcePart))throw Error(`Unknown source part ${sourcePart}.`);
 for(const [colorKey,color] of Object.entries(COLORS)){
  const rows=elements.filter(row=>row.part_num===sourcePart&&row.color_id===String(color.ldraw)&&/^\d{6,8}$/.test(row.element_id));
  if(aliases[part]&&!elements.some(row=>row.part_num===sourcePart&&row.design_id===part))throw Error(`Verify the design alias for ${part}.`);
  const ids=[...new Set(rows.map(row=>row.element_id))].sort((a,b)=>Number(b)-Number(a));
  if(ids.length)catalog[`${part}:${colorKey}`]=ids;else missing.push(`${part}:${colorKey}`);
 }
}
const output={version:1,updatedAt,sourceUrl:"https://rebrickable.com/downloads/",attribution:"LEGO element catalog data from Rebrickable",selection:"Highest numeric catalog element ID for the exact part and color; other known IDs retained. This ordering is not a stock or release-date claim.",sources:sources.sort((a,b)=>a.url.localeCompare(b.url)),partAliases:aliases,assemblyParts:Object.keys(WHEELS),missing,elements:catalog};
await mkdir(path.join(root,"lib/data"),{recursive:true});
await writeFile(path.join(root,"lib/data/lego-elements.json"),JSON.stringify(output,null,2)+"\n");
console.log(`Saved ${Object.keys(catalog).length} exact part/color matches; ${missing.length} absent combinations; ${Object.keys(WHEELS).length} wheel assemblies need separate components.`);
