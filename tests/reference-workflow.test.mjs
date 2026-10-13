import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/reference-photos";export * from "./lib/design-workflow";export * from "./lib/design-research";export * from "./lib/design-review";export * from "./lib/design-project";export * from "./lib/design-library";export * from "./lib/generated-scene";export {validateProject} from "./lib/models";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const signal=()=>new AbortController().signal;
const photo='data:image/jpeg;base64,YQ==';
// Authored test geometry, not an AI-generated or historically accurate Dulles model.
const scene={name:'Terminal fixture',description:'Two visible components',dimensions:{x:24,y:24,z:16},shapes:[
 {id:'base',component:'Base',label:'base',kind:'box',operation:'add',color:'gray',position:{x:0,y:0,z:0},size:{x:24,y:2,z:16},end:{x:0,y:0,z:0},radius:1},
 {id:'terminal',component:'Terminal',label:'terminal',kind:'box',operation:'add',color:'tan',position:{x:2,y:2,z:2},size:{x:16,y:9,z:8},end:{x:0,y:0,z:0},radius:1},
 {id:'tower',component:'Tower',label:'tower',kind:'box',operation:'add',color:'tan',position:{x:19,y:2,z:2},size:{x:3,y:18,z:3},end:{x:0,y:0,z:0},radius:1},
]};
const sheet={searchable:true,kind:'building',subject:'Dulles terminal fixture',summary:'Terminal and tower, no airfield.',length_m:null,width_m:null,height_m:null,openness:null,proportions:'Long terminal',colors:['tan'],silhouette:['Curved roof'],distinctive:['Glass facade'],sources:['https://www.flydulles.com/about-airport/history'],included:['Terminal','Tower'],excluded:['Runways'],relations:[{from:'Tower',relation:'right_of',to:'Terminal'}],uncertainties:['This geometry and tower placement are test fixtures.'],images:[{url:'https://example.com/source.jpg',source:'https://example.com/page',caption:'Fixture image'}]};
const brief={...m.defaultBrief('Dulles main terminal'),composition:'Terminal and original tower only.'};
const reference={sheet,photo,briefKey:m.referenceKey(brief)};

