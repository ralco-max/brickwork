import {sql} from "drizzle-orm";
import {check,index,integer,real,sqliteTable,text,uniqueIndex} from "drizzle-orm/sqlite-core";

// Only an irreversible key fingerprint and accounting amounts are persisted.
export const aiSpend=sqliteTable("ai_spend",{
 id:text("id").primaryKey(),
 keyHash:text("key_hash").notNull(),
 reservedNanos:integer("reserved_nanos").notNull(),
 chargedNanos:integer("charged_nanos"),
 createdAt:integer("created_at").notNull(),
},table=>[index("idx_ai_spend_key_hash").on(table.keyHash)]);

// Public, unlisted share links. Reference photos, marked-area screenshots,
// shopping data and the creator's typed words are stripped before storage;
// creator_hash is a daily-salted IP hash used only for rate limiting and
// duplicate detection. owner_hash is the SHA-256 of the owner token that can
// delete the link (null on links made before owner tokens).
export const shares=sqliteTable("shares",{
 id:text("id").primaryKey(),
 name:text("name").notNull(),
 description:text("description").notNull(),
 pieceCount:integer("piece_count").notNull(),
 project:text("project").notNull(),
 image:text("image").notNull(),
 creatorHash:text("creator_hash").notNull(),
 createdAt:integer("created_at").notNull(),
 ownerHash:text("owner_hash"),
 contentHash:text("content_hash"),
},table=>[index("idx_shares_creator").on(table.creatorHash,table.createdAt),index("idx_shares_content").on(table.creatorHash,table.contentHash),index("idx_shares_content_hash").on(table.contentHash,table.createdAt)]);

// The opt-in public gallery: one narrow row per published share, so listing never reads a
// share's project or image. Rows go with their share. Reports and remixes are keyed by salted
// hashes only; reports outlive an unpublish, so republishing cannot clear them.
export const gallery=sqliteTable("gallery",{
 shareId:text("share_id").primaryKey().references(()=>shares.id,{onDelete:"cascade"}),
 name:text("name").notNull(),
 pieceCount:integer("piece_count").notNull(),
 contentHash:text("content_hash").notNull().unique(),
 publisherHash:text("publisher_hash").notNull(),
 publishedAt:integer("published_at").notNull(),
 remixes:integer("remixes").notNull().default(0),
 reports:integer("reports").notNull().default(0),
 hidden:integer("hidden").notNull().default(0),
},table=>[index("idx_gallery_recent").on(table.hidden,table.publishedAt,table.shareId),index("idx_gallery_remixed").on(table.hidden,table.remixes,table.publishedAt,table.shareId),index("idx_gallery_publisher").on(table.publisherHash,table.publishedAt),check("gallery_hidden",sql`${table.hidden} IN (0,1)`)]);
export const galleryReports=sqliteTable("gallery_reports",{
 shareId:text("share_id").notNull().references(()=>shares.id,{onDelete:"cascade"}),
 reporterHash:text("reporter_hash").notNull(),
 createdAt:integer("created_at").notNull(),
},table=>[uniqueIndex("uq_gallery_reports").on(table.shareId,table.reporterHash)]);
export const galleryRemixes=sqliteTable("gallery_remixes",{
 shareId:text("share_id").notNull().references(()=>shares.id,{onDelete:"cascade"}),
 visitorHash:text("visitor_hash").notNull(),
 createdAt:integer("created_at").notNull(),
},table=>[uniqueIndex("uq_gallery_remixes").on(table.shareId,table.visitorHash)]);

// "Looks right / Needs work" on a finished build. No prompt, photo, IP or share id: only the
// verdict, an optional short reason and the build's shape. creator_hash is the daily-salted IP
// hash used for rate limiting.
export const buildFeedback=sqliteTable("build_feedback",{
 id:text("id").primaryKey(),
 verdict:text("verdict",{enum:["good","needs_work"]}).notNull(),
 reason:text("reason"),
 subjectKind:text("subject_kind"),
 pieceCount:integer("piece_count"),
 model:text("model"),
 costUsd:real("cost_usd"),
 createdAt:integer("created_at").notNull(),
 creatorHash:text("creator_hash").notNull(),
},table=>[index("idx_build_feedback_creator").on(table.creatorHash,table.createdAt),index("idx_build_feedback_created").on(table.createdAt),check("build_feedback_verdict",sql`${table.verdict} IN ('good','needs_work')`),check("build_feedback_reason",sql`${table.reason} IS NULL OR length(${table.reason}) <= 280`)]);
