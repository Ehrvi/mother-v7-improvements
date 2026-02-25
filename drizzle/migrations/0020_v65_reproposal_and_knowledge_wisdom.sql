-- ============================================================
-- Migration 0020: v65.0 — Re-proposal Engine + Knowledge Wisdom
-- Scientific basis:
--   - SM-2 Algorithm (Wozniak, 1990): Spaced repetition for optimal retry timing
--   - Exponential Backoff with Jitter (AWS Builders Library, 2019)
--   - Knowledge Wisdom Formula: W(d) = K_MOTHER(d) / K_SoA(d) × 100%
-- ============================================================

-- Add re-proposal tracking columns to self_proposals
ALTER TABLE `self_proposals`
  ADD COLUMN IF NOT EXISTS `rejection_count` int NOT NULL DEFAULT 0 COMMENT 'Number of times this proposal has been rejected',
  ADD COLUMN IF NOT EXISTS `rejection_reason` text DEFAULT NULL COMMENT 'Last rejection reason from creator',
  ADD COLUMN IF NOT EXISTS `next_reproposal_at` timestamp NULL DEFAULT NULL COMMENT 'SM-2 calculated next re-proposal time',
  ADD COLUMN IF NOT EXISTS `ef_factor` float NOT NULL DEFAULT 2.5 COMMENT 'SM-2 Easiness Factor (2.5 = default, decreases with rejections)',
  ADD COLUMN IF NOT EXISTS `parent_proposal_id` int DEFAULT NULL COMMENT 'ID of the original proposal this is a re-proposal of',
  ADD COLUMN IF NOT EXISTS `improvement_notes` text DEFAULT NULL COMMENT 'What was improved in this re-proposal vs the original';

-- Add index for re-proposal scheduling
CREATE INDEX IF NOT EXISTS `idx_next_reproposal` ON `self_proposals` (`next_reproposal_at`, `status`);
CREATE INDEX IF NOT EXISTS `idx_parent_proposal` ON `self_proposals` (`parent_proposal_id`);

-- ============================================================
-- Knowledge Wisdom Reference Table
-- Stores estimated State-of-the-Art knowledge volume per domain
-- Used to calculate W(d) = K_MOTHER(d) / K_SoA(d) × 100%
-- ============================================================
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

-- Seed baseline SoA estimates per domain
-- Based on: estimated number of meaningful knowledge chunks to master a domain
-- Source: Bloom's taxonomy + expert knowledge acquisition research (Anders Ericsson, 2006)
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
