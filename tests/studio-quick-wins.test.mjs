import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true},logLevel:'error'});
after(()=>vite.close());
const [gen,studio,{defaultBrief},{generateRecipe}]=await Promise.all([vite.ssrLoadModule('/app/generator.tsx'),vite.ssrLoadModule('/app/studio.tsx'),vite.ssrLoadModule('/lib/design-project.ts'),vite.ssrLoadModule('/lib/models.ts')]);
const {briefRecap,detailLabel,composerActions,flaggedCount,retryLabel,revealConnectionKey}=gen;
const idle={busy:false,queued:false,changed:false,typed:false,scene:true,interrupted:false,error:false,flagged:0};

test('the brief recap uses display tier names and never model names',()=>{
 assert.equal(briefRecap(defaultBrief('A red bus')),'Main subject · Detailed · up to 600 pieces');
 assert.equal(briefRecap({...defaultBrief('A plaza'),scope:'site',detail:'balanced',maxPieces:4000,quality:'best'}),'Whole site · Essential · up to 4,000 pieces');
 assert.deepEqual(['balanced','detailed','signature'].map(detailLabel),['Essential','Detailed','Signature']);
 for(const quality of ['sol_low','sol_medium','better','best'])assert.doesNotMatch(briefRecap({...defaultBrief('x'),quality}),/detail detail|Sol|GPT|Astra|Better|Best/);
});

test('an empty composer never offers a paid run; fixes and continues are explicit, labelled actions',()=>{
 const empty=composerActions(idle);
 assert.equal(empty.submit,'Revise build');assert.equal(empty.submitDisabled,true);assert.equal(empty.secondary,'');
 const flagged=composerActions({...idle,flagged:3});
 assert.equal(flagged.submitDisabled,true);assert.equal(flagged.secondary,'Fix 3 flagged issues');
 assert.equal(composerActions({...idle,flagged:1}).secondary,'Fix 1 flagged issue');
 // Typed text (even below the request threshold) or any real change hides the fix shortcut so it never sends a stray draft.
 assert.equal(composerActions({...idle,flagged:2,typed:true}).secondary,'');
 const typed=composerActions({...idle,flagged:2,typed:true,changed:true});assert.equal(typed.submitDisabled,false);assert.equal(typed.secondary,'');
 // A marked area or new photos are explicit requests even without text.
 assert.equal(composerActions({...idle,changed:true}).submitDisabled,false);
 assert.equal(composerActions({...idle,interrupted:true,flagged:4}).secondary,'Continue design');
 assert.equal(composerActions({...idle,interrupted:true,error:true}).secondary,'','the recovery panel already offers Continue design');
 assert.equal(composerActions({...idle,scene:false,flagged:2}).secondary,'');
 assert.deepEqual(composerActions({...idle,busy:true,flagged:2}),{submit:'Queue feedback',submitDisabled:true,secondary:''});
 assert.equal(composerActions({...idle,busy:true,queued:true,changed:true}).submit,'Update queued feedback');
 for(const state of [idle,{...idle,flagged:5},{...idle,interrupted:true},{...idle,busy:true}])assert.doesNotMatch(JSON.stringify(composerActions(state)),/Repair flagged checks/);
});

test('flagged issues count geometry checks plus concrete visual review concerns only',()=>{
 assert.equal(flaggedCount(0,null),0);assert.equal(flaggedCount(2,null),2);
 const review={recognizable:false,summary:'',features:[{feature:'Tower',status:'visible',evidence:''},{feature:'Door',status:'missing',evidence:''},{feature:'Sign',status:'uncertain',evidence:''}],revision:{status:'missing',evidence:''}};
 assert.equal(flaggedCount(1,review),5);
 assert.equal(flaggedCount(0,{...review,recognizable:true,features:review.features.slice(0,1),revision:{status:'not_requested',evidence:''}}),0);
});

test('a missing AI connection points to AI settings, never to a retry that cannot work',()=>{
 assert.equal(retryLabel('AI_NOT_CONNECTED',false,false),'AI settings');assert.equal(retryLabel('AI_AUTH',true,true),'AI settings');
 assert.equal(retryLabel('GENERATION_FAILED',false,false),'Try again');assert.equal(retryLabel('CONNECTION_LOST',true,false),'Continue design');assert.equal(retryLabel('REVIEW_FAILED',false,true),'Retry review');
});

test('Connect & build scrolls the key field into view and focuses it',()=>{
 const calls=[],input={scrollIntoView:o=>calls.push(['scroll',o]),focus:o=>calls.push(['focus',o])};
 assert.equal(revealConnectionKey({getElementById:id=>id==='generation-key'?input:null},false),true);
 assert.deepEqual(calls,[['scroll',{block:'center',behavior:'auto'}],['focus',{preventScroll:true}]]);
 assert.equal(revealConnectionKey({getElementById:()=>null},true),false);
});

test('the generator offers one Connect & build label and keeps the paid repair off the default button',async()=>{
 const src=await readFile(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(src,/Connect to build|Repair flagged checks|Keep as working draft|Get the bricks/);
 assert.match(src,/"Connect & build"/);
 assert.match(src,/setErrorCode\("AI_NOT_CONNECTED"\)/);
});

test('landing HUD: caption under the title, Build details below the canvas, no edition badge on a preset',()=>{
 const html=renderToStaticMarkup(React.createElement(studio.default));
 const preset=generateRecipe('bridge','large');
 assert.ok(html.includes(`<p class="hud-caption">${preset.description}</p>`));
 assert.doesNotMatch(html,/project-badge/);
 assert.doesNotMatch(html,/hud-panel|<details class="hud-details"/);
 assert.match(html,/<button type="button" class="hud-pill hud-details-toggle "[^>]*aria-expanded="false" aria-controls="build-details"/);
 assert.doesNotMatch(html,/id="build-details"/,'the panel only renders when opened');
 // Replay and Reset camera no longer share an icon, and the hint does not repeat the camera help.
 const button=label=>html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>.*?</button>`))?.[0]||'';
 assert.match(button('Replay the assembly from the start'),/lucide-rotate-ccw/);
 assert.match(button('Reset camera'),/lucide-house/);assert.doesNotMatch(button('Reset camera'),/lucide-rotate-ccw/);
 assert.match(html,/Drag to orbit · Click to inspect/);
});

test('Your edition marks AI and edited builds, never untouched presets',()=>{
 assert.equal(studio.isYourEdition({source:'recipe'}),false);
 assert.equal(studio.isYourEdition({source:'recipe',generation:{shapes:[]}}),true);
 for(const source of ['custom','mosaic','mesh'])assert.equal(studio.isYourEdition({source}),true);
});

test('the build guide starts at its first stage and the phone keeps the Create label',async()=>{
 const src=await readFile(new URL('../app/studio.tsx',import.meta.url),'utf8'),css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(src,/\[stage,setStage\]=useState\(0\)/);
 assert.doesNotMatch(src,/setStage\(creation\.model\.stages\.length-1\)/);
 assert.doesNotMatch(css,/quick-create-field button\[type=submit\] span\{display:none\}/);
 assert.doesNotMatch(css,/\.hud-panel\{position:absolute/);
 assert.match(css,/\.build-details\{/);
});
