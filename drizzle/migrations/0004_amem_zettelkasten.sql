-- MOTHER v44.0: Migration 0004 - A-MEM Zettelkasten Memory Architecture
-- Based on: arXiv:2502.12110 (A-MEM: Agentic Memory for LLM Agents)
-- Extends episodic_memory with Zettelkasten-style fields for associative memory evolution
-- 
-- Key additions per A-MEM paper (Section 3):
--   - keywords: LLM-extracted semantic keywords for retrieval
--   - links: JSON array of linked memory IDs (Zettelkasten connections)
--   - context: Domain/category classification
--   - tags: Fine-grained classification tags (evolved by LLM)
--   - retrieval_count: Usage statistics for importance scoring
--   - evolution_history: JSON log of how the memory evolved over time
--   - last_accessed: Temporal decay tracking
--   - importance_score: Composite score (recency + retrieval_count + link_density)
--
-- FIX v46.0: MySQL 8.0 on Cloud SQL does NOT support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- Using separate ALTER TABLE statements - migration runner ignores 'Duplicate column name' errors

ALTER TABLE `episodic_memory` ADD COLUMN `keywords` text COMMENT 'JSON array: LLM-extracted semantic keywords';
ALTER TABLE `episodic_memory` ADD COLUMN `links` text COMMENT 'JSON array: linked memory IDs (Zettelkasten)';
ALTER TABLE `episodic_memory` ADD COLUMN `context` varchar(500) DEFAULT 'General' COMMENT 'Domain/category of the memory';
ALTER TABLE `episodic_memory` ADD COLUMN `category` varchar(255) DEFAULT 'Uncategorized' COMMENT 'High-level classification';
ALTER TABLE `episodic_memory` ADD COLUMN `tags` text COMMENT 'JSON array: fine-grained classification tags';
ALTER TABLE `episodic_memory` ADD COLUMN `retrieval_count` int NOT NULL DEFAULT 0 COMMENT 'Usage statistics for importance scoring';
ALTER TABLE `episodic_memory` ADD COLUMN `evolution_history` text COMMENT 'JSON array: evolution log entries';
ALTER TABLE `episodic_memory` ADD COLUMN `last_accessed` timestamp NULL DEFAULT NULL COMMENT 'Temporal decay tracking';
ALTER TABLE `episodic_memory` ADD COLUMN `importance_score` float DEFAULT 0.5 COMMENT 'Composite importance: recency + retrieval + link_density';
CREATE INDEX `idx_em_importance` ON `episodic_memory` (`importance_score`);
CREATE INDEX `idx_em_context` ON `episodic_memory` (`context`);
