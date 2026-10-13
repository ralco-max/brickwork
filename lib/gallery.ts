import {z} from "zod";
import {SHARE_ID,creatorHash,sha256} from "./share";
import {cleanText,moderateName} from "./moderation";
import type {SubjectKind} from "./design-research";

// The opt-in public gallery and $0 build ratings. Listing reads only the narrow gallery
// table, never a share's project or image. Visitors are told apart only by salted IP hashes.
export const GALLERY_PAGE=24,PUBLISHES_PER_HOUR=5,HIDE_AFTER_REPORTS=3,FEEDBACK_PER_HOUR=30,MAX_FEEDBACK_REASON=280,MAX_GALLERY_BODY_BYTES=1024,MAX_FEEDBACK_BODY_BYTES=2048;
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
/** Reports count once per person per item, for good: the salt is the item, not the day, so one visitor cannot hide a build alone over three days. */
export async function reporterHash(request:Request,shareId:string){return (await sha256(`bricks-report:${shareId}:${request.headers.get("cf-connecting-ip")||"local"}`)).slice(0,32);}
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
 const {results}=await db.prepare(`SELECT share_id AS id, name, piece_count AS pieceCount, published_at AS publishedAt, remixes FROM gallery WHERE hidden = 0 ${where} ORDER BY ${order} LIMIT ?`).bind(...after,limit+1).all<Row>();
 const rows=results.slice(0,limit);
 return {items:rows.map(toItem),nextCursor:results.length>limit&&rows.length?cursorFor(sort,rows[rows.length-1]):null};
}

export type PublishResult={status:"published"|"already";item:GalleryItem;hidden:boolean}|{status:"missing"|"forbidden"|"preset"|"duplicate"|"copy"|"limited"}|{status:"blocked";message:string};

/**
 * Publish a share with its owner token. Only builds that are the creator's own go in: an
 * untouched preset (no AI scene, never edited) is refused, as are blocked names, content
 * already in the gallery, an unchanged copy of someone's earlier link, and a sixth publish
 * within the hour.
 */
export async function publishShare(db:GalleryDatabase,shareId:string,token:string,publisher:string,now=Date.now()):Promise<PublishResult>{
 if(!SHARE_ID.test(shareId))return {status:"missing"};
 // The scene and edit mark are read inside the database; the project itself never leaves it.
 const share=await db.prepare("SELECT id, name, piece_count AS pieceCount, owner_hash AS ownerHash, content_hash AS contentHash, json_extract(project, '$.edited') AS edited, json_type(project, '$.generation') AS generation FROM shares WHERE id = ?").bind(shareId).first<{id:string;name:string;pieceCount:number;ownerHash:string|null;contentHash:string|null;edited:unknown;generation:string|null}>();
 if(!share)return {status:"missing"};
 // Links from before owner tokens have no owner to prove, so they cannot be published.
 if(!share.ownerHash||!share.contentHash||share.ownerHash!==await sha256(token))return {status:"forbidden"};
 const existing=await db.prepare("SELECT share_id AS id, name, piece_count AS pieceCount, published_at AS publishedAt, remixes, hidden FROM gallery WHERE share_id = ?").bind(shareId).first<Row&{hidden:number}>();
 if(existing)return {status:"already",item:toItem(existing),hidden:existing.hidden===1};
 if(Number(share.edited)!==1&&(!share.generation||share.generation==="null"))return {status:"preset"};
 const name=moderateName(share.name);if(!name.ok)return {status:"blocked",message:name.message};
 if(await db.prepare("SELECT share_id FROM gallery WHERE content_hash = ?").bind(share.contentHash).first())return {status:"duplicate"};
 // An unchanged copy of an earlier link is that link's creator's build: only they can list it, and they haven't.
 if(await db.prepare("SELECT id FROM shares WHERE content_hash = ? AND created_at < (SELECT created_at FROM shares WHERE id = ?) AND id <> ? LIMIT 1").bind(share.contentHash,shareId,shareId).first())return {status:"copy"};
 // Counts what is listed now: unpublishing frees a slot, so at most five of a visitor's builds from the last hour are ever up at once.
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM gallery WHERE publisher_hash = ? AND published_at > ?").bind(publisher,now-3_600_000).first<{n:number}>();
 if(Number(recent?.n??0)>=PUBLISHES_PER_HOUR)return {status:"limited"};
 // Reports survive an unpublish, so a hidden build comes back hidden.
 const reports=Number((await db.prepare("SELECT COUNT(*) AS n FROM gallery_reports WHERE share_id = ?").bind(shareId).first<{n:number}>())?.n??0),hidden=reports>=HIDE_AFTER_REPORTS?1:0;
 try{await db.prepare("INSERT INTO gallery (share_id, name, piece_count, content_hash, publisher_hash, published_at, remixes, reports, hidden) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)").bind(shareId,name.name,share.pieceCount,share.contentHash,publisher,now,reports,hidden).run();}
 catch(error){
  // Another publish of the same link or content won the race.
  if(/UNIQUE|constraint/i.test(String(error instanceof Error?error.message:error)))return (await db.prepare("SELECT share_id FROM gallery WHERE share_id = ?").bind(shareId).first())?publishShare(db,shareId,token,publisher,now):{status:"duplicate"};
  throw error;
 }
 return {status:"published",item:toItem({id:shareId,name:name.name,pieceCount:share.pieceCount,publishedAt:now,remixes:0}),hidden:hidden===1};
}

