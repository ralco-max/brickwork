import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const [{IdeaBar},{preparePhotoAttachments},drafts]=await Promise.all([
 vite.ssrLoadModule('/app/create-build.tsx'),vite.ssrLoadModule('/app/photo-attachments.tsx'),vite.ssrLoadModule('/lib/idea-draft.ts'),
]);
const {addIdeaPhotos,canSubmitIdea,ideaForGeneration,PHOTO_IDEA}=drafts;
const photo=n=>`data:image/jpeg;base64,${Buffer.from(`photo-${n}`).toString('base64')}`;
const file=n=>new File([`photo-${n}`],`angle-${n}.jpg`,{type:'image/jpeg'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const render=(draft,extra={})=>renderToStaticMarkup(React.createElement(IdeaBar,{draft,onDraftChange:()=>{},onPreparingPhotos:()=>{},preparingPhotos:false,onGenerate:()=>{},onOpen:()=>{},inline:true,...extra}));
const submitTag=html=>html.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0];
const textTag=html=>html.match(/<textarea\b[^>]*>/)?.[0];

// Real draft/decoder functions are composed in the same order as the UI's async
// upload path; the deferred decoder reproduces typing while a file is prepared.
test('typing survives an async multi-photo batch and a second batch preserves all earlier references',async()=>{
 let current={prompt:'Make the Skymark',photos:[]};const gate=deferred();
 const pending=preparePhotoAttachments([file(1),file(2)],()=>current.photos,async f=>{await gate.promise;return photo(f.name.includes('1')?1:2);});
 current={...current,prompt:'Make the Skymark, my apartment building. Keep its curved facade.'};gate.resolve();
 current=addIdeaPhotos(current,await pending);
 assert.equal(current.prompt,'Make the Skymark, my apartment building. Keep its curved facade.');assert.deepEqual(current.photos,[photo(1),photo(2)]);
 const second=await preparePhotoAttachments([file(3)],()=>current.photos,async()=>photo(3));current=addIdeaPhotos(current,second);
 assert.deepEqual(current.photos,[photo(1),photo(2),photo(3)]);
 for(const mode of [{inline:true},{inline:false,compact:true}]){
  const html=render(current,mode);assert.ok(html.includes(current.prompt));assert.equal((html.match(/alt="Reference photo \d+ for your idea"/g)||[]).length,3);assert.doesNotMatch(submitTag(html),/disabled/);
 }
});

test('the main composer exposes direct multiple attachments alongside retained text without a dialog',()=>{
 const draft={prompt:'A detailed red castle with two towers',photos:[photo(1),photo(2)]},html=render(draft);
 assert.match(html,/<textarea\b/);assert.ok(html.includes(draft.prompt));
 const input=html.match(/<input\b[^>]*type="file"[^>]*>/)?.[0];assert.ok(input);assert.match(input,/\bmultiple=""/);assert.match(input,/accept="image\/jpeg,image\/png,image\/webp"/);
 assert.match(input,/aria-label="Attach reference photos"/);assert.match(html,/Add photos/);assert.match(html,/Remove reference photo 1/);assert.match(html,/Remove reference photo 2/);
 assert.doesNotMatch(html,/role="dialog"|aria-modal="true"/);assert.doesNotMatch(submitTag(html),/disabled/);
});

test('photos-only ideas can continue while blank and incomplete text stay blocked',()=>{
 for(const draft of [{prompt:'',photos:[]},{prompt:'  ',photos:[]},{prompt:'hi',photos:[]}]){assert.equal(canSubmitIdea(draft),false);assert.match(submitTag(render(draft)),/disabled/);}
 const photosOnly={prompt:' \n ',photos:[photo(1)]};assert.equal(canSubmitIdea(photosOnly),true);assert.doesNotMatch(submitTag(render(photosOnly)),/disabled/);
 assert.deepEqual(ideaForGeneration(photosOnly),{prompt:PHOTO_IDEA,photos:[photo(1)]});
 const exact={prompt:'  My building: keep SKYMARK on the front.\nUse the attached angles.  ',photos:[photo(1),photo(2)]};
 assert.deepEqual(ideaForGeneration(exact),exact,'submission must preserve the user wording and all evidence');
});

test('photo preparation blocks submission and repeated uploads while leaving the idea editable',()=>{
 const html=render({prompt:'A castle',photos:[photo(1)]},{preparingPhotos:true});
 assert.match(submitTag(html),/disabled/);assert.doesNotMatch(textTag(html),/disabled/);
 const input=html.match(/<input\b[^>]*type="file"[^>]*>/)?.[0];assert.match(input,/disabled/);
 const full=render({prompt:'A castle',photos:[1,2,3,4].map(photo)});assert.match(full,/All four photos added/);assert.doesNotMatch(submitTag(full),/disabled/);assert.equal((full.match(/aria-label="Remove reference photo \d+"/g)||[]).length,4);
});

test('batch completion rereads current attachments and rejects a newly exceeded cap atomically',async()=>{
 let photos=[photo(1)];const duplicates=await preparePhotoAttachments([file(2)],()=>photos,async()=>{photos=[photo(1),photo(2)];return photo(2);});assert.deepEqual(duplicates,[]);
 photos=[photo(1),photo(2)];const gate=deferred();let decoded=0;
 const pending=preparePhotoAttachments([file(3),file(4)],()=>photos,async()=>{await gate.promise;return photo(++decoded+2);});
 photos=[photo(1),photo(2),photo(5)];gate.resolve();await assert.rejects(pending,/up to 4 photos/);assert.deepEqual(photos,[photo(1),photo(2),photo(5)]);
});

test('invalid batches fail before decoding and failed decoding never returns partial attachments',async()=>{
 let decoded=0;const decode=async()=>{decoded++;return photo(1);};
 await assert.rejects(preparePhotoAttachments([new File(['x'],'notes.txt',{type:'text/plain'})],()=>[],decode),/JPG, PNG or WebP/);
 await assert.rejects(preparePhotoAttachments([{name:'huge.jpg',type:'image/jpeg',size:10*1024*1024+1}],()=>[],decode),/10 MB/);
 await assert.rejects(preparePhotoAttachments([file(1),file(2)],()=>[photo(3),photo(4),photo(5)],decode),/up to 4 photos/);assert.equal(decoded,0);
 const existing=[photo(1)];await assert.rejects(preparePhotoAttachments([file(2),file(3)],()=>existing,async()=>{if(decoded++)throw Error('bad image');return photo(2);}),/bad image/);assert.deepEqual(existing,[photo(1)]);
});

test('an unmounted upload cannot finish or proceed into another decode',async()=>{
 let active=true,decoded=0;const gate=deferred(),pending=preparePhotoAttachments([file(1),file(2)],()=>[],async()=>{decoded++;await gate.promise;return photo(1);},()=>active);
 active=false;gate.resolve();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(decoded,1);
});

test('switching between expanded and main composers keeps the shared text and removable photos',()=>{
 const returned={prompt:'  My home, with the side entrance and the original sign.  ',photos:[photo(2),photo(4)]},snapshot=structuredClone(returned);
 const before=render(returned,{inline:false,compact:true}),after=render(returned,{inline:true});
 for(const html of [before,after]){assert.ok(html.includes(returned.prompt));assert.ok(html.includes(photo(2)));assert.ok(html.includes(photo(4)));assert.match(html,/Remove reference photo 2/);}
 assert.deepEqual(returned,snapshot,'rendering another composer must not consume or reset its shared draft');
});
