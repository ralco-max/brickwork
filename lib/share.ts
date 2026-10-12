import {validateProject} from "./models";
import {referenceKey} from "./design-project";
import type {DesignBrief} from "./design-project";

// Unlisted public links: anyone with the URL can view and remix, nothing is indexed.
export const SHARE_ID=/^[A-Za-z0-9]{10}$/;
export const MAX_SHARE_PROJECT_CHARS=1_400_000,MAX_SHARE_IMAGE_CHARS=600_000,MAX_SHARE_BODY_BYTES=6_000_000,SHARES_PER_HOUR=20;
export const SHARE_IMAGE_WIDTH=1200,SHARE_IMAGE_HEIGHT=630;
const ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export type ShareDatabase={prepare:(sql:string)=>{bind:(...values:unknown[])=>{run:()=>Promise<unknown>;first:<T=Record<string,unknown>>()=>Promise<T|null>}}};
export type ShareRecord={id:string;name:string;description:string;pieceCount:number;project:string;image:string};

export function newShareId(){
 const out:string[]=[],bytes=new Uint8Array(20);
 // Rejection sampling keeps every character equally likely.
 while(out.length<10){crypto.getRandomValues(bytes);for(const b of bytes)if(b<ALPHABET.length*4&&out.length<10)out.push(ALPHABET[b%ALPHABET.length]);}
 return out.join("");
}

type Loose=Record<string,unknown>;
const isObject=(v:unknown):v is Loose=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const pick=(source:Loose,keys:readonly string[])=>{const out:Loose={};for(const k of keys)if(source[k]!==undefined)out[k]=source[k];return out;};
const clipWords=(text:string,max:number)=>{if(text.length<=max)return text;const cut=text.lastIndexOf(" ",max-1);return text.slice(0,cut>max/2?cut:max-1).trimEnd()+"…";};

/**
 * Keep the creation, drop anything personal: reference photos, marked areas, identity
 * hints, shopping, and every word the creator typed (the idea, feedback and revision
 * requests; the model's name stands in for the idea). Fields are allowlisted, so ones
 * added later stay private until chosen here. The result must still pass the same
 * validation as an imported project file.
 */
export function sanitizeSharedProject(raw:unknown){
 if(!isObject(raw)||raw.format!=="brickwork")throw Error("Share a Bricks project.");
 const data=structuredClone(pick(raw,["format","version","name","description","pieces","generation","design"]));
 if(isObject(data.design)){
  const design=pick(data.design,["unfinished","reference","brief","manual","locked","revisions","review","reviewStale"]),name=typeof data.name==="string"?data.name.trim().slice(0,80):"";
  if(isObject(design.brief))design.brief={...design.brief,idea:name.length>=3?name:"Shared creation"};
  // The research sheet stays so a remix can reuse it; its key is rebuilt from the shared brief.
  if(isObject(design.reference)){const brief=design.brief as DesignBrief|undefined;design.reference={...pick(design.reference,["sheet"]),briefKey:brief&&typeof brief.idea==="string"&&Array.isArray(brief.features)?referenceKey(brief):""};}
  if(Array.isArray(design.revisions))design.revisions=design.revisions.slice(-20).map(r=>isObject(r)?{request:"",summary:clipWords(String(r.summary??""),280),at:r.at}:r);
  if(isObject(design.review))design.review=pick(design.review,["composition","summary","recognizable","features","improvements"]);
  data.design=design;
 }
 const model=validateProject(data);
 const project=JSON.stringify(data);
 if(project.length>MAX_SHARE_PROJECT_CHARS)throw Error("This creation is too large to share as a link. Export the project file instead.");
 return {project,name:model.name.slice(0,120)||"Untitled creation",description:(model.description||"").slice(0,300),pieceCount:model.pieces.length};
}

