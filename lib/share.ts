import {validateProject} from "./models";

// Unlisted public links: anyone with the URL can view and remix, nothing is indexed.
export const SHARE_ID=/^[A-Za-z0-9]{10}$/;
export const MAX_SHARE_PROJECT_CHARS=1_400_000,MAX_SHARE_IMAGE_CHARS=600_000,MAX_SHARE_BODY_BYTES=6_000_000,SHARES_PER_HOUR=20;
const ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export type ShareDatabase={prepare:(sql:string)=>{bind:(...values:unknown[])=>{run:()=>Promise<unknown>;first:<T=Record<string,unknown>>()=>Promise<T|null>}}};
export type ShareRecord={id:string;name:string;description:string;pieceCount:number;project:string;image:string};

export function newShareId(){
 const out:string[]=[],bytes=new Uint8Array(20);
 // Rejection sampling keeps every character equally likely.
 while(out.length<10){crypto.getRandomValues(bytes);for(const b of bytes)if(b<ALPHABET.length*4&&out.length<10)out.push(ALPHABET[b%ALPHABET.length]);}
 return out.join("");
}

/**
 * Keep the creation, drop anything personal: reference photos, marked-area
 * screenshots, research identity hints, and shopping (owned bricks, seller quotes).
 * The result must still pass the same validation as an imported project file.
 */
export function sanitizeSharedProject(raw:unknown){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Share a Bricks project.");
 const data=structuredClone(raw) as Record<string,unknown>&{design?:{reviewRegion?:unknown;revisions?:unknown;reference?:Record<string,unknown>}};
 if(data.format!=="brickwork")throw Error("Share a Bricks project.");
 delete data.shopping;
 const design=data.design;
 if(design&&typeof design==="object"&&!Array.isArray(design)){
  delete design.reviewRegion;
  if(design.reference&&typeof design.reference==="object"){delete design.reference.photo;delete design.reference.photos;delete design.reference.identityHint;}
  if(Array.isArray(design.revisions))design.revisions=design.revisions.slice(-20);
 }
 const model=validateProject(data);
 const project=JSON.stringify(data);
 if(project.length>MAX_SHARE_PROJECT_CHARS)throw Error("This creation is too large to share as a link. Export the project file instead.");
 return {project,name:model.name.slice(0,120)||"Untitled creation",description:(model.description||"").slice(0,300),pieceCount:model.pieces.length};
}

export function validShareImage(image:unknown):image is string{
 return typeof image==="string"&&image.length<=MAX_SHARE_IMAGE_CHARS&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image);
}

export async function creatorHash(request:Request){
 const ip=request.headers.get("cf-connecting-ip")||"local",day=Math.floor(Date.now()/86_400_000);
 // A daily salt: enough to count recent shares, never a durable IP identifier.
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`bricks-share-${day}:${ip}`));
 return Array.from(new Uint8Array(digest).slice(0,16),b=>b.toString(16).padStart(2,"0")).join("");
}

export async function createShare(db:ShareDatabase,input:Omit<ShareRecord,"id">,creator:string,now=Date.now()){
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM shares WHERE creator_hash = ? AND created_at > ?").bind(creator,now-3_600_000).first<{n:number}>();
 if((recent?.n??0)>=SHARES_PER_HOUR)return null;
 for(let attempt=0;attempt<3;attempt++){
  const id=newShareId();
  try{
   await db.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id,input.name,input.description,input.pieceCount,input.project,input.image,creator,now).run();
   return id;
  }catch(error){if(attempt===2)throw error;}
 }
 return null;
}

export async function readShareProject(db:ShareDatabase,id:string){
 if(!SHARE_ID.test(id))return null;
 return db.prepare("SELECT id,project FROM shares WHERE id = ?").bind(id).first<Pick<ShareRecord,"id"|"project">>();
}

export async function readShareImage(db:ShareDatabase,id:string){
 if(!SHARE_ID.test(id))return null;
 return db.prepare("SELECT image FROM shares WHERE id = ?").bind(id).first<Pick<ShareRecord,"image">>();
}

export async function readShareSummary(db:ShareDatabase,id:string){
 if(!SHARE_ID.test(id))return null;
 return db.prepare("SELECT id,name,description,piece_count AS pieceCount FROM shares WHERE id = ?").bind(id).first<Omit<ShareRecord,"project"|"image">>();
}

export function shareDescription(summary:{description:string;pieceCount:number}){
 const pieces=`${summary.pieceCount.toLocaleString("en-US")} pieces`;
 return summary.description?`${summary.description} · ${pieces}. Built with Bricks.`:`A custom brick creation with ${pieces}. Built with Bricks.`;
}
