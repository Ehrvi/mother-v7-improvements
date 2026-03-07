-- ============================================================
-- MOTHER C189 Phase 5 — NC-DB-001 Fix
-- Migration 0027: Create all tables missing from production DB
-- Scientific basis: ISO/IEC 25010:2023 — Reliability / Functional Completeness
-- Conselho dos 6 IAs consensus: NC-DB-001 is root cause of 0% cache hit rate,
--   broken learning_patterns, user_memory, audit_log, system_metrics
-- Tables: users, queries, knowledge, learning_patterns, cache_entries,
--   system_metrics, episodic_memory, dgm_archive, langgraph_checkpoints,
--   self_proposals, gea_agent_pool, gea_shared_experience, fitness_history,
--   dgm_task_queue, knowledge_wisdom
-- ============================================================

-- users: Core user accounts table
CREATE TABLE IF NOT EXISTS `users` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(255),
  `role` enum('admin','user','agent') NOT NULL DEFAULT 'user',
  `tier` enum('TIER_1','TIER_2','TIER_3','TIER_4') NOT NULL DEFAULT 'TIER_2',
  `apiKey` varchar(64),
  `stripeCustomerId` varchar(100),
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `lastLoginAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY `users_email_unique` (`email`),
  INDEX `users_email_idx` (`email`),
  INDEX `users_apiKey_idx` (`apiKey`)
);

-- queries: Request/response log for all LLM queries
CREATE TABLE IF NOT EXISTS `queries` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `requestId` varchar(36) NOT NULL,
  `userId` int,
  `tier` enum('TIER_1','TIER_2','TIER_3','TIER_4') DEFAULT 'TIER_2',
  `model` varchar(100),
  `provider` varchar(64) DEFAULT 'openai',
  `modelName` varchar(128) DEFAULT 'gpt-4o',
  `queryCategory` varchar(64) DEFAULT 'general',
  `prompt` mediumtext,
  `response` mediumtext,
  `inputTokens` int DEFAULT 0,
  `outputTokens` int DEFAULT 0,
  `latencyMs` int DEFAULT 0,
  `costUsd` decimal(15,8) DEFAULT '0.00000000',
  `qualityScore` float,
  `cacheHit` tinyint(1) DEFAULT 0,
  `status` enum('success','error','timeout') DEFAULT 'success',
  `errorMessage` text,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  INDEX `queries_requestId_idx` (`requestId`),
  INDEX `queries_userId_idx` (`userId`),
  INDEX `queries_tier_idx` (`tier`),
  INDEX `queries_createdAt_idx` (`createdAt`),
  INDEX `queries_cacheHit_idx` (`cacheHit`)
);

-- knowledge: Core knowledge base for RAG
CREATE TABLE IF NOT EXISTS `knowledge` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `title` varchar(500) NOT NULL,
  `content` mediumtext NOT NULL,
  `category` varchar(100),
  `tags` text,
  `source` varchar(500),
  `sourceType` enum('manual','arxiv','web','dgm','user') DEFAULT 'manual',
  `embedding` mediumtext,
  `qualityScore` float DEFAULT 0.5,
  `usageCount` int DEFAULT 0,
  `isActive` tinyint(1) DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  INDEX `knowledge_category_idx` (`category`),
  INDEX `knowledge_qualityScore_idx` (`qualityScore`),
  FULLTEXT INDEX `knowledge_fulltext` (`title`, `content`)
);

-- learning_patterns: Patterns extracted from successful interactions
CREATE TABLE IF NOT EXISTS `learning_patterns` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `patternType` varchar(50) NOT NULL,
  `patternData` mediumtext NOT NULL,
  `confidence` float DEFAULT 0.5,
  `usageCount` int DEFAULT 0,
  `successRate` float DEFAULT 0.5,
  `context` text,
  `sourceQueryId` int,
  `lastUsedAt` timestamp DEFAULT NOW(),
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  INDEX `learning_patterns_patternType_idx` (`patternType`),
  INDEX `learning_patterns_confidence_idx` (`confidence`),
  INDEX `learning_patterns_lastUsedAt_idx` (`lastUsedAt`)
);

-- cache_entries: General purpose cache (complement to semantic_cache)
CREATE TABLE IF NOT EXISTS `cache_entries` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `cacheKey` varchar(255) NOT NULL,
  `cacheType` varchar(50) DEFAULT 'general',
  `value` mediumtext NOT NULL,
  `ttlSeconds` int DEFAULT 3600,
  `hitCount` int DEFAULT 0,
  `expiresAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY `cache_entries_key_unique` (`cacheKey`),
  INDEX `cache_entries_type_idx` (`cacheType`),
  INDEX `cache_entries_expiresAt_idx` (`expiresAt`)
);

