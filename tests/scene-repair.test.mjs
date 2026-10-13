import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {repairScene,addSupports} from "./lib/scene-repair";export {validateScene,compileScene,compactScene,expandCompactHeader,expandCompactShape} from "./lib/generated-scene";export {nearestColor,validateProject,removeSupports} from "./lib/models";export {auditModel,SLOPES} from "./lib/bridge";export {catalogPart} from "./lib/part-catalog";export {projectJSON,emptyShopping,defaultBrief,emptyManual,designChecks} from "./lib/design-project";export {DESIGN_EXAMPLES} from "./lib/design-examples";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {repairScene,addSupports,validateScene,compileScene,compactScene,expandCompactHeader,expandCompactShape,nearestColor,validateProject,removeSupports,auditModel,SLOPES,catalogPart,projectJSON,emptyShopping,defaultBrief,emptyManual,designChecks,DESIGN_EXAMPLES}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const shape=(id,kind,color,p,s,extra={})=>({id,component:extra.component||id,label:id,kind,operation:'add',color,position:{x:p[0],y:p[1],z:p[2]},size:{x:s[0],y:s[1],z:s[2]},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
const base=shape('base','box','gray',[0,0,0],[20,2,16]);
const scene=(shapes,dims=[20,30,16])=>({catalogVersion:1,name:'Fixture',description:'Repair fixture.',dimensions:{x:dims[0],y:dims[1],z:dims[2]},shapes:[base,...shapes]});
const figure=(id,x,z,face='pz')=>shape(id,'minifig','red',[x,2,z],[2,12,1],{face,background:'blue'});
// Every repaired scene must be one the validator and compiler accept.
const accepted=r=>{assert.doesNotThrow(()=>validateScene(r.scene,{fresh:true}));assert.ok(compileScene(r.scene).pieces.length>0);return r;};

test('a box one stud past the edge grows the build area up to the brief, or is trimmed at the ceiling',()=>{
 const over=scene([shape('wall','box','tan',[2,2,2],[19,8,4])]);
 assert.throws(()=>validateScene(over),/outside the build area/);
 const grown=accepted(repairScene(over));assert.equal(grown.scene.dimensions.x,21);assert.match(grown.corrections.join(' '),/Grew the build area to 21 × 16 studs/);
 assert.deepEqual(grown.scene.shapes[1].size,{x:19,y:8,z:4},'growing keeps the shape whole');
 const capped=accepted(repairScene(over,{maxWidth:20,maxDepth:16,maxHeight:30}));assert.equal(capped.scene.dimensions.x,20);
 assert.equal(capped.scene.shapes[1].size.x,18);assert.match(capped.corrections.join(' '),/Trimmed “wall” at the edge/);
 const repeated=accepted(repairScene(scene([shape('post','box','tan',[2,2,2],[2,6,2],{repeat:{count:6,offset:{x:4,y:0,z:0}}})]),{maxWidth:20}));
 assert.equal(repeated.scene.shapes[1].repeat.count,5);assert.match(repeated.corrections.join(' '),/Repeated “post” 5 times instead of 6/);
 const members=accepted(repairScene(scene([shape('leg','lean','brown',[4,2,8],[2,3,1],{end:{x:24,y:20,z:8}}),shape('cable','beam','gray',[2,20,8],[1,1,1],{end:{x:22.5,y:24,z:8},radius:.5})]),{maxWidth:20}));
 assert.deepEqual([members.scene.shapes[1].end.x,members.scene.shapes[2].end.x],[20,20],'members end at the edge');
});

test('a catalog part in an unlisted colour becomes the nearest colour it is made in',()=>{
 const panel=shape('panel','part','black',[4,2,4],[4,18,4],{part:'2467',face:'pz'}),only=shape('roof','part','navy',[12,2,4],[3,3,2],{part:'3042',face:'pz'});
 assert.deepEqual(catalogPart('2467').colors.slice().sort(),['gray','white']);
 assert.throws(()=>validateScene(scene([panel]),{fresh:true}),/does not list part 2467 in black/);assert.equal(validateScene(scene([panel])).shapes[1].color,'black','a saved scene still opens');
 const r=accepted(repairScene(scene([panel,only])));
 assert.equal(r.scene.shapes[1].color,'gray','black is nearer gray than white');assert.equal(r.scene.shapes[2].color,'red','a single-colour part takes that colour');
 assert.match(r.corrections.join(' '),/Changed “panel” \(part 2467\) from black to gray, the nearest colour it is made in/);
});

test('non-integer part and minifigure positions snap to whole studs; overlapping figures keep the first',()=>{
 const off={...figure('shopkeeper',3,4),position:{x:3.4,y:2,z:4.6}};
 assert.throws(()=>validateScene(scene([off])),/whole studs/);
 const snapped=accepted(repairScene(scene([off,{...shape('brick','part','red',[10.5,2,2],[2,3,1]),part:'3004',face:'pz'}])));
 assert.deepEqual(snapped.scene.shapes[1].position,{x:3,y:2,z:5});assert.deepEqual(snapped.scene.shapes[2].position,{x:11,y:2,z:2});
 assert.match(snapped.corrections.join(' '),/Snapped “shopkeeper”, “brick” to whole studs/);
 const crowd=scene([figure('first',4,4),figure('second',5,4),figure('third',10,4)]);
 assert.throws(()=>validateScene(crowd),/overlaps another explicit part or minifigure/);
 const kept=accepted(repairScene(crowd));assert.deepEqual(kept.scene.shapes.filter(s=>s.kind==='minifig').map(s=>s.id),['first','third']);
 assert.match(kept.corrections.join(' '),/Removed “second”: it overlapped “first”/);
 const copies=accepted(repairScene(scene([{...figure('row',2,4),repeat:{count:3,offset:{x:1,y:0,z:0}}}])));
 assert.equal(copies.scene.shapes[1].repeat.count,1,'a repeat that steps less than a figure keeps only the copies that fit');
 const wheel=shape('wheel','wheel','black',[6,5,8],[4,1,1],{axis:'z'}),blocked=accepted(repairScene(scene([wheel,{...shape('axle','part','gray',[5,2,8],[1,3,1]),part:'3005',face:'pz'}])));
 assert.ok(!blocked.scene.shapes.some(s=>s.id==='axle'));assert.match(blocked.corrections.join(' '),/Removed “axle”: it overlapped a wheel/);
});

test('a sign whose background matches its letters gets a contrasting background, and a short panel grows to fit',()=>{
 const sign=shape('sign','text','white',[1,2,10],[20,14,2],{text:'OPEN',face:'pz',background:'white'});
 assert.throws(()=>validateScene(scene([sign],[24,30,16])),/different letter and background colors/);
 const r=accepted(repairScene(scene([sign],[24,30,16])));assert.equal(r.scene.shapes[1].background,'black');assert.match(r.corrections.join(' '),/Gave sign “sign” a black background so its white letters read/);
 const dark=accepted(repairScene(scene([{...sign,color:'navy',background:'navy'}],[24,30,16])));assert.equal(dark.scene.shapes[1].background,'white');
 const small=accepted(repairScene(scene([{...sign,background:'red',size:{x:6,y:6,z:1},text:'Café!'}],[24,30,16])));
 assert.equal(small.scene.shapes[1].text,'Caf');assert.ok(small.scene.shapes[1].size.x>=17&&small.scene.shapes[1].size.y===14&&small.scene.shapes[1].size.z===2);
 assert.match(small.corrections.join(' '),/Spelled sign “sign” as “CAF”/);assert.match(small.corrections.join(' '),/Enlarged sign “sign”/);
});

test('a valid scene passes through untouched, and the wire format is repaired too',()=>{
 for(const example of DESIGN_EXAMPLES){
  const full={...expandCompactHeader(example.scene),shapes:example.scene.sh.map(expandCompactShape)},r=repairScene(full);
  assert.deepEqual(r.corrections,[],example.id);assert.deepEqual(r.scene,full,example.id);
 }
 const wire={...compactScene(scene([shape('tower','box','tan',[4,2,4],[4,40,4])])),dim:[19.5,30,16]};wire.sh[0].col='#6c6e68';
 const r=accepted(repairScene(JSON.stringify(wire)));assert.deepEqual(r.scene.dimensions,{x:20,y:42,z:16});assert.equal(r.scene.shapes[0].color,'darkgray','a hex colour maps into the palette');
 assert.match(r.corrections.join(' '),/Dropped|Set the build area/);
 const dup=accepted(repairScene(scene([shape('base','box','tan',[2,2,2],[2,2,2])])));assert.deepEqual(dup.scene.shapes.map(s=>s.id),['base','base-2']);
 const junk=accepted(repairScene({...scene([shape('ok','box','tan',[2,2,2],[2,2,2])]),shapes:[base,{kind:'blob'},{...shape('loose','box','tan',[2,2,2],[2,2,2]),extra:1,color:'Light bluish gray'}]}));
 assert.equal(junk.scene.shapes.length,2);assert.equal(junk.scene.shapes[1].color,'gray');assert.match(junk.corrections.join(' '),/Dropped 1 unreadable shape/);
});

test('only an empty or unreadable response throws',()=>{
 for(const bad of [null,'',' {"n":',[],{},{name:'x',shapes:[]},{sh:[]},{shapes:[{kind:'blob'}]}])assert.throws(()=>repairScene(bad),/incomplete design|empty/);
 assert.throws(()=>repairScene({...scene([]),shapes:[{...figure('a',2,2),operation:'subtract'}]}),/empty/);
});

test('palette matching is perceptual: concrete gray maps to dark bluish gray, not green',()=>{
 assert.equal(nearestColor(0x6c,0x6e,0x68),'darkgray');assert.equal(nearestColor(0x5a,0x93,0xdb),'blue');assert.equal(nearestColor(0x18,0x46,0x32),'darkgreen');
 assert.equal(nearestColor(0x6c,0x6e,0x68,['white','gray','green']),'gray','the classic palette still lands on light bluish gray');
 assert.equal(nearestColor(0x8b,0x3a,0x2b),'darkred');assert.equal(nearestColor(0x87,0xce,0xeb),'mediumazure');assert.equal(nearestColor(0xc2,0x70,0x3d),'mediumnougat');
 // A pixel never asks for glass or metal: white stays white rather than trans-clear, silver stays gray.
 assert.equal(nearestColor(0xfc,0xfc,0xfc),'white');assert.equal(nearestColor(0xc0,0xc0,0xc0),'gray');assert.equal(nearestColor(0xaa,0x7f,0x2e,['pearlgold','yellow']),'pearlgold');
 assert.equal(nearestColor(255,255,255),'white');assert.equal(nearestColor(0,0,0),'black');assert.equal(nearestColor(0xc9,0x28,0x20),'red');
 assert.equal(nearestColor(0x6c,0x6e,0x68,['white','green']),'green','restricted to the listed colours');
});

test('automatic supports are recorded the way the studio button records them and survive a project round trip',()=>{
 const brief=defaultBrief('A tower with a floating balcony'),options={hollow:brief.hollow,smooth:brief.finish==='smooth'};
 const floating=scene([shape('tower','box','tan',[2,2,2],[4,12,4]),shape('balcony','box','red',[10,8,2],[4,3,4])]);
 const before=compileScene(floating,options);assert.ok(auditModel(before.pieces).disconnected.length>0,'the balcony floats');
 const r=addSupports(floating,options);
 assert.ok(r.added>0);assert.equal(auditModel(r.model.pieces).disconnected.length,0);assert.ok(r.manual.bricks.length===r.added&&r.manual.bricks.every(p=>p.support===true&&p.color==='gray'));
 assert.equal(r.model.pieces.filter(p=>p.support).length,r.added);assert.equal(r.model.pieces.length,before.pieces.length+r.added);
 const model={...r.model,design:{brief,manual:r.manual,locked:[],revisions:[]}},back=validateProject(JSON.parse(projectJSON(model,emptyShopping())));
 assert.equal(back.pieces.length,model.pieces.length);assert.equal(back.design.manual.bricks.length,r.added);assert.ok(designChecks(back,{...brief,maxPieces:4000}).audit.disconnected.length===0);
 const stripped=removeSupports(back);assert.equal(stripped.removed,r.added);assert.equal(stripped.model.design.manual.bricks.length,0);
 const settled=addSupports(floating,{...options,manual:r.manual});assert.equal(settled.added,0,'a supported design needs nothing more');
 assert.deepEqual(addSupports(scene([shape('tower','box','tan',[2,2,2],[4,12,4])]),options).manual,emptyManual());
});

test('the display base is never carved into loose slopes',()=>{
 const shop=DESIGN_EXAMPLES.find(e=>e.id==='minifigs').scene,full={...expandCompactHeader(shop),shapes:shop.sh.map(expandCompactShape)};
 const model=compileScene(full);assert.equal(auditModel(model.pieces).groups,1);assert.ok(!model.pieces.some(p=>SLOPES[p.part]&&p.y<2));
 const plinth=comp=>({...scene([]),shapes:[{...base,size:{x:20,y:4,z:16},component:comp},shape('walls','box','tan',[1,2,1],[18,9,14])]}),low=m=>m.pieces.filter(p=>SLOPES[p.part]&&p.y<4).length;
 assert.ok(low(compileScene(plinth('Plinth')))>0,'an ordinary 2-plate step beside a wall takes cheese slopes');assert.equal(low(compileScene(plinth('Base'))),0,'a taller Base component keeps its plates');
});

test('a revision recolours and checks only its own shapes; saved figures and parts keep their colours, so locks hold',async()=>{
 const extra=await build({stdin:{contents:'export {generateScene} from "./lib/generation-provider";export {enforceLocks} from "./lib/design-project";export {partColors} from "./lib/part-colors";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error',external:['cloudflare:workers']});
 const {generateScene,enforceLocks,partColors}=await import('data:text/javascript;base64,'+Buffer.from(extra.outputFiles[0].text).toString('base64'));
 // Saved before skin tones were enforced: a robot with a white head, and a 1 x 1 plate in pearl gold, both in the locked crew.
 const robot={...figure('robot',10,12),component:'Crew',label:'Robot',skin:'white'},badge={...shape('badge','part','pearlgold',[4,2,12],[1,1,1],{component:'Crew'}),part:'3024',face:'pz'};
 const previous=validateScene(scene([shape('wall','box','tan',[0,2,0],[20,15,4],{component:'Shop'}),robot,badge]));
 assert.equal(previous.shapes.find(s=>s.id==='robot').skin,'white','a saved scene still opens as saved');
 const awning=shape('awning','box','red',[0,17,4],[20,1,3],{component:'Awning'}),medal={...shape('medal','part','pearlgold',[6,2,12],[1,1,1],{component:'Trim'}),part:'3024',face:'pz'};
 const text=JSON.stringify(compactScene({name:'Robot shop',description:'A shop.',dimensions:previous.dimensions,shapes:[awning,medal]}));
 const body=new TextEncoder().encode([{type:'response.output_text.delta',delta:text},{type:'response.completed',response:{status:'completed'}}].map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join(''));
 const fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(body);c.close();}}));
 // A refresh has since dropped pearl gold from that plate; the badge was accepted when it was made.
 const plate=partColors('3024'),before=[...plate];plate.splice(plate.indexOf('pearlgold'),1);
 try{
  for(const locked of [['Crew'],undefined]){
   const events=[];for await(const e of generateScene({prompt:'Add a red awning and a gold medal',detail:'small',previous,...(locked?{locked}:{})},'k','gpt-6.1-sol',new AbortController().signal,fetcher))events.push(e);
   const done=events.find(e=>e.type==='complete').scene,corrections=events.find(e=>e.type==='corrections')?.items||[];
   assert.equal(done.shapes.find(s=>s.id==='robot').skin,'white','the saved robot keeps its head');assert.equal(done.shapes.find(s=>s.id==='badge').color,'pearlgold','the saved part keeps its colour');
   assert.notEqual(done.shapes.find(s=>s.id==='medal').color,'pearlgold','a new part is still held to today\'s colour data');
   assert.ok(corrections.some(c=>/medal/.test(c))&&!corrections.some(c=>/Robot|badge/.test(c)),JSON.stringify(corrections));
   if(locked)assert.doesNotThrow(()=>enforceLocks(previous,done,locked),'the paid revision is kept');
  }
 }finally{plate.splice(0,plate.length,...before);}
});
