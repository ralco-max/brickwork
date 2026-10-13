import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/design-project";export * from "./lib/generated-scene";export * from "./lib/models";export * from "./lib/bridge";export * from "./lib/design-review";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {auditModel,defaultBrief,compileScene,normalizeScene,validateScene,validateProject,projectJSON,editModel,emptyManual,emptyShopping,addPiece,enforceLocks,sceneVoxels,expandShapes,designChecks,proportionCheck,supportLoosePieces,reviewDesign}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const piece=(x,y,z,extra={})=>({id:93,part:'3001',color:'red',x,y,z,w:4,h:3,d:2,rotated:false,stage:0,...extra});
const shape=(id,x,y,z,w,h,d,extra={})=>({id,component:id,label:id,kind:'box',operation:'add',color:'red',position:{x,y,z},size:{x:w,y:h,z:d},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
const scene={name:'Detailed facade',description:'Repeated windows on a grounded facade.',dimensions:{x:24,y:32,z:16},shapes:[shape('base',0,0,0,24,2,16,{color:'gray'}),shape('wall',4,2,4,16,18,5),shape('windows',5,8,8,1,4,1,{color:'yellow',repeat:{count:5,offset:{x:3,y:0,z:0}}})]};
test('floating pieces and assemblies never pass the support gate, independent of piece IDs',()=>{
 const floating=auditModel([piece(0,20,0)]);assert.equal(floating.ungrounded.length,1);assert.equal(floating.disconnected.length,1);
 const stack=auditModel([piece(0,3,0,{id:54}),piece(0,0,0,{id:9})]);assert.deepEqual(stack.ungrounded,[]);assert.deepEqual(stack.unsupported,[]);assert.equal(stack.groups,1);
 const suspended=auditModel([piece(0,23,0,{id:2}),piece(0,20,0,{id:8})]);assert.equal(suspended.ungrounded.length,2);
 assert.equal(auditModel([piece(0,0,0),piece(4,0,0,{id:5})]).groups,2);
 assert.equal(auditModel([piece(0,0,0,{part:'3068b',w:2,d:2,h:1}),piece(0,1,0,{id:2})]).ungrounded.length,1);
 assert.ok(auditModel([piece(0,0,0),piece(0,0,0,{id:2})]).overlaps>0);
});
test('vertical repair can anchor a floating model to the floor and reports remaining groups',()=>{const r=supportLoosePieces([piece(0,12,0,{id:0})]);assert.ok(r.added>0);assert.equal(auditModel(r.pieces).ungrounded.length,0);});
test('repeated details preserve colors and validate every repeated extent',()=>{assert.equal(expandShapes(scene.shapes).length,7);const v=sceneVoxels(scene);for(let i=0;i<5;i++)assert.equal(v.get(`${5+i*3},8,8`),'yellow');assert.throws(()=>validateScene({...scene,shapes:[shape('windows',20,0,0,4,3,2,{repeat:{count:3,offset:{x:3,y:0,z:0}}})]}),/outside/);});
test('paint, add, erase, then AI refinement preserve exact manual overrides and project round trip',()=>{
 const b={...defaultBrief('A detailed brick facade'),finish:'studded'};let model={...compileScene(scene),generation:scene,design:{brief:b,manual:emptyManual(),locked:['base'],revisions:[{request:'Add windows',summary:'Five windows',at:'2026-09-08T00:00:00.000Z'}]}};
 const target=model.pieces.find(p=>p.y>2);model=editModel(model,model.pieces.map(p=>p.id===target.id?{...p,color:'blue'}:p));
 model=editModel(model,addPiece(model.pieces,'3022','green',0,2,0));
 const erase=model.pieces.find(p=>p.x>10&&p.y>10);assert.ok(erase);model=editModel(model,model.pieces.filter(p=>p.id!==erase.id));
 assert.ok(model.generation);assert.ok(model.design.manual.bricks.some(p=>p.color==='blue'));
 const revised={...scene,shapes:[...scene.shapes,shape('roof',4,20,4,16,3,5,{color:'tan'})]};
 const result=compileScene(revised,{manual:model.design.manual});assert.ok(result.pieces.some(p=>p.color==='blue'&&p.x===target.x&&p.y===target.y&&p.z===target.z));
 assert.ok(result.pieces.some(p=>p.color==='green'&&p.x===0&&p.y===2&&p.z===0));
 const after={...result,generation:revised,design:model.design},shopping={...emptyShopping(),owned:{'3001:red':2},elementIds:{'3001:red':'1234567'},priceOverrides:{'3001:red':.23},quotes:{'3001:red':{available:100,unitPrice:.23,url:'https://example.com/part',checkedAt:'2026-09-08T00:00:00.000Z'}}};
 const restored=validateProject(JSON.parse(projectJSON(after,shopping)));assert.deepEqual(restored.design,after.design);assert.deepEqual(restored.shopping,shopping);assert.deepEqual(restored.generation,revised);assert.deepEqual(restored.pieces,after.pieces);
 const corrupted=JSON.parse(projectJSON(after,shopping));corrupted.design.manual=emptyManual();assert.throws(()=>validateProject(corrupted),/do not match/);
});
test('legacy projects import without fabricating AI context and legacy scene locks normalize',()=>{const old=validateProject({format:'brickwork',version:2,name:'old',pieces:compileScene(scene).pieces});assert.equal(old.generation,undefined);const normalized=normalizeScene({...scene,shapes:scene.shapes.map(({id,component,repeat,...s})=>s)});assert.ok(normalized.shapes.every(s=>s.id&&s.component&&s.repeat));assert.doesNotThrow(()=>enforceLocks(normalized,validateScene(normalized),['base']));});
test('locks reject direct changes, overlapping recolors, carved space changes and resize',()=>{const next=structuredClone(scene);next.shapes[1].color='blue';assert.throws(()=>enforceLocks(scene,next,['wall']),/locked/);const overlap={...scene,shapes:[...scene.shapes,shape('intrusion',4,2,4,2,3,2,{color:'blue'})]};assert.throws(()=>enforceLocks(scene,overlap,['wall']),/overlaps/);assert.throws(()=>enforceLocks(scene,{...scene,dimensions:{...scene.dimensions,x:25}},['wall']),/same build area/);});
test('packing covers every cell, respects limits, and splits guidance into manageable steps',()=>{const m=compileScene(scene),v=sceneVoxels(scene);assert.equal(m.pieces.reduce((n,p)=>n+p.w*p.h*p.d,0),v.size);assert.equal(auditModel(m.pieces).overlaps,0);assert.ok(m.stages.length>6);for(let i=0;i<m.stages.length;i++)assert.ok(m.pieces.filter(p=>p.stage===i).length<=24);const c=designChecks(m,{...defaultBrief('A facade'),maxPieces:1,maxWidth:16});assert.equal(c.pass,false);assert.ok(c.issues.some(s=>s.includes('piece limit')));assert.ok(c.issues.some(s=>s.includes('dimensions')));});
test('hollow interiors retain external cells and reduce occupied material',()=>{const solid={...scene,shapes:[shape('block',0,0,0,24,30,16)]},a=compileScene(solid),b=compileScene(solid,{hollow:true});const volume=m=>m.pieces.reduce((n,p)=>n+p.w*p.h*p.d,0);assert.ok(volume(b)<volume(a));assert.equal(auditModel(b.pieces).ungrounded.length,0);const occupied=new Set();for(const p of b.pieces)for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++)occupied.add(`${x},${y},${z}`);for(let y=0;y<30;y++)assert.ok(occupied.has(`0,${y},0`));});
test('visual review receives actual images and current revision; omitted feature coverage fails',async()=>{const brief={...defaultBrief('A facade'),features:['Gold windows']},review={summary:'Visible facade',recognizable:true,features:[{feature:'Gold windows',status:'visible',evidence:'Five yellow windows'}],improvements:[],revision:{status:'missing',evidence:'No staircase is visible.'}};let body;const fetcher=async(_url,req)=>{body=JSON.parse(req.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});};const r=await reviewDesign(brief,['data:image/jpeg;base64,abc','data:image/jpeg;base64,def','data:image/jpeg;base64,ghi'],'key','model',new AbortController().signal,fetcher,'Add a staircase');assert.equal(r.revision.status,'missing');assert.equal(body.input[0].content.filter(c=>c.type==='input_image').length,3);assert.equal(JSON.parse(body.input[0].content[0].text).revision,'Add a staircase');review.features=[];await assert.rejects(()=>reviewDesign(brief,[],'key','model',new AbortController().signal,fetcher),/every required feature/);});

