import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/generation-parts";export {generateScene,DESIGN_INSTRUCTIONS} from "./lib/generation-provider";export {EXPANDED_PARTS} from "./lib/part-catalog";export {defaultBrief} from "./lib/design-project";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const part=(family='curved',overrides={})=>({name:`${family} 2 x 2`,w:2,h:2,d:2,family,colors:['white','black'],occupancy:[[0,0,0],[1,0,0],[0,0,1],[1,0,1],[0,1,0]],topStuds:[],bottomSockets:[[0,0,0],[1,0,0]],...overrides});
const families=['brick','plate','tile','curved','arch','wedge','wedge_plate','round_plate','round_tile','round','slope','panel','support'];
const fixture=()=>Object.fromEntries(Array.from({length:300},(_,i)=>[String(50000+i),part(families[i%families.length],{name:`${families[i%families.length]} ${2+i%6} x 2`,w:2+i%6})]));
const flatten=layout=>layout.cells||layout.grids.flatMap(g=>Array.from({length:g.x[1]-g.x[0]+1},(_,i)=>g.x[0]+i).flatMap(x=>Array.from({length:g.z[1]-g.z[0]+1},(_,i)=>[x,g.y,g.z[0]+i])));
const canon=cells=>cells.map(c=>c.join(',')).sort();

test('local selection supplies a compact diverse shortlist from a large catalog and ranks relevant families',()=>{
 const catalog=fixture(),input={prompt:'A museum with an arched entrance, curved roof and round columns',brief:m.defaultBrief('A museum')};
 const result=m.buildGenerationPartCatalog(input,catalog);assert.equal(result.availableParts,300);assert.equal(result.parts.length,40);
 assert.ok(result.parts.some(p=>p.family==='arch'));assert.ok(result.parts.some(p=>p.family==='curved'));assert.ok(result.parts.some(p=>p.family==='round'));assert.ok(new Set(result.parts.map(p=>p.family)).size>=8);
 const counts=Object.fromEntries(families.map(f=>[f,result.parts.filter(p=>p.family===f).length]));assert.ok(counts.arch>counts.tile);assert.ok(counts.curved>counts.plate);
 assert.deepEqual(result,m.buildGenerationPartCatalog(input,catalog));assert.ok(JSON.stringify(result).length<20000);assert.ok(result.parts.every(p=>!('occupancy' in p)&&!('mesh' in p)&&p.colors.length));
});

test('requested handed parts bring their counterpart and retain exact color and raised socket data',()=>{
 const catalog=fixture();catalog['29120']=part('curved',{name:'Curved wedge left',colors:['red'],handedness:'left',counterpart:'29119',bottomSockets:[[0,1,0]],h:2});catalog['29119']=part('curved',{name:'Curved wedge right',colors:['black'],handedness:'right',counterpart:'29120',bottomSockets:[[1,1,0]],h:2});
 const result=m.buildGenerationPartCatalog({prompt:'Use part 29120 on the red sports car'},catalog),left=result.parts.find(p=>p.id==='29120'),right=result.parts.find(p=>p.id==='29119');
 assert.ok(left&&right);assert.deepEqual(left.colors,['red']);assert.deepEqual(right.colors,['black']);assert.equal(left.handedness,'left');assert.equal(right.handedness,'right');assert.equal(left.counterpart,right.id);assert.deepEqual(flatten(left.bottomSockets),[[0,1,0]]);assert.deepEqual(left.size,[2,2,2]);
});

test('new selections exclude parts without known connections/colors or that cannot fit either upright orientation',()=>{
 const catalog=fixture();catalog['90000']=part('arch',{name:'Unsupported arch',topStuds:[],bottomSockets:[]});catalog['90001']=part('arch',{name:'Unverified color arch',colors:[]});catalog['90002']=part('arch',{w:81,d:81});catalog['90003']=part('arch',{w:20,d:10});
 const brief={...m.defaultBrief('Architecture'),maxWidth:16,maxDepth:24};const ids=m.buildGenerationPartCatalog({prompt:'Use parts 90000 90001 90002 90003',brief},catalog).parts.map(p=>p.id);
 assert.ok(!ids.includes('90000'));assert.ok(!ids.includes('90001'));assert.ok(!ids.includes('90002'));assert.ok(ids.includes('90003'),'upright quarter turn fits');
});

test('every existing explicit part remains available on revision even beyond the ordinary shortlist cap',()=>{
 const catalog=fixture(),ids=Object.keys(catalog).slice(0,55),previous={shapes:ids.map(part=>({kind:'part',part}))};
 const result=m.buildGenerationPartCatalog({prompt:'Add a tree without changing the building',previous},catalog);assert.equal(result.parts.length,55);assert.deepEqual(result.parts.map(p=>p.id),ids);
 const legacy=m.buildGenerationPartCatalog({prompt:'Keep the existing base',previous:{shapes:[{kind:'part',part:'3001'}]}},catalog);assert.equal(legacy.parts[0].id,'3001');assert.deepEqual(legacy.parts[0].size,[4,3,2]);
});

test('connector compression preserves holes and multiple heights exactly',()=>{
 const cells=[];for(let x=0;x<8;x++)for(let z=0;z<6;z++)if(!(x>=2&&x<=5&&z>=2&&z<=3))cells.push([x,x<2?1:3,z]);
 const encoded=m.compactConnectors([...cells,cells[0]]);assert.ok(encoded.grids);assert.deepEqual(canon(flatten(encoded)),canon(cells));assert.ok(JSON.stringify(encoded).length<JSON.stringify({cells}).length);
 assert.deepEqual(m.compactConnectors([]),{cells:[]});
});

test('provider sends actual part choices and placement rules without mesh data or another paid call',async t=>{
 const before=m.EXPANDED_PARTS['999900'];m.EXPANDED_PARTS['999900']=part('arch',{name:'Test arched entrance',colors:['tan']});t.after(()=>{if(before)m.EXPANDED_PARTS['999900']=before;else delete m.EXPANDED_PARTS['999900'];});
 let calls=0,payload;await assert.rejects(async()=>{for await(const _ of m.generateScene({prompt:'Use part 999900 for the tan arched entrance',detail:'medium'},'fixture-key','gpt-6.1-sol',new AbortController().signal,async(_url,init)=>{calls++;payload=JSON.parse(init.body);return new Response('',{status:401});})){};});
 assert.equal(calls,1);const input=JSON.parse(payload.input[0].content[0].text),entry=input.partCatalog.parts.find(p=>p.id==='999900');assert.ok(entry);assert.deepEqual(entry.colors,['tan']);assert.ok(!('mesh' in entry));assert.ok(input.partCatalog.parts.some(p=>p.id===input.partCatalog.placementExample.shape.pid));assert.equal(input.partCatalog.placementExample.shape.k,'part');assert.ok(input.examples.every(e=>e.scene.sh.every(s=>s.k==='part'?Object.hasOwn(m.EXPANDED_PARTS,s.pid):s.pid===null)),'only real catalog parts carry a pid in examples');assert.ok(input.examples.some(e=>e.scene.sh.some(s=>s.k==='part'&&s.pid==='60596'&&s.face==='nz'&&s.bg==='brown')),'the cottage example teaches a real door frame facing out');
 assert.match(payload.instructions,/Use k part with pid/);assert.match(payload.instructions,/rotation never makes a left part into its right counterpart/);assert.match(payload.instructions,/socket's local y is 1/);assert.match(payload.instructions,/Use only that entry's listed colors/);
});
