-- Migration: 0010_self_proposals_schema_drift_fix.sql
-- Sprint 2 (Ciclo 181): NC-SCHEMA-DRIFT-002
-- Adds 12 missing columns to self_proposals table
-- Scientific basis: Lehman (1980) — software evolution laws; ISO/IEC 25010:2011 maintainability
-- Run with: pnpm db:push (or apply manually to production MySQL)

ALTER TABLE `self_proposals`
  ADD COLUMN IF NOT EXISTS `metric_target` FLOAT NULL,
  ADD COLUMN IF NOT EXISTS `proposed_changes` TEXT NULL COMMENT 'JSON: { files, changes[] }',
  ADD COLUMN IF NOT EXISTS `fitness_function` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `version_tag` VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS `scientific_basis` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `rejection_count` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `ef_factor` FLOAT NOT NULL DEFAULT 2.5 COMMENT 'SuperMemo EF factor (Wozniak 1987)',
  ADD COLUMN IF NOT EXISTS `parent_proposal_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `improvement_notes` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `approved_at` TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `approved_by` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `next_reproposal_at` TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `rejection_reason` TEXT NULL;

-- Also fix the status enum to include 'failed' and 'in_progress'
-- Note: MySQL requires MODIFY COLUMN to change enum values
ALTER TABLE `self_proposals`
  MODIFY COLUMN `status` ENUM('pending','approved','rejected','implemented','failed','in_progress') NOT NULL DEFAULT 'pending';

-- Verify
SELECT COUNT(*) as total_columns 
FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'self_proposals' 
AND TABLE_SCHEMA = DATABASE();
-- Expected: 22 columns (10 original + 12 new)
