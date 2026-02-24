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

ALTER TABLE `episodic_memory`
  ADD COLUMN IF NOT EXISTS `keywords` text COMMENT 'JSON array: LLM-extracted semantic keywords',
  ADD COLUMN IF NOT EXISTS `links` text COMMENT 'JSON array: linked memory IDs (Zettelkasten)',
  ADD COLUMN IF NOT EXISTS `context` varchar(500) DEFAULT 'General' COMMENT 'Domain/category of the memory',
  ADD COLUMN IF NOT EXISTS `category` varchar(255) DEFAULT 'Uncategorized' COMMENT 'High-level classification',
  ADD COLUMN IF NOT EXISTS `tags` text COMMENT 'JSON array: fine-grained classification tags',
  ADD COLUMN IF NOT EXISTS `retrieval_count` int NOT NULL DEFAULT 0 COMMENT 'Usage statistics for importance scoring',
  ADD COLUMN IF NOT EXISTS `evolution_history` text COMMENT 'JSON array: evolution log entries',
  ADD COLUMN IF NOT EXISTS `last_accessed` timestamp NULL DEFAULT NULL COMMENT 'Temporal decay tracking',
  ADD COLUMN IF NOT EXISTS `importance_score` float DEFAULT 0.5 COMMENT 'Composite importance: recency + retrieval + link_density';

-- Index for fast retrieval by context and importance
CREATE INDEX IF NOT EXISTS `idx_episodic_context` ON `episodic_memory` (`context`);
CREATE INDEX IF NOT EXISTS `idx_episodic_importance` ON `episodic_memory` (`importance_score` DESC);
CREATE INDEX IF NOT EXISTS `idx_episodic_last_accessed` ON `episodic_memory` (`last_accessed` DESC);
