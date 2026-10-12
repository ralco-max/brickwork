import {index,integer,sqliteTable,text} from "drizzle-orm/sqlite-core";

// Only an irreversible key fingerprint and accounting amounts are persisted.
export const aiSpend=sqliteTable("ai_spend",{
 id:text("id").primaryKey(),
 keyHash:text("key_hash").notNull(),
 reservedNanos:integer("reserved_nanos").notNull(),
 chargedNanos:integer("charged_nanos"),
 createdAt:integer("created_at").notNull(),
},table=>[index("idx_ai_spend_key_hash").on(table.keyHash)]);

// Public, unlisted share links. Reference photos, marked-area screenshots and
// shopping data are stripped before storage; creator_hash is a salted IP hash
// used only for rate limiting.
export const shares=sqliteTable("shares",{
 id:text("id").primaryKey(),
 name:text("name").notNull(),
 description:text("description").notNull(),
 pieceCount:integer("piece_count").notNull(),
 project:text("project").notNull(),
 image:text("image").notNull(),
 creatorHash:text("creator_hash").notNull(),
 createdAt:integer("created_at").notNull(),
},table=>[index("idx_shares_creator").on(table.creatorHash,table.createdAt)]);
