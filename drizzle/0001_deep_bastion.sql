CREATE TABLE `cache_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`queryHash` varchar(64) NOT NULL,
	`query` text NOT NULL,
	`response` text NOT NULL,
	`embedding` text,
	`hitCount` int DEFAULT 0,
	`lastHit` timestamp,
	`ttl` int DEFAULT 86400,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cache_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `cache_entries_queryHash_unique` UNIQUE(`queryHash`)
);
--> statement-breakpoint
CREATE TABLE `knowledge` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`content` text NOT NULL,
	`category` varchar(100),
	`tags` text,
	`source` varchar(200),
	`sourceType` enum('user','api','learning','external') DEFAULT 'user',
	`embedding` text,
	`embeddingModel` varchar(100),
	`accessCount` int DEFAULT 0,
	`lastAccessed` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_patterns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patternType` varchar(100) NOT NULL,
	`pattern` text NOT NULL,
	`occurrences` int DEFAULT 1,
	`successRate` varchar(20),
	`avgQuality` varchar(20),
	`avgCost` varchar(20),
	`isActive` int DEFAULT 1,
	`confidence` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastApplied` timestamp,
	CONSTRAINT `learning_patterns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`query` text NOT NULL,
	`response` text NOT NULL,
	`tier` enum('gpt-4o-mini','gpt-4o','gpt-4') NOT NULL,
	`complexityScore` varchar(20) NOT NULL,
	`confidenceScore` varchar(20) NOT NULL,
	`qualityScore` varchar(20),
	`completenessScore` varchar(20),
	`accuracyScore` varchar(20),
	`relevanceScore` varchar(20),
	`coherenceScore` varchar(20),
	`safetyScore` varchar(20),
	`responseTime` int,
	`tokensUsed` int,
	`cost` varchar(20),
	`cacheHit` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `queries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`totalQueries` int DEFAULT 0,
	`tier1Queries` int DEFAULT 0,
	`tier2Queries` int DEFAULT 0,
	`tier3Queries` int DEFAULT 0,
	`avgQualityScore` varchar(20),
	`qualityScoreAbove90` int DEFAULT 0,
	`avgResponseTime` varchar(20),
	`p95ResponseTime` varchar(20),
	`uptime` varchar(20),
	`totalCost` varchar(20),
	`costReduction` varchar(20),
	`cacheHitRate` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `queries` ADD CONSTRAINT `queries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;