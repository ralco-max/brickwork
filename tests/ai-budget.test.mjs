import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export {compactScene} from "./lib/generated-scene";export * from "./lib/ai-budget";export * from "./lib/generation-stream";export * from "./lib/generation-provider";export {defaultBrief} from "./lib/design-project";export {foundationScene} from "./lib/live-arrivals";export {env as testEnv} from "cloudflare:workers";export {POST as generatePOST} from "./app/api/generate/route";export {POST as reviewPOST} from "./app/api/review/route";export {GET as budgetGET} from "./app/api/budget/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const {BUDGET_NANOS,BUDGET_MODEL,keyFingerprint,budgetSnapshot,reserveBudget,tokenCost,budgetedProvider,readEvents,generateScene,defaultBrief,foundationScene,testEnv,generatePOST,reviewPOST,budgetGET,compactScene}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const url='https://api.openai.com/v1/responses',key='fixture-personal-api-key-123',signal=()=>new AbortController().signal;
const payload=(extra={})=>({method:'POST',signal:signal(),headers:{Authorization:`Bearer ${key}`},body:JSON.stringify({model:BUDGET_MODEL,input:'A castle',max_output_tokens:32000,...extra})});
const collect=async response=>{const result=[];for await(const event of readEvents(response.body))result.push(event);return result;};

test('atomic reservations persist across reconnects and concurrent tabs cannot exceed $10',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'brickwork-budget-')),path=join(dir,'budget.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let {db,sqlite}=budgetDb(path);const hash=await keyFingerprint(key);
 const results=await Promise.allSettled([reserveBudget(db,hash,6e9),reserveBudget(db,hash,6e9)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'BUDGET_LIMIT');
 assert.deepEqual(await budgetSnapshot(db,hash),{limit:10,spent:0,held:6,remaining:4});
 assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT * FROM ai_spend').all()),/fixture-personal-api-key/);
 assert.match(JSON.stringify(sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM ai_spend WHERE key_hash=?').all(hash)),/idx_ai_spend_key_hash/);
 sqlite.close();({db,sqlite}=budgetDb(path,false));t.after(()=>sqlite.close());
 await reserveBudget(db,await keyFingerprint(key),4e9);assert.equal((await budgetSnapshot(db,hash)).remaining,0);
 await assert.rejects(reserveBudget(db,hash,1),{code:'BUDGET_LIMIT'});
});

test('count before generation, enforce standard service, then release unused and cached-token funds exactly once',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const calls=[],events=[];
 const provider=budgetedProvider(db,key,b=>events.push(b),async(u,init)=>{calls.push([u,JSON.parse(init.body)]);return u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):Response.json({ok:true});});
 await provider.fetch(url,payload({service_tier:'priority',text:{format:{type:'json_schema',schema:{type:'object'}}}}));
 assert.equal(calls[0][0],url+'/input_tokens');assert.equal(calls[0][1].input,'A castle');assert.equal(calls[1][1].service_tier,'default');assert.ok(events[0].held>.38);
 await provider.recordUsage({input_tokens:1000,output_tokens:2000,input_tokens_details:{cached_tokens:400}});
 assert.deepEqual(events.at(-1),{limit:10,spent:.02528,held:0,remaining:9.97472});
 await provider.recordUsage({input_tokens:1000,output_tokens:2000});assert.equal((await budgetSnapshot(db,await keyFingerprint(key))).spent,.02528);
 assert.equal(tokenCost(272001,1000),272001*4000+1000*18000);
});

test('budget exhaustion, missing storage and unknown prices never start a paid request',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());await reserveBudget(db,await keyFingerprint(key),BUDGET_NANOS);
 let calls=0;const fetcher=async()=>{calls++;return Response.json({input_tokens:1});};
 await assert.rejects(budgetedProvider(db,key,()=>{},fetcher).fetch(url,payload()),{code:'BUDGET_LIMIT'});
 await assert.rejects(budgetedProvider(db,'another-key',()=>{},fetcher).fetch(url,payload({model:'unpriced-model'})),{code:'BUDGET_MODEL'});
 const broken={prepare(){throw Error('private storage detail');}};
 await assert.rejects(budgetedProvider(broken,key,()=>{},fetcher).fetch(url,payload()),{code:'BUDGET_UNAVAILABLE'});assert.equal(calls,0);
});

test('insufficient remaining funds block the request after counting and counting failures fail closed',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());await reserveBudget(db,await keyFingerprint(key),9.9e9);let paid=0;
 const fetcher=async u=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1000});paid++;return Response.json({});};
 await assert.rejects(budgetedProvider(db,key,()=>{},fetcher).fetch(url,payload()),{code:'BUDGET_LIMIT'});assert.equal(paid,0);
 await assert.rejects(budgetedProvider(db,'other-key',()=>{},async()=>Response.json({input_tokens:'bad'})).fetch(url,payload()),{code:'BUDGET_UNAVAILABLE'});
 assert.equal((await budgetSnapshot(db,await keyFingerprint('other-key'))).held,0);
});

