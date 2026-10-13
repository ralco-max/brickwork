// Refresh which parts are offered in the palette colours added after the classic 13 (lib/colors.ts).
// Colours are joined on each colour's Rebrickable ID, never its LDraw code: Trans-Light Blue is
// Rebrickable 41 but LDraw 43, and Rebrickable 43 is a different colour (Trans-Very Lt Blue).
// A part is offered in a new colour only when that exact part number has an element ID or appears,
// not as a spare, in the inventory of a released set in that colour (never a Database Sets placeholder).
// Saved projects do not depend on this data to open, so a refresh may drop a pair. Classic colours stay with
// refresh-part-catalog-selection.py; LEGO element IDs stay with refresh-lego-elements.mjs.
//   node scripts/refresh-part-colors.mjs                    official cdn.rebrickable.com downloads
//   node scripts/refresh-part-colors.mjs --source-dir DIR   the same files, decompressed in DIR
//   node scripts/refresh-part-colors.mjs --from-local DIR   provisional offline snapshot (see docs/part-catalog-sources.md):
//     DIR/tidytuesday-2022/{colors,elements}.csv.gz and DIR/lego-oracle-0.1.2/package/dist/data/lego.sqlite
//   --check fails when an output would change; --dry-run prints the counts only; --date YYYY-MM-DD.
import {build} from "esbuild";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
const sourceDir=option("--source-dir"),localDir=option("--from-local"),check=args.includes("--check"),dryRun=args.includes("--dry-run");
const updatedAt=option("--date")||(localDir?"2026-10-13":new Date().toISOString().slice(0,10));
if(!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt))throw Error("Use an ISO date with --date.");
const bundle=await build({stdin:{contents:'export {PARTS,LEGACY_PARTS,WHEELS} from "./lib/bridge";export {COLORS,CLASSIC_COLORS} from "./lib/colors";export {EXPANDED_PARTS} from "./lib/part-catalog";',resolveDir:root,loader:"ts"},bundle:true,platform:"node",format:"esm",write:false,logLevel:"error"});
const {PARTS,LEGACY_PARTS,COLORS,CLASSIC_COLORS,EXPANDED_PARTS}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// A full CSV parser is necessary: source names can contain quoted commas.
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
const files=[],sha=raw=>createHash("sha256").update(raw).digest("hex");
async function official(name){
 const url=`https://cdn.rebrickable.com/media/downloads/${name}.csv.gz`;
 const raw=sourceDir?await readFile(path.resolve(sourceDir,`${name}.csv`)):await (async()=>{const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`Catalog download failed: ${name} (${response.status})`);return gunzipSync(Buffer.from(await response.arrayBuffer()));})();
 files.push({url,sha256:sha(raw)});return csv(raw.toString("utf8"));
}
async function local(file,url){const raw=await readFile(path.join(localDir,file));files.push({url,file,sha256:sha(raw)});return raw;}

