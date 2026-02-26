-- Migration 0024: Sprint 3 — Add RAGAS metrics columns and costReduction to queries table
-- Scientific basis: RAGAS (Es et al., EACL 2024, arXiv:2309.15217)
-- Purpose: Persist Guardian RAGAS scores and cost reduction data for analytics
-- Version: MOTHER v68.3

-- Add RAGAS metric columns to queries table
ALTER TABLE queries 
  ADD COLUMN IF NOT EXISTS ragasFaithfulness DECIMAL(5,4) NULL COMMENT 'RAGAS faithfulness score 0-1',
  ADD COLUMN IF NOT EXISTS ragasAnswerRelevancy DECIMAL(5,4) NULL COMMENT 'RAGAS answer relevancy score 0-1',
  ADD COLUMN IF NOT EXISTS ragasContextPrecision DECIMAL(5,4) NULL COMMENT 'RAGAS context precision score 0-1',
  ADD COLUMN IF NOT EXISTS costReduction DECIMAL(8,4) NULL COMMENT 'Cost reduction percentage vs GPT-4 baseline';

-- Record migration
INSERT IGNORE INTO migrations_applied (filename, applied_at) VALUES ('0024_v68_sprint3_metrics.sql', NOW());
