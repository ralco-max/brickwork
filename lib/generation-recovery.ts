import type {GeneratedScene} from "./generated-scene";
import type {BuildModel} from "./models";

// A display foundation by itself is not a custom design. Keep only a compiled
// snapshot with actual subject geometry, and label it unfinished in the UI.
export function canKeepPartial(scene:GeneratedScene,model:BuildModel){
 return scene.shapes.length>=2&&model.pieces.some(piece=>piece.y+piece.h>2);
}
export function continuationPrompt(idea:string,request=""){return `Finish this interrupted design for the original idea: ${idea.slice(0,request?400:1600)}.${request?` Complete the unfinished requested change: ${request.slice(0,1200)}.`:""} The previous scene is an unfinished snapshot. Keep useful existing geometry, add the remaining required features, and return the complete scene.`;}
