import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{contents:'export * from "./lib/live-arrivals";export {compileScene} from "./lib/generated-scene";export {defaultBrief} from "./lib/design-project";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {reconcileArrivals,arrivalPose,arrivalOpacity,arrivalEndTime,brickIdentity,ARRIVAL_FLIGHT_SECONDS,ARRIVAL_FADE_SECONDS,PreviewQueue,foundationScene,compileScene,defaultBrief}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const brick=(id,x)=>({id,x,y:0,z:0,w:4,h:3,d:2,rotated:false,part:'3001',color:'red',stage:0});
test('streamed additions keep existing bricks settled despite reindexed IDs',()=>{const a=brick(0,0),b=brick(1,4),first=reconcileArrivals(new Map(),[a],0,24,16,40);const next=reconcileArrivals(first,[{...a,id:90},b],10,24,16,40);assert.equal(next.get(brickIdentity(a)),first.get(brickIdentity(a)));assert.equal(arrivalPose(next.get(brickIdentity(a)),10).settled,true);assert.equal(arrivalPose(next.get(brickIdentity(b)),10).settled,false);assert.deepEqual(arrivalPose(next.get(brickIdentity(b)),20),{x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true});});
test('recolored or removed bricks reconcile without leaving ghost geometry; reduced motion settles',()=>{const a=brick(0,0),first=reconcileArrivals(new Map(),[a],0,20,20,20),blue={...a,color:'blue'},next=reconcileArrivals(first,[blue],4,20,20,20);assert.equal(next.size,1);assert.equal(next.has(brickIdentity(a)),false);assert.equal(arrivalPose(next.get(brickIdentity(blue)),4,true).settled,true);assert.equal(reconcileArrivals(next,[],5,20,20,20).size,0);});
test('fast streams publish their last queued snapshot even after transport completion',async()=>{let release;const gate=new Promise(r=>release=r),seen=[],compiled=[];const queue=new PreviewQueue(async value=>{compiled.push(value);if(value===1)await gate;return value;},value=>seen.push(value),e=>{throw e});queue.push(1);queue.push(2);queue.push(3);release();await queue.flush();assert.deepEqual(compiled,[1,3]);assert.deepEqual(seen,[1,3]);});
test('cancellation suppresses in-flight publications; errors surface and subsequent previews recover',async()=>{let release;const gate=new Promise(r=>release=r),seen=[],errors=[];const q=new PreviewQueue(async n=>{await gate;return n},n=>seen.push(n),e=>errors.push(e));q.push(1);q.cancel();release();await q.flush();assert.deepEqual(seen,[]);const recovering=new PreviewQueue(async n=>{if(n===1)throw Error('worker failed');return n},n=>seen.push(n),e=>errors.push(e.message));recovering.push(1);await recovering.flush();recovering.push(2);await recovering.flush();assert.deepEqual(errors,['worker failed']);assert.deepEqual(seen,[2]);});
test('immediate foundation is actual catalog geometry supplied as the initial scene',()=>{const b=defaultBrief('A dragon and a tower'),scene=foundationScene(b),m=compileScene(scene);assert.ok(m.pieces.length>0);assert.ok(m.pieces.every(p=>p.y+p.h<=2));assert.equal(scene.shapes[0].id,'display-foundation');assert.equal(scene.dimensions.y,b.maxHeight);assert.ok(m.pieces.length<b.maxPieces);});

test('every streamed brick settles at the declared animation cutoff, with no scale pop',()=>{
 const pieces=[brick(0,0),brick(1,4),{...brick(2,8),y:3}],arrivals=reconcileArrivals(new Map(),pieces,10,24,16,40);
 for(const arrival of arrivals.values()){assert.equal(arrivalPose(arrival,arrival.at).scale,1);assert.equal(arrivalPose(arrival,arrival.at+ARRIVAL_FLIGHT_SECONDS).settled,true);assert.equal(arrivalPose(arrival,arrival.at+ARRIVAL_FLIGHT_SECONDS-1e-6).settled,false);}
 assert.ok(Math.max(...[...arrivals.values()].map(entry=>entry.at+ARRIVAL_FLIGHT_SECONDS))-10<=2.21);
});
test('a quarter-turn change is a fresh arrival even when its footprint is unchanged',()=>{
 const p={...brick(0,0),face:'px'},first=reconcileArrivals(new Map(),[p],0,24,16,40),turned={...p,face:'nx'},next=reconcileArrivals(first,[turned],5,24,16,40);
 assert.notEqual(brickIdentity(p),brickIdentity(turned));assert.equal(next.get(brickIdentity(turned)).at,5);
});

const settledPose={x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true};
const reconcile=(previous,pieces,now,mode)=>reconcileArrivals(previous,pieces,now,24,16,40,undefined,mode);

test('revision changes reveal in place at full scale and never travel through the settled structure',()=>{
 const a=brick(0,0),b={...brick(1,4),y:3},c={...brick(2,8),y:9},first=reconcile(new Map(),[a],0,'still'),revised=reconcile(first,[a,b,c],4,'revise');
 const unchanged=revised.get(brickIdentity(a)),added=revised.get(brickIdentity(b)),other=revised.get(brickIdentity(c));
 assert.equal(unchanged.mode,'still');assert.equal(added.mode,'revise');assert.equal(added.at,other.at,'one preview cohort reveals together');
 let prior=-1;
 for(let step=0;step<=40;step++){
  const now=4-0.1+step*.02;
  for(const entry of revised.values())assert.deepEqual(arrivalPose(entry,now),settledPose);
  assert.equal(arrivalOpacity(unchanged,now),1);const opacity=arrivalOpacity(added,now);assert.ok(opacity>=prior&&opacity>=0&&opacity<=1);prior=opacity;
 }
 assert.equal(arrivalOpacity(added,4),0);assert.ok(Math.abs(arrivalOpacity(added,4+ARRIVAL_FADE_SECONDS/2)-.5)<1e-12);assert.equal(arrivalOpacity(added,arrivalEndTime(added)),1);
 assert.equal(arrivalOpacity(added,4,true),1);assert.equal(arrivalEndTime(added),4+ARRIVAL_FADE_SECONDS);
});

test('entering revision mode settles old flights and subsequent snapshots preserve active fade progress',()=>{
 const a=brick(0,0),b=brick(1,4),c=brick(2,8),flying=reconcile(new Map(),[a],0,'assemble');
 assert.equal(arrivalPose(flying.get(brickIdentity(a)),.1).settled,false);
 const first=reconcile(flying,[a,b],.1,'revise'),second=reconcile(first,[{...a,id:40},{...b,id:41},c],.2,'revise');
 const retained=first.get(brickIdentity(b));assert.strictEqual(second.get(brickIdentity(b)),retained);assert.equal(retained.at,.1);
 assert.deepEqual(arrivalPose(first.get(brickIdentity(a)),.1),settledPose);assert.equal(arrivalOpacity(second.get(brickIdentity(a)),.2),1);
 assert.ok(arrivalOpacity(retained,.2)>0&&arrivalOpacity(retained,.2)<1);assert.equal(second.get(brickIdentity(c)).at,.2);
 assert.equal(arrivalOpacity(retained,.2),arrivalOpacity(second.get(brickIdentity(b)),.2),'reconciling or pausing without advancing the clock cannot restart a fade');
});

test('still mode suppresses all animation and an explicit assembly replay can start again',()=>{
 const pieces=[brick(0,0),brick(1,4)],revised=reconcile(new Map(),pieces,2,'revise'),still=reconcile(revised,pieces,2.1,'still');
 for(const entry of still.values()){assert.equal(entry.mode,'still');assert.deepEqual(arrivalPose(entry,0),settledPose);assert.equal(arrivalOpacity(entry,0),1);assert.equal(arrivalEndTime(entry),entry.at);}
 const replay=reconcile(still,pieces,3,'assemble');
 for(const entry of replay.values()){assert.equal(entry.mode,'assemble');assert.equal(arrivalPose(entry,3).settled,false);assert.equal(arrivalOpacity(entry,3),1);assert.equal(arrivalEndTime(entry),entry.at+ARRIVAL_FLIGHT_SECONDS);}
 const resumed=reconcile(replay,pieces,3.1,'assemble');for(const [key,entry] of replay)assert.strictEqual(resumed.get(key),entry);
 const newEpoch=reconcile(new Map(),pieces,0,'assemble');assert.equal(newEpoch.get(brickIdentity(pieces[0])).at,0);
});

test('revision recolors and yaw changes fade only replacements, and removed identities leave no ghosts',()=>{
 const a={...brick(0,0),face:'px'},b=brick(1,4),first=reconcile(new Map(),[a,b],0,'still'),turned={...a,face:'nx'},blue={...b,color:'blue'};
 const next=reconcile(first,[turned,blue],2,'revise');assert.equal(next.size,2);assert.equal(next.has(brickIdentity(a)),false);assert.equal(next.has(brickIdentity(b)),false);
 for(const entry of next.values()){assert.equal(entry.mode,'revise');assert.deepEqual(arrivalPose(entry,2),settledPose);assert.equal(arrivalOpacity(entry,2),0);}
 assert.equal(reconcile(next,[],3,'revise').size,0);
 // Existing consumers and saved in-memory entries without a mode keep assembly behavior.
 const legacy={track:[...next.values()][0].track,at:0};assert.equal(arrivalOpacity(legacy,0),1);assert.equal(arrivalEndTime(legacy),ARRIVAL_FLIGHT_SECONDS);assert.equal(arrivalPose(legacy,0).settled,false);
});
