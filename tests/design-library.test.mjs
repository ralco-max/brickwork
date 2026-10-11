import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/design-library";export * from "./lib/models";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('a design packs to a project file and unpacks with its id, name and bricks intact',()=>{
 const model={...m.generateRecipe('lighthouse','small'),libraryId:'abc',name:'My light',source:'custom'};
 const saved=m.packDesign({...model,shopping:{owned:{},elementIds:{},priceOverrides:{},quotes:{}}},'design');
 assert.equal(saved.id,'abc');assert.equal(saved.status,'design');assert.equal(saved.pieceCount,model.pieces.length);assert.ok(saved.project.length>1000);
 const back=m.unpackDesign(saved);
 assert.equal(back.libraryId,'abc');assert.equal(back.name,'My light');assert.equal(back.pieces.length,model.pieces.length);assert.deepEqual(back.pieces.map(p=>[p.part,p.x,p.y,p.z]),model.pieces.map(p=>[p.part,p.x,p.y,p.z]));
});
test('a saved design whose scene no longer repacks identically is rebuilt from its scene, keeping it revisable',()=>{
 const model={...m.generateRecipe('rocket','small'),libraryId:'r1',source:'custom'};
 const saved=m.packDesign(model,'draft');
 const data=JSON.parse(saved.project);data.generation={name:'x',description:'',dimensions:{x:8,y:8,z:8},shapes:[{label:'b',kind:'box',operation:'add',color:'red',position:{x:0,y:0,z:0},size:{x:2,y:2,z:2},end:{x:0,y:0,z:0},radius:1}]};
 const back=m.unpackDesign({...saved,project:JSON.stringify(data)});
 assert.ok(back.generation&&back.generation.shapes.length===1);assert.equal(back.libraryId,'r1');assert.ok(back.pieces.length>0);
});
test('packing without a library id is refused',()=>{assert.throws(()=>m.packDesign(m.generateRecipe('castle','small'),'design'));});

// A small transactional IndexedDB fixture: requests queue asynchronously, writes
// commit together, and databases reopened by the library share committed records.
function useMemoryStorage(t,initial=[]){
 const original=globalThis.indexedDB;
 const db={records:new Map(initial.map(d=>[d.id,structuredClone(d)])),waiting:[],running:false,failNextCommit:false};
 const next=()=>{
  if(db.running||!db.waiting.length)return;
  db.running=true;const tx=db.waiting.shift();tx.data=structuredClone(db.records);
  const step=()=>{
   const job=tx.jobs.shift();
   if(job){job.request.result=job.work(tx.data);job.request.onsuccess?.();setImmediate(step);return;}
   if(db.failNextCommit&&tx.mode==='readwrite'){
    db.failNextCommit=false;tx.error=new Error('Storage full');tx.onabort?.();
   }else{if(tx.mode==='readwrite')db.records=tx.data;tx.oncomplete?.();}
   db.running=false;next();
  };setImmediate(step);
 };
 const database={close(){},objectStoreNames:{contains:()=>true},transaction(_name,mode){
  const tx={mode,jobs:[],objectStore(){
   const request=work=>{const request={};tx.jobs.push({request,work});return request;};
   return {
    get:id=>request(data=>structuredClone(data.get(id))),
    getAll:()=>request(data=>structuredClone([...data.values()])),
    put:value=>request(data=>{data.set(value.id,structuredClone(value));return value.id;}),
    delete:id=>request(data=>{data.delete(id);}),
   };
  }};db.waiting.push(tx);setImmediate(next);return tx;
 }};
 globalThis.indexedDB={open(){const request={result:database};setImmediate(()=>request.onsuccess?.());return request;}};
 t.after(()=>{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;});
 return db;
}
const savedFixture=(id,updatedAt='2000-01-01T00:00:00.000Z')=>({id,name:`Build ${id}`,description:'Saved fixture',pieceCount:1,status:'design',updatedAt,project:JSON.stringify({name:id,revisions:['first pass','roof revision'],shopping:{owned:{'3001:red':2}}})});

test('existing browser saves can be featured and reopened without changing their project or history',async t=>{
 const original=m.packDesign({...m.generateRecipe('lighthouse','small'),libraryId:'legacy',name:'My saved light'},'draft');
 useMemoryStorage(t,[original]);
 assert.equal((await m.listDesigns())[0].featured,undefined);
 assert.equal(await m.setDesignFeatured('legacy',true),true);
 const featured=(await m.listDesigns())[0];
 assert.equal(featured.featured,true);assert.equal(featured.project,original.project);assert.equal(featured.status,'draft');
 const reopened=m.unpackDesign(featured);assert.equal(reopened.libraryId,'legacy');assert.equal(reopened.name,'My saved light');
 assert.equal(reopened.pieces.length,original.pieceCount);
 assert.equal(await m.setDesignFeatured('missing',true),false);
});

