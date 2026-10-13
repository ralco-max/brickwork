import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export {studioVisitor,visitorAllowanceNanos,STUDIO_VISITOR_DAILY_USD} from "./lib/ai-settings";export {compactScene} from "./lib/generated-scene";export * from "./lib/ai-budget";export * from "./lib/generation-stream";export * from "./lib/generation-provider";export {defaultBrief} from "./lib/design-project";export {researchSubject} from "./lib/design-research";export {foundationScene} from "./lib/live-arrivals";export {env as testEnv} from "cloudflare:workers";export {POST as generatePOST} from "./app/api/generate/route";export {POST as reviewPOST} from "./app/api/review/route";export {GET as budgetGET} from "./app/api/budget/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const {studioVisitor,visitorAllowanceNanos,STUDIO_VISITOR_DAILY_USD,ratedModel,designTier,BUDGET_NANOS,BUDGET_MODEL,researchSubject,worstCaseHold,stopCostNotice,longDesignRun,keyFingerprint,budgetSnapshot,reserveBudget,tokenCost,budgetedProvider,readEvents,generateScene,defaultBrief,foundationScene,testEnv,generatePOST,reviewPOST,budgetGET,compactScene}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
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
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const calls=[],events=[],usageEvents=[];
 const provider=budgetedProvider(db,key,b=>events.push(b),async(u,init)=>{calls.push([u,JSON.parse(init.body)]);return u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):Response.json({ok:true});},u=>usageEvents.push(u));
 await provider.fetch(url,payload({service_tier:'priority',text:{format:{type:'json_schema',schema:{type:'object'}}}}));
 assert.equal(calls[0][0],url+'/input_tokens');assert.equal(calls[0][1].input,'A castle');assert.equal(calls[1][1].service_tier,'default');assert.ok(events[0].held>.32);
 await provider.recordUsage({input_tokens:1000,output_tokens:2000,input_tokens_details:{cached_tokens:400}});
 assert.deepEqual(events.at(-1),{limit:10,spent:.02124,held:0,remaining:9.97876});
 await provider.recordUsage({input_tokens:1000,output_tokens:2000});assert.equal((await budgetSnapshot(db,await keyFingerprint(key))).spent,.02124);
 assert.equal(usageEvents.length,1);assert.equal(usageEvents[0].cost,.02124);assert.equal(usageEvents[0].inputTokens,1000);
 assert.equal(tokenCost(272001,1000),272001*4000+1000*15000);
 // Cache writes reported outside input_tokens are charged on top instead of failing settlement.
 assert.equal(tokenCost(1000,0,600,undefined,700),400*2000+700*2500+600*100);
 assert.equal(tokenCost(1000,0,600,undefined,300),100*2000+300*2500+600*100);
 assert.throws(()=>tokenCost(1000,0,1200));
 assert.equal(longDesignRun('sol_low'),false);assert.equal(longDesignRun('standard'),false);assert.equal(longDesignRun(undefined),false);
 for(const q of ['sol_medium','better','best'])assert.equal(longDesignRun(q),true,q);
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

test('a cancelled request settles an estimate, other network failures hold the ceiling, and an authentication rejection releases it',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const hash=await keyFingerprint(key),logs=[];t.mock.method(console,'info',m=>logs.push(JSON.parse(m)));
 const cancelled=budgetedProvider(db,key,()=>{},async u=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:100});throw new DOMException('Cancelled','AbortError');});
 await assert.rejects(cancelled.fetch(url,payload()),{name:'AbortError'});const stopped=await budgetSnapshot(db,hash);assert.equal(stopped.held,0);
 // 102 counted tokens at the cache-write bound plus the 4,000-token default-effort floor: about $0.04, not the $0.32 ceiling.
 assert.ok(Math.abs(stopped.spent-(102*2500+4000*10000)/1e9)<1e-9,String(stopped.spent));assert.deepEqual([logs[0].event,logs[0].estimated,logs[0].outputTokens],['bricks_budget_estimated',true,4000]);
 await cancelled.recordUsage({input_tokens:100,output_tokens:2});assert.equal((await budgetSnapshot(db,hash)).spent,stopped.spent);
 const unknown=budgetedProvider(db,key,()=>{},async u=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:100});throw new TypeError('fetch failed');});
 await assert.rejects(unknown.fetch(url,payload()),TypeError);const held=(await budgetSnapshot(db,hash)).held;assert.ok(held>.32);
 await unknown.recordUsage(null);await unknown.recordUsage({input_tokens:-1,output_tokens:2});await unknown.settleAbandoned();assert.equal((await budgetSnapshot(db,hash)).held,held);
 const rejected=budgetedProvider(db,key,()=>{},async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:100}):Response.json({error:{}},{status:401}));
 assert.equal((await rejected.fetch(url,payload())).status,401);assert.equal((await budgetSnapshot(db,hash)).held,held);
 // Stopped before the paid request left: nothing was generated, so nothing is charged.
 const early=new AbortController(),before=(await budgetSnapshot(db,hash)).spent;let paid=0;
 const aborted=budgetedProvider(db,key,()=>{},async u=>{if(u.endsWith('/input_tokens')){early.abort();return Response.json({input_tokens:100});}paid++;return Response.json({});});
 await assert.rejects(aborted.fetch(url,{...payload(),signal:early.signal}),{name:'AbortError'});assert.equal(paid,0);const after=await budgetSnapshot(db,hash);assert.deepEqual([after.spent,after.held],[before,held]);
});

