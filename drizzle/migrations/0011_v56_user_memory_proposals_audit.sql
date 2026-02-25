-- MOTHER v56.0: Migration 0011
-- Implements 7 Mandatory Requirements:
-- Req #4: Per-user personalized memory (user_memory table)
-- Req #5: Interactive update proposal system (update_proposals table)
-- Req #6: Creator-only authorization (audit_log table)
-- Req #7: Autonomous self-updating with safety guarantees
-- Scientific basis:
--   MemGPT (Packer et al., 2023): Hierarchical memory management per user
--   RBAC (Ferraiolo & Kuhn, 1992): Role-based access control for creator authorization
--   Audit trails (ISO 27001): Tamper-evident logging for all system changes

-- ============================================================
-- user_memory: Per-user episodic memory (Req #4)
-- MemGPT-inspired hierarchical memory per user
-- ============================================================
CREATE TABLE IF NOT EXISTS `user_memory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `content` text NOT NULL,
  `embedding` mediumtext,
  `keywords` text,
  `context` varchar(500) DEFAULT 'General',
  `category` varchar(255) DEFAULT 'Uncategorized',
  `tags` text,
  `importance_score` float DEFAULT 0.5,
  `retrieval_count` int NOT NULL DEFAULT 0,
  `last_accessed` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_memory_user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- update_proposals: System for proposing and approving MOTHER updates (Req #5, #6, #7)
-- Only creator (elgarcia.eng@gmail.com) can approve
-- ============================================================
CREATE TABLE IF NOT EXISTS `update_proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposed_by` enum('creator','mother','system') NOT NULL DEFAULT 'mother',
  `title` varchar(500) NOT NULL,
  `description` text NOT NULL,
  `rationale` text,
  `affected_modules` text,
  `estimated_impact` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status` enum('pending','approved','rejected','implementing','completed','failed') NOT NULL DEFAULT 'pending',
  `approved_by_email` varchar(255),
  `approved_at` timestamp NULL,
  `rejected_reason` text,
  `implementation_notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- audit_log: Immutable audit trail for all system changes (Req #6)
-- Tamper-evident log - only creator can authorize changes
-- ============================================================
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` varchar(100) NOT NULL,
  `actor_email` varchar(255),
  `actor_type` enum('creator','user','system','mother') NOT NULL DEFAULT 'system',
  `target_type` varchar(100),
  `target_id` varchar(255),
  `details` text,
  `ip_address` varchar(45),
  `success` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Add userId to episodic_memory for per-user isolation (Req #4)
-- MySQL 8.0 compatible: no IF NOT EXISTS on ALTER TABLE ADD COLUMN
-- ============================================================
ALTER TABLE `episodic_memory` ADD COLUMN `user_id` int DEFAULT NULL;
ALTER TABLE `episodic_memory` ADD COLUMN `session_id` varchar(255) DEFAULT NULL;

-- ============================================================
-- system_config: Insert initial v56.0 configuration values
-- ============================================================
CREATE TABLE IF NOT EXISTS `system_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `config_key` varchar(255) NOT NULL,
  `config_value` text NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_config_key_unique` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
  ('mother_version', 'v56.0', 'Current MOTHER version'),
  ('learning_quality_threshold', '75', 'Minimum quality score to trigger learning (0-100). Lowered from 95 to 75 for gradual learning (Req #3).'),
  ('research_auto_ingest', 'true', 'Auto-ingest arXiv papers found during research (Req #2)'),
  ('creator_email', 'elgarcia.eng@gmail.com', 'Creator email for authorization checks (Req #6)'),
  ('continuous_learning_enabled', 'true', 'Enable scheduled continuous learning (Req #2, #3)'),
  ('max_paper_chunks', '100', 'Maximum chunks per paper for indexing'),
  ('user_memory_enabled', 'true', 'Enable per-user personalized memory (Req #4)'),
  ('proposals_require_creator_approval', 'true', 'Only creator can approve update proposals (Req #6)');
