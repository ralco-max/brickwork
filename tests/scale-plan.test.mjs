import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {planTarget,targetExtents,researchSubject,referenceSheetSchema,RESEARCH_INSTRUCTIONS} from "./lib/design-research";export {defaultBrief} from "./lib/design-project";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {planTarget,targetExtents,researchSubject,referenceSheetSchema,RESEARCH_INSTRUCTIONS,defaultBrief}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const medium=defaultBrief('x'),small={...medium,size:'small',maxWidth:32,maxDepth:32,maxHeight:64,maxPieces:200};
const sheet=(subject,L,W,H,extra={})=>({searchable:true,kind:'building',subject,summary:'',length_m:L,width_m:W,height_m:H,proportions:'',colors:[],silhouette:[],distinctive:[],sources:[],...extra});
const inside=(plan)=>{const {target:t,envelope:e}=plan;assert.ok(t.x<=e.maxWidth-2&&t.z<=e.maxDepth-2&&t.y<=e.maxHeight-2,JSON.stringify(plan.target)+JSON.stringify(e));assert.ok(e.maxWidth<=80&&e.maxDepth<=80&&e.maxHeight<=160&&Math.min(e.maxWidth,e.maxDepth,e.maxHeight)>=16);};
const volume=t=>t.x*t.y*t.z;

test('a DC Metro station with 3 m railcars is too long to shrink whole: it plans a faithful section instead',()=>{
 const plan=planTarget(sheet('Metro station',180,30,18,{minFeature:'railcar width',minFeature_m:3}),medium);inside(plan);
 const c=plan.scaleConflict;assert.ok(c,'scale conflict');assert.deepEqual(c.options,['section','cutaway','partial']);assert.equal(c.feature,'railcar width');
 assert.ok(c.featureStuds<2,'shrunk whole, a railcar would be under 2 studs');assert.equal(c.needStuds,120,'the whole station needs 120 studs at 2 studs per railcar');assert.ok(c.shown>.5&&c.shown<1);
 assert.equal(plan.target.vertical,1,'a faithful section is not exaggerated');assert.ok(plan.target.z>=Math.round(30*2/3)-1,'the section keeps the 2-stud railcar scale across the station');
 const whole=planTarget(sheet('Metro station',180,30,18),medium);assert.equal(whole.scaleConflict,undefined,'without a defining feature it simply fits');assert.ok(whole.target.vertical>1,'a 10:1 station is drawn with its height exaggerated');inside(whole);
});

test('a house fits its size class unchanged',()=>{
 for(const brief of [small,medium]){
  const house=sheet('House',12,10,8),plan=planTarget(house,brief);inside(plan);
  assert.equal(plan.scaleConflict,undefined);assert.deepEqual(plan.envelope,{maxWidth:brief.maxWidth,maxDepth:brief.maxDepth,maxHeight:brief.maxHeight});
  assert.deepEqual(plan.target,targetExtents(house,brief),'a compact subject keeps the proportional fit');assert.equal(plan.target.vertical,1);
  assert.equal(planTarget(sheet('House',12,10,8,{minFeature:'door',minFeature_m:1}),brief).scaleConflict,undefined,'a 1 m door already spans 2 studs');
 }
});

test('the Golden Gate is never one stud deep: its height is exaggerated, and a declared deck width plans a section',()=>{
 const bridge=sheet('Golden Gate Bridge',2737,27,227,{kind:'bridge'}),old=targetExtents(bridge,medium),plan=planTarget(bridge,medium);inside(plan);
 assert.equal(old.z,1,'the old envelope fit made the deck one stud deep');assert.ok(plan.target.vertical>1||plan.scaleConflict);assert.ok(plan.target.z>=2);assert.ok(plan.target.x>old.x,'a long subject uses a longer footprint');
 const deck=planTarget({...bridge,minFeature:'deck width',minFeature_m:27},medium);inside(deck);assert.ok(deck.scaleConflict);assert.equal(deck.target.z,2);assert.ok(deck.scaleConflict.shown<.5);
});

test('long and tall subjects use more of their size class than the old square envelope',()=>{
 for(const brief of [small,medium])for(const long of [sheet('Dulles terminal',320,50,20),sheet('Golden Gate Bridge',2737,27,227)]){
  const old=targetExtents(long,brief),plan=planTarget(long,brief);inside(plan);
  assert.ok(volume(plan.target)>=3*volume(old),`${JSON.stringify(old)} -> ${JSON.stringify(plan.target)}`);assert.ok(plan.envelope.maxWidth*plan.envelope.maxDepth<=brief.maxWidth*brief.maxDepth,'the footprint area of the size class');
 }
 const rocket=sheet('Saturn V',10,10,110.6,{kind:'vehicle'}),tall=planTarget(rocket,medium);inside(tall);assert.ok(tall.target.x>=2*targetExtents(rocket,medium).x&&tall.target.y>medium.maxHeight,'a tall subject gains height, not footprint');
});

test('the plan strips stale scale data, skips subjects without measurements and persists through the sheet schema',()=>{
 const unknown=planTarget(sheet('Imaginary castle',null,null,null,{target:{x:4,y:4,z:4,vertical:1},plan:{walls:2,estimate:9,fits:true},scaleConflict:{feature:'x',featureStuds:1,needStuds:9,shown:.5,options:['section']}}),medium);
 assert.equal(unknown.target,undefined);assert.equal(unknown.plan,undefined);assert.equal(unknown.scaleConflict,undefined);
 const plan=planTarget(sheet('Metro station',180,30,18,{minFeature:'railcar width',minFeature_m:3}),medium),saved=referenceSheetSchema.parse(plan);
 assert.deepEqual(saved.scaleConflict,plan.scaleConflict);assert.deepEqual(saved.envelope,plan.envelope);assert.equal(saved.minFeature_m,3);
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
