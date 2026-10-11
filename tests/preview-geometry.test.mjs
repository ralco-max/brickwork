import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
import {createRequire} from "node:module";

const bundle=await build({stdin:{contents:'export {PreviewGeometryBuffer} from "./lib/preview-geometry"; export * from "./lib/part-meshes";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"cjs",write:false,plugins:[{name:"catalog-fixture",setup(builder){builder.onLoad({filter:/lib\/part-catalog\.ts$/},()=>({contents:'export function catalogPart(id){return id.startsWith("fixture-")?{mesh:"/parts/ldraw/"+id+".json"}:undefined}',loader:"js"}));}}]});
const mesh=id=>({version:1,part:id,positions:[-.5,0,-1,.5,0,-1,.5,.4,1],normals:[0,1,0,0,1,0,0,1,0],indices:[0,1,2]});
const piece=(part,id=0)=>({id,part,color:"red",x:id*2,y:0,z:0,w:1,h:1,d:2,rotated:false,stage:0});
const snapshot=(parts,changes={})=>({pieces:parts.map((part,id)=>piece(part,id)),length:16,width:12,height:6,modelKey:"design-a",...changes});

function harness(){
 // Evaluate once per test so each case gets a fresh real mesh/pending cache.
 const module={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const {PreviewGeometryBuffer,preloadPartGeometries,partGeometriesReady,exactPartGeometry}=module.exports;
 const requests=[],loads=[];
 const fetcher=url=>new Promise((resolve,reject)=>{const id=url.split("/").at(-1).replace(/\.json$/,"");requests.push({id,resolve,reject});});
 const buffer=new PreviewGeometryBuffer(partGeometriesReady,pieces=>{const load=preloadPartGeometries(pieces,fetcher);loads.push(load);return load;});
 return {
  buffer,requests,loads,ready:partGeometriesReady,
  seed:request=>preloadPartGeometries(request.pieces,async url=>Response.json(mesh(url.split("/").at(-1).replace(/\.json$/,"")))),
  resolve(id,index=0){const request=requests.filter(request=>request.id===id)[index];assert.ok(request,`expected pending fetch for ${id}`);request.resolve(Response.json(mesh(id)));},
  async settle(index){await loads[index].catch(()=>{});await Promise.resolve();},
  assertRenderable(request){assert.ok(partGeometriesReady(request.pieces));for(const p of request.pieces){const geometry=exactPartGeometry(p);assert.equal(geometry.getAttribute("position").count,3);geometry.dispose();}},
 };
}

test("the last complete snapshot retains all geometry and dimensions while a deduplicated next load waits",async()=>{
 const h=harness(),a=snapshot(["fixture-a","fixture-a2"]),b=snapshot(["fixture-a","fixture-b","fixture-b"],{length:40,height:30});
 await h.seed(a);let changed=0;const failures=[];h.buffer.prepare(a,()=>changed++,error=>failures.push(error));
 assert.equal(h.buffer.select(a),a);h.assertRenderable(a);
 h.buffer.prepare(b,()=>changed++,error=>failures.push(error));
 assert.equal(h.buffer.select(b),a,"retain A's pieces and dimensions as one complete snapshot");h.assertRenderable(h.buffer.select(b));
 assert.equal(h.ready(b.pieces),false);assert.deepEqual(h.requests.map(request=>request.id),["fixture-b"],"duplicate pieces share one exact-geometry request");
 assert.equal(changed,0);h.resolve("fixture-b");await h.settle(0);
 assert.equal(changed,1);assert.deepEqual(failures,[]);assert.equal(h.buffer.select(b),b);h.assertRenderable(b);
 assert.equal(h.buffer.select(snapshot(["fixture-not-yet-loaded"])),b,"successful load commits the complete new snapshot");
});

test("a newer snapshot overtakes an older load and shared exact assets are fetched only once",async()=>{
 const h=harness(),a=snapshot(["fixture-a"]),b=snapshot(["fixture-a","fixture-shared","fixture-b"]),c=snapshot(["fixture-a","fixture-shared","fixture-c"]);
 await h.seed(a);const published=[],failures=[];h.buffer.prepare(a,()=>published.push("A"),error=>failures.push(error));
 h.buffer.prepare(b,()=>published.push("B"),error=>failures.push(error));
 h.buffer.prepare(c,()=>published.push("C"),error=>failures.push(error));
 assert.equal(h.buffer.select(c),a);assert.equal(h.requests.filter(request=>request.id==="fixture-shared").length,1);
 h.resolve("fixture-shared");h.resolve("fixture-c");await h.settle(1);
 assert.deepEqual(published,["C"]);assert.equal(h.buffer.select(c),c);h.assertRenderable(c);
 h.resolve("fixture-b");await h.settle(0);
 assert.deepEqual(published,["C"],"late completion must not publish the superseded model");assert.deepEqual(failures,[]);
 assert.equal(h.buffer.select(snapshot(["fixture-next"])),c,"the old load cannot replace the latest committed model");
});

test("an asset failure retains the complete model, reports the failure, and retries the same request successfully",async()=>{
 const h=harness(),a=snapshot(["fixture-a"]),b=snapshot(["fixture-a","fixture-b"]);await h.seed(a);
 const failures=[];let changed=0;h.buffer.prepare(a,()=>changed++,error=>failures.push(error));
 h.buffer.prepare(b,()=>changed++,error=>failures.push(error));h.requests[0].resolve(new Response("",{status:503}));await h.settle(0);
 assert.equal(changed,0);assert.equal(failures.length,1);assert.match(failures[0].message,/fixture-b.*503/);
 assert.equal(h.ready(b.pieces),false);assert.equal(h.buffer.select(b),a);h.assertRenderable(a);
 h.buffer.prepare(b,()=>changed++,error=>failures.push(error));
 assert.equal(h.requests.filter(request=>request.id==="fixture-b").length,2,"a failed cached request must be cleared before retry");
 assert.equal(h.buffer.select(b),a);h.resolve("fixture-b",1);await h.settle(1);
 assert.equal(changed,1);assert.equal(failures.length,1);assert.equal(h.buffer.select(snapshot(["fixture-next"])),b);h.assertRenderable(b);
});

test("a different model key hides the previous model immediately and ignores its stale completion",async()=>{
 const h=harness(),a=snapshot(["fixture-a"]),b=snapshot(["fixture-b"]),c=snapshot(["fixture-c"],{modelKey:"design-c"});await h.seed(a);
 const published=[],failures=[];h.buffer.prepare(a,()=>published.push("A"),error=>failures.push(error));
 const cancelB=h.buffer.prepare(b,()=>published.push("B"),error=>failures.push(error));
 assert.equal(h.buffer.select(b),a);assert.equal(h.buffer.select(c),null,"never show another design while its replacement geometry loads");
 cancelB();h.buffer.prepare(c,()=>published.push("C"),error=>failures.push(error));
 h.resolve("fixture-b");await h.settle(0);assert.equal(h.buffer.select(c),null);assert.deepEqual(published,[]);
 h.resolve("fixture-c");await h.settle(1);assert.deepEqual(published,["C"]);assert.deepEqual(failures,[]);assert.equal(h.buffer.select(c),c);
});

test("model changes ignore stale rejection and an old cleanup cannot cancel the newer load",async()=>{
 const h=harness(),a=snapshot(["fixture-a"]),b=snapshot(["fixture-b"]),c=snapshot(["fixture-c"],{modelKey:"design-c"});await h.seed(a);
 const published=[],failures=[];h.buffer.prepare(a,()=>published.push("A"),error=>failures.push(error));
 const cancelB=h.buffer.prepare(b,()=>published.push("B"),error=>failures.push(error));
 h.buffer.prepare(c,()=>published.push("C"),error=>failures.push(error));cancelB();
 h.requests.find(request=>request.id==="fixture-b").reject(Error("old request lost its connection"));await h.settle(0);
 assert.deepEqual(failures,[]);assert.equal(h.buffer.select(c),null);
 h.resolve("fixture-c");await h.settle(1);assert.deepEqual(published,["C"]);assert.equal(h.buffer.select(c),c);
});

test("unmount cancellation suppresses both late success and late failure without discarding the retained snapshot",async()=>{
 const h=harness(),a=snapshot(["fixture-a"]);await h.seed(a);let changed=0;const failures=[];h.buffer.prepare(a,()=>changed++,error=>failures.push(error));
 const cancelSuccess=h.buffer.prepare(snapshot(["fixture-b"]),()=>changed++,error=>failures.push(error));cancelSuccess();h.resolve("fixture-b");await h.settle(0);
 assert.equal(changed,0);assert.equal(h.buffer.select(snapshot(["fixture-pending"])),a,"canceled success must not overwrite the retained model");
 const cancelFailure=h.buffer.prepare(snapshot(["fixture-c"]),()=>changed++,error=>failures.push(error));cancelFailure();h.requests.find(request=>request.id==="fixture-c").reject(Error("network failure after unmount"));await h.settle(1);
 assert.equal(changed,0);assert.deepEqual(failures,[]);assert.equal(h.buffer.select(snapshot(["fixture-pending"])),a);
});

test("cached part position and dimension changes display immediately and become the retained snapshot without loading",async()=>{
 const h=harness(),a=snapshot(["fixture-a","fixture-b"]);await h.seed(a);let changed=0;const failures=[];h.buffer.prepare(a,()=>changed++,error=>failures.push(error));
 const moved={...a,length:64,width:40,height:80,pieces:a.pieces.map(p=>({...p,x:p.x+12,y:24,z:8,color:"blue"}))};
 assert.equal(h.buffer.select(moved),moved,"cached geometry should not defer current positions or dimensions until an effect");
 h.buffer.prepare(moved,()=>changed++,error=>failures.push(error));h.assertRenderable(moved);
 assert.equal(h.buffer.select(snapshot(["fixture-next"])),moved);assert.equal(h.requests.length,0);assert.equal(h.loads.length,0);assert.equal(changed,0);assert.deepEqual(failures,[]);
 const anotherDesign={...moved,modelKey:"another-cached-design"};assert.equal(h.buffer.select(anotherDesign),anotherDesign,"an already-renderable different design can display immediately");
});

test("geometry recovered through another consumer can commit without refetching and becomes the next retained snapshot",async()=>{
 const h=harness(),a=snapshot(["fixture-a"]),b=snapshot(["fixture-a","fixture-b"]),c=snapshot(["fixture-a","fixture-b","fixture-c"]);await h.seed(a);
 const failures=[];let changed=0;h.buffer.prepare(a,()=>changed++,error=>failures.push(error));
 h.buffer.prepare(b,()=>changed++,error=>failures.push(error));h.requests[0].resolve(new Response("",{status:503}));await h.settle(0);
 assert.equal(h.buffer.select(b),a);assert.equal(failures.length,1);
 // A second viewport shares the actual module asset cache and recovers B.
 await h.seed(b);assert.equal(h.buffer.select(b),b);h.assertRenderable(b);
 // The wrapper prepares again when readiness changes, even with the same request.
 h.buffer.prepare(b,()=>changed++,error=>failures.push(error));
 assert.equal(h.loads.length,1,"committing externally cached geometry does not start another load");assert.equal(h.requests.length,1);
 assert.equal(changed,0);assert.equal(failures.length,1);assert.equal(h.buffer.select(c),b,"the next missing asset must retain visible B, not obsolete A");
});