// A body of the given extents standing on a base: one tall column per footprint corner is enough for the extent test.
const body=(x,z,y)=>({pieces:[piece(0,0,0,{w:1,h:2,d:1}),piece(0,2,0,{w:x,h:y,d:z})]});
test('the proportion check accepts a declared vertical exaggeration anywhere from true to exaggerated heights',()=>{
 const target={x:40,y:20,z:8,vertical:2};
 for(const y of [10,15,20])assert.equal(proportionCheck(body(40,8,y),target).pass,true,String(y));
 for(const y of [5,30])assert.equal(proportionCheck(body(40,8,y),target).pass,false,String(y));
 // Without the declaration only the planned height passes.
 assert.equal(proportionCheck(body(40,8,10),{x:40,y:20,z:8}).pass,false);assert.equal(proportionCheck(body(40,8,20),{x:40,y:20,z:8}).pass,true);
 assert.ok(proportionCheck(body(40,8,30),target).error>.25);assert.equal(proportionCheck(body(40,8,20),target).error,0);
});
test('a faithful section may show less of its length but keeps its cross-section, and designChecks honors it',()=>{
 const target={x:46,y:30,z:20,vertical:1},section={fit:'section'};
 assert.equal(proportionCheck(body(30,20,30),target,section).pass,true,'a partial length');assert.equal(proportionCheck(body(46,20,30),target,section).pass,true);
 assert.equal(proportionCheck(body(46,7,10),target,section).pass,false,'shrinking everything is not a section');
 assert.equal(proportionCheck(body(30,20,30),target).pass,false,'the same partial fails as a whole subject');
 const model={...compileScene(scene),generation:scene},b=defaultBrief('A facade');
 const flagged=designChecks(model,b,{x:60,y:18,z:5}),section_=designChecks(model,b,{x:60,y:18,z:5},section);
 assert.ok(flagged.issues.some(i=>/proportions differ/.test(i)));assert.ok(!section_.issues.some(i=>/proportions differ/.test(i)),section_.issues.join(' '));
 assert.equal(typeof flagged.proportion.error,'number');assert.deepEqual(flagged.loose,[]);
});
