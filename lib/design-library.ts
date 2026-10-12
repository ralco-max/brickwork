import {projectJSON,emptyShopping,contextSchema} from "./design-project";
import type {ShoppingState} from "./design-project";
import {validateProject,finishModel} from "./models";
import {validateScene,compileScene} from "./generated-scene";
import type {BuildModel} from "./models";

// Designs and in-progress drafts are kept in this browser so backing out of the
// studio or the creation dialog never loses work. Nothing is sent to a server.
export type SavedDesign={id:string;name:string;description:string;pieceCount:number;status:"draft"|"design";updatedAt:string;project:string;featured?:boolean};
const DB="brickwork",VERSION=2,STORE="designs",SHARES="shares",KEEP=12,VIEWED="bricks-viewed-shares",MAX_VIEWED=24;
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
  const request=indexedDB.open(DB,VERSION);
  // Version 2 adds the shares store; existing designs stay in place.
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});if(!db.objectStoreNames.contains(SHARES))db.createObjectStore(SHARES,{keyPath:"projectHash"});};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(request.error);
 });
}
async function run<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>,name=STORE):Promise<T>{
 const db=await open();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(name,mode),request=work(transaction.objectStore(name));
  transaction.oncomplete=()=>{db.close();resolve(request.result);};
  transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error||request.error||Error("Design storage could not be updated."));};
 });
}
export async function listDesigns():Promise<SavedDesign[]>{
 try{const all=await run("readonly",store=>store.getAll() as IDBRequest<SavedDesign[]>);return all.filter(d=>d&&typeof d.project==="string").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 catch{return [];}
}
// Read, update and trim in one transaction so a queued autosave cannot overwrite
// a feature toggle, and another tab cannot feature a design halfway through pruning.
async function updateDesign(id:string,change:(previous:SavedDesign|undefined)=>SavedDesign|undefined):Promise<boolean>{
 try{
  const db=await open();
  return await new Promise<boolean>((resolve,reject)=>{
   const transaction=db.transaction(STORE,"readwrite"),store=transaction.objectStore(STORE),request=store.get(id);
   let saved=false;
   transaction.oncomplete=()=>{db.close();resolve(saved);};
   transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error||Error("Design storage could not be updated."));};
   request.onsuccess=()=>{
    const next=change(request.result as SavedDesign|undefined);if(!next)return;
    store.put(next);saved=true;
    const all=store.getAll() as IDBRequest<SavedDesign[]>;
    all.onsuccess=()=>{
     const recent=all.result.filter(d=>d&&typeof d.project==="string"&&!d.featured).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
     for(const old of recent.slice(KEEP))store.delete(old.id);
    };
   };
  });
 }catch{return false;/* Blocked/private storage must not prevent using the studio. */}
}
export async function saveDesign(design:SavedDesign,options:{featured?:boolean}={}):Promise<boolean>{
 return updateDesign(design.id,previous=>({...design,featured:options.featured??(previous?previous.featured===true:design.featured===true)}));
}
export async function setDesignFeatured(id:string,featured:boolean):Promise<boolean>{
 return updateDesign(id,previous=>previous?{...previous,featured,updatedAt:new Date().toISOString()}:undefined);
}
export async function deleteDesign(id:string):Promise<void>{
 try{await run("readwrite",store=>store.delete(id));}catch{/* nothing to remove */}
}

// A shared link opens as `share-<id>` and is saved only once it differs from the shared
// original, so following links never fills the list or evicts the visitor's own work. An
// edited copy kept from an earlier visit stays as it is; editing again starts another copy.
export type PristineShare={id:string;project:string};
export async function openSharedDesign(shareId:string,shared:BuildModel){
 const stable=`share-${shareId}`,id=(await listDesigns()).some(d=>d.id===stable)?newDesignId():stable,model={...shared,libraryId:id};
 return {model,pristine:{id,project:projectJSON(model,model.shopping||emptyShopping())} as PristineShare};
}
export const unchangedShare=(saved:SavedDesign,pristine:PristineShare|null)=>pristine?.id===saved.id&&pristine.project===saved.project;

// Links this browser created, keyed by the shared content, so re-sharing an unchanged
// creation reuses its link after a reload. The owner token, sent once, can delete the link.
export type SharedLink={projectHash:string;shareId:string;url:string;ownerToken?:string;createdAt:string};
export async function shareProjectHash(model:BuildModel){
 // Shopping never leaves the device, so it does not make a creation a different share.
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(projectJSON(model,emptyShopping())));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function listSharedLinks():Promise<SharedLink[]>{
 try{return (await run("readonly",store=>store.getAll() as IDBRequest<SharedLink[]>,SHARES)).filter(l=>l&&typeof l.shareId==="string"&&typeof l.url==="string");}catch{return [];}
}
export async function findSharedLink(projectHash:string):Promise<SharedLink|undefined>{
 try{return await run("readonly",store=>store.get(projectHash) as IDBRequest<SharedLink|undefined>,SHARES)||undefined;}catch{return undefined;}
}
export async function rememberSharedLink(link:SharedLink):Promise<boolean>{
 // A repeat share of the same content comes back without a token; keep the one already held for that link.
 const ownerToken=link.ownerToken||(await listSharedLinks()).find(l=>l.shareId===link.shareId&&l.ownerToken)?.ownerToken;
 try{await run("readwrite",store=>store.put({...link,...(ownerToken?{ownerToken}:{})}),SHARES);return true;}catch{return false;}
}
export async function forgetSharedLink(shareId:string):Promise<void>{
 for(const link of (await listSharedLinks()).filter(l=>l.shareId===shareId))try{await run("readwrite",store=>store.delete(link.projectHash),SHARES);}catch{/* already gone */}
}

// Shared links opened here, newest first. Kept apart from the designs store and its
// KEEP limit, so following links never evicts the visitor's own work.
export type ViewedShare={id:string;name:string;pieceCount:number;viewedAt:string};
export function viewedShares():ViewedShare[]{
 try{
  const list:unknown=JSON.parse(localStorage.getItem(VIEWED)||"[]");
  return Array.isArray(list)?list.filter((v):v is ViewedShare=>Boolean(v)&&typeof v.id==="string"&&typeof v.name==="string"&&typeof v.pieceCount==="number"&&typeof v.viewedAt==="string").slice(0,MAX_VIEWED):[];
 }catch{return [];}
}
export function rememberViewedShare(share:Omit<ViewedShare,"viewedAt">){
 try{localStorage.setItem(VIEWED,JSON.stringify([{id:share.id,name:share.name.slice(0,80),pieceCount:share.pieceCount,viewedAt:new Date().toISOString()},...viewedShares().filter(v=>v.id!==share.id)].slice(0,MAX_VIEWED)));}
 catch{/* Private or full storage: this history is only a convenience. */}
}
