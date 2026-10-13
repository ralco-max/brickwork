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
const [suggest,workflow,queue,gen,chips,result,strip]=await Promise.all(['/lib/feedback-suggestions.ts','/lib/design-workflow.ts','/lib/feedback-queue.ts','/app/generator.tsx','/app/review-suggestions.tsx','/app/revision-result.tsx','/app/revision-strip.tsx'].map(p=>vite.ssrLoadModule(p)));
const {reviewSuggestions,isRetryItem,quickRequest,QUICK_ACTIONS,historyLabel,plainThought}=suggest;
const h=React.createElement;
const review={summary:'A recognizable café.',recognizable:true,revision:{status:'not_requested',evidence:''},features:[{feature:'Red awning',status:'visible',evidence:'Red slab.'},{feature:'Front door',status:'missing',evidence:'No opening.'},{feature:'Three people',status:'uncertain',evidence:'Hard to see.'}],rubric:[{feature:'Corner café front',kind:'signature',status:'visible',evidence:'Seen.'},{feature:'Striped awning',kind:'distinctive',status:'missing',evidence:''}],improvements:['Step the Awning into a pitched roof','Cut two window openings']};

test('suggestions: missing and hard-to-tell features, the review\'s fixes, and what looks right',()=>{
 const {suggestions,looksRight}=reviewSuggestions(review);
 assert.deepEqual(looksRight,['Red awning','Corner café front']);
 assert.deepEqual(suggestions.map(s=>[s.tag,s.label]),[['Missing','Front door'],['Hard to tell','Three people'],['Missing','Striped awning'],['Fix','Step the Awning into a pitched roof'],['Fix','Cut two window openings']]);
 assert.equal(suggestions[0].text,'Front door: No opening.','the same wording as the flagged items, so they dedupe');
 assert.deepEqual(reviewSuggestions(null),{suggestions:[],looksRight:[]});
});

test('Retry is offered only when the review could not see the requested change',()=>{
 const seen=reviewSuggestions({...review,revision:{status:'visible',evidence:'Done.'}},{request:'Add a door'});
 assert.equal(seen.suggestions.some(s=>s.kind==='retry'),false);
 for(const status of ['missing','uncertain']){const {suggestions}=reviewSuggestions({...review,revision:{status,evidence:'The door is faint.'}},{request:'Add a door'});assert.equal(suggestions[0].label,'Retry: Add a door');assert.equal(isRetryItem(suggestions[0].text),true);}
 assert.equal(reviewSuggestions({...review,revision:{status:'missing',evidence:''}}).suggestions.some(s=>s.kind==='retry'),false,'no request, nothing to retry');
});

