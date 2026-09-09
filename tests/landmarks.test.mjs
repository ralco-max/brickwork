import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/models";export * from "./lib/bridge";export * from "./lib/generated-scene";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const landmarks=[['bridge','Golden Gate Bridge'],['castle','Neuschwanstein Castle'],['lighthouse','Cape Hatteras Lighthouse'],['rocket','Saturn V']];
test('each landmark preset is a large, deterministic, overlap-free model under the height ceiling',()=>{
 for(const [recipe,name] of landmarks)for(const detail of ['small','medium','large']){
  const model=m.generateRecipe(recipe,detail),again=m.generateRecipe(recipe,detail),audit=m.auditModel(model.pieces);
  assert.equal(model.name,name);assert.ok(model.pieces.length>500&&model.pieces.length<16000,`${recipe} ${detail}: ${model.pieces.length} pieces`);
  assert.equal(audit.overlaps,0);assert.ok(model.height<=240);assert.equal(JSON.stringify(model.pieces),JSON.stringify(again.pieces));
  assert.ok(audit.unsupported.length/model.pieces.length<.2,`${recipe} ${detail}: ${audit.unsupported.length} unsupported of ${model.pieces.length}`);
  assert.ok(model.pieces.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&Number.isInteger(p.z)&&p.y>=0));
 }
});
test('landmark names, prompts and idea parsing agree',()=>{
 assert.equal(m.parseIdea('Build Neuschwanstein for my desk').recipe,'castle');assert.equal(m.parseIdea('the cape hatteras light').recipe,'lighthouse');assert.equal(m.parseIdea('an apollo launch').recipe,'rocket');
 for(const [recipe] of landmarks){const r=m.RECIPES.find(r=>r.id===recipe);assert.equal(m.parseIdea(r.prompt).recipe,recipe);}
});
test('the packer anchors overhangs to the mass beneath them instead of leaving loose plates',()=>{
 // A roof slab with a one-stud eave all round, and a lintel bridging a doorway: every plate must rest on something placed before it.
 const voxels=new Map();
 for(let x=2;x<8;x++)for(let y=0;y<6;y++)for(let z=2;z<8;z++)voxels.set(`${x},${y},${z}`,'tan');
 for(let x=1;x<9;x++)for(let z=1;z<9;z++)voxels.set(`${x},6,${z}`,'red');
 for(let x=3;x<7;x++)for(let y=2;y<5;y++)voxels.set(`${x},${y},7`,'black');
 for(let x=3;x<7;x++)for(let y=0;y<5;y++)voxels.delete(`${x},${y},2`);
 const pieces=m.packVoxels(voxels),audit=m.auditModel(pieces);
 assert.equal(audit.overlaps,0);assert.deepEqual(audit.unsupported,[]);assert.deepEqual(audit.disconnected,[]);
});
test('thin one-stud ledges use long single-row plates and bricks',()=>{
 const voxels=new Map();for(let x=0;x<8;x++)for(let y=0;y<4;y++)voxels.set(`${x},${y},0`,'tan');
 const parts=new Set(m.packVoxels(voxels).map(p=>p.part));
 assert.ok(parts.has('3460')||parts.has('3008'),[...parts].join(','));
});
test('tidyVoxels removes slivers and floating clusters but keeps columns and embedded details',()=>{
 const voxels=new Map();
 for(let x=0;x<6;x++)for(let y=0;y<6;y++)for(let z=0;z<4;z++)voxels.set(`${x},${y},${z}`,'gray');
 voxels.set('3,6,1','red');voxels.set('3,7,1','red');voxels.set('3,8,1','red');   // a column: keep
 voxels.set('2,3,3','navy');                                                       // a window cell set into the face: keep
 voxels.set('6,3,1','tan');                                                        // a nub with one side neighbour and nothing above or below: remove
 voxels.set('9,9,9','tan');voxels.set('9,10,9','tan');                             // floating cluster: remove
 const removed=m.tidyVoxels(voxels);
 assert.equal(removed,3);assert.ok(voxels.has('3,8,1'));assert.equal(voxels.get('2,3,3'),'navy');assert.ok(!voxels.has('6,3,1'));assert.ok(!voxels.has('9,9,9'));
});
test('smooth finish turns fully exposed plates into tiles and leaves covered plates and the base alone',()=>{
 const voxels=new Map();for(let x=0;x<8;x++)for(let z=0;z<4;z++)for(let y=0;y<2;y++)voxels.set(`${x},${y},${z}`,'gray');
 for(let x=0;x<8;x++)for(let z=0;z<2;z++)voxels.set(`${x},2,${z}`,x<4?'red':'tan');   // a red and a tan 2x4 plate on the base
 voxels.set('4,3,0','blue');                                                // one blue stud covers a cell of the second plate
 const pieces=m.packVoxels(voxels),smooth=m.smoothTops(pieces);
 assert.equal(smooth.length,pieces.length);
 const left=smooth.find(p=>p.y===2&&p.x===0),right=smooth.find(p=>p.y===2&&p.x===4),stud=smooth.find(p=>p.y===3);
 assert.equal(left.part,'87079');assert.equal(right.part,'3020');assert.equal(stud.part,'3070b');
 assert.ok(smooth.filter(p=>p.y<2).every(p=>!m.isTile(p.part)));
});
