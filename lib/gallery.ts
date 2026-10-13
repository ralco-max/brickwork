import {z} from "zod";
import {SHARE_ID,creatorHash,sha256} from "./share";
import {cleanText,moderateName,networkOf} from "./moderation";
import type {SubjectKind} from "./design-research";
import {readReceipt} from "./receipts";
import type {Receipt} from "./receipts";

// The opt-in public gallery and $0 build ratings. Listing reads only the narrow gallery
// table, never a share's project or image. Visitors are told apart only by salted IP hashes.
// SITE_PUBLISHES_PER_HOUR caps new listings from everyone together, so no number of addresses can flood the gallery.
// Ratings older than FEEDBACK_KEEP_DAYS (past the summary's longest window) are pruned as new ones arrive.
export const GALLERY_PAGE=24,PUBLISHES_PER_HOUR=5,SITE_PUBLISHES_PER_HOUR=60,HIDE_AFTER_REPORTS=3,REPORTS_PER_DAY=10,REPORTER_PREFIX=48,REPORTER_V4_PREFIX=24,FEEDBACK_PER_HOUR=30,FEEDBACK_KEEP_DAYS=400,MAX_FEEDBACK_REASON=280,MAX_FEEDBACK_RECEIPTS=12,MAX_GALLERY_BODY_BYTES=1024,MAX_FEEDBACK_BODY_BYTES=8192,HIDDEN_PAGE=50;
export type GallerySort="recent"|"remixed";
export type GalleryItem={id:string;name:string;pieceCount:number;publishedAt:string;remixes:number;imageUrl:string;url:string};
export type GalleryPage={items:GalleryItem[];nextCursor:string|null};

type Statement={bind:(...values:unknown[])=>Statement;run:()=>Promise<{meta?:{changes?:number}}>;first:<T=Record<string,unknown>>()=>Promise<T|null>;all:<T=Record<string,unknown>>()=>Promise<{results:T[]}>};
export type GalleryDatabase={prepare:(sql:string)=>Statement};
export type GalleryEnv={DB?:GalleryDatabase;GALLERY_ADMIN_TOKEN?:string};
type Row={id:string;name:string;pieceCount:number;publishedAt:number;remixes:number};

const changed=(result:{meta?:{changes?:number}})=>Number(result?.meta?.changes||0)>0;
const toItem=(r:Row):GalleryItem=>({id:r.id,name:r.name,pieceCount:Number(r.pieceCount),publishedAt:new Date(Number(r.publishedAt)).toISOString(),remixes:Number(r.remixes),imageUrl:`/api/share/${r.id}/image`,url:`/s/${r.id}`});

// --- Requests ------------------------------------------------------------------------------

/** Writes come from this site's own pages: a foreign Origin or a cross-site fetch is refused. Scripts can still forge both, hence the rate limits. */
export function sameOrigin(request:Request){
 const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
 return (!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin"||site==="none");
}
export const bearer=(request:Request)=>/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization")||"")?.[1];
/** Only hashes are compared, so timing reveals nothing usable about the admin token. */
export async function isAdmin(token:string|undefined,adminToken:string|undefined){return Boolean(token&&adminToken)&&await sha256(token!)===await sha256(adminToken!);}
/** A JSON body read up to `max` bytes; anything longer or malformed throws. */
export async function readJson(request:Request,max:number):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw Error("empty");
 let text="",bytes=0;const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw Error("too large");}text+=decoder.decode(value,{stream:true});}
 return JSON.parse(text+decoder.decode());
}
/**
 * A reporter is their network: an IPv6 /48, the most one household is usually handed, so a home's
 * many addresses count once, and an IPv4 /24, so a handful of neighbouring addresses do too. One hash
 * is salted with the item and kept for good, so a person counts once per build however long they wait;
 * the other is salted with the day, for the daily limit.
 */
