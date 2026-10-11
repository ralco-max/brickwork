import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./app/part-picker-data";export {PARTS,COLORS} from "./lib/bridge";export {catalogPart} from "./lib/part-catalog";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const options=[
 {id:'3001',name:'Brick 2 × 4',family:'bricks',w:4,d:2,h:3},
 {id:'3020',name:'Plate 2 × 4',family:'plates',w:4,d:2,h:1},
 {id:'11477',name:'Slope Curved 2 × 1',family:'curved-slopes',w:1,d:2,h:2},
 {id:'41769',name:'Wedge Plate 4 × 2 Left',family:'wedge-plates',w:2,d:4,h:1,handedness:'left',counterpart:'41770'},
 {id:'41770',name:'Wedge Plate 4 × 2 Right',family:'wedge-plates',w:2,d:4,h:1,handedness:'right',counterpart:'41769'},
];

test('part searches combine shape words, dimensions and handedness without requiring exact punctuation',()=>{
 assert.deepEqual(m.searchParts(options,'curved slope').map(p=>p.id),['11477']);
 assert.deepEqual(m.searchParts(options,'2x4','plates').map(p=>p.id),['3020']);
 assert.deepEqual(m.searchParts(options,'2 × 4 plate right').map(p=>p.id),['41770']);
 assert.deepEqual(m.searchParts(options,'41769').map(p=>p.id),['41769']);
 assert.deepEqual(m.searchParts(options,'3x7'),[]);
 assert.deepEqual(m.searchParts(options,'','wedge-plates').map(p=>p.id),['41769','41770']);
});

test('exact part IDs rank first and the complete catalog remains discoverable through bounded pages',()=>{
 const matches=m.searchParts([{...options[0],id:'13001'},options[0]],'3001');assert.equal(matches[0].id,'3001');
 const many=Array.from({length:253},(_,i)=>({...options[0],id:String(10000+i)}));
 const seen=[];for(let i=0;i<11;i++){const page=m.partPage(many,i);assert.ok(page.results.length<=24);assert.equal(page.pages,11);seen.push(...page.results.map(p=>p.id));}
 assert.equal(new Set(seen).size,253);assert.equal(m.partPage(many,999).page,10);assert.equal(m.partPage(many,-3).page,0);assert.deepEqual(m.partPage([],4),{page:0,pages:1,results:[]});
});

test('picker includes every placeable catalog part and respects known colors rather than silently switching',()=>{
 const actual=m.catalogOptions();assert.equal(actual.length,Object.keys(m.PARTS).length);assert.ok(actual.length>=250);
 for(const option of actual){assert.equal(option.name,m.PARTS[option.id].name);assert.ok(option.w>0&&option.d>0&&option.h>0);if(option.counterpart)assert.ok(m.PARTS[option.counterpart]);}
 const restricted=actual.find(option=>option.colors?.length&&option.colors.length<Object.keys(m.COLORS).length);assert.ok(restricted,'catalog must retain actual per-part color restrictions');
 assert.equal(m.partColorAllowed(restricted.id,restricted.colors[0]),true);
 const unsupported=Object.keys(m.COLORS).find(color=>!restricted.colors.includes(color));assert.equal(m.partColorAllowed(restricted.id,unsupported),false);
});
