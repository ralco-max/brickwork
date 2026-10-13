import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const bundle=await build({entryPoints:['lib/feedback-queue.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {FeedbackQueue,mayClearSubmittedFeedback,retryFailed}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const snapshot=(text='Add the SKYMARK sign',version=1)=>({text,version,references:{photos:['photo-front','photo-side'],identityHint:'My apartment building'}});

test('feedback waits for its whole active run and can start only once',()=>{
 const queue=new FeedbackQueue(),value=snapshot();queue.submit(value,4);
 assert.equal(queue.takeReady(),null,'submitting must not interrupt the active run');
 queue.settle(3,'completed');assert.equal(queue.takeReady(),null,'an earlier completion cannot launch feedback');
 queue.settle(4,'completed');const ready=queue.takeReady();assert.deepEqual(ready.value,value);
 assert.equal(queue.takeReady(),null,'a repeated render cannot spend on a duplicate revision');
 queue.settle(4,'completed');assert.equal(queue.takeReady(),null);
});

test('queued wording and photos are immutable until the user explicitly updates them',()=>{
 const queue=new FeedbackQueue(),draft=snapshot();queue.submit(draft,12);
 draft.text='New words still being typed';draft.references.photos.push('unsubmitted-photo');
 assert.equal(queue.pending.value.text,'Add the SKYMARK sign');assert.equal(queue.pending.value.references.photos.length,2);
 queue.submit(draft,12);queue.settle(12,'completed');assert.deepEqual(queue.takeReady().value,draft);
});

test('failed review, failed generation and Stop pause feedback for explicit resumption',()=>{
 for(const outcome of ['failed','stopped']){
  const queue=new FeedbackQueue();queue.submit(snapshot(),7);queue.settle(7,outcome);
  assert.equal(queue.pending.status,'paused');assert.equal(queue.takeReady(),null);
  queue.settle(7,'completed');assert.equal(queue.takeReady(),null,'late success must not reverse a stop or failure');
  queue.resume();assert.equal(queue.takeReady().value.text,'Add the SKYMARK sign');
 }
 const queue=new FeedbackQueue();queue.submit(snapshot(),8);queue.settle(8,'completed');queue.pause();assert.equal(queue.takeReady(),null,'closing or a budget block can stop ready work');
});

test('editing or canceling queued feedback prevents an automatic next run',()=>{
 const queue=new FeedbackQueue();queue.submit(snapshot(),9);const editable=structuredClone(queue.pending.value);queue.cancel();
 queue.settle(9,'completed');assert.equal(queue.takeReady(),null);assert.equal(editable.references.photos.length,2);
 queue.submit({...editable,text:'Keep the entrance too'},10);queue.settle(10,'completed');assert.equal(queue.takeReady().value.text,'Keep the entrance too');
});

test('a rejected or failed queued start is retained without replacing newer feedback',()=>{
 const queue=new FeedbackQueue();queue.submit(snapshot(),1);queue.settle(1,'completed');const old=queue.takeReady();
 queue.restorePaused(old);assert.equal(queue.pending.status,'paused');assert.equal(queue.takeReady(),null);
 queue.resume();queue.takeReady();queue.submit(snapshot('Newer request',3),2);queue.restorePaused(old);
 assert.equal(queue.pending.value.text,'Newer request');queue.settle(2,'failed');assert.equal(queue.pending.status,'paused');
});

test('completion clears only the submitted composer version and never erases newer typing',()=>{
 assert.equal(mayClearSubmittedFeedback(2,2,false),true);
 assert.equal(mayClearSubmittedFeedback(2,3,false),false);
 assert.equal(mayClearSubmittedFeedback(2,2,true),false,'review-only should leave the draft intact');
});

const region=(sceneKey='scene-v1-old')=>({image:'data:image/jpeg;base64,YQ==',polygon:[{x:.1,y:.1},{x:.6,y:.1},{x:.6,y:.7},{x:.1,y:.7}],components:['Roof'],bounds:{min:{x:2,y:9,z:3},max:{x:8,y:15,z:7}},sceneKey,description:'Raise the circled roof'});
test('a queued region keeps the captured image and scene together while the composer redraws',()=>{
 const queue=new FeedbackQueue(),draft={...snapshot('Raise this roof'),region:region()};queue.submit(draft,21);
 draft.region.image='data:image/jpeg;base64,Yg==';draft.region.polygon[0].x=.9;draft.region.components.push('Tower');draft.region.bounds.min.y=20;draft.region.sceneKey='scene-v1-new';
 queue.settle(21,'completed');const submitted=queue.takeReady().value;
 assert.equal(submitted.region.image,'data:image/jpeg;base64,YQ==');assert.equal(submitted.region.sceneKey,'scene-v1-old');assert.equal(submitted.region.polygon[0].x,.1);assert.deepEqual(submitted.region.components,['Roof']);assert.equal(submitted.region.bounds.min.y,9);
 assert.equal(queue.takeReady(),null,'a repeated completion must not spend on the marked region twice');
});

test('failed queued region edits retain the exact capture without replacing a newer queued selection',()=>{
 const queue=new FeedbackQueue();queue.submit({...snapshot('Raise this roof'),region:region()},31);queue.settle(31,'completed');const submitted=queue.takeReady();
 queue.restorePaused(submitted);assert.equal(queue.takeReady(),null);assert.equal(queue.pending.value.region.sceneKey,'scene-v1-old');
 queue.resume();queue.takeReady();const newer={...snapshot('Shorten this tower',2),region:{...region('scene-v1-new'),components:['Tower']}};queue.submit(newer,32);queue.restorePaused(submitted);
 assert.deepEqual(queue.pending.value,newer);queue.settle(32,'failed');assert.equal(queue.pending.status,'paused');assert.equal(queue.pending.value.region.sceneKey,'scene-v1-new');
 assert.equal(mayClearSubmittedFeedback(submitted.value.version,newer.version,false),false,'an old completion must not clear a newer drawn region');
});

test('Try again after a failed queued pass re-runs that request, not the cleared composer, and drops its paused card',()=>{
 // Queued while a pass ran (the composer was cleared), started, then failed before any shape arrived.
 const queue=new FeedbackQueue(),value=snapshot('Make the roof dark green');queue.submit(value,40);queue.settle(40,'completed');
 const started=queue.takeReady();queue.restorePaused(started);assert.equal(queue.pending.status,'paused');
 assert.deepEqual(retryFailed(queue,started.value,{reviewOnly:false,interrupted:false}),{submitted:value},'the failed request runs again');
 assert.equal(queue.pending,null,'and its card no longer offers to run it a second time');
 // A kept partial finishes with Continue, and a built design retries its review: neither swaps in the snapshot, both drop the card.
 for(const state of [{reviewOnly:false,interrupted:true},{reviewOnly:true,interrupted:false}]){queue.restorePaused(started);assert.deepEqual(retryFailed(queue,started.value,state),{});assert.equal(queue.pending,null);}
 // Newer feedback queued meanwhile is never dropped, and a direct send (no failed snapshot) retries the composer as before.
 const newer=snapshot('Add a chimney',2);queue.submit(newer,41);assert.deepEqual(retryFailed(queue,started.value,{reviewOnly:false,interrupted:false}),{submitted:value});assert.deepEqual(queue.pending.value,newer);
 assert.deepEqual(retryFailed(queue,null,{reviewOnly:false,interrupted:false}),{});assert.deepEqual(queue.pending.value,newer);
 // The generator keeps the failed queued or panel snapshot and retries through retryFailed.
 const gen=readFileSync(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.match(gen,/restoreComposer\(runFeedback\);else if\(submitted&&!reviewOnly\)failedSubmission\.current=submitted;/);
 assert.match(gen,/const \{submitted\}=retryFailed\(feedbackQueue\.current,failed,\{reviewOnly,interrupted\}\);syncQueue\(\);\n  void run\(reviewOnly,undefined,undefined,submitted,true\);/);
});