export async function reporterKeys(request:Request,shareId:string){
 const network=networkOf(request.headers.get("cf-connecting-ip"),REPORTER_PREFIX,REPORTER_V4_PREFIX),day=Math.floor(Date.now()/86_400_000);
 const [reporter,daily]=await Promise.all([sha256(`bricks-report:${shareId}:${network}`),sha256(`bricks-reporter-${day}:${network}`)]);
 return {reporter:reporter.slice(0,32),daily:daily.slice(0,32)};
}
export type ReporterKeys=Awaited<ReturnType<typeof reporterKeys>>;
export {creatorHash as visitorHash};

// --- Gallery -------------------------------------------------------------------------------

const CURSOR={recent:/^(\d{1,15})\.([A-Za-z0-9]{10})$/,remixed:/^(\d{1,9})\.(\d{1,15})\.([A-Za-z0-9]{10})$/};
export const parseSort=(value:string|null|undefined):GallerySort|null=>!value||value==="recent"?"recent":value==="remixed"?"remixed":null;
export function cursorFor(sort:GallerySort,r:Row){return sort==="recent"?`${r.publishedAt}.${r.id}`:`${r.remixes}.${r.publishedAt}.${r.id}`;}
/** Keyset values from a cursor, or null when it is malformed. */
export function parseCursor(sort:GallerySort,cursor:string):(string|number)[]|null{
 const m=CURSOR[sort].exec(cursor);if(!m)return null;
 return m.slice(1).map((v,i,all)=>i===all.length-1?v:Number(v));
}

/**
 * One page of visible items, newest or most remixed first. Ties are broken by id, and the next
 * page starts strictly after the last row's (remixes,) published_at, id, so pages never overlap.
 * Both orders walk an index backwards (idx_gallery_recent, idx_gallery_remixed).
 */
export async function listGallery(db:GalleryDatabase,sort:GallerySort="recent",cursor?:string|null,limit=GALLERY_PAGE):Promise<GalleryPage>{
 const after=cursor?parseCursor(sort,cursor):[];if(!after)throw Error("Invalid cursor.");
 const keys=sort==="recent"?"published_at, share_id":"remixes, published_at, share_id",order=keys.replace(/,|$/g,m=>` DESC${m}`);
 const where=after.length?`AND (${keys}) < (${after.map(()=>"?").join(", ")})`:"";
 const {results}=await db.prepare(`SELECT share_id AS id, name, piece_count AS pieceCount, published_at AS publishedAt, remixes FROM gallery WHERE hidden = 0 AND listed = 1 ${where} ORDER BY ${order} LIMIT ?`).bind(...after,limit+1).all<Row>();
 const rows=results.slice(0,limit);
 return {items:rows.map(toItem),nextCursor:results.length>limit&&rows.length?cursorFor(sort,rows[rows.length-1]):null};
}

// Publishes and reports are logged per daily visitor hash, so unpublishing never frees a slot.
const ACTION_WINDOW={publish:3_600_000,report:86_400_000};
async function recentActions(db:GalleryDatabase,kind:keyof typeof ACTION_WINDOW,visitor:string,now:number){
 return Number((await db.prepare("SELECT COUNT(*) AS n FROM gallery_actions WHERE kind = ? AND visitor_hash = ? AND created_at > ?").bind(kind,visitor,now-ACTION_WINDOW[kind]).first<{n:number}>())?.n??0);
}
async function logAction(db:GalleryDatabase,kind:keyof typeof ACTION_WINDOW,visitor:string,now:number){
 await db.prepare("DELETE FROM gallery_actions WHERE created_at < ?").bind(now-86_400_000).run();
 await db.prepare("INSERT INTO gallery_actions (kind, visitor_hash, created_at) VALUES (?, ?, ?)").bind(kind,visitor,now).run();
}
// An admin's decision is keyed by content so it outlives the link, and also by the build's bricks and its image, so a
// renamed or re-described copy of a removed build is caught too. A newer decision replaces the kind. Reports never
// write one: a hide by reports is provisional until an admin looks.
type BlockSource={contentHash:string|null;buildHash?:string|null;imageHash?:string|null};
const blockKeys=(r:BlockSource)=>[r.contentHash,r.buildHash&&`build:${r.buildHash}`,r.imageHash&&`image:${r.imageHash}`].filter((k):k is string=>Boolean(k));
// The strongest block on a share's content, bricks or image, as a column of a query over shares s.
const blockOf=(content="s.content_hash")=>`(SELECT b.kind FROM gallery_blocks b WHERE b.content_hash IN (${content}, 'build:' || s.build_hash, 'image:' || s.image_hash) ORDER BY b.kind = 'removed' DESC LIMIT 1)`,BLOCK_OF=blockOf();
async function block(db:GalleryDatabase,source:BlockSource,shareId:string,kind:"hidden"|"removed",now:number){
 for(const key of blockKeys(source))await db.prepare("INSERT INTO gallery_blocks (content_hash, share_id, kind, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(content_hash) DO UPDATE SET kind = excluded.kind, share_id = excluded.share_id, created_at = excluded.created_at").bind(key,shareId,kind,now).run();
}

