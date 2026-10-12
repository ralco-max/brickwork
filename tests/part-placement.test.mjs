import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {placeOnTopStud} from "./app/part-placement";export {bottomConnectorOffsets,topConnectorOffsets,pieceCellOffsets,piecesIntersect} from "./lib/part-spatial";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const support={id:0,part:'3005',color:'red',x:10,y:0,z:10,w:1,d:1,h:3,rotated:false,stage:0};
const point={x:10.5,y:3.4,z:10.5};

test('click placement seats the raised socket of29120 on the clicked stud in all four orientations',()=>{
 for(const face of ['pz','px','nz','nx']){
  const result=m.placeOnTopStud([support],'29120','red',face,support,point),placed=result.pieces.at(-1);
  assert.equal(placed.y,2);assert.equal(placed.face,face);assert.equal(placed.rotated,face==='px'||face==='nx');assert.equal(m.piecesIntersect(support,placed),false);
  assert.ok(m.bottomConnectorOffsets(placed).some(([x,y,z])=>placed.x+x===10&&placed.y+y===3&&placed.z+z===10));
  assert.deepEqual(result.position,{x:placed.x,y:placed.y,z:placed.z});
 }
});

test('click placement rejects collisions and smooth or distant surfaces instead of floating the shape',()=>{
 const placed=m.placeOnTopStud([support],'29120','red','pz',support,point).pieces.at(-1),cell=m.pieceCellOffsets(placed).find(([x,y,z])=>placed.x+x!==10||placed.z+z!==10||placed.y+y>=3);
 assert.ok(cell);const blocker={id:1,part:'3024',color:'red',x:placed.x+cell[0],y:placed.y+cell[1],z:placed.z+cell[2],w:1,d:1,h:1,rotated:false,stage:0};
 assert.throws(()=>m.placeOnTopStud([support,blocker],'29120','red','pz',support,point),/collision/);
 const tile={...support,part:'3070b',h:1};assert.throws(()=>m.placeOnTopStud([tile],'29120','red','pz',tile,{...point,y:1}),/visible stud/);
 assert.throws(()=>m.placeOnTopStud([support],'29120','red','pz',support,{...point,x:15}),/visible stud/);
});
