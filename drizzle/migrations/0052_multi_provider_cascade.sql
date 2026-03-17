-- Migration 0026: Multi-Provider Cascade Router
-- Adds columns to track provider, model name, and query category per query
-- Scientific basis: FrugalGPT (Chen et al., 2023) - tracking per-provider metrics
-- enables continuous optimization of the cascade routing thresholds

ALTER TABLE queries ADD COLUMN provider VARCHAR(64) DEFAULT 'openai';
ALTER TABLE queries ADD COLUMN modelName VARCHAR(128) DEFAULT 'gpt-4o';
ALTER TABLE queries ADD COLUMN queryCategory VARCHAR(64) DEFAULT 'general';
