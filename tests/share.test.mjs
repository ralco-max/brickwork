import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export * from "./lib/share";export {generateRecipe} from "./lib/models";export {compileScene} from "./lib/generated-scene";export {projectJSON,emptyShopping,defaultBrief,emptyManual,referenceKey} from "./lib/design-project";export {wrapTitle} from "./lib/share-image";export {POST} from "./app/api/share/route";export {GET as projectGET} from "./app/api/share/[id]/route";export {GET as imageGET} from "./app/api/share/[id]/image/route";export {env as testEnv} from "cloudflare:workers";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const image='data:image/jpeg;base64,'+Buffer.from('fixture-jpeg').toString('base64');
const photo='data:image/jpeg;base64,YQ==';
function project(){
 const box=(id,position,size,color)=>({id,component:id,label:id,kind:'box',operation:'add',color,position,size,end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
 const scene={name:'Harbor house',description:'A small house by the water.',dimensions:{x:12,y:12,z:10},shapes:[box('Base',{x:0,y:0,z:0},{x:12,y:2,z:10},'gray'),box('House',{x:2,y:2,z:2},{x:8,y:9,z:6},'red')]};
 const model={...m.compileScene(scene),generation:scene};
 const data=JSON.parse(m.projectJSON(model,{...m.emptyShopping(),owned:{'brick-2x4:red':3}}));
 const brief=m.defaultBrief('A small house');
 data.design={brief,reference:{photo,photos:[photo],identityHint:'My street',briefKey:m.referenceKey(brief)},reviewRegion:{image:photo,polygon:[{x:.1,y:.1},{x:.9,y:.1},{x:.5,y:.9}],components:['Roof']},manual:m.emptyManual(),locked:[],revisions:[]};
 return data;
}
function setup(t){const {db,sqlite}=budgetDb();m.testEnv.DB=db;t.after(()=>{sqlite.close();delete m.testEnv.DB;});return {db,sqlite};}
const post=(body,headers={})=>m.POST(new Request('https://bricks.test/api/share',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'203.0.113.7',...headers},body:JSON.stringify(body)}));
const params=id=>({params:Promise.resolve({id})});

test('share ids are unguessable fixed-length tokens',()=>{
 const ids=new Set(Array.from({length:500},()=>m.newShareId()));
 assert.equal(ids.size,500);for(const id of ids)assert.match(id,m.SHARE_ID);
 assert.equal(m.SHARE_ID.test('../etc/pa'),false);assert.equal(m.SHARE_ID.test('abc'),false);
});

test('shared projects keep the creation and drop photos, marked areas, hints and shopping',()=>{
 const shared=m.sanitizeSharedProject(project()),data=JSON.parse(shared.project);
 assert.equal(data.shopping,undefined);assert.equal(data.design.reviewRegion,undefined);
 assert.equal(data.design.reference.photo,undefined);assert.equal(data.design.reference.photos,undefined);assert.equal(data.design.reference.identityHint,undefined);
 assert.ok(!shared.project.includes(photo.slice(23)),'no image data may remain in the shared project');
 assert.equal(shared.pieceCount,data.pieces.length);assert.ok(shared.pieceCount>0);assert.ok(shared.name.length>0);
 assert.throws(()=>m.sanitizeSharedProject({format:'other',pieces:[]}));assert.throws(()=>m.sanitizeSharedProject({...project(),pieces:[{part:'nope'}]}));
});

test('creating, reading and previewing a share round-trips through D1',async t=>{
 setup(t);
 const response=await post({project:project(),image});assert.equal(response.status,201);
 const {id,url}=await response.json();assert.match(id,m.SHARE_ID);assert.equal(url,`https://bricks.test/s/${id}`);
 const read=await m.projectGET(new Request(`https://bricks.test/api/share/${id}`),params(id));assert.equal(read.status,200);
 assert.match(read.headers.get('cache-control'),/public/);const body=await read.json();assert.equal(body.id,id);assert.equal(body.project.format,'brickwork');assert.equal(body.project.shopping,undefined);
 const preview=await m.imageGET(new Request(`https://bricks.test/api/share/${id}/image`),params(id));
 assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/jpeg');assert.equal(Buffer.from(await preview.arrayBuffer()).toString(),'fixture-jpeg');
 assert.equal((await m.projectGET(new Request('https://bricks.test/api/share/ZZZZZZZZZZ'),params('ZZZZZZZZZZ'))).status,404);
 assert.equal((await m.imageGET(new Request('https://bricks.test/api/share/x'),params('../../x'))).status,404);
 const summary=await m.readShareSummary(m.testEnv.DB,id);assert.match(m.shareDescription(summary),/pieces\. Built with Bricks\.$/);
});

