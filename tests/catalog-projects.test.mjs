import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/generated-scene";export * from "./lib/design-project";export {validateProject} from "./lib/models";export {pieceCellOffsets,piecesIntersect} from "./lib/part-spatial";export {catalogPart} from "./lib/part-catalog";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {compileScene,validateScene,catalogPiece,defaultBrief,emptyManual,emptyShopping,referenceKey,projectJSON,editModel,validateProject,pieceCellOffsets,piecesIntersect,catalogPart}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=catalog-projects-test-bundle.mjs').toString('base64'));
const box=(id,x,y,z,w,h,d,extra={})=>({id,component:id,label:id,kind:'box',operation:'add',color:'tan',position:{x,y,z},size:{x:w,y:h,z:d},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
const part=(id,pid,x,y,z,extra={})=>box(id,x,y,z,1,1,1,{kind:'part',part:pid,face:'pz',color:catalogPart(pid)?.colors[0]||'gray',...extra});
const brief={...defaultBrief('A building study with catalog architectural elements'),finish:'studded'};
const photos=['YQ==','Yg==','Yw=='].map(encoded=>'data:image/jpeg;base64,'+encoded);
const reference={photo:photos[0],photos:photos.slice(1),identityHint:'Architectural study from the supplied photos',briefKey:referenceKey(brief),sheet:{searchable:false,kind:'building',subject:'Architectural study',summary:'Reference images for the facade and arch.',identity:{status:'generic',location:'',question:''},contextAdequate:true,length_m:null,width_m:null,height_m:null,proportions:'A low display base with a tall architectural element.',colors:['tan'],silhouette:[],distinctive:[],sources:[]}};
const buildModel=shapes=>{
 const generation=validateScene({catalogVersion:1,name:'Saved catalog study',description:'Real catalog parts in an editable project.',dimensions:{x:20,y:24,z:16},shapes:[box('Base',0,0,0,16,2,12),...shapes]});
 return {...compileScene(generation),generation,design:{brief,reference,manual:emptyManual(),locked:[],revisions:[{request:'Use real architectural parts',summary:'Added catalog elements.',at:'2026-10-11T18:00:00.000Z'}]}};
};
const reopen=(model,shopping=emptyShopping())=>validateProject(JSON.parse(projectJSON(model,shopping)));

test('a tall suffix-ID part retains exact manual cells, canonical yaw, shopping and all photos after reopening',()=>{
 const model=buildModel([part('Tall architectural brick','2454b',3,2,3,{face:'nx',color:'gray'})]),original=model.pieces.find(p=>p.part==='2454b');
 assert.equal(original.h,15);assert.equal(original.face,'nx');assert.equal(original.rotated,true);
 // Rotation and recoloring must register as a protected manual replacement,
 // even when the replacement has the same bounding-box dimensions.
 const edited=editModel(model,model.pieces.map(p=>p===original?{...p,face:'px',color:'red'}:p)),manual=edited.design.manual;
 assert.deepEqual(manual.erase[0].cells,pieceCellOffsets(original));assert.equal(manual.bricks.length,1);assert.equal(manual.bricks[0].face,'px');assert.equal(manual.bricks[0].h,15);
 const shopping={owned:{'2454b:red':2},elementIds:{'2454b:red':'6380191'},priceOverrides:{'2454b:red':0.44},quotes:{'2454b:red':{available:30,unitPrice:0.44,url:'https://example.test/parts/2454b',checkedAt:'2026-10-11T18:05:00.000Z'}}};
 const restored=reopen(edited,shopping),tall=restored.pieces.find(p=>p.part==='2454b');
 assert.equal(tall.color,'red');assert.equal(tall.face,'px');assert.equal(tall.rotated,true);assert.deepEqual([tall.w,tall.h,tall.d],[1,15,2]);
 assert.deepEqual(restored.pieces,edited.pieces);assert.deepEqual(restored.generation,edited.generation);assert.deepEqual(restored.design,edited.design);assert.deepEqual(restored.shopping,shopping);
 assert.deepEqual([restored.design.reference.photo,...restored.design.reference.photos],photos);
 const tampered=JSON.parse(projectJSON(edited,shopping));tampered.design.manual.bricks[0].face='nx';assert.throws(()=>validateProject(tampered),/do not match/,'A persisted yaw change must not pass as the same protected piece.');
});

test('deleting real arch 6060 preserves an independent brick in its opening through editModel and reopen',()=>{
 const archShape=part('Curved arch','6060',3,2,3),insideShape=part('Brick in opening','3005',3,2,6,{color:'blue'}),archPiece=catalogPiece(archShape),insidePiece=catalogPiece(insideShape);
 assert.ok(insidePiece.x>=archPiece.x&&insidePiece.x+insidePiece.w<=archPiece.x+archPiece.w);assert.ok(insidePiece.y>=archPiece.y&&insidePiece.y+insidePiece.h<=archPiece.y+archPiece.h);assert.ok(insidePiece.z>=archPiece.z&&insidePiece.z+insidePiece.d<=archPiece.z+archPiece.d);assert.equal(piecesIntersect(archPiece,insidePiece),false);
 const model=buildModel([archShape,insideShape]),arch=model.pieces.find(p=>p.part==='6060'),edited=editModel(model,model.pieces.filter(p=>p!==arch));
 const retained=m=>m.pieces.find(p=>p.part==='3005'&&p.color==='blue'&&p.x===3&&p.y===2&&p.z===6);
 assert.ok(retained(edited));assert.ok(!edited.pieces.some(p=>p.part==='6060'));assert.deepEqual(edited.design.manual.erase[0].cells,pieceCellOffsets(arch));
 assert.ok(edited.design.manual.erase[0].cells.length<arch.w*arch.h*arch.d,'The deletion stores actual material, not the arch bounding box.');
 const restored=reopen(edited);assert.ok(retained(restored));assert.ok(!restored.pieces.some(p=>p.part==='6060'));const canonical=pieces=>pieces.map(p=>({...p,face:p.face||(p.rotated?'px':'pz')}));assert.deepEqual(canonical(restored.pieces),canonical(edited.pieces));assert.deepEqual(restored.design.manual,edited.design.manual);assert.deepEqual(restored.design.reference,reference);
 // The original scene stays available for later AI refinement; the exact
 // manual erasure, rather than deleting the history, keeps this arch removed.
 assert.ok(restored.generation.shapes.some(s=>s.part==='6060'));
});
