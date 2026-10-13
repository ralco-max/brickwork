import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export {env as testEnv} from "cloudflare:workers";export * from "./lib/ai-efficiency";export {runDesignWorkflow} from "./lib/design-workflow";export {referenceReady,referenceSheetSchema} from "./lib/design-research";export {defaultBrief,referenceKey} from "./lib/design-project";export {POST as researchPOST} from "./app/api/research/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const signal=()=>new AbortController().signal;
// Authored fixture sheet, not researched data.
const sheet={searchable:true,kind:'site',subject:'Metro Center station',summary:'A DC Metro station with a coffered vault.',identity:{status:'confirmed',location:'Washington, DC',question:''},contextAdequate:true,length_m:180,width_m:30,height_m:18,proportions:'Long vault',colors:['tan'],silhouette:['Coffered vault'],distinctive:['Silver train'],sources:['https://www.wmata.com/'],included:['Vault','Platform','Train','Tracks'],excluded:['Street'],relations:[],uncertainties:[],layout:'Tracks run along x.'};
const scene={name:'Metro Center',description:'A station.',dimensions:{x:40,y:24,z:20},shapes:[{id:'vault',component:'Vault',label:'Coffered vault',kind:'box'},{id:'train',component:'Train',label:'Silver train',kind:'box'},{id:'sign',component:'Sign',label:'Station sign',kind:'text',text:'METRO'}]};
const photo=n=>`data:image/jpeg;base64,${Buffer.from(`photo-${n}`).toString('base64')}`;

test('ordinary revisions reuse the research; identity evidence asks for a fresh lookup',()=>{
 for(const text of ['Make the train silver','Add more windows','Make the roof steeper',"I don't like the roof",'Make the Train longer','Change the sign to read METRO CENTER','Move the Platform closer to the Tracks','This is too tall, lower the vault.','Paint the walls dark blue.\nMake the vault taller','',' '])assert.equal(m.needsFreshResearch(text,sheet,scene),false,text);
 // Sizes, LEGO colour names, the brand and directions are not new names for the subject.
 for(const text of ['This is 10 studs too long, shorten it','This is 2x too tall','Make the roof Navy blue','Use LEGO Dark Tan for the walls','Use Lego Reddish Brown for the doors','Paint the vault Light Bluish Gray','Make the North entrance wider','Use Pearl Gold trim on the Train'])assert.equal(m.needsFreshResearch(text,sheet,scene),false,text);
 for(const text of ['Actually this is Union Station','It is located in Baltimore','This is the wrong building','This is Union Station','Match https://www.wmata.com/rider-guide/stations/','see wmata.com for the platform layout','Add the Smithsonian entrance','Make it look like the Union Station hall','Use the layout from Gallery Place','Make it like the Golden Gate'])assert.equal(m.needsFreshResearch(text,sheet,scene),true,text);
 // With nothing saved, a lookup is always needed.
 assert.equal(m.needsFreshResearch('Make the train silver',undefined,scene),true);
});

test('a loop of four text revisions makes no research calls; a new identity cue makes one',async()=>{
 const brief=m.defaultBrief('Metro Center station'),saved={sheet,briefKey:m.referenceKey(brief)};let lookups=0,designs=0;
 const revise=async text=>{
  // The generator's gate: reuse the saved ready sheet unless the feedback needs a fresh lookup.
  const {reusable}=m.savedReference(saved,{briefKey:m.referenceKey(brief),identityHint:''},m.needsFreshResearch(text,saved.sheet,scene));
  await m.runDesignWorkflow({reference:reusable,signal:signal(),lookup:async()=>{lookups++;return saved;},design:async()=>{designs++;return scene;},compile:async()=>({pieces:[]}),review:async()=>({recognizable:true})});
 };
 for(const text of ['Make the train silver','Add more windows','Make the roof steeper','Make the roof Navy blue'])await revise(text);
 assert.deepEqual([lookups,designs],[0,4]);
 await revise('Actually this is Union Station');assert.equal(lookups,1);
});

