import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export * from "./lib/gallery";export {referenceSheetSchema} from "./lib/design-research";export {POST} from "./app/api/feedback/route";export {GET as summaryGET} from "./app/api/feedback/summary/route";export {env as testEnv} from "cloudflare:workers";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true},logLevel:'error'});
after(()=>vite.close());

const IP='203.0.113.7';
const post=(body,{ip=IP,headers={}}={})=>m.POST(new Request('https://bricks.test/api/feedback',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip,...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
const summary=(token,query='')=>m.summaryGET(new Request(`https://bricks.test/api/feedback/summary${query}`,{headers:token===undefined?{}:{authorization:`Bearer ${token}`}}));
function setup(t){const {db,sqlite}=budgetDb();m.testEnv.DB=db;t.after(()=>{sqlite.close();delete m.testEnv.DB;delete m.testEnv.GALLERY_ADMIN_TOKEN;});return {db,sqlite};}

test('a rating stores only the verdict, a short reason and the build’s shape',async t=>{
 const {sqlite}=setup(t);
 const response=await post({verdict:'needs_work',reason:'  Wrong shape,\n Missing details​ ',subjectKind:'bridge',pieceCount:812,model:'gpt-6.1-sol',costUsd:0.27});
 assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true});
 const row={...sqlite.prepare('SELECT * FROM build_feedback').get()};
 assert.deepEqual(Object.keys(row).sort(),['cost_usd','created_at','creator_hash','id','model','piece_count','reason','subject_kind','verdict'],'no prompt, photo, share or IP columns');
 assert.equal(row.verdict,'needs_work');assert.equal(row.reason,'Wrong shape, Missing details');assert.equal(row.subject_kind,'bridge');assert.equal(row.piece_count,812);assert.equal(row.model,'gpt-6.1-sol');assert.equal(row.cost_usd,0.27);
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
 assert.equal((await post(JSON.stringify({verdict:'good',pad:' '.repeat(3000)}))).status,400,'bodies over 2 KB are refused');
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
  await m.createFeedback(db,{verdict,subjectKind:kind,model,costUsd:cost,reason},'creator',now-1000);
 await m.createFeedback(db,{verdict:'needs_work',reason:'Ancient history'},'creator',now-40*86_400_000);
 sqlite.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at) VALUES ('Hidden0001','Reported build','',1,'{}','x','c',0)").run();
 sqlite.prepare("INSERT INTO gallery (share_id,name,piece_count,content_hash,publisher_hash,published_at,reports,hidden) VALUES ('Hidden0001','Reported build',1,'h','p',1,3,1)").run();
 const response=await summary('gallery-admin-secret');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();
 assert.equal(body.total,5,'the last 30 days by default');assert.deepEqual(body.verdicts,{good:3,needsWork:2});
 assert.deepEqual(body.byKind[0],{kind:'bridge',good:2,needsWork:1});assert.deepEqual(body.byKind.find(k=>k.kind==='unknown'),{kind:'unknown',good:1,needsWork:0});
 assert.deepEqual(body.byModel[0],{model:'gpt-6.1-sol',good:2,needsWork:1,avgCostUsd:.3});
 assert.deepEqual(body.recentReasons.map(r=>r.reason).sort(),['Falls apart','Wrong colors']);
 assert.deepEqual(body.gallery,{published:1,hidden:1,hiddenItems:[{id:'Hidden0001',name:'Reported build',reports:3}]});
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
