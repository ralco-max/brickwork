import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/design-library";export * from "./lib/models";export {projectJSON,emptyShopping} from "./lib/design-project";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
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
// Stores are separate and versioned: opening at a higher version runs the upgrade,
// and a transaction on a store the upgrade never created fails like the real thing.
function useMemoryStorage(t,initial=[],{version=2}={}){
 const original=globalThis.indexedDB;
 const db={version,stores:new Map([['designs',new Map(initial.map(d=>[d.id,structuredClone(d)]))],...(version>=2?[['shares',new Map()]]:[])]),keys:{designs:'id',shares:'projectHash'},waiting:[],running:false,failNextCommit:false};
 const next=()=>{
  if(db.running||!db.waiting.length)return;
  db.running=true;const tx=db.waiting.shift();tx.data=structuredClone(db.stores);
  const step=()=>{
   const job=tx.jobs.shift();
   if(job){job.request.result=job.work(tx.data.get(job.store));job.request.onsuccess?.();setImmediate(step);return;}
   if(db.failNextCommit&&tx.mode==='readwrite'){
    db.failNextCommit=false;tx.error=new Error('Storage full');tx.onabort?.();
   }else{if(tx.mode==='readwrite')db.stores=tx.data;tx.oncomplete?.();}
   db.running=false;next();
  };setImmediate(step);
 };
 const database={close(){},objectStoreNames:{contains:name=>db.stores.has(name)},createObjectStore(name,{keyPath}){db.stores.set(name,new Map());db.keys[name]=keyPath;},transaction(names,mode){
  const scope=[names].flat();for(const name of scope)if(!db.stores.has(name))throw new DOMException(`No objectStore named ${name}`,'NotFoundError');
  const tx={mode,jobs:[],objectStore(name){
   assert.ok(scope.includes(name),`${name} is outside this transaction`);
   const request=work=>{const request={};tx.jobs.push({request,work,store:name});return request;},key=db.keys[name];
   return {
    get:id=>request(data=>structuredClone(data.get(id))),
    getAll:()=>request(data=>structuredClone([...data.values()])),
    put:value=>request(data=>{data.set(value[key],structuredClone(value));return value[key];}),
    delete:id=>request(data=>{data.delete(id);}),
   };
  }};db.waiting.push(tx);setImmediate(next);return tx;
 }};
 globalThis.indexedDB={open(_name,requested=1){
  const request={result:database};
  setImmediate(()=>{
   if(requested<db.version){request.error=new DOMException('The requested version is less than the existing version.','VersionError');request.onerror?.();return;}
   if(requested>db.version){db.version=requested;request.onupgradeneeded?.();}
   request.onsuccess?.();
  });return request;
 }};
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

test('upgrading browser storage to hold share links keeps every existing design',async t=>{
 const designs=[savedFixture('old-1'),{...savedFixture('old-2'),featured:true}],db=useMemoryStorage(t,designs,{version:1});
 assert.equal(db.stores.has('shares'),false);
 assert.deepEqual((await m.listDesigns()).map(d=>d.id).sort(),['old-1','old-2']);
 assert.equal(db.version,2);assert.ok(db.stores.has('shares'));
 assert.equal(await m.findSharedLink('missing'),undefined);
 const featured=(await m.listDesigns()).find(d=>d.id==='old-2');assert.equal(featured.featured,true);assert.equal(featured.project,designs[1].project);
 assert.equal(await m.saveDesign(savedFixture('new')),true);assert.equal((await m.listDesigns()).length,3);
});

test('share links are remembered by content across reloads, keep their owner token and can be forgotten',async t=>{
 useMemoryStorage(t);
 const model={...m.generateRecipe('lighthouse','small'),name:'My light'},hash=await m.shareProjectHash(model);
 assert.match(hash,/^[0-9a-f]{64}$/);
 assert.equal(await m.shareProjectHash({...model,shopping:{owned:{'3001:red':4},elementIds:{},priceOverrides:{},quotes:{}}}),hash,'shopping is never shared, so it does not make a new link');
 assert.notEqual(await m.shareProjectHash({...model,name:'My light 2'}),hash);
 const link={projectHash:hash,shareId:'AbCdEfGh23',url:'https://bricks.test/s/AbCdEfGh23',ownerToken:'owner-token',createdAt:'2026-10-12T00:00:00.000Z'};
 assert.equal(await m.rememberSharedLink(link),true);assert.deepEqual(await m.findSharedLink(hash),link);
 // The server answers a repeat of the same shared content with the same link and no token.
 await m.rememberSharedLink({projectHash:'f'.repeat(64),shareId:'AbCdEfGh23',url:link.url,createdAt:link.createdAt});
 assert.equal((await m.findSharedLink('f'.repeat(64))).ownerToken,'owner-token');
 assert.equal((await m.listSharedLinks()).length,2);assert.deepEqual(await m.listDesigns(),[],'share links are not designs');
 await m.forgetSharedLink('AbCdEfGh23');assert.deepEqual(await m.listSharedLinks(),[]);
});

test('opening shared links never evicts the visitor’s own designs, and a share is saved from its first edit on',async t=>{
 useMemoryStorage(t);
 for(let i=1;i<=3;i++)await m.saveDesign(savedFixture(`own-${i}`,`2001-01-0${i}T00:00:00.000Z`));
 // What the studio does on a link visit: open it, keep the original in a ref, and autosave through saveUnlessPristine.
 const autosave=(model,ref)=>m.saveUnlessPristine(m.packDesign(model,'design'),ref);
 const share=recipe=>m.validateProject(JSON.parse(m.projectJSON(m.generateRecipe(recipe,'small'),m.emptyShopping())));
 const shares={AAAAAAAAAA:share('castle'),BBBBBBBBBB:share('rocket')};
 for(let visit=0;visit<20;visit++){
  const id=visit%2?'AAAAAAAAAA':'BBBBBBBBBB',{model,pristine}=await m.openSharedDesign(id,shares[id]),ref={current:pristine};
  assert.equal(model.libraryId,`share-${id}`);assert.equal(await autosave(model,ref),null,'an untouched share is not saved');assert.equal(ref.current,pristine);
 }
 assert.deepEqual((await m.listDesigns()).map(d=>d.id).sort(),['own-1','own-2','own-3']);
 const {model,pristine}=await m.openSharedDesign('AAAAAAAAAA',shares.AAAAAAAAAA),ref={current:pristine};
 assert.equal(await autosave({...model,name:'My castle remix'},ref),true);assert.equal(ref.current,null);
 assert.equal(await autosave({...model,name:'My castle remix, again'},ref),true);
 let all=await m.listDesigns();assert.equal(all.filter(d=>d.id.startsWith('share-')).length,1);assert.equal(all.find(d=>d.id==='share-AAAAAAAAAA').name,'My castle remix, again');
 // An undo back to the shared original after the copy was kept is saved too, not left at the abandoned edit.
 assert.equal(await autosave(model,ref),true);
 all=await m.listDesigns();assert.equal(all.find(d=>d.id==='share-AAAAAAAAAA').name,shares.AAAAAAAAAA.name);
 // The link reopens on the original; the copy already kept is never overwritten by it.
 const again=await m.openSharedDesign('AAAAAAAAAA',shares.AAAAAAAAAA);
 assert.notEqual(again.model.libraryId,'share-AAAAAAAAAA');assert.equal(again.model.name,shares.AAAAAAAAAA.name);assert.equal(await autosave(again.model,{current:again.pristine}),null);
 all=await m.listDesigns();assert.equal(all.length,4);for(const id of ['own-1','own-2','own-3','share-AAAAAAAAAA'])assert.ok(all.some(d=>d.id===id),id);
 assert.equal(m.unpackDesign(all.find(d=>d.id==='share-AAAAAAAAAA')).pieces.length,shares.AAAAAAAAAA.pieces.length);
 // Other designs autosave as before, whatever share was opened last.
 assert.equal(await autosave({...m.generateRecipe('lighthouse','small'),libraryId:'own-4'},{current:again.pristine}),true);
});

test('recently viewed shares are a separate small list that tolerates broken storage',t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),store=new Map();
 const use=value=>Object.defineProperty(globalThis,'localStorage',{value,configurable:true,writable:true});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
 assert.deepEqual(m.viewedShares(),[],'no storage at all');assert.doesNotThrow(()=>m.rememberViewedShare({id:'x',name:'x',pieceCount:1}));
 use({getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))});
 for(let i=0;i<30;i++)m.rememberViewedShare({id:`share${String(i).padStart(5,'0')}`,name:`Shared ${i}`,pieceCount:i+1});
 m.rememberViewedShare({id:'share00010',name:'Shared 10 again',pieceCount:11});
 const viewed=m.viewedShares();
 assert.equal(viewed.length,24);assert.equal(viewed[0].id,'share00010');assert.equal(viewed[0].name,'Shared 10 again');assert.equal(viewed[1].id,'share00029');
 assert.equal(viewed.filter(v=>v.id==='share00010').length,1);assert.ok(viewed.every(v=>typeof v.viewedAt==='string'));
 store.set('bricks-viewed-shares','{not json');assert.deepEqual(m.viewedShares(),[]);
 store.set('bricks-viewed-shares',JSON.stringify([{id:1},null,{id:'x',name:'ok',pieceCount:2,viewedAt:'2026-10-12T00:00:00.000Z'}]));assert.deepEqual(m.viewedShares().map(v=>v.id),['x']);
 use({getItem(){throw new Error('SecurityError');},setItem(){throw new Error('QuotaExceededError');}});
 assert.deepEqual(m.viewedShares(),[]);assert.doesNotThrow(()=>m.rememberViewedShare({id:'y',name:'y',pieceCount:1}));
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
