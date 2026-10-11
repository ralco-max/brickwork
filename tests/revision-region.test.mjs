import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';
const bundle=await build({stdin:{contents:'export {env as testEnv} from "cloudflare:workers";export * from "./lib/revision-region";export * from "./lib/generation-provider";export * from "./lib/design-review";export * from "./lib/design-project";export {validateProject} from "./lib/models";export {foundationScene} from "./lib/live-arrivals";export {compactScene,compileScene} from "./lib/generated-scene";export {readEvents} from "./lib/generation-stream";export {POST as generatePOST} from "./app/api/generate/route";export {POST as reviewPOST} from "./app/api/review/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const {testEnv,revisionRegionSchema,revisionRegionContext,revisionSceneKey,generateScene,reviewDesign,defaultBrief,foundationScene,compactScene,compileScene,projectJSON,validateProject,emptyManual,emptyShopping,generatePOST,reviewPOST,readEvents}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=revision-region-test-bundle.mjs').toString('base64'));
const brief={...defaultBrief('A courtyard building'),finish:'studded'},scene=foundationScene(brief),photo='data:image/jpeg;base64,YQ==';
const region={image:'data:image/png;base64,Yg==',polygon:[{x:.2,y:.2},{x:.7,y:.2},{x:.7,y:.8},{x:.2,y:.8}],components:['Foundation'],bounds:{min:{x:0,y:0,z:0},max:{x:24,y:2,z:24}},description:'Add the missing courtyard entrance here.',sceneKey:revisionSceneKey(scene)};
const completion={summary:'The new entrance is visible at the marked edge.',recognizable:true,features:[],improvements:[],revision:{status:'visible',evidence:'The current model view contains the requested entrance.'}};
const responseFrames=()=>new Response([{type:'response.output_text.delta',delta:JSON.stringify(compactScene(scene))},{type:'response.completed',response:{status:'completed',usage:{input_tokens:100,output_tokens:100}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
const collect=async body=>{const out=[];for await(const event of readEvents(body))out.push(event);return out;};

test('marked areas accept bounded screenshots, normalized outlines and empty-space augmentation',()=>{
 assert.deepEqual(revisionRegionSchema.parse(region),region);
 const crossed={...region,polygon:[{x:.1,y:.1},{x:.9,y:.9},{x:.1,y:.9},{x:.9,y:.1}]};assert.deepEqual(revisionRegionSchema.parse(crossed),crossed);
 const empty={...region,components:[],bounds:{min:{x:-5,y:-1,z:0},max:{x:90,y:180,z:90}}};assert.deepEqual(revisionRegionSchema.parse(empty),empty);
 for(const change of [{image:'https://example.com/view.png'},{image:'data:image/svg+xml;base64,Yg=='},{image:'data:image/png;base64,'+'A'.repeat(1500000)},{polygon:[{x:0,y:0},{x:1,y:1}]},{polygon:[{x:0,y:0},{x:.5,y:.5},{x:1,y:1}]},{polygon:[{x:0,y:0},{x:1.1,y:0},{x:0,y:1}]},{polygon:Array(129).fill({x:.3,y:.4})},{components:Array(25).fill('Wall')},{bounds:{min:{x:4,y:0,z:0},max:{x:3,y:2,z:2}}},{unexpected:'field'}])assert.equal(revisionRegionSchema.safeParse({...region,...change}).success,false);
 assert.equal(revisionRegionSchema.safeParse({...region,polygon:[{x:NaN,y:0},{x:1,y:0},{x:0,y:1}]}).success,false);
 assert.equal('image' in revisionRegionContext(region),false);assert.equal(revisionRegionContext(undefined),undefined);
});

test('scene hints are stable through key reordering but change with geometry',()=>{
 const reordered={shapes:scene.shapes.map(s=>Object.fromEntries(Object.entries(s).reverse())),dimensions:{z:scene.dimensions.z,y:scene.dimensions.y,x:scene.dimensions.x}};
 assert.equal(revisionSceneKey(reordered),revisionSceneKey(scene));assert.equal(revisionSceneKey(JSON.parse(JSON.stringify(scene))),revisionSceneKey(scene));
 assert.notEqual(revisionSceneKey({...scene,shapes:scene.shapes.map(s=>({...s,color:'red'}))}),revisionSceneKey(scene));
});

test('design requests send marked model evidence separately from user source photographs',async()=>{
 let body;const fetcher=async(_url,init)=>{body=JSON.parse(init.body);return responseFrames();};
 for await(const _ of generateScene({prompt:'Add the courtyard entrance in this area',detail:'medium',brief,previous:scene,reference:photo,region},'key','model',new AbortController().signal,fetcher)){}
 const content=body.input[0].content,meta=JSON.parse(content[0].text);assert.deepEqual(meta.markedRegion,revisionRegionContext(region));assert.equal(meta.markedRegionMatchesCurrentScene,true);assert.equal(meta.referencePhotoCount,1);assert.ok(!content[0].text.includes(region.image));
 const images=content.filter(c=>c.type==='input_image');assert.deepEqual(images.map(c=>c.image_url),[region.image,photo]);assert.match(content.find(c=>c.text?.startsWith('USER MARKED')).text,/before view, not a reference photo/);assert.match(body.instructions,/marked empty area can mean add a new feature/);assert.match(body.instructions,/Preserve unrelated geometry and all protected/);
 for await(const _ of generateScene({prompt:'Add the entrance here',detail:'medium',previous:scene,region:{...region,sceneKey:'older-view'}},'key','model',new AbortController().signal,fetcher)){}
 assert.equal(JSON.parse(body.input[0].content[0].text).markedRegionMatchesCurrentScene,false);
});

test('review receives a tagged before view and must assess a marked revision against current views',async()=>{
 let body;const fetcher=async(_url,init)=>{body=JSON.parse(init.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(completion)}]}]});};
 await reviewDesign(brief,Array(3).fill(photo),'key','model',new AbortController().signal,fetcher,'Add an entrance',undefined,undefined,region);
 const content=body.input[0].content,meta=JSON.parse(content[0].text);assert.equal(meta.generatedViewCount,3);assert.equal(meta.sourcePhotoCount,0);assert.deepEqual(meta.markedRegion,revisionRegionContext(region));assert.equal(content.filter(c=>c.type==='input_image').length,4);assert.match(content.find(c=>c.text?.startsWith('USER MARKED')).text,/captured before this revision/);assert.match(body.instructions,/Never use the marked before image as evidence/);
 const noRevision=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...completion,revision:{status:'not_requested',evidence:''}})}]}]});
 await assert.rejects(()=>reviewDesign(brief,[photo,photo,photo],'key','model',new AbortController().signal,noRevision,'',undefined,undefined,region),/did not assess/);
});

