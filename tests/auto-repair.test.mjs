import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';

// One bounded automatic repair: the real design and review requests (mocked provider), the real compiler and checks.
const bundle=await build({stdin:{contents:'export * from "./lib/design-workflow";export {generateScene} from "./lib/generation-provider";export {reviewDesign} from "./lib/design-review";export {compileScene,compactScene} from "./lib/generated-scene";export {designChecks,defaultBrief} from "./lib/design-project";export {foundationScene} from "./lib/live-arrivals";export {addSupports} from "./lib/scene-repair";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const signal=()=>new AbortController().signal;
const box=(id,x,y,z,w,h,d,color='tan')=>({id,component:id,label:id,kind:'box',operation:'add',color,position:{x,y,z},size:{x:w,y:h,z:d},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
const base=box('Base',0,0,0,24,2,16,'gray'),hall=box('Hall',2,2,2,20,10,12);
const station={name:'Clock Tower Station',description:'A station hall.',dimensions:{x:24,y:40,z:16},shapes:[base,hall]};
const withTower={...station,shapes:[...station.shapes,box('Tower',9,12,6,6,20,4,'white')]};
const brief={...m.defaultBrief('A station with a clock tower'),features:['Clock tower'],finish:'studded'};
const view=n=>`data:image/jpeg;base64,${Buffer.from(`view-${n}`).toString('base64')}`;
const frames=scene=>[{type:'response.output_text.delta',delta:JSON.stringify(m.compactScene(scene))},{type:'response.completed',response:{status:'completed',usage:{input_tokens:100,output_tokens:50}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
const verdict=(status,extra={})=>({composition:{status:'not_applicable',evidence:''},revision:{status:'not_requested',evidence:''},summary:status==='visible'?'The tower stands over the hall.':'The hall reads, but the clock tower is missing.',recognizable:true,criticalMismatch:false,features:[{feature:'Clock tower',status,evidence:status==='visible'?'Tower above the hall.':'No tower.'}],rubric:[],improvements:['Add ornate window trim'],...extra});
const pack=scene=>({...m.compileScene(scene,{smooth:false}),generation:scene});
const metrics=(model,review)=>m.repairMetrics(m.designChecks(model,brief),review,model.pieces.length,brief.maxPieces);

// A first build through runDesignWorkflow with the generator's repair gates; every provider request is captured.
async function firstBuild({first=station,repaired=withTower,reviews=[verdict('missing'),verdict('visible')],remaining=5,enabled=true,eligible=true,failRepair=false}={}){
 const requests=[],reviewsLeft=[...reviews];let views=[];
 const designFetch=scene=>async(_u,init)=>{requests.push({kind:'design',body:JSON.parse(init.body)});if(failRepair&&requests.filter(r=>r.kind==='design').length>1)return Response.json({error:{message:'down'}},{status:503});return new Response(frames(scene));};
 const reviewFetch=async(_u,init)=>{requests.push({kind:'review',body:JSON.parse(init.body)});return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(reviewsLeft.shift())}]}]});};
 const run=async(input,scene)=>{let out;for await(const e of m.generateScene(input,'key','gpt-6.1-sol',signal(),designFetch(scene)))if(e.type==='complete')out=e.scene;return out;};
 const result=await m.runDesignWorkflow({reference:{},signal:signal(),lookup:async()=>({}),
  design:async()=>run({prompt:brief.idea,detail:'medium',brief,previous:m.foundationScene(brief)},first),
  compile:async scene=>pack(scene),
  review:async()=>{views=[1,2,3,4,5].map(view);return m.reviewDesign(brief,views,'key','gpt-6.1-sol',signal(),reviewFetch);},
  repair:{
   plan:(model,_scene,review)=>m.autoRepairAllowed({enabled,eligible,remaining,clarification:false})?m.materialFailures(metrics(model,review)):[],
   design:async(reasons,model,scene)=>run({prompt:'Fix the flagged problems',detail:'medium',brief,previous:scene,renders:views,feedback:m.revisionFeedback({reasons,issues:m.designChecks(model,brief).issues})},repaired),
   compile:async scene=>pack(scene),
   review:async()=>m.reviewDesign(brief,[view(1),view(2),view(5)],'key','gpt-6.1-sol',signal(),reviewFetch,'',undefined,undefined,undefined,{mode:'targeted'}),
   keep:(before,after)=>m.compareRepair(metrics(before.model,before.review),metrics(after.model,after.review)),
  }});
 return {result,requests,designs:requests.filter(r=>r.kind==='design'),reviewRequests:requests.filter(r=>r.kind==='review')};
}

test('a missing required feature triggers exactly one repair that sees the current model and is kept when it fixes it',async()=>{
 const {result,designs,reviewRequests}=await firstBuild();
 assert.equal(designs.length,2,'one first design and one repair');assert.equal(reviewRequests.length,2);
 const repair=designs[1].body,content=repair.input[0].content,data=JSON.parse(content[0].text);
 assert.deepEqual(content.filter(c=>c.type==='input_image').map(c=>c.image_url),[1,2,3,4,5].map(view));
 assert.equal(content.filter(c=>c.type==='input_text'&&/^CURRENT MODEL VIEW \d \(generated, before repair\)/.test(c.text)).length,5);
 assert.ok(data.repairFeedback.includes('Missing required feature: Clock tower'),data.repairFeedback.join(' | '));
 assert.ok(!data.repairFeedback.some(f=>/ornate window trim/.test(f)),'the reviewer\'s optional idea is not sent');
 // The re-check is targeted: three views and no source images.
 assert.equal(reviewRequests[1].body.input[0].content.filter(c=>c.type==='input_image').length,3);assert.equal(JSON.parse(reviewRequests[1].body.input[0].content[0].text).mode,'targeted');
 assert.deepEqual({kept:result.repair.kept,fixed:result.repair.fixed},{kept:true,fixed:1});assert.equal(result.scene.shapes.some(s=>s.id==='Tower'),true);assert.equal(result.review.features[0].status,'visible');
});

test('a passing first build, a low budget, a disabled setting or an ineligible pass make no repair call',async()=>{
 for(const options of [{reviews:[verdict('visible')]},{remaining:.49},{remaining:null},{enabled:false},{eligible:false},{reviews:[verdict('uncertain')]}]){
  const {result,designs}=await firstBuild(options);
  assert.equal(designs.length,1,JSON.stringify(options));assert.equal(result.repair,undefined);assert.equal(result.scene.shapes.some(s=>s.id==='Tower'),false);
 }
 assert.equal(m.autoRepairAllowed({enabled:true,eligible:true,remaining:.5,clarification:false}),true);
 assert.equal(m.autoRepairAllowed({enabled:true,eligible:true,remaining:5,clarification:true}),false);
});

test('a repair that is not objectively better, or that fails, keeps the reviewed first build',async()=>{
 // The re-review still misses the tower: nothing was fixed.
 let r=await firstBuild({repaired:withTower,reviews:[verdict('missing'),verdict('missing')]});
 assert.equal(r.result.repair.kept,false);assert.equal(r.result.scene.shapes.some(s=>s.id==='Tower'),false);assert.equal(r.result.review.features[0].status,'missing');
 // The tower appears, but the repair left a floating block behind: a local check regressed.
 const floating={...withTower,shapes:[...withTower.shapes,box('Loose',2,30,2,4,3,4)]};
 r=await firstBuild({repaired:floating});
 assert.equal(r.result.repair.kept,false);assert.equal(r.result.scene.shapes.some(s=>s.id==="Loose"),false);
 // The provider fails during the repair: the first build and its review stay.
 r=await firstBuild({failRepair:true});
 assert.equal(r.result.repair.kept,false);assert.ok(r.result.repair.error);assert.equal(r.result.review.features[0].status,'missing');assert.equal(r.designs.length,2);
});

test('only material, objective failures trigger a repair',()=>{
 const review=verdict('visible'),grounded=pack(station);
 assert.deepEqual(m.materialFailures(metrics(grounded,review)),[]);
 // One loose piece is not material; a floating component of eight or more pieces is.
 const ok=metrics(grounded,review);
 assert.deepEqual(m.materialFailures({...ok,pieces:100,ungrounded:1,loose:[{component:'Lamp',pieces:1}]}),[]);assert.deepEqual(m.materialFailures({...ok,pieces:200,ungrounded:4,loose:[{component:'Lamp',pieces:4}]}),[]);
 assert.equal(m.materialFailures({...ok,pieces:100,ungrounded:3,loose:[{component:'Lamp',pieces:3}]}).length,1);
 const canopy=pack({...station,shapes:[...station.shapes,box('Canopy',0,24,0,24,3,16)]}),loose=m.materialFailures(metrics(canopy,review));
 assert.equal(loose.length,1);assert.match(loose[0],/float with no stud path to the ground \(Canopy \d+\)/);
 // A second grounded assembly of eight or more pieces is material.
 const shed=pack({...station,dimensions:{x:40,y:40,z:16},shapes:[...station.shapes,box('Shed',30,0,0,8,9,8)]}),separate=metrics(shed,review);
 assert.ok(separate.separate>=8,String(separate.separate));assert.ok(m.materialFailures(separate).some(f=>/separate assembly/.test(f)));
 // Uncertain features and subjective improvements never trigger it; a critical mismatch and missing research details do.
 assert.deepEqual(m.materialFailures(metrics(grounded,verdict('uncertain'))),[]);
 assert.match(m.materialFailures(metrics(grounded,{...review,criticalMismatch:true,summary:'This reads as a warehouse.'}))[0],/critical mismatch: This reads as a warehouse/);
 const research={...review,rubric:[{feature:'Arched windows',kind:'distinctive',status:'missing',evidence:''},{feature:'Flat roof',kind:'silhouette',status:'missing',evidence:''},{feature:'Gold clock',kind:'signature',status:'missing',evidence:''}]};
 assert.deepEqual(m.materialFailures(metrics(grounded,research)),['Missing Arched windows']);
 // The studio's support columns, run first, settle the floating canopy without any paid call.
 const supported=m.addSupports({...station,shapes:[...station.shapes,box('Canopy',0,24,0,24,3,16)]},{smooth:false});
 assert.ok(supported.added>0);assert.deepEqual(m.materialFailures(metrics({...supported.model},review)),[]);
});

test('the keep rule compares item by item and never accepts a regression',()=>{
 const before={pieces:100,maxPieces:600,issues:2,overlaps:0,ungrounded:10,groups:2,separate:0,unsupported:10,overloaded:0,proportion:.1,loose:[{component:'Canopy',pieces:10}],items:{'Required: Clock tower':'missing',Arches:'visible'},critical:false,criticalEvidence:''};
 assert.deepEqual(m.compareRepair(before,{...before,issues:1,ungrounded:0,groups:1,unsupported:0,loose:[]}),{keep:true,fixed:1});
 assert.deepEqual(m.compareRepair(before,{...before,items:{'Required: Clock tower':'visible',Arches:'visible'}}),{keep:true,fixed:1});
 // Uncertain is not fixed, a lost feature or a worse proportion is never kept, and neither is going over budget.
 assert.equal(m.compareRepair(before,{...before,items:{'Required: Clock tower':'uncertain',Arches:'visible'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:{'Required: Clock tower':'visible',Arches:'missing'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:{'Required: Clock tower':'visible',Arches:'visible'},proportion:.2}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:{'Required: Clock tower':'visible',Arches:'visible'},pieces:700}).keep,false);
 assert.equal(m.compareRepair({...before,critical:true},{...before,critical:false}).keep,true);
});
