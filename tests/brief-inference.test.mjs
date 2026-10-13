import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/brief-inference";export * from "./lib/cost-estimate";export * from "./lib/buildability";export {defaultBrief,briefSchema} from "./lib/design-project";export {PHOTO_IDEA} from "./lib/idea-draft";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const pick=(b,keys=['scope','size','maxPieces'])=>Object.fromEntries(keys.map(k=>[k,b[k]]));

test('a one-step Create reads scope and scale from the wording, locally',()=>{
 assert.deepEqual(pick(m.inferBrief('The Golden Gate Bridge',0)),{scope:'subject',size:'medium',maxPieces:600});
 assert.equal(m.inferBrief('my street block with the corner café',0).scope,'site');
 assert.deepEqual(pick(m.inferBrief('a tiny desk cactus',0)),{scope:'subject',size:'small',maxPieces:200});
 assert.deepEqual(pick(m.inferBrief('A huge castle with a moat',0),['size','maxPieces','maxWidth']),{size:'large',maxPieces:4000,maxWidth:80});
 // Photos alone: this subject, on a shelf. Nothing at all infers nothing.
 for(const idea of ['','  ',m.PHOTO_IDEA])assert.deepEqual(pick(m.inferBrief(idea,2)),{scope:'subject',size:'medium',maxPieces:600});
 assert.deepEqual(m.inferBrief('',0),{});
});

test('proper names never read as size or scope cues',()=>{
 for(const idea of ['Big Ben in London','The Little Mermaid statue','Philadelphia City Hall','Grand Central Terminal'])assert.deepEqual(pick(m.inferBrief(idea,0)),{scope:'subject',size:'medium',maxPieces:600},idea);
 assert.equal(m.inferBrief('a big red barn',0).size,'large');
 assert.equal(m.inferBrief('our village square with the church',0).scope,'site');
});

test('an explicit piece count sets the cap and the matching scale; detail follows plain cues',()=>{
 assert.deepEqual(pick(m.inferBrief('A lighthouse, about 250 pieces',0)),{scope:'subject',size:'small',maxPieces:300});
 assert.deepEqual(pick(m.inferBrief('A steam train in 1,200 bricks',0)),{scope:'subject',size:'medium',maxPieces:1200});
 assert.deepEqual(pick(m.inferBrief('A cathedral, 2k pieces',0)),{scope:'subject',size:'large',maxPieces:2000});
 assert.equal(m.inferBrief('A simple blocky robot',0).detail,'balanced');
 assert.equal(m.inferBrief('An intricate clock tower',0).detail,'signature');
 assert.equal(m.inferBrief('A red bus',0).detail,'detailed');
 // Whatever is inferred is a valid brief once merged over the defaults.
 for(const idea of ['a tiny desk cactus','my street block','A cathedral, 20000 pieces','A lighthouse, 5 pieces','The Golden Gate Bridge'])assert.ok(m.briefSchema.safeParse({...m.defaultBrief(idea),...m.inferBrief(idea,0)}).success,idea);
});

test('the chip names the scale and approximate pieces',()=>{
 assert.equal(m.briefChip({...m.defaultBrief('x'),...m.inferBrief('The Golden Gate Bridge',0)}),'Shelf · ~600 pieces');
 assert.equal(m.briefChip({size:'large',maxPieces:4000,scope:'site'}),'Statement · ~4,000 pieces · whole site');
 assert.equal(m.briefChip({size:'small',maxPieces:200}),'Desk · ~200 pieces');
});

test('cost estimates: Everyday is cheaper than Careful, both near the audited figures, shown as ranges',()=>{
 const everyday=m.buildCostUsd('sol_low'),careful=m.buildCostUsd('sol_medium');
 assert.ok(everyday<careful);
 assert.ok(Math.abs(everyday-.27)/.27<=.3,`everyday ${everyday}`);assert.ok(Math.abs(careful-.40)/.40<=.3,`careful ${careful}`);
 // The expensive legacy designer stays far above both.
 assert.ok(m.buildCostUsd('best')>2*careful);assert.ok(m.buildCostUsd('standard')<m.buildCostUsd('better'));
 for(const q of ['sol_low','sol_medium','best']){const [low,high]=m.costRange(q),typical=m.buildCostUsd(q);assert.ok(low<typical&&typical<high,q);assert.equal(Math.round(low*20),low*20);}
 assert.match(m.costRangeLabel('sol_low'),/^≈ \$0\.\d\d–0\.\d\d$/);
 // A repair is a design pass on the chosen tier's model plus the re-check, so its price follows the tier.
 assert.equal(m.repairCostLabel(),'≈ +$0.15');assert.equal(m.repairCostLabel('sol_low'),'≈ +$0.15');
 assert.equal(m.repairCostLabel('sol_medium'),'≈ +$0.25');assert.equal(m.repairCostLabel('best'),'≈ +$0.55');
 assert.ok(m.repairCostUsd('sol_low')<m.repairCostUsd('sol_medium')&&m.repairCostUsd('sol_medium')<m.repairCostUsd('best'));
 assert.ok(m.repairCostUsd('sol_low')<everyday,'a repair costs less than the build it fixes');
 assert.deepEqual(m.OUTCOME_TIERS.map(t=>[t.id,t.name]),[['sol_low','Everyday'],['sol_medium','Careful']]);
 assert.equal(m.isLegacyTier('best'),true);assert.equal(m.isLegacyTier('sol_medium'),false);assert.equal(m.isLegacyTier(undefined),false);
 assert.equal(m.tierName(undefined),'Everyday');assert.equal(m.tierName('best'),'Best');
});

test('a remixed share gets the matching outcome tier, never a hidden legacy designer',()=>{
 assert.deepEqual(['standard','better','best',undefined,'sol_low','sol_medium'].map(m.studioTier),['sol_low','sol_medium','sol_medium','sol_low','sol_low','sol_medium']);
 const brief={...m.defaultBrief('A red bus'),quality:'best'},shared={name:'Bus',design:{brief,manual:{},locked:[],revisions:[]}};
 const remixed=m.withStudioTier(shared);
 assert.equal(remixed.design.brief.quality,'sol_medium');assert.equal(remixed.design.brief.idea,'A red bus');assert.equal(remixed.name,'Bus');
 assert.equal(shared.design.brief.quality,'best','the original is not mutated');
 for(const kept of [{name:'Plain'},{name:'Everyday',design:{brief:{...brief,quality:'sol_low'}}},{name:'Careful',design:{brief:{...brief,quality:'sol_medium'}}},{name:'Default',design:{brief:{...brief,quality:undefined}}}])assert.equal(m.withStudioTier(kept),kept);
});

test('buildability: one plain verdict with the details behind it',()=>{
 assert.deepEqual(m.buildability({overlaps:0,disconnected:[]},{overloaded:[]}),{solid:true,issues:[],label:'Solid ✓'});
 const flagged=m.buildability({overlaps:3,disconnected:[1,2]},{overloaded:[9]});
 assert.equal(flagged.label,'Needs attention (3)');assert.equal(flagged.solid,false);
 assert.deepEqual(flagged.issues,['2 loose pieces','3 overlapping cells','1 joint beyond its clutch']);
 assert.equal(m.buildability({overlaps:0,disconnected:[1]},{overloaded:[]}).label,'Needs attention (1)');
});
