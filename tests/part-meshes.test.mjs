import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
import {createRequire} from "node:module";

const bundle=await build({stdin:{contents:'export * from "./lib/part-meshes";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"cjs",write:false,plugins:[{name:"catalog-fixture",setup(builder){builder.onLoad({filter:/lib\/part-catalog\.ts$/},()=>({contents:'export function catalogPart(id){return ["fixture-a","fixture-b"].includes(id)?{mesh:"/parts/ldraw/"+id+".json"}:undefined}',loader:"js"}));}}]});
const module={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {preloadPartGeometries,partGeometriesReady,exactPartGeometry}=module.exports;
const mesh=id=>({version:1,part:id,positions:[-.5,0,-1,.5,0,-1,.5,.4,1],normals:[0,1,0,0,1,0,0,1,0],indices:[0,1,2]});

test("missing exact geometry blocks rendering; lazy requests deduplicate and preserve all four orientations",async()=>{
 const piece={part:"fixture-a",rotated:false};assert.equal(partGeometriesReady([piece]),false);assert.throws(()=>exactPartGeometry(piece),/Load the exact geometry/);
 let calls=0;const fetcher=async()=>{calls++;return Response.json(mesh(piece.part));};
 await Promise.all([preloadPartGeometries([piece,piece],fetcher),preloadPartGeometries([piece],fetcher)]);assert.equal(calls,1);assert.equal(partGeometriesReady([piece]),true);
 const expected={pz:[-.5,0,-1],px:[-1,0,.5],nz:[.5,0,1],nx:[1,0,-.5]};
 for(const [face,point] of Object.entries(expected)){const geometry=exactPartGeometry({...piece,face});const position=geometry.getAttribute("position");assert.ok([position.getX(0),position.getY(0),position.getZ(0)].every((n,i)=>Math.abs(n-point[i])<1e-6));geometry.dispose();}
});

test("failed or malformed assets never mark geometry ready and can be retried",async()=>{
 const piece={part:"fixture-b",rotated:false};await assert.rejects(preloadPartGeometries([piece],async()=>new Response("",{status:503})),/could not be loaded/);assert.equal(partGeometriesReady([piece]),false);
 await assert.rejects(preloadPartGeometries([piece],async()=>Response.json({...mesh(piece.part),indices:[0,1,999999]})),/invalid/);assert.equal(partGeometriesReady([piece]),false);
 await preloadPartGeometries([piece],async()=>Response.json(mesh(piece.part)));assert.equal(partGeometriesReady([piece]),true);
});