test('Simplified chips come only from the notes the generator trusts, never from a migrated caption',async()=>{
 const notes=['Train shortened to 1 car'];
 assert.equal(reviewSuggestions(review,{notes}).suggestions.at(-1).label,'Train shortened to 1 car');
 assert.equal(reviewSuggestions(review,{notes}).suggestions.at(-1).text,'Improve this simplification: Train shortened to 1 car');
 assert.equal(reviewSuggestions(review,{}).suggestions.some(s=>s.kind==='simplified'),false);
 // The generator passes notes only for a version a pass produced, not one opened from an older save.
 const src=await readFile(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.match(src,/notes:currentVersion&&!currentVersion\.opened\?scene\?\.notes:undefined/);
});

test('only ticked suggestions reach the designer; unticked improvements are never sent',()=>{
 const {suggestions}=reviewSuggestions(review),ticked=[suggestions[0].text,suggestions[3].text];
 const sent=workflow.approvedFeedback({approved:ticked,repairing:false,review});
 assert.deepEqual(sent,ticked);assert.equal(sent.some(s=>/window openings/.test(s)),false);
 assert.deepEqual(workflow.approvedFeedback({approved:undefined,repairing:false,review}),[],'nothing ticked, nothing approved');
});

test('the composer never offers a paid run without words or ticked fixes',()=>{
 const {composerActions}=gen;
 assert.deepEqual(composerActions({busy:false,queued:false,typed:false,fixes:0}),{submit:'Send',submitDisabled:true});
 assert.deepEqual(composerActions({busy:false,queued:false,typed:false,fixes:2}),{submit:'Apply 2 fixes',submitDisabled:false});
 assert.equal(composerActions({busy:false,queued:false,typed:false,fixes:1}).submit,'Apply 1 fix');
 assert.deepEqual(composerActions({busy:false,queued:false,typed:true,fixes:2}),{submit:'Send',submitDisabled:false});
 assert.deepEqual(composerActions({busy:true,queued:false,typed:true,fixes:0}),{submit:'Queue',submitDisabled:false});
 assert.equal(composerActions({busy:true,queued:true,typed:true,fixes:0}).submit,'Replace queued');
 assert.equal(composerActions({busy:true,queued:false,typed:false,fixes:0}).submitDisabled,true);
});

test('quick changes name the tapped parts; history shows exactly what was typed or a plain label',()=>{
 assert.deepEqual(QUICK_ACTIONS.map(a=>a.label),['Make steeper','Change color','Remove','Add detail']);
 assert.equal(quickRequest('steeper',['Awning']),'Make the awning steeper.');
 assert.equal(quickRequest('remove',['VaultBands','Door']),'Remove the vault bands and the door.');
 assert.equal(quickRequest('color',['Roof']),'Change the color of the roof to ');
 assert.equal(quickRequest('detail',['Cafe']),'Add more detail to the cafe.');
 assert.equal(historyLabel({typed:'  make the roof RED  '}),'make the roof RED');
 assert.equal(historyLabel({typed:'',fixes:2}),'Applied 2 suggested fixes');assert.equal(historyLabel({typed:'',fixes:1}),'Applied 1 suggested fix');
 assert.equal(historyLabel({typed:'',retry:'Add a door'}),'Retried: Add a door');assert.equal(historyLabel({typed:'',restored:3}),'Went back to v3');
 assert.equal(historyLabel({typed:''}),'Fixed the flagged checks');
 for(const label of [historyLabel({typed:'',sign:true}),historyLabel({typed:'',continuing:true}),historyLabel({typed:'',photos:true})])assert.doesNotMatch(label,/Sol|GPT|Astra|gpt-/);
 assert.equal(queue.queuedLabel({text:'Make the people wave'}),'Make the people wave');
 assert.equal(queue.queuedLabel({text:'',approved:['a','b']}),'Apply 2 suggested fixes');
 assert.equal(queue.queuedLabel({text:'',region:{components:['VaultBands']}},c=>c==='VaultBands'?'Vault bands':c),'Change the vault bands');
});

test('the thinking panel reads as prose: no schema fragments or markdown markers',()=>{
 assert.equal(plainThought('**Planning** the awning as stepped plates. {"kind":"box"} keeps the "sh": front clear.'),'Planning the awning as stepped plates. keeps the front clear.');
});

test('review suggestions render as tickable checklist rows with Simplified … — Improve',()=>{
 const {suggestions,looksRight}=reviewSuggestions(review,{notes:['Windows implied by colour']});
 const html=renderToStaticMarkup(h(chips.default,{suggestions,looksRight,approved:[suggestions[0].text],onToggle:()=>{}}));
 assert.match(html,/<h3 id="review-suggestions-title">Suggested fixes<\/h3>/);
 assert.match(html,/Looks right:<\/strong> Red awning · Corner café front/);
 assert.match(html,/class="review-chip is-missing" aria-pressed="true"[^>]*>.*Front door/);
 assert.equal((html.match(/aria-pressed="false"/g)||[]).length,4,'five rows shown, one ticked');
 assert.match(html,/Show 1 more/);
 assert.equal(renderToStaticMarkup(h(chips.default,{suggestions:[],looksRight:[],approved:[],onToggle:()=>{}})),'');
 const all=renderToStaticMarkup(h(chips.default,{suggestions:suggestions.slice(-1),looksRight:[],approved:[],onToggle:()=>{}}));
 assert.match(all,/Windows implied by colour<em> — Improve<\/em>/);
});

test('the result card: request status, the component diff only when something changed, plain labels',()=>{
 const html=renderToStaticMarkup(h(result.default,{pieces:1234,size:'16.0 × 11.2 × 7.7 cm',request:'Add a door',revision:{status:'uncertain',evidence:'The door is faint.'},changes:'Changed: Awning · Added: Door',repairNote:'Auto-fixed 2 issues (+$0.09).',corrections:['Moved Person3 off the wall.']}));
 assert.match(html,/1,234 pieces/);assert.match(html,/Your change<\/span>“Add a door”/);assert.match(html,/Hard to tell/);assert.match(html,/The door is faint\./);
 assert.match(html,/<p class="revision-changes">Changed: Awning · Added: Door<\/p>/);assert.match(html,/Auto-fixed 2 issues/);assert.match(html,/Fixed automatically \(1\)/);
 assert.doesNotMatch(html,/shape definitions/);
 const quiet=renderToStaticMarkup(h(result.default,{pieces:73,size:'x',revision:{status:'not_requested',evidence:''},changes:''}));
 assert.doesNotMatch(quiet,/revision-changes|revision-request|revision-note/);
 const done=renderToStaticMarkup(h(result.default,{pieces:73,size:'x',request:'Make it red',revision:{status:'visible',evidence:'Red now.'}}));
 assert.match(done,/is-visible/);assert.match(done,/Done/);assert.doesNotMatch(done,/Red now\./,'evidence only when it is not done');
});

test('the version strip: hidden for a single version, Restore is $0, Before/After against the previous one',()=>{
 const versions=[{n:1,label:'First build',pieces:73},{n:2,label:'Make the awning taller',pieces:81},{n:3,label:'Add a door',pieces:107}];
 assert.equal(renderToStaticMarkup(h(strip.default,{versions:versions.slice(0,1),current:1,peek:null,changes:false,onPeek:()=>{},onRestore:()=>{}})),'');
 const idle=renderToStaticMarkup(h(strip.default,{versions,current:3,peek:null,changes:false,previous:2,onPeek:()=>{},onRestore:()=>{}}));
 assert.match(idle,/aria-current="true"[^>]*>v3</);assert.match(idle,/Before<\/button><button[^>]*>After/);assert.doesNotMatch(idle,/Restore/);
 const peeking=renderToStaticMarkup(h(strip.default,{versions,current:3,peek:1,changes:true,previous:2,onPeek:()=>{},onRestore:()=>{}}));
 assert.match(peeking,/Restore v1 · \$0/);assert.match(peeking,/Back to v3/);assert.match(peeking,/First build/);
});

test('the generator has one send button, no duplicate feedback controls, and a single Connect & build label',async()=>{
 const src=await readFile(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.equal((src.match(/type="submit"/g)||[]).length,1,'one Send');
 assert.doesNotMatch(src,/creation-feedback-jump|mobile-build-nav|Mark an area on the model|Repair flagged checks|Open in studio|Keep as working draft|shape definitions/);
 assert.match(src,/bricks placed/);assert.match(src,/<BuildRating /);assert.match(src,/autoStart\?:boolean;initialBrief\?:Partial<DesignBrief>/);
 assert.match(src,/region\.sceneKey|sceneKey:revisionSceneKey\(liveScene\)/);
 assert.equal((src.match(/"Connect & build"/g)||[]).length,1);
 assert.match(src,/stopCostNotice\(stopHold\)/);
});
