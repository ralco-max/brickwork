import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/ai-efficiency";export {compactScene,normalizeScene} from "./lib/generated-scene";export {foundationScene} from "./lib/live-arrivals";export {defaultBrief} from "./lib/design-project";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {isLocalDesignEdit,needsFreshResearch,designOutputLimit,reasoningAllowance,lookupOutcome,compactSceneContext,cacheStableContext,compactScene,foundationScene,defaultBrief}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('only complete unambiguous local edits count as local (targeted review)',()=>{
 for(const text of ['Make the roof darker','Please make the building a little taller.','Paint the walls dark blue','Change the color of the windows to black','Make the sign wider!'])assert.equal(isLocalDesignEdit(text),true,text);
 for(const text of ['', 'Actually this is Skymark in Reston','Make the roof darker like the Baltimore monument','Make the roof darker and use a different building','Add the courtyard from this photo','Make the building Washington Monument','Research the roof color','Make the roof the correct color','Use this new layout'])assert.equal(isLocalDesignEdit(text),false,text);
});

test('scene context drops only null object values, preserving geometry and positions',()=>{
 const original=compactScene(foundationScene(defaultBrief('A tower'))),before=JSON.stringify(original),result=compactSceneContext(original);
 assert.ok(JSON.stringify(result).length<before.length);
 function check(a,b){if(Array.isArray(a)){assert.equal(b.length,a.length);a.forEach((v,i)=>check(v,b[i]));}else if(a&&typeof a==='object'){for(const [key,value] of Object.entries(a)){if(value===null)assert.equal(key in b,false);else check(value,b[key]);}}else assert.deepEqual(b,a);}
 check(original,result);assert.equal(JSON.stringify(original),before);
 assert.deepEqual(compactSceneContext({axis:null,position:[0,null,2],flag:false,label:'',zero:0}),{position:[0,null,2],flag:false,label:'',zero:0});
});

test('cache boundaries preserve stable prefixes and all instructions, data and photos',()=>{
 const stable={referenceSheet:{subject:'Skymark',sources:['https://example.org']}};
 const data={...stable,partCatalog:{parts:[{id:'1',colors:['blue']}]},examples:[{about:'tower'}],idea:'Make the roof darker',previous:{sh:[{i:'roof',p:[0,0,0]}]},lockedComponents:['Wall']};
 const request={model:'gpt-6.1-sol',instructions:'Rules '.repeat(1500),input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(data)},{type:'input_image',image_url:'photo',detail:'high'}]}],max_output_tokens:32000,reasoning:{effort:'low'},text:{format:{strict:true}},store:false};
 const before=JSON.stringify(request),cached=cacheStableContext(request);
 assert.equal(cached.instructions,undefined);assert.equal(cached.input[0].role,'developer');assert.equal(cached.input[0].content[0].text,request.instructions);
 assert.deepEqual(cached.prompt_cache_options,{mode:'explicit'});assert.equal(cached.input[1].role,'user');assert.deepEqual(JSON.parse(cached.input[1].content[0].text),stable);
 assert.deepEqual({...JSON.parse(cached.input[1].content[0].text),...JSON.parse(cached.input[2].content[0].text)},data);
 assert.deepEqual(cached.input[2].content[1],request.input[0].content[1]);assert.equal(cached.input[2].content[0].prompt_cache_breakpoint,undefined);
 assert.equal(cached.max_output_tokens,32000);assert.deepEqual(cached.reasoning,request.reasoning);assert.deepEqual(cached.text,request.text);assert.equal(JSON.stringify(request),before);
 const revision=structuredClone(request);revision.input[0].content[0].text=JSON.stringify({...data,idea:'Make the roof taller',partCatalog:{parts:[{id:'2',colors:['red']}]},examples:[{about:'roof'}]});
 assert.deepEqual(cacheStableContext(revision).input.slice(0,2),cached.input.slice(0,2));
 assert.deepEqual(cacheStableContext({...request,model:'unknown'}),{...request,model:'unknown'});
});

test('output ceilings follow the request: every shape on a first build, every given shape on a revision, never above 32k',()=>{
 assert.deepEqual(['none','low','medium',undefined,'high'].map(reasoningAllowance),[2000,6000,12000,12000,16000]);
 assert.equal(designOutputLimit(1,'low',true),27200);assert.equal(designOutputLimit(1,'medium',true),32000);assert.equal(designOutputLimit(1,undefined,true),32000);
 assert.equal(designOutputLimit(20,'low'),14000);assert.equal(designOutputLimit(120,'low'),15600);assert.equal(designOutputLimit(240,'low'),25200);assert.equal(designOutputLimit(240,'medium'),31200);assert.equal(designOutputLimit(240,'high'),32000);
});

test('research is reused unless the feedback names a new identity, and an unready re-lookup falls back to a ready sheet',()=>{
 const sheet={searchable:true,kind:'building',subject:'Skymark tower',summary:'Office tower in Reston.',identity:{status:'confirmed',location:'Reston, Virginia',question:''},contextAdequate:true,length_m:40,width_m:30,height_m:60,proportions:'Tall',colors:[],silhouette:['Slab'],distinctive:['Crown'],sources:['https://example.org'],included:['Tower','Plaza'],layout:'Front faces +z.'};
 assert.equal(needsFreshResearch('Make the Plaza wider',sheet),false);assert.equal(needsFreshResearch('Make the roof darker',sheet),false);
 assert.equal(needsFreshResearch('Actually this is Skymark in Reston',sheet),true);assert.equal(needsFreshResearch('Make the roof darker like the Baltimore monument',sheet),true);
 const unready={...sheet,contextAdequate:false};assert.equal(lookupOutcome(unready,{sheet}),'fallback');assert.equal(lookupOutcome(unready),'ask');assert.equal(lookupOutcome(sheet),'ready');
});
