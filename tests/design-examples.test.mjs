import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {DESIGN_EXAMPLES} from "./lib/design-examples";export {compileScene,expandCompactHeader,expandCompactShape,compactShapeSchema} from "./lib/generated-scene";export {defaultBrief,designChecks} from "./lib/design-project";export {auditModel,SLOPES} from "./lib/bridge";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {DESIGN_EXAMPLES,compileScene,expandCompactHeader,expandCompactShape,compactShapeSchema,defaultBrief,designChecks,auditModel,SLOPES}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
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
