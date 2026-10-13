import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export * from "./lib/gallery";export * from "./lib/receipts";export {referenceSheetSchema} from "./lib/design-research";export {POST} from "./app/api/feedback/route";export {GET as summaryGET} from "./app/api/feedback/summary/route";export {env as testEnv} from "cloudflare:workers";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true},logLevel:'error'});
after(()=>vite.close());

const IP='203.0.113.7';
const post=(body,{ip=IP,headers={}}={})=>m.POST(new Request('https://bricks.test/api/feedback',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip,...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
const summary=(token,query='')=>m.summaryGET(new Request(`https://bricks.test/api/feedback/summary${query}`,{headers:token===undefined?{}:{authorization:`Bearer ${token}`}}));
function setup(t){const {db,sqlite}=budgetDb();m.testEnv.DB=db;t.after(()=>{sqlite.close();delete m.testEnv.DB;delete m.testEnv.GALLERY_ADMIN_TOKEN;});return {db,sqlite};}

test('a rating stores only the verdict, a short reason and the build’s shape; an unproven model and cost are dropped',async t=>{
 const {sqlite}=setup(t);
 const response=await post({verdict:'needs_work',reason:'  Wrong shape,\n Missing details​ ',subjectKind:'bridge',pieceCount:812,model:'gpt-6.1-sol',costUsd:0.27});
 assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true});
 const row={...sqlite.prepare('SELECT * FROM build_feedback').get()};
 assert.deepEqual(Object.keys(row).sort(),['cost_usd','created_at','creator_hash','id','model','piece_count','reason','subject_kind','verdict'],'no prompt, photo, share or IP columns');
 assert.equal(row.verdict,'needs_work');assert.equal(row.reason,'Wrong shape, Missing details');assert.equal(row.subject_kind,'bridge');assert.equal(row.piece_count,812);assert.equal(row.model,null);assert.equal(row.cost_usd,null,'without a receipt, what the client says it ran is not stored');
 assert.match(row.creator_hash,/^[0-9a-f]{32}$/);assert.ok(!JSON.stringify(row).includes(IP),'the IP is only ever hashed');
 assert.equal((await post({verdict:'good'})).status,201,'everything but the verdict is optional');
 assert.equal({...sqlite.prepare("SELECT reason,subject_kind AS kind,model FROM build_feedback WHERE verdict = 'good'").get()}.reason,null);
 assert.equal((await post({verdict:'good',subjectKind:'spaceship'})).status,201);assert.equal(sqlite.prepare('SELECT subject_kind AS k FROM build_feedback ORDER BY rowid DESC').get().k,'other','an unknown kind is kept as other');
 const long=await post({verdict:'needs_work',reason:'x '.repeat(200)});assert.equal(long.status,201);assert.ok(sqlite.prepare('SELECT MAX(length(reason)) AS n FROM build_feedback').get().n<=280,'reasons are clipped to 280 characters');
 assert.deepEqual(m.SUBJECT_KINDS.filter(k=>k!=='other'),m.referenceSheetSchema.shape.kind.options,'the kinds follow the research sheet');
});

