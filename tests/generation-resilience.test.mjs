import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export {env as testEnv} from "cloudflare:workers";export * from "./lib/server-events";export * from "./lib/generation-errors";export * from "./lib/generation-stream";export * from "./lib/generation-provider";export * from "./lib/generation-recovery";export * from "./lib/generated-scene";export * from "./lib/assembly";export {defaultBrief} from "./lib/design-project";export {foundationScene} from "./lib/live-arrivals";export {POST as reviewPOST} from "./app/api/review/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const {testEnv,eventResponse,GenerationError,upstreamError,readEvents,generateScene,canKeepPartial,continuationPrompt,compileScene,defaultBrief,foundationScene,LandingAssemblyClock,reviewPOST}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const request=()=>new Request('https://brickwork.test/api/generate',{headers:{'cf-ray':'fixture-ray'}});
const collect=async stream=>{const items=[];for await(const item of readEvents(stream))items.push(item);return items;};

test('quiet model requests return an immediate stream and keepalives until real results arrive',async()=>{
 let release;const gate=new Promise(r=>release=r),response=eventResponse(request(),async(_signal,send)=>{await gate;send({type:'complete',scene:{name:'Real output'}});},{timeoutMs:1000,heartbeatMs:5});
 const reader=response.body.getReader(),decoder=new TextDecoder();assert.equal(decoder.decode((await reader.read()).value),': connected\n\n');assert.equal(decoder.decode((await reader.read()).value),': keepalive\n\n');release();
 let text='';for(;;){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value);}assert.match(text,/"type":"complete"/);assert.doesNotMatch(text,/progress|percent/);
});

test('streamed service errors are actionable, retain diagnostic IDs, and do not log private inputs',async t=>{
 const logs=[];t.mock.method(console,'error',message=>logs.push(message));
 const response=eventResponse(request(),async()=>{throw new GenerationError('Your API key was rejected.','AI_AUTH',401,'request-fixture');},{timeoutMs:1000});
 assert.deepEqual(await collect(response.body),[{type:'error',message:'Your API key was rejected.',code:'AI_AUTH'}]);
 assert.deepEqual(JSON.parse(logs[0]),{event:'brickwork_request_failed',route:'/api/generate',requestId:'fixture-ray',code:'AI_AUTH',upstreamStatus:401,upstreamRequestId:'request-fixture'});
 const error=await upstreamError(Response.json({error:{code:'insufficient_quota',message:'private provider body'}},{status:429}));assert.equal(error.code,'AI_QUOTA');assert.match(error.message,/credits/);assert.doesNotMatch(error.message,/private provider body/);
});

test('timeout reports once, aborts upstream work, and cannot claim completion',async t=>{
 t.mock.method(console,'error',()=>{});let signal;
 const response=eventResponse(request(),async(s,send)=>{signal=s;await new Promise(r=>s.addEventListener('abort',r,{once:true}));send({type:'complete'});},{timeoutMs:15,heartbeatMs:5});
 const events=await collect(response.body);assert.equal(signal.aborted,true);assert.equal(events.length,1);assert.equal(events[0].code,'TIMEOUT');
});

test('consumer cancellation aborts the upstream request without a false error',async t=>{
 const logs=[];t.mock.method(console,'error',message=>logs.push(message));let signal;
 const response=eventResponse(request(),async(s)=>{signal=s;await new Promise(r=>s.addEventListener('abort',r,{once:true}));},{timeoutMs:1000,heartbeatMs:5});
 await response.body.cancel();assert.equal(signal.aborted,true);assert.deepEqual(logs,[]);
});

test('truncated generation retains usable subject geometry and can send a valid continuation',async()=>{
 const brief=defaultBrief('A tower'),foundation=foundationScene(brief),scene={...foundation,name:'Tower in progress',shapes:[...foundation.shapes,{...foundation.shapes[0],id:'tower-body',label:'Tower body',component:'Tower',position:{x:8,y:2,z:8},size:{x:8,y:18,z:8},color:'tan'}]};
 const frames=[{type:'response.output_text.delta',delta:JSON.stringify(scene)},{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}];
 const fetcher=async()=>new Response(frames.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));let header,shapes=[],failure;
 try{for await(const event of generateScene({prompt:brief.idea,detail:'medium'},'fixture-key','fixture-model',new AbortController().signal,fetcher)){if(event.type==='header')header=event.header;if(event.type==='shape')shapes.push(event.shape);}}catch(e){failure=e;}
 assert.equal(failure.code,'INCOMPLETE_RESPONSE');const snapshot={...header,shapes},model=compileScene(snapshot);assert.ok(canKeepPartial(snapshot,model));assert.equal(canKeepPartial(foundation,compileScene(foundation)),false);assert.ok(continuationPrompt('x'.repeat(2000)).length<=2000);
});

test('review route streams its real result and the parser accepts final frames without blank terminators',async t=>{
 const {db,sqlite}=budgetDb();testEnv.DB=db;t.after(()=>{sqlite.close();delete testEnv.DB;});
 const brief=defaultBrief('A tower'),review={summary:'Tower visible',recognizable:true,features:[],improvements:[],revision:{status:'not_requested',evidence:'No revision'}};
 t.mock.method(globalThis,'fetch',async url=>url.endsWith('/input_tokens')?Response.json({input_tokens:100}):Response.json({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]}));
 const response=await reviewPOST(new Request('https://brickwork.test/api/review',{method:'POST',headers:{'x-brickwork-api-key':'fixture-key'},body:JSON.stringify({brief,images:Array(3).fill('data:image/jpeg;base64,YQ==')})}));
 assert.match(response.headers.get('content-type'),/text\/event-stream/);assert.deepEqual((await collect(response.body)).filter(e=>e.type!=='budget'),[{type:'complete',review}]);assert.deepEqual(await collect(new Response(': keepalive\r\n\r\ndata: {"type":"complete"}').body),[{type:'complete'}]);
});

test('landing keeps the design assembled and breathes it: hold, explode, hold, close, looping without a blank reset',()=>{
 const c=new LandingAssemblyClock();let now=0;const advance=until=>{let value;for(;now<until;){now+=20;value=c.tick(now);}return value;};
 assert.equal(c.paused,false);assert.equal(c.tick(0),1);assert.equal(advance(2500),1);assert.equal(c.explode,0);
 advance(4000);assert.ok(Math.abs(c.explode-.225)<.01);advance(6500);assert.ok(Math.abs(c.explode-.45)<.001);advance(9000);assert.ok(Math.abs(c.explode-.225)<.01);advance(10100);assert.ok(c.explode<.01);assert.equal(advance(12000),1);assert.equal(c.opacity,1);
 c.paused=true;const stopped=c.explode;c.tick(now+999999);assert.equal(c.explode,stopped);c.paused=false;c.resume();c.tick(now+1000000);assert.equal(c.explode,stopped);c.reduced=true;assert.equal(c.tick(now+1000020),1);assert.equal(c.explode,0);c.reduced=false;c.reset();assert.equal(c.tick(now+1000040),1);assert.equal(c.explode,0);
});
