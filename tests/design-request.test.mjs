import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

// Captured provider request bodies: what each design and review pass sends, sized and slimmed per request.
const bundle=await build({stdin:{contents:'export {env as testEnv} from "cloudflare:workers";export * from "./lib/generation-provider";export * from "./lib/design-review";export * from "./lib/ai-efficiency";export {revisionFeedback,approvedFeedback,flaggedReviewItems} from "./lib/design-workflow";export {compactScene,validateScene} from "./lib/generated-scene";export {defaultBrief} from "./lib/design-project";export {foundationScene} from "./lib/live-arrivals";export {DESIGN_EXAMPLES} from "./lib/design-examples";export {readEvents} from "./lib/generation-stream";export {POST as generatePOST} from "./app/api/generate/route";export {POST as reviewPOST} from "./app/api/review/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const box=(id,x,y,z,w,h,d,extra={})=>({id,component:extra.component||id,label:id,kind:'box',operation:'add',color:'red',position:{x,y,z},size:{x:w,y:h,z:d},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
// A grounded scene with n shapes: a base and n-1 small posts on it.
const sceneOf=(n,name='Station')=>({name,description:'A small station.',dimensions:{x:40,y:24,z:40},shapes:[box('base',0,0,0,40,2,40,{color:'gray',component:'Base'}),...Array.from({length:n-1},(_,i)=>box(`post-${i}`,(i%13)*3,2,Math.floor(i/13)*3,2,4,2))]});
const frames=scene=>[{type:'response.output_text.delta',delta:JSON.stringify(m.compactScene(scene))},{type:'response.completed',response:{status:'completed',usage:{input_tokens:100,output_tokens:50}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
async function design(input,model='gpt-6.1-sol',reply=input.previous&&input.previous.shapes.length>=10?input.previous:sceneOf(3)){
 let body;const events=[];for await(const e of m.generateScene(input,'key',model,new AbortController().signal,async(_u,init)=>{body=JSON.parse(init.body);return new Response(frames(reply));}))events.push(e);
 return {body,data:JSON.parse(body.input[0].content[0].text),events};
}
const view=n=>`data:image/jpeg;base64,${Buffer.from(`view-${n}`).toString('base64')}`;

test('a first build gets room for every shape plus its reasoning, and examples follow the brief idea and subject kind',async()=>{
 const brief=m.defaultBrief('A red delivery truck');
 const first=await design({prompt:`${brief.idea}\n\nAdditional instructions: add a tall tower`,detail:'medium',brief,previous:m.foundationScene(brief),research:{kind:'vehicle'},budget:{limit:600,used:4,remaining:596,byComponent:[{component:'Foundation',pieces:4}]}});
 assert.equal(first.body.max_output_tokens,2000+80*240+6000);assert.equal(first.body.reasoning.effort,'low');
 assert.equal(first.data.examples[0].about,m.DESIGN_EXAMPLES.find(e=>e.id==='car').about,'the vehicle example, not the tower one the revision wording names');
 assert.deepEqual(first.data.pieceBudget,{limit:600,used:4,remaining:596,byComponent:[{component:'Foundation',pieces:4}]});
 assert.equal((await design({prompt:brief.idea,detail:'medium',brief:{...brief,quality:'sol_medium'},previous:m.foundationScene(brief)})).body.max_output_tokens,32000);
 assert.equal((await design({prompt:brief.idea,detail:'medium',brief,previous:m.foundationScene(brief)},'gpt-6-astra')).body.max_output_tokens,32000);
 assert.equal(m.designOutputLimit(0,'low',true),27200);assert.equal(m.designOutputLimit(0,'medium',true),32000);
});

test('revisions skip the examples and size their output to re-emit every shape they were given',async()=>{
 const brief=m.defaultBrief('A small station');
 const small=await design({prompt:'Add more windows',detail:'medium',brief,previous:sceneOf(30)});
 assert.equal(small.data.examples,undefined);assert.equal(small.body.max_output_tokens,14000);
 const large=await design({prompt:'Make the whole station bigger',detail:'medium',brief,previous:sceneOf(200)});
 assert.equal(large.body.max_output_tokens,80*200+6000);
 const careful=await design({prompt:'Make the whole station bigger',detail:'medium',brief:{...brief,quality:'sol_medium'},previous:sceneOf(240)});
 assert.equal(careful.body.max_output_tokens,80*240+12000);
 // Finishing an interrupted draft may still write most of the model.
 const resumed=await design({prompt:'Finish this interrupted design',detail:'medium',brief,previous:sceneOf(40),continuation:true});
 assert.equal(resumed.body.max_output_tokens,27200);assert.equal(resumed.data.examples,undefined);
 // The part catalog is chosen per request, outside the cached prefix (critic 15): only instructions and the sheet are cached there.
 assert.ok(small.data.partCatalog.parts.length>0);
});

test('an automatic repair shows the designer the rendered model, overhead in high detail, and approved items join the checks',async()=>{
 const brief=m.defaultBrief('A small station'),renders=[1,2,3,4,5].map(view);
 const r=await design({prompt:'Fix the floating canopy',detail:'medium',brief,previous:sceneOf(20),renders,feedback:['3 pieces have no stud path to the ground.'],approved:['Clock tower: not visible']});
 const content=r.body.input[0].content,labels=content.filter(c=>c.type==='input_text'&&c.text.startsWith('CURRENT MODEL VIEW'));
 assert.equal(labels.length,5);assert.match(labels[0].text,/^CURRENT MODEL VIEW 1 \(generated, before repair\)/);assert.match(labels[4].text,/overhead/);
 const images=content.filter(c=>c.type==='input_image');assert.deepEqual(images.map(i=>i.image_url),renders);assert.deepEqual(images.map(i=>i.detail),['low','low','low','low','high']);
 assert.deepEqual(r.data.repairFeedback,['3 pieces have no stud path to the ground.','Approved by the user: Clock tower: not visible']);
 assert.match(r.body.instructions,/CURRENT MODEL VIEWs show the generated model before this repair/);
 assert.match(m.DESIGN_INSTRUCTIONS,/build the named section, cutaway or partial length faithfully instead of shrinking everything/);
 assert.match(m.DESIGN_INSTRUCTIONS,/target\.vertical above 1/);
});

test('revision feedback is the checks, corrections and approved items, never the reviewer\'s unrequested suggestions',()=>{
 const review={summary:'Mostly right.',recognizable:true,features:[{feature:'Clock tower',status:'missing',evidence:'No tower on the roof.'}],improvements:['Add ornate trim to every window'],composition:{status:'matches',evidence:'Layout matches.'},revision:{status:'not_requested',evidence:''}};
 const feedback=m.revisionFeedback({issues:['2 separate assemblies. Connect them with overlapping studded plates.'],corrections:['Moved “Sign” inward to fit the build area.'],rejected:'A generated shape was invalid: col.'});
 assert.deepEqual(feedback,['2 separate assemblies. Connect them with overlapping studded plates.','Automatic correction already applied: Moved “Sign” inward to fit the build area.','The previous attempt was rejected before it could be built: A generated shape was invalid: col.']);
 // "Add a door" approves nothing; the improvement and the missing tower stay out.
 assert.deepEqual(m.approvedFeedback({approved:[],repairing:false,review}),[]);
 assert.ok(![...feedback,...m.approvedFeedback({repairing:false,review})].some(f=>/ornate trim|Clock tower/.test(f)));
 // Ticking it approves it; the Fix flagged issues action approves the flagged items only.
 assert.deepEqual(m.approvedFeedback({approved:['Add ornate trim to every window'],repairing:false,review}),['Add ornate trim to every window']);
 assert.deepEqual(m.approvedFeedback({repairing:true,review}),['Clock tower: No tower on the roof.']);
 assert.deepEqual(m.flaggedReviewItems({...review,revision:{status:'uncertain',evidence:'The door is hard to see.'}}),['Clock tower: No tower on the roof.','Requested change not yet visible: The door is hard to see.']);
});

test('approved items are never blank and never longer than the route takes',()=>{
 // A targeted check of a local edit: unrecognizable (a critical mismatch), composition not_applicable with no evidence.
 const review={summary:'The roof is red.',recognizable:false,criticalMismatch:true,features:[{feature:'Clock tower',status:'missing',evidence:'No tower.'},{feature:'Arches',status:'uncertain',evidence:''}],improvements:[],composition:{status:'not_applicable',evidence:''},revision:{status:'uncertain',evidence:' '}};
 assert.deepEqual(m.flaggedReviewItems(review),['Clock tower: No tower.','Arches','Requested change not yet visible']);
 assert.deepEqual(m.flaggedReviewItems({...review,composition:{status:'mismatch',evidence:'  '}}),['Clock tower: No tower.','Arches','Requested change not yet visible']);
 assert.ok(m.flaggedReviewItems({...review,composition:{status:'mismatch',evidence:'Wings missing.'}}).includes('Wings missing.'));
 const approved=m.approvedFeedback({approved:['',' ','Add a red door',`Make the clock ${'very '.repeat(150)}large`],repairing:true,review});
 assert.ok(approved.every(a=>a.trim()&&a.length<=500),JSON.stringify(approved));assert.equal(approved.length,5);assert.equal(approved[0],'Add a red door');
});

test('a fixable shape is repaired before validation and the corrections are reported; locks keep the build area',async()=>{
 const brief=m.defaultBrief('A small station'),bad={...sceneOf(3),shapes:[...sceneOf(3).shapes,box('awning',36,2,0,6,2,2)]};
 const r=await design({prompt:brief.idea,detail:'medium',brief,previous:m.foundationScene(brief)},'gpt-6.1-sol',bad);
 const corrections=r.events.find(e=>e.type==='corrections'),complete=r.events.at(-1);
 assert.equal(complete.type,'complete');assert.ok(corrections.items.some(c=>/Grew the build area/.test(c)),corrections.items.join(' '));assert.ok(r.events.indexOf(corrections)<r.events.indexOf(complete));
 assert.equal(complete.scene.dimensions.x,42);assert.doesNotThrow(()=>m.validateScene(complete.scene));
 const previous=sceneOf(12),locked=await design({prompt:'Add an awning',detail:'medium',brief,previous,locked:['Base']},'gpt-6.1-sol',{...previous,shapes:[...previous.shapes,box('awning',36,2,0,6,2,2)]});
 assert.deepEqual(locked.events.at(-1).scene.dimensions,previous.dimensions);assert.ok(locked.events.find(e=>e.type==='corrections').items.some(c=>/Trimmed/.test(c)));
 // A valid design reports nothing.
 assert.equal((await design({prompt:brief.idea,detail:'medium',brief,previous:m.foundationScene(brief)})).events.some(e=>e.type==='corrections'),false);
});

test('the generate route accepts approved items and up to five model views of an existing design, within its raised byte cap',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete m.testEnv.DB;});m.testEnv.DB=db;
 const bodies=[];t.mock.method(globalThis,'fetch',async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1000});bodies.push(JSON.parse(init.body));return new Response(frames(sceneOf(20)));});
 const brief=m.defaultBrief('A small station'),big=`data:image/jpeg;base64,${'A'.repeat(740000)}`;
 const post=body=>m.generatePOST(new Request('https://brickwork.test/api/generate',{method:'POST',headers:{'x-brickwork-api-key':'sk-request-test'},body:JSON.stringify(body)}));
 const ok=await post({prompt:'Fix the flagged checks',detail:'medium',brief,previous:sceneOf(20),renders:Array(5).fill(big),approved:['Clock tower: not visible'],photos:Array(4).fill(`data:image/jpeg;base64,${'B'.repeat(1400000)}`)});
 assert.equal(ok.status,200);await Array.fromAsync(m.readEvents(ok.body));
 const sent=JSON.parse(bodies[0].input.find(x=>x.role==='user'&&JSON.parse(x.content[0].text).repairFeedback!==undefined)?.content[0].text||bodies[0].input.at(-1).content[0].text);
 assert.deepEqual(sent.repairFeedback,['Approved by the user: Clock tower: not visible']);
 // A blank or overlong approved item is dropped or clipped; it never rejects the whole paid design.
 bodies.length=0;const loose=await post({prompt:'Fix the flagged checks',detail:'medium',brief,previous:sceneOf(20),approved:['Clock tower: No tower.','','   ',`Arches ${'tall '.repeat(200)}`]});
 assert.equal(loose.status,200);await Array.fromAsync(m.readEvents(loose.body));
 const looseSent=JSON.parse(bodies[0].input.flatMap(x=>Array.isArray(x.content)?x.content:[]).find(c=>c.type==='input_text'&&c.text.startsWith('{')&&JSON.parse(c.text).repairFeedback).text).repairFeedback;
 assert.equal(looseSent.length,2);assert.equal(looseSent[0],'Approved by the user: Clock tower: No tower.');assert.ok(looseSent[1].length<=521,String(looseSent[1].length));
 assert.equal((await post({prompt:'Fix it',detail:'medium',brief,previous:sceneOf(20),renders:Array(6).fill(view(1))})).status,400);
 assert.equal((await post({prompt:'A station',detail:'medium',brief,renders:[view(1)]})).status,400,'model views need an existing design');
});