test('fresh and over-budget builds each perform one lookup, one design and one review, without a trim call',async()=>{
 for(const count of [100,900]){
  const calls=[],candidate={pieces:Array(count).fill({})};
  const result=await m.runDesignWorkflow({signal:signal(),lookup:async()=>{calls.push('research');return reference;},design:async r=>{assert.equal(r,reference);calls.push('design');return scene;},compile:async()=>{calls.push('local compile');return candidate;},review:async(_model,_scene,r)=>{assert.equal(r,reference);calls.push('review');return {recognizable:false};}});
  assert.deepEqual(calls,['research','design','local compile','review']);assert.equal(result.model,candidate);assert.equal(result.review.recognizable,false);
 }
});
test('reopened revisions reuse the exact saved pack without research',async()=>{
 const calls=[];const result=await m.runDesignWorkflow({reference,signal:signal(),lookup:async()=>{throw Error('Unexpected paid lookup');},design:async r=>{assert.deepEqual(r,reference);calls.push('design');return scene;},compile:async()=>({pieces:[]}),review:async(_m,_s,r)=>{assert.deepEqual(r,reference);calls.push('review');return {};}});
 assert.equal(result.reference.photo,photo);assert.deepEqual(calls,['design','review']);
 assert.notEqual(m.referenceKey({...brief,scope:'site'}),reference.briefKey);
});
test('lookup failure stops subsequent work and generic subjects still proceed',async()=>{
 for(const error of [Error('HTTP 503'),new SyntaxError('Bad JSON'),Error('Invalid reference')]){
  let later=0;await assert.rejects(()=>m.runDesignWorkflow({signal:signal(),lookup:async()=>{throw error;},design:async()=>{later++;},compile:async()=>{later++;},review:async()=>{later++;}}),error);assert.equal(later,0);
 }
 const result=await m.runDesignWorkflow({signal:signal(),lookup:async()=>({sheet:{searchable:false}}),design:async()=>scene,compile:async()=>({pieces:[]}),review:async()=>({recognizable:true})});assert.equal(result.review.recognizable,true);
});
test('review failure retains the completed model and cancellation prevents the next paid step',async()=>{
 const model={pieces:[1]},result=await m.runDesignWorkflow({reference,signal:signal(),lookup:async()=>reference,design:async()=>scene,compile:async()=>model,review:async()=>{throw Error('Review offline');}});
 assert.equal(result.model,model);assert.equal(result.scene,scene);assert.equal(result.review,null);assert.match(result.reviewError.message,/offline/);
 const controller=new AbortController();let reviewed=false;await assert.rejects(()=>m.runDesignWorkflow({reference,signal:controller.signal,lookup:async()=>reference,design:async()=>{controller.abort();return scene;},compile:async()=>model,review:async()=>{reviewed=true;}}),{name:'AbortError'});assert.equal(reviewed,false);
});
test('project export, browser save and repacking all preserve the reference sheet and photo',()=>{
 const model={...m.compileScene(scene,{smooth:true}),generation:scene,libraryId:'fixture',design:{brief,reference,unfinished:true,reviewRequest:"Add the original control tower",manual:m.emptyManual(),locked:[],revisions:[]}};
 const json=JSON.parse(m.projectJSON(model,m.emptyShopping()));assert.deepEqual(m.validateProject(json).design.reference,reference);
 const saved=m.packDesign(model,'draft');assert.deepEqual(m.unpackDesign(saved).design.reference,reference);assert.equal(m.unpackDesign(saved).design.unfinished,true);assert.equal(m.unpackDesign(saved).design.reviewRequest,"Add the original control tower");
 json.pieces=json.pieces.slice(1);const repacked=m.unpackDesign({...saved,project:JSON.stringify(json)});assert.deepEqual(repacked.design.reference,reference);assert.equal(repacked.design.reviewStale,true);
 delete json.design.reference;assert.ok(m.unpackDesign({...saved,project:JSON.stringify(json)}).generation);
});
test('additional feedback photos and a place hint survive export, reopen and repacking',()=>{
 const extra=['data:image/jpeg;base64,Yg==','data:image/jpeg;base64,Yw==','data:image/jpeg;base64,ZA=='];
 const pack={...reference,photos:extra,identityHint:'Chantilly, Virginia; original terminal'},model={...m.compileScene(scene,{smooth:true}),generation:scene,libraryId:'photos-fixture',design:{brief,reference:pack,manual:m.emptyManual(),locked:[],revisions:[]}};
 const json=JSON.parse(m.projectJSON(model,m.emptyShopping()));assert.deepEqual(m.validateProject(json).design.reference,pack);
 const saved=m.packDesign(model,'draft');assert.deepEqual(m.unpackDesign(saved).design.reference,pack);
 json.pieces=json.pieces.slice(1);assert.deepEqual(m.unpackDesign({...saved,project:JSON.stringify(json)}).design.reference,pack);
 assert.deepEqual(m.collectReferencePhotos(photo,[photo,...extra]),[photo,...extra]);
 assert.equal(m.contextSchema.safeParse({...model.design,reference:{...pack,photos:[...extra,'data:image/jpeg;base64,ZQ==']}}).success,false);
 assert.equal(m.contextSchema.safeParse({...model.design,reference:{...pack,photos:['https://example.com/private.jpg']}}).success,false);
});
test('component counts use final smooth/hollow/manual pieces and add up to the displayed total',()=>{
 for(const options of [{smooth:true},{hollow:true,smooth:true},{manual:{erase:[],bricks:[{id:900,part:'3001',color:'blue',x:0,y:2,z:12,w:4,h:3,d:2,rotated:false,stage:0}]},smooth:true}]){
  const model=m.compileScene(scene,options),by=m.componentBudget(scene,model);assert.equal(by.reduce((n,c)=>n+c.pieces,0),model.pieces.length);
 }
});
test('long, low subjects retain physical proportions with room for the base',()=>{
 const target=m.targetExtents({...sheet,length_m:300,width_m:60,height_m:20},{maxWidth:80,maxDepth:80,maxHeight:160});
 assert.deepEqual(target,{x:78,z:16,y:13,vertical:1});assert.equal(m.targetExtents(sheet,{maxWidth:80,maxDepth:80,maxHeight:160}),undefined);
});
test('review distinguishes generated views, source photo and retrieved references, and a bad layout cannot pass',async()=>{
 let sent;const review={composition:{status:'mismatch',evidence:'A runway occupies the front of the terminal.'},summary:'Wrong layout',recognizable:true,features:[],improvements:['Remove the runway'],revision:{status:'not_requested',evidence:''}};
 const fetcher=async(_url,request)=>{sent=JSON.parse(request.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});};
 const result=await m.reviewDesign(brief,Array(5).fill('data:image/jpeg;base64,Yg=='),'key','model',signal(),fetcher,'',undefined,reference);
 const content=sent.input[0].content;assert.deepEqual(JSON.parse(content[0].text).referenceSheet,sheet);assert.equal(content.filter(c=>c.type==='input_image').length,7);assert.equal(content.at(-1).image_url,photo);assert.ok(content.some(c=>c.text?.includes('overhead')));assert.equal(result.recognizable,false);
 delete review.composition;await assert.rejects(()=>m.reviewDesign(brief,[], 'key','model',signal(),fetcher,'',undefined,reference),/reference composition/);
});
test('review includes every feedback photo once and never confuses them with generated views',async()=>{
 const second='data:image/jpeg;base64,Yw==',third='data:image/jpeg;base64,ZA==';let sent;
 const review={composition:{status:'matches',evidence:'The tower now matches the additional angle.'},summary:'Revised tower',recognizable:true,features:[],improvements:[],revision:{status:'visible',evidence:'Additional tower angle applied.'}};
 const fetcher=async(_url,request)=>{sent=JSON.parse(request.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});};
 await m.reviewDesign(brief,Array(5).fill('data:image/jpeg;base64,Yg=='),'key','model',signal(),fetcher,'Match the tower in these photos',undefined,{...reference,photos:[second,photo,third]});
 const content=sent.input[0].content,sourceLabels=content.filter(c=>c.text?.startsWith('USER REFERENCE PHOTO'));
 assert.equal(sourceLabels.length,3);assert.match(sourceLabels[0].text,/original/);assert.match(sourceLabels[1].text,/additional evidence/);
 assert.deepEqual(content.filter(c=>c.type==='input_image').slice(-3).map(c=>c.image_url),[photo,second,third]);
 assert.equal(JSON.parse(content[0].text).generatedViewCount,5);assert.equal(JSON.parse(content[0].text).sourcePhotoCount,3);
 assert.match(sent.instructions,/never use any reference photo as evidence/);
});
test('research uses real search provenance, retains selected image results and rejects invented sources or dangling relations',async()=>{
 let sent;let raw={...sheet,image_urls:['https://example.com/source.jpg','https://invented.test/image.jpg']};
 let search={type:'web_search_call',action:{type:'search',query:'terminal',sources:[{url:sheet.sources[0]}]},results:[{type:'image_result',image_url:'https://example.com/source.jpg',source_website_url:'https://example.com/page',caption:'Fixture image'}]};
 const fetcher=async(_url,request)=>{sent=JSON.parse(request.body);return Response.json({status:'completed',output:[search,{content:[{type:'output_text',text:JSON.stringify(raw)}]}]});};
 const result=await m.researchSubject(brief.idea,'key','model',signal(),fetcher,undefined,{scope:'subject',composition:brief.composition,reference:photo});
 assert.equal(JSON.parse(sent.input[0].content[0].text).scope,'subject');assert.equal(sent.input[0].content.at(-1).image_url,photo);assert.deepEqual(result.images,sheet.images);assert.ok(!result.sources.includes('https://invented.test/image.jpg'));
 raw={...raw,relations:[{from:'Runway',relation:'left_of',to:'Missing'}]};await assert.rejects(()=>m.researchSubject(brief.idea,'key','model',signal(),fetcher),/inconsistent component names/);
 raw={...raw,relations:[],image_urls:[]};search={type:'web_search_call',action:{type:'search'}};await assert.rejects(()=>m.researchSubject(brief.idea,'key','model',signal(),fetcher),/No usable source/);
 raw={};await assert.rejects(()=>m.researchSubject(brief.idea,'key','model',signal(),fetcher),/reference plan is incomplete/);
});