test('only a lookup the typed feedback forced may fall back to the confirmed sheet; new photos or a new hint must be answered',()=>{
 const brief=m.defaultBrief('Metro Center station'),key=m.referenceKey(brief),saved={sheet,photo:photo(1),photos:[],identityHint:'Washington, DC',briefKey:key},now={briefKey:key,photo:photo(1),photos:[],identityHint:' Washington, DC '};
 assert.deepEqual(m.savedReference(saved,now,false),{reusable:saved});
 assert.deepEqual(m.savedReference(saved,now,true),{fallback:saved},'text alone forced the lookup: the confirmed sheet is its fallback');
 // New photos, a new hint or a new brief: looked up, and never recorded as researched behind a fallback.
 for(const changed of [{...now,photos:[photo(2)]},{...now,photo:photo(3)},{...now,identityHint:'the one in Denver'},{...now,briefKey:'other brief'}])for(const refresh of [false,true])assert.deepEqual(m.savedReference(saved,changed,refresh),{},JSON.stringify({changed,refresh}).slice(0,120));
 assert.deepEqual(m.savedReference({...saved,sheet:{...sheet,contextAdequate:false}},now,true),{},'an unready saved sheet is no fallback');
 assert.deepEqual(m.savedReference(undefined,now,false),{});
});

test('a feedback-forced lookup refines the confirmed sheet, and an unready answer falls back to it',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete m.testEnv.DB;});m.testEnv.DB=db;
 // The research route answers with a sheet that needs a clarification, even after its second targeted pass.
 const unclear={...sheet,identity:{status:'ambiguous',location:'',question:'Which Union Station do you mean?'},contextAdequate:false,image_urls:[],openness:null,minFeature:null,minFeature_m:null,hero:'Station',layout:'Unknown'};
 const bodies=[];t.mock.method(globalThis,'fetch',async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1200});bodies.push(JSON.parse(init.body));return Response.json({status:'completed',usage:{input_tokens:1200,output_tokens:400},output:[{type:'web_search_call',action:{type:'search',query:'Union Station',sources:[{url:'https://www.wmata.com/'}]}},{content:[{type:'output_text',text:JSON.stringify(unclear)}]}]});});
 // The client sends its saved sheet, planned for the brief; the plan is the client's and is not research evidence.
 const planned={...sheet,target:{x:40,y:20,z:8,vertical:1},scaleConflict:{feature:'Train',featureStuds:1.2,needStuds:120,needPlates:40,shown:.3,fit:'section',options:['section']},plan:{walls:1,estimate:400,fits:true}};
 const res=await m.researchPOST(new Request('https://brickwork.test/api/research',{method:'POST',headers:{'x-brickwork-api-key':'sk-reuse-test'},body:JSON.stringify({idea:'Metro Center station',feedback:'Actually this is Union Station',previous:planned})}));
 const data=await res.json();assert.equal(res.status,200);assert.equal(data.needsClarification,true);assert.equal(bodies.length,2);
 const userData=body=>JSON.parse(body.input.flatMap(x=>Array.isArray(x.content)?x.content:[]).find(c=>c.type==='input_text'&&c.text.startsWith('{')).text),sent=userData(bodies[0]);
 assert.equal(sent.feedback,'Actually this is Union Station');assert.equal(sent.previousReference.subject,'Metro Center station');assert.deepEqual(sent.previousReference.distinctive,['Silver train']);
 for(const field of ['target','scaleConflict','plan'])assert.equal(sent.previousReference[field],undefined,field);
 const next=m.referenceSheetSchema.parse(data.sheet);
 assert.equal(m.lookupOutcome(next,{sheet}),'fallback');assert.equal(m.lookupOutcome(next,undefined),'ask');assert.equal(m.lookupOutcome(next,{sheet:next}),'ask');assert.equal(m.lookupOutcome(sheet,undefined),'ready');
 // Without a previous sheet the lookup starts from the brief alone, as before.
 bodies.length=0;await m.researchPOST(new Request('https://brickwork.test/api/research',{method:'POST',headers:{'x-brickwork-api-key':'sk-reuse-test'},body:JSON.stringify({idea:'Metro Center station'})}));
 assert.equal(userData(bodies[0]).previousReference,undefined);
});
