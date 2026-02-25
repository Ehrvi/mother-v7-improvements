-- Migration 0023: v67.7 Schema Alignment
-- Adds missing columns to papers table to match ORM schema.ts
-- Scientific basis: "Evolutionary Database Design" (Fowler & Sadalage, 2003)
-- Audit finding: papers table missing doi, pdf_url, citation_count, quality_score, chunks_count
-- Audit finding: episodic_memory missing user_id, session_id (already in DB — no action needed)
-- Audit finding: ORM has ghost tables (ab_test_metrics, webhooks, webhook_deliveries) — no action needed

-- ===== papers table: add missing columns =====
ALTER TABLE `papers`
  ADD COLUMN IF NOT EXISTS `doi` varchar(100) DEFAULT NULL AFTER `arxiv_id`,
  ADD COLUMN IF NOT EXISTS `pdf_url` varchar(500) DEFAULT NULL AFTER `abstract`,
  ADD COLUMN IF NOT EXISTS `citation_count` int DEFAULT 0 AFTER `status`,
  ADD COLUMN IF NOT EXISTS `quality_score` varchar(20) DEFAULT NULL AFTER `citation_count`,
  ADD COLUMN IF NOT EXISTS `chunks_count` int DEFAULT 0 AFTER `quality_score`;

-- ===== episodic_memory: fix ORM column name mismatch =====
-- ORM uses 'createdAt' but DB has 'created_at' — DB is correct, ORM was fixed in v67.5
-- No SQL action needed — schema.ts already uses 'created_at' after v67.5 fix

-- ===== knowledge table: add source_url and confidence if not present =====
-- These columns already exist in production DB (verified in audit)
-- No SQL action needed

-- ===== Record this migration =====
INSERT IGNORE INTO migrations_applied (filename, applied_at) 
VALUES ('0023_v67_schema_alignment.sql', NOW());
