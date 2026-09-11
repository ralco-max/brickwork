import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
if(!process.argv[2])throw Error('Pass a Brickwork project JSON path.');
const bundle=await build({stdin:{contents:'export {validateProject} from "./lib/models";export {designChecks} from "./lib/design-project";export {componentBudget} from "./lib/generated-scene";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {validateProject,designChecks,componentBudget}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const model=validateProject(JSON.parse(await readFile(process.argv[2],'utf8')));
const checks=model.design?designChecks(model,model.design.brief,model.design.reference?.sheet?.target):undefined;
console.log(JSON.stringify({name:model.name,pieces:model.pieces.length,uniquePartColors:model.inventory.length,dimensions:{studsX:model.length,studsZ:model.width,platesY:model.height},scope:model.design?.brief.scope,composition:model.design?.brief.composition,components:model.generation?componentBudget(model.generation,model):undefined,digitalIssues:checks?.issues,review:model.design?.review,referenceSources:model.design?.reference?.sheet?.sources,apiCost:'not available from geometry; retain recorded usage for the run'},null,2));