const reviewBrief={...m.defaultBrief('Dulles main terminal'),features:['Curved roof']};
const sheet={searchable:false,kind:'building',subject:'Dulles terminal',summary:'Terminal.',length_m:null,width_m:null,height_m:null,proportions:'Long',colors:['white'],silhouette:['A sweeping concave roof hung between two rows of outward-leaning concrete piers along the entire length of the terminal','Long low glass walls','Third silhouette line'],distinctive:['Outward-leaning piers','Curved roof','Control tower beside the terminal','Mobile lounges','Glass curtain walls'],sources:[],images:[{url:'https://example.com/a.jpg',source:'https://example.com/a',caption:'Terminal'}]};
async function review(answer,options={},images=Array(5).fill(view(1)),brief=reviewBrief){
 let body;const r=await m.reviewDesign(brief,images,'key','gpt-6.1-sol',new AbortController().signal,async(_u,init)=>{body=JSON.parse(init.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});},options.revision||'',undefined,{sheet,photo:view(9)},options.region,options);
 return {r,body,data:JSON.parse(body.input[0].content[0].text)};
}
const answer=(extra={})=>({composition:{status:'matches',evidence:'Layout matches.'},revision:{status:'not_requested',evidence:''},summary:'The terminal reads well from every side. The roof sag is a little shallow, and the tower is missing.',recognizable:true,criticalMismatch:false,features:[{feature:'Curved roof',status:'visible',evidence:'Roof sags.'}],rubric:[{item:'x',status:'visible',evidence:'Piers lean out.'},{item:'y',status:'missing',evidence:'No tower.'}],improvements:[],...extra});