test('an incomplete streamed design records real usage before reporting its error',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());
 // A low-effort first build is held for 2k + 80 x 240 shapes + 6k reasoning = 27.2k output tokens, and runs out there.
 const events=[{type:'response.incomplete',response:{status:'incomplete',usage:{input_tokens:800,output_tokens:27200}}}];
 const provider=budgetedProvider(db,key,()=>{},async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:800}):new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')));
 await assert.rejects(async()=>{for await(const _ of generateScene({prompt:'castle',detail:'medium'},key,BUDGET_MODEL,signal(),provider.fetch,provider.recordUsage)){}},{code:'INCOMPLETE_RESPONSE'});
 assert.deepEqual(await budgetSnapshot(db,await keyFingerprint(key)),{limit:10,spent:.2736,held:0,remaining:9.7264});
});

test('the shared studio key never runs the pricier legacy designers; a personal key may',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete testEnv.DB;delete testEnv.OPENAI_API_KEY;});testEnv.DB=db;testEnv.OPENAI_API_KEY='fixture-server-key';
 const scene=foundationScene(defaultBrief('A castle')),models=[];
 t.mock.method(globalThis,'fetch',async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1000});models.push(JSON.parse(init.body).model);
  return new Response([{type:'response.output_text.delta',delta:JSON.stringify(compactScene(scene))},{type:'response.completed',response:{status:'completed',usage:{input_tokens:1000,output_tokens:1000}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));});
 const post=(quality,headers={origin:'https://brickwork.test'})=>generatePOST(new Request('https://brickwork.test/api/generate',{method:'POST',headers,body:JSON.stringify({prompt:'A castle',detail:'medium',brief:{...defaultBrief('A castle'),quality}})}));
 for(const quality of ['best','better','standard'])await collect(await post(quality));
 await collect(await post('sol_low'));
 assert.deepEqual(models,['gpt-6.1-sol','gpt-6.1-sol','gpt-6.1-sol','gpt-6.1-sol']);
 await collect(await post('best',{'x-brickwork-api-key':key}));assert.equal(models.at(-1),'gpt-6-astra');
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
 assert.equal((await response.json()).budget.spent,.024);   // Sol 6.1 Low design and review.
 assert.equal((await budgetSnapshot(db,await keyFingerprint('fixture-server-key'))).spent,0);
});

test('a web search lookup reserves per-call fees and content tokens, settles on the calls that ran, and other tools stay refused',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const events=[];
 const provider=budgetedProvider(db,key,b=>events.push(b),async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:500}):Response.json({ok:true}));
 await provider.fetch(url,payload({max_output_tokens:2500,tools:[{type:'web_search'}],max_tool_calls:2}));
 assert.ok(events[0].held>.1&&events[0].held<.2,String(events[0].held));
 await provider.recordUsage({input_tokens:9000,output_tokens:800},{searchCalls:1});
 const spent=(await budgetSnapshot(db,await keyFingerprint(key))).spent;
 assert.ok(Math.abs(spent-(9000*2000+800*10000+10000000)/1e9)<1e-9,String(spent));
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

