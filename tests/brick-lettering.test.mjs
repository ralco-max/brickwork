import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/brick-lettering";export * from "./lib/generated-scene";export * from "./lib/design-project";export * from "./lib/models";export {generationFailure} from "./lib/generation-errors";export {generateScene} from "./lib/generation-provider";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {signMetrics,signRows,signPixels,normalizedSignText,compileScene,sceneVoxels,validateScene,SceneStreamParser,compactScene,mergeRevision,enforceLocks,designChecks,defaultBrief,projectJSON,emptyShopping,emptyManual,validateProject,generateScene,generationFailure}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=brick-lettering-test-bundle.mjs').toString('base64'));
const box=(id,position,size,extra={})=>({id,component:id,label:id,kind:'box',operation:'add',color:'tan',position,size,end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
const sign=box('Sign',{x:3,y:4,z:12},{x:41,y:14,z:2},{kind:'text',text:'SKYMARK',face:'pz',color:'white',background:'navy'});
const scene={name:'SKYMARK facade',description:'A sign embedded in a supported wall.',dimensions:{x:48,y:24,z:16},shapes:[box('Base',{x:0,y:0,z:0},{x:48,y:2,z:16},{color:'gray'}),box('Wall',{x:2,y:2,z:4},{x:44,y:20,z:10}),sign]};
const coverage=model=>{const map=new Map();for(const p of model.pieces)for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++)map.set(`${x},${y},${z}`,p.color);return map;};
const modelFor=(s=scene,options={})=>({...compileScene(s,options),generation:s});
const brief={...defaultBrief('A real building with a SKYMARK sign'),maxPieces:16000,signText:'SKYMARK'};

test('SKYMARK spelling has a fixed, complete seven-letter bitmap and measurable extent',()=>{
 assert.equal(normalizedSignText('skymark'),'SKYMARK');assert.deepEqual(signMetrics('SKYMARK'),{width:41,height:14});
 assert.deepEqual(signRows('SKYMARK'),[
  ['01111','10001','10001','10001','01110','11110','10001'].join('0'),
  ['10000','10010','10001','11011','10001','10001','10010'].join('0'),
  ['10000','10100','01010','10101','10001','10001','10100'].join('0'),
  ['01110','11000','00100','10101','11111','11110','11000'].join('0'),
  ['00001','10100','00100','10001','10001','10100','10100'].join('0'),
  ['00001','10010','00100','10001','10001','10010','10010'].join('0'),
  ['11110','10001','00100','10001','10001','10001','10001'].join('0'),
 ]);
 assert.deepEqual(signMetrics("A&B-1. /'"),{width:41,height:14});
 assert.throws(()=>signMetrics('SKYMÄRK'),error=>generationFailure(error).code==='INVALID_GEOMETRY'&&/letters, digits/.test(error.message));assert.throws(()=>signMetrics('TOO MANY LETTERS'),/12/);assert.throws(()=>signMetrics(' '),/at least one/);
});

test('signs read left to right from every outward side without mirrored letters',()=>{
 const rows=signRows('SK');
 for(const face of ['pz','nz','px','nx']){
  const side=face==='px'||face==='nx',size=side?{x:2,y:16,z:13}:{x:13,y:16,z:2};
  const points=signPixels('SK',size,face),keys=new Set(points.map(p=>`${p.x},${p.y},${p.z}`));
  for(let row=0;row<7;row++)for(let col=0;col<11;col++)for(let layer=0;layer<2;layer++){
   const u=col+1,y=1+(6-row)*2+layer;
   const p=face==='pz'?[u,y,1]:face==='nz'?[12-u,y,0]:face==='px'?[1,y,12-u]:[0,y,u];
   assert.equal(keys.has(p.join(',')),rows[row][col]==='1',`${face}, row ${row}, col ${col}`);
  }
 }
});

test('unsupported text, a clipped panel, subtractions and invisible colors fail before compilation',()=>{
 for(const patch of [{text:'SKY!MARK'},{size:{x:40,y:14,z:2}},{size:{x:41,y:13,z:2}},{size:{x:41,y:14,z:1}},{position:{x:3.5,y:4,z:12}},{operation:'subtract'},{background:'white'},{face:undefined}]){
  assert.throws(()=>validateScene({...scene,shapes:[...scene.shapes.slice(0,-1),{...sign,...patch}]}),/letters|needs|whole|sign|different/i);
 }
});

test('all face pixels survive packing, smoothing, hollowing, and later wall shapes',()=>{
 for(const options of [{},{hollow:true,smooth:true}]){
  const result=modelFor({...scene,shapes:[sign,...scene.shapes.slice(0,-1)]},options),cells=coverage(result),rows=signRows('SKYMARK');
  for(let row=0;row<7;row++)for(let col=0;col<41;col++)for(let layer=0;layer<2;layer++)assert.equal(cells.get(`${3+col},${4+(6-row)*2+layer},13`),rows[row][col]==='1'?'white':'navy');
  const checked=designChecks(result,brief);assert.ok(!checked.issues.some(s=>s.includes('sign')),checked.issues.join('\n'));assert.equal(checked.audit.overlaps,0);assert.equal(checked.audit.ungrounded.length,0);
 }
});

test('streaming, revisions, saved projects and component locks preserve exact sign content',()=>{
 const parser=new SceneStreamParser(),wire=JSON.stringify(compactScene(scene));for(let i=0;i<wire.length;i+=13)parser.push(wire.slice(i,i+13));const parsed=parser.finish();
 const expanded=validateScene({...parsed.header,shapes:parsed.shapes});assert.deepEqual(expanded.shapes.at(-1),sign);
 const unchanged=mergeRevision(scene,parsed.header,[],[]);assert.equal(unchanged.shapes.at(-1).text,'SKYMARK');assert.doesNotThrow(()=>enforceLocks(scene,unchanged,['Sign']));
 const changed=mergeRevision(scene,parsed.header,[],[{...sign,text:'SKY'}]);assert.equal(changed.shapes.at(-1).text,'SKY');assert.throws(()=>enforceLocks(scene,changed,['Sign']),/locked/);
 const removed=mergeRevision(scene,parsed.header,['Sign'],[]);assert.equal(removed.shapes.some(s=>s.kind==='text'),false);assert.throws(()=>enforceLocks(scene,removed,['Sign']),/locked/);
 const intrusion={...scene,shapes:[...scene.shapes,{...sign,id:'Other sign',component:'Other sign',text:'WRONG'}]};assert.throws(()=>enforceLocks(scene,intrusion,['Sign']),/overlaps/);
 const model={...modelFor(scene,{smooth:true}),design:{brief,manual:emptyManual(),locked:['Sign'],revisions:[]}},loaded=validateProject(JSON.parse(projectJSON(model,emptyShopping())));assert.equal(loaded.generation.shapes.at(-1).text,'SKYMARK');assert.equal(loaded.design.brief.signText,'SKYMARK');
});

test('exact sign checks catch omission, damaged pixels and obscured text without crashing on live invalid input',()=>{
 const missing={...scene,shapes:scene.shapes.slice(0,-1)};assert.ok(designChecks(modelFor(missing),brief).issues.some(s=>s.includes('exact sign')&&s.includes('missing')));
 const wrong={...scene,shapes:[...scene.shapes.slice(0,-1),{...sign,text:'SKY'}]};assert.ok(designChecks(modelFor(wrong),brief).issues.some(s=>s.includes('missing')));
 const damaged=modelFor();damaged.pieces=damaged.pieces.map(p=>p.color==='white'?{...p,color:'red'}:p);assert.ok(designChecks(damaged,brief).issues.some(s=>s.includes('altered letter pixels')));
 const hidden={...scene,shapes:[...scene.shapes,box('Screen',{x:2,y:2,z:14},{x:44,y:20,z:1})]};assert.ok(designChecks(modelFor(hidden),brief).issues.some(s=>s.includes('obscured')));
 assert.ok(designChecks(modelFor(),{...brief,signText:''}).issues.some(s=>s.includes('field has been cleared')));
 assert.ok(!designChecks(modelFor(),{...brief,signText:undefined}).issues.some(s=>s.includes('sign')));
 for(const text of ['HELLO!','SKYMÄRK','A REALLY LONG NAME'])assert.ok(designChecks(modelFor(),{...brief,signText:text}).issues.some(s=>s.includes('letters, digits')));
});

test('generation receives an exact sign requirement and deterministic placement instructions',async()=>{
 let sent;const fetcher=async(_url,init)=>{sent=JSON.parse(init.body);return new Response([{type:'response.output_text.delta',delta:JSON.stringify(compactScene(scene))},{type:'response.completed',response:{status:'completed'}}].map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));};
 let result;for await(const event of generateScene({prompt:'Add SKYMARK as on the building',detail:'medium',brief},'key','model',new AbortController().signal,fetcher))if(event.type==='complete')result=event.scene;
 assert.equal(result.shapes.at(-1).text,'SKYMARK');assert.deepEqual(JSON.parse(sent.input[0].content[0].text).exactSign,{text:'SKYMARK',width:41,height:14});assert.match(sent.instructions,/never approximate letters with boxes/);assert.match(sent.instructions,/continuous supporting bricks/);
});


test('cleared sign requests remove text through ordinary revision IDs and remain cleared after reload',async()=>{
 let sent;const revision={...compactScene(scene),rm:['Sign'],sh:[]};
 const fetcher=async(_url,init)=>{sent=JSON.parse(init.body);return new Response([{type:'response.output_text.delta',delta:JSON.stringify(revision)},{type:'response.completed',response:{status:'completed'}}].map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));};
 const cleared={...brief,signText:''};let result;for await(const event of generateScene({prompt:'Remove the sign lettering',detail:'medium',brief:cleared,previous:scene},'key','model',new AbortController().signal,fetcher))if(event.type==='complete')result=event.scene;
 assert.deepEqual(JSON.parse(sent.input[0].content[0].text).exactSign,{action:'remove'});assert.equal(result.shapes.some(s=>s.kind==='text'),false);
 const saved={...modelFor(result,{smooth:true}),design:{brief:cleared,manual:emptyManual(),locked:[],revisions:[]}},loaded=validateProject(JSON.parse(projectJSON(saved,emptyShopping())));
 assert.equal(loaded.design.brief.signText,'');assert.ok(!designChecks(loaded,cleared).issues.some(s=>s.includes('sign')));
});