export type PublishResult={status:"published"|"already";item:GalleryItem;hidden:boolean;replaced?:string}|{status:"missing"|"forbidden"|"removed"|"preset"|"duplicate"|"copy"|"limited"|"busy"}|{status:"blocked";message:string};
/** An earlier listed link of the same build, by its owner token: publishing the new one takes its place. */
export type ReplacedListing={shareId:string;token:string};
type ShareForGallery={name:string;pieceCount:number;ownerHash:string|null;contentHash:string|null;edited:unknown;generation:string|null;listed:number|null;hidden:number|null;publishedAt:number|null;remixes:number|null;block:"hidden"|"removed"|null};

/**
 * Publish a share with its owner token. Only builds that are the creator's own go in: an
 * untouched preset (no AI scene, never edited) is refused, as are blocked names, content
 * already in the gallery, an unchanged copy of someone's earlier link, content an admin
 * removed (also under another name or caption), a sixth publish within the hour, and new
 * listings past the site-wide hourly cap. Relisting an unpublished build brings it back where it
 * was, with its remixes, and still hidden if moderation hid it. With `replaces` (an earlier listed
 * version of the same build and its owner token) the new link takes that one's place: the old card
 * is unlisted and its remixes and any moderation hide move to the new one.
 */
export async function publishShare(db:GalleryDatabase,shareId:string,token:string,publisher:string,now=Date.now(),replaces?:ReplacedListing):Promise<PublishResult>{
 if(!SHARE_ID.test(shareId))return {status:"missing"};
 // The scene and edit mark are read inside the database; the project itself never leaves it.
 const share=await db.prepare(`SELECT s.name, s.piece_count AS pieceCount, s.owner_hash AS ownerHash, s.content_hash AS contentHash, json_extract(s.project, '$.edited') AS edited, json_type(s.project, '$.generation') AS generation, g.listed, g.hidden, g.published_at AS publishedAt, g.remixes, ${BLOCK_OF} AS block FROM shares s LEFT JOIN gallery g ON g.share_id = s.id WHERE s.id = ?`).bind(shareId).first<ShareForGallery>();
 if(!share)return {status:"missing"};
 // Links from before owner tokens have no owner to prove, so they cannot be published.
 if(!share.ownerHash||!share.contentHash||share.ownerHash!==await sha256(token))return {status:"forbidden"};
 if(share.block==="removed")return {status:"removed"};
 let old:{ownerHash:string|null;listed:number;hidden:number;remixes:number}|null=null;
 if(replaces&&replaces.shareId!==shareId){
  if(!SHARE_ID.test(replaces.shareId))return {status:"forbidden"};
  old=await db.prepare("SELECT s.owner_hash AS ownerHash, g.listed, g.hidden, g.remixes FROM gallery g JOIN shares s ON s.id = g.share_id WHERE g.share_id = ?").bind(replaces.shareId).first<{ownerHash:string|null;listed:number;hidden:number;remixes:number}>();
  if(old&&(!old.ownerHash||old.ownerHash!==await sha256(replaces.token)))return {status:"forbidden"};
 }
 const existing=share.listed!==null&&share.listed!==undefined,item=(name:string)=>toItem({id:shareId,name,pieceCount:share.pieceCount,publishedAt:existing?Number(share.publishedAt):now,remixes:existing?Number(share.remixes):0});
 // The earlier version's card goes, and its remixes and any hide come along (once: the old row keeps none).
 const take=async(result:{status:"published"|"already";item:GalleryItem;hidden:boolean}):Promise<PublishResult>=>{
  if(!old||old.listed!==1||!replaces)return result;
  await db.prepare("UPDATE gallery SET listed = 0, remixes = 0 WHERE share_id = ?").bind(replaces.shareId).run();
  await db.prepare("UPDATE gallery SET remixes = remixes + ?, hidden = MAX(hidden, ?) WHERE share_id = ?").bind(Number(old.remixes),old.hidden===1?1:0,shareId).run();
  return {...result,item:{...result.item,remixes:result.item.remixes+Number(old.remixes)},hidden:result.hidden||old.hidden===1,replaced:replaces.shareId};
 };
 // The name is checked again on a relist, against today's list.
 const name=moderateName(share.name);
 if(share.listed===1)return take({status:"already",item:item(name.ok?name.name:share.name),hidden:share.hidden===1});
 if(!existing&&Number(share.edited)!==1&&(!share.generation||share.generation==="null"))return {status:"preset"};
 if(!name.ok)return {status:"blocked",message:name.message};
 if(!existing){
  if(await db.prepare("SELECT share_id FROM gallery WHERE content_hash = ? AND listed = 1").bind(share.contentHash).first())return {status:"duplicate"};
  // An unchanged copy of an earlier link is that link's creator's build: only they can list it, and they haven't.
  if(await db.prepare("SELECT id FROM shares WHERE content_hash = ? AND created_at < (SELECT created_at FROM shares WHERE id = ?) AND id <> ? LIMIT 1").bind(share.contentHash,shareId,shareId).first())return {status:"copy"};
 }
 if(await recentActions(db,"publish",publisher,now)>=PUBLISHES_PER_HOUR)return {status:"limited"};
 if(Number((await db.prepare("SELECT COUNT(*) AS n FROM gallery_actions WHERE created_at > ? AND kind = 'publish'").bind(now-ACTION_WINDOW.publish).first<{n:number}>())?.n??0)>=SITE_PUBLISHES_PER_HOUR)return {status:"busy"};
 const hidden=share.hidden===1||share.block==="hidden"?1:0;
 // MAX: a relist never un-hides, even racing an admin hide.
 if(existing)await db.prepare("UPDATE gallery SET listed = 1, hidden = MAX(hidden, ?), name = ?, publisher_hash = ? WHERE share_id = ?").bind(hidden,name.name,publisher,shareId).run();
 else try{await db.prepare("INSERT INTO gallery (share_id, name, piece_count, content_hash, publisher_hash, published_at, remixes, reports, hidden, listed) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 1)").bind(shareId,name.name,share.pieceCount,share.contentHash,publisher,now,hidden).run();}
 catch(error){
  // Another publish of the same link or content won the race.
  if(/UNIQUE|constraint/i.test(String(error instanceof Error?error.message:error)))return (await db.prepare("SELECT share_id FROM gallery WHERE share_id = ?").bind(shareId).first())?publishShare(db,shareId,token,publisher,now,replaces):{status:"duplicate"};
  throw error;
 }
 await logAction(db,"publish",publisher,now);
 return take({status:"published",item:item(name.name),hidden:hidden===1});
}

