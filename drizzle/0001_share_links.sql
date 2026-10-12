CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`piece_count` integer NOT NULL,
	`project` text NOT NULL,
	`image` text NOT NULL,
	`creator_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shares_creator` ON `shares` (`creator_hash`,`created_at`);