test('ratings are validated strictly, size-capped and same-origin',async t=>{
 const {sqlite}=setup(t);
 for(const [label,body] of [['no verdict',{reason:'Wrong shape'}],['an unknown verdict',{verdict:'great'}],['a prompt field',{verdict:'good',prompt:'my house at 12 Example St'}],['a photo field',{verdict:'good',photo:'data:image/jpeg;base64,AA'}],['a fractional piece count',{verdict:'good',pieceCount:1.5}],['a negative cost',{verdict:'good',costUsd:-1}],['a model with spaces',{verdict:'good',model:'gpt 5; DROP'}],['a reason over 560 characters',{verdict:'needs_work',reason:'x'.repeat(561)}],['not JSON','{verdict:'],['an array',[{verdict:'good'}]]])
  assert.equal((await post(body)).status,400,label);
 assert.equal((await post(JSON.stringify({verdict:'good',pad:' '.repeat(9000)}))).status,400,'bodies over 8 KB are refused');
 assert.equal((await post({verdict:'good'},{headers:{origin:'https://evil.test'}})).status,403);
 assert.equal((await post({verdict:'good'},{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await post({verdict:'good'},{headers:{origin:'https://bricks.test','sec-fetch-site':'same-origin'}})).status,201);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM build_feedback').get().n,1);
});

test('ratings are rate limited per visitor, and missing storage fails clearly',async t=>{
 setup(t);
 for(let i=0;i<m.FEEDBACK_PER_HOUR;i++)assert.equal((await post({verdict:'good'})).status,201);
 const limited=await post({verdict:'good'});assert.equal(limited.status,429);assert.match((await limited.json()).error,/plenty of ratings/);
 assert.equal((await post({verdict:'good'},{ip:'198.51.100.4'})).status,201,'another visitor can still rate');
 delete m.testEnv.DB;assert.equal((await post({verdict:'good'})).status,503);
});

test('the owner’s summary needs the admin token and shows how builds are going',async t=>{
 const {db,sqlite}=setup(t);
 assert.equal((await summary()).status,401);assert.equal((await summary('anything')).status,403,'no admin token is configured');
 m.testEnv.GALLERY_ADMIN_TOKEN='gallery-admin-secret';
 assert.equal((await summary('gallery-admin-secre')).status,403);
 const now=Date.now();
 for(const [verdict,kind,model,cost,reason] of [['good','bridge','gpt-6.1-sol',.2],['good','bridge','gpt-6.1-sol',.3],['needs_work','bridge','gpt-6.1-sol',.4,'Falls apart'],['needs_work','animal','gpt-5.4',.1,'Wrong colors'],['good',undefined,undefined,undefined]])
  await m.createFeedback(db,{verdict,subjectKind:kind,reason},'creator',now-1000,model?{id:crypto.randomUUID(),model,costUsd:cost}:undefined);
 await m.createFeedback(db,{verdict:'needs_work',reason:'Ancient history'},'creator',now-40*86_400_000);
 sqlite.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at) VALUES ('Hidden0001','Reported build','',1,'{}','x','c',0)").run();
 sqlite.prepare("INSERT INTO gallery (share_id,name,piece_count,content_hash,publisher_hash,published_at,reports,hidden) VALUES ('Hidden0001','Reported build',1,'h','p',1,3,1)").run();
 // An admin removal: unlisted, hidden and blocked by content.
 sqlite.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at) VALUES ('Removed001','Removed build','',1,'{}','x','c',0)").run();
 sqlite.prepare("INSERT INTO gallery (share_id,name,piece_count,content_hash,publisher_hash,published_at,reports,hidden,listed) VALUES ('Removed001','Removed build',1,'r','p',2,0,1,0)").run();
 sqlite.prepare("INSERT INTO gallery_blocks (content_hash,share_id,kind,created_at) VALUES ('r','Removed001','removed',2)").run();
 const response=await summary('gallery-admin-secret');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();
 assert.equal(body.total,5,'the last 30 days by default');assert.deepEqual(body.verdicts,{good:3,needsWork:2});
 assert.deepEqual(body.byKind[0],{kind:'bridge',good:2,needsWork:1});assert.deepEqual(body.byKind.find(k=>k.kind==='unknown'),{kind:'unknown',good:1,needsWork:0});
 assert.deepEqual(body.byModel[0],{model:'gpt-6.1-sol',good:2,needsWork:1,avgCostUsd:.3});
 assert.deepEqual(body.recentReasons.map(r=>r.reason).sort(),['Falls apart','Wrong colors']);
 assert.deepEqual(body.gallery,{published:1,hidden:2,hiddenItems:[{id:'Removed001',name:'Removed build',reports:0,listed:false,removed:true},{id:'Hidden0001',name:'Reported build',reports:3,listed:true,removed:false}],nextHiddenOffset:null,reported:[]});
 assert.equal((await (await summary('gallery-admin-secret','?days=60')).json()).total,6);
 for(const days of ['0','366','1.5','x'])assert.equal((await summary('gallery-admin-secret',`?days=${days}`)).status,400);
});

test('the build rating is one tap for “looks right” and sends no prompt or photo',async()=>{
 const rating=await vite.ssrLoadModule('/app/build-rating.tsx');
 const html=renderToStaticMarkup(React.createElement(rating.default,{build:{subjectKind:'bridge',pieceCount:600}}));
 assert.match(html,/How did this build turn out\?/);assert.match(html,/Looks right/);assert.match(html,/Needs work/);assert.match(html,/aria-expanded="false"/);
 assert.doesNotMatch(html,/Wrong shape/,'reasons appear only after Needs work');
 assert.deepEqual([...rating.RATING_REASONS],['Wrong shape','Wrong colors','Missing details','Falls apart','Other']);
 assert.deepEqual(rating.feedbackBody('good',['Wrong shape'],'note',{subjectKind:'bridge',pieceCount:600,model:'gpt-6.1-sol',costUsd:.123456}),{verdict:'good',subjectKind:'bridge',pieceCount:600,model:'gpt-6.1-sol',costUsd:.1235},'a good verdict carries no reason');
 assert.deepEqual(rating.feedbackBody('needs_work',['Other','Wrong shape'],'  roof   too flat '),{verdict:'needs_work',reason:'Wrong shape, Other: roof too flat'});
 assert.deepEqual(rating.feedbackBody('needs_work',['Other'],''),{verdict:'needs_work',reason:'Other'});
 assert.deepEqual(rating.feedbackBody('needs_work',[],'',{pieceCount:-3,costUsd:Number.NaN}),{verdict:'needs_work'});
 assert.ok(rating.feedbackBody('needs_work',['Other'],'x'.repeat(400)).reason.length<=280);
 const parsed=m.feedbackSchema.safeParse(rating.feedbackBody('needs_work',[...rating.RATING_REASONS],'y'.repeat(200),{subjectKind:'animal',pieceCount:10,model:'gpt-5.4',costUsd:1}));assert.ok(parsed.success,'every body the control makes is one the server accepts');
 const calls=[];await rating.sendBuildFeedback({verdict:'good'},async(url,init)=>{calls.push({url,init});return Response.json({ok:true},{status:201});});
 assert.deepEqual(calls,[{url:'/api/feedback',init:{method:'POST',headers:{'Content-Type':'application/json'},body:'{"verdict":"good"}'}}]);
 await rating.sendBuildFeedback({verdict:'good'},async()=>Response.json({error:'slow down'},{status:429}));
 await assert.rejects(rating.sendBuildFeedback({verdict:'good'},async()=>Response.json({error:'Ratings are temporarily unavailable.'},{status:503})),/temporarily unavailable/);
});

