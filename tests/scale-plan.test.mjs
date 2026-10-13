import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {planTarget,targetExtents,researchSubject,referenceSheetSchema,RESEARCH_INSTRUCTIONS} from "./lib/design-research";export {defaultBrief} from "./lib/design-project";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {planTarget,targetExtents,researchSubject,referenceSheetSchema,RESEARCH_INSTRUCTIONS,defaultBrief}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const medium=defaultBrief('x'),small={...medium,size:'small',maxWidth:32,maxDepth:32,maxHeight:64,maxPieces:200},large={...medium,size:'large',maxWidth:80,maxDepth:80,maxHeight:160,maxPieces:4000};
const sheet=(subject,L,W,H,extra={})=>({searchable:true,kind:'building',subject,summary:'',length_m:L,width_m:W,height_m:H,proportions:'',colors:[],silhouette:[],distinctive:[],sources:[],...extra});
// Every target leaves the 2-stud rim and the 2-plate base inside the brief's own limits, which designChecks enforces.
const inside=(plan,brief)=>{const t=plan.target;assert.ok(t.x<=brief.maxWidth-2&&t.z<=brief.maxDepth-2&&t.y<=brief.maxHeight-2,`${JSON.stringify(t)} in ${brief.maxWidth} × ${brief.maxDepth} × ${brief.maxHeight}`);assert.ok(referenceSheetSchema.safeParse(plan).success,'the plan persists');};

test('a DC Metro station with 3 m railcars is too long to shrink whole: it plans a faithful section instead',()=>{
 const plan=planTarget(sheet('Metro station',180,30,18,{minFeature:'railcar width',minFeature_m:3}),medium);inside(plan,medium);
 const c=plan.scaleConflict;assert.ok(c,'scale conflict');assert.deepEqual(c.options,['section','cutaway','partial']);assert.equal(c.feature,'railcar width');assert.equal(c.fit,'section');
 assert.ok(c.featureStuds<2,'shrunk whole, a railcar would be under 2 studs');assert.equal(c.needStuds,120,'the whole station needs 120 studs at 2 studs per railcar');assert.equal(c.needPlates,30,'and its full height fits');
 assert.equal(c.shown,.38,'46 of its 120 studs of length, at full depth and height');
 assert.deepEqual(plan.target,{x:46,z:20,y:30,vertical:1},'a faithful section is not exaggerated and keeps the 2-stud railcar scale across the station');
 const whole=planTarget(sheet('Metro station',180,30,18),medium);assert.equal(whole.scaleConflict,undefined,'without a defining feature it simply fits');assert.ok(whole.target.vertical>1,'a 10:1 station is drawn with its height exaggerated');inside(whole,medium);
 for(const brief of [small,large])inside(planTarget(sheet('Metro station',180,30,18,{minFeature:'railcar width',minFeature_m:3}),brief),brief);
});

test('a house fits its size class unchanged',()=>{
 for(const brief of [small,medium,large]){
  const house=sheet('House',12,10,8),plan=planTarget(house,brief);inside(plan,brief);
  assert.equal(plan.scaleConflict,undefined);assert.deepEqual(plan.target,targetExtents(house,brief),'a compact subject keeps the proportional fit');assert.equal(plan.target.vertical,1);
  assert.equal(planTarget(sheet('House',12,10,8,{minFeature:'door',minFeature_m:1}),brief).scaleConflict,undefined,'a 1 m door already spans 2 studs');
 }
});

test('limits the user fine-tuned are kept: the plan never widens the brief or trades depth for length',()=>{
 const narrow={...medium,maxWidth:16,maxDepth:80,maxHeight:96},house=sheet('House',12,12,8),plan=planTarget(house,narrow);inside(plan,narrow);
 assert.deepEqual(plan.target,targetExtents(house,narrow),'a compact subject in a non-square brief is fitted to that brief');assert.equal(plan.target.x,14);assert.equal(plan.envelope,undefined,'no envelope for the caller to adopt');
 for(const brief of [narrow,small,medium])for(const long of [sheet('Metro station',180,30,18,{minFeature:'railcar width',minFeature_m:3}),sheet('Dulles terminal',320,50,20),sheet('Golden Gate Bridge',2737,27,227,{kind:'bridge'})]){
  const p=planTarget(long,brief);inside(p,brief);assert.ok(p.target.x<=targetExtents(long,brief).x,`${long.subject} is no longer than the plain fit in ${brief.maxWidth} studs`);
 }
});

test('the Golden Gate is never one stud deep: its height is exaggerated, and a declared deck width plans a section',()=>{
 const bridge=sheet('Golden Gate Bridge',2737,27,227,{kind:'bridge'}),old=targetExtents(bridge,medium),plan=planTarget(bridge,medium);inside(plan,medium);
 assert.equal(old.z,1,'the old envelope fit made the deck one stud deep');assert.equal(plan.target.vertical,3);assert.equal(plan.target.z,2);assert.equal(plan.target.x,old.x);assert.ok(plan.target.y>=2.5*old.y);
 const deck=planTarget({...bridge,minFeature:'deck width',minFeature_m:27},medium);inside(deck,medium);
 assert.equal(deck.scaleConflict.fit,'section');assert.equal(deck.target.z,2);assert.equal(deck.target.vertical,1);assert.ok(deck.scaleConflict.shown<.5);assert.equal(deck.target.y,deck.scaleConflict.needPlates,'the section keeps the towers whole');
});

