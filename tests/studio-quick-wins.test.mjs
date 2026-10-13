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
const [gen,studio,project,models,library,share]=await Promise.all([vite.ssrLoadModule('/app/generator.tsx'),vite.ssrLoadModule('/app/studio.tsx'),vite.ssrLoadModule('/lib/design-project.ts'),vite.ssrLoadModule('/lib/models.ts'),vite.ssrLoadModule('/lib/design-library.ts'),vite.ssrLoadModule('/lib/share.ts')]);
const {defaultBrief}=project,{generateRecipe}=models;
const {briefRecap,detailLabel,composerActions,flaggedCount,retryLabel,revealConnectionKey}=gen;
const idle={busy:false,queued:false,typed:false,fixes:0};

test('the brief recap uses display tier names and never model names',()=>{
 assert.equal(briefRecap(defaultBrief('A red bus')),'Main subject · Detailed · up to 600 pieces');
 assert.equal(briefRecap({...defaultBrief('A plaza'),scope:'site',detail:'balanced',maxPieces:4000,quality:'best'}),'Whole site · Essential · up to 4,000 pieces');
 assert.deepEqual(['balanced','detailed','signature'].map(detailLabel),['Essential','Detailed','Signature']);
 for(const quality of ['sol_low','sol_medium','better','best'])assert.doesNotMatch(briefRecap({...defaultBrief('x'),quality}),/detail detail|Sol|GPT|Astra|Better|Best/);
});