test('studio reset preserves old ledger and personal-key budget; new period is stable',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete testEnv.DB;delete testEnv.OPENAI_API_KEY;delete testEnv.STUDIO_BUDGET_PERIOD;delete testEnv.STUDIO_VISITOR_DAILY_USD;});
 // The whole pool, as the owner sees it with the per-visitor allowance turned off.
 testEnv.DB=db;testEnv.OPENAI_API_KEY='studio';testEnv.STUDIO_BUDGET_PERIOD='reset-2026-10-11';testEnv.STUDIO_VISITOR_DAILY_USD='off';
 await reserveBudget(db,await keyFingerprint('studio'),9e9);await reserveBudget(db,await keyFingerprint(key),2e9);
 const snapshot=async headers=>(await (await budgetGET(new Request('https://brickwork.test/api/budget',{headers}))).json()).budget;
 assert.equal((await snapshot()).remaining,10);assert.equal((await snapshot({'x-brickwork-api-key':key})).remaining,8);
 await reserveBudget(db,await keyFingerprint('studio','reset-2026-10-11'),1e9);
 assert.equal((await snapshot()).remaining,9);assert.equal((await snapshot()).remaining,9);
 assert.equal((await budgetSnapshot(db,await keyFingerprint('studio'))).held,9);
});
test('Sol reasoning modes reach the provider and cache-write charges are included',async t=>{
 for(const quality of ['sol_low','sol_medium']){
  let payload;
  await assert.rejects(async()=>{for await(const event of generateScene({prompt:'castle',detail:'medium',brief:{...defaultBrief('castle'),quality}},key,'gpt-6.1-sol',signal(),async(u,init)=>{payload=JSON.parse(init.body);return new Response('',{status:401});})){};});
  assert.equal(payload.reasoning.effort,quality==='sol_low'?'low':'medium');
 }
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());
 const provider=budgetedProvider(db,key,()=>{},async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):Response.json({}));
 await provider.fetch(url,payload());await provider.recordUsage({input_tokens:1000,output_tokens:2000,input_tokens_details:{cached_tokens:400,cache_write_tokens:200}});
 assert.equal((await budgetSnapshot(db,await keyFingerprint(key))).spent,.02134);
});

test('budget preflight counts the exact cached input and reports cache and reasoning usage once',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const calls=[],reported=[];
 const provider=budgetedProvider(db,key,()=>{},async(u,init)=>{calls.push(JSON.parse(init.body));return u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):Response.json({ok:true});},usage=>reported.push(usage));
 await provider.fetch(url,payload({instructions:'Stable rules',input:[{role:'user',content:[{type:'input_text',text:'Make the roof darker'}]}]}));
 assert.deepEqual(calls[0].input,calls[1].input);assert.equal(calls[1].input[0].role,'developer');assert.equal(calls[1].instructions,undefined);assert.deepEqual(calls[1].prompt_cache_options,{mode:'explicit'});
 const usage={input_tokens:1000,output_tokens:300,input_tokens_details:{cached_tokens:600,cache_write_tokens:100},output_tokens_details:{reasoning_tokens:200}};
 await provider.recordUsage(usage);await provider.recordUsage(usage);
 assert.equal(reported.length,1);assert.equal(reported[0].cachedTokens,600);assert.equal(reported[0].cacheWriteTokens,100);assert.equal(reported[0].reasoningTokens,200);assert.equal(reported[0].cost,tokenCost(1000,300,600,undefined,100)/1e9);
});