/**
 * Take a build out of the gallery; the link itself stays. The owner's token unlists it, keeping
 * its place, remixes and moderation for a relist. The admin token removes it: its content cannot
 * be listed again, under this link or a new one, until an admin restore.
 */
export async function unpublishShare(db:GalleryDatabase,shareId:string,token:string,adminToken?:string,now=Date.now()):Promise<"removed"|"missing"|"forbidden">{
 if(!SHARE_ID.test(shareId))return "missing";
 const row=await db.prepare("SELECT s.owner_hash AS ownerHash, g.content_hash AS contentHash, s.build_hash AS buildHash, s.image_hash AS imageHash FROM gallery g JOIN shares s ON s.id = g.share_id WHERE g.share_id = ?").bind(shareId).first<{ownerHash:string|null}&BlockSource>();
 if(!row)return "missing";
 if(await isAdmin(token,adminToken)){
  await db.prepare("UPDATE gallery SET listed = 0, hidden = 1 WHERE share_id = ?").bind(shareId).run();
  await block(db,row,shareId,"removed",now);
  return "removed";
 }
 if(!row.ownerHash||row.ownerHash!==await sha256(token))return "forbidden";
 await db.prepare("UPDATE gallery SET listed = 0 WHERE share_id = ?").bind(shareId).run();
 return "removed";
}

