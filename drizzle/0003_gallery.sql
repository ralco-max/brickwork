CREATE TABLE `build_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`verdict` text NOT NULL,
	`reason` text,
	`subject_kind` text,
	`piece_count` integer,
	`model` text,
	`cost_usd` real,
	`created_at` integer NOT NULL,
	`creator_hash` text NOT NULL,
	CONSTRAINT "build_feedback_verdict" CHECK("build_feedback"."verdict" IN ('good','needs_work')),
	CONSTRAINT "build_feedback_reason" CHECK("build_feedback"."reason" IS NULL OR length("build_feedback"."reason") <= 280)
);
--> statement-breakpoint
CREATE INDEX `idx_build_feedback_creator` ON `build_feedback` (`creator_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_build_feedback_created` ON `build_feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `gallery` (
	`share_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`piece_count` integer NOT NULL,
	`content_hash` text NOT NULL,
	`publisher_hash` text NOT NULL,
	`published_at` integer NOT NULL,
	`remixes` integer DEFAULT 0 NOT NULL,
	`reports` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`listed` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "gallery_hidden" CHECK("gallery"."hidden" IN (0,1)),
	CONSTRAINT "gallery_listed" CHECK("gallery"."listed" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_content_hash_unique` ON `gallery` (`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_gallery_recent` ON `gallery` (`hidden`,`listed`,`published_at`,`share_id`);--> statement-breakpoint
CREATE INDEX `idx_gallery_remixed` ON `gallery` (`hidden`,`listed`,`remixes`,`published_at`,`share_id`);--> statement-breakpoint
CREATE TABLE `gallery_actions` (
	`kind` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "gallery_actions_kind" CHECK("gallery_actions"."kind" IN ('publish','report'))
);
--> statement-breakpoint
CREATE INDEX `idx_gallery_actions` ON `gallery_actions` (`kind`,`visitor_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_gallery_actions_created` ON `gallery_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `gallery_blocks` (
	`content_hash` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "gallery_blocks_kind" CHECK("gallery_blocks"."kind" IN ('hidden','removed'))
);
--> statement-breakpoint
CREATE TABLE `gallery_remixes` (
	`share_id` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_gallery_remixes` ON `gallery_remixes` (`share_id`,`visitor_hash`);--> statement-breakpoint
CREATE TABLE `gallery_reports` (
	`share_id` text NOT NULL,
	`reporter_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`dismissed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "gallery_reports_dismissed" CHECK("gallery_reports"."dismissed" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_gallery_reports` ON `gallery_reports` (`share_id`,`reporter_hash`);--> statement-breakpoint
CREATE INDEX `idx_shares_content_hash` ON `shares` (`content_hash`,`created_at`);