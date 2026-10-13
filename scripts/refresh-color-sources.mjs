// Cross-reference the palette (lib/colors.ts) against LDraw's LDConfig.ldr and the Rebrickable colour API by LEGO's own
// colour ID, and save the rows tests/palette.test.mjs checks the palette against. Numbers that look alike are not the
// same colour: Rebrickable 41 Trans-Light Blue is LDraw 43, and Rebrickable 179 Flat Silver (LEGO 315 Silver Metallic)
// is LDraw 315 Flat_Silver, while LDraw 179 is Pearl_Silver (LEGO 179 Silver Flip-flop).
//   node scripts/refresh-color-sources.mjs --ldconfig LDConfig.ldr --rebrickable colors.json [--rebrickable more.json] [--check]
// LDConfig.ldr comes from the pinned LDraw mirror (docs/part-catalog-sources.md); each --rebrickable file is a saved
// response of https://rebrickable.com/api/v3/lego/colors/ (an API key is needed), or a cache of one.
import {build} from "esbuild";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2);
const options=name=>args.flatMap((a,i)=>a===name&&args[i+1]?[args[i+1]]:[]);
const [ldconfigFile]=options("--ldconfig"),rebrickableFiles=options("--rebrickable"),check=args.includes("--check");
if(!ldconfigFile||!rebrickableFiles.length)throw Error("Pass --ldconfig LDConfig.ldr and at least one --rebrickable colors.json.");
const bundle=await build({stdin:{contents:'export {COLORS} from "./lib/colors";',resolveDir:root,loader:"ts"},bundle:true,platform:"node",format:"esm",write:false,logLevel:"error"});
const {COLORS}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const sha=raw=>createHash("sha256").update(raw).digest("hex"),sources=[];

// LDConfig: "0 // LEGOID 140 / 428 - Earth Blue" annotates the !COLOUR line after it.
const ldText=await readFile(ldconfigFile);sources.push({file:path.basename(ldconfigFile),update:/!LDRAW_ORG Configuration UPDATE (\S+)/.exec(ldText)?.[1],sha256:sha(ldText)});
const ldconfig={};let lego=null;
for(const line of ldText.toString("utf8").split(/\r?\n/)){
 const note=/^0\s+\/\/\s*LEGOID\s+([\d\s/]+?)\s+-\s+(.+)$/.exec(line);if(note){lego={ids:note[1].split("/").map(Number),name:note[2].trim()};continue;}
 const colour=/^0\s+!COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+(#[0-9A-F]{6})(.*)$/i.exec(line);
 if(colour){ldconfig[colour[2]]={name:colour[1],value:colour[3].toUpperCase(),...(/\bALPHA\b/.test(colour[4])?{alpha:Number(/ALPHA\s+(\d+)/.exec(colour[4])[1])}:{}),...(/PEARLESCENT|METAL|CHROME/.exec(colour[4])?{finish:/PEARLESCENT|METAL|CHROME/.exec(colour[4])[0]}:{}),...(lego?{lego:lego.ids,legoName:lego.name}:{})};}
 if(!/^0\s+\/\//.test(line))lego=null;
}
// Rebrickable: every file must agree on each palette colour's LEGO, BrickLink and LDraw IDs.
const wanted=[...new Set([...Object.values(COLORS).map(c=>c.rebrickable),43])].sort((a,b)=>a-b),rebrickable={};
for(const file of rebrickableFiles){
 const raw=await readFile(file),data=JSON.parse(raw),rows=Array.isArray(data)?data:data.results;sources.push({file:path.basename(file),sha256:sha(raw)});
 for(const id of wanted){
  const r=rows.find(x=>x.id===id);if(!r)throw Error(`${path.basename(file)} has no Rebrickable colour ${id}.`);
  const ext=k=>r.external_ids?.[k]?.ext_ids||[],row={name:r.name,rgb:r.rgb.toUpperCase(),trans:Boolean(r.is_trans),lego:ext("LEGO"),bricklink:ext("BrickLink"),ldraw:ext("LDraw")};
  const prior=rebrickable[id];
  if(prior&&(prior.name!==row.name||prior.bricklink.join()!==row.bricklink.join()||prior.ldraw.join()!==row.ldraw.join()||!row.lego.every(x=>prior.lego.includes(x))&&!prior.lego.every(x=>row.lego.includes(x))))throw Error(`The Rebrickable caches disagree on colour ${id}.`);
  rebrickable[id]=prior&&prior.lego.length>=row.lego.length?prior:row;
 }
}
// LDraw's code for a colour is the one LDConfig gives the colour's LEGO ID, whatever number Rebrickable lists.
const problems=[];
for(const [key,c] of Object.entries(COLORS)){
 const rb=rebrickable[c.rebrickable],ld=ldconfig[c.ldraw];
 if(rb.name.toLowerCase()!==c.name.toLowerCase())problems.push(`${key}: Rebrickable ${c.rebrickable} is ${rb.name}`);
 if(!rb.bricklink.includes(c.bricklink))problems.push(`${key}: Rebrickable ${c.rebrickable} lists BrickLink ${rb.bricklink}`);
 if(!rb.lego.includes(c.lego))problems.push(`${key}: Rebrickable ${c.rebrickable} lists LEGO ${rb.lego}`);
 if(!ld?.lego?.includes(c.lego))problems.push(`${key}: LDraw ${c.ldraw} is ${ld?.name} (LEGO ${ld?.lego}), not LEGO ${c.lego}`);
 if(Boolean(ld?.alpha)!==Boolean(c.transparent))problems.push(`${key}: LDraw ${c.ldraw} transparency differs`);
}
if(problems.length)throw Error(`The palette disagrees with its sources:\n${problems.join("\n")}`);
// One entry per line. Only LDraw colours with a LEGO ID are kept: they are what a LEGO ID can be looked up in.
const lines=o=>`{\n${Object.entries(o).map(([k,v])=>` ${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",\n")}\n }`;
const known=Object.fromEntries(Object.entries(ldconfig).filter(([,v])=>v.lego));
const out=path.join(root,"tests/fixtures/color-sources.json"),text=`{"note":${JSON.stringify("LDConfig.ldr from the pinned LDraw mirror and the Rebrickable colour API (as cached by bkfunk/brickdata, fjmoeller/flosrocketbricks and domdfcoding/rebrickable-db), cut to what tests/palette.test.mjs checks. Regenerate with scripts/refresh-color-sources.mjs.")},\n"sources":${JSON.stringify(sources)},\n"ldconfig":${lines(known)},\n"rebrickable":${lines(rebrickable)}}\n`;
if(check){if(await readFile(out,"utf8").catch(()=>"")!==text)throw Error("tests/fixtures/color-sources.json is out of date.");console.log("Colour sources match.");}
else{await writeFile(out,text);console.log(`Saved ${Object.keys(known).length} LDraw colours and ${wanted.length} Rebrickable colours.`);}