test('a full review sends five views and a separate rubric from research and signature, matched by position',async()=>{
 const {r,body,data}=await review(answer(),{signature:['Mobile lounge on its scissor lift']});
 assert.deepEqual(data.brief.features,['Curved roof'],'the rubric is never merged into the brief');
 assert.deepEqual(data.rubric,['Outward-leaning piers','Control tower beside the terminal','Mobile lounges','Glass curtain walls','A sweeping concave roof hung between two rows of outward-leaning concrete piers…','Long low glass walls','Mobile lounge on its scissor lift']);
 assert.ok(data.rubric.every(x=>x.length<=80));
 assert.equal(body.input[0].content.filter(c=>c.type==='input_image').length,5+1+1);assert.equal(data.mode,'full');assert.deepEqual(data.referenceSheet,sheet);
 assert.deepEqual(r.rubric.map(x=>[x.feature,x.kind,x.status]),[['Outward-leaning piers','distinctive','visible'],['Control tower beside the terminal','distinctive','missing'],...['Mobile lounges','Glass curtain walls'].map(f=>[f,'distinctive','uncertain']),['A sweeping concave roof hung between two rows of outward-leaning concrete piers…','silhouette','uncertain'],['Long low glass walls','silhouette','uncertain'],['Mobile lounge on its scissor lift','signature','uncertain']]);
 assert.equal(r.summary,'The terminal reads well from every side.');assert.ok(r.summary.length<=160);assert.equal(r.criticalMismatch,undefined);
 assert.doesNotMatch(body.instructions,/five views|five generated/);assert.equal(body.reasoning.effort,'low');assert.equal(body.max_output_tokens,4000);
 // Brief and rubric together stay within twelve checks.
 assert.equal(m.reviewRubric({features:Array(10).fill(0).map((_,i)=>`Feature ${i}`)},sheet).length,2);
});