// A real 1200×630 JPEG, not just a well-formed data URL: anything else would be served as an image from this origin.
export function validShareImage(image:unknown):image is string{
 if(typeof image!=="string"||image.length>MAX_SHARE_IMAGE_CHARS||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image))return false;
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(image.slice(image.indexOf(",")+1)),c=>c.charCodeAt(0));}catch{return false;}
 const size=jpegSize(bytes);return size?.width===SHARE_IMAGE_WIDTH&&size.height===SHARE_IMAGE_HEIGHT;
}

/** The frame size from the first SOFn header, walking the marker segments after SOI. */
export function jpegSize(b:Uint8Array):{width:number;height:number}|null{
 if(b.length<4||b[0]!==0xff||b[1]!==0xd8||b[2]!==0xff)return null;
 for(let i=2;i+3<b.length;){
  if(b[i]!==0xff)return null;
  const marker=b[i+1];
  if(marker===0xff){i++;continue;}
  if(marker===0x01||marker>=0xd0&&marker<=0xd8){i+=2;continue;}
  if(marker===0xd9||marker===0xda)return null;
  const length=b[i+2]<<8|b[i+3];if(length<2)return null;
  if(marker>=0xc0&&marker<=0xcf&&marker!==0xc4&&marker!==0xc8&&marker!==0xcc)return length>=8&&i+8<b.length?{height:b[i+5]<<8|b[i+6],width:b[i+7]<<8|b[i+8]}:null;
  i+=2+length;
 }
 return null;
}

export async function creatorHash(request:Request){
 const ip=request.headers.get("cf-connecting-ip")||"local",day=Math.floor(Date.now()/86_400_000);
 // A daily salt: enough to count recent shares, never a durable IP identifier.
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`bricks-share-${day}:${ip}`));
 return Array.from(new Uint8Array(digest).slice(0,16),b=>b.toString(16).padStart(2,"0")).join("");
}

const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,"0")).join("");
export const sha256=async(text:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
export const newOwnerToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

/**
 * The same creator sharing the same creation again gets its existing link, not another row.
 * A new link comes with an owner token, returned only this once; just its hash is stored.
 */
export async function createShare(db:ShareDatabase,input:Omit<ShareRecord,"id">,creator:string,now=Date.now()):Promise<{id:string;ownerToken?:string}|null>{
 const contentHash=await sha256(input.project);
 const existing=await db.prepare("SELECT id FROM shares WHERE creator_hash = ? AND content_hash = ? LIMIT 1").bind(creator,contentHash).first<{id:string}>();
 if(existing)return {id:existing.id};
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM shares WHERE creator_hash = ? AND created_at > ?").bind(creator,now-3_600_000).first<{n:number}>();
 if((recent?.n??0)>=SHARES_PER_HOUR)return null;
 const ownerToken=newOwnerToken(),ownerHash=await sha256(ownerToken);
 for(let attempt=0;attempt<3;attempt++){
  const id=newShareId();
  try{
   await db.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at,owner_hash,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,input.name,input.description,input.pieceCount,input.project,input.image,creator,now,ownerHash,contentHash).run();
   return {id,ownerToken};
  }catch(error){if(attempt===2)throw error;}
 }
 return null;
}

/** The link's owner token or the gallery admin token removes a share; links from before owner tokens need the admin token. */
export async function deleteShare(db:ShareDatabase,id:string,token:string,adminToken?:string):Promise<"deleted"|"missing"|"forbidden">{
 if(!SHARE_ID.test(id))return "missing";
 const row=await db.prepare("SELECT owner_hash AS ownerHash FROM shares WHERE id = ?").bind(id).first<{ownerHash:string|null}>();
 if(!row)return "missing";
 // Only hashes are compared, so response timing reveals nothing usable about either secret.
 const hash=await sha256(token),admin=Boolean(adminToken)&&hash===await sha256(adminToken||"");
 if(!admin&&row.ownerHash!==hash)return "forbidden";
 await db.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
 return "deleted";
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
