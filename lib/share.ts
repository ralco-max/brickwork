import {validateProject} from "./models";
import {defaultBrief,referenceKey} from "./design-project";
import type {DesignBrief} from "./design-project";
import {splitCaption} from "./generated-scene";
import {clipSentence} from "./utils";
import {networkOf} from "./moderation";

// Unlisted public links: anyone with the URL can view and remix, nothing is indexed.
export const SHARE_ID=/^[A-Za-z0-9]{10}$/;
export const MAX_SHARE_PROJECT_CHARS=1_400_000,MAX_SHARE_IMAGE_CHARS=600_000,MAX_SHARE_BODY_BYTES=6_000_000,SHARES_PER_HOUR=20;
// Site-wide: shares live in the same database as the AI spend ledger, so their growth is capped twice over. New links
// stop once a day's shares reach SHARE_BYTES_PER_DAY, or once the database holds SHARE_STORAGE_LIMIT_BYTES (D1 reports
// its size with each query; the default leaves 2 GB of a 10 GB database for the ledger and the gallery).
export const SHARE_BYTES_PER_DAY=300_000_000,SHARE_STORAGE_LIMIT_BYTES=8_000_000_000;
export const SHARE_IMAGE_WIDTH=1200,SHARE_IMAGE_HEIGHT=630;
const ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export type ShareDatabase={prepare:(sql:string)=>{bind:(...values:unknown[])=>{run:()=>Promise<unknown>;first:<T=Record<string,unknown>>()=>Promise<T|null>;all?:<T=Record<string,unknown>>()=>Promise<{results:T[];meta?:{size_after?:number}}>}}};
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
const BRIEF_SETTINGS=["size","detail","maxPieces","maxWidth","maxDepth","maxHeight","scope","hollow","finish","quality"] as const;
// The research sheet a remix plans and checks from: the subject's measured shape, colours and defining features. Its
// identity, summary, hero and layout text, uncertainties, sources and source images restate the idea, location hint or
// photos that informed it (a lookup by address cites listing pages named after it), so they stay private. Without its
// sources the sheet can no longer vouch for a specific place, so it travels as a generic, non-searchable reference.
const SHEET_SHAPE=["kind","length_m","width_m","height_m","openness","proportions","colors","silhouette","distinctive","minFeature","minFeature_m","target","scaleConflict","plan"] as const;

/**
 * Keep the creation, drop anything personal: reference photos, marked areas, location
 * hints, shopping, and every word the creator typed. The brief keeps only its size, build
 * and quality settings (the model's name stands in for the idea); change requests, their
 * summaries, the review and the builder's private notes go too, since they restate the brief.
 * The research sheet keeps only the subject's shape (SHEET_SHAPE). Fields are allowlisted,
 * so ones added later stay private until chosen here. The result must still pass the same
 * validation as an imported project file. The share dialog's privacy note describes this.
 */
export function sanitizeSharedProject(raw:unknown){
 if(!isObject(raw)||raw.format!=="brickwork")throw Error("Share a Bricks project.");
 const data=structuredClone(pick(raw,["format","version","name","description","edited","pieces","generation","design"]));
 if(isObject(data.design)){
  const design=pick(data.design,["unfinished","reference","brief","manual","locked"]),name=typeof data.name==="string"?data.name.trim().slice(0,80):"";
  // Composition, details, style and sign wording are typed as well; lettering the model shows stays in its bricks.
  if(isObject(design.brief))design.brief={...pick(design.brief,BRIEF_SETTINGS),idea:name.length>=3?name:"Shared creation",features:[],style:defaultBrief().style,composition:""};
  // The research sheet's shape stays so a remix can reuse it, named after the build; its key is rebuilt from the shared brief.
  if(isObject(design.reference)){
   const brief=design.brief as DesignBrief|undefined,sheet=design.reference.sheet;
   design.reference={...(isObject(sheet)?{sheet:{...pick(sheet,SHEET_SHAPE),searchable:false,subject:name.length>=3?name:"Shared creation",summary:"",sources:[]}}:{}),briefKey:brief&&typeof brief.idea==="string"&&Array.isArray(brief.features)?referenceKey(brief):""};
  }
  data.design={...design,revisions:[]};
 }
 // The scene's notes are the builder's private caveats, never shown to the owner, let alone shared.
 if(isObject(data.generation)&&"notes" in data.generation){const scene={...data.generation};delete scene.notes;data.generation=scene;}
 const model=validateProject(data);
 const project=JSON.stringify(data);
 if(project.length>MAX_SHARE_PROJECT_CHARS)throw Error("This creation is too large to share as a link. Export the project file instead.");
 return {project,name:model.name.slice(0,120)||"Untitled creation",description:clipSentence(model.description||"",300),pieceCount:model.pieces.length};
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
 // An IPv6 visitor is their /48 (the most one household is usually handed, as for reports), not each /64 in it.
 const ip=networkOf(request.headers.get("cf-connecting-ip"),48),day=Math.floor(Date.now()/86_400_000);
 // A daily salt: enough to count recent shares, never a durable IP identifier.
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`bricks-share-${day}:${ip}`));
 return Array.from(new Uint8Array(digest).slice(0,16),b=>b.toString(16).padStart(2,"0")).join("");
}

