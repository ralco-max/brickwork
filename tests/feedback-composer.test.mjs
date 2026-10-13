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

test('failed design checks are tickable too, with or without a review, and a pass of only them reads as fixing the checks',()=>{
 const issues=['The exact sign “CAFE” is missing from the build.','3 loose parts have nothing under them.'];
 const {suggestions}=reviewSuggestions(review,{issues});
 assert.deepEqual(suggestions.filter(s=>s.kind==='check').map(s=>[s.tag,s.label,s.text]),issues.map(i=>['Check',i,i]),'the issue text is what the designer gets');
 assert.ok(suggestions.findIndex(s=>s.kind==='check')<suggestions.findIndex(s=>s.kind==='fix'),'objective failures come before the reviewer\'s ideas');
 assert.deepEqual(reviewSuggestions(null,{issues:issues.slice(0,1)}).suggestions.map(s=>s.kind),['check'],'no review needed');
 assert.equal(reviewSuggestions(review,{issues:[...issues,issues[0]]}).suggestions.filter(s=>s.kind==='check').length,2,'deduped');
 assert.equal(historyLabel({typed:'',fixes:2,checks:2}),'Fixed the flagged checks');
 assert.equal(historyLabel({typed:'',fixes:3,checks:2}),'Applied 3 suggested changes');
 const {finishStatus}=gen;
 assert.equal(finishStatus(2,true),'2 design checks need a look. They are listed under Suggested fixes.');
 assert.equal(finishStatus(1,false),'1 design check needs a look. It is listed under Suggested fixes.');
 assert.equal(finishStatus(0,true),'Built and checked. Every check passed.');assert.equal(finishStatus(0,false),'Ready for your feedback.');
 // A build that passed with ideas beside it says nothing needs fixing, so the optional ideas never read as fixes.
 assert.equal(finishStatus(0,true,3),'Built and checked: nothing needs fixing. The ideas to improve are optional.');
});

test('Retry is offered only when the review could not see the requested change',()=>{
 const seen=reviewSuggestions({...review,revision:{status:'visible',evidence:'Done.'}},{request:'Add a door'});
 assert.equal(seen.suggestions.some(s=>s.kind==='retry'),false);
 for(const status of ['missing','uncertain']){const {suggestions}=reviewSuggestions({...review,revision:{status,evidence:'The door is faint.'}},{request:'Add a door'});assert.equal(suggestions[0].tag,'Retry');assert.equal(suggestions[0].label,'Add a door','the tag says Retry; the label does not repeat it');assert.equal(isRetryItem(suggestions[0].text),true);}
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
 assert.deepEqual(composerActions({busy:false,queued:false,typed:false,fixes:2}),{submit:'Apply 2 changes',submitDisabled:false});
 assert.equal(composerActions({busy:false,queued:false,typed:false,fixes:1}).submit,'Apply 1 change');
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
 assert.equal(historyLabel({typed:'',fixes:2}),'Applied 2 suggested changes');assert.equal(historyLabel({typed:'',fixes:1}),'Applied 1 suggested change');
 assert.equal(historyLabel({typed:'',retry:'Add a door'}),'Retried: Add a door');assert.equal(historyLabel({typed:'',restored:3}),'Went back to v3');
 assert.equal(historyLabel({typed:''}),'Fixed the flagged checks');
 for(const label of [historyLabel({typed:'',sign:true}),historyLabel({typed:'',continuing:true}),historyLabel({typed:'',photos:true})])assert.doesNotMatch(label,/Sol|GPT|Astra|gpt-/);
 assert.equal(queue.queuedLabel({text:'Make the people wave'}),'Make the people wave');
 assert.equal(queue.queuedLabel({text:'',approved:['a','b']}),'Apply 2 suggested changes');
 assert.equal(queue.queuedLabel({text:'',region:{components:['VaultBands']}},c=>c==='VaultBands'?'Vault bands':c),'Change the vault bands');
});

test('the thinking panel reads as prose: no schema fragments or markdown markers',()=>{
 assert.equal(plainThought('**Planning** the awning as stepped plates. {"kind":"box"} keeps the "sh": front clear.'),'Planning the awning as stepped plates. keeps the front clear.');
});

