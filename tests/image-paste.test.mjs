import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
import {createRequire} from "node:module";

const bundle=await build({stdin:{contents:'export {clipboardImageFiles,consumeImagePaste} from "./app/image-paste"; export {preparePhotoAttachments} from "./app/photo-attachments"; export {mergeReferencePhotos} from "./app/reference-inputs"; export {collectReferencePhotos} from "./lib/reference-photos";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"cjs",write:false,jsx:"automatic"});
const compiled={exports:{}};
new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {clipboardImageFiles,consumeImagePaste,preparePhotoAttachments,mergeReferencePhotos,collectReferencePhotos}=compiled.exports;
const file=(name,type="image/png")=>new File([name],name,{type});
const item=(value,type=value.type)=>({kind:"file",type,getAsFile:()=>value});
const photo=n=>`data:image/jpeg;base64,${Buffer.from(`reference-${n}`).toString("base64")}`;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const paste=clipboardData=>{
 let prevented=0;
 return {event:{clipboardData,preventDefault(){prevented++;}},prevented:()=>prevented};
};

test("clipboard image items keep their order and are not duplicated by the files fallback",()=>{
 const png=file("front.png"),webp=file("side.webp","image/webp"),pdf=file("drawing.pdf","application/pdf");
 const stringItem={kind:"string",type:"text/plain",getAsFile(){throw Error("Text is not an image file.");}};
 const data={items:[stringItem,item(png),item(pdf),item(webp)],files:[png,webp]};
 assert.deepEqual(clipboardImageFiles(data),[png,webp]);
});

test("clipboard files supply images when image items are missing or cannot produce files",()=>{
 const jpg=file("copied.jpg","image/jpeg"),text=file("notes.txt","text/plain");
 for(const items of [undefined,[],[{kind:"file",type:"image/png",getAsFile:()=>null}]]){
  assert.deepEqual(clipboardImageFiles({items,files:[text,jpg]}),[jpg]);
 }
 assert.deepEqual(clipboardImageFiles(null),[]);
 assert.deepEqual(clipboardImageFiles({items:[],files:[]}),[]);
});

test("ordinary text, links and copied HTML remain native paste without reading or fetching their contents",()=>{
 let received=0;
 for(const type of ["text/plain","text/uri-list","text/html"]){
  const data={items:[{kind:"string",type}],files:[],getData(){throw Error("Image paste must not inspect text or remote URLs.");}};
  const action=paste(data);
  assert.equal(consumeImagePaste(action.event,()=>received++),false);
  assert.equal(action.prevented(),0);
 }
 assert.equal(received,0);
});

test("copied text with a rendered picture beside it (Office, spreadsheets) pastes as text",()=>{
 const png=file("cells.png"),action=paste({items:[{kind:"string",type:"text/plain"},{kind:"string",type:"text/html"},item(png)],files:[png]}),received=[];
 assert.equal(consumeImagePaste(action.event,files=>received.push(files)),false);
 assert.equal(action.prevented(),0);assert.equal(received.length,0);
});

test("a copied browser image with HTML markup attaches the local image and consumes a bubbling event only once",()=>{
 const png=file("clipboard.png"),action=paste({items:[{kind:"string",type:"text/html"},item(png)],files:[png]}),received=[];
 assert.equal(consumeImagePaste(action.event,files=>received.push(files)),true);
 assert.equal(action.prevented(),1);assert.deepEqual(received,[[png]]);
 // A second composer/listener receives the exact same native event. The mock
 // intentionally has no defaultPrevented flag: dedupe must track the event.
 assert.equal(consumeImagePaste(action.event,files=>received.push(files)),false);
 assert.equal(action.prevented(),1);assert.equal(received.length,1);
 const second=paste({items:[item(png)],files:[png]});
 assert.equal(consumeImagePaste(second.event,files=>received.push(files)),true);
 assert.equal(received.length,2,"a later paste is a new action, even when the same file is copied");
});

test("a disabled composer neither takes the paste nor prevents another active consumer from handling it",()=>{
 const png=file("clipboard.png"),action=paste({items:[item(png)],files:[png]}),received=[];
 assert.equal(consumeImagePaste(action.event,files=>received.push(files),true),false);
 assert.equal(action.prevented(),0);assert.equal(received.length,0);
 assert.equal(consumeImagePaste(action.event,files=>received.push(files)),true);
 assert.equal(action.prevented(),1);assert.deepEqual(received,[[png]]);
});

test("unsupported clipboard image types reach the shared upload validation without decoding",async()=>{
 const gif=file("animation.gif","image/gif"),action=paste({items:[item(gif)],files:[gif]});let files,decoded=0;
 assert.equal(consumeImagePaste(action.event,value=>{files=value;}),true);
 assert.deepEqual(files,[gif]);assert.equal(action.prevented(),1);
 await assert.rejects(preparePhotoAttachments(files,()=>[],async()=>{decoded++;return photo(1);}),/JPG, PNG or WebP/);
 assert.equal(decoded,0);
});

test("pasted photos merge into the latest reference state after decoding without restoring stale text or images",async()=>{
 let current={photo:photo(1),photos:[photo(2)],identityHint:"Original place name"};
 const gate=deferred(),png=file("new-angle.png");
 const pending=preparePhotoAttachments(clipboardImageFiles({items:[item(png)],files:[png]}),()=>collectReferencePhotos(current.photo,current.photos),async()=>{await gate.promise;return photo(4);});
 current={photo:photo(3),photos:[photo(2)],identityHint:"Corrected building name and city"};
 gate.resolve();current=mergeReferencePhotos(current,await pending);
 assert.deepEqual(current,{photo:photo(3),photos:[photo(2),photo(4)],identityHint:"Corrected building name and city"});
 assert.ok(!collectReferencePhotos(current.photo,current.photos).includes(photo(1)),"an old primary image must not return after decoding");
});

test("reference merging keeps the original photo first and deduplicates additional pasted evidence",()=>{
 const value={photo:photo(1),photos:[photo(2)],identityHint:"Keep this exact place description"},before=structuredClone(value);
 const merged=mergeReferencePhotos(value,[photo(1),photo(2),photo(3),photo(3)]);
 assert.deepEqual(merged,{photo:photo(1),photos:[photo(2),photo(3)],identityHint:value.identityHint});
 assert.deepEqual(collectReferencePhotos(merged.photo,merged.photos),[photo(1),photo(2),photo(3)]);
 assert.deepEqual(value,before,"merging must not mutate the caller's current references");
 const noOriginal=mergeReferencePhotos({photos:[],identityHint:"Photos-only feedback"},[photo(2),photo(3)]);
 assert.deepEqual(collectReferencePhotos(noOriginal.photo,noOriginal.photos),[photo(2),photo(3)]);
 assert.equal(noOriginal.identityHint,"Photos-only feedback");
});
