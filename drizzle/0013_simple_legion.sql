CREATE TABLE `ab_test_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`queryId` int,
	`variant` enum('control','critical_thinking') NOT NULL,
	`qualityScore` int NOT NULL,
	`latencyMs` int NOT NULL,
	`costUsd` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ab_test_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `knowledge_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
	`papersCount` int DEFAULT 0,
	`chunksCount` int DEFAULT 0,
	`qualityScore` varchar(20),
	`cost` decimal(15,8) NOT NULL DEFAULT '0.00000000',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `knowledge_areas_id` PRIMARY KEY(`id`)
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
CREATE TABLE `paper_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paperId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`text` text NOT NULL,
	`embedding` text NOT NULL,
	`tokenCount` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paper_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`knowledgeAreaId` int NOT NULL,
	`arxivId` varchar(50) NOT NULL,
	`title` text NOT NULL,
	`authors` text,
	`abstract` text,
	`publishedDate` timestamp,
	`pdfUrl` varchar(500),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`citationCount` int DEFAULT 0,
	`qualityScore` varchar(20),
	`chunksCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `papers_id` PRIMARY KEY(`id`),
	CONSTRAINT `papers_arxivId_unique` UNIQUE(`arxivId`)
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
	`cost` decimal(15,8) NOT NULL DEFAULT '0.00000000',
	`cacheHit` int DEFAULT 0,
	`embedding` text,
	`embeddingModel` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `queries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `study_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`knowledgeAreaId` int NOT NULL,
	`status` enum('pending','discovering','retrieving','processing','indexing','validating','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`total` int DEFAULT 0,
	`currentStep` varchar(255),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `study_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_key_unique` UNIQUE(`key`)
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
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64),
	`name` text,
	`email` varchar(320),
	`passwordHash` varchar(255),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`failedLoginAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookId` int NOT NULL,
	`event` varchar(100) NOT NULL,
	`payload` text NOT NULL,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`statusCode` int,
	`responseBody` text,
	`errorMessage` text,
	`attempts` int DEFAULT 0,
	`nextRetryAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`events` text NOT NULL,
	`secret` varchar(64) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`totalDeliveries` int DEFAULT 0,
	`successfulDeliveries` int DEFAULT 0,
	`failedDeliveries` int DEFAULT 0,
	`lastDeliveryAt` timestamp,
	`lastDeliveryStatus` enum('success','failed','pending'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ab_test_metrics` ADD CONSTRAINT `ab_test_metrics_queryId_queries_id_fk` FOREIGN KEY (`queryId`) REFERENCES `queries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paper_chunks` ADD CONSTRAINT `paper_chunks_paperId_papers_id_fk` FOREIGN KEY (`paperId`) REFERENCES `papers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `papers` ADD CONSTRAINT `papers_knowledgeAreaId_knowledge_areas_id_fk` FOREIGN KEY (`knowledgeAreaId`) REFERENCES `knowledge_areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `queries` ADD CONSTRAINT `queries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_jobs` ADD CONSTRAINT `study_jobs_knowledgeAreaId_knowledge_areas_id_fk` FOREIGN KEY (`knowledgeAreaId`) REFERENCES `knowledge_areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_webhookId_webhooks_id_fk` FOREIGN KEY (`webhookId`) REFERENCES `webhooks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhooks` ADD CONSTRAINT `webhooks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;