test('review suggestions render as tickable checklist rows; a Simplified row is one checkbox, not a link',()=>{
 const {suggestions,looksRight}=reviewSuggestions(review,{notes:['Windows implied by colour']});
 const html=renderToStaticMarkup(h(chips.default,{suggestions,looksRight,approved:[suggestions[0].text],onToggle:()=>{}}));
 assert.match(html,/<h3 id="review-suggestions-title">Suggested fixes<\/h3>/);
 assert.match(html,/Already there:<\/strong> Red awning · Corner café front/,'not "Looks right", which the build rating uses');
 assert.match(html,/class="review-chip is-missing" aria-pressed="true"[^>]*>.*Front door/);
 assert.equal((html.match(/aria-pressed="false"/g)||[]).length,4,'five rows shown, one ticked');
 assert.match(html,/Show 1 more/);
 assert.equal(renderToStaticMarkup(h(chips.default,{suggestions:[],looksRight:[],approved:[],onToggle:()=>{}})),'');
 const all=renderToStaticMarkup(h(chips.default,{suggestions:suggestions.slice(-1),looksRight:[],approved:[],onToggle:()=>{}}));
 assert.match(all,/<span class="review-chip-tag">Add detail<\/span><span class="review-chip-label">Windows implied by colour<\/span>/,'a simplification is offered as the action a tick takes');
 assert.match(all,/<h3 id="review-suggestions-title">Ideas to improve<\/h3>/,'with only ideas, nothing reads as a fix');
 assert.doesNotMatch(all,/<em>|Improve<\/em>/);
 const retry=reviewSuggestions({...review,revision:{status:'missing',evidence:''}},{request:'Make the people wave'}).suggestions.slice(0,1);
 assert.doesNotMatch(renderToStaticMarkup(h(chips.default,{suggestions:retry,looksRight:[],approved:[],onToggle:()=>{}})),/Retry: /,'the tag is not repeated in the label');
});

test('the result card: request status, the component diff only when something changed, plain labels',()=>{
 const html=renderToStaticMarkup(h(result.default,{pieces:1234,size:'16.0 × 11.2 × 7.7 cm',request:'Add a door',typed:true,revision:{status:'uncertain',evidence:'The door is faint.'},changes:'Changed: Awning · Added: Door',repairNote:'Auto-fixed 2 issues (+$0.09).',corrections:['Moved Person3 off the wall.']}));
 assert.match(html,/1,234 pieces/);assert.match(html,/Your change<\/span>“Add a door”/);assert.match(html,/Hard to tell/);assert.match(html,/The door is faint\./);
 assert.match(html,/<p class="revision-changes">Changed: Awning · Added: Door<\/p>/);assert.match(html,/Auto-fixed 2 issues/);assert.match(html,/Fixed automatically \(1\)/);
 assert.doesNotMatch(html,/shape definitions/);
 const quiet=renderToStaticMarkup(h(result.default,{pieces:73,size:'x',revision:{status:'not_requested',evidence:''},changes:''}));
 assert.doesNotMatch(quiet,/revision-changes|revision-request|revision-note/);
 // "Done" is the toolbar's and the viewer's word; the request badge says what the review saw.
 const done=renderToStaticMarkup(h(result.default,{pieces:73,size:'x',request:'Make it red',typed:true,revision:{status:'visible',evidence:'Red now.'}}));
 assert.match(done,/is-visible/);assert.match(done,/Visible<\/span>/);assert.doesNotMatch(done,/Done/);assert.doesNotMatch(done,/Red now\./,'evidence only when it is not visible');
 // Only the owner's own words are quoted; a pass without words shows its plain label.
 const label=renderToStaticMarkup(h(result.default,{pieces:73,size:'x',request:'Applied 2 suggested fixes',revision:{status:'visible',evidence:''}}));
 assert.match(label,/Last pass<\/span>Applied 2 suggested fixes<\/p>/);assert.doesNotMatch(label,/“/);
});

test('the version strip: true colors by default, Highlight changes on request, Restore is $0, Before/After against the previous one',()=>{
 const versions=[{n:1,label:'First build',pieces:73},{n:2,label:'Make the awning taller',pieces:81},{n:3,label:'Add a door',pieces:107}];
 const props={compare:false,tint:false,onPeek:()=>{},onTint:()=>{},onRestore:()=>{}};
 assert.equal(renderToStaticMarkup(h(strip.default,{...props,versions:versions.slice(0,1),current:1,peek:null})),'');
 const idle=renderToStaticMarkup(h(strip.default,{...props,versions,current:3,peek:null,previous:2}));
 assert.match(idle,/aria-current="true"[^>]*>v3</);assert.match(idle,/Before<\/button><button[^>]*>After/);assert.doesNotMatch(idle,/Restore/);
 // Label in name: each chip's accessible name starts with what it shows.
 assert.match(idle,/aria-label="v3 \(current\): Add a door"[^>]*>v3</);assert.match(idle,/aria-label="v1: First build"/);
 assert.match(idle,/class="revision-tint" aria-pressed="false"[^>]*>.*Highlight changes/);
 const peeking=renderToStaticMarkup(h(strip.default,{...props,versions,current:3,peek:1,previous:2}));
 assert.match(peeking,/Restore v1 · \$0/);assert.match(peeking,/Back to v3/);assert.match(peeking,/First build/);
 assert.doesNotMatch(peeking,/highlighted/,'a peek shows the version as it is');
 assert.match(renderToStaticMarkup(h(strip.default,{...props,tint:true,versions,current:3,peek:1,previous:2})),/changes from v3 highlighted/);
 const after=renderToStaticMarkup(h(strip.default,{...props,compare:true,versions,current:3,peek:null,previous:2}));
 assert.match(after,/After<\/button>/);assert.match(after,/Showing v3, the current version\./);assert.doesNotMatch(after,/highlighted/);
 // An unfinished draft on screen is no version: none is current, and even a single kept version can be restored.
 const unfinished=renderToStaticMarkup(h(strip.default,{...props,versions:versions.slice(0,1),current:null,peek:1}));
 assert.match(unfinished,/Restore v1 · \$0/);assert.match(unfinished,/Back to the draft/);assert.doesNotMatch(unfinished,/aria-current/);
});