test('an empty composer never offers a paid run: it needs words or ticked fixes (more in feedback-composer.test)',()=>{
 const empty=composerActions(idle);
 assert.equal(empty.submit,'Send');assert.equal(empty.submitDisabled,true);
 assert.deepEqual(composerActions({...idle,fixes:3}),{submit:'Apply 3 fixes',submitDisabled:false});
 assert.equal(composerActions({...idle,typed:true}).submitDisabled,false);
 assert.deepEqual(composerActions({...idle,busy:true}),{submit:'Queue',submitDisabled:true});
 assert.equal(composerActions({...idle,busy:true,queued:true,typed:true}).submit,'Replace queued');
 for(const state of [idle,{...idle,fixes:5},{...idle,busy:true}])assert.doesNotMatch(JSON.stringify(composerActions(state)),/Repair flagged checks|Fix \d+ flagged/);
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

test('landing HUD: caption under the title, Build details below the canvas, no edition badge on a preset',async()=>{
 const html=renderToStaticMarkup(React.createElement(studio.default));
 const preset=generateRecipe('bridge','large');
 assert.ok(html.includes(`<p class="hud-caption">${preset.description}</p>`));
 assert.doesNotMatch(html,/project-badge/);
 assert.doesNotMatch(html,/hud-panel|<details class="hud-details"/);
 assert.match(html,/<button type="button" class="hud-pill hud-details-toggle "[^>]*aria-expanded="false" aria-controls="build-details"/);
 assert.doesNotMatch(html,/id="build-details"/,'the panel only renders when opened');
 // Replay and Reset camera no longer share an icon; with Make a video they sit in a labelled ⋯ menu beside Play.
 assert.match(html,/<button class="view-more" title="More view options" aria-label="More view options"/);
 const studioSrc=await readFile(new URL('../app/studio.tsx',import.meta.url),'utf8');
 assert.match(studioSrc,/<RotateCcw size=\{16\}\/>Replay the assembly<\/DropdownMenuItem>/);assert.match(studioSrc,/<House size=\{16\}\/>Reset camera<\/DropdownMenuItem>/);
 // First run: a click on the demo opens nothing, so the hint promises nothing but orbiting.
 assert.match(html,/Drag to orbit<\/span>/);assert.doesNotMatch(html,/Click to inspect/);
 assert.match(studioSrc,/const stageUp=[^\n]*if\(compactLayout\|\|workspaceOpen\|\|viewing\|\|landing\|\|!start\)return;/);
});

test('one term per concept: tools named for what they hold, one verb for the brick editor, one LDraw label',async()=>{
 const src=await readFile(new URL('../app/studio.tsx',import.meta.url),'utf8');
 assert.match(src,/toolsName=recipeTools\?"Size & colors":"Parts & guide",panelName=recipeTools\?"Size & colors":"Size & cost"/);
 assert.doesNotMatch(src,/"Settings"|>Settings<|"Close settings"|brick editor|Your design, your rules/);
 assert.match(src,/\{editorOpen\?"Done editing":"Edit bricks"\}/);
 assert.equal((src.match(/LDraw model \(\.ldr\)/g)||[]).length,2);assert.doesNotMatch(src,/LDraw model</);
 assert.match(src,/\{costRangeLabel\(t\.id\)\} per build \(estimate\)/);
});

test('Your edition marks AI, converted and edited builds; an untouched preset stays unmarked after save, feature and share',async()=>{
 const {isYourEdition,projectJSON,editModel,emptyShopping}=project,{validateProject,mosaicFromPixels}=models;
 assert.equal(isYourEdition({source:'recipe'}),false);
 assert.equal(isYourEdition({source:'custom'}),false,'every reopened project is "custom", so source alone is not an edit');
 assert.equal(isYourEdition({source:'recipe',generation:{shapes:[]}}),true);assert.equal(isYourEdition({source:'recipe',edited:true}),true);
 for(const source of ['mosaic','mesh'])assert.equal(isYourEdition({source}),true);
 // Designs drawer (Feature this build → reopen) and a share link both go through validateProject.
 const reopen=m=>library.unpackDesign(library.packDesign({...m,libraryId:'d1'},'design'));
 const shared=m=>validateProject(JSON.parse(share.sanitizeSharedProject(JSON.parse(projectJSON(m,emptyShopping()))).project));
 const preset=generateRecipe('cat','small');
 assert.equal(JSON.parse(projectJSON(preset,emptyShopping())).edited,undefined);
 assert.equal(isYourEdition(reopen(preset)),false,'a featured untouched preset reopens without the badge');
 assert.equal(isYourEdition(shared(preset)),false,'someone else\'s untouched preset opens without the badge');
 // Make it yours, a painted brick and a photo mosaic are the user's, and stay so after saving and sharing.
 const recoloured=studio.remakePreset('cat','small','blue','white'),painted=editModel(preset,preset.pieces.map((p,i)=>i?p:{...p,color:'red'})),mosaic=mosaicFromPixels(new Uint8ClampedArray(64).fill(255),4,4,'Snapshot');
 assert.equal(recoloured.source,'recipe');assert.equal(recoloured.recipe,'cat','Make it yours keeps the preset controls');
 for(const m of [recoloured,painted,mosaic]){assert.equal(isYourEdition(m),true);assert.equal(isYourEdition(reopen(m)),true);assert.equal(isYourEdition(shared(m)),true);}
 // A saved design that falls back to its bricks alone (no version, scene or brief) keeps the mark.
 assert.equal(isYourEdition(validateProject({...JSON.parse(projectJSON(painted,emptyShopping())),version:undefined})),true);
 const src=await readFile(new URL('../app/studio.tsx',import.meta.url),'utf8');
 assert.match(src,/const regenerate=[^\n]*remakePreset\(model\.recipe,/);assert.match(src,/const update=[^\n]*record\(remakePreset\("bridge",/);
});

test('the build guide starts at its first stage and the phone keeps the Create label',async()=>{
 const src=await readFile(new URL('../app/studio.tsx',import.meta.url),'utf8'),css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(src,/\[stage,setStage\]=useState\(0\)/);
 assert.doesNotMatch(src,/setStage\(creation\.model\.stages\.length-1\)/);
 assert.doesNotMatch(css,/quick-create-field button\[type=submit\] span\{display:none\}/);
 assert.doesNotMatch(css,/\.hud-panel\{position:absolute/);
 assert.match(css,/\.build-details\{/);
});