/** Whether a link is listed, hidden by moderation, or removed by an admin (and so can't be listed). */
export async function galleryStatus(db:GalleryDatabase,shareId:string){
 const none={published:false,hidden:false,removed:false};
 if(!SHARE_ID.test(shareId))return none;
 const row=await db.prepare(`SELECT g.listed, g.hidden, ${BLOCK_OF} AS block FROM shares s LEFT JOIN gallery g ON g.share_id = s.id WHERE s.id = ?`).bind(shareId).first<{listed:number|null;hidden:number|null;block:string|null}>();
 return row?{published:row.listed===1,hidden:row.hidden===1||row.block==="hidden",removed:row.block==="removed"}:none;
}

/**
 * One report per reporter per listed item, for good, and at most REPORTS_PER_DAY new reports per
 * reporter a day. The third distinct reporter hides the item until an admin looks. The hide stays
 * on that listing (a relist keeps it) but is not a block on the build. Once an admin has restored
 * an item, reports are still counted for the admin's summary but no longer hide it on their own.
 */
export async function reportShare(db:GalleryDatabase,shareId:string,keys:ReporterKeys,now=Date.now()):Promise<{status:"counted"|"repeat"|"limited";hidden:boolean}|null>{
 if(!SHARE_ID.test(shareId))return null;
 const row=await db.prepare("SELECT g.hidden, r.share_id AS reported FROM gallery g LEFT JOIN gallery_reports r ON r.share_id = g.share_id AND r.reporter_hash = ? WHERE g.share_id = ? AND g.listed = 1").bind(keys.reporter,shareId).first<{hidden:number;reported:string|null}>();
 if(!row)return null;
 const was=row.hidden===1;
 if(row.reported)return {status:"repeat",hidden:was};
 if(await recentActions(db,"report",keys.daily,now)>=REPORTS_PER_DAY)return {status:"limited",hidden:was};
 if(!changed(await db.prepare("INSERT OR IGNORE INTO gallery_reports (share_id, reporter_hash, created_at) VALUES (?, ?, ?)").bind(shareId,keys.reporter,now).run()))return {status:"repeat",hidden:was};
 await logAction(db,"report",keys.daily,now);
 const count="(SELECT COUNT(*) FROM gallery_reports WHERE share_id = ?1 AND dismissed = 0)";
 await db.prepare(`UPDATE gallery SET reports = ${count}, hidden = CASE WHEN reviewed = 0 AND ${count} >= ${HIDE_AFTER_REPORTS} THEN 1 ELSE hidden END WHERE share_id = ?1`).bind(shareId).run();
 const hidden=(await db.prepare("SELECT hidden FROM gallery WHERE share_id = ?").bind(shareId).first<{hidden:number}>())?.hidden===1;
 return {status:"counted",hidden};
}

/**
 * Admin only. Hiding sticks through unpublish, relist and a new link to the same build (or a renamed
 * copy of it). Restoring lifts a hide or a removal (the owner can then relist), dismisses the item's
 * reports and marks it reviewed, so reports alone, from anyone, cannot hide it again; they are still
 * counted and listed for the admin. A restore also reaches a new link to a build whose moderated link
 * was deleted.
 */
export async function setHidden(db:GalleryDatabase,shareId:string,hidden:boolean,now=Date.now()):Promise<boolean>{
 if(!SHARE_ID.test(shareId))return false;
 const row=await db.prepare(`SELECT s.content_hash AS contentHash, s.build_hash AS buildHash, s.image_hash AS imageHash, g.share_id AS inGallery, ${BLOCK_OF} AS block FROM shares s LEFT JOIN gallery g ON g.share_id = s.id WHERE s.id = ?`).bind(shareId).first<BlockSource&{inGallery:string|null;block:string|null}>();
 if(!row?.contentHash||!row.inGallery&&(hidden||!row.block))return false;
 if(hidden){
  await db.prepare("UPDATE gallery SET hidden = 1 WHERE share_id = ?").bind(shareId).run();
  await block(db,row,shareId,"hidden",now);
  return true;
 }
 for(const key of blockKeys(row))await db.prepare("DELETE FROM gallery_blocks WHERE content_hash = ?").bind(key).run();
 await db.prepare("UPDATE gallery_reports SET dismissed = 1 WHERE share_id = ?").bind(shareId).run();
 await db.prepare("UPDATE gallery SET hidden = 0, reports = 0, reviewed = 1 WHERE share_id = ?").bind(shareId).run();
 return true;
}

/**
 * A remix counts once per visitor per day (the visitor hash's salt changes daily) and never
 * for the link's own creator or publisher. Rows older than two days can never match again,
 * so each count prunes them for that item.
 */
export async function countRemix(db:GalleryDatabase,shareId:string,visitor:string,now=Date.now()):Promise<{counted:boolean}|null>{
 if(!SHARE_ID.test(shareId))return null;
 const row=await db.prepare("SELECT g.hidden, g.publisher_hash AS publisherHash, s.creator_hash AS creatorHash FROM gallery g JOIN shares s ON s.id = g.share_id WHERE g.share_id = ? AND g.listed = 1").bind(shareId).first<{hidden:number;publisherHash:string;creatorHash:string}>();
 if(!row)return null;
 if(row.hidden===1||visitor===row.publisherHash||visitor===row.creatorHash)return {counted:false};
 await db.prepare("DELETE FROM gallery_remixes WHERE share_id = ? AND created_at < ?").bind(shareId,now-2*86_400_000).run();
 if(!changed(await db.prepare("INSERT OR IGNORE INTO gallery_remixes (share_id, visitor_hash, created_at) VALUES (?, ?, ?)").bind(shareId,visitor,now).run()))return {counted:false};
 await db.prepare("UPDATE gallery SET remixes = remixes + 1 WHERE share_id = ?").bind(shareId).run();
 return {counted:true};
}

// --- Build feedback ------------------------------------------------------------------------

