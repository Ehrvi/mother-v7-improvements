-- ============================================================
-- Migration 0021: v65.1 — Fix Re-proposal Columns (MySQL 8.0 compatible)
-- 
-- Root cause: Migration 0020 used ADD COLUMN IF NOT EXISTS which is
-- not supported in MySQL 8.0. The migration runner logged warnings but
-- marked it as Applied, leaving columns missing.
--
-- Fix: Use simple ALTER TABLE ADD COLUMN statements. The migration runner
-- already ignores "Duplicate column name" errors (idempotent by design).
--
-- Scientific basis:
--   - SM-2 Algorithm (Wozniak, 1990): Spaced repetition for optimal retry timing
--   - Knowledge Wisdom Formula: W(d) = K_MOTHER(d) / K_SoA(d) × 100%
-- ============================================================

ALTER TABLE `self_proposals` ADD COLUMN `rejection_count` int NOT NULL DEFAULT 0 COMMENT 'Number of times this proposal has been rejected';
ALTER TABLE `self_proposals` ADD COLUMN `rejection_reason` text DEFAULT NULL COMMENT 'Last rejection reason from creator';
ALTER TABLE `self_proposals` ADD COLUMN `next_reproposal_at` timestamp NULL DEFAULT NULL COMMENT 'SM-2 calculated next re-proposal time';
ALTER TABLE `self_proposals` ADD COLUMN `ef_factor` float NOT NULL DEFAULT 2.5 COMMENT 'SM-2 Easiness Factor (2.5 = default, decreases with rejections)';
ALTER TABLE `self_proposals` ADD COLUMN `parent_proposal_id` int DEFAULT NULL COMMENT 'ID of the original proposal this is a re-proposal of';
ALTER TABLE `self_proposals` ADD COLUMN `improvement_notes` text DEFAULT NULL COMMENT 'What was improved in this re-proposal vs the original';

CREATE INDEX `idx_next_reproposal` ON `self_proposals` (`next_reproposal_at`, `status`);
CREATE INDEX `idx_parent_proposal` ON `self_proposals` (`parent_proposal_id`);

CREATE TABLE IF NOT EXISTS `knowledge_wisdom` (
  `id` int NOT NULL AUTO_INCREMENT,
  `domain` varchar(100) NOT NULL COMMENT 'Knowledge domain/category',
  `subdomain` varchar(100) DEFAULT NULL COMMENT 'Sub-area within domain',
  `soa_estimate` int NOT NULL DEFAULT 1000 COMMENT 'Estimated SoA knowledge chunks (baseline)',
  `description` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_domain_subdomain` (`domain`, `subdomain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `knowledge_wisdom` (`domain`, `subdomain`, `soa_estimate`, `description`) VALUES
  ('machine_learning', NULL, 5000, 'Machine Learning & Deep Learning fundamentals and advanced topics'),
  ('machine_learning', 'neural_networks', 2000, 'Neural network architectures and training'),
  ('machine_learning', 'reinforcement_learning', 1500, 'RL algorithms and applications'),
  ('machine_learning', 'nlp', 2500, 'Natural Language Processing and LLMs'),
  ('software_engineering', NULL, 4000, 'Software architecture, design patterns, best practices'),
  ('software_engineering', 'distributed_systems', 2000, 'Distributed systems and microservices'),
  ('software_engineering', 'databases', 1500, 'Database design and optimization'),
  ('mathematics', NULL, 6000, 'Mathematics: calculus, linear algebra, statistics, discrete math'),
  ('mathematics', 'statistics', 2000, 'Statistical methods and probability theory'),
  ('cognitive_science', NULL, 3000, 'Cognitive science, neuroscience, psychology of learning'),
  ('philosophy', NULL, 4000, 'Philosophy of mind, ethics, epistemology'),
  ('business', NULL, 3000, 'Business strategy, management, entrepreneurship'),
  ('health_fitness', NULL, 2000, 'Health, fitness, nutrition, sports science'),
  ('general', NULL, 10000, 'General knowledge across all domains');