test('featuring the current unsaved build saves it and ordinary re-saves preserve feature changes',async t=>{
 useMemoryStorage(t);
 const draft=savedFixture('current');
 assert.equal(await m.saveDesign(draft,{featured:true}),true);
 assert.equal((await m.listDesigns())[0].featured,true);
 const revised={...draft,name:'Roof improved',project:JSON.stringify({revisions:['first pass','roof revision','windows']}),featured:false};
 assert.equal(await m.saveDesign(revised),true);
 let stored=(await m.listDesigns())[0];assert.equal(stored.featured,true);assert.equal(stored.name,'Roof improved');assert.equal(stored.project,revised.project);
 assert.equal(await m.setDesignFeatured('current',false),true);
 await m.saveDesign({...revised,featured:true});
 stored=(await m.listDesigns())[0];assert.equal(stored.featured,false);assert.equal(stored.project,revised.project);
});

test('featured builds survive recent cleanup and unfeaturing keeps the build in the recent list',async t=>{
 useMemoryStorage(t);
 for(const id of ['favorite-1','favorite-2'])await m.saveDesign(savedFixture(id),{featured:true});
 for(let i=1;i<=17;i++)await m.saveDesign(savedFixture(`recent-${i}`,`2001-01-${String(i).padStart(2,'0')}T00:00:00.000Z`));
 let all=await m.listDesigns();assert.equal(all.length,14);assert.equal(all.filter(d=>d.featured).length,2);
 assert.ok(all.some(d=>d.id==='favorite-1'));assert.ok(all.some(d=>d.id==='favorite-2'));
 assert.ok(!all.some(d=>d.id==='recent-5'));assert.ok(all.some(d=>d.id==='recent-6'));
 await m.setDesignFeatured('favorite-1',false);
 all=await m.listDesigns();assert.equal(all.length,13);assert.equal(all.filter(d=>!d.featured).length,12);
 assert.equal(all[0].id,'favorite-1');assert.equal(all[0].featured,false);assert.ok(all.some(d=>d.id==='favorite-2'));
});

test('queued autosaves and feature toggles preserve the latest flag and project',async t=>{
 useMemoryStorage(t,[savedFixture('race')]);
 await Promise.all([m.setDesignFeatured('race',true),m.saveDesign({...savedFixture('race'),name:'New roof'})]);
 let stored=(await m.listDesigns())[0];assert.equal(stored.featured,true);assert.equal(stored.name,'New roof');
 await Promise.all([m.saveDesign({...savedFixture('race'),name:'New windows',featured:true}),m.setDesignFeatured('race',false)]);
 stored=(await m.listDesigns())[0];assert.equal(stored.featured,false);assert.equal(stored.name,'New windows');
});

test('feature success waits for storage commit and failed writes leave existing saves intact',async t=>{
 const original=savedFixture('full'),db=useMemoryStorage(t,[original]);
 db.failNextCommit=true;
 assert.equal(await m.setDesignFeatured('full',true),false);
 assert.deepEqual(await m.listDesigns(),[original]);
 db.failNextCommit=true;
 assert.equal(await m.saveDesign(savedFixture('new'),{featured:true}),false);
 assert.deepEqual(await m.listDesigns(),[original]);
 await m.deleteDesign('full');assert.deepEqual(await m.listDesigns(),[]);
});

test('the drawer separates featured builds from recent designs and keeps the landmark choices',async()=>{
 const rendered=await build({stdin:{contents:'import React from "react";import {renderToStaticMarkup} from "react-dom/server";import DesignsDrawer from "./app/designs-drawer";export const render=(props)=>renderToStaticMarkup(<DesignsDrawer {...props}/>);',resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'error'});
 const loaded={exports:{}};new Function('require','module','exports',rendered.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);
 const noop=()=>{},html=loaded.exports.render({open:true,model:{recipe:'bridge'},designs:[{...savedFixture('favorite'),featured:true},savedFixture('recent')],onClose:noop,onChoose:noop,onOpenSaved:noop,onContinueSaved:noop,onShopSaved:noop,onDeleteSaved:noop,onFeatureSaved:noop});
 const featured=html.slice(html.indexOf('aria-label="Featured designs"'),html.indexOf('LANDMARKS'));
 const recent=html.slice(html.indexOf('aria-label="Recent designs"'));
 assert.match(featured,/Build favorite/);assert.doesNotMatch(featured,/Build recent/);
 assert.match(recent,/Build recent/);assert.doesNotMatch(recent,/Build favorite/);
 assert.match(featured,/aria-label="Unfeature Build favorite" aria-pressed="true"/);
 assert.match(recent,/aria-label="Feature Build recent" aria-pressed="false"/);
 for(const name of ['Golden Gate','Neuschwanstein','Cape Hatteras','Saturn V'])assert.ok(html.includes(name));
 assert.equal((html.match(/>Open<\/button>/g)||[]).length,2);
});
