CREATE TABLE `ai_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`reserved_nanos` integer NOT NULL,
	`charged_nanos` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_spend_key_hash` ON `ai_spend` (`key_hash`);
--> statement-breakpoint
PRAGMA optimize;