-- system_metrics: Performance metrics for monitoring
CREATE TABLE IF NOT EXISTS `system_metrics` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `metricName` varchar(100) NOT NULL,
  `metricValue` float NOT NULL,
  `tier` varchar(20),
  `model` varchar(100),
  `percentile` varchar(10),
  `windowMinutes` int DEFAULT 60,
  `sampleCount` int DEFAULT 1,
  `metadata` text,
  `measuredAt` timestamp NOT NULL DEFAULT NOW(),
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  INDEX `system_metrics_metricName_idx` (`metricName`),
  INDEX `system_metrics_tier_idx` (`tier`),
  INDEX `system_metrics_measuredAt_idx` (`measuredAt`)
);

-- episodic_memory: Short-term episodic memory for consolidation
CREATE TABLE IF NOT EXISTS `episodic_memory` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `userId` int,
  `episodeType` varchar(50) DEFAULT 'interaction',
  `content` mediumtext NOT NULL,
  `importance` float DEFAULT 0.5,
  `emotionalValence` float DEFAULT 0,
  `isConsolidated` tinyint(1) DEFAULT 0,
  `consolidatedAt` timestamp,
  `relatedPatternId` int,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  INDEX `episodic_memory_sessionId_idx` (`sessionId`),
  INDEX `episodic_memory_userId_idx` (`userId`),
  INDEX `episodic_memory_isConsolidated_idx` (`isConsolidated`),
  INDEX `episodic_memory_importance_idx` (`importance`)
);

-- dgm_archive: Archive of all DGM proposals, patches, and evolution history
CREATE TABLE IF NOT EXISTS `dgm_archive` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `cycleNumber` int NOT NULL,
  `sprintNumber` int DEFAULT 9,
  `eventType` varchar(100) NOT NULL,
  `title` varchar(500),
  `description` mediumtext,
  `filesModified` text,
  `diffContent` mediumtext,
  `prUrl` varchar(500),
  `commitSha` varchar(40),
  `deployStatus` varchar(20) DEFAULT 'pending',
  `qualityScore` float,
  `testResults` text,
  `success` tinyint(1) DEFAULT 1,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `deployedAt` timestamp,
  INDEX `dgm_archive_cycleNumber_idx` (`cycleNumber`),
  INDEX `dgm_archive_eventType_idx` (`eventType`),
  INDEX `dgm_archive_deployStatus_idx` (`deployStatus`)
);

-- langgraph_checkpoints: LangGraph state checkpoints for agent continuity
CREATE TABLE IF NOT EXISTS `langgraph_checkpoints` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `threadId` varchar(100) NOT NULL,
  `checkpointId` varchar(100) NOT NULL,
  `parentCheckpointId` varchar(100),
  `state` mediumtext NOT NULL,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  UNIQUE KEY `langgraph_thread_checkpoint_unique` (`threadId`, `checkpointId`),
  INDEX `langgraph_threadId_idx` (`threadId`)
);

-- self_proposals: DGM self-generated improvement proposals
CREATE TABLE IF NOT EXISTS `self_proposals` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `proposalId` varchar(36) NOT NULL,
  `cycleNumber` int NOT NULL,
  `title` varchar(500) NOT NULL,
  `description` mediumtext,
  `proposalType` varchar(50) DEFAULT 'code_improvement',
  `priority` int DEFAULT 5,
  `estimatedImpact` float,
  `targetFiles` text,
  `proposedCode` mediumtext,
  `status` enum('pending','approved','rejected','implemented','failed') DEFAULT 'pending',
  `approvedBy` varchar(100),
  `implementedAt` timestamp,
  `qualityScore` float,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY `self_proposals_proposalId_unique` (`proposalId`),
  INDEX `self_proposals_status_idx` (`status`),
  INDEX `self_proposals_cycleNumber_idx` (`cycleNumber`),
  INDEX `self_proposals_priority_idx` (`priority`)
);

