import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
const bundle=await build({stdin:{contents:'export * from "./lib/lego-elements";export {PARTS,COLORS,WHEELS} from "./lib/bridge";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",write:false});
const {resolveLegoElement,LEGO_CATALOG_INFO,PARTS,COLORS,WHEELS}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const catalog=JSON.parse(await readFile(new URL("../lib/data/lego-elements.json",import.meta.url),"utf8"));

test("the requested dark-blue1x1 and light-gray1x6 plates resolve to evidenced element IDs",()=>{
 const navy=resolveLegoElement("3024","navy");assert.equal(navy.elementId,"6554188");assert.ok(navy.alternatives.includes("4184108"));
 assert.equal(resolveLegoElement("3666","gray").elementId,"4211438");
 assert.notEqual(resolveLegoElement("3024","gray").elementId,navy.elementId,"color must be part of the match");
});

test("every supported part/color gets an exact catalog match or an explicit unresolved result",()=>{
 let matched=0,missing=0,assemblies=0;const seen=new Map();
 for(const part of Object.keys(PARTS))for(const color of Object.keys(COLORS)){
  const result=resolveLegoElement(part,color);
  if(Object.hasOwn(WHEELS,part)){assert.equal(result.status,"assembly");assert.equal(result.elementId,undefined);assemblies++;continue;}
  if(result.status==="missing"){assert.ok(catalog.missing.includes(`${part}:${color}`));missing++;continue;}
  assert.equal(result.status,"matched");matched++;
  for(const id of [result.elementId,...result.alternatives]){assert.match(id,/^\d{6,8}$/);assert.ok(!seen.has(id)||seen.get(id)===`${part}:${color}`,"one element ID cannot stand for two different catalog rows");seen.set(id,`${part}:${color}`);}
 }
 assert.equal(matched,421);assert.equal(missing,8);assert.equal(assemblies,39);
 assert.equal(resolveLegoElement("3007","darkbrown").status,"missing","never substitute brown for dark brown");
});

test("tile mold suffixes and the documented3040 alias retain exact color matching and provenance",()=>{
 for(const part of ["3068b","3069b","3070b","3040"])for(const color of Object.keys(COLORS))assert.equal(resolveLegoElement(part,color).status,"matched");
 assert.deepEqual(catalog.partAliases,{3040:"3040b"});assert.equal(LEGO_CATALOG_INFO.sourceUrl,"https://rebrickable.com/downloads/");
 assert.equal(catalog.sources.length,3);for(const source of catalog.sources){assert.match(source.url,/^https:\/\/cdn\.rebrickable\.com\/media\/downloads\//);assert.match(source.sha256,/^[a-f0-9]{64}$/);}
 assert.equal(Object.hasOwn(catalog,"prices"),false);assert.equal(Object.hasOwn(catalog,"stock"),false);
});
