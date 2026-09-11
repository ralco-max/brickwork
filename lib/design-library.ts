import {projectJSON,emptyShopping,contextSchema} from "./design-project";
import type {ShoppingState} from "./design-project";
import {validateProject,finishModel} from "./models";
import {validateScene,compileScene} from "./generated-scene";
import type {BuildModel} from "./models";

// Designs and in-progress drafts are kept in this browser so backing out of the
// studio or the creation dialog never loses work. Nothing is sent to a server.
export type SavedDesign={id:string;name:string;description:string;pieceCount:number;status:"draft"|"design";updatedAt:string;project:string};
const DB="brickwork",STORE="designs",KEEP=12;
export const newDesignId=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`design-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

export function packDesign(model:BuildModel&{shopping?:ShoppingState},status:SavedDesign["status"]):SavedDesign{
 if(!model.libraryId)throw Error("A saved design needs a library id.");
 return {id:model.libraryId,name:model.name,description:model.description,pieceCount:model.pieces.length,status,updatedAt:new Date().toISOString(),project:projectJSON(model,model.shopping||emptyShopping())};
}
// A full project restores the AI scene, brief and history. If a later packer
// version no longer reproduces the saved bricks exactly, the bricks alone are kept.
export function unpackDesign(saved:SavedDesign):BuildModel{
 const data=JSON.parse(saved.project) as Record<string,unknown>;
 let model:BuildModel;
 try{model=validateProject(data);}
 catch{
  // The packer has changed since this was saved. Rebuild the bricks from the scene so the
  // design keeps its brief, history and scene for revisions; fall back to the bricks alone.
  try{
   const generation=validateScene(data.generation),design=data.design?contextSchema.parse(data.design) as BuildModel["design"]:undefined;
   const rebuilt=compileScene(generation,{manual:design?.manual,hollow:design?.brief.hollow,smooth:design?.brief.finish==="smooth"});
   model=finishModel(rebuilt.pieces,{name:String(data.name||saved.name),description:String(data.description||rebuilt.description),source:"custom",generation,design:design?{...design,reviewStale:true}:undefined,detail:design?.brief.size});
  }catch{model=validateProject({...data,version:undefined,generation:undefined,design:undefined});}
 }
 return {...model,name:saved.name,libraryId:saved.id};
}

function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(Error("Design storage is unavailable."));return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:"id"});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function run<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(STORE,mode),request=work(transaction.objectStore(STORE));
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  transaction.oncomplete=()=>db.close();transaction.onerror=()=>{db.close();reject(transaction.error);};
 });
}
export async function listDesigns():Promise<SavedDesign[]>{
 try{const all=await run("readonly",store=>store.getAll() as IDBRequest<SavedDesign[]>);return all.filter(d=>d&&typeof d.project==="string").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 catch{return [];}
}
export async function saveDesign(design:SavedDesign):Promise<void>{
 try{await run("readwrite",store=>store.put(design));const all=await listDesigns();for(const old of all.slice(KEEP))await deleteDesign(old.id);}
 catch{/* Storage may be blocked in private windows; the session keeps working. */}
}
export async function deleteDesign(id:string):Promise<void>{
 try{await run("readwrite",store=>store.delete(id));}catch{/* nothing to remove */}
}