test('share creation rejects cross-site posts, bad previews and invalid projects without writing',async t=>{
 const {sqlite}=setup(t);
 assert.equal((await post({project:project(),image},{origin:'https://evil.test'})).status,403);
 assert.equal((await post({project:project(),image:'data:image/png;base64,AAAA'})).status,400);
 assert.equal((await post({project:project(),image:'data:image/jpeg;base64,'+'A'.repeat(m.MAX_SHARE_IMAGE_CHARS)})).status,400);
 assert.equal((await post({project:{format:'brickwork',pieces:[]},image})).status,400);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shares').get().n,0);
});

test('sharing is rate limited per visitor, and unavailable storage fails clearly',async t=>{
 const {sqlite}=setup(t),data=project();
 for(let i=0;i<m.SHARES_PER_HOUR;i++)assert.equal((await post({project:data,image})).status,201);
 const limited=await post({project:data,image});assert.equal(limited.status,429);assert.match((await limited.json()).error,/this hour/);
 assert.equal((await post({project:data,image},{'cf-connecting-ip':'198.51.100.2'})).status,201,'another visitor is unaffected');
 const hashes=sqlite.prepare('SELECT DISTINCT creator_hash AS h FROM shares').all().map(r=>r.h);assert.equal(hashes.length,2);assert.ok(hashes.every(h=>!h.includes('203.0.113.7')));
 delete m.testEnv.DB;assert.equal((await post({project:data,image})).status,503);
});

test('preview titles wrap to the card width and end with an ellipsis when cut',()=>{
 const measure=s=>s.length*10;
 assert.deepEqual(m.wrapTitle('Tiny tower',200,measure),['Tiny tower']);
 assert.deepEqual(m.wrapTitle('The Washington Monument at dusk',150,measure,2),['The Washington','Monument at…']);
 for(const line of m.wrapTitle('A very long name '.repeat(8),160,measure,3))assert.ok(measure(line)<=160,line);
});

test('the built /s/:id page serves Open Graph and Twitter preview tags for the creation',{skip:!existsSync(new URL('../dist/server/index.js',import.meta.url))&&'run npm run build first'},async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete globalThis.__bricksTestEnv;});
 const shared=m.sanitizeSharedProject(project()),id=await m.createShare(db,{...shared,name:'Harbor <Lighthouse> & "Pier"',image},'fixture');
 globalThis.__bricksTestEnv={DB:db};
 const hooks=registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env = globalThis.__bricksTestEnv;',shortCircuit:true};
  return nextResolve(specifier,context);
 }});
 t.after(()=>hooks.deregister());
 const workerUrl=new URL('../dist/server/index.js',import.meta.url);workerUrl.searchParams.set('test',`share-${process.pid}-${Date.now()}`);
 const {default:worker}=await import(workerUrl.href);
 const response=await worker.fetch(new Request(`https://bricks.example/s/${id}`,{headers:{accept:'text/html',host:'bricks.example'}}),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});
 assert.equal(response.status,200);const html=await response.text();
 assert.match(html,new RegExp(`<meta property="og:image" content="https://bricks\\.example/api/share/${id}/image"`));
 assert.match(html,/<meta property="og:image:width" content="1200"/);
 assert.match(html,/<meta name="twitter:card" content="summary_large_image"/);
 assert.match(html,/<meta property="og:title" content="Harbor &lt;Lighthouse&gt; &amp; &quot;Pier&quot;"/);
 assert.match(html,/<meta name="robots" content="noindex/);
});
