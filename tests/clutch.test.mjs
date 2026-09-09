import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/clutch";export * from "./lib/models";export * from "./lib/bridge";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const piece=(id,part,x,y,z,rotated=false)=>{const s=m.PARTS[part];return {id,part,color:'red',x,y,z,w:rotated?s.d:s.w,d:rotated?s.w:s.d,h:s.h,rotated,stage:0};};
test('a solid stack has no overloaded joints and a sensible mass',()=>{
 const pieces=[];let id=0;for(let y=0;y<12;y+=3)for(let x=0;x<8;x+=4)pieces.push(piece(id++,'3001',x,y,0));
 const r=m.simulateClutch(pieces);assert.deepEqual(r.overloaded,[]);assert.deepEqual(r.floating,[]);assert.ok(r.grams>15&&r.grams<25,String(r.grams));
});
test('a long plate held by one stud at its end with mass on the far end levers past its clutch',()=>{
 const pieces=[piece(0,'3005',0,0,0),piece(1,'3460',0,3,0)];   // 1x1 brick, 1x8 plate on top of it, hanging out 7 studs
 let id=2;for(let y=4;y<22;y+=3)pieces.push(piece(id++,'3001',5,y,0)); // 2x4 bricks stacked on the far end
 const r=m.simulateClutch(pieces);
 assert.ok(r.overloaded.includes(1),JSON.stringify([...r.ratios]));assert.equal(r.joints.find(j=>j.piece===1).kind,'cantilever');
});
test('hanging pieces pull on the studs above them, more mass raises the ratio, and floating pieces are infinite',()=>{
 const tower=[];let id=0;for(let y=0;y<60;y+=3)tower.push(piece(id++,'3001',0,y,0));tower.push(piece(id++,'3034',0,60,0)); // 2x8 plate on a tall tower, tip at x 4..7
 const hook=piece(id++,'3005',7,57,0);                                                                       // 1x1 brick hanging from one stud under the tip
 const light=m.simulateClutch([...tower,hook]);const j=light.joints.find(j=>j.piece===hook.id);assert.equal(j.kind,'hanging');assert.equal(j.studs,1);assert.ok(j.ratio<1);
 const chain=[...tower,hook];for(let y=54;y>=3;y-=3)chain.push(piece(id++,'3001',4,y,0));                    // 2x4 bricks hanging below the hook, never touching the ground
 const heavy=m.simulateClutch(chain);const k=heavy.joints.find(j=>j.piece===hook.id);assert.ok(k.ratio>j.ratio*10,`${j.ratio} -> ${k.ratio}`);assert.ok(!heavy.floating.length);
 const adrift=m.simulateClutch([...tower,piece(99,'3005',20,20,20)]);assert.deepEqual(adrift.floating,[99]);assert.equal(adrift.ratios.get(99),Infinity);assert.ok(adrift.overloaded.includes(99));
});
test('added supports are tagged, removable, and the removal restores the piece count',()=>{
 const voxels=new Map();for(let x=0;x<8;x++)for(let z=0;z<2;z++)voxels.set(`${x},0,${z}`,'gray');for(let x=6;x<8;x++)for(let z=0;z<2;z++)voxels.set(`${x},9,${z}`,'red');
 const model=m.finishModel(m.packVoxels(voxels),{name:'t',description:'',source:'custom'});
 const supported=m.supportLoosePieces(model.pieces);assert.ok(supported.added>0);assert.ok(supported.pieces.filter(p=>p.support).length===supported.added);
 const withSupports=m.finishModel(supported.pieces,{name:'t',description:'',source:'custom'});
 const back=m.removeSupports(withSupports);assert.equal(back.removed,supported.added);assert.equal(back.model.pieces.length,model.pieces.length);assert.ok(back.model.pieces.every(p=>!p.support));
 const project=m.validateProject(JSON.parse(JSON.stringify({pieces:withSupports.pieces,name:'t'})));assert.equal(project.pieces.filter(p=>p.support).length,supported.added);
});