// Every app part except the assembled minifigure, by the exact source part number it is made as.
const aliases={"3040":"3040b"},sourceOf=id=>EXPANDED_PARTS[id]?.sourcePart??aliases[id]??id;
const appParts=Object.keys(PARTS).filter(id=>id!=="minifig").sort();
const selectionPath=path.join(root,"scripts/part-catalog-selection.json"),catalogPath=path.join(root,"lib/data/parts-catalog.json"),publicPath=path.join(root,"public/parts/catalog.json"),evidencePath=path.join(root,"scripts/part-color-evidence.json");
const selection=JSON.parse(await readFile(selectionPath,"utf8"));
const palette=Object.keys(COLORS),added=palette.filter(k=>!CLASSIC_COLORS.includes(k));
// Curated candidates not yet compiled are covered too, so compiling one later keeps its colours.
const wanted=new Set([...appParts.map(sourceOf),...selection.parts.map(p=>p.rebrickableId)]),rbIds=new Set(palette.map(k=>COLORS[k].rebrickable));
const evidence=new Map(),bump=(part,color,elements,sets,year)=>{const k=`${part}:${color}`,v=evidence.get(k)||[0,0,0];v[0]+=elements;v[1]+=sets;v[2]=Math.max(v[2],year||0);evidence.set(k,v);};
let colors,source,provisional,note;
const isTrans=v=>/^(t|true)$/i.test(v);
// Rebrickable's Database Sets theme holds placeholder inventories, such as DATABASE-2012 "Unused Parts Database Set"
// (parts LEGO catalogued that year but never shipped) and the *-DBASE-* print variants, so they are never evidence.
const placeholderSet=(set,theme)=>/^DATABASE-|DBASE/i.test(set)||theme==="Database Sets";
// Element IDs, then non-spare set inventories: a combination counts its real sets only. placeholderOnly lists the
// combinations that only placeholder inventories mention, so a reviewer can see what was left out and why.
const elementIds=new Map(),seen=new Map(),placeholderOnly=new Set();
const element=r=>{if(wanted.has(r.part_num)&&rbIds.has(Number(r.color_id))&&/^\d{6,8}$/.test(r.element_id)){const k=`${r.part_num}|${r.color_id}`;if(!elementIds.has(k))elementIds.set(k,new Set());elementIds.get(k).add(r.element_id);}};
const inventory=(part,color,set,year,theme)=>{const k=`${part}|${color}`;if(!seen.has(k))seen.set(k,new Map());if(!placeholderSet(set,theme))seen.get(k).set(set,Number(year)||0);};
const tally=()=>{
 for(const [k,ids] of elementIds){const [part,color]=k.split("|");bump(part,Number(color),ids.size,0,0);}
 for(const [k,sets] of seen){const [part,color]=k.split("|");if(sets.size)bump(part,Number(color),0,sets.size,Math.max(...sets.values()));else if(!elementIds.has(k))placeholderOnly.add(`${part}:${color}`);}
};
if(localDir){
 source="rebrickable-2022-elements+2026-inventories";provisional=true;
 note="Offline substitute for the official downloads, which were unreachable: Rebrickable elements as mirrored by TidyTuesday on 2022-09-06, and non-spare set inventories from the Rebrickable snapshot bundled in the lego-oracle 0.1.2 npm package (sets to 2026), leaving out the Database Sets placeholders. Calibrated on the classic colours, this finds about 93% of the official combinations with about 1% extra. Rerun without --from-local to replace it with official data.";
 const tt="https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2022/2022-09-06/";
 colors=csv(gunzipSync(await local("tidytuesday-2022/colors.csv.gz",tt+"colors.csv.gz")).toString("utf8"));
 for(const r of csv(gunzipSync(await local("tidytuesday-2022/elements.csv.gz",tt+"elements.csv.gz")).toString("utf8")))element(r);
 const dbFile="lego-oracle-0.1.2/package/dist/data/lego.sqlite";await local(dbFile,"https://registry.npmjs.org/lego-oracle/-/lego-oracle-0.1.2.tgz");
 const {DatabaseSync}=await import("node:sqlite"),db=new DatabaseSync(path.join(localDir,dbFile),{readOnly:true});
 // This snapshot's is_trans flags are all 0, so transparency is checked against the 2022 colour table only.
 for(const r of db.prepare("select id,name from colors").all()){const c=colors.find(x=>Number(x.id)===r.id);if(c&&rbIds.has(r.id)&&c.name!==r.name)throw Error(`The two snapshots disagree on Rebrickable colour ${r.id}.`);}
 const parts=[...wanted],colorList=[...rbIds];
 const rows=db.prepare(`select distinct ip.part_num part,ip.color_id color,i.set_num set_num,coalesce(s.year,0) year,t.name theme from inventory_parts ip join inventories i on i.id=ip.inventory_id left join sets s on s.set_num=i.set_num left join themes t on t.id=s.theme_id where ip.is_spare=0 and ip.part_num in (${parts.map(()=>"?").join(",")}) and ip.color_id in (${colorList.map(()=>"?").join(",")})`).all(...parts,...colorList);
 for(const r of rows)inventory(r.part,r.color,r.set_num,r.year,r.theme);db.close();
}else{
 source="rebrickable-elements+inventories";provisional=false;note="Rebrickable catalog downloads: element IDs and non-spare set inventories, leaving out the Database Sets placeholders.";
 const [colorRows,elements,inventoryParts,inventories,sets,themes]=await Promise.all(["colors","elements","inventory_parts","inventories","sets","themes"].map(official));colors=colorRows;
 for(const r of elements)element(r);
 const setOf=new Map(inventories.map(r=>[r.id,r.set_num])),themeOf=new Map(themes.map(r=>[r.id,r.name])),setInfo=new Map(sets.map(r=>[r.set_num,{year:Number(r.year)||0,theme:themeOf.get(r.theme_id)}]));
 for(const r of inventoryParts)if(!isTrans(r.is_spare)&&wanted.has(r.part_num)&&rbIds.has(Number(r.color_id))){const set=setOf.get(r.inventory_id);if(set)inventory(r.part_num,r.color_id,set,setInfo.get(set)?.year,setInfo.get(set)?.theme);}
}
tally();
// The palette must match the source colour table by Rebrickable ID: name and transparency.
for(const key of palette){
 const c=COLORS[key],row=colors.find(r=>Number(r.id)===c.rebrickable);
 if(!row||row.name.toLowerCase()!==c.name.toLowerCase()||isTrans(row.is_trans)!==Boolean(c.transparent))throw Error(`Verify the source color mapping for ${key} (Rebrickable ${c.rebrickable}) before refreshing.`);
}
const has=(id,key,part=sourceOf(id))=>evidence.has(`${part}:${COLORS[key].rebrickable}`);
const newColors=(id,part=sourceOf(id))=>added.filter(key=>has(id,key,part));
const combos={};for(const id of appParts)for(const key of newColors(id))combos[`${id}:${key}`]=evidence.get(`${sourceOf(id)}:${COLORS[key].rebrickable}`);
for(const p of selection.parts)if(!Object.hasOwn(PARTS,p.id)&&!Object.values(aliases).includes(p.id))for(const key of newColors(p.id,p.rebrickableId))combos[`${p.id}:${key}`]=evidence.get(`${p.rebrickableId}:${COLORS[key].rebrickable}`);
// App part:colour keys that only placeholder inventories mention, recorded so the exclusion stays visible.
const appKeys=[...appParts.map(id=>[id,sourceOf(id)]),...selection.parts.filter(p=>!Object.hasOwn(PARTS,p.id)&&!Object.values(aliases).includes(p.id)).map(p=>[p.id,p.rebrickableId])];
const excluded=appKeys.flatMap(([id,part])=>added.filter(key=>placeholderOnly.has(`${part}:${COLORS[key].rebrickable}`)).map(key=>`${id}:${key}`)).sort();
const meta={source,provisional,updatedAt,colors:added,rule:"Offered in a colour added after the classic palette only when the exact part number has an element ID or a non-spare inventory in a released set (never a Rebrickable Database Sets placeholder) in that Rebrickable colour ID.",evidence:"scripts/part-color-evidence.json"};

