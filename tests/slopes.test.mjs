import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/generated-scene";export {auditModel,SLOPES,PARTS,studCells} from "./lib/bridge";export {simulateClutch} from "./lib/clutch";export {validateProject,addPiece,finishModel} from "./lib/models";export {shellPlan} from "./lib/design-research";export {generateScene,MASSING_INSTRUCTIONS,DETAIL_INSTRUCTIONS} from "./lib/generation-provider";export {critiqueMassing} from "./lib/design-review";export {defaultBrief} from "./lib/design-project";export {pickExamples,DESIGN_EXAMPLES} from "./lib/design-examples";export {isWheel} from "./lib/bridge";export {componentBudget} from "./lib/generated-scene";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {compileScene,sceneVoxels,auditModel,SLOPES,PARTS,studCells,simulateClutch,validateProject,addPiece,shellPlan,SceneStreamParser,compactScene,mergeRevision,generateScene,MASSING_INSTRUCTIONS,DETAIL_INSTRUCTIONS,critiqueMassing,defaultBrief,expandCompactShape,validateScene,pickExamples,DESIGN_EXAMPLES,isWheel,componentBudget}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const shape=(label,kind,color,position,size,extra={})=>({label,kind,color,position,size,operation:'add',end:{x:0,y:0,z:0},radius:1,...extra});
const house={name:'House',description:'',dimensions:{x:24,y:40,z:24},shapes:[shape('base','box','gray',{x:0,y:0,z:0},{x:24,y:2,z:24}),shape('walls','box','tan',{x:4,y:2,z:4},{x:16,y:18,z:12}),...Array.from({length:6},(_,i)=>shape('roof'+i,'box','red',{x:3,y:20+i*3,z:3+i},{x:18,y:3,z:14-2*i}))]};
const box={name:'Box',description:'',dimensions:{x:16,y:20,z:16},shapes:[shape('base','box','gray',{x:0,y:0,z:0},{x:16,y:2,z:16}),shape('block','box','blue',{x:2,y:2,z:2},{x:12,y:15,z:12})]};
const coverage=(model,scene)=>{const cells=new Set();let overlaps=0;for(const p of model.pieces)for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++){const k=`${x},${y},${z}`;if(cells.has(k))overlaps++;cells.add(k);}const missing=[...sceneVoxels(scene).keys()].filter(k=>!cells.has(k));return {overlaps,missing};};