// These are provider fixtures: they verify the instructions, forwarded evidence,
// and workflow gates without making a paid model request or forcing an identity
// with a client-side Washington Monument special case.
const monumentPlan=(location,status='confirmed',question='')=>({...sheet,kind:'monument',subject:`Washington Monument, ${location}`,summary:`The Washington Monument in ${location}.`,identity:{status,location,question},contextAdequate:status==='confirmed',included:['Monument'],excluded:[],relations:[],uncertainties:[],images:[],image_urls:[],sources:['https://official.example.test/monument'],proportions:'Tall narrow monument',silhouette:['Tall monument on a base'],layout:'The main approach faces +z.'});
function monumentProvider(plans,requests){return async(_url,request)=>{requests.push(JSON.parse(request.body));const plan=plans[Math.min(requests.length-1,plans.length-1)];return Response.json({status:'completed',output:[{type:'web_search_call',action:{type:'search',query:plan.subject,sources:plan.sources.map(url=>({url}))}},{content:[{type:'output_text',text:JSON.stringify(plan)}]}]});};}

test('an unqualified landmark uses a source-verified dominant interpretation and proceeds after one lookup',async()=>{
 const requests=[],fetcher=monumentProvider([monumentPlan('Washington, DC')],requests),calls=[];
 const result=await m.runDesignWorkflow({signal:signal(),lookup:async()=>{
  const researched=await m.researchWithContext({},context=>m.researchSubject('the Washington Monument','key','model',signal(),fetcher,undefined,context),signal());
  assert.equal(researched.passes,1);assert.equal(researched.needsClarification,false);assert.equal(researched.question,'');calls.push('research');return {sheet:researched.sheet};
 },design:async ref=>{assert.equal(ref.sheet.identity.location,'Washington, DC');calls.push('design');return scene;},compile:async()=>({pieces:[]}),review:async()=>{calls.push('review');return {recognizable:true};}});
 assert.deepEqual(calls,['research','design','review']);assert.equal(result.review.recognizable,true);assert.equal(requests.length,1);
 const sent=requests[0],input=JSON.parse(sent.input[0].content[0].text);assert.equal(input.idea,'the Washington Monument');assert.equal(input.identityHint,'');assert.equal(sent.max_tool_calls,2);
 assert.match(sent.instructions,/first search to verify the dominant conventional interpretation/);assert.match(sent.instructions,/A shared name alone is not genuine ambiguity/);assert.match(sent.instructions,/Washington Monument.*Washington, DC/);assert.match(sent.instructions,/Never identify a named place from memory alone/);
 assert.doesNotMatch(sent.instructions,/Shared names, conflicting images, or multiple plausible sites mean ambiguous/);
});