// Outputs. Classic colours keep their existing, element-evidenced lists and order.
const withColors=(list,id,part)=>[...list.filter(k=>CLASSIC_COLORS.includes(k)),...newColors(id,part)];
const colorIds={...Object.fromEntries(Object.entries(selection.colorIds).filter(([k])=>CLASSIC_COLORS.includes(k))),...Object.fromEntries(added.map(k=>[k,COLORS[k].rebrickable]))};
const nextSelection={};for(const [k,v] of Object.entries(selection)){if(k==="colorEvidence")continue;nextSelection[k]=k==="colorIds"?colorIds:k==="parts"?v.map(p=>({...p,colors:withColors(p.colors,p.id,p.rebrickableId)})):v;if(k==="colorIds")nextSelection.colorEvidence={...meta,files};}
const legacyColors=Object.fromEntries(Object.keys(LEGACY_PARTS).sort().map(id=>[id,[...CLASSIC_COLORS,...newColors(id)]]));
const catalogOutput=async file=>{const data=JSON.parse(await readFile(file,"utf8")),out={};for(const [k,v] of Object.entries(data)){if(k==="colorEvidence"||k==="legacyColors")continue;if(k==="parts"){out.colorEvidence=meta;out.legacyColors=legacyColors;out.parts=Object.fromEntries(Object.entries(v).map(([id,p])=>[id,{...p,colors:withColors(p.colors,id)}]));}else out[k]=v;}return JSON.stringify(out)+"\n";};
// Match the Python refresher's json.dumps(indent=2) so the two scripts produce identical files.
const ascii=text=>text.replace(/[\u007f-￿]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
const evidenceOutput=JSON.stringify({note,source,provisional,updatedAt,colorIds:Object.fromEntries(added.map(k=>[k,COLORS[k].rebrickable])),files,fields:["elementIds","sets","lastSetYear"],combos,placeholderOnly:excluded},null,1).replace(/\[\n\s*(\d+),\n\s*(\d+),\n\s*(\d+)\n\s*\]/g,"[$1,$2,$3]")+"\n";
const outputs=[[selectionPath,ascii(JSON.stringify(nextSelection,null,2))+"\n"],[catalogPath,await catalogOutput(catalogPath)],[publicPath,await catalogOutput(publicPath)],[evidencePath,evidenceOutput]];
const counts=Object.fromEntries(added.map(key=>[key,{expanded:Object.keys(EXPANDED_PARTS).filter(id=>has(id,key)).length,legacy:Object.keys(LEGACY_PARTS).filter(id=>has(id,key)).length}]));
console.log(JSON.stringify({source,provisional,combos:Object.keys(combos).length,placeholderOnly:excluded.length,counts}));
if(dryRun)process.exit(0);
if(check){const changed=[];for(const [file,text] of outputs)if(await readFile(file,"utf8").catch(()=>"")!==text)changed.push(path.relative(root,file));if(changed.length)throw Error(`Part colours changed: ${changed.join(", ")}. Rerun without --check and review the diff.`);console.log("Part colours match the source data.");}
else{for(const [file,text] of outputs)await writeFile(file,text);console.log(`Saved ${Object.keys(combos).length} evidenced part/colour combinations for ${added.length} added colours.`);}