/** Take a build out of the gallery with its link's owner token or the admin token. The link itself stays. */
export async function unpublishShare(db:GalleryDatabase,shareId:string,token:string,adminToken?:string):Promise<"removed"|"missing"|"forbidden">{
 if(!SHARE_ID.test(shareId))return "missing";
 const row=await db.prepare("SELECT s.owner_hash AS ownerHash FROM gallery g JOIN shares s ON s.id = g.share_id WHERE g.share_id = ?").bind(shareId).first<{ownerHash:string|null}>();
 if(!row)return "missing";
 if(!await isAdmin(token,adminToken)&&(!row.ownerHash||row.ownerHash!==await sha256(token)))return "forbidden";
 await db.prepare("DELETE FROM gallery WHERE share_id = ?").bind(shareId).run();
 return "removed";
}

export async function galleryStatus(db:GalleryDatabase,shareId:string){
 if(!SHARE_ID.test(shareId))return {published:false,hidden:false};
 const row=await db.prepare("SELECT hidden FROM gallery WHERE share_id = ?").bind(shareId).first<{hidden:number}>();
 return {published:Boolean(row),hidden:row?.hidden===1};
}

/** One report per person per item; the third distinct reporter hides it until the admin restores it. */
export async function reportShare(db:GalleryDatabase,shareId:string,reporter:string,now=Date.now()):Promise<{counted:boolean;hidden:boolean}|null>{
 if(!SHARE_ID.test(shareId)||!await db.prepare("SELECT share_id FROM gallery WHERE share_id = ?").bind(shareId).first())return null;
 const counted=changed(await db.prepare("INSERT OR IGNORE INTO gallery_reports (share_id, reporter_hash, created_at) VALUES (?, ?, ?)").bind(shareId,reporter,now).run());
 const count="(SELECT COUNT(*) FROM gallery_reports WHERE share_id = ?1)";
 await db.prepare(`UPDATE gallery SET reports = ${count}, hidden = CASE WHEN ${count} >= ${HIDE_AFTER_REPORTS} THEN 1 ELSE hidden END WHERE share_id = ?1`).bind(shareId).run();
 const row=await db.prepare("SELECT hidden FROM gallery WHERE share_id = ?").bind(shareId).first<{hidden:number}>();
 return {counted,hidden:row?.hidden===1};
}

/** Admin only: hide an item, or restore it with a clean report slate. */
export async function setHidden(db:GalleryDatabase,shareId:string,hidden:boolean):Promise<boolean>{
 if(!SHARE_ID.test(shareId))return false;
 if(!hidden)await db.prepare("DELETE FROM gallery_reports WHERE share_id = ?").bind(shareId).run();
 return changed(await db.prepare(`UPDATE gallery SET hidden = ?, reports = ${hidden?"reports":"0"} WHERE share_id = ?`).bind(hidden?1:0,shareId).run());
}

/**
 * A remix counts once per visitor per day (the visitor hash's salt changes daily) and never
 * for the link's own creator or publisher. Rows older than two days can never match again,
 * so each count prunes them for that item.
 */
export async function countRemix(db:GalleryDatabase,shareId:string,visitor:string,now=Date.now()):Promise<{counted:boolean}|null>{
 if(!SHARE_ID.test(shareId))return null;
 const row=await db.prepare("SELECT g.hidden, g.publisher_hash AS publisherHash, s.creator_hash AS creatorHash FROM gallery g JOIN shares s ON s.id = g.share_id WHERE g.share_id = ?").bind(shareId).first<{hidden:number;publisherHash:string;creatorHash:string}>();
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
}).strict();
export type BuildFeedbackInput=z.infer<typeof feedbackSchema>;

