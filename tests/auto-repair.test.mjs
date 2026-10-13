import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';

// One bounded automatic repair: the real design and review requests (mocked provider), the real compiler and checks.
const bundle=await build({stdin:{contents:'export * from "./lib/design-workflow";export {generateScene} from "./lib/generation-provider";export {reviewDesign} from "./lib/design-review";export {compileScene,compactScene} from "./lib/generated-scene";export {designChecks,defaultBrief,sceneDiff} from "./lib/design-project";export {foundationScene} from "./lib/live-arrivals";export {addSupports} from "./lib/scene-repair";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
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
const critical=verdict('visible',{composition:{status:'mismatch',evidence:'The tower stands west of the hall; the reference puts it east.'},criticalMismatch:true,summary:'The layout is reversed.'});
const pack=scene=>({...m.compileScene(scene,{smooth:false}),generation:scene});
const metrics=(model,review)=>m.repairMetrics(m.designChecks(model,brief),review,model,brief.maxPieces);
const changed=(a,b)=>{const d=m.sceneDiff(a,b);return d.added+d.changed+d.removed>0;};

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
   worth:(before,after)=>m.repairNeedsReview(metrics(before.model,before.review),metrics(after.model,null),changed(before.scene,after.scene)),
   // The re-check renders the repaired model in the same five views, with the same evidence as the first review.
   review:async()=>m.reviewDesign(brief,[6,7,8,9,10].map(view),'key','gpt-6.1-sol',signal(),reviewFetch),
   keep:(before,after)=>m.compareRepair(metrics(before.model,before.review),metrics(after.model,after.review)),
  }});
 return {result,requests,designs:requests.filter(r=>r.kind==='design'),reviewRequests:requests.filter(r=>r.kind==='review')};
}
const imagesOf=request=>request.body.input[0].content.filter(c=>c.type==='input_image');
const modeOf=request=>JSON.parse(request.body.input[0].content[0].text).mode;

test('a missing required feature triggers exactly one repair that sees the current model and is kept when a full re-check sees it fixed',async()=>{
 const {result,designs,reviewRequests}=await firstBuild();
 assert.equal(designs.length,2,'one first design and one repair');assert.equal(reviewRequests.length,2);
 const repair=designs[1].body,content=repair.input[0].content,data=JSON.parse(content[0].text);
 assert.deepEqual(content.filter(c=>c.type==='input_image').map(c=>c.image_url),[1,2,3,4,5].map(view));
 assert.equal(content.filter(c=>c.type==='input_text'&&/^CURRENT MODEL VIEW \d \(generated, before repair\)/.test(c.text)).length,5);
 assert.ok(data.repairFeedback.includes('Missing required feature: Clock tower'),data.repairFeedback.join(' | '));
 assert.ok(!data.repairFeedback.some(f=>/ornate window trim/.test(f)),'the reviewer\'s optional idea is not sent');
 // The re-check is a full review like the first one: five views, so the two verdicts compare item by item.
 assert.equal(imagesOf(reviewRequests[1]).length,5);assert.equal(modeOf(reviewRequests[1]),'full');
 assert.deepEqual({kept:result.repair.kept,fixed:result.repair.fixed,checked:result.repair.checked},{kept:true,fixed:1,checked:true});assert.equal(result.scene.shapes.some(s=>s.id==='Tower'),true);assert.equal(result.review.features[0].status,'visible');
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
 assert.equal(r.result.repair.kept,false);assert.equal(r.result.repair.checked,true);assert.equal(r.result.scene.shapes.some(s=>s.id==='Tower'),false);assert.equal(r.result.review.features[0].status,'missing');
 // The tower appears, but the repair left a floating block behind: a local check regressed, so no re-check is paid for.
 const floating={...withTower,shapes:[...withTower.shapes,box('Loose',2,30,2,4,3,4)]};
 r=await firstBuild({repaired:floating});
 assert.equal(r.result.repair.kept,false);assert.equal(r.result.repair.checked,false);assert.equal(r.reviewRequests.length,1);assert.equal(r.result.scene.shapes.some(s=>s.id==="Loose"),false);
 // The provider fails during the repair: the first build and its review stay.
 r=await firstBuild({failRepair:true});
 assert.equal(r.result.repair.kept,false);assert.ok(r.result.repair.error);assert.equal(r.result.review.features[0].status,'missing');assert.equal(r.designs.length,2);
});

