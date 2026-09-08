import {compileScene} from "@/lib/generated-scene";
import {enforceLocks} from "@/lib/design-project";
self.onmessage=(event:MessageEvent)=>{const {id,scene,manual,hollow,previous,locked}=event.data;try{if(previous&&locked?.length)enforceLocks(previous,scene,locked,{manual,hollow});self.postMessage({id,model:compileScene(scene,{manual,hollow})});}catch(e){self.postMessage({id,error:e instanceof Error?e.message:"Unable to assemble this draft."});}};