/** Store one rating; null when this visitor has rated too often this hour. */
export async function createFeedback(db:GalleryDatabase,input:BuildFeedbackInput,creator:string,now=Date.now()):Promise<{id:string}|null>{
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM build_feedback WHERE creator_hash = ? AND created_at > ?").bind(creator,now-3_600_000).first<{n:number}>();
 if(Number(recent?.n??0)>=FEEDBACK_PER_HOUR)return null;
 const id=crypto.randomUUID(),reason=cleanText(input.reason,MAX_FEEDBACK_REASON)||null;
 await db.prepare("INSERT INTO build_feedback (id, verdict, reason, subject_kind, piece_count, model, cost_usd, created_at, creator_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id,input.verdict,reason,input.subjectKind??null,input.pieceCount??null,input.model??null,input.costUsd??null,now,creator).run();
 return {id};
}

type Tally={good:number;needsWork:number};
export type FeedbackSummary={since:string;total:number;verdicts:Tally;byKind:(Tally&{kind:string})[];byModel:(Tally&{model:string;avgCostUsd:number|null})[];recentReasons:{verdict:string;reason:string;subjectKind:string|null;model:string|null;pieceCount:number|null;createdAt:string}[];gallery:{published:number;hidden:number;hiddenItems:{id:string;name:string;reports:number}[]}};

/** The owner's view of how builds are going: verdicts by subject kind and model, recent reasons, and what reports have hidden. */
export async function feedbackSummary(db:GalleryDatabase,days=30,now=Date.now()):Promise<FeedbackSummary>{
 const since=now-days*86_400_000,tally="SUM(verdict = 'good') AS good, SUM(verdict = 'needs_work') AS needsWork";
 const num=(v:unknown)=>Number(v??0);
 const [all,kinds,models,reasons,counts,hidden]=await Promise.all([
  db.prepare(`SELECT COUNT(*) AS total, ${tally} FROM build_feedback WHERE created_at > ?`).bind(since).first<{total:number}&Tally>(),
  db.prepare(`SELECT COALESCE(subject_kind, 'unknown') AS kind, ${tally} FROM build_feedback WHERE created_at > ? GROUP BY kind ORDER BY COUNT(*) DESC LIMIT 20`).bind(since).all<Tally&{kind:string}>(),
  db.prepare(`SELECT COALESCE(model, 'unknown') AS model, ${tally}, AVG(cost_usd) AS avgCostUsd FROM build_feedback WHERE created_at > ? GROUP BY model ORDER BY COUNT(*) DESC LIMIT 20`).bind(since).all<Tally&{model:string;avgCostUsd:number|null}>(),
  db.prepare("SELECT verdict, reason, subject_kind AS subjectKind, model, piece_count AS pieceCount, created_at AS createdAt FROM build_feedback WHERE created_at > ? AND reason IS NOT NULL ORDER BY created_at DESC LIMIT 25").bind(since).all<{verdict:string;reason:string;subjectKind:string|null;model:string|null;pieceCount:number|null;createdAt:number}>(),
  db.prepare("SELECT COUNT(*) AS published, SUM(hidden) AS hidden FROM gallery").bind().first<{published:number;hidden:number|null}>(),
  db.prepare("SELECT share_id AS id, name, reports FROM gallery WHERE hidden = 1 ORDER BY published_at DESC LIMIT 50").bind().all<{id:string;name:string;reports:number}>(),
 ]);
 return {
  since:new Date(since).toISOString(),total:num(all?.total),verdicts:{good:num(all?.good),needsWork:num(all?.needsWork)},
  byKind:kinds.results.map(r=>({kind:r.kind,good:num(r.good),needsWork:num(r.needsWork)})),
  byModel:models.results.map(r=>({model:r.model,good:num(r.good),needsWork:num(r.needsWork),avgCostUsd:r.avgCostUsd===null||r.avgCostUsd===undefined?null:Math.round(Number(r.avgCostUsd)*10_000)/10_000})),
  recentReasons:reasons.results.map(r=>({...r,createdAt:new Date(Number(r.createdAt)).toISOString()})),
  gallery:{published:num(counts?.published),hidden:num(counts?.hidden),hiddenItems:hidden.results.map(r=>({...r,reports:num(r.reports)}))},
 };
}