test('readable usage over the reserved bounds is charged its actual cost up to 3x the hold, fails only that request, and the pool stays usable',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const hash=await keyFingerprint(key),errors=[],usages=[];t.mock.method(console,'error',m=>errors.push(m));
 const lookup=async()=>{const events=[],provider=budgetedProvider(db,key,b=>events.push(b),async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:2400}):Response.json({ok:true}),u=>usages.push(u));
  await provider.fetch(url,payload({max_output_tokens:2500,tools:[{type:'web_search'}],max_tool_calls:2,text:{format:{type:'json_schema',schema:{type:'object'}}}}));return {provider,hold:events[0].hold};};
 // The audit's case: about 38k billed input once tripped the bounds and wrote off the whole $10 pool. It is now inside them.
 let {provider,hold}=await lookup();await provider.recordUsage({input_tokens:38000,output_tokens:800},{searchCalls:2});
 let spent=(await budgetSnapshot(db,hash)).spent;assert.ok(Math.abs(spent-(38000*2000+800*10000+2*10000000)/1e9)<1e-9,String(spent));assert.ok(spent<.2);assert.equal(errors.length,0);
 // Over the bounds: the actual cost is charged and only this request fails.
 ({provider,hold}=await lookup());const actual=(150000*2000+800*10000+2*10000000)/1e9;assert.ok(actual<3*hold);
 await assert.rejects(provider.recordUsage({input_tokens:150000,output_tokens:800},{searchCalls:2}),{code:'BUDGET_ACCOUNTING'});
 let snapshot=await budgetSnapshot(db,hash);assert.ok(Math.abs(snapshot.spent-spent-actual)<1e-9,String(snapshot.spent));assert.equal(snapshot.held,0);assert.ok(Math.abs(usages.at(-1).cost-actual)<1e-9);
 let log=JSON.parse(errors.at(-1));assert.deepEqual([log.event,log.capped,log.inputTokens,log.searchCalls],['bricks_budget_overage',false,150000,2]);assert.ok(log.reservedInputTokens<150000);
 // Wildly out-of-bounds usage is capped at 3x the reservation.
 spent=snapshot.spent;({provider,hold}=await lookup());
 await assert.rejects(provider.recordUsage({input_tokens:900000,output_tokens:2500},{searchCalls:2}),{code:'BUDGET_ACCOUNTING'});
 snapshot=await budgetSnapshot(db,hash);assert.ok(Math.abs(snapshot.spent-spent-3*hold)<1e-9,String(snapshot.spent));log=JSON.parse(errors.at(-1));assert.equal(log.capped,true);assert.equal(log.chargedNanos,3*log.reservedNanos);
 assert.ok(Math.abs(snapshot.remaining-(10-snapshot.spent))<1e-9&&snapshot.remaining>8.9,String(snapshot.remaining));assert.doesNotMatch(errors.join('\n'),/fixture-personal-api-key|A castle/);
 // A second overage on the same provider cannot settle twice, and the next request reserves normally.
 await provider.recordUsage({input_tokens:900000,output_tokens:2500},{searchCalls:2});assert.equal((await budgetSnapshot(db,hash)).spent,snapshot.spent);
 ({provider}=await lookup());assert.ok((await budgetSnapshot(db,hash)).held>0);
});

test('web search reserves page content for every allowed search, matching the exported worst case',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const holds=[];
 for(const calls of [1,2,3]){const events=[];const provider=budgetedProvider(db,'search-key-'+calls,b=>events.push(b),async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:500}):Response.json({ok:true}));
  await provider.fetch(url,payload({max_output_tokens:2500,tools:[{type:'web_search'}],max_tool_calls:calls}));holds.push(events[0].hold);
  assert.equal(events[0].hold,worstCaseHold(BUDGET_MODEL,502,2500,calls));assert.ok(Math.abs(events[0].held-events[0].hold)<1e-12);}
 // Each extra search adds 25,000 page tokens at the cache-write bound and a $0.01 call fee, nothing per request size.
 for(const i of [1,2])assert.ok(Math.abs(holds[i]-holds[i-1]-(25000*2500+10000000)/1e9)<1e-12,String(holds));
 assert.ok(Math.abs(holds[0]-((502+4096+25000)*2500+2500*10000+10000000)/1e9)<1e-12,String(holds));
 // Two searches whose turns each re-read this small request still fit the margin and settle exactly.
 const events=[],provider=budgetedProvider(db,key,b=>events.push(b),async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:500}):Response.json({ok:true}));
 await provider.fetch(url,payload({max_output_tokens:2500,tools:[{type:'web_search'}],max_tool_calls:2}));
 await provider.recordUsage({input_tokens:3*502+2*25000,output_tokens:2500},{searchCalls:2});assert.equal(events.at(-1).held,0);
 assert.ok(Math.abs(events.at(-1).spent-((3*502+50000)*2000+2500*10000+2*10000000)/1e9)<1e-9);
 const design=worstCaseHold(BUDGET_MODEL,20000,32000);assert.ok(Math.abs(design-((24096*2500+32000*10000)/1e9))<1e-12);assert.equal(worstCaseHold('gpt-4o',1,1),null);
 assert.equal(stopCostNotice(design),'Stopping uses up to $0.39 of your budget for work already started.');assert.match(stopCostNotice(.37),/\$0\.37 /);assert.match(stopCostNotice(.001),/\$0\.01 /);
});