test('a critical mismatch is never cleared by an unchanged repair or by a check that could not see the reference',async()=>{
 // The repair returns the same scene: nothing to re-check, nothing kept, and the paid mismatch stays on the build.
 const same=await firstBuild({repaired:station,reviews:[critical,verdict('visible')]});
 assert.equal(same.designs.length,2);assert.equal(same.reviewRequests.length,1,'no re-review of an unchanged scene');
 assert.deepEqual({kept:same.result.repair.kept,fixed:same.result.repair.fixed,checked:same.result.repair.checked},{kept:false,fixed:0,checked:false});
 assert.equal(same.result.review.criticalMismatch,true);assert.equal(same.result.review.composition.status,'mismatch');assert.equal(same.result.review.recognizable,false);
 // A changed scene is re-checked in full, with the same evidence; only then may the cleared verdict count.
 const moved={...station,shapes:[...station.shapes,box('Wing',14,2,2,8,6,6)]};
 const fixed=await firstBuild({repaired:moved,reviews:[critical,verdict('visible',{composition:{status:'matches',evidence:'The tower now stands east.'}})]});
 assert.equal(modeOf(fixed.reviewRequests[1]),'full');assert.deepEqual({kept:fixed.result.repair.kept,fixed:fixed.result.repair.fixed},{kept:true,fixed:1});
 // A targeted check (three views, no reference) that reports no mismatch clears nothing, raw or merged.
 const model=pack(station),before=metrics(model,critical),clean=verdict('visible',{scope:'targeted'});
 assert.equal(before.full,true);assert.equal(metrics(model,clean).full,false);
 assert.deepEqual(m.compareRepair(before,metrics(model,clean)),{keep:false,fixed:0});
 const merged=m.mergeTargetedReview(critical,clean);
 assert.equal(merged.criticalMismatch,true);assert.equal(merged.composition.status,'mismatch');assert.equal(merged.recognizable,false);
 assert.equal(m.compareRepair(before,metrics(model,merged)).keep,false);
 assert.equal(m.compareRepair(before,metrics(model,verdict('visible'))).keep,true,'a full re-check may clear it');
});

