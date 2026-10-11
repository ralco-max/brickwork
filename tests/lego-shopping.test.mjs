import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./app/lego-shopping-data";export {resolveLegoElement} from "./lib/lego-elements";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {prepareLegoShopping,legoUploadCSV,legoUploadBatches,resolveLegoElement}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const row=(part,color,quantity)=>({key:`${part}:${color}`,part,color,quantity});
const inventory=[row('3001','red',12),row('3001','blue',8),row('3024','tan',5),row('55982','black',4)];
const resolver=(part,color)=>part==='55982'?{status:'assembly',source:'fixture'}:color==='tan'?{status:'missing',source:'fixture'}:{status:'matched',elementId:color==='red'?'300121':'300123',source:'fixture'};

test('automatic matches use exact part/color pairs and only quantities still needed',()=>{
 const result=prepareLegoShopping(inventory,{'3001:red':4,'3001:blue':8},{},resolver);
 assert.equal(result.pieceCount,17);assert.equal(result.catalogCount,1);assert.equal(result.manualCount,0);
 assert.deepEqual(result.matched.map(r=>[r.key,r.elementId,r.needed]),[['3001:red','300121',8]]);
 assert.deepEqual(result.unmatched.map(r=>[r.key,r.match,r.needed]),[['3024:tan','missing',5],['55982:black','assembly',4]]);
 assert.equal(legoUploadCSV(result.matched),'elementId,quantity\r\n300121,8');
});

test('saved element overrides remain optional, explicit and independent of catalog verification',()=>{
 const overrides={'3001:red':'9999999','3024:tan':'8888888'};
 const result=prepareLegoShopping(inventory,{},overrides,resolver);
 assert.equal(result.manualCount,2);assert.equal(result.catalogCount,1);
 assert.deepEqual(result.matched.map(r=>[r.elementId,r.match]),[['9999999','manual'],['300123','catalog'],['8888888','manual']]);
 assert.equal(result.matched[0].catalog.elementId,'300121');assert.equal(result.unmatched[0].match,'assembly');
 const cleared=prepareLegoShopping(inventory,{}, {...overrides,'3001:red':''},resolver);
 assert.equal(cleared.matched[0].elementId,'300121');assert.equal(cleared.matched[0].match,'catalog');
 const incomplete=prepareLegoShopping(inventory,{}, {'3001:red':'123','3024:tan':'invalid'},resolver);
 assert.equal(incomplete.matched[0].elementId,'300121');assert.equal(incomplete.unmatched.length,2);
});

test('LEGO export combines duplicate IDs and cannot include unmatched or fully owned quantities',()=>{
 const result=prepareLegoShopping(inventory,{'3001:red':2,'3024:tan':10},{'3001:blue':'300121'},resolver);
 assert.equal(legoUploadCSV(result.rows),'elementId,quantity\r\n300121,18');
 assert.equal(result.unmatched.length,1);assert.equal(result.rows.some(r=>r.key==='3024:tan'),false);
 assert.equal(legoUploadCSV([{elementId:'9999999',needed:0},{elementId:'9999999',needed:-1},{elementId:'invalid',needed:2},{needed:8}]),'elementId,quantity');
 assert.equal(prepareLegoShopping(inventory,{}, {},()=>({status:'missing',source:'fixture'})).matched.length,0);
 assert.equal(prepareLegoShopping(inventory,{}, {},()=>({status:'matched',elementId:'invalid',source:'fixture'})).unmatched.length,4);
});

test('catalog integration automatically resolves common part colors without manual IDs',()=>{
 const result=prepareLegoShopping([row('3001','red',3),row('3001','white',7),row('55982','black',4)],{},{});
 assert.equal(result.catalogCount,2);assert.equal(result.manualCount,0);assert.equal(result.unmatched[0].match,'assembly');
 for(const match of result.matched)assert.equal(match.elementId,resolveLegoElement(match.part,match.color).elementId);
 assert.notEqual(result.matched[0].elementId,result.matched[1].elementId);
});

test('large lists are split after duplicate merging into at most 400 types per file',()=>{
 const rows=Array.from({length:801},(_,i)=>({elementId:String(100000+i),needed:2}));rows.push({elementId:'100000',needed:3});
 const batches=legoUploadBatches(rows);assert.deepEqual(batches.map(b=>b.types),[400,400,1]);
 assert.equal(batches.reduce((sum,b)=>sum+b.pieces,0),1605);assert.match(batches[0].csv,/100000,5/);
 assert.equal(batches[1].csv.includes('100000,'),false);assert.ok(batches.every(b=>b.csv.length<5000000));
 assert.equal(legoUploadBatches(rows.slice(0,400)).length,1);assert.deepEqual(legoUploadBatches([]),[]);
});
