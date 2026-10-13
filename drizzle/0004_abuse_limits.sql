ALTER TABLE `ai_spend` ADD `visitor_hash` text;--> statement-breakpoint
CREATE INDEX `idx_ai_spend_visitor` ON `ai_spend` (`visitor_hash`);--> statement-breakpoint
ALTER TABLE `gallery` ADD `reviewed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shares` ADD `build_hash` text;--> statement-breakpoint
ALTER TABLE `shares` ADD `image_hash` text;--> statement-breakpoint
ALTER TABLE `shares` ADD `bytes` integer;--> statement-breakpoint
CREATE INDEX `idx_shares_created` ON `shares` (`created_at`,`bytes`);