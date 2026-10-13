import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';

// Deliberately synthetic masks exercise spatial rules independently of a source-library
// update. These fixture IDs are never shipped in the production parts catalog.
const fixture=(name,w,d,h,occupancy,topStuds,bottomSockets,family='Arch')=>({name,w,d,h,price:.2,family,colors:['red'],occupancy,topStuds,bottomSockets,ldrawOffset:[-4,-16,6],mesh:'',thumbnail:'',sourcePart:name});
const parts={
 'fixture-arch':fixture('Fixture arch',3,1,3,[[0,0,0],[0,1,0],[0,2,0],[1,2,0],[2,0,0],[2,1,0],[2,2,0]],[[0,3,0],[1,3,0],[2,3,0]],[[0,0,0],[2,0,0]]),
 'fixture-hook':fixture('Fixture hook',2,1,2,[[0,0,0],[0,1,0],[1,1,0]],[[0,2,0],[1,2,0]],[[0,0,0],[1,1,0]]),
 'fixture-plate':fixture('Fixture plate',3,1,1,[[0,0,0],[1,0,0],[2,0,0]],[[0,1,0],[1,1,0],[2,1,0]],[[0,0,0],[1,0,0],[2,0,0]],'Plate'),
};
const bundle=await build({stdin:{contents:'export * from "./lib/part-spatial";export * from "./lib/bridge";export * from "./lib/models";export {simulateClutch} from "./lib/clutch";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error',plugins:[{name:'spatial-fixtures',setup(build){build.onResolve({filter:/\/part-catalog$/},()=>({path:'spatial-fixtures',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const EXPANDED_PARTS=${JSON.stringify(parts)};export const catalogPart=id=>EXPANDED_PARTS[id];export const fittedElement=()=>undefined;export const fittedColor=()=>undefined;export const FITTED_ELEMENTS={};export const PART_CATALOG_INFO={version:1};`,loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const make=(part,x=0,y=0,z=0,face='pz',id=0)=>({id,part,color:'red',x,y,z,...m.partDimensions(part,false,face),stage:0});
const sort=cells=>[...cells].map(c=>c.join(',')).sort();

test('asymmetric footprints and recessed connectors rotate in all four directions and reuse cached arrays',()=>{
 const expected={pz:['0,0,0','0,1,0','1,1,0'],px:['0,0,1','0,1,1','0,1,0'],nz:['1,0,0','1,1,0','0,1,0'],nx:['0,0,0','0,1,0','0,1,1']};
 for(const face of ['pz','px','nz','nx']){
  const p=make('fixture-hook',5,7,9,face),cells=m.pieceCellOffsets(p);
  assert.deepEqual(sort(cells),expected[face].sort(),face);
  assert.strictEqual(m.pieceCellOffsets({...p,x:99,y:22}),cells,'placement does not allocate another transformed mask');
  assert.equal(m.bottomConnectorOffsets(p).length,2);assert.ok(m.bottomConnectorOffsets(p).some(([,y])=>y===1));
  assert.deepEqual(sort(m.pieceCells(p)),sort(cells.map(([x,y,z])=>[x+5,y+7,z+9])));
 }
});

test('empty arch space remains usable without inventing an underside stud connection',()=>{
 const arch=make('fixture-arch',0,3,0,'pz',1),middle=make('3005',1,0,0);
 assert.equal(m.auditModel([middle,arch]).groups,2);assert.deepEqual(m.auditModel([middle,arch]).ungrounded,[1]);
 assert.deepEqual(m.simulateClutch([middle,arch]).floating,[1]);
 const foot=make('3005',0,0,0);assert.equal(m.auditModel([foot,arch]).groups,1);assert.deepEqual(m.simulateClutch([foot,arch]).floating,[]);
 const grounded=make('fixture-arch'),inside=make('3024',1,0,0,'pz',1);
 assert.equal(m.piecesIntersect(grounded,inside),false);assert.equal(m.auditModel([grounded,inside]).overlaps,0);
 assert.equal(m.addPiece([grounded],'3024','red',1,0,0).length,2);
 assert.throws(()=>m.addPiece([grounded],'3024','red',0,0,0),/occupied/);
 assert.equal(m.validateProject({pieces:[grounded,inside]}).pieces.length,2);
});

test('recessed bottom sockets connect at their actual interface height',()=>{
 const hook=make('fixture-hook',0,1,0,'pz',1),support=make('3024',1,1,0),ground=make('3024',1,0,0,'pz',2);
 const pieces=[support,hook,ground],audit=m.auditModel(pieces);
 assert.equal(audit.overlaps,0);assert.equal(audit.groups,1);assert.deepEqual(audit.ungrounded,[]);assert.deepEqual(m.simulateClutch(pieces).floating,[]);
 const atBoundingBottom=make('3024',1,0,0);assert.equal(m.auditModel([atBoundingBottom,hook]).groups,2);
});

test('repair columns target real sockets and imports retain authoritative rotated extents',()=>{
 const arch=make('fixture-arch',0,6,0,'px');
 const repaired=m.supportLoosePieces([arch]);assert.ok(repaired.added>0);assert.equal(m.auditModel(repaired.pieces).ungrounded.length,0);
 for(const p of repaired.pieces.filter(p=>p.support))assert.ok(p.x===0&&(p.z===0||p.z===2),'no support through the arch opening');
 for(const face of ['pz','px','nz','nx']){
  const p=make('fixture-hook',0,0,0,face),restored=m.validateProject({pieces:[{...p,w:88,d:88,h:88}]}).pieces[0];
  assert.equal(restored.face,face);assert.equal(restored.w,p.w);assert.equal(restored.d,p.d);assert.equal(restored.h,p.h);
 }
});

test('explicit plates survive smoothing and partial shapes do not hide unrelated exposed cells',()=>{
 const explicit=make('3023',0,2,0);
 assert.equal(m.smoothTops([explicit],new Set([explicit]))[0].part,'3023');
 assert.equal(m.smoothTops([explicit])[0].part,'3069b');
 const supporting=make('3024',1,2,0,'pz',2),hook=make('fixture-hook',0,2,0,'pz',3);
 assert.equal(m.smoothTops([supporting,hook],new Set([hook]))[0].part,'3024','recessed socket must retain the stud beneath it');
 const underGap=make('3024',1,2,0),arch=make('fixture-arch',0,3,0,'pz',1);
 assert.equal(m.smoothTops([underGap,arch],new Set([arch]))[0].part,'3070b','empty arch space must not hide an exposed plate');
});

test('expanded voxel packing is opt-in and honors observed part colors',()=>{
 const voxels=color=>new Map(['0,3,0','1,3,0','2,3,0'].map(k=>[k,color]));
 assert.ok(m.packVoxels(voxels('red')).every(p=>p.part!=='fixture-plate'));
 assert.deepEqual(m.packVoxels(voxels('red'),{expanded:true}).map(p=>p.part),['fixture-plate']);
 assert.ok(m.packVoxels(voxels('blue'),{expanded:true}).every(p=>p.part!=='fixture-plate'));
});

test('LDraw export uses the source origin and the same four yaw transforms as spatial masks',()=>{
 const offsets={pz:[-4,-16,6],px:[6,-16,44],nz:[44,-16,14],nx:[14,-16,-4]};
 for(const face of ['pz','px','nz','nx']){
  const p=make('fixture-hook',3,5,7,face),line=m.ldrawFile([p],'fixture',[{title:'one',text:''}]).split('\n').find(line=>line.startsWith('1 '));
  const [x,y,z]=line.split(' ').slice(2,5).map(Number),expected=offsets[face];
  assert.deepEqual([x,y,z],[60+expected[0],-40+expected[1],140+expected[2]],face);
 }
});