test('with a ratings view, a rating must cite the receipts of a real run: one rating per run, model, tier and cost from the server',async t=>{
 const {db,sqlite}=setup(t);m.testEnv.GALLERY_ADMIN_TOKEN='gallery-admin-secret';
 const sign=(stage,nanos,extra={},secret='gallery-admin-secret',at)=>m.signReceipt(secret,{stage,model:'gpt-6.1-sol',nanos,...extra},at);
 const design=await sign('design',200_000_000,{tier:'sol_medium'}),review=await sign('review',40_000_000),research=await sign('research',20_000_000);
 // Made up, forged or stale: refused, and nothing is stored.
 for(const [label,body] of [['no receipts',{verdict:'needs_work',model:'gpt-6.1-sol',costUsd:99}],['a forged receipt',{verdict:'needs_work',receipts:[await sign('design',99e9,{tier:'sol_low'},'guessed-secret')]}],['a tampered receipt',{verdict:'good',receipts:[design.replace(/^./,c=>c==='e'?'f':'e')]}],['a stale receipt',{verdict:'good',receipts:[await sign('design',1e8,{tier:'sol_low'},'gallery-admin-secret',Date.now()-3*86_400_000)]}]])
  assert.equal((await post(body)).status,400,label);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM build_feedback').get().n,0);
 // Genuine: the client's model and cost are ignored; the run's are stored, Everyday and Careful apart.
 assert.equal((await post({verdict:'needs_work',model:'gpt-6.1-sol',costUsd:99,receipts:[research,design,review,review]})).status,201);
 const row=sqlite.prepare('SELECT model,cost_usd AS cost FROM build_feedback').get();assert.deepEqual({...row},{model:'gpt-6.1-sol:sol_medium',cost:.26});
 assert.equal((await post({verdict:'good',receipts:[design,review]},{ip:'198.51.100.4'})).status,201);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM build_feedback').get().n,1,'the same run is rated once, from any address');
 assert.equal((await post({verdict:'good',receipts:[await sign('design',100_000_000,{tier:'sol_low'})]})).status,201);
 const byModel=(await (await summary('gallery-admin-secret')).json()).byModel.map(r=>r.model).sort();assert.deepEqual(byModel,['gpt-6.1-sol:sol_low','gpt-6.1-sol:sol_medium']);
 // Ratings past the summary's longest window are pruned as new ones arrive.
 await m.createFeedback(db,{verdict:'good'},'old',Date.now()-(m.FEEDBACK_KEEP_DAYS+1)*86_400_000);await post({verdict:'good',receipts:[await sign('review',1e7)]});
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM build_feedback WHERE creator_hash = 'old'").get().n,0);
 // The paid routes attach receipts to each usage report, signed with the same secret.
 for(const route of ['generate','review','research'])assert.match(readFileSync(new URL(`../app/api/${route}/route.ts`,import.meta.url),'utf8'),new RegExp(`withReceipt\\(config\\.receiptKey,"${route==='generate'?'design':route}"`));
});

test('the rating sends the run’s receipts and names the model and tier the design ran, not the brief’s',async()=>{
 const rating=await vite.ssrLoadModule('/app/build-rating.tsx');
 assert.deepEqual(rating.feedbackBody('good',[],'',{model:'gpt-6.1-sol:sol_medium',receipts:['r1','','r2']}),{verdict:'good',model:'gpt-6.1-sol:sol_medium',receipts:['r1','r2']});
 assert.ok(m.feedbackSchema.safeParse(rating.feedbackBody('good',[],'',{model:'gpt-6.1-sol:sol_medium',receipts:Array(20).fill('x'.repeat(300))})).success,'a long run’s receipts still fit');
 const gen=readFileSync(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.match(gen,/model:ratedModel\(runUsage,brief\.quality,lastDesignModel\.current\)/);assert.match(gen,/receipts:runUsage\.flatMap\(u=>u\.receipt\?\[u\.receipt\]:\[\]\)/);
 assert.doesNotMatch(gen,/QUALITY_MODELS\[brief\.quality/,'never the brief’s nominal model');
});