test('the keep rule compares item by item and never accepts a regression',()=>{
 const before={pieces:100,maxPieces:600,issues:2,overlaps:0,ungrounded:10,groups:2,separate:0,unsupported:10,overloaded:0,proportion:.1,loose:[{component:'Canopy',pieces:10}],items:{'Required: Clock tower':'missing',Arches:'visible'},watched:{'Swooping catenary roof line':'visible','Gold clock face':'uncertain'},critical:false,recognizable:true,full:true,criticalEvidence:''};
 const tower={...before.items,'Required: Clock tower':'visible'};
 assert.deepEqual(m.compareRepair(before,{...before,issues:1,ungrounded:0,groups:1,unsupported:0,loose:[]}),{keep:true,fixed:1});
 assert.deepEqual(m.compareRepair(before,{...before,items:tower}),{keep:true,fixed:1});
 // Uncertain is not fixed, a lost feature or a worse proportion is never kept, and neither is going over budget.
 assert.equal(m.compareRepair(before,{...before,items:{'Required: Clock tower':'uncertain',Arches:'visible'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:{'Required: Clock tower':'visible',Arches:'missing'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:tower,proportion:.2}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:tower,pieces:700}).keep,false);
 // Fixing one detail never excuses a lost silhouette, a new critical mismatch, a lost recognition or an item no longer seen.
 assert.equal(m.compareRepair(before,{...before,items:tower,watched:{...before.watched,'Swooping catenary roof line':'missing'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:tower,watched:{...before.watched,'Swooping catenary roof line':'uncertain'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:{...tower,Arches:'uncertain'}}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:tower,critical:true}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:tower,recognizable:false}).keep,false);
 assert.equal(m.compareRepair(before,{...before,items:tower,watched:{...before.watched,'Gold clock face':'visible'}}).keep,true,'an item seen for the first time is fine');
 // A cleared critical mismatch counts only when the re-check saw at least the first review's evidence.
 assert.equal(m.compareRepair({...before,critical:true},{...before,critical:false}).keep,true);
 assert.equal(m.compareRepair({...before,critical:true},{...before,critical:false,full:false}).keep,false);
 assert.equal(m.compareRepair({...before,critical:true,full:false},{...before,critical:false,full:false}).keep,true);
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

test('a strip of base cut off by a packer seam is not a separate assembly and starts no paid repair',()=>{
 const smooth={...brief,features:[],finish:'smooth'},review=verdict('visible',{features:[]});let seams=0;
 for(const [w,d] of [[32,30],[32,22],[36,30],[24,22]]){
  const cottage={name:'Cottage',description:'A cottage.',dimensions:{x:w,y:12,z:d},shapes:[box('Base',0,0,0,w,2,d,'green'),box('House',2,2,2,w-4,8,d-6)]};
  const {model}=m.addSupports(cottage,{smooth:true}),checks=m.designChecks(model,smooth),a=checks.audit,met=m.repairMetrics(checks,review,model,smooth.maxPieces);
  // The packer's seam: grounded base plates outside the main assembly (what "disconnected minus ungrounded" counted).
  if(a.disconnected.length-a.ungrounded.length>=8)seams++;
  assert.equal(met.separate,0,`${w}x${d}`);assert.deepEqual(m.materialFailures(met),[],`${w}x${d}`);
 }
 assert.ok(seams>0,'the fixture reproduces the base seam');
});

test('local failures a repair leaves unfixed are rejected without a re-review; fixed ones are re-checked',async()=>{
 const canopy=box('Canopy',2,24,2,20,3,12),floating={...station,shapes:[...station.shapes,canopy]};
 // The repair adds a lamp but leaves the canopy floating: no local fix, so nothing to pay a review for.
 const still=await firstBuild({first:floating,repaired:{...floating,shapes:[...floating.shapes,box('Lamp',0,2,0,2,4,2)]},reviews:[verdict('visible')]});
 assert.equal(still.designs.length,2);assert.equal(still.reviewRequests.length,1);assert.deepEqual({kept:still.result.repair.kept,checked:still.result.repair.checked},{kept:false,checked:false});
 assert.match(still.result.repair.reasons[0],/Canopy/);
 // The repair seats the canopy on the hall: the float is fixed, and a re-check confirms nothing was lost.
 const seated=await firstBuild({first:floating,repaired:{...floating,shapes:[base,hall,{...canopy,position:{x:2,y:12,z:2}}]},reviews:[verdict('visible'),verdict('visible')]});
 assert.equal(seated.reviewRequests.length,2);assert.deepEqual({kept:seated.result.repair.kept,fixed:seated.result.repair.fixed},{kept:true,fixed:1});
});

test('a targeted check keeps the last full verdict on the layout and on items it cannot see',()=>{
 const full={...verdict('visible'),composition:{status:'mismatch',evidence:'Wings missing; the concourse sits in front.'},recognizable:false,criticalMismatch:true,rubric:[{feature:'Rear arcade',kind:'distinctive',status:'visible',evidence:'Arcade along the back.'}]};
 const targeted={...verdict('uncertain'),summary:'The roof is red now.',revision:{status:'visible',evidence:'Red roof.'},rubric:[{feature:'Rear arcade',kind:'distinctive',status:'uncertain',evidence:'Not in these views.'}],scope:'targeted'};
 const merged=m.mergeTargetedReview(full,targeted);
 assert.equal(merged.scope,'targeted');assert.equal(merged.summary,'The roof is red now.');assert.equal(merged.revision.status,'visible');
 assert.deepEqual(merged.composition,full.composition);assert.equal(merged.criticalMismatch,true);assert.equal(merged.recognizable,false);
 assert.equal(merged.features[0].status,'visible');assert.equal(merged.rubric[0].status,'visible');assert.equal(merged.rubric[0].evidence,'Arcade along the back.');
 // What the check does see wins: a feature now missing, and a mismatch these views show.
 const worse=m.mergeTargetedReview({...full,composition:{status:'matches',evidence:'Layout matches.'},recognizable:true,criticalMismatch:undefined},{...targeted,features:[{feature:'Clock tower',status:'missing',evidence:'Gone.'}],composition:{status:'mismatch',evidence:'The tower moved to the front.'}});
 assert.equal(worse.features[0].status,'missing');assert.equal(worse.composition.status,'mismatch');assert.equal(worse.recognizable,false);
 // A clean earlier review stays clean; nothing earlier means the check stands alone.
 const clean=m.mergeTargetedReview({...verdict('visible'),composition:{status:'matches',evidence:'Layout matches.'}},targeted);
 assert.equal(clean.composition.status,'matches');assert.equal(clean.recognizable,true);assert.ok(!clean.criticalMismatch);
 assert.equal(m.mergeTargetedReview(null,targeted).features[0].status,'uncertain');
 // The carried mismatch is still a flagged item for Fix flagged issues; a blank not_applicable note never is.
 assert.ok(m.flaggedReviewItems(merged).includes('Wings missing; the concourse sits in front.'));
});
