import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {DESIGN_EXAMPLES} from "./lib/design-examples";export {compileScene,expandCompactHeader,expandCompactShape,compactShapeSchema} from "./lib/generated-scene";export {defaultBrief,designChecks,projectJSON,emptyShopping,emptyManual} from "./lib/design-project";export {auditModel,SLOPES} from "./lib/bridge";export {validateProject} from "./lib/models";export {sanitizeSharedProject} from "./lib/share";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {DESIGN_EXAMPLES,compileScene,expandCompactHeader,expandCompactShape,compactShapeSchema,defaultBrief,designChecks,projectJSON,emptyShopping,emptyManual,auditModel,SLOPES,validateProject,sanitizeSharedProject}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const full=example=>({...expandCompactHeader(example.scene),shapes:example.scene.sh.map(s=>expandCompactShape(compactShapeSchema.parse(s)))});
// The examples are what the designer imitates, so each must pass the app's own checks as compiled for a brief
// (smooth finish, solid), with slopes and without. The limits are the largest brief so only the build is judged.
const brief={...defaultBrief('Worked example'),maxPieces:4000,maxWidth:80,maxDepth:80,maxHeight:160};

for(const example of DESIGN_EXAMPLES)test(`worked example ${example.id} passes the digital checks`,()=>{
 const scene=full(example);
 for(const slopes of [true,false]){
  const model={...compileScene(scene,{smooth:brief.finish==='smooth',hollow:brief.hollow,slopes}),generation:scene},checks=designChecks(model,brief);
  assert.deepEqual(checks.issues,[],`${example.id} slopes ${slopes}`);assert.equal(checks.audit.groups,1);
 }
});

test('every example caption is one sentence of at most 160 characters',()=>{
 for(const {id,scene} of DESIGN_EXAMPLES){
  assert.ok(scene.d.length>0&&scene.d.length<=160,`${id}: ${scene.d.length} characters`);
  assert.match(scene.d,/^[A-Z][^.!?]*[.!?]$/,`${id}: one sentence`);
 }
});

test('the minifig shop stays one assembly with slopes on: its display base is not carved',()=>{
 const model=compileScene(full(DESIGN_EXAMPLES.find(e=>e.id==='minifigs')),{smooth:true});
 assert.equal(auditModel(model.pieces).groups,1);assert.equal(model.pieces.filter(p=>SLOPES[p.part]&&p.y<2).length,0);
});

test('projects and share links packed before the base was protected still open; tampered bricks still do not',()=>{
 const box=(id,color,p,s,component=id)=>({id,component,label:id,kind:'box',operation:'add',color,position:{x:p[0],y:p[1],z:p[2]},size:{x:s[0],y:s[1],z:s[2]},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
 // The two-layer base "only slightly larger than the subject" the designer is told to draw: a 1-stud rim.
 const house={catalogVersion:1,name:'House',description:'A small house.',dimensions:{x:20,y:16,z:16},shapes:[box('base','gray',[0,0,0],[20,2,16],'Base'),box('walls','tan',[1,2,1],[18,10,14]),box('roof','red',[1,12,1],[18,2,14])]};
 const brief=defaultBrief('A small house'),options={hollow:brief.hollow,smooth:brief.finish==='smooth'};
 for(const scene of [house,full(DESIGN_EXAMPLES.find(e=>e.id==='minifigs'))]){
  const legacy=compileScene(scene,{...options,carveBase:true}),current=compileScene(scene,options);
  assert.ok(legacy.pieces.some(p=>SLOPES[p.part]&&p.y<2),'the old packing carved the base rim into slopes');assert.ok(!current.pieces.some(p=>SLOPES[p.part]&&p.y<2));
  const json=JSON.parse(projectJSON({...legacy,generation:scene,design:{brief,manual:emptyManual(),locked:[],revisions:[]}},emptyShopping()));
  const imported=validateProject(json);assert.equal(imported.pieces.length,legacy.pieces.length,'the saved bricks are kept exactly');assert.equal(imported.generation.shapes.length,scene.shapes.length);assert.equal(imported.design.brief.idea,brief.idea);
  assert.doesNotThrow(()=>sanitizeSharedProject(json),'an older share link still opens');
  assert.equal(validateProject(JSON.parse(projectJSON({...current,generation:scene,design:{brief,manual:emptyManual(),locked:[],revisions:[]}},emptyShopping()))).pieces.length,current.pieces.length);
  assert.throws(()=>validateProject({...json,pieces:json.pieces.slice(1)}),/do not match the saved bricks/);
 }
});