test('marked review context survives project export and reopen without becoming source-reference evidence',()=>{
 const model={...compileScene(scene),generation:scene,design:{brief,manual:emptyManual(),locked:[],revisions:[],reviewRequest:'Add the entrance at the marked edge',reviewRegion:region,reference:{photo,photos:['data:image/jpeg;base64,Yw=='],briefKey:'saved'}}};
 const restored=validateProject(JSON.parse(projectJSON(model,emptyShopping())));assert.deepEqual(restored.design.reviewRegion,region);assert.equal(restored.design.reference.photo,photo);assert.deepEqual(restored.design.reference.photos,['data:image/jpeg;base64,Yw==']);assert.equal(restored.design.reviewRequest,model.design.reviewRequest);
 const corrupt=JSON.parse(projectJSON(model,emptyShopping()));corrupt.design.reviewRegion.image='https://example.com/view.png';assert.throws(()=>validateProject(corrupt),/history or protected edits/);
});

test('both budgeted routes forward region screenshots and malformed regions fail before paid requests',async t=>{
 const {db,sqlite}=budgetDb();testEnv.DB=db;t.after(()=>{delete testEnv.DB;sqlite.close();});let paid=0,sent;
 t.mock.method(globalThis,'fetch',async(url,init)=>{if(url.endsWith('/input_tokens'))return Response.json({input_tokens:100});paid++;sent=JSON.parse(init.body);return sent.stream?responseFrames():Response.json({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(completion)}]}]});});
 const cases=[[generatePOST,'generate',{prompt:'Add the courtyard entrance',detail:'medium',brief,previous:scene}],[reviewPOST,'review',{brief,images:[photo,photo,photo],revision:'Add the courtyard entrance'}]];
 for(const [handler,path,payload] of cases){
  const response=await handler(new Request('https://brickwork.test/api/'+path,{method:'POST',headers:{'x-brickwork-api-key':'test-key'},body:JSON.stringify({...payload,region})}));assert.equal(response.status,200);const events=await collect(response.body);assert.ok(events.some(e=>e.type==='complete'));assert.equal(events.filter(e=>e.type==='usage').length,1);assert.ok(sent.input[0].content.some(c=>c.image_url===region.image));
  const before=paid;for(const invalid of [{...region,image:'http://localhost/private'},{...region,components:Array(25).fill('Wall')},{...region,polygon:[]},{...region,image:'data:image/png;base64,'+'A'.repeat(1500000)}]){
   const bad=await handler(new Request('https://brickwork.test/api/'+path,{method:'POST',headers:{'x-brickwork-api-key':'test-key'},body:JSON.stringify({...payload,region:invalid})}));assert.equal(bad.status,400);
  }assert.equal(paid,before);
 }
 const before=paid;const ungrounded=await generatePOST(new Request('https://brickwork.test/api/generate',{method:'POST',headers:{'x-brickwork-api-key':'test-key'},body:JSON.stringify({prompt:'Make a building',detail:'medium',region})}));assert.equal(ungrounded.status,400);assert.equal((await ungrounded.json()).code,'INVALID_REVISION_REGION');assert.equal(paid,before);
});
