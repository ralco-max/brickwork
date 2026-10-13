import {compileScene} from "@/lib/generated-scene";
import {enforceLocks} from "@/lib/design-project";
import {addSupports} from "@/lib/scene-repair";
// supports: after a finished design, loose pieces get the studio's vertical support columns, returned as manual bricks
// (support:true) so the saved project recompiles to the same pieces.
self.onmessage=(event:MessageEvent)=>{const {id,scene,manual,hollow,smooth,previous,locked,supports}=event.data;try{if(previous&&locked?.length)enforceLocks(previous,scene,locked,{manual,hollow,smooth});if(supports){const r=addSupports(scene,{manual,hollow,smooth});self.postMessage({id,model:r.model,manual:r.manual,added:r.added});return;}self.postMessage({id,model:compileScene(scene,{manual,hollow,smooth})});}catch(e){self.postMessage({id,error:e instanceof Error?e.message:"Unable to assemble this draft."});}};
