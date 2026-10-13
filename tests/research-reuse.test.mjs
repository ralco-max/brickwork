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

test('ordinary revisions reuse the research; identity evidence asks for a fresh lookup',()=>{
 for(const text of ['Make the train silver','Add more windows','Make the roof steeper',"I don't like the roof",'Make the Train longer','Change the sign to read METRO CENTER','Move the Platform closer to the Tracks','This is too tall, lower the vault.','Paint the walls dark blue.\nMake the vault taller','',' '])assert.equal(m.needsFreshResearch(text,sheet,scene),false,text);
 for(const text of ['Actually this is Union Station','It is located in Baltimore','This is the wrong building','This is Union Station','Match https://www.wmata.com/rider-guide/stations/','see wmata.com for the platform layout','Add the Smithsonian entrance','Make it look like the Union Station hall','Use the layout from Gallery Place'])assert.equal(m.needsFreshResearch(text,sheet,scene),true,text);
 // With nothing saved, a lookup is always needed.
 assert.equal(m.needsFreshResearch('Make the train silver',undefined,scene),true);
});

test('a loop of three text revisions makes no research calls; a new identity cue makes one',async()=>{
 const brief=m.defaultBrief('Metro Center station'),saved={sheet,briefKey:m.referenceKey(brief)};let lookups=0,designs=0;
 const revise=async text=>{
  // The generator's gate: reuse the saved ready sheet unless the feedback needs a fresh lookup.
  const reusable=!m.needsFreshResearch(text,saved.sheet,scene)&&saved.briefKey===m.referenceKey(brief)&&m.referenceReady(saved.sheet)?saved:undefined;
  await m.runDesignWorkflow({reference:reusable,signal:signal(),lookup:async()=>{lookups++;return saved;},design:async()=>{designs++;return scene;},compile:async()=>({pieces:[]}),review:async()=>({recognizable:true})});
 };
 for(const text of ['Make the train silver','Add more windows','Make the roof steeper'])await revise(text);
 assert.deepEqual([lookups,designs],[0,3]);
 await revise('Actually this is Union Station');assert.equal(lookups,1);
});

test('a forced lookup that comes back unready falls back to the confirmed sheet instead of stopping the pass',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete m.testEnv.DB;});m.testEnv.DB=db;
 // The research route answers with a sheet that needs a clarification, even after its second targeted pass.
 const unclear={...sheet,identity:{status:'ambiguous',location:'',question:'Which Union Station do you mean?'},contextAdequate:false,image_urls:[],openness:null,minFeature:null,minFeature_m:null,hero:'Station',layout:'Unknown'};
 let calls=0;t.mock.method(globalThis,'fetch',async u=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1200});calls++;return Response.json({status:'completed',usage:{input_tokens:1200,output_tokens:400},output:[{type:'web_search_call',action:{type:'search',query:'Union Station',sources:[{url:'https://www.wmata.com/'}]}},{content:[{type:'output_text',text:JSON.stringify(unclear)}]}]});});
 const res=await m.researchPOST(new Request('https://brickwork.test/api/research',{method:'POST',headers:{'x-brickwork-api-key':'sk-reuse-test'},body:JSON.stringify({idea:'Metro Center station',feedback:'Actually this is Union Station'})}));
 const data=await res.json();assert.equal(res.status,200);assert.equal(data.needsClarification,true);assert.equal(calls,2);
 const next=m.referenceSheetSchema.parse(data.sheet);
 assert.equal(m.lookupOutcome(next,{sheet}),'fallback');assert.equal(m.lookupOutcome(next,undefined),'ask');assert.equal(m.lookupOutcome(next,{sheet:next}),'ask');assert.equal(m.lookupOutcome(sheet,undefined),'ready');
});
