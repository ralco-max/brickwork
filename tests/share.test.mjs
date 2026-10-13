import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export * from "./lib/share";export {generateRecipe,validateProject} from "./lib/models";export {compileScene} from "./lib/generated-scene";export {projectJSON,emptyShopping,defaultBrief,emptyManual,referenceKey} from "./lib/design-project";export {wrapTitle} from "./lib/share-image";export {POST} from "./app/api/share/route";export {GET as projectGET,DELETE as projectDELETE} from "./app/api/share/[id]/route";export {GET as imageGET} from "./app/api/share/[id]/image/route";export {env as testEnv} from "cloudflare:workers";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

// The smallest JPEG the validator accepts: SOI, a JFIF APP0, one quantization table, a
// baseline frame header (SOF0, or another SOFn) with the given size, then EOI.
function jpeg(width=1200,height=630,frame=0xc0){
 const app0=[0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0],dqt=[0xff,0xdb,0,67,0,...Array(64).fill(1)];
 const sof=[0xff,frame,0,17,8,height>>8,height&255,width>>8,width&255,3,1,0x22,0,2,0x11,1,3,0x11,1];
 return Buffer.from([0xff,0xd8,...app0,...dqt,...sof,0xff,0xd9]);
}
const dataUrl=bytes=>'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');
const jpegBytes=jpeg(),image=dataUrl(jpegBytes);
const photo='data:image/jpeg;base64,YQ==';
function project(name='Harbor house',hollow=false){
 const box=(id,position,size,color)=>({id,component:id,label:id,kind:'box',operation:'add',color,position,size,end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
 const scene={name,description:'A small house by the water.',dimensions:{x:12,y:12,z:10},shapes:[box('Base',{x:0,y:0,z:0},{x:12,y:2,z:10},'gray'),box('House',{x:2,y:2,z:2},{x:8,y:9,z:6},'red')]};
 const model={...m.compileScene(scene,{hollow,smooth:true}),generation:scene};
 const data=JSON.parse(m.projectJSON(model,{...m.emptyShopping(),owned:{'brick-2x4:red':3}}));
 const brief={...m.defaultBrief('A small house'),hollow};
 data.design={brief,reference:{photo,photos:[photo],identityHint:'My street',briefKey:m.referenceKey(brief)},reviewRegion:{image:photo,polygon:[{x:.1,y:.1},{x:.9,y:.1},{x:.5,y:.9}],components:['Roof']},manual:m.emptyManual(),locked:[],revisions:[]};
 return data;
}
function setup(t){const {db,sqlite}=budgetDb();m.testEnv.DB=db;t.after(()=>{sqlite.close();delete m.testEnv.DB;delete m.testEnv.GALLERY_ADMIN_TOKEN;});return {db,sqlite};}
const post=(body,headers={})=>m.POST(new Request('https://bricks.test/api/share',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'203.0.113.7',...headers},body:JSON.stringify(body)}));
const params=id=>({params:Promise.resolve({id})});
const remove=(id,token)=>m.projectDELETE(new Request(`https://bricks.test/api/share/${id}`,{method:'DELETE',headers:token===undefined?{}:{authorization:`Bearer ${token}`}}),params(id));

test('share ids are unguessable fixed-length tokens',()=>{
 const ids=new Set(Array.from({length:500},()=>m.newShareId()));
 assert.equal(ids.size,500);for(const id of ids)assert.match(id,m.SHARE_ID);
 assert.equal(m.SHARE_ID.test('../etc/pa'),false);assert.equal(m.SHARE_ID.test('abc'),false);
 const tokens=new Set(Array.from({length:200},()=>m.newOwnerToken()));
 assert.equal(tokens.size,200);for(const token of tokens)assert.match(token,/^[A-Za-z0-9_-]{43}$/);
});