-- gea_agent_pool: GEA (Genetic Evolution Architecture) agent pool
CREATE TABLE IF NOT EXISTS `gea_agent_pool` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `agentId` varchar(36) NOT NULL,
  `agentType` varchar(50) NOT NULL,
  `generation` int DEFAULT 1,
  `fitnessScore` float DEFAULT 0.5,
  `genome` mediumtext,
  `isActive` tinyint(1) DEFAULT 1,
  `parentAgentId` varchar(36),
  `mutationRate` float DEFAULT 0.1,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY `gea_agent_agentId_unique` (`agentId`),
  INDEX `gea_agent_fitnessScore_idx` (`fitnessScore`),
  INDEX `gea_agent_isActive_idx` (`isActive`)
);

-- gea_shared_experience: Shared experience pool for GEA agents
CREATE TABLE IF NOT EXISTS `gea_shared_experience` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `experienceType` varchar(50) NOT NULL,
  `content` mediumtext NOT NULL,
  `qualityScore` float DEFAULT 0.5,
  `contributorAgentId` varchar(36),
  `usageCount` int DEFAULT 0,
  `tags` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  INDEX `gea_experience_type_idx` (`experienceType`),
  INDEX `gea_experience_qualityScore_idx` (`qualityScore`)
);

-- fitness_history: Evolutionary fitness tracking over time
CREATE TABLE IF NOT EXISTS `fitness_history` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `agentId` varchar(36),
  `cycleNumber` int NOT NULL,
  `fitnessScore` float NOT NULL,
  `fitnessComponents` text,
  `benchmarkResults` text,
  `improvementDelta` float DEFAULT 0,
  `metadata` text,
  `measuredAt` timestamp NOT NULL DEFAULT NOW(),
  INDEX `fitness_history_agentId_idx` (`agentId`),
  INDEX `fitness_history_cycleNumber_idx` (`cycleNumber`),
  INDEX `fitness_history_measuredAt_idx` (`measuredAt`)
);

-- dgm_task_queue: Task queue for DGM async operations
CREATE TABLE IF NOT EXISTS `dgm_task_queue` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `taskId` varchar(36) NOT NULL,
  `taskType` varchar(100) NOT NULL,
  `priority` int DEFAULT 5,
  `status` enum('pending','running','completed','failed','cancelled') DEFAULT 'pending',
  `payload` mediumtext,
  `result` mediumtext,
  `errorMessage` text,
  `retryCount` int DEFAULT 0,
  `maxRetries` int DEFAULT 3,
  `scheduledAt` timestamp DEFAULT NOW(),
  `startedAt` timestamp,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  UNIQUE KEY `dgm_task_taskId_unique` (`taskId`),
  INDEX `dgm_task_status_idx` (`status`),
  INDEX `dgm_task_priority_idx` (`priority`),
  INDEX `dgm_task_taskType_idx` (`taskType`),
  INDEX `dgm_task_scheduledAt_idx` (`scheduledAt`)
);

-- knowledge_wisdom: Distilled wisdom from knowledge base (meta-knowledge)
CREATE TABLE IF NOT EXISTS `knowledge_wisdom` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `wisdomType` varchar(50) NOT NULL,
  `title` varchar(500) NOT NULL,
  `content` mediumtext NOT NULL,
  `sourceKnowledgeIds` text,
  `confidence` float DEFAULT 0.7,
  `applicabilityScore` float DEFAULT 0.5,
  `usageCount` int DEFAULT 0,
  `isVerified` tinyint(1) DEFAULT 0,
  `verifiedBy` varchar(100),
  `tags` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  INDEX `knowledge_wisdom_type_idx` (`wisdomType`),
  INDEX `knowledge_wisdom_confidence_idx` (`confidence`)
);

-- ============================================================
-- C189 Phase 5 — Verification query (run after migration):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = DATABASE()
-- ORDER BY table_name;
-- Expected: 27 tables total
-- ============================================================
