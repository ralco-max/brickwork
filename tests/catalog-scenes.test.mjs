import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/generated-scene";export * from "./lib/bridge";export * from "./lib/part-catalog";export * from "./lib/part-spatial";export {enforceLocks,emptyManual} from "./lib/design-project";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {PARTS,EXPANDED_PARTS,compileScene,validateScene,sceneVoxels,catalogPiece,compactScene,SceneStreamParser,mergeRevision,enforceLocks,emptyManual,componentBudget,pieceCells,auditModel}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=catalog-scenes-test-bundle.mjs').toString('base64'));
// Mechanism fixtures with deliberately empty volume and an interior socket.
// These are not production catalog entries or claims about real LEGO designs.
const addFixture=(id,spec)=>{EXPANDED_PARTS[id]={price:0,colors:['gray'],family:'Fixture',mesh:'',thumbnail:'',sourcePart:'',ldrawOffset:[0,0,0],...spec};PARTS[id]=EXPANDED_PARTS[id];};
addFixture('TESTARCH',{name:'Spatial arch fixture',w:4,d:1,h:6,occupancy:Array.from({length:4},(_,x)=>Array.from({length:6},(_,y)=>[x,y,0])).flat().filter(([x,y])=>x===0||x===3||y>=4),topStuds:Array.from({length:4},(_,x)=>[x,6,0]),bottomSockets:[[0,0,0],[3,0,0]]});
addFixture('TESTSOCKET',{name:'Interior socket fixture',w:4,d:1,h:2,occupancy:[[0,1,0],[1,1,0],[2,1,0],[3,1,0],[2,0,0],[3,0,0]],topStuds:Array.from({length:4},(_,x)=>[x,2,0]),bottomSockets:[[0,1,0],[1,1,0]]});
const box=(id,x,y,z,w,h,d,extra={})=>({id,component:id,label:id,kind:'box',operation:'add',color:'tan',position:{x,y,z},size:{x:w,y:h,z:d},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
const part=(id,pid,x,y,z,extra={})=>box(id,x,y,z,1,1,1,{kind:'part',part:pid,face:'pz',color:'gray',...extra});
const scene=(shapes,extra={})=>({name:'Catalog placement',description:'Test fixture',dimensions:{x:16,y:24,z:16},shapes,...extra});
const base=box('Base',0,0,0,12,2,10);
const modelCells=model=>{const out=new Map();for(const p of model.pieces)for(const xyz of pieceCells(p))out.set(xyz.join(','),p.color);return out;};

test('catalog parts derive authoritative dimensions for all yaw faces, including legacy parts',()=>{
 for(const pid of ['TESTARCH','3001'])for(const face of ['pz','px','nz','nx']){
  const input=part('Element',pid,3,2,3,{face,size:{x:70,y:70,z:70}}),validated=validateScene(scene([base,input])),shape=validated.shapes[1],p=catalogPiece(shape),turned=face==='px'||face==='nx';
  assert.deepEqual(shape.size,{x:turned?PARTS[pid].d:PARTS[pid].w,y:PARTS[pid].h,z:turned?PARTS[pid].w:PARTS[pid].d});assert.equal(p.face,face);assert.equal(p.rotated,turned);
 }
 for(const patch of [{part:'UNKNOWN'},{color:'red'},{operation:'subtract'},{position:{x:2.5,y:2,z:2}},{position:{x:14,y:2,z:2}}])assert.throws(()=>validateScene(scene([base,{...part('Element','TESTARCH',2,2,2),...patch}]),{fresh:true}),/unknown|listed|remove|whole|outside/i);
});

test('actual occupancy permits a separate real part inside an arch opening and rejects solid overlaps',()=>{
 const arch=part('Arch','TESTARCH',3,2,3),inside=part('Inside','3005',4,2,3);
 const model=compileScene(scene([base,arch,inside]),{smooth:true,hollow:true}),check=auditModel(model.pieces);
 assert.equal(model.pieces.filter(p=>p.part==='TESTARCH').length,1);assert.equal(model.pieces.filter(p=>p.part==='3005'&&p.x===4&&p.z===3).length,1);assert.equal(check.overlaps,0);assert.equal(check.ungrounded.length,0);
 const cells=sceneVoxels(scene([arch]));assert.equal(cells.has('4,2,3'),false);assert.equal(cells.get('3,2,3'),'gray');
 assert.throws(()=>compileScene(scene([base,arch,part('Collision','3005',3,2,3)])),/overlap/);
 assert.throws(()=>compileScene(scene([base,arch,{...arch,id:'Same cell'}])),/overlap/);
});

test('voxel bulk gives way to only occupied cells and explicit plates never become tiles',()=>{
 const arch=part('Arch','TESTARCH',3,2,3),bulk=box('Bulk',3,2,3,4,6,1,{color:'red'}),model=compileScene(scene([base,bulk,arch]),{smooth:true,hollow:true}),cells=modelCells(model);
 assert.equal(cells.get('3,3,3'),'gray');assert.equal(cells.get('4,3,3'),'red');assert.equal(auditModel(model.pieces).overlaps,0);
 const plate=part('Specified plate','3020',2,2,2),smooth=compileScene(scene([base,plate]),{smooth:true});assert.ok(smooth.pieces.some(p=>p.part==='3020'&&p.x===2&&p.y===2&&p.z===2));
});

test('small floating real elements are retained and reported, while interior sockets retain their support',()=>{
 const floating=compileScene(scene([base,part('Floating','TESTSOCKET',3,10,3)]),{smooth:true,hollow:true});const p=floating.pieces.find(p=>p.part==='TESTSOCKET');assert.ok(p);assert.ok(auditModel(floating.pieces).ungrounded.includes(p.id));
 const support=box('Support',3,2,3,2,3,1),socket=part('Interior connection','TESTSOCKET',3,4,3),model=compileScene(scene([base,support,socket]),{smooth:true,hollow:true});
 assert.equal(auditModel(model.pieces).overlaps,0);assert.equal(auditModel(model.pieces).ungrounded.length,0);assert.equal(modelCells(model).get('3,4,3'),'tan');
});

test('manual erasure removes indivisible parts only when actual material is touched',()=>{
 const arch=part('Arch','TESTARCH',3,2,3),input=scene([base,arch]),erase=(x,y,z)=>({x,y,z,w:1,h:1,d:1});
 const inVoid=compileScene(input,{manual:{...emptyManual(),erase:[erase(4,2,3)]}});assert.ok(inVoid.pieces.some(p=>p.part==='TESTARCH'));
 const touched=compileScene(input,{manual:{...emptyManual(),erase:[erase(3,2,3)]}});assert.ok(!touched.pieces.some(p=>p.part==='TESTARCH'));assert.ok(!modelCells(touched).has('6,7,3'));
 const manual=catalogPiece(part('Manual','3005',4,2,3));const added=compileScene(input,{manual:{erase:[],bricks:[manual]}});assert.ok(added.pieces.some(p=>p.part==='TESTARCH'));assert.equal(auditModel(added.pieces).overlaps,0);
 const actualArch=catalogPiece(arch),mask={x:actualArch.x,y:actualArch.y,z:actualArch.z,w:actualArch.w,h:actualArch.h,d:actualArch.d,cells:[...pieceCells(actualArch)].map(([x,y,z])=>[x-actualArch.x,y-actualArch.y,z-actualArch.z])};
 const inside=part('Separate element in opening','3005',4,2,3),removedFrame=compileScene(scene([base,arch,inside]),{manual:{erase:[mask],bricks:[]}});
 assert.ok(!removedFrame.pieces.some(p=>p.part==='TESTARCH'));assert.ok(removedFrame.pieces.some(p=>p.part==='3005'&&p.x===4&&p.y===2&&p.z===3),'Removing a frame must not erase the separate piece in its opening.');
});

test('streamed catalog shapes repeat, revise, remove, retain locks and preserve legacy packing version',()=>{
 const input=scene([base,part('Arches','TESTARCH',1,2,3,{repeat:{count:2,offset:{x:5,y:0,z:0}}})]),wire=JSON.stringify(compactScene(input)),parser=new SceneStreamParser();for(let i=0;i<wire.length;i+=11)parser.push(wire.slice(i,i+11));const parsed=parser.finish();
 assert.equal(parsed.header.catalogVersion,1);assert.equal(parsed.shapes[1].part,'TESTARCH');const expanded=validateScene({...parsed.header,shapes:parsed.shapes}),model=compileScene(expanded);assert.equal(model.pieces.filter(p=>p.part==='TESTARCH').length,2);
 const previous=validateScene(input),unchanged=mergeRevision(previous,parsed.header,[],[]);assert.equal(unchanged.catalogVersion,undefined);assert.doesNotThrow(()=>enforceLocks(previous,unchanged,['Arches']));
 const moved=mergeRevision(previous,parsed.header,[],[{...previous.shapes[1],position:{x:1,y:3,z:3}}]);assert.throws(()=>enforceLocks(previous,moved,['Arches']),/locked/);
 const removed=mergeRevision(previous,parsed.header,['Arches'],[]);assert.equal(removed.shapes.length,1);assert.throws(()=>enforceLocks(previous,removed,['Arches']),/locked/);
 assert.equal(componentBudget(expanded,model).find(c=>c.component==='Arches').pieces,2);
 const modern={...previous,catalogVersion:1};assert.equal(mergeRevision(modern,parsed.header,[],[]).catalogVersion,1);
});

test('real 29120 recessed sockets and 6060 interior top studs connect at their actual heights',()=>{
 const curved=part('Curved left element','29120',3,2,3,{color:EXPANDED_PARTS['29120'].colors[0]}),recessSupport=box('Recess support',3,2,4,1,1,1);
 const curveModel=compileScene(scene([base,recessSupport,curved]),{hollow:true,smooth:true});assert.equal(auditModel(curveModel.pieces).overlaps,0);assert.equal(auditModel(curveModel.pieces).ungrounded.length,0);
 const arch=part('Curved arch','6060',3,2,2,{color:EXPANDED_PARTS['6060'].colors[0]}),upperPlate=part('Upper plate','3023',3,11,6,{face:'px'});
 const archModel=compileScene(scene([base,arch,upperPlate]),{hollow:true,smooth:true});assert.equal(auditModel(archModel.pieces).overlaps,0);assert.equal(auditModel(archModel.pieces).ungrounded.length,0);assert.ok(archModel.pieces.some(p=>p.part==='3023'&&p.y===11));
});

test('every shipped catalog part compiles at each permitted quarter turn without rescaling or replacement',()=>{
 const ids=Object.keys(EXPANDED_PARTS).filter(id=>!id.startsWith('TEST'));assert.ok(ids.length>=200,'Expected hundreds of real catalog definitions.');
 for(const id of ids)for(const face of ['pz','px','nz','nx']){
  const definition=EXPANDED_PARTS[id],s=part('Catalog element',id,0,0,0,{face,color:definition.colors[0]}),p=catalogPiece(s);
  const model=compileScene(scene([s],{dimensions:{x:Math.max(8,p.w),y:Math.max(8,p.h),z:Math.max(8,p.d)}}),{hollow:true,smooth:true});
  assert.equal(model.pieces.length,1,id+' '+face);assert.equal(model.pieces[0].part,id);assert.equal(model.pieces[0].face,face);assert.deepEqual([model.pieces[0].w,model.pieces[0].h,model.pieces[0].d],[p.w,p.h,p.d]);
 }
});