// The research sheet's subject kinds (lib/design-research.ts), plus "other" for builds without one.
export const SUBJECT_KINDS=["building","monument","bridge","site","vehicle","aircraft","ship","animal","plant","character","object","other"] as const satisfies readonly (SubjectKind|"other")[];
export const FEEDBACK_VERDICTS=["good","needs_work"] as const;
export const feedbackSchema=z.object({
 verdict:z.enum(FEEDBACK_VERDICTS),
 reason:z.string().max(MAX_FEEDBACK_REASON*2).optional(),
 // A kind this list doesn't know yet is kept as "other" rather than losing the rating.
 subjectKind:z.string().regex(/^[a-z_]{1,24}$/).transform(kind=>(SUBJECT_KINDS as readonly string[]).includes(kind)?kind as typeof SUBJECT_KINDS[number]:"other").optional(),
 pieceCount:z.number().int().min(0).max(100_000).optional(),
 model:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/).optional(),
 costUsd:z.number().finite().min(0).max(100).optional(),
 // The signed receipts of the paid calls behind the rated build (lib/receipts.ts); model and cost are taken from them.
 receipts:z.array(z.string().max(600)).max(MAX_FEEDBACK_RECEIPTS).optional(),
}).strict();
export type BuildFeedbackInput=z.infer<typeof feedbackSchema>;

/**
 * What a rating's receipts prove: the run it rates (one rating per run: its id is the run's design receipt, or its
 * first one), the model and tier the design ran, and what the run cost. Null when none is genuine and current.
 */
export type FeedbackProof={id:string;model:string|null;costUsd:number};
export async function feedbackProof(secret:string,receipts:readonly string[]|undefined,now=Date.now()):Promise<FeedbackProof|null>{
 const seen=new Map<string,Receipt>();
 for(const token of (receipts||[]).slice(0,MAX_FEEDBACK_RECEIPTS)){const r=await readReceipt(secret,token,now);if(r&&!seen.has(r.id))seen.set(r.id,r);}
 const all=[...seen.values()];if(!all.length)return null;
 const design=all.filter(r=>r.stage==="design").at(-1);
 return {id:`run-${(design||all[0]).id}`,model:design?`${design.model}:${design.tier||"standard"}`.slice(0,48):null,costUsd:Math.round(all.reduce((sum,r)=>sum+r.nanos,0)/1e5)/1e4};
}

/**
 * Store one rating; null when this visitor has rated too often this hour. With proof (the route verified the rating's
 * receipts) the model and cost come from it and the run can be rated once; without, neither is stored.
 */
