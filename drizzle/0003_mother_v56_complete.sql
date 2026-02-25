-- MOTHER v56.0: Complete Schema Migration
-- Adds all tables that exist in schema.ts but are missing from production DB
-- Tables being created: knowledge_areas, papers, paper_chunks, study_jobs,
--   semantic_cache, system_config, webhooks, webhook_deliveries, ab_test_metrics,
--   user_memory, update_proposals, audit_log

-- ============================================================
-- knowledge_areas: Tracks knowledge domains for Omniscient module
-- ============================================================
CREATE TABLE IF NOT EXISTS `knowledge_areas` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `status` enum('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
  `papersCount` int DEFAULT 0,
  `chunksCount` int DEFAULT 0,
  `qualityScore` varchar(20),
  `cost` decimal(15,8) NOT NULL DEFAULT '0.00000000',
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  `completedAt` timestamp
);

-- ============================================================
-- papers: Academic papers indexed by the RAG pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS `papers` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `knowledgeAreaId` int,
  `arxiv_id` varchar(50),
  `doi` varchar(100),
  `title` text NOT NULL,
  `authors` text,
  `abstract` text,
  `publishedDate` timestamp,
  `pdfUrl` varchar(500),
  `pdfPath` varchar(500),
  `status` enum('pending','downloading','processing','indexed','failed') NOT NULL DEFAULT 'pending',
  `pageCount` int,
  `tokenCount` int,
  `chunksCount` int DEFAULT 0,
  `source` varchar(50) DEFAULT 'arxiv',
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `papers_knowledgeAreaId_fk` FOREIGN KEY (`knowledgeAreaId`) REFERENCES `knowledge_areas`(`id`) ON DELETE SET NULL
);

-- ============================================================
-- paper_chunks: Semantic chunks of papers for RAG retrieval
-- ============================================================
CREATE TABLE IF NOT EXISTS `paper_chunks` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `paper_id` int NOT NULL,
  `chunk_index` int NOT NULL,
  `content` text NOT NULL,
  `embedding` text,
  `token_count` int,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT `paper_chunks_paper_id_fk` FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON DELETE CASCADE
);

-- ============================================================
-- study_jobs: Async knowledge acquisition jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS `study_jobs` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `knowledgeAreaId` int NOT NULL,
  `status` enum('pending','discovering','retrieving','processing','indexing','validating','completed','failed') NOT NULL DEFAULT 'pending',
  `progress` int DEFAULT 0,
  `total` int DEFAULT 0,
  `currentStep` varchar(255),
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  `completedAt` timestamp,
  CONSTRAINT `study_jobs_knowledgeAreaId_fk` FOREIGN KEY (`knowledgeAreaId`) REFERENCES `knowledge_areas`(`id`) ON DELETE CASCADE
);

-- ============================================================
-- semantic_cache: Query-response pairs for semantic similarity search
-- ============================================================
CREATE TABLE IF NOT EXISTS `semantic_cache` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `queryText` text NOT NULL,
  `queryEmbedding` text NOT NULL,
  `response` text NOT NULL,
  `responseMetadata` text,
  `hitCount` int DEFAULT 0,
  `lastHitAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

-- ============================================================
-- system_config: Key-value store for dynamic system configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS `system_config` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `key` varchar(255) NOT NULL UNIQUE,
  `value` text NOT NULL,
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

-- ============================================================
-- webhooks: Webhook subscriptions for event-driven integrations
-- ============================================================
CREATE TABLE IF NOT EXISTS `webhooks` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
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
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `webhooks_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);

-- ============================================================
-- webhook_deliveries: Individual webhook delivery attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `webhookId` int NOT NULL,
  `event` varchar(100) NOT NULL,
  `payload` text NOT NULL,
  `statusCode` int,
  `responseBody` text,
  `success` int NOT NULL DEFAULT 0,
  `attemptCount` int DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT `webhook_deliveries_webhookId_fk` FOREIGN KEY (`webhookId`) REFERENCES `webhooks`(`id`)
);

-- ============================================================
-- ab_test_metrics: A/B test results for continuous improvement
-- ============================================================
CREATE TABLE IF NOT EXISTS `ab_test_metrics` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `testName` varchar(255) NOT NULL,
  `variant` varchar(100) NOT NULL,
  `metric` varchar(100) NOT NULL,
  `value` varchar(50) NOT NULL,
  `sampleSize` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT NOW()
);

-- ============================================================
-- user_memory: Per-user episodic memory (Req #4 - personalized experience)
-- Inspired by MemGPT (Packer et al., 2023): hierarchical memory per user
-- ============================================================
CREATE TABLE IF NOT EXISTS `user_memory` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `userId` int NOT NULL,
  `content` text NOT NULL,
  `embedding` text,
  `keywords` text,
  `context` varchar(500) DEFAULT 'General',
  `category` varchar(255) DEFAULT 'Uncategorized',
  `tags` text,
  `links` text,
  `importanceScore` float DEFAULT 0.5,
  `retrievalCount` int NOT NULL DEFAULT 0,
  `evolutionHistory` text,
  `lastAccessed` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `user_memory_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `user_memory_userId_idx` (`userId`)
);

-- ============================================================
-- update_proposals: System for proposing and approving MOTHER updates
-- Implements Req #5 (interaction), #6 (only creator approves), #7 (autonomous)
-- ============================================================
CREATE TABLE IF NOT EXISTS `update_proposals` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `proposedBy` enum('creator','mother','system') NOT NULL DEFAULT 'mother',
  `title` varchar(500) NOT NULL,
  `description` text NOT NULL,
  `rationale` text,
  `affectedModules` text,
  `estimatedImpact` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status` enum('pending','approved','rejected','implementing','completed','failed') NOT NULL DEFAULT 'pending',
  `approvedByEmail` varchar(255),
  `approvedAt` timestamp,
  `rejectedReason` text,
  `implementationNotes` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

-- ============================================================
-- audit_log: Immutable audit trail for all system changes
-- Implements Req #6 (only creator authorizes) - tamper-evident log
-- ============================================================
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `action` varchar(100) NOT NULL,
  `actorEmail` varchar(255),
  `actorType` enum('creator','user','system','mother') NOT NULL DEFAULT 'system',
  `targetType` varchar(100),
  `targetId` varchar(255),
  `details` text,
  `ipAddress` varchar(45),
  `userAgent` text,
  `success` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Add userId to episodic_memory for per-user isolation (Req #4)
-- ============================================================
ALTER TABLE `episodic_memory` ADD COLUMN IF NOT EXISTS `userId` int DEFAULT NULL;
ALTER TABLE `episodic_memory` ADD COLUMN IF NOT EXISTS `sessionId` varchar(255) DEFAULT NULL;

-- ============================================================
-- Insert initial system config values
-- ============================================================
INSERT IGNORE INTO `system_config` (`key`, `value`, `description`) VALUES
  ('mother_version', 'v56.0', 'Current MOTHER version'),
  ('learning_quality_threshold', '80', 'Minimum quality score to trigger learning (0-100)'),
  ('research_auto_ingest', 'true', 'Auto-ingest arXiv papers found during research'),
  ('creator_email', 'elgarcia.eng@gmail.com', 'Creator email for authorization checks'),
  ('continuous_learning_enabled', 'true', 'Enable scheduled continuous learning'),
  ('max_paper_chunks', '100', 'Maximum chunks per paper for indexing');
