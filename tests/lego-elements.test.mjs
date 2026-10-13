import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
const bundle=await build({stdin:{contents:'export * from "./lib/lego-elements";export {PARTS,LEGACY_PARTS,COLORS,WHEELS} from "./lib/bridge";export {CLASSIC_COLORS} from "./lib/colors";export {partAllowsColor} from "./lib/part-colors";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",write:false});
const {resolveLegoElement,LEGO_CATALOG_INFO,LEGO_CATALOG_COLORS,PARTS,LEGACY_PARTS,COLORS,CLASSIC_COLORS,WHEELS,partAllowsColor}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const catalog=JSON.parse(await readFile(new URL("../lib/data/lego-elements.json",import.meta.url),"utf8"));

test("the requested dark-blue1x1 and light-gray1x6 plates resolve to evidenced element IDs",()=>{
 const navy=resolveLegoElement("3024","navy");assert.equal(navy.elementId,"6554188");assert.ok(navy.alternatives.includes("4184108"));
 assert.equal(resolveLegoElement("3666","gray").elementId,"4211438");
 assert.notEqual(resolveLegoElement("3024","gray").elementId,navy.elementId,"color must be part of the match");
});

test("every supported part/color gets an exact catalog match or an explicit unresolved result",()=>{
 let matched=0,missing=0,assemblies=0,coreMatched=0,coreMissing=0;const seen=new Map();
 // The 2026-10-11 snapshot predates the added colours; they resolve to pending until the owner reruns the refresh.
 assert.equal(Object.hasOwn(catalog,"colors"),false);assert.deepEqual([...LEGO_CATALOG_COLORS],[...CLASSIC_COLORS]);
 for(const part of Object.keys(PARTS))for(const color of LEGO_CATALOG_COLORS){
  const result=resolveLegoElement(part,color);
  if(Object.hasOwn(WHEELS,part)||part==="minifig"){assert.equal(result.status,"assembly");assert.equal(result.elementId,undefined);assemblies++;continue;}
  if(result.status==="missing"){assert.ok(catalog.missing.includes(`${part}:${color}`));missing++;if(Object.hasOwn(LEGACY_PARTS,part))coreMissing++;continue;}
  assert.equal(result.status,"matched");assert.equal(result.pending,undefined);matched++;if(Object.hasOwn(LEGACY_PARTS,part))coreMatched++;
  for(const id of [result.elementId,...result.alternatives]){assert.match(id,/^\d{6,8}$/);assert.ok(!seen.has(id)||seen.get(id)===`${part}:${color}`,"one element ID cannot stand for two different catalog rows");seen.set(id,`${part}:${color}`);}
 }
 assert.equal(coreMatched,421);assert.equal(coreMissing,8);assert.equal(assemblies,52);
 assert.equal(matched,Object.keys(catalog.elements).length);assert.equal(missing,catalog.missing.length);
 assert.equal(matched+missing+assemblies,Object.keys(PARTS).length*LEGO_CATALOG_COLORS.length);
 assert.equal(resolveLegoElement("3007","darkbrown").status,"missing","never substitute brown for dark brown");
});

test("tile mold suffixes and the documented3040 alias retain exact color matching and provenance",()=>{
 for(const part of ["3068b","3069b","3070b","3040"])for(const color of CLASSIC_COLORS)assert.equal(resolveLegoElement(part,color).status,"matched");
 assert.deepEqual(catalog.partAliases,{3040:"3040b"});assert.equal(LEGO_CATALOG_INFO.sourceUrl,"https://rebrickable.com/downloads/");
 assert.equal(catalog.sources.length,3);for(const source of catalog.sources){assert.match(source.url,/^https:\/\/cdn\.rebrickable\.com\/media\/downloads\//);assert.match(source.sha256,/^[a-f0-9]{64}$/);}
 assert.equal(Object.hasOwn(catalog,"prices"),false);assert.equal(Object.hasOwn(catalog,"stock"),false);
});

test("added colours never borrow an element ID: they stay unresolved until an official refresh covers them",()=>{
 const added=Object.keys(COLORS).filter(color=>!CLASSIC_COLORS.includes(color));assert.equal(added.length,12);
 // Pending only where the part is made in that colour; a painted or imported piece in a colour its part is not
 // listed in says so instead of promising an element that is merely not looked up yet.
 let pending=0,unlisted=0;
 for(const part of Object.keys(PARTS))for(const color of added){
  const result=resolveLegoElement(part,color);if(result.status==="assembly")continue;
  const listed=partAllowsColor(part,color);if(listed)pending++;else unlisted++;
  assert.deepEqual(result,{status:"missing",source:catalog.sourceUrl,...(listed?{pending:true}:{unlisted:true})},`${part}:${color}`);
  assert.equal(Object.hasOwn(catalog.elements,`${part}:${color}`),false);
 }
 assert.ok(pending>1000&&unlisted>1000);
 assert.deepEqual(resolveLegoElement("3035","pearlgold"),{status:"missing",source:catalog.sourceUrl,unlisted:true},"no 4 x 8 plate in pearl gold");
 assert.equal(resolveLegoElement("3024","pearlgold").pending,true);
 // A catalog part in a classic colour it is not listed in is flagged the same way.
 assert.equal(resolveLegoElement("2467","black").unlisted,true);assert.equal(resolveLegoElement("2467","gray").unlisted,undefined);
 // Trans-light blue is Rebrickable 41; Rebrickable 43 (Trans-Very Lt Blue) shares its LDraw code.
 assert.equal(resolveLegoElement("3024","translightblue").elementId,undefined);
});

test("the element refresh joins colours on their Rebrickable ID and records the colours it covered",async()=>{
 const script=await readFile(new URL("../scripts/refresh-lego-elements.mjs",import.meta.url),"utf8");
 assert.match(script,/row\.color_id===String\(color\.rebrickable\)/);assert.doesNotMatch(script,/String\(color\.ldraw\)/);
 assert.match(script,/colors:Object\.fromEntries\(Object\.entries\(COLORS\)\.map\(\(\[key,color\]\)=>\[key,color\.rebrickable\]\)\)/);
 assert.match(script,/is_trans\)!==Boolean\(color\.transparent\)/);
});