test('the generator has one send button, no duplicate feedback controls, and a single Connect & build label',async()=>{
 const src=await readFile(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.equal((src.match(/type="submit"/g)||[]).length,1,'one Send');
 assert.doesNotMatch(src,/creation-feedback-jump|mobile-build-nav|Mark an area on the model|Repair flagged checks|Open in studio|Keep as working draft|shape definitions/);
 assert.match(src,/bricks placed/);assert.match(src,/<BuildRating /);assert.match(src,/autoStart\?:boolean;initialBrief\?:Partial<DesignBrief>/);
 assert.match(src,/region\.sceneKey|sceneKey:revisionSceneKey\(liveScene\)/);
 assert.equal((src.match(/"Connect & build"/g)||[]).length,1);
 assert.match(src,/stopCostNotice\(stopHold\)/);
 // The cost of stopping is announced with Stop itself.
 assert.match(src,/className="creation-stop" aria-describedby=\{stopHold>0\?"stop-hold":undefined\}/);
 // Send stays focusable while it cannot send, and the phone keyboard's return key says what it does.
 assert.match(src,/className="button primary feedback-submit" aria-disabled=\{sendBlocked\|\|undefined\}/);assert.match(src,/enterKeyHint="enter"/);
 // A missing key keeps the exact build it interrupted, not a flag.
 assert.match(src,/deferRun\(reviewOnly\?null:\{fresh,submitted,retrying\}\)/);assert.match(src,/void run\(false,key,p\.fresh,p\.submitted,p\.retrying\)/);
 assert.match(src,/Save & close/);assert.doesNotMatch(src,/>Done<ArrowRight/);
});

test('a retried chip-only fix is offered once, in plain words',()=>{
 const fix='Step the Awning into a true pitched roof using two inward-stepped courses';
 const review={summary:'s',recognizable:true,features:[],improvements:[fix,'Cut two window openings'],revision:{status:'uncertain',evidence:'Hard to see'}};
 const {suggestions}=reviewSuggestions(review,{request:`Apply the approved fixes: ${fix}`});
 const retry=suggestions.find(s=>s.kind==='retry');
 assert.ok(retry&&!/approved fixes/i.test(retry.label),retry?.label);
 assert.equal(suggestions.filter(s=>s.kind==='fix'&&s.text===fix).length,0,'the same fix must not appear twice');
 assert.ok(suggestions.some(s=>s.kind==='fix'&&/window/.test(s.text)));
});

test('a passed build’s ideas never read as fixes, and every paid send shows its price before it is pressed',async()=>{
 const passed={...review,features:review.features.map(f=>({...f,status:'visible'})),rubric:[],improvements:['Step the awning','Cut two window openings']};
 assert.equal(gen.visualPassed(passed),true);
 const {suggestions}=reviewSuggestions(passed,{notes:['Roof simplified to stepped plates']});
 assert.deepEqual(suggestions.map(s=>s.tag),['Fix','Fix','Add detail']);assert.equal(suggest.suggestionsHeading(suggestions),'Ideas to improve');
 assert.equal(suggest.suggestionsHeading([...suggestions,{kind:'check'}]),'Suggested fixes','a failed check is a fix');
 const {composerActions}=gen;
 assert.deepEqual(composerActions({busy:false,queued:false,typed:false,fixes:1,cost:'≈ $0.10'}),{submit:'Apply 1 change · ≈ $0.10',submitDisabled:false});
 assert.equal(composerActions({busy:false,queued:false,typed:true,fixes:0,cost:'≈ $0.10'}).submit,'Send · ≈ $0.10');
 assert.equal(composerActions({busy:false,queued:false,typed:false,fixes:0,cost:'≈ $0.10'}).submit,'Send','a disabled send names no price');
 const cost=await vite.ssrLoadModule('/lib/cost-estimate.ts');
 assert.match(cost.revisionCostLabel('sol_low'),/^≈ \$0\.\d\d$/);assert.ok(cost.revisionCostUsd('sol_low')<cost.revisionCostUsd('sol_medium'));
 assert.ok(cost.revisionCostUsd('sol_low')<cost.buildCostUsd('sol_low'),'a revision costs less than a first build');assert.ok(cost.reviewCostUsd()<cost.revisionCostUsd('sol_low'));
 const src=await readFile(new URL('../app/generator.tsx',import.meta.url),'utf8');
 assert.match(src,/cost:scene\?sendCost:undefined/);assert.match(src,/Review again<span className="menu-cost">\{reviewCostLabel\(\)\}<\/span>/);assert.match(src,/Rebuild bigger…<span className="menu-cost">\{costRangeLabel\(quality\)\}<\/span>/);
 assert.match(src,/Each send is one AI revision, \$\{sendCost\.replace/);
});