test('explicit Baltimore wording, location hints, correction feedback and photos reach research unchanged',async()=>{
 const secondPhoto='data:image/jpeg;base64,Yg==';
 for(const {idea,context} of [
  {idea:'the Washington Monument in Baltimore',context:{}},
  {idea:'the Washington Monument',context:{identityHint:'Mount Vernon, Baltimore',reference:photo,photos:[secondPhoto]}},
  {idea:'the Washington Monument',context:{feedback:'I mean the one in Baltimore, not the DC obelisk.',reference:photo}},
 ]){
  const requests=[],fetcher=monumentProvider([monumentPlan('Baltimore')],requests);
  const result=await m.researchWithContext(context,c=>m.researchSubject(idea,'key','model',signal(),fetcher,undefined,c),signal());
  assert.equal(requests.length,1);assert.equal(result.needsClarification,false);assert.equal(result.sheet.identity.location,'Baltimore');
  const sent=requests[0],input=JSON.parse(sent.input[0].content[0].text);assert.equal(input.idea,idea);assert.equal(input.identityHint,context.identityHint||'');assert.equal(input.feedback,context.feedback||'');
  assert.deepEqual(sent.input[0].content.filter(c=>c.type==='input_image').map(c=>c.image_url),m.collectReferencePhotos(context.reference,context.photos));
  assert.match(sent.instructions,/Explicit location, a supplied source, identifiable photo details, or a correction take precedence/);
 }
});