test('a web lookup stopped mid-request pays for its input, the output estimate and only the searches time allows, below both its hold and the old hold',async t=>{
 const logs=[];t.mock.method(console,'info',m=>logs.push(JSON.parse(m)));
 const run=async({counted,advance})=>{
  const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const events=[],stop=new AbortController();let sent;t.mock.timers.enable({apis:['Date'],now:1_000_000});
  // The lookup is not streamed: nothing arrives until it finishes, so the stop rejects the paid fetch itself.
  const provider=budgetedProvider(db,key,b=>events.push(b),async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:counted});sent=JSON.parse(init.body);
   return new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('The operation was aborted.','AbortError')),{once:true});t.mock.timers.tick(advance);stop.abort();});});
  await assert.rejects(researchSubject('the Washington Monument',key,BUDGET_MODEL,stop.signal,provider.fetch,provider.recordUsage),{name:'AbortError'});t.mock.timers.reset();
  const snapshot=await budgetSnapshot(db,await keyFingerprint(key)),base=counted+Buffer.byteLength(JSON.stringify(sent.text)),n=sent.max_tool_calls,hold=events[0].hold;
  assert.equal(n,2);assert.equal(sent.max_output_tokens,4000);assert.equal(snapshot.held,0);assert.equal(hold,worstCaseHold(BUDGET_MODEL,base,4000,n));
  // The base commit reserved one 30,000-token page allowance per lookup; a stop kept all of it.
  // Compare at the same output cap: research now allows 4,000 output tokens (incomplete replies were paid and discarded).
  const oldHold=((base+4096+30000)*2500+sent.max_output_tokens*10000+n*10000000)/1e9,log=logs.findLast(l=>l.event==='bricks_budget_estimated');
  assert.ok(snapshot.spent<hold&&snapshot.spent<oldHold,`${snapshot.spent} vs ${hold} and ${oldHold}`);assert.equal(log.estimated,true);assert.equal(log.reservedSearchCalls,n);
  return {spent:snapshot.spent,base,searches:log.searchCalls};
 };
 // Stopped 5 ms after sending, before any search could run: counted input plus the 2,000-token low-effort floor, no searches or fees.
 for(const counted of [1500,12000]){const {spent,base,searches}=await run({counted,advance:5});assert.equal(searches,0);assert.ok(Math.abs(spent-(base*2500+2000*10000)/1e9)<1e-9,String(spent));}
 // Four seconds in, at most one quick search turn has run: its 25,000 page tokens and fee are added.
 let {spent,base,searches}=await run({counted:5000,advance:4000});assert.equal(searches,1);assert.ok(Math.abs(spent-((base+25000)*2500+2000*10000+10000000)/1e9)<1e-9,String(spent));
 // A minute in, both searches may have run, but their pages count only up to the old 30,000-token allowance.
 ({spent,base,searches}=await run({counted:12000,advance:60000}));assert.equal(searches,2);assert.ok(Math.abs(spent-((base+30000)*2500+4000*10000+2*10000000)/1e9)<1e-9,String(spent));
});