test('a stepped pitched roof comes out with 45 degree slopes, inverted slopes under the eaves, and stays buildable',()=>{
 const m=compileScene(house),parts=new Set(m.pieces.map(p=>p.part));
 assert.ok(parts.has('3039')||parts.has('3040'),'45 degree slopes on the pitch');assert.ok(parts.has('3665'),'inverted slopes under the eaves');
 const audit=auditModel(m.pieces),clutch=simulateClutch(m.pieces),{overlaps,missing}=coverage(m,house);
 assert.equal(overlaps,0);assert.equal(missing.length,0);assert.equal(audit.unsupported.length,0);assert.equal(audit.groups,1);assert.equal(clutch.floating.length,0);assert.equal(clutch.overloaded.length,0);
 for(const p of m.pieces.filter(p=>SLOPES[p.part])){const s=PARTS[p.part];assert.ok(p.face,'every slope has a face');assert.equal(p.w,p.rotated?s.d:s.w);assert.equal(p.d,p.rotated?s.w:s.d);assert.equal(p.h,s.h);assert.equal(p.rotated,p.face==='px'||p.face==='nx');}
 const plain=compileScene(house,{slopes:false});assert.ok(plain.pieces.every(p=>!SLOPES[p.part]));
});
test('flat roof edges stay square, and a hanging inverted slope is a clutch joint rather than a floating piece',()=>{
 assert.ok(compileScene(box).pieces.every(p=>!SLOPES[p.part]),'no slope on a plain box');
 const m=compileScene(house),clutch=simulateClutch(m.pieces),inverted=m.pieces.filter(p=>p.part==='3665');
 assert.ok(inverted.length>0);for(const p of inverted)assert.ok(clutch.joints.some(j=>j.piece===p.id&&j.kind==='hanging'),'inverted slope hangs from the course above');
});
test('stud cells follow the part: bricks everywhere, tiles nowhere, studded slopes only on their flat back row',()=>{
 assert.equal(studCells({part:'3001',w:4,d:2}).length,8);assert.equal(studCells({part:'3068b',w:2,d:2}).length,0);assert.equal(studCells({part:'3040',w:2,d:1,face:'pz'}).length,0);
 assert.deepEqual(studCells({part:'3039',w:2,d:2,face:'pz'}),[[0,0],[1,0]]);assert.deepEqual(studCells({part:'3039',w:2,d:2,face:'nz'}),[[0,1],[1,1]]);
 assert.deepEqual(studCells({part:'3039',w:2,d:2,face:'px'}),[[0,0],[0,1]]);assert.deepEqual(studCells({part:'3298',w:3,d:2,face:'nx'}),[[2,0],[2,1]]);
 assert.equal(studCells({part:'3665',w:2,d:1,face:'pz'}).length,2);
});
test('slope faces survive a project round trip and manual placement',()=>{
 const m=compileScene(house),json={format:'brickwork',version:2,name:'h',pieces:m.pieces};
 const back=validateProject(json),faces=new Map(m.pieces.filter(p=>SLOPES[p.part]).map(p=>[`${p.x},${p.y},${p.z}`,p.face]));
 for(const p of back.pieces.filter(p=>SLOPES[p.part]))assert.equal(p.face,faces.get(`${p.x},${p.y},${p.z}`));
 const placed=addPiece([],'3040','red',0,0,0).at(-1);assert.equal(placed.face,'pz');assert.equal(addPiece([],'3040','red',0,0,0,true).at(-1).face,'px');
 assert.throws(()=>addPiece(addPiece([],'3040','red',0,0,0),'3024','red',0,3,0),/smooth/);
});
test('the scale plan sizes a subject to its budget: a full-size bean at 600 pieces is named as too big, at 4,000 it fits',()=>{
 assert.equal(shellPlan({x:10,y:12,z:8},600,'character').walls,0);
 const bean=shellPlan({x:46,y:56,z:30},600,'monument');assert.equal(bean.fits,false);assert.equal(bean.walls,2);assert.ok(bean.estimate>2500&&bean.estimate<3600,'measured: about 3,100 pieces with slopes');assert.ok(bean.recommend.x>=18&&bean.recommend.x<=24);
 const big=shellPlan({x:46,y:56,z:30},4000,'monument');assert.equal(big.fits,true);assert.equal(big.walls,2);
 const tower=shellPlan({x:24,y:120,z:24},4000,'building');assert.equal(tower.fits,true);assert.ok(tower.walls>=2);
 const skin=shellPlan({x:40,y:120,z:40},600,'monument'),lattice=shellPlan({x:40,y:120,z:40},600,'monument',.85);assert.ok(lattice.fits||lattice.recommend.y>skin.recommend.y*1.8,'an open lattice tower is priced by its members, so it builds far larger than a skin would');
 const wall=shellPlan({x:46,y:56,z:30},600,'building');assert.equal(wall.fits,false);assert.equal(wall.walls,1);assert.ok(wall.recommend.x>bean.recommend.x,'a boxy shell packs far better than a curved one');
});
test('signature features travel in the compact header and survive a revision that names none',()=>{
 const scene={...box,signature:['a pitched red roof','the tan walls'],shapes:box.shapes.map(s=>({...s,id:s.label,component:s.label,repeat:{count:1,offset:{x:0,y:0,z:0}}}))};
 const wire=compactScene(scene);assert.deepEqual(wire.f,scene.signature);
 const parser=new SceneStreamParser();parser.push(JSON.stringify(wire));assert.deepEqual(parser.header.signature,scene.signature);
 const merged=mergeRevision(scene,{name:'Box',description:'',dimensions:scene.dimensions},[],[]);assert.deepEqual(merged.signature,scene.signature);
 const renamed=mergeRevision(scene,{name:'Box',description:'',signature:['new'],dimensions:scene.dimensions},[],[]);assert.deepEqual(renamed.signature,['new']);
});
test('massing and detail passes carry their own instructions, output limits and critique',async()=>{
 const bodies=[];const fetcher=async(_url,request)=>{bodies.push(JSON.parse(request.body));return new Response('',{status:401});};
 await assert.rejects(()=>generateScene({prompt:'x',detail:'small',stage:'massing'},'k','m',new AbortController().signal,fetcher).next());
 await assert.rejects(()=>generateScene({prompt:'x',detail:'small',stage:'detail',massingCritique:['raise the towers']},'k','m',new AbortController().signal,fetcher).next());
 await assert.rejects(()=>generateScene({prompt:'x',detail:'small'},'k','m',new AbortController().signal,fetcher).next());
 assert.ok(bodies[0].instructions.endsWith(MASSING_INSTRUCTIONS));assert.equal(bodies[0].max_output_tokens,6000);assert.equal(JSON.parse(bodies[0].input[0].content[0].text).massingCritique,undefined);
 assert.ok(bodies[1].instructions.endsWith(DETAIL_INSTRUCTIONS));assert.deepEqual(JSON.parse(bodies[1].input[0].content[0].text).massingCritique,['raise the towers']);
 assert.ok(!bodies[2].instructions.includes('MASSING PASS')&&!bodies[2].instructions.includes('DETAIL PASS'));
 assert.ok(bodies[0].text.format.schema.required.includes('f'));
});
test('the blockout critique is parsed defensively and judges only scale, proportion and layout',async()=>{
 let sent;const fetcher=async(_url,request)=>{sent=JSON.parse(request.body);return Response.json({status:'completed',usage:{input_tokens:5,output_tokens:5},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Too squat.',scale:'too_small',ready:false,corrections:['Raise the dome from 30 to 56 plates','  ','x'.repeat(900)]})}]}]});};
 const critique=await critiqueMassing(defaultBrief('Cloud Gate'),{searchable:true,kind:'monument',subject:'Cloud Gate',summary:'',length_m:20,width_m:13,height_m:10,proportions:'',colors:[],silhouette:[],distinctive:[],sources:[],target:{x:46,y:56,z:30,vertical:1}},['the seamless skin'],['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,AAAA','data:image/jpeg;base64,AAAA'],'k','m',new AbortController().signal,fetcher);
 assert.equal(critique.scale,'too_small');assert.equal(critique.ready,false);assert.equal(critique.corrections.length,2);assert.ok(critique.corrections[1].length<=400);
 assert.ok(sent.instructions.includes('massing study'));assert.equal(sent.input[0].content.length,4);assert.deepEqual(JSON.parse(sent.input[0].content[0].text).signatureFeatures,['the seamless skin']);
});

test('a lean compiles into stepped courses that overlap, so splayed legs and braces stand on their own',()=>{
 const base=shape('base','box','gray',{x:0,y:0,z:0},{x:40,y:2,z:24});
 const lean=(label,from,to,w=2,ch=3)=>({...shape(label,'lean','brown',from,{x:w,y:ch,z:1},{end:to}),id:label,component:'Legs'});
 const scene={name:'Legs',description:'',dimensions:{x:40,y:60,z:24},shapes:[base,lean('left',{x:4,y:2,z:12},{x:18,y:50,z:12}),lean('right',{x:36,y:2,z:12},{x:22,y:50,z:12}),lean('diag',{x:6,y:2,z:3},{x:20,y:44,z:20},2),lean('plates',{x:34,y:2,z:4},{x:26,y:30,z:4},1,1),shape('deck','box','gray',{x:16,y:50,z:10},{x:8,y:3,z:4})]};
 const m=compileScene(scene),audit=auditModel(m.pieces),clutch=simulateClutch(m.pieces);
 assert.equal(audit.ungrounded.length,0,'every course of a lean stands on the course below');assert.equal(audit.groups,1);assert.equal(audit.unsupported.length,0);assert.equal(clutch.floating.length,0);
 const wire=compactScene(scene);assert.deepEqual(wire.sh[1].e,[18,50,12]);assert.equal(wire.sh[1].k,'lean');
 const back=expandCompactShape({i:'l',c:'L',l:'l',k:'lean',o:'add',a:null,col:'brown',p:[4,2,12],s:[2,3,0],e:[18,50,12],r:null,rep:null});assert.deepEqual(back.end,{x:18,y:50,z:12});assert.deepEqual(back.size,{x:2,y:3,z:1});
 assert.throws(()=>validateScene({...scene,shapes:[lean('out',{x:4,y:2,z:12},{x:60,y:50,z:12})]}),/outside/);
});

test('a wheel shape becomes a real wheel element held on its axle, and the examples compile clean',()=>{
 const car=DESIGN_EXAMPLES.find(e=>e.id==='car').scene;
 const full={name:car.n,description:car.d,dimensions:{x:car.dim[0],y:car.dim[1],z:car.dim[2]},shapes:car.sh.map(c=>expandCompactShape(c))};
 const m=compileScene(full),wheels=m.pieces.filter(p=>isWheel(p.part)),audit=auditModel(m.pieces);
 assert.equal(wheels.length,4);assert.ok(wheels.every(w=>w.part==='56145'&&w.w===4&&w.d===2&&w.h===10&&!w.rotated));
 assert.ok(m.inventory.some(r=>r.part==='56145'&&r.quantity===4),'the parts list carries the wheel element');
 assert.equal(audit.overlaps,0);assert.ok(!audit.disconnected.some(id=>wheels.some(w=>w.id===id)),'wheels attach to their axle box');
 for(const example of DESIGN_EXAMPLES){const scene={name:example.scene.n,description:example.scene.d,dimensions:{x:example.scene.dim[0],y:example.scene.dim[1],z:example.scene.dim[2]},shapes:example.scene.sh.map(c=>expandCompactShape(c))};const built=compileScene(scene),a=auditModel(built.pieces);assert.equal(a.overlaps,0,example.id);assert.ok(a.ungrounded.length<=4,`${example.id} ungrounded ${a.ungrounded.length} (an ellipsoid underside leaves a few one-plate slivers)`);assert.ok(built.pieces.length<1200,`${example.id} pieces ${built.pieces.length}`);}
 assert.deepEqual(pickExamples('A red pickup truck','vehicle').map(e=>e.id)[0],'car');assert.deepEqual(pickExamples('The Eiffel Tower','monument').map(e=>e.id)[0],'lattice');assert.equal(pickExamples('something unusual').length,2);
});

test('the component budget attributes the packed pieces to the components that own the cells, wheels counted as one each',()=>{
 const car=DESIGN_EXAMPLES.find(e=>e.id==='car').scene;
 const full={name:car.n,description:car.d,dimensions:{x:car.dim[0],y:car.dim[1],z:car.dim[2]},shapes:car.sh.map(c=>expandCompactShape(c))};
 const m=compileScene(full),by=componentBudget(full,m.pieces.length);
 assert.equal(by.reduce((n,r)=>n+r.pieces,0),m.pieces.length,'every packed piece is charged to a component');
 assert.equal(by.find(r=>r.component==='Wheels').pieces,4);assert.ok(by.find(r=>r.component==='Base').pieces<by.find(r=>r.component==='Body').pieces,'a dense base packs into few plates');
});
