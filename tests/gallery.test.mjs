import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {budgetDb} from './helpers/budget-db.mjs';

const bundle=await build({stdin:{contents:'export * from "./lib/gallery";export {cleanText,foldForMatch,moderateName,networkOf,MAX_GALLERY_NAME} from "./lib/moderation";export {compileScene} from "./lib/generated-scene";export {generateRecipe} from "./lib/models";export {projectJSON,emptyShopping,defaultBrief,emptyManual,referenceKey} from "./lib/design-project";export {POST as sharePOST} from "./app/api/share/route";export {GET as shareGET,DELETE as shareDELETE} from "./app/api/share/[id]/route";export {GET as listGET,POST as publishPOST} from "./app/api/gallery/route";export {GET as statusGET,DELETE as unpublishDELETE,PATCH as moderatePATCH} from "./app/api/gallery/[id]/route";export {POST as reportPOST} from "./app/api/gallery/[id]/report/route";export {POST as remixPOST} from "./app/api/gallery/[id]/remix/route";export {env as testEnv} from "cloudflare:workers";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true},logLevel:'error'});
after(()=>vite.close());

function jpeg(width=1200,height=630){
 const app0=[0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0],dqt=[0xff,0xdb,0,67,0,...Array(64).fill(1)];
 const sof=[0xff,0xc0,0,17,8,height>>8,height&255,width>>8,width&255,3,1,0x22,0,2,0x11,1,3,0x11,1];
 return Buffer.from([0xff,0xd8,...app0,...dqt,...sof,0xff,0xd9]);
}
const image='data:image/jpeg;base64,'+jpeg().toString('base64');
// A designed build (it carries its AI scene), so the gallery accepts it.
function project(name='Harbor house'){
 const box=(id,position,size,color)=>({id,component:id,label:id,kind:'box',operation:'add',color,position,size,end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
 const scene={name,description:'A small house by the water.',dimensions:{x:12,y:12,z:10},shapes:[box('Base',{x:0,y:0,z:0},{x:12,y:2,z:10},'gray'),box('House',{x:2,y:2,z:2},{x:8,y:9,z:6},'red')]};
 const model={...m.compileScene(scene,{hollow:false,smooth:true}),generation:scene};
 const data=JSON.parse(m.projectJSON(model,m.emptyShopping()));
 const brief=m.defaultBrief('A small house');
 data.design={brief,reference:{briefKey:m.referenceKey(brief)},manual:m.emptyManual(),locked:[],revisions:[]};
 return data;
}
const IP='203.0.113.7';
const req=(path,{method='GET',headers={},body,ip=IP}={})=>new Request(`https://bricks.test${path}`,{method,headers:{'cf-connecting-ip':ip,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
const auth=token=>token===undefined?{}:{authorization:`Bearer ${token}`};
const params=id=>({params:Promise.resolve({id})});
async function share(data=project(),ip=IP){const response=await m.sharePOST(req('/api/share',{method:'POST',body:{project:data,image},ip}));assert.ok(response.ok,`share failed: ${response.status}`);return response.json();}
const publish=(shareId,token,{headers={},...options}={})=>m.publishPOST(req('/api/gallery',{method:'POST',body:{shareId},headers:{...auth(token),...headers},...options}));
const unpublish=(id,token,{headers={},...options}={})=>m.unpublishDELETE(req(`/api/gallery/${id}`,{method:'DELETE',headers:{...auth(token),...headers},...options}),params(id));
const moderate=(id,token,body)=>m.moderatePATCH(req(`/api/gallery/${id}`,{method:'PATCH',headers:auth(token),body}),params(id));
const report=(id,ip=IP,headers={})=>m.reportPOST(req(`/api/gallery/${id}/report`,{method:'POST',ip,headers}),params(id));
const remix=(id,ip=IP)=>m.remixPOST(req(`/api/gallery/${id}/remix`,{method:'POST',ip}),params(id));
const status=async id=>(await m.statusGET(req(`/api/gallery/${id}`),params(id))).json();
const list=async(query='')=>{const response=await m.listGET(req(`/api/gallery${query}`));return {response,body:await response.json()};};
function setup(t){const {db,sqlite}=budgetDb();m.testEnv.DB=db;t.after(()=>{sqlite.close();delete m.testEnv.DB;delete m.testEnv.GALLERY_ADMIN_TOKEN;});return {db,sqlite};}

// Gallery rows written directly, for listing tests that need many items, ties and hidden rows.
function seed(sqlite,rows){
 const shareRow=sqlite.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at,owner_hash,content_hash) VALUES (?,?,'',?,'{\"format\":\"brickwork\",\"edited\":true}','data:image/jpeg;base64,AA','creator',0,'owner',?)");
 const item=sqlite.prepare('INSERT INTO gallery (share_id,name,piece_count,content_hash,publisher_hash,published_at,remixes,reports,hidden,listed) VALUES (?,?,?,?,?,?,?,0,?,?)');
 for(const r of rows){shareRow.run(r.id,r.name,r.pieces??40,'hash-'+r.id);item.run(r.id,r.name,r.pieces??40,'hash-'+r.id,'publisher',r.at,r.remixes??0,r.hidden?1:0,r.unlisted?0:1);}
}
const itemId=i=>`Item${String(i).padStart(6,'0')}`;

test('gallery names are normalised, and the blocklist is small, leet-aware and spares innocent words',()=>{
 assert.equal(m.cleanText('  Harbor​  house‮ \n at\tdusk  '),'Harbor house at dusk');
 assert.equal(m.cleanText('ＢＲＩＣＫ　Ｔｏｗｅｒ'),'BRICK Tower','full-width letters fold to plain ones');
 const long=m.cleanText('🧱'.repeat(90));assert.equal(Array.from(long).length,m.MAX_GALLERY_NAME);assert.ok(!/[\ud800-\udbff]$/.test(long),'an emoji is never cut in half');
 for(const ok of ['Harbor house','Scunthorpe station','Cocktail bar','Maine Coon cat','Niger river boat','Hof Uckermark barn','Saturn V 1969','Moby Dick whaler','Assassin’s tower','Café Ψ','東京タワー'])assert.deepEqual(m.moderateName(ok),{ok:true,name:ok},ok);
 for(const bad of ['Sh1t tower','sh!t','F.U.C.K castle','f u c k','fuuuuck yeah','ＦＵＣＫ','Dumb fück','fu​ck shed','MotherFUCKER mansion','b1tch'])assert.equal(m.moderateName(bad).reason,'blocked',bad);
 assert.equal(m.moderateName('Visit www.example.com').reason,'link');assert.equal(m.moderateName('Free bricks https://x.test').reason,'link');
 assert.equal(m.moderateName('  !! ').reason,'empty');assert.equal(m.moderateName('​​').reason,'empty');
 assert.match(m.moderateName('Sh1t tower').message,/can’t be shown/);
});

test('publishing needs the link’s owner token and puts a narrow row in the gallery',async t=>{
 const {sqlite}=setup(t);
 const {id,ownerToken}=await share();const other=await share(project('Lighthouse'));
 const missing=await publish(id);assert.equal(missing.status,401);assert.equal(missing.headers.get('www-authenticate'),'Bearer');
 assert.equal((await publish(id,'not-the-token')).status,403);
 assert.equal((await publish(id,other.ownerToken)).status,403,'one link’s token cannot publish another');
 assert.equal((await publish('ZZZZZZZZZZ',ownerToken)).status,404);
 assert.equal((await publish(id,ownerToken,{headers:{origin:'https://evil.test'}})).status,403);
 assert.equal((await publish(id,ownerToken,{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await m.publishPOST(req('/api/gallery',{method:'POST',headers:auth(ownerToken),body:{shareId:id,name:'Renamed'}}))).status,400,'unknown fields are refused');
 assert.equal((await m.publishPOST(req('/api/gallery',{method:'POST',headers:auth(ownerToken),body:{shareId:'../etc'}}))).status,400);
 assert.equal((await m.publishPOST(req('/api/gallery',{method:'POST',headers:auth(ownerToken),body:JSON.stringify({shareId:id,pad:'x'.repeat(2000)})}))).status,400,'bodies are size-capped');
 assert.deepEqual(await status(id),{published:false,hidden:false,removed:false});
 const created=await publish(id,ownerToken);assert.equal(created.status,201);assert.equal(created.headers.get('cache-control'),'no-store');
 const item=await created.json();
 assert.deepEqual(item,{id,name:'Harbor house',pieceCount:item.pieceCount,publishedAt:item.publishedAt,remixes:0,imageUrl:`/api/share/${id}/image`,url:`/s/${id}`,hidden:false});
 assert.ok(item.pieceCount>0);assert.ok(!Number.isNaN(Date.parse(item.publishedAt)));
 const again=await publish(id,ownerToken);assert.equal(again.status,200,'publishing twice is harmless');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gallery').get().n,1);
 const row=sqlite.prepare('SELECT * FROM gallery').get();
 assert.deepEqual(Object.keys(row).sort(),['content_hash','hidden','listed','name','piece_count','published_at','publisher_hash','remixes','reports','share_id']);
 assert.equal(row.content_hash,sqlite.prepare('SELECT content_hash FROM shares WHERE id = ?').get(id).content_hash);
 assert.deepEqual(await status(id),{published:true,hidden:false,removed:false});
 // Links from before owner tokens have no owner, so they cannot be published.
 sqlite.prepare('UPDATE shares SET owner_hash = NULL WHERE id = ?').run(other.id);
 assert.equal((await publish(other.id,other.ownerToken)).status,403);
});

test('untouched presets, blocked names and duplicate content stay out of the gallery',async t=>{
 const {sqlite}=setup(t);
 const preset=JSON.parse(m.projectJSON(m.generateRecipe('house','small'),m.emptyShopping()));
 const fresh=await share(preset);const refused=await publish(fresh.id,fresh.ownerToken);
 assert.equal(refused.status,422);assert.match((await refused.json()).error,/preset/);
 const edited=await share({...preset,name:'My cottage',edited:true});assert.equal((await publish(edited.id,edited.ownerToken)).status,201,'an edited preset is the creator’s own');
 const rude=await share(project('Sh1t tower'));const blocked=await publish(rude.id,rude.ownerToken);
 assert.equal(blocked.status,422);assert.match((await blocked.json()).error,/can’t be shown/);
 const first=await share(project('Harbor house'));assert.equal((await publish(first.id,first.ownerToken)).status,201);
 const copy=await share(project('Harbor house'),'198.51.100.2');assert.notEqual(copy.id,first.id);assert.ok(copy.ownerToken,'another visitor sharing identical content gets their own link');
 const duplicate=await publish(copy.id,copy.ownerToken,{ip:'198.51.100.2'});assert.equal(duplicate.status,409);assert.match((await duplicate.json()).error,/already in the gallery/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gallery').get().n,2);
 // A friend opening an unlisted link and re-sharing it unchanged cannot list the creator's build for them.
 const original=await share(project('Grandma’s porch')),reshared=await share(project('Grandma’s porch'),'198.51.100.3');
 sqlite.prepare('UPDATE shares SET created_at = created_at - 60000 WHERE id = ?').run(original.id);
 const copied=await publish(reshared.id,reshared.ownerToken,{ip:'198.51.100.3'});assert.equal(copied.status,409);assert.match((await copied.json()).error,/unchanged copy/);
 assert.equal((await publish(original.id,original.ownerToken)).status,201,'the first link’s creator still can');
 const plan=sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM shares WHERE content_hash = ? AND created_at < ? AND id <> ? LIMIT 1').all().map(r=>r.detail).join(' ');assert.match(plan,/idx_shares_content_hash/);
});

test('a visitor can publish five builds an hour, and an IPv6 /64 is one visitor',async t=>{
 setup(t);
 const links=[];for(let i=1;i<=6;i++)links.push(await share(project(`Build number ${i}`)));
 for(const link of links.slice(0,5))assert.equal((await publish(link.id,link.ownerToken)).status,201);
 const limited=await publish(links[5].id,links[5].ownerToken);assert.equal(limited.status,429);assert.equal(limited.headers.get('cache-control'),'no-store');
 assert.equal((await publish(links[5].id,links[5].ownerToken,{ip:'198.51.100.9'})).status,201,'the limit is per visitor');
 const v6=[];for(let i=1;i<=6;i++)v6.push(await share(project(`Six four build ${i}`),`2001:db8:5:6::${i}`));
 for(const [i,link] of v6.entries())assert.equal((await publish(link.id,link.ownerToken,{ip:`2001:db8:5:6::${i+1}`})).status,i<5?201:429,`IPv6 publish ${i+1}`);
});

test('cycling publish and unpublish is rate-limited and never bumps a build back to the top',async t=>{
 const {sqlite}=setup(t);
 const {id,ownerToken}=await share();const later=await share(project('Lighthouse'),'198.51.100.4');
 const first=await (await publish(id,ownerToken)).json();
 sqlite.prepare('UPDATE gallery SET published_at = published_at - 60000, remixes = 3 WHERE share_id = ?').run(id);
 assert.equal((await publish(later.id,later.ownerToken,{ip:'198.51.100.4'})).status,201);
 const statuses=[];for(let i=0;i<6;i++)statuses.push((await unpublish(id,ownerToken)).status,(await publish(id,ownerToken)).status);
 assert.deepEqual(statuses,[204,201,204,201,204,201,204,201,204,429,204,429],'relists count toward the five an hour');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gallery').get().n,2,'one row per link, however often it is relisted');
 // An hour on, it can come back: where it was, with its remixes. Day-old log rows are pruned.
 sqlite.prepare('UPDATE gallery_actions SET created_at = 0').run();
 const back=await publish(id,ownerToken);assert.equal(back.status,201);
 const item=await back.json();assert.equal(item.remixes,3);assert.equal(Date.parse(item.publishedAt),Date.parse(first.publishedAt)-60000,'a relist keeps its first publish time');
 assert.deepEqual((await list()).body.items.map(i=>i.id),[later.id,id],'and its place in Newest');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gallery_actions').get().n,1);
});

test('unpublishing takes the owner or admin token and keeps the link; deleting the link removes its listing',async t=>{
 const {sqlite}=setup(t);
 const {id,ownerToken}=await share();const other=await share(project('Lighthouse'));
 assert.equal((await unpublish(id,ownerToken)).status,404,'not in the gallery yet');
 await publish(id,ownerToken);await publish(other.id,other.ownerToken);
 assert.equal((await unpublish(id)).status,401);assert.equal((await unpublish(id,'nope')).status,403);assert.equal((await unpublish(id,other.ownerToken)).status,403);
 assert.equal((await unpublish(id,ownerToken,{headers:{origin:'https://evil.test'}})).status,403);
 const removed=await unpublish(id,ownerToken);assert.equal(removed.status,204);assert.equal(removed.headers.get('cache-control'),'no-store');
 assert.deepEqual(await status(id),{published:false,hidden:false,removed:false});assert.deepEqual((await list()).body.items.map(i=>i.id),[other.id]);
 assert.equal((await unpublish(id,ownerToken)).status,204,'unpublishing twice is harmless');
 assert.equal((await m.shareGET(req(`/api/share/${id}`),params(id))).status,200,'the unlisted link keeps working');
 assert.equal((await remix(id,'192.0.2.9')).status,404,'an unlisted build collects no remixes');assert.equal((await report(id,'192.0.2.9')).status,404,'and can’t be reported');
 assert.equal((await unpublish(other.id,'gallery-admin-secret')).status,403,'no admin token is configured');
 m.testEnv.GALLERY_ADMIN_TOKEN='gallery-admin-secret';
 assert.equal((await unpublish(other.id,'gallery-admin-secret')).status,204);assert.equal((await list()).body.items.length,0);
 assert.equal((await publish(id,ownerToken)).status,201);await report(id,'192.0.2.1');await remix(id,'192.0.2.2');
 const deleted=await m.shareDELETE(req(`/api/share/${id}`,{method:'DELETE',headers:auth(ownerToken)}),params(id));assert.equal(deleted.status,204);
 for(const table of ['gallery','gallery_reports','gallery_remixes'])assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE share_id = ?`).get(id).n,0,`${table} rows go with their link`);
});

test('admin decisions stick through unpublish, relist, and deleting and re-sharing the link',async t=>{
 setup(t);const admin='gallery-admin-secret';m.testEnv.GALLERY_ADMIN_TOKEN=admin;
 const deleteLink=link=>m.shareDELETE(req(`/api/share/${link.id}`,{method:'DELETE',headers:auth(link.ownerToken)}),params(link.id));
 // An admin unpublish is a removal: the owner can't list it again.
 const a=await share(project('Removed build'));assert.equal((await publish(a.id,a.ownerToken)).status,201);
 assert.equal((await unpublish(a.id,admin)).status,204);
 assert.deepEqual(await status(a.id),{published:false,hidden:true,removed:true});
 const refused=await publish(a.id,a.ownerToken);assert.equal(refused.status,403);assert.match((await refused.json()).error,/moderator/);
 assert.equal((await list()).body.items.length,0);
 // Nor under a new link to the same build.
 assert.equal((await deleteLink(a)).status,204);
 const again=await share(project('Removed build'));assert.notEqual(again.id,a.id);
 assert.equal((await publish(again.id,again.ownerToken)).status,403);assert.deepEqual(await status(again.id),{published:false,hidden:false,removed:true});
 // Only an admin restore lifts it, and it reaches the new link.
 assert.equal((await moderate(again.id,admin,{hidden:false})).status,200);
 assert.equal((await publish(again.id,again.ownerToken)).status,201);assert.deepEqual((await list()).body.items.map(i=>i.id),[again.id]);
 // An admin hide survives the share dialog's untick and re-tick, and a new link to the same build.
 const b=await share(project('Hidden build'),'198.51.100.20');assert.equal((await publish(b.id,b.ownerToken,{ip:'198.51.100.20'})).status,201);
 assert.equal((await moderate(b.id,admin,{hidden:true})).status,200);
 assert.equal((await unpublish(b.id,b.ownerToken)).status,204);
 const relisted=await publish(b.id,b.ownerToken,{ip:'198.51.100.20'});assert.equal(relisted.status,201);assert.equal((await relisted.json()).hidden,true);
 assert.deepEqual(await status(b.id),{published:true,hidden:true,removed:false});assert.deepEqual((await list()).body.items.map(i=>i.id),[again.id]);
 assert.equal((await deleteLink(b)).status,204);
 const b2=await share(project('Hidden build'),'198.51.100.20'),b2Published=await publish(b2.id,b2.ownerToken,{ip:'198.51.100.20'});
 assert.equal(b2Published.status,201);assert.equal((await b2Published.json()).hidden,true,'a new link to a hidden build is listed hidden');
 assert.deepEqual((await list()).body.items.map(i=>i.id),[again.id]);
 // An admin can also remove what it hid, and restore that.
 assert.equal((await unpublish(b2.id,admin)).status,204);assert.equal((await publish(b2.id,b2.ownerToken,{ip:'198.51.100.20'})).status,403);
 assert.equal((await moderate(b2.id,admin,{hidden:false})).status,200);assert.deepEqual(await status(b2.id),{published:false,hidden:false,removed:false},'a restore leaves relisting to the owner');
 assert.equal((await publish(b2.id,b2.ownerToken,{ip:'198.51.100.20'})).status,201);assert.equal((await list()).body.items.length,2);
 assert.equal((await moderate('ZZZZZZZZZZ',admin,{hidden:false})).status,404);
});

test('listing pages by keyset without overlaps, hides hidden items and never returns projects or images',async t=>{
 const {db,sqlite}=setup(t);
 // Groups of four share a timestamp, so page edges fall inside ties.
 seed(sqlite,Array.from({length:32},(_,i)=>({id:itemId(i),name:`Build ${i}`,at:1_790_000_000_000+Math.floor(i/4)*1000,remixes:i%5,hidden:i%10===3,unlisted:i===7||i===31})));
 const visible=Array.from({length:32},(_,i)=>i).filter(i=>i%10!==3&&i!==7&&i!==31);
 const {response,body}=await list();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'public, max-age=30');
 assert.equal(body.items.length,24);assert.ok(body.nextCursor);
 for(const item of body.items){assert.deepEqual(Object.keys(item).sort(),['id','imageUrl','name','pieceCount','publishedAt','remixes','url']);assert.equal(item.imageUrl,`/api/share/${item.id}/image`);assert.equal(item.url,`/s/${item.id}`);}
 assert.ok(!JSON.stringify(body).includes('brickwork')&&!JSON.stringify(body).includes('base64'),'no project or image data is listed');
 const second=await list(`?sort=recent&cursor=${encodeURIComponent(body.nextCursor)}`);
 assert.equal(second.body.items.length,visible.length-24);assert.equal(second.body.nextCursor,null);
 const expected=visible.map(i=>({id:itemId(i),at:Math.floor(i/4)})).sort((a,b)=>b.at-a.at||(a.id<b.id?1:-1)).map(r=>r.id);
 assert.deepEqual([...body.items,...second.body.items].map(i=>i.id),expected,'newest first, ties by id, no repeats');
 for(const sort of ['recent','remixed'])for(const size of [1,4,7]){
  const seen=[];let cursor=null;do{const page=await m.listGallery(db,sort,cursor,size);seen.push(...page.items);cursor=page.nextCursor;}while(cursor);
  assert.equal(new Set(seen.map(i=>i.id)).size,visible.length,`${sort} pages of ${size} cover every visible item once`);assert.equal(seen.length,visible.length);
  if(sort==='remixed')for(let i=1;i<seen.length;i++)assert.ok(seen[i-1].remixes>=seen[i].remixes,'most remixed first');
 }
 assert.equal((await list('?sort=popular')).response.status,400);assert.equal((await list('?cursor=1;DROP TABLE gallery')).response.status,400);assert.equal((await list(`?sort=remixed&cursor=${body.nextCursor}`)).response.status,400,'a cursor only fits its own order');
 for(const sql of ['SELECT share_id FROM gallery WHERE hidden = 0 AND listed = 1 AND (published_at, share_id) < (?, ?) ORDER BY published_at DESC, share_id DESC LIMIT ?','SELECT share_id FROM gallery WHERE hidden = 0 AND listed = 1 AND (remixes, published_at, share_id) < (?, ?, ?) ORDER BY remixes DESC, published_at DESC, share_id DESC LIMIT ?']){
  const plan=sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join(' ');
  assert.match(plan,/idx_gallery_(recent|remixed)/);assert.doesNotMatch(plan,/TEMP B-TREE|SCAN/,'pages walk an index, never sort or scan');
 }
 const empty=budgetDb();t.after(()=>empty.sqlite.close());assert.deepEqual(await m.listGallery(empty.db),{items:[],nextCursor:null});
});

test('the list is served from the edge cache when there is one',async t=>{
 const {sqlite}=setup(t);seed(sqlite,[{id:itemId(1),name:'Cached build',at:1}]);
 // Like the Workers cache, a hit's headers are immutable.
 const immutable=response=>{const copy=response.clone();for(const method of ['set','append','delete'])Object.defineProperty(copy.headers,method,{value:()=>{throw TypeError("Can't modify immutable headers.");}});return copy;};
 const stored=new Map();globalThis.caches={default:{match:async key=>stored.has(key.url)?immutable(stored.get(key.url)):undefined,put:async(key,response)=>{stored.set(key.url,response);}}};
 t.after(()=>{delete globalThis.caches;});
 const first=await list('?sort=recent');assert.equal(first.body.items[0].name,'Cached build');assert.deepEqual([...stored.keys()],['https://bricks.test/api/gallery?sort=recent']);
 sqlite.prepare('DELETE FROM gallery').run();
 const hit=await m.listGET(req('/api/gallery'));assert.equal((await hit.clone().json()).items[0].name,'Cached build','a hit skips the database');
 assert.equal(hit.headers.get('cache-control'),'public, max-age=30');hit.headers.set('vary','RSC');assert.equal(hit.headers.get('vary'),'RSC','the router can still add its headers to a cached page');
});

test('three different reporters hide a build; repeats count once and unpublishing does not clear them',async t=>{
 const {sqlite}=setup(t);
 const {id,ownerToken}=await share();await publish(id,ownerToken);
 assert.equal((await report('ZZZZZZZZZZ')).status,404);assert.equal((await report(id,IP,{origin:'https://evil.test'})).status,403);
 const first=await report(id,'192.0.2.1');assert.equal(first.status,202);assert.equal(first.headers.get('cache-control'),'no-store');
 for(let i=0;i<4;i++)assert.equal((await report(id,'192.0.2.1')).status,202,'a repeat report is accepted quietly');
 await report(id,'192.0.2.2');
 assert.equal(sqlite.prepare('SELECT reports FROM gallery').get().reports,2);assert.equal((await list()).body.items.length,1);
 await report(id,'192.0.2.3');
 assert.deepEqual({...sqlite.prepare('SELECT reports,hidden FROM gallery').get()},{reports:3,hidden:1});
 assert.equal((await list()).body.items.length,0,'hidden builds leave the list');assert.deepEqual(await status(id),{published:true,hidden:true,removed:false});
 assert.equal((await remix(id,'192.0.2.50')).status,200);assert.equal(sqlite.prepare('SELECT remixes FROM gallery').get().remixes,0,'hidden builds collect no remixes');
 assert.equal((await unpublish(id,ownerToken)).status,204);
 const back=await publish(id,ownerToken);assert.equal(back.status,201);assert.equal((await back.json()).hidden,true,'reports outlive an unpublish');
 assert.equal((await list()).body.items.length,0);
 // Only the admin can restore it. Its reports are dismissed, not deleted, so the same people can't hide it again.
 assert.equal((await moderate(id,undefined,{hidden:false})).status,401);assert.equal((await moderate(id,ownerToken,{hidden:false})).status,403);
 m.testEnv.GALLERY_ADMIN_TOKEN='gallery-admin-secret';
 assert.equal((await moderate(id,'gallery-admin-secret',{hidden:'no'})).status,400);assert.equal((await moderate('ZZZZZZZZZZ','gallery-admin-secret',{hidden:false})).status,404);
 assert.equal((await moderate(id,'gallery-admin-secret',{hidden:false})).status,200);
 assert.deepEqual({...sqlite.prepare('SELECT reports,hidden FROM gallery').get()},{reports:0,hidden:0});assert.deepEqual(sqlite.prepare('SELECT dismissed FROM gallery_reports').all().map(r=>r.dismissed),[1,1,1]);
 assert.equal((await list()).body.items.length,1);
 for(const ip of ['192.0.2.1','192.0.2.2','192.0.2.3'])assert.equal((await report(id,ip)).status,202);
 assert.equal((await list()).body.items.length,1,'the same three reporters cannot hide it again');assert.equal(sqlite.prepare('SELECT reports FROM gallery').get().reports,0);
 for(const ip of ['192.0.2.4','192.0.2.5','192.0.2.6'])await report(id,ip);
 assert.equal((await list()).body.items.length,0,'three new reporters can');
 assert.equal((await moderate(id,'gallery-admin-secret',{hidden:false})).status,200);assert.equal((await list()).body.items.length,1);
 assert.equal((await moderate(id,'gallery-admin-secret',{hidden:true})).status,200);assert.equal((await list()).body.items.length,0,'the admin can hide a build directly');
});

test('one person cannot empty the gallery: a reporter is their IPv6 /48 and makes ten reports a day',async t=>{
 const {sqlite}=setup(t);
 assert.equal(m.networkOf('203.0.113.7'),'203.0.113.7');assert.equal(m.networkOf(null),'local');assert.equal(m.networkOf(' '),'local');
 assert.equal(m.networkOf('2001:db8:1:2::a'),'2001:db8:1:2::/64');assert.equal(m.networkOf('2001:0DB8:0001:0002:ffff:0:0:b'),'2001:db8:1:2::/64');
 assert.equal(m.networkOf('2001:db8:1:2::a',48),'2001:db8:1::/48');assert.equal(m.networkOf('2001:db8:1:ff00::1',48),'2001:db8:1::/48');assert.equal(m.networkOf('2001:db8:1:2ff::1',56),'2001:db8:1:200::/56');
 assert.equal(m.networkOf('::ffff:203.0.113.7'),'203.0.113.7');assert.equal(m.networkOf('::ffff:cb00:7107'),'203.0.113.7');assert.equal(m.networkOf('64:ff9b::203.0.113.7',48),'64:ff9b:0::/48');
 assert.equal(m.networkOf('fe80::1%eth0'),'fe80:0:0:0::/64');assert.equal(m.networkOf('::1'),'0:0:0:0::/64');assert.equal(m.networkOf('not:an:ip:zz'),'not:an:ip:zz');assert.equal(m.networkOf('1:2:3:4:5:6:7:8:9'),'1:2:3:4:5:6:7:8:9');
 // The reviewer's probe: six builds, then three addresses in one home's /64 report all of them.
 const links=[];
 for(let i=1;i<=6;i++){const ip=`198.51.100.${30+i}`,link=await share(project(`Community build ${i}`),ip);assert.equal((await publish(link.id,link.ownerToken,{ip})).status,201);links.push(link);}
 for(const link of links)for(const ip of ['2001:db8:1:2::a','2001:db8:1:2::b','2001:db8:1:2::c'])assert.equal((await report(link.id,ip)).status,202);
 assert.equal((await list()).body.items.length,6,'one household is one reporter');
 for(const ip of ['2001:db8:1:3::1','2001:db8:1:ffff::1'])assert.equal((await report(links[0].id,ip)).status,202);
 assert.equal(sqlite.prepare('SELECT reports FROM gallery WHERE share_id = ?').get(links[0].id).reports,1,'nor are the other /64s of its /48');
 // Six reports used; four more today, then 429 without counting.
 const more=[];for(let i=1;i<=6;i++){const ip=`198.51.100.${40+i}`,link=await share(project(`More builds ${i}`),ip);await publish(link.id,link.ownerToken,{ip});more.push(link);}
 const statuses=[];for(const link of more)statuses.push((await report(link.id,'2001:db8:1:2::d')).status);
 assert.deepEqual(statuses,[202,202,202,202,429,429]);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gallery_reports WHERE share_id = ?').get(more[4].id).n,0);
 assert.equal((await report(more[4].id,'2001:db8:2::1')).status,202,'the limit is per reporter');
 const limited=await report(more[5].id,'2001:db8:1:2::e');assert.equal(limited.headers.get('cache-control'),'no-store');assert.match((await limited.json()).error,/a lot of reports/);
 assert.equal((await list()).body.items.length,12);
 assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM gallery_reports').all()).includes('2001:db8'),'addresses are only ever hashed');
});

test('remixes count once per visitor per day and never for the creator',async t=>{
 const {db,sqlite}=setup(t);
 const {id,ownerToken}=await share();
 assert.equal((await remix(id,'192.0.2.10')).status,404,'only gallery builds count remixes');assert.equal((await remix('../x')).status,404);
 await publish(id,ownerToken);
 const own=await remix(id,IP);assert.deepEqual(await own.json(),{counted:false},'the creator’s own edits are not remixes');
 const firstVisit=await remix(id,'192.0.2.10');assert.equal(firstVisit.headers.get('cache-control'),'no-store');assert.deepEqual(await firstVisit.json(),{counted:true});
 assert.deepEqual(await (await remix(id,'192.0.2.10')).json(),{counted:false});
 assert.deepEqual(await (await remix(id,'192.0.2.11')).json(),{counted:true});
 assert.equal((await list()).body.items[0].remixes,2);
 // The visitor hash's salt changes daily; a new day's hash counts again, and stale rows are pruned.
 const now=Date.now();
 assert.deepEqual(await m.countRemix(db,id,'tomorrow-hash',now+86_400_000),{counted:true});
 assert.deepEqual(await m.countRemix(db,id,'later-hash',now+3.5*86_400_000),{counted:true});
 assert.deepEqual(sqlite.prepare('SELECT visitor_hash AS v FROM gallery_remixes').all().map(r=>r.v),['later-hash']);
 assert.equal((await list('?sort=remixed')).body.items[0].remixes,4);
 assert.deepEqual(await (await remix(id,'2001:db8:9:9::1')).json(),{counted:true});assert.deepEqual(await (await remix(id,'2001:db8:9:9::2')).json(),{counted:false},'one IPv6 /64 is one visitor');
});

test('the share dialog lists a link only when its creator ticks the gallery box',async()=>{
 const dialog=await vite.ssrLoadModule('/app/share-dialog.tsx');
 const html=renderToStaticMarkup(React.createElement(dialog.GalleryToggle,{shareId:'AbCdEfGhJk',ownerToken:'token',publishable:true}));
 assert.match(html,/Show in the public gallery/);assert.match(html,/aria-checked="false"/,'off by default');assert.match(html,/name, preview and piece count/);
 const tokenless=renderToStaticMarkup(React.createElement(dialog.GalleryToggle,{shareId:'AbCdEfGhJk',publishable:true}));
 assert.match(tokenless,/Only the browser that created this link/);assert.match(tokenless,/<button[^>]*role="checkbox"[^>]*disabled=""/);
 assert.match(renderToStaticMarkup(React.createElement(dialog.GalleryToggle,{shareId:'AbCdEfGhJk',ownerToken:'token',publishable:false})),/Change this preset/);
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});return init.method==='POST'?Response.json({hidden:false},{status:201}):new Response(null,{status:204});};
 assert.deepEqual(await dialog.setGalleryListing('AbCdEfGhJk','token',true,fetcher),{published:true,hidden:false});
 assert.deepEqual(calls[0],{url:'/api/gallery',init:{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:'{"shareId":"AbCdEfGhJk"}'}});
 assert.deepEqual(await dialog.setGalleryListing('AbCdEfGhJk','token',false,fetcher),{published:false,hidden:false});assert.equal(calls[1].url,'/api/gallery/AbCdEfGhJk');assert.equal(calls[1].init.method,'DELETE');
 await assert.rejects(dialog.setGalleryListing('AbCdEfGhJk','token',true,async()=>Response.json({error:'This build is already in the gallery under another link.'},{status:409})),/already in the gallery/);
});

test('the remix helper skips the creator’s own links and never throws',async()=>{
 const {noteRemix}=await vite.ssrLoadModule('/app/gallery/remix.ts');
 const calls=[];const fetcher=async url=>{calls.push(url);return Response.json({counted:true});};
 assert.equal(await noteRemix('AbCdEfGhJk',fetcher),true);assert.deepEqual(calls,['/api/gallery/AbCdEfGhJk/remix']);
 assert.equal(await noteRemix('../bad',fetcher),false);assert.equal(calls.length,1);
 assert.equal(await noteRemix('AbCdEfGhJk',async()=>{throw Error('offline');}),false);
});

test('the built /gallery page server-renders published builds with link-preview tags',async t=>{
 const {sqlite,db}=budgetDb();t.after(()=>sqlite.close());
 globalThis.__bricksGalleryEnv={DB:db};t.after(()=>{delete globalThis.__bricksGalleryEnv;});
 const hooks=registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,'+encodeURIComponent('export const env=globalThis.__bricksGalleryEnv;'),shortCircuit:true};
  return nextResolve(specifier,context);
 }});
 t.after(()=>hooks.deregister());
 const workerUrl=new URL('../dist/server/index.js',import.meta.url);workerUrl.searchParams.set('test',`${process.pid}-${Date.now()}`);
 const {default:worker}=await import(workerUrl.href);
 const page=async path=>{const response=await worker.fetch(new Request(`http://localhost${path}`,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});return {status:response.status,html:await response.text()};};
 const empty=await page('/gallery');assert.equal(empty.status,200);assert.match(empty.html,/No public builds yet — share yours/);
 seed(sqlite,[{id:itemId(1),name:'Harbor & <lighthouse>',at:2000,remixes:1},{id:itemId(2),name:'Tiny red bus',at:3000,remixes:5,pieces:1234},{id:itemId(3),name:'Reported thing',at:4000,hidden:true}]);
 const {status,html}=await page('/gallery');
 assert.equal(status,200);assert.match(html,/<title>Community builds · Bricks by Ralc<\/title>/);
 assert.match(html,/Tiny red bus/);assert.match(html,/1,234 pieces/);assert.match(html,/href="\/s\/Item000002"/);assert.match(html,/src="\/api\/share\/Item000002\/image"/);
 assert.match(html,/Harbor &amp; &lt;lighthouse&gt;/,'names are escaped');assert.doesNotMatch(html,/<lighthouse>/);
 assert.doesNotMatch(html,/Reported thing/,'hidden builds are not rendered');
 // A build's picture is creator-uploaded and unreviewed, and unfurlers cache previews for days: only the site's own logo is used.
 assert.match(html,/property="og:image" content="http:\/\/localhost\/bricks-logo.png"/);assert.match(html,/name="twitter:card" content="summary"/);
 assert.doesNotMatch(html,/<meta[^>]*\/api\/share\//,'no build image in the link preview');
 assert.ok(html.indexOf('Tiny red bus')<html.indexOf('Harbor'),'newest first');
 const remixed=await page('/gallery?sort=remixed');assert.match(remixed.html,/aria-current="page"[^>]*>Most remixed/);
});