test('a targeted review sends three views without the unchanged sources and may leave composition unassessed',async()=>{
 const {r,body,data}=await review(answer({composition:{status:'not_applicable',evidence:'Sources not resent.'},revision:{status:'visible',evidence:'Door added.'}}),{mode:'targeted',revision:'Add a door'},[view(1),view(2),view(5)]);
 const images=body.input[0].content.filter(c=>c.type==='input_image');
 assert.equal(images.length,3);assert.equal(data.mode,'targeted');assert.equal(data.referenceSheet,undefined);assert.equal(data.sourcePhotoCount,0);
 assert.match(body.input[0].content.filter(c=>c.type==='input_text').at(-1).text,/view 3 \(overhead\)/);
 assert.equal(r.composition.status,'not_applicable');assert.equal(r.revision.status,'visible');assert.equal(r.scope,'targeted');
 // Without the reference, a targeted check's doubt about the layout is no finding; a mismatch it can see still is.
 const unsure=await review(answer({composition:{status:'uncertain',evidence:'Cannot compare without the reference.'},revision:{status:'visible',evidence:'Door added.'}}),{mode:'targeted',revision:'Add a door'},[view(1),view(2),view(5)]);
 assert.equal(unsure.r.recognizable,true);
 const seen=await review(answer({composition:{status:'mismatch',evidence:'The tower moved to the front.'},revision:{status:'visible',evidence:'Door added.'}}),{mode:'targeted',revision:'Add a door'},[view(1),view(2),view(5)]);
 assert.equal(seen.r.recognizable,false);assert.equal((await review(answer({composition:{status:'uncertain',evidence:'Rear hidden.'}}))).r.recognizable,false,'a full review stays strict');assert.equal((await review(answer())).r.scope,undefined);
 await assert.rejects(()=>review(answer({composition:{status:'not_applicable',evidence:''}})),/reference composition/,'a full review still must assess composition');
});

