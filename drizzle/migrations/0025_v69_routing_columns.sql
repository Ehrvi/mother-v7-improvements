-- Migration 0025: v69.0 — Add routing and cost tracking columns to queries table
-- Purpose: Persist multi-provider routing decisions (provider, modelName, queryCategory)
--          These columns were in the Drizzle schema since v68.8 but never migrated to DB.
-- Scientific basis: FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cost-aware routing
-- Version: MOTHER v69.0

ALTER TABLE queries 
  ADD COLUMN IF NOT EXISTS `provider` varchar(50) NULL COMMENT 'LLM provider: openai, google, anthropic, deepseek',
  ADD COLUMN IF NOT EXISTS `modelName` varchar(100) NULL COMMENT 'Actual model used: gpt-4o, gemini-2.5-flash, etc.',
  ADD COLUMN IF NOT EXISTS `queryCategory` varchar(50) NULL COMMENT 'Routing category: simple, general, coding, analysis, complex_reasoning';

-- Record migration
INSERT IGNORE INTO migrations_applied (filename, applied_at) VALUES ('0025_v69_routing_columns.sql', NOW());
