CREATE TABLE `semantic_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`queryText` text NOT NULL,
	`queryEmbedding` text NOT NULL,
	`response` text NOT NULL,
	`responseMetadata` text,
	`hitCount` int DEFAULT 0,
	`lastHitAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `semantic_cache_id` PRIMARY KEY(`id`)
);