test('shared projects keep the creation and drop photos, marked areas, hints and shopping',()=>{
 const shared=m.sanitizeSharedProject(project()),data=JSON.parse(shared.project);
 assert.equal(data.shopping,undefined);assert.equal(data.design.reviewRegion,undefined);
 assert.equal(data.design.reference.photo,undefined);assert.equal(data.design.reference.photos,undefined);assert.equal(data.design.reference.identityHint,undefined);
 assert.ok(!shared.project.includes(photo.slice(23)),'no image data may remain in the shared project');
 assert.equal(shared.pieceCount,data.pieces.length);assert.ok(shared.pieceCount>0);assert.ok(shared.name.length>0);
 assert.throws(()=>m.sanitizeSharedProject({format:'other',pieces:[]}));assert.throws(()=>m.sanitizeSharedProject({...project(),pieces:[{part:'nope'}]}));
});

test('shared projects never carry the words the creator typed, and still open as projects',()=>{
 // The share dialog promises this list; it must name only what the sanitizer really removes.
 const note=readFileSync('app/share-dialog.tsx','utf8').match(/<DialogDescription>([^<]*)<\/DialogDescription>/)?.[1]||'';
 assert.match(note,/Your photos, location hint, brief wording, change requests, review and shopping list are not included\./);
 const data=project(),idea='PRIVATE-IDEA Recreate my apartment at 12 Example St',feedback='PRIVATE-FEEDBACK make my daughter Emma in the window',request='PRIVATE-REQUEST add my name JOHN SMITH on the sign';
 data.design.brief={...data.design.brief,idea,size:'large',maxPieces:900,quality:'best',composition:'PRIVATE-COMPOSITION my parents house at 42 Elm St',features:['PRIVATE-FEATURE grandma Ruth in the window','Red door'],style:'PRIVATE-STYLE like the Hendersons porch',signText:'JOHN SMITH'};
 const sheet={identity:{status:'confirmed',location:'PRIVATE-LOCATION 42 Elm St, Springfield',question:'PRIVATE-QUESTION is this Ruth\'s house?'},contextAdequate:true,searchable:true,kind:'building',subject:'Harbor house',summary:'A two-story house with dormers.',length_m:null,width_m:null,height_m:null,proportions:'Boxy',colors:['red'],silhouette:['Gable roof'],distinctive:['Dormers'],sources:['https://example.com/house']};
 data.design.reference={...data.design.reference,sheet,briefKey:m.referenceKey(data.design.brief)};data.design.reviewRequest=feedback;
 data.design.revisions=Array.from({length:25},(_,i)=>({request:`${request} ${i}`,summary:`Added JOHN SMITH to the sign as requested, and Emma ${i}.`,at:`2026-10-${String(1+i%28).padStart(2,'0')}T00:00:00.000Z`}));
 data.design.review={summary:'PRIVATE-REVIEW the 42 Elm St house reads clearly.',recognizable:true,composition:{status:'matches',evidence:'PRIVATE-EVIDENCE parents house'},features:[{feature:'PRIVATE-FEATURE grandma Ruth in the window',status:'visible',evidence:'Ruth is at the window.'}],improvements:['Add a chimney.'],thinking:'PRIVATE-THINKING the user asked for JOHN SMITH',revision:{status:'visible',evidence:'PRIVATE-EVIDENCE JOHN SMITH is visible'}};
 data.design.privateNotes='PRIVATE-NOTES';data.libraryId='PRIVATE-LIBRARY';
 assert.ok(m.validateProject({...data,shopping:undefined}).design.review.features.length,'the planted brief and review are valid ones');
 const shared=m.sanitizeSharedProject(data),out=JSON.parse(shared.project);
 for(const secret of ['PRIVATE-','Example St','Elm St','Emma','Ruth','JOHN','Hendersons','My street','Red door'])assert.ok(!shared.project.includes(secret),`the shared project must not contain ${secret}`);
 const brief=out.design.brief;
 assert.equal(brief.idea,'Harbor house');assert.deepEqual(brief.features,[]);assert.equal(brief.composition,'');assert.equal(brief.style,m.defaultBrief().style);assert.equal(brief.signText,undefined);
 assert.equal(brief.size,'large');assert.equal(brief.maxPieces,900);assert.equal(brief.quality,'best');assert.equal(brief.hollow,false,'size and build settings are not words and stay; hollow and finish also rebuild the bricks');
 assert.equal(out.design.reviewRequest,undefined);assert.equal(out.design.review,undefined);assert.equal(out.design.reviewStale,undefined);assert.deepEqual(out.design.revisions,[]);
 assert.equal(out.design.privateNotes,undefined);assert.equal(out.libraryId,undefined);
 assert.equal(out.design.reference.sheet.subject,'Harbor house');assert.equal(out.design.reference.sheet.identity.status,'confirmed');assert.equal(out.design.reference.sheet.identity.location,'');
 assert.equal(out.design.reference.briefKey,m.referenceKey(brief),'the research sheet key follows the shared brief, so a remix can reuse it');
 const reopened=m.validateProject(out);assert.equal(reopened.pieces.length,shared.pieceCount);assert.equal(reopened.design.brief.idea,'Harbor house');
 const tiny=project('Ox');tiny.design.brief.idea=idea;assert.equal(JSON.parse(m.sanitizeSharedProject(tiny).project).design.brief.idea,'Shared creation','a name too short for a brief idea gets a neutral stand-in');
 const hollow=project('Harbor house',true);assert.notEqual(hollow.pieces.length,data.pieces.length,'the hollow fixture really has different bricks');
 assert.equal(JSON.parse(m.sanitizeSharedProject(hollow).project).design.brief.hollow,true,'settings that rebuild the bricks stay, or the share would not validate');
});

test('preview images must be real 1200×630 JPEGs',()=>{
 assert.deepEqual(m.jpegSize(jpeg()),{width:1200,height:630});
 assert.deepEqual(m.jpegSize(jpeg(1200,630,0xc2)),{width:1200,height:630},'progressive frames are read too');
 assert.equal(m.validShareImage(image),true);assert.equal(m.validShareImage(dataUrl(jpeg(1200,630,0xc2))),true);
 for(const [label,bad] of [['placeholder text',dataUrl(Buffer.from('placeholder'))],['the old test fixture',dataUrl(Buffer.from('fixture-jpeg'))],['a 1×1 JPEG',dataUrl(jpeg(1,1))],['a 630×1200 JPEG',dataUrl(jpeg(630,1200))],['SOI only',dataUrl(Buffer.from([0xff,0xd8,0xff,0xd9]))],['a scan before any frame',dataUrl(Buffer.from([0xff,0xd8,0xff,0xda,0,2,0xff,0xd9]))],['a truncated frame header',dataUrl(jpeg().subarray(0,jpeg().length-16))],['a PNG',dataUrl(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))]])assert.equal(m.validShareImage(bad),false,label);
 assert.equal(m.validShareImage('data:image/png;base64,'+jpegBytes.toString('base64')),false);assert.equal(m.validShareImage(42),false);
});

test('creating, reading and previewing a share round-trips through D1',async t=>{
 const {sqlite}=setup(t);
 const response=await post({project:project(),image});assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');
 const {id,url,ownerToken}=await response.json();assert.match(id,m.SHARE_ID);assert.equal(url,`https://bricks.test/s/${id}`);assert.match(ownerToken,/^[A-Za-z0-9_-]{43}$/);
 const row=sqlite.prepare('SELECT owner_hash AS ownerHash,content_hash AS contentHash,project FROM shares WHERE id = ?').get(id);
 assert.equal(row.ownerHash,createHash('sha256').update(ownerToken).digest('hex'),'only a hash of the owner token is stored');assert.ok(!JSON.stringify(row).includes(ownerToken));
 assert.equal(row.contentHash,createHash('sha256').update(row.project).digest('hex'));
 const read=await m.projectGET(new Request(`https://bricks.test/api/share/${id}`),params(id));assert.equal(read.status,200);
 assert.equal(read.headers.get('cache-control'),'public, max-age=3600');const body=await read.json();assert.equal(body.id,id);assert.equal(body.project.format,'brickwork');assert.equal(body.project.shopping,undefined);
 const preview=await m.imageGET(new Request(`https://bricks.test/api/share/${id}/image`),params(id));
 assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await preview.arrayBuffer()),jpegBytes);
 assert.equal(preview.headers.get('cache-control'),'public, max-age=3600','previews of deleted links must expire, so they are not immutable');
 assert.equal((await m.projectGET(new Request('https://bricks.test/api/share/ZZZZZZZZZZ'),params('ZZZZZZZZZZ'))).status,404);
 assert.equal((await m.imageGET(new Request('https://bricks.test/api/share/x'),params('../../x'))).status,404);
 const summary=await m.readShareSummary(m.testEnv.DB,id);assert.match(m.shareDescription(summary),/^\d[\d,]*-piece brick model · A small house by the water\.$/);
});

test('sharing the same creation again returns its existing link without a new row or token',async t=>{
 const {sqlite}=setup(t);
 const first=await (await post({project:project(),image})).json();
 const again=await post({project:{...project(),shopping:{owned:{},elementIds:{},priceOverrides:{},quotes:{}}},image});
 assert.equal(again.status,200);const repeat=await again.json();
 assert.equal(repeat.id,first.id);assert.equal(repeat.url,first.url);assert.equal(repeat.ownerToken,undefined,'the owner token is only ever returned once');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shares').get().n,1);
 const changed=await post({project:project('Harbor house at dusk'),image});assert.equal(changed.status,201);assert.notEqual((await changed.json()).id,first.id);
 const other=await post({project:project(),image},{'cf-connecting-ip':'198.51.100.2'});assert.equal(other.status,201,'another visitor sharing identical content gets their own link');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shares').get().n,3);
});

test('a share is deleted only with its owner token or the admin token, and is then gone',async t=>{
 const {sqlite}=setup(t);
 const {id,ownerToken}=await (await post({project:project(),image})).json();
 const {id:otherId,ownerToken:otherToken}=await (await post({project:project('Lighthouse'),image})).json();
 const missing=await remove(id);assert.equal(missing.status,401);assert.equal(missing.headers.get('www-authenticate'),'Bearer');
 assert.equal((await remove(id,'not-the-token')).status,403);
 assert.equal((await remove(id,otherToken)).status,403,'one link’s token cannot delete another link');
 assert.equal((await remove('ZZZZZZZZZZ',ownerToken)).status,404);assert.equal((await remove('../x',ownerToken)).status,404);
 const deleted=await remove(id,ownerToken);assert.equal(deleted.status,204);assert.equal(deleted.headers.get('cache-control'),'no-store');
 assert.equal((await m.projectGET(new Request(`https://bricks.test/api/share/${id}`),params(id))).status,404);
 assert.equal((await m.imageGET(new Request(`https://bricks.test/api/share/${id}/image`),params(id))).status,404);
 assert.equal((await remove(id,ownerToken)).status,404);
 // Links from before owner tokens have no owner hash; only the admin token removes them.
 sqlite.prepare('UPDATE shares SET owner_hash = NULL WHERE id = ?').run(otherId);
 assert.equal((await remove(otherId,otherToken)).status,403);assert.equal((await remove(otherId,'')).status,401);
 assert.equal((await remove(otherId,'gallery-admin-secret')).status,403,'no admin token is configured');
 m.testEnv.GALLERY_ADMIN_TOKEN='gallery-admin-secret';
 assert.equal((await remove(otherId,'gallery-admin-secre')).status,403);
 assert.equal((await remove(otherId,'gallery-admin-secret')).status,204);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shares').get().n,0);
});

test('share creation rejects cross-site posts, bad previews and invalid projects without writing',async t=>{
 const {sqlite}=setup(t);
 assert.equal((await post({project:project(),image},{origin:'https://evil.test'})).status,403);
 assert.equal((await post({project:project(),image:'data:image/png;base64,AAAA'})).status,400);
 assert.equal((await post({project:project(),image:'data:image/jpeg;base64,'+'A'.repeat(m.MAX_SHARE_IMAGE_CHARS)})).status,400);
 assert.equal((await post({project:project(),image:dataUrl(Buffer.from('placeholder'))})).status,400);
 const tiny=await post({project:project(),image:dataUrl(jpeg(1,1))});assert.equal(tiny.status,400);assert.match((await tiny.json()).error,/invalid/);
 assert.equal((await post({project:{format:'brickwork',pieces:[]},image})).status,400);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shares').get().n,0);
});

test('sharing is rate limited per visitor, and unavailable storage fails clearly',async t=>{
 const {sqlite}=setup(t);
 for(let i=0;i<m.SHARES_PER_HOUR;i++)assert.equal((await post({project:project(`Harbor house ${i}`),image})).status,201);
 const limited=await post({project:project('One too many'),image});assert.equal(limited.status,429);assert.match((await limited.json()).error,/this hour/);
 assert.equal((await post({project:project('Harbor house 3'),image})).status,200,'re-sharing an existing link is not a new share');
 assert.equal((await post({project:project('One too many'),image},{'cf-connecting-ip':'198.51.100.2'})).status,201,'another visitor is unaffected');
 const hashes=sqlite.prepare('SELECT DISTINCT creator_hash AS h FROM shares').all().map(r=>r.h);assert.equal(hashes.length,2);assert.ok(hashes.every(h=>!h.includes('203.0.113.7')));
 delete m.testEnv.DB;assert.equal((await post({project:project(),image})).status,503);
 assert.equal((await remove('ZZZZZZZZZZ','token')).status,503);
});

test('preview titles wrap to the card width and end with an ellipsis when cut',()=>{
 const measure=s=>s.length*10;
 assert.deepEqual(m.wrapTitle('Tiny tower',200,measure),['Tiny tower']);
 assert.deepEqual(m.wrapTitle('The Washington Monument at dusk',150,measure,2),['The Washington','Monument at…']);
 for(const line of m.wrapTitle('A very long name '.repeat(8),160,measure,3))assert.ok(measure(line)<=160,line);
});

test('the built /s/:id page serves preview tags and the shared name, and missing shares are 404s',{skip:!existsSync(new URL('../dist/server/index.js',import.meta.url))&&'run npm run build first'},async t=>{
 const {db,sqlite}=budgetDb();t.after(()=>{sqlite.close();delete globalThis.__bricksTestEnv;});
 const shared=m.sanitizeSharedProject(project()),{id}=await m.createShare(db,{...shared,name:'Harbor <Lighthouse> & "Pier"',image},'fixture');
 globalThis.__bricksTestEnv={DB:db};
 const hooks=registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env = globalThis.__bricksTestEnv;',shortCircuit:true};
  return nextResolve(specifier,context);
 }});
 t.after(()=>hooks.deregister());
 const workerUrl=new URL('../dist/server/index.js',import.meta.url);workerUrl.searchParams.set('test',`share-${process.pid}-${Date.now()}`);
 const {default:worker}=await import(workerUrl.href);
 const visit=path=>worker.fetch(new Request(`https://bricks.example${path}`,{headers:{accept:'text/html',host:'bricks.example'}}),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});
 const response=await visit(`/s/${id}`);
 assert.equal(response.status,200);const html=await response.text();
 assert.match(html,new RegExp(`<meta property="og:image" content="https://bricks\\.example/api/share/${id}/image"`));
 assert.match(html,/<meta property="og:image:width" content="1200"/);
 assert.match(html,/<meta name="twitter:card" content="summary_large_image"/);
 assert.match(html,/<meta property="og:title" content="Harbor &lt;Lighthouse&gt; &amp; &quot;Pier&quot;"/);
 assert.match(html,/<meta name="robots" content="noindex/);
 // The first paint names the shared creation instead of the default landmark.
 assert.match(html,/aria-label="Model name"[^>]*value="Harbor &lt;Lighthouse&gt; &amp; &quot;Pier&quot;"/);assert.doesNotMatch(html,/value="Golden Gate Bridge"/);assert.doesNotMatch(html,/3,208/);
 assert.match(html,new RegExp(`Loading ${shared.pieceCount} pieces`));
 for(const path of ['/s/ZZZZZZZZZZ','/s/bad']){const missing=await visit(path);assert.equal(missing.status,404,path);assert.match(await missing.text(),/This shared creation isn’t here/);}
});
