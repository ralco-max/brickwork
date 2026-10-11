import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export * from "./lib/design-research";export {POST} from "./app/api/research/route";export {env as testEnv} from "cloudflare:workers";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source='https://museum.example.org/building',photo='data:image/jpeg;base64,YQ==',extraPhoto='data:image/jpeg;base64,Yg==';
const fixture=(overrides={})=>({searchable:true,kind:'building',subject:'Museum fixture',summary:'Main hall and its courtyard.',identity:{status:'confirmed',location:'Fixture City',question:''},contextAdequate:true,length_m:null,width_m:null,height_m:null,openness:null,proportions:'A broad, low hall around a square courtyard.',colors:['tan'],silhouette:['Low roof surrounding an open central courtyard'],distinctive:['Open courtyard'],sources:[source],included:['Hall','Courtyard'],excluded:['Parking'],relations:[{from:'Courtyard',relation:'inside',to:'Hall'}],uncertainties:['Exact measurements are not published.'],image_urls:[],hero:'Courtyard',layout:'Front is +z; the courtyard sits inside the hall.',...overrides});
const signal=()=>new AbortController().signal;
const result=(sheet,sources=[source])=>Response.json({status:'completed',usage:{input_tokens:1000,output_tokens:500},output:[{type:'web_search_call',action:{type:'search',query:sheet.identity.status==='confirmed'?'museum fixture courtyard plan':'museum fixture city',sources:sources.map(url=>({url}))}},{content:[{type:'output_text',text:JSON.stringify(sheet)}]}]});
const request=(overrides={})=>new Request('https://brickwork.test/api/research',{method:'POST',headers:{'x-brickwork-api-key':'fixture-personal-api-key-123'},body:JSON.stringify({idea:'Museum fixture',...overrides})});
function setup(t,sheets,{sources=[source]}={}){
 const {db,sqlite}=budgetDb();m.testEnv.DB=db;t.after(()=>{delete m.testEnv.DB;sqlite.close();});const bodies=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(url.endsWith('/input_tokens'))return Response.json({input_tokens:1000});
  const body=JSON.parse(init.body);bodies.push(body);assert.ok(bodies.length<=sheets.length,'unexpected extra paid lookup');return result(sheets[bodies.length-1],sources);
 });
 return {bodies,sqlite};
}

test('unclear known place gets one targeted follow-up, retaining photos and charging both lookups',async t=>{
 const uncertain=fixture({identity:{status:'ambiguous',location:'',question:'Which city is the museum in?'},contextAdequate:false});
 const {bodies,sqlite}=setup(t,[uncertain,fixture()]);
 const response=await m.POST(request({reference:photo,photos:[extraPhoto],identityHint:'Fixture City',feedback:'The courtyard should be open.'}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.passes,2);assert.equal(data.needsClarification,false);assert.equal(data.question,'');assert.equal(data.usages.length,2);assert.deepEqual(data.usage,data.usages[1]);assert.equal(data.budget.spent,.034);assert.equal(data.budget.held,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_spend WHERE charged_nanos IS NOT NULL').get().n,2);
 const first=JSON.parse(bodies[0].input.find(message=>message.role==="user").content[0].text),second=JSON.parse(bodies[1].input.find(message=>message.role==="user").content[0].text);
 assert.equal(first.previousReference,undefined);assert.equal(second.previousReference.identity.status,'ambiguous');assert.equal(second.identityHint,'Fixture City');assert.equal(second.feedback,'The courtyard should be open.');
 for(const body of bodies){assert.equal(body.max_tool_calls,2);assert.deepEqual(body.input.filter(message=>message.role==="user").flatMap(message=>message.content).filter(c=>c.type==='input_image').map(c=>c.image_url),[photo,extraPhoto]);}
});

test('ambiguity after the second lookup returns a clarification instead of selecting a place',async t=>{
 const ambiguous=fixture({identity:{status:'ambiguous',location:'',question:'Do you mean the north or south museum?'},contextAdequate:false});
 const {bodies}=setup(t,[ambiguous,ambiguous]);const data=await (await m.POST(request())).json();
 assert.equal(bodies.length,2);assert.equal(data.needsClarification,true);assert.equal(data.question,'Do you mean the north or south museum?');assert.equal(m.referenceReady(data.sheet),false);
});

test('missing main layout triggers research, but unpublished measurements do not',async t=>{
 const inadequate=fixture({contextAdequate:false,identity:{status:'confirmed',location:'Fixture City',question:'Where is the courtyard relative to the hall?'}});
 const {bodies}=setup(t,[inadequate,fixture()]);const data=await (await m.POST(request())).json();assert.equal(bodies.length,2);assert.equal(data.needsClarification,false);
 const sheet=fixture();assert.equal(sheet.length_m,null);assert.equal(m.referenceReady(sheet),true);
 let calls=0;const ready=await m.researchWithContext({},async()=>{calls++;return sheet;},signal());assert.equal(calls,1);assert.equal(ready.passes,1);
});

test('generic/photo-only unnamed subjects bypass identity searches and legacy known places are rechecked',async()=>{
 let calls=0;const generic=fixture({searchable:false,identity:{status:'generic',location:'',question:''},sources:[],contextAdequate:false});
 const result=await m.researchWithContext({},async()=>{calls++;return generic;},signal());assert.equal(calls,1);assert.equal(result.needsClarification,false);
 const legacy=fixture();delete legacy.identity;delete legacy.contextAdequate;assert.equal(m.referenceReady(legacy),false);assert.equal(m.referenceReady({...legacy,searchable:false}),true);
});

test('a claimed confident identity without consulted sources remains unresolved; invented links are never retained',async t=>{
 const ungrounded=fixture({sources:['https://invented.example.org/unsupported'],image_urls:['https://invented.example.org/image.jpg']});
 setup(t,[ungrounded,ungrounded],{sources:[]});const data=await (await m.POST(request({reference:photo}))).json();
 assert.equal(data.needsClarification,true);assert.equal(data.sheet.identity.status,'unknown');assert.deepEqual(data.sheet.sources,[]);assert.deepEqual(data.sheet.images,[]);assert.equal(data.passes,2);
});

test('research rejects more than four combined photos before starting a provider call',async t=>{
 const {bodies}=setup(t,[]);const photos=['Yg==','Yw==','ZA==','ZQ=='].map(p=>'data:image/jpeg;base64,'+p);
 assert.equal((await m.POST(request({reference:photo,photos}))).status,400);assert.equal(bodies.length,0);
});

test('cancellation between lookups never starts the follow-up',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(()=>m.researchWithContext({},async()=>{calls++;controller.abort();return fixture({contextAdequate:false});},controller.signal),{name:'AbortError'});assert.equal(calls,1);
});


test('a failed real-place follow-up cannot silently downgrade the request to a generic object',async()=>{
 let calls=0;const result=await m.researchWithContext({},async()=>++calls===1?fixture({contextAdequate:false}):fixture({searchable:false,identity:{status:'generic',location:'',question:''},sources:[]}),signal());
 assert.equal(calls,2);assert.equal(result.sheet.searchable,true);assert.equal(result.sheet.identity.status,'unknown');assert.equal(result.needsClarification,true);
});
