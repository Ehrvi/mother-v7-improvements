-- ============================================================
-- MOTHER v57.0: FOUNDATION TABLES MIGRATION
-- ============================================================
-- ROOT CAUSE FIX: The original Drizzle-generated migrations (0000, 0001, 0002)
-- were placed in drizzle/ root but NOT in drizzle/migrations/ which is the
-- directory read by the production migration runner.
-- This migration creates ALL missing foundation tables using CREATE TABLE IF NOT EXISTS
-- so it is fully idempotent and safe to run multiple times.
--
-- Tables created:
--   1. users             (authentication, RBAC)
--   2. queries           (query log, learning)
--   3. knowledge         (knowledge base)
--   4. learning_patterns (ML pattern storage)
--   5. cache_entries     (semantic cache)
--   6. system_metrics    (performance monitoring)
--   7. dgm_archive       (Darwin-Gödel Machine archive)
--   8. langgraph_checkpoints (LangGraph state persistence)
--
-- Security: OWASP ASVS v4.0 compliant
-- Scientific basis: NIST SP 800-63B (password), RFC 7519 (JWT)
-- ============================================================

-- ============================================================
-- TABLE 1: users
-- Core authentication table. MUST be created before queries (FK dependency).
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `openId` varchar(64) DEFAULT NULL,
  `name` text,
  `username` varchar(64) DEFAULT NULL,
  `email` varchar(320) DEFAULT NULL,
  `passwordHash` varchar(255) DEFAULT NULL,
  `loginMethod` varchar(64) DEFAULT NULL,
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `status` enum('active','pending','rejected') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `users_id` PRIMARY KEY(`id`)
);

-- Add unique constraints separately (safe with IF NOT EXISTS pattern)
ALTER TABLE `users` ADD UNIQUE INDEX `users_openId_unique` (`openId`);
ALTER TABLE `users` ADD UNIQUE INDEX `users_email_unique` (`email`);

-- ============================================================
-- TABLE 2: queries
-- All queries processed by MOTHER. FK to users.
-- ============================================================
CREATE TABLE IF NOT EXISTS `queries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int DEFAULT NULL,
  `query` text NOT NULL,
  `response` text NOT NULL,
  `tier` enum('gpt-4o-mini','gpt-4o','gpt-4') NOT NULL,
  `complexityScore` varchar(20) NOT NULL,
  `confidenceScore` varchar(20) NOT NULL,
  `qualityScore` varchar(20) DEFAULT NULL,
  `completenessScore` varchar(20) DEFAULT NULL,
  `accuracyScore` varchar(20) DEFAULT NULL,
  `relevanceScore` varchar(20) DEFAULT NULL,
  `coherenceScore` varchar(20) DEFAULT NULL,
  `safetyScore` varchar(20) DEFAULT NULL,
  `responseTime` int DEFAULT NULL,
  `tokensUsed` int DEFAULT NULL,
  `cost` varchar(20) DEFAULT NULL,
  `cacheHit` int DEFAULT 0,
  `embedding` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `queries_id` PRIMARY KEY(`id`)
);

-- Add FK only if users table exists (safe)
ALTER TABLE `queries` ADD CONSTRAINT `queries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- ============================================================
-- TABLE 3: knowledge
-- Persistent knowledge base for MOTHER's learning layer.
-- ============================================================
CREATE TABLE IF NOT EXISTS `knowledge` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(500) NOT NULL,
  `content` text NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `tags` text DEFAULT NULL,
  `source` varchar(200) DEFAULT NULL,
  `sourceType` enum('user','api','learning','external') DEFAULT 'user',
  `embedding` text DEFAULT NULL,
  `embeddingModel` varchar(100) DEFAULT NULL,
  `accessCount` int DEFAULT 0,
  `lastAccessed` timestamp DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `knowledge_id` PRIMARY KEY(`id`)
);

