import {index,integer,sqliteTable,text} from "drizzle-orm/sqlite-core";

// Only an irreversible key fingerprint and accounting amounts are persisted.
export const aiSpend=sqliteTable("ai_spend",{
 id:text("id").primaryKey(),
 keyHash:text("key_hash").notNull(),
 reservedNanos:integer("reserved_nanos").notNull(),
 chargedNanos:integer("charged_nanos"),
 createdAt:integer("created_at").notNull(),
},table=>[index("idx_ai_spend_key_hash").on(table.keyHash)]);