test('a critical mismatch is never recognizable, and only the Careful tier reviews with medium effort',async()=>{
 const {r}=await review(answer({criticalMismatch:true,summary:'This is a generic airport, not Dulles.'}));
 assert.equal(r.criticalMismatch,true);assert.equal(r.recognizable,false);
 const careful=await review(answer(),{},undefined,{...reviewBrief,quality:'sol_medium'});
 assert.equal(careful.body.reasoning.effort,'medium');assert.equal(careful.body.max_output_tokens,8000);
});

test('the review route accepts the targeted mode and the designer signature',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete m.testEnv.DB;});m.testEnv.DB=db;
 let sent;t.mock.method(globalThis,'fetch',async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1000});sent=JSON.parse(init.body);return Response.json({status:'completed',usage:{input_tokens:1000,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(answer({rubric:[],revision:{status:'visible',evidence:'Door added.'}}))}]}]});});
 const res=await m.reviewPOST(new Request('https://brickwork.test/api/review',{method:'POST',headers:{'x-brickwork-api-key':'sk-review-test'},body:JSON.stringify({brief:reviewBrief,images:[view(1),view(2),view(5)],mode:'targeted',signature:['Mobile lounge'],revision:'Add a door'})}));
 const events=[];for await(const e of m.readEvents(res.body))events.push(e);
 const data=JSON.parse(sent.input.flatMap(x=>x.content).find(c=>c.type==='input_text'&&c.text.startsWith('{')).text);assert.equal(data.mode,'targeted');assert.deepEqual(data.rubric,['Mobile lounge']);
 assert.equal(events.at(-1).type,'complete');assert.equal(events.at(-1).review.rubric[0].status,'uncertain');
});
