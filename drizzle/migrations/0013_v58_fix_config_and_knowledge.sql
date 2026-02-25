-- ============================================================
-- MOTHER v58.0 Migration 0013: Fix system_config and knowledge columns
-- Date: 2026-02-25
-- Fixes warnings from migration 0012:
--   - system_config uses backtick-quoted `key` column (MySQL reserved word)
--   - ADD COLUMN IF NOT EXISTS not supported in MySQL 8.0 < 8.0.29
--   - scientific_basis column in self_proposals had unescaped single quotes
-- ============================================================

-- ============================================================
-- 1. FIX system_config: use backtick-quoted `key` column
-- MySQL 8.0: KEY is a reserved word, must be quoted
-- ============================================================
INSERT INTO `system_config` (`key`, `value`, `description`, `updated_at`)
VALUES 
  ('current_version', 'v58.0', 'Current MOTHER version', NOW()),
  ('creator_authorized_until', 'IMMACULATE_PERFECTION', 'Creator authorization scope', NOW()),
  ('dgm_loop_enabled', 'true', 'Darwin Godel Machine self-improvement loop', NOW()),
  ('self_proposal_enabled', 'true', 'MOTHER can generate its own improvement proposals', NOW()),
  ('quality_target', '100', 'Target quality score for IMMACULATE PERFECTION', NOW()),
  ('guardian_version', 'v60.0', 'Guardian quality scoring system version', NOW()),
  ('learning_threshold', '75', 'Minimum quality score for learning to occur', NOW())
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW();

-- ============================================================
-- 2. ADD knowledge table columns (safe approach: try/ignore errors)
-- MySQL 8.0 < 8.0.29 does not support ADD COLUMN IF NOT EXISTS
-- Use separate statements that will fail silently if column exists
-- ============================================================
ALTER TABLE `knowledge` ADD COLUMN `source_url` varchar(500) DEFAULT NULL;
ALTER TABLE `knowledge` ADD COLUMN `confidence` float DEFAULT 0.8;
ALTER TABLE `knowledge` ADD COLUMN `domain` varchar(100) DEFAULT 'general';

-- ============================================================
-- 3. LOG v60.0 guardian improvement
-- ============================================================
INSERT INTO `audit_log` (
  `action`,
  `actor_email`,
  `actor_type`,
  `target_type`,
  `target_id`,
  `details`,
  `success`
) VALUES (
  'GUARDIAN_UPGRADED',
  'system@mother.ai',
  'system',
  'module',
  'guardian.ts',
  'Guardian v60.0 deployed: stop word filtering, citation bonus +5pts, balanced weights (completeness 30%, accuracy 25%, relevance 25%, coherence 12%, safety 8%). Scientific basis: G-Eval (Liu et al., 2023)',
  1
);

-- ============================================================
-- 4. LOG self-proposal engine deployment
-- ============================================================
INSERT INTO `audit_log` (
  `action`,
  `actor_email`,
  `actor_type`,
  `target_type`,
  `target_id`,
  `details`,
  `success`
) VALUES (
  'SELF_PROPOSAL_ENGINE_DEPLOYED',
  'system@mother.ai',
  'system',
  'module',
  'self-proposal-engine.ts',
  'Self-proposal engine v59.0 deployed. MOTHER now analyzes her own metrics every 10 queries and generates improvement proposals. DGM loop active. Scientific basis: Darwin Godel Machine (Zhang et al., 2025)',
  1
);