test('long, low subjects are drawn taller rather than as a sliver',()=>{
 for(const brief of [small,medium])for(const long of [sheet('Dulles terminal',320,50,20),sheet('Golden Gate Bridge',2737,27,227)]){
  const old=targetExtents(long,brief),plan=planTarget(long,brief);inside(plan,brief);
  assert.equal(plan.target.vertical,3);assert.equal(plan.target.x,old.x);assert.ok(plan.target.z>=old.z&&plan.target.y>=2.5*old.y,`${JSON.stringify(old)} -> ${JSON.stringify(plan.target)}`);
 }
});

test('tall subjects keep their whole silhouette: a defining feature too fine for the height is reported, not cut off',()=>{
 const eiffel=sheet('Eiffel Tower',125,125,330,{kind:'monument',minFeature:'tower leg',minFeature_m:10}),tower=planTarget(eiffel,medium);inside(tower,medium);
 assert.deepEqual(tower.target,planTarget({...eiffel,minFeature:null,minFeature_m:null},medium).target,'the uniform fit, spire included');assert.equal(tower.target.y,94);
 assert.deepEqual(tower.scaleConflict,{feature:'tower leg',featureStuds:1.1,needStuds:25,needPlates:165,shown:.57,fit:'whole',options:['partial','cutaway']},'a faithful leg needs 165 plates, so a faithful partial would show the lower 57%');
 const saturn=sheet('Saturn V',10,10,110.6,{kind:'vehicle',minFeature:'engine bell',minFeature_m:1}),rocket=planTarget(saturn,medium);inside(rocket,medium);
 assert.deepEqual(rocket.target,{x:3,z:3,y:94,vertical:1});assert.equal(rocket.scaleConflict.fit,'whole');assert.equal(rocket.scaleConflict.needPlates,553);assert.equal(rocket.scaleConflict.shown,.17);assert.ok(!rocket.scaleConflict.options.includes('section'),'trimming the footprint cannot fit the height');
 const trim=planTarget(sheet('Golden Gate Bridge',2737,27,227,{kind:'bridge',minFeature:'suspender rope',minFeature_m:.01}),medium);inside(trim,medium);
 assert.equal(trim.scaleConflict.fit,'whole');assert.equal(trim.target.vertical,3);assert.equal(trim.scaleConflict.needStuds,100000,'absurd faithful sizes are capped so the sheet still saves');
});

test('the plan strips stale scale data, skips subjects without measurements and persists through the sheet schema',()=>{
 const unknown=planTarget(sheet('Imaginary castle',null,null,null,{target:{x:4,y:4,z:4,vertical:1},plan:{walls:2,estimate:9,fits:true},scaleConflict:{feature:'x',featureStuds:1,needStuds:9,needPlates:9,shown:.5,fit:'section',options:['section']}}),medium);
 assert.equal(unknown.target,undefined);assert.equal(unknown.plan,undefined);assert.equal(unknown.scaleConflict,undefined);
 const plan=planTarget(sheet('Metro station',180,30,18,{minFeature:'railcar width',minFeature_m:3}),medium),saved=referenceSheetSchema.parse(plan);
 assert.deepEqual(saved.scaleConflict,plan.scaleConflict);assert.deepEqual(saved.target,plan.target);assert.equal(saved.minFeature_m,3);
 assert.ok(referenceSheetSchema.safeParse(sheet('Legacy sheet',10,10,10)).success,'older sheets without the new fields still load');
});

test('research asks for the smallest defining feature and has room to finish',async()=>{
 assert.match(RESEARCH_INSTRUCTIONS,/minFeature_m/);
 const answer=extra=>({identity:{status:'generic',location:'',question:''},contextAdequate:true,image_urls:[],included:['Vault'],excluded:[],uncertainties:[],relations:[],searchable:false,kind:'building',subject:'Metro station',summary:'A vaulted station.',length_m:180,width_m:30,height_m:18,openness:null,proportions:'Long and low',colors:['gray'],silhouette:['Coffered vault'],distinctive:[],sources:[],hero:'Platform view',layout:'x runs along the platforms',...extra});
 let sent,raw=answer({minFeature:'railcar width',minFeature_m:3});
 const fetcher=async(_url,request)=>{sent=JSON.parse(request.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(raw)}]}]});};
 const result=await researchSubject('A DC Metro station','key','model',new AbortController().signal,fetcher);
 assert.equal(sent.max_output_tokens,4000);const schema=sent.text.format.schema;assert.ok(schema.required.includes('minFeature_m')&&schema.required.includes('minFeature'));assert.deepEqual(schema.properties.minFeature_m.type,['number','null']);
 assert.equal(result.minFeature,'railcar width');assert.equal(result.minFeature_m,3);assert.ok(planTarget(result,medium).scaleConflict);
 raw=answer({});const legacy=await researchSubject('A DC Metro station','key','model',new AbortController().signal,fetcher);assert.equal(legacy.minFeature,null);assert.equal(legacy.minFeature_m,null);
 raw=answer({minFeature:' ',minFeature_m:-2});const junk=await researchSubject('A DC Metro station','key','model',new AbortController().signal,fetcher);assert.equal(junk.minFeature,null);assert.equal(junk.minFeature_m,null);
});
