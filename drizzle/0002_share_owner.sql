ALTER TABLE `shares` ADD `owner_hash` text;--> statement-breakpoint
ALTER TABLE `shares` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_shares_content` ON `shares` (`creator_hash`,`content_hash`);