export async function createFeedback(db:GalleryDatabase,input:BuildFeedbackInput,creator:string,now=Date.now(),proof?:FeedbackProof):Promise<{id:string}|null>{
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM build_feedback WHERE creator_hash = ? AND created_at > ?").bind(creator,now-3_600_000).first<{n:number}>();
 if(Number(recent?.n??0)>=FEEDBACK_PER_HOUR)return null;
 await db.prepare("DELETE FROM build_feedback WHERE created_at < ?").bind(now-FEEDBACK_KEEP_DAYS*86_400_000).run();
 const id=proof?.id||crypto.randomUUID(),reason=cleanText(input.reason,MAX_FEEDBACK_REASON)||null;
 await db.prepare("INSERT OR IGNORE INTO build_feedback (id, verdict, reason, subject_kind, piece_count, model, cost_usd, created_at, creator_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id,input.verdict,reason,input.subjectKind??null,input.pieceCount??null,proof?.model??null,proof?proof.costUsd:null,now,creator).run();
 return {id};
}

type Tally={good:number;needsWork:number};
// gallery.hiddenItems is one page (HIDDEN_PAGE) from hiddenOffset; nextHiddenOffset reads the next. reported: items an
// admin restored that people keep reporting (reports alone no longer hide those).
export type FeedbackSummary={since:string;total:number;verdicts:Tally;byKind:(Tally&{kind:string})[];byModel:(Tally&{model:string;avgCostUsd:number|null})[];recentReasons:{verdict:string;reason:string;subjectKind:string|null;model:string|null;pieceCount:number|null;createdAt:string}[];gallery:{published:number;hidden:number;hiddenItems:{id:string;name:string;reports:number;listed:boolean;removed:boolean}[];nextHiddenOffset:number|null;reported:{id:string;name:string;reports:number}[]}};

/** The owner's view of how builds are going: verdicts by subject kind and model, recent reasons, and what moderation has hidden or removed (restore with PATCH /api/gallery/:id). */
export async function feedbackSummary(db:GalleryDatabase,days=30,now=Date.now(),hiddenOffset=0):Promise<FeedbackSummary>{
 const since=now-days*86_400_000,tally="SUM(verdict = 'good') AS good, SUM(verdict = 'needs_work') AS needsWork";
 const num=(v:unknown)=>Number(v??0);
 const [all,kinds,models,reasons,counts,hidden,reported]=await Promise.all([
  db.prepare(`SELECT COUNT(*) AS total, ${tally} FROM build_feedback WHERE created_at > ?`).bind(since).first<{total:number}&Tally>(),
  db.prepare(`SELECT COALESCE(subject_kind, 'unknown') AS kind, ${tally} FROM build_feedback WHERE created_at > ? GROUP BY kind ORDER BY COUNT(*) DESC LIMIT 20`).bind(since).all<Tally&{kind:string}>(),
  db.prepare(`SELECT COALESCE(model, 'unknown') AS model, ${tally}, AVG(cost_usd) AS avgCostUsd FROM build_feedback WHERE created_at > ? GROUP BY model ORDER BY COUNT(*) DESC LIMIT 20`).bind(since).all<Tally&{model:string;avgCostUsd:number|null}>(),
  db.prepare("SELECT verdict, reason, subject_kind AS subjectKind, model, piece_count AS pieceCount, created_at AS createdAt FROM build_feedback WHERE created_at > ? AND reason IS NOT NULL ORDER BY created_at DESC LIMIT 25").bind(since).all<{verdict:string;reason:string;subjectKind:string|null;model:string|null;pieceCount:number|null;createdAt:number}>(),
  db.prepare("SELECT SUM(listed) AS published, SUM(hidden) AS hidden FROM gallery").bind().first<{published:number|null;hidden:number|null}>(),
  db.prepare(`SELECT g.share_id AS id, g.name, g.reports, g.listed, ${blockOf("g.content_hash")} AS block FROM gallery g JOIN shares s ON s.id = g.share_id WHERE g.hidden = 1 ORDER BY g.published_at DESC, g.share_id DESC LIMIT ? OFFSET ?`).bind(HIDDEN_PAGE+1,Math.max(0,Math.floor(hiddenOffset))).all<{id:string;name:string;reports:number;listed:number;block:string|null}>(),
  db.prepare(`SELECT share_id AS id, name, reports FROM gallery WHERE reviewed = 1 AND hidden = 0 AND listed = 1 AND reports >= ${HIDE_AFTER_REPORTS} ORDER BY reports DESC, published_at DESC LIMIT ${HIDDEN_PAGE}`).bind().all<{id:string;name:string;reports:number}>(),
 ]);
 const hiddenPage=hidden.results.slice(0,HIDDEN_PAGE);
 return {
  since:new Date(since).toISOString(),total:num(all?.total),verdicts:{good:num(all?.good),needsWork:num(all?.needsWork)},
  byKind:kinds.results.map(r=>({kind:r.kind,good:num(r.good),needsWork:num(r.needsWork)})),
  byModel:models.results.map(r=>({model:r.model,good:num(r.good),needsWork:num(r.needsWork),avgCostUsd:r.avgCostUsd===null||r.avgCostUsd===undefined?null:Math.round(Number(r.avgCostUsd)*10_000)/10_000})),
  recentReasons:reasons.results.map(r=>({...r,createdAt:new Date(Number(r.createdAt)).toISOString()})),
  gallery:{published:num(counts?.published),hidden:num(counts?.hidden),hiddenItems:hiddenPage.map(r=>({id:r.id,name:r.name,reports:num(r.reports),listed:r.listed===1,removed:r.block==="removed"})),nextHiddenOffset:hidden.results.length>HIDDEN_PAGE?Math.max(0,Math.floor(hiddenOffset))+HIDDEN_PAGE:null,reported:reported.results.map(r=>({id:r.id,name:r.name,reports:num(r.reports)}))},
 };
}