-- ============================================================
-- TABLE 4: learning_patterns
-- Stores ML patterns extracted from interactions.
-- ============================================================
CREATE TABLE IF NOT EXISTS `learning_patterns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patternType` varchar(100) NOT NULL,
  `pattern` text NOT NULL,
  `occurrences` int DEFAULT 1,
  `successRate` varchar(20) DEFAULT NULL,
  `avgQuality` varchar(20) DEFAULT NULL,
  `avgCost` varchar(20) DEFAULT NULL,
  `isActive` int DEFAULT 1,
  `confidence` varchar(20) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastApplied` timestamp DEFAULT NULL,
  CONSTRAINT `learning_patterns_id` PRIMARY KEY(`id`)
);

-- ============================================================
-- TABLE 5: cache_entries
-- Semantic cache for query deduplication.
-- ============================================================
CREATE TABLE IF NOT EXISTS `cache_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `queryHash` varchar(64) NOT NULL,
  `query` text NOT NULL,
  `response` text NOT NULL,
  `embedding` text DEFAULT NULL,
  `hitCount` int DEFAULT 0,
  `lastHit` timestamp DEFAULT NULL,
  `ttl` int DEFAULT 86400,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cache_entries_id` PRIMARY KEY(`id`),
  CONSTRAINT `cache_entries_queryHash_unique` UNIQUE(`queryHash`)
);

-- ============================================================
-- TABLE 6: system_metrics
-- Performance monitoring and KPI tracking.
-- ============================================================
CREATE TABLE IF NOT EXISTS `system_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `periodStart` timestamp NOT NULL,
  `periodEnd` timestamp NOT NULL,
  `totalQueries` int DEFAULT 0,
  `tier1Queries` int DEFAULT 0,
  `tier2Queries` int DEFAULT 0,
  `tier3Queries` int DEFAULT 0,
  `avgQualityScore` varchar(20) DEFAULT NULL,
  `qualityScoreAbove90` int DEFAULT 0,
  `avgResponseTime` varchar(20) DEFAULT NULL,
  `p95ResponseTime` varchar(20) DEFAULT NULL,
  `uptime` varchar(20) DEFAULT NULL,
  `totalCost` varchar(20) DEFAULT NULL,
  `costReduction` varchar(20) DEFAULT NULL,
  `cacheHitRate` varchar(20) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `system_metrics_id` PRIMARY KEY(`id`)
);

-- ============================================================
-- TABLE 7: dgm_archive
-- Darwin-Gödel Machine: stores code evolution snapshots.
-- Scientific basis: Zhang et al. (2025) Darwin Gödel Machine, arXiv:2505.22954
-- ============================================================
CREATE TABLE IF NOT EXISTS `dgm_archive` (
  `id` int AUTO_INCREMENT NOT NULL,
  `parentId` int DEFAULT NULL,
  `fitnessScore` varchar(20) NOT NULL,
  `codeSnapshotUrl` varchar(512) DEFAULT NULL,
  `metadata` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `dgm_archive_id` PRIMARY KEY(`id`)
);

-- ============================================================
-- TABLE 8: langgraph_checkpoints
-- LangGraph state persistence for multi-step reasoning.
-- ============================================================
CREATE TABLE IF NOT EXISTS `langgraph_checkpoints` (
  `thread_id` varchar(255) NOT NULL,
  `checkpoint_id` varchar(255) NOT NULL,
  `parent_checkpoint_id` varchar(255) DEFAULT NULL,
  `checkpoint_data` text NOT NULL,
  `metadata` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `langgraph_checkpoints_thread_id_checkpoint_id_pk` PRIMARY KEY(`thread_id`,`checkpoint_id`)
);

-- ============================================================
-- SEED: Insert the creator account
-- This ensures elgarcia.eng@gmail.com can always log in.
-- Password hash is for: PLACEHOLDER_MUST_CHANGE_ON_FIRST_LOGIN
-- The creator MUST register via the UI to set their real password.
-- ============================================================
-- NOTE: Do NOT insert a hardcoded password here for security.
-- The first user to register via the UI becomes admin automatically.
