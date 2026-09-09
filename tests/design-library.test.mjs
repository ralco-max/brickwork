import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/design-library";export * from "./lib/models";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('a design packs to a project file and unpacks with its id, name and bricks intact',()=>{
 const model={...m.generateRecipe('lighthouse','small'),libraryId:'abc',name:'My light',source:'custom'};
 const saved=m.packDesign({...model,shopping:{owned:{},elementIds:{},priceOverrides:{},quotes:{}}},'design');
 assert.equal(saved.id,'abc');assert.equal(saved.status,'design');assert.equal(saved.pieceCount,model.pieces.length);assert.ok(saved.project.length>1000);
 const back=m.unpackDesign(saved);
 assert.equal(back.libraryId,'abc');assert.equal(back.name,'My light');assert.equal(back.pieces.length,model.pieces.length);assert.deepEqual(back.pieces.map(p=>[p.part,p.x,p.y,p.z]),model.pieces.map(p=>[p.part,p.x,p.y,p.z]));
});
test('a saved design whose scene no longer repacks identically is rebuilt from its scene, keeping it revisable',()=>{
 const model={...m.generateRecipe('rocket','small'),libraryId:'r1',source:'custom'};
 const saved=m.packDesign(model,'draft');
 const data=JSON.parse(saved.project);data.generation={name:'x',description:'',dimensions:{x:8,y:8,z:8},shapes:[{label:'b',kind:'box',operation:'add',color:'red',position:{x:0,y:0,z:0},size:{x:2,y:2,z:2},end:{x:0,y:0,z:0},radius:1}]};
 const back=m.unpackDesign({...saved,project:JSON.stringify(data)});
 assert.ok(back.generation&&back.generation.shapes.length===1);assert.equal(back.libraryId,'r1');assert.ok(back.pieces.length>0);
});
test('packing without a library id is refused',()=>{assert.throws(()=>m.packDesign(m.generateRecipe('castle','small'),'design'));});