const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,"0")).join("");
export const sha256=async(text:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
export const newOwnerToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

/** The bricks alone, without the name, caption or anything else a copy could change for free; for moderation blocks. */
export function shareBuildKey(project:string){try{const p=JSON.parse(project) as {pieces?:unknown};return JSON.stringify(p.pieces??null);}catch{return project;}}
export type ShareLimits={bytesPerDay?:number;storageBytes?:number};
export type CreatedShare={id:string;ownerToken?:string}|{limited:"creator"|"site"};
/**
 * The same creator sharing the same creation again gets its existing link, not another row.
 * A new link comes with an owner token, returned only this once; just its hash is stored.
 * limited: "creator" after SHARES_PER_HOUR from one visitor, "site" when the day's or the database's share storage is full.
 */
export async function createShare(db:ShareDatabase,input:Omit<ShareRecord,"id">,creator:string,now=Date.now(),limits:ShareLimits={}):Promise<CreatedShare|null>{
 const contentHash=await sha256(input.project);
 const existing=await db.prepare("SELECT id FROM shares WHERE creator_hash = ? AND content_hash = ? LIMIT 1").bind(creator,contentHash).first<{id:string}>();
 if(existing)return {id:existing.id};
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM shares WHERE creator_hash = ? AND created_at > ?").bind(creator,now-3_600_000).first<{n:number}>();
 if((recent?.n??0)>=SHARES_PER_HOUR)return {limited:"creator"};
 const bytes=input.project.length+input.image.length,today=db.prepare("SELECT COALESCE(SUM(bytes),0) AS bytes FROM shares WHERE created_at > ?").bind(now-86_400_000);
 const day=today.all?await today.all<{bytes:number}>():{results:[await today.first<{bytes:number}>()].filter(Boolean) as {bytes:number}[]};
 const size=day.meta?.size_after;
 if(Number(day.results[0]?.bytes??0)+bytes>(limits.bytesPerDay??SHARE_BYTES_PER_DAY)||typeof size==="number"&&size+bytes>(limits.storageBytes??SHARE_STORAGE_LIMIT_BYTES)){
  console.error(JSON.stringify({event:"bricks_share_capacity",dayBytes:Number(day.results[0]?.bytes??0),databaseBytes:size??null}));
  return {limited:"site"};
 }
 const ownerToken=newOwnerToken(),ownerHash=await sha256(ownerToken),buildHash=await sha256(shareBuildKey(input.project)),imageHash=await sha256(input.image);
 for(let attempt=0;attempt<3;attempt++){
  const id=newShareId();
  try{
   await db.prepare("INSERT INTO shares (id,name,description,piece_count,project,image,creator_hash,created_at,owner_hash,content_hash,build_hash,image_hash,bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,input.name,input.description,input.pieceCount,input.project,input.image,creator,now,ownerHash,contentHash,buildHash,imageHash,bytes).run();
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

// Link previews lead with the count, then the caption. Rows saved before the caption contract hold
// up to 300 raw characters cut mid-word, so the caption is re-clipped on read to end on a whole
// sentence or word within about 200 characters overall.
export function shareDescription(summary:{description:string;pieceCount:number}){
 const lead=`${summary.pieceCount.toLocaleString("en-US")}-piece brick model`,caption=clipSentence(splitCaption(String(summary.description||"")).description.replace(/^[\s·•.,;:–—-]+/,""),200-lead.length-3);
 return caption?`${lead} · ${caption}`:`A custom ${lead}, designed with Bricks by Ralc.`;
}