const drain=async events=>{for await(const event of events)void event;};
const sse=frames=>new TextEncoder().encode(frames.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
// A provider stream that sends some frames, then stays open until the request is aborted (as fetch does).
const hanging=(signal,frames)=>new Response(new ReadableStream({start(c){c.enqueue(sse(frames));signal?.addEventListener('abort',()=>c.error(new DOMException('The operation was aborted.','AbortError')),{once:true});}}));

test('a design stopped mid-stream settles an estimate from streamed text, effort and elapsed time, far below its hold',async t=>{
 t.mock.method(console,'info',()=>{});
 const run=async({advance=0,text=4500,summary=4500})=>{
  const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const events=[];let sent;
  t.mock.timers.enable({apis:['Date'],now:1_000_000});
  const provider=budgetedProvider(db,key,b=>events.push(b),async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:5000});sent=JSON.parse(init.body);
   return hanging(init.signal,[{type:'response.reasoning_summary_text.delta',delta:'r'.repeat(summary)},{type:'response.output_text.delta',delta:'{"n":"'+'x'.repeat(text-6)}]);});
  const stop=new AbortController(),seen=[];let failure;
  const consume=(async()=>{try{for await(const event of generateScene({prompt:'castle',detail:'medium',brief:defaultBrief('castle')},key,BUDGET_MODEL,stop.signal,provider.fetch,provider.recordUsage)){seen.push(event.type);if(event.type==='thought'){t.mock.timers.tick(advance);stop.abort();}}}catch(e){failure=e;}})();
  await consume;await provider.settleAbandoned();t.mock.timers.reset();
  assert.equal(failure?.name,'AbortError');assert.ok(seen.includes('thought'));
  const snapshot=await budgetSnapshot(db,await keyFingerprint(key)),base=5000+Buffer.byteLength(JSON.stringify(sent.text));
  assert.equal(snapshot.held,0);
  return {spent:snapshot.spent,base,hold:events[0].hold};
 };
 // 9,000 streamed bytes is about 3,000 tokens; doubled, that beats the 2,000-token low-effort floor and ~0 s elapsed.
 let {spent,base,hold}=await run({});assert.ok(Math.abs(spent-(base*2500+6000*10000)/1e9)<1e-9,String(spent));assert.ok(spent<hold/2,`${spent} vs ${hold}`);
 // A minute in, elapsed time at 150 tokens/s (9,000) bounds the hidden reasoning that never streams.
 ({spent,base}=await run({advance:60000}));assert.ok(Math.abs(spent-(base*2500+9000*10000)/1e9)<1e-9,String(spent));
 // Almost nothing streamed and no time elapsed: the low-effort reasoning floor applies.
 ({spent,base}=await run({text:20,summary:3}));assert.ok(Math.abs(spent-(base*2500+2000*10000)/1e9)<1e-9,String(spent));
 // A stop after the whole timeout window can never charge more than the reservation.
 ({spent,base,hold}=await run({advance:400000}));assert.ok(spent<=hold&&hold-spent<.011,`${spent} vs ${hold}`);
});

test('a refused stream the caller abandons settles an estimate, while a stream that ends without usage keeps its hold',async t=>{
 t.mock.method(console,'info',()=>{});const {db,sqlite}=budgetDb();t.after(()=>sqlite.close());const hash=await keyFingerprint(key);
 const refused=budgetedProvider(db,key,()=>{},async(u,init)=>u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):hanging(init.signal,[{type:'response.refusal.delta',delta:'I can’t help with that.'}]));
 await assert.rejects(drain(generateScene({prompt:'castle',detail:'medium'},key,BUDGET_MODEL,signal(),refused.fetch,refused.recordUsage)),{code:'AI_REFUSAL'});
 let snapshot=await budgetSnapshot(db,hash);assert.equal(snapshot.held,0);assert.ok(snapshot.spent>0&&snapshot.spent<.1,String(snapshot.spent));
 const spent=snapshot.spent,dropped=budgetedProvider(db,key,()=>{},async u=>u.endsWith('/input_tokens')?Response.json({input_tokens:1000}):new Response(sse([{type:'response.output_text.delta',delta:'{"n":"Castle"'}])));
 await assert.rejects(drain(generateScene({prompt:'castle',detail:'medium'},key,BUDGET_MODEL,signal(),dropped.fetch,dropped.recordUsage)),{code:'CONNECTION_LOST'});
 await dropped.settleAbandoned();snapshot=await budgetSnapshot(db,hash);assert.equal(snapshot.spent,spent);assert.ok(snapshot.held>.28&&snapshot.held<.32,String(snapshot.held));
});