test('uncertain failures hold the ceiling; explicit authentication rejection releases it',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const hash=await keyFingerprint(key);
 const unknown=budgetedProvider(db,key,()=>{},async u=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:100});throw new DOMException('Cancelled','AbortError');});
 await assert.rejects(unknown.fetch(url,payload()),{name:'AbortError'});const held=(await budgetSnapshot(db,hash)).held;assert.ok(held>.38);
 await unknown.recordUsage(null);await unknown.recordUsage({input_tokens:-1,output_tokens:2});assert.equal((await budgetSnapshot(db,hash)).held,held);
 const rejected=budgetedProvider(db,key,()=>{},async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:100}):Response.json({error:{}},{status:401}));
 assert.equal((await rejected.fetch(url,payload())).status,401);assert.equal((await budgetSnapshot(db,hash)).held,held);
});

test('an incomplete streamed design records real usage before reporting its error',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());
 const events=[{type:'response.incomplete',response:{status:'incomplete',usage:{input_tokens:800,output_tokens:32000}}}];
 const provider=budgetedProvider(db,key,()=>{},async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:800}):new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')));
 await assert.rejects(async()=>{for await(const _ of generateScene({prompt:'castle',detail:'medium'},key,BUDGET_MODEL,signal(),provider.fetch,provider.recordUsage)){}},{code:'INCOMPLETE_RESPONSE'});
 assert.deepEqual(await budgetSnapshot(db,await keyFingerprint(key)),{limit:10,spent:.3856,held:0,remaining:9.6144});
});

test('generation, review and budget routes share the personal key ledger instead of the configured key',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete testEnv.DB;delete testEnv.OPENAI_API_KEY;});testEnv.DB=db;testEnv.OPENAI_API_KEY='fixture-server-key';
 const brief=defaultBrief('A castle'),scene=foundationScene(brief),review={summary:'Castle visible',recognizable:true,features:[],improvements:[],revision:{status:'not_requested',evidence:'No revision'}},calls=[];
 t.mock.method(globalThis,'fetch',async(u,init)=>{calls.push([u,init]);if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1000});
  const body=JSON.parse(init.body);if(!body.stream)return Response.json({status:'completed',usage:{input_tokens:1000,output_tokens:1000},output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
  return new Response([{type:'response.output_text.delta',delta:JSON.stringify(compactScene(scene))},{type:'response.completed',response:{status:'completed',usage:{input_tokens:1000,output_tokens:1000}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
 });
 const req=(route,body)=>new Request('https://brickwork.test/api/'+route,{method:'POST',headers:{'x-brickwork-api-key':key},body:JSON.stringify(body)});
 const generated=await collect(await generatePOST(req('generate',{prompt:brief.idea,detail:'medium',brief})));assert.equal(generated.at(-1).type,'complete');assert.equal(generated.filter(e=>e.type==='budget').length,2);
 const reviewed=await collect(await reviewPOST(req('review',{brief,images:Array(3).fill('data:image/jpeg;base64,YQ==')})));assert.deepEqual(reviewed.at(-1),{type:'complete',review});
 assert.equal(calls.length,4);assert.ok(calls.every(([,init])=>new Headers(init.headers).get('Authorization')===`Bearer ${key}`));
 const response=await budgetGET(new Request('https://brickwork.test/api/budget',{headers:{'x-brickwork-api-key':key}}));assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal((await response.json()).budget.spent,.028);assert.equal((await budgetSnapshot(db,await keyFingerprint('fixture-server-key'))).spent,0);
});

test('a web search lookup reserves per-call fees and content tokens, settles on the calls that ran, and other tools stay refused',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const events=[];
 const provider=budgetedProvider(db,key,b=>events.push(b),async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:500}):Response.json({ok:true}));
 await provider.fetch(url,payload({max_output_tokens:2500,tools:[{type:'web_search'}],max_tool_calls:2}));
 assert.ok(events[0].held>.1&&events[0].held<.2,String(events[0].held));
 await provider.recordUsage({input_tokens:9000,output_tokens:800},{searchCalls:1});
 const spent=(await budgetSnapshot(db,await keyFingerprint(key))).spent;
 assert.ok(Math.abs(spent-(9000*2000+800*12000+10000000)/1e9)<1e-9,String(spent));
 const other=budgetedProvider(db,key,()=>{},async()=>Response.json({ok:true}));
 await assert.rejects(other.fetch(url,payload({tools:[{type:'function',name:'x'}]})),{code:'BUDGET_MODEL'});
});

test('the best-quality model is priced at its own rates and unknown models are refused',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const events=[];
 const provider=budgetedProvider(db,key,b=>events.push(b),async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):Response.json({ok:true}));
 await provider.fetch(url,payload({model:'gpt-6-astra',max_output_tokens:2000}));
 assert.ok(events[0].held>.15&&events[0].held<.2,String(events[0].held));    // 2,000 output at $50/M is $0.10, plus about 5,100 input at $10/M
 await provider.recordUsage({input_tokens:1000,output_tokens:1000});
 assert.ok(Math.abs((await budgetSnapshot(db,await keyFingerprint(key))).spent-(1000*10000+1000*50000)/1e9)<1e-9);
 const other=budgetedProvider(db,key,()=>{},async()=>Response.json({ok:true}));
 await assert.rejects(other.fetch(url,payload({model:'gpt-4o'})),{code:'BUDGET_MODEL'});
});