test('genuine conflicting landmark evidence still asks after bounded research and never reaches design',async()=>{
 const requests=[],ambiguous=monumentPlan('','ambiguous','Your photos show two different monuments. Which one should this build follow?'),fetcher=monumentProvider([ambiguous,ambiguous],requests);let designed=false;
 await assert.rejects(()=>m.runDesignWorkflow({signal:signal(),lookup:async()=>{
  const result=await m.researchWithContext({reference:photo,feedback:'Match this photo'},c=>m.researchSubject('the Washington Monument','key','model',signal(),fetcher,undefined,c),signal());
  assert.equal(result.passes,2);assert.equal(result.needsClarification,true);assert.match(result.question,/two different monuments/);throw Error(result.question);
 },design:async()=>{designed=true;return scene;},compile:async()=>({pieces:[]}),review:async()=>({})}),/two different monuments/);
 assert.equal(designed,false);assert.equal(requests.length,2);assert.match(requests[1].instructions,/earlier unnecessary namesake question does not require a user answer/);
});

test('the review rubric, a critical mismatch, a targeted scope, the designer-facing history and the auto-repair log survive export and reopen',()=>{
 const review={summary:'The terminal reads well.',recognizable:false,criticalMismatch:true,features:[],rubric:[{feature:'Glass facade',kind:'distinctive',status:'missing',evidence:'No glass.'},{feature:'Curved roof',kind:'silhouette',status:'visible',evidence:'Roof sags.'}],improvements:[],scope:'targeted'};
 const design={brief:{...brief,autoRepair:false},reference,manual:m.emptyManual(),locked:[],revisions:[{request:'Dulles main terminal',summary:'The Dulles terminal under its sweeping roof.',builder:'The terminal reads well. Tower height estimated.',at:'2026-10-13T00:00:00.000Z'}],review,autoRepairs:[{at:'2026-10-13T00:00:00.000Z',reasons:['Missing Glass facade'],kept:false,fixed:0,cost:.1234,checked:false}]};
 const model={...m.compileScene(scene,{smooth:true}),generation:scene,libraryId:'rubric-fixture',design};
 const back=m.validateProject(JSON.parse(m.projectJSON(model,m.emptyShopping())));
 assert.deepEqual(back.design.review,review);assert.deepEqual(back.design.autoRepairs,design.autoRepairs);assert.equal(back.design.revisions[0].builder,design.revisions[0].builder);assert.equal(back.design.brief.autoRepair,false);
 assert.equal(m.unpackDesign(m.packDesign(model,'draft')).design.autoRepairs[0].reasons[0],'Missing Glass facade');
 // The rubric is a separate field: the brief's features, and so the research key, never change.
 assert.equal(m.referenceKey(design.brief),reference.briefKey);
});