test('the studio key gives each visitor a daily allowance, so no one visitor or script can drain the shared pool',async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete testEnv.DB;delete testEnv.OPENAI_API_KEY;delete testEnv.STUDIO_BUDGET_PERIOD;});
 testEnv.DB=db;testEnv.OPENAI_API_KEY='studio-secret';testEnv.STUDIO_BUDGET_PERIOD='reset-2026-10-11';
 const scene=foundationScene(defaultBrief('A castle'));let upstream=0;
 t.mock.method(globalThis,'fetch',async(u,init)=>{if(u.endsWith('/input_tokens'))return Response.json({input_tokens:1000});upstream++;const max=JSON.parse(init.body).max_output_tokens;
  return new Response([{type:'response.output_text.delta',delta:JSON.stringify(compactScene(scene))},{type:'response.completed',response:{status:'completed',usage:{input_tokens:1000,output_tokens:max}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));});
 const post=(ip,headers={origin:'https://brickwork.test'})=>generatePOST(new Request('https://brickwork.test/api/generate',{method:'POST',headers:{'cf-connecting-ip':ip,...headers},body:JSON.stringify({prompt:'A castle',detail:'large',brief:{...defaultBrief('A castle'),quality:'sol_medium'}})}));
 // A script with neither an Origin nor Sec-Fetch-Site: same-origin is refused before anything is reserved; a personal key is its holder's business.
 for(const headers of [{},{'sec-fetch-site':'cross-site'},{origin:'https://evil.test'}])assert.equal((await post('203.0.113.7',headers)).status,403);
 assert.equal(upstream,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_spend').get().n,0);
 assert.equal((await post('203.0.113.7',{'sec-fetch-site':'same-origin'})).status,200,'a same-origin fetch passes without an Origin');
 // One visitor spends at most their allowance, however many requests they send at once, from any address in their /24.
 const results=await Promise.all(Array.from({length:12},(_,i)=>post(`203.0.113.${i+1}`).then(collect)));
 const codes=results.map(events=>events.at(-1).type==='complete'?'complete':events.at(-1).code);
 assert.ok(codes.includes('BUDGET_LIMIT'),JSON.stringify(codes));assert.match(results.find(e=>e.at(-1).code==='BUDGET_LIMIT').at(-1).message,/today's \$1\.00 of studio AI/);
 const studio=await keyFingerprint('studio-secret','reset-2026-10-11'),pool=await budgetSnapshot(db,studio);
 assert.ok(pool.spent+pool.held<=STUDIO_VISITOR_DAILY_USD+1e-9,`one visitor drew ${pool.spent+pool.held}`);assert.ok(pool.remaining>=10-STUDIO_VISITOR_DAILY_USD-1e-9);
 // Another visitor still builds, and sees their own allowance, never the shared pool.
 assert.equal((await collect(await post('198.51.100.22'))).at(-1).type,'complete');
 const mine=(await (await budgetGET(new Request('https://brickwork.test/api/budget',{headers:{'cf-connecting-ip':'198.51.100.22'}}))).json()).budget;
 assert.equal(mine.allowance,true);assert.equal(mine.limit,STUDIO_VISITOR_DAILY_USD);assert.ok(mine.spent>0&&mine.remaining<STUDIO_VISITOR_DAILY_USD);
 assert.equal((await budgetSnapshot(db,await keyFingerprint(key))).limit,10,'a personal key keeps its own $10 pool');
 // Visitors are hashed networks, salted by period and day; the allowance is configurable or off.
 assert.equal(await studioVisitor(new Request('https://x.test',{headers:{'cf-connecting-ip':'2001:db8:7:1::1'}}),'p'),await studioVisitor(new Request('https://x.test',{headers:{'cf-connecting-ip':'2001:db8:7:ff::9'}}),'p'));
 assert.notEqual(await studioVisitor(new Request('https://x.test',{headers:{'cf-connecting-ip':'203.0.113.1'}}),'p'),await studioVisitor(new Request('https://x.test',{headers:{'cf-connecting-ip':'203.0.114.1'}}),'p'));
 assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT * FROM ai_spend').all()),/203\.0\.113|198\.51/);
 assert.equal(visitorAllowanceNanos(undefined),1e9);assert.equal(visitorAllowanceNanos('0.5'),5e8);assert.equal(visitorAllowanceNanos('off'),undefined);assert.equal(visitorAllowanceNanos('junk'),1e9);
});

test('a rating names the model and tier the design actually ran',()=>{
 assert.equal(ratedModel([{stage:'research',model:'gpt-6.1-sol'},{stage:'design',model:'gpt-6.1-sol'},{stage:'review',model:'gpt-6.1-sol'}],'sol_medium'),'gpt-6.1-sol:sol_medium');
 assert.equal(ratedModel([{stage:'design',model:'gpt-6.1-sol'}],'sol_low'),'gpt-6.1-sol:sol_low','Everyday and Careful stay apart');
 assert.equal(ratedModel([{stage:'design',model:'gpt-6.1-sol'}],'best'),'gpt-6.1-sol:sol_low','a legacy tier the studio key ran on Sol is not reported as Astra');
 assert.equal(ratedModel([{stage:'design',model:'gpt-6-astra'}],'best'),'gpt-6-astra:best');
 assert.equal(ratedModel([{stage:'review',model:'gpt-6.1-sol'}],'best','gpt-6.1-sol'),'gpt-6.1-sol:sol_low','a review-only pass names the last design call');
 assert.equal(designTier(undefined,'gpt-6.1-sol'),'sol_low');
});
