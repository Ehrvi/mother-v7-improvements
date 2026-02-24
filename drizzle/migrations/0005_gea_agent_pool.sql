-- MOTHER v45.0: Group-Evolving Agents (GEA) Tables
-- Scientific basis: Group-Evolving Agents (Weng et al., arXiv:2602.04837)
-- FIX v46.0: Corrected table name (gea_shared_experience), removed FK, fixed DESC index
--
-- GEA treats a GROUP of agents as the fundamental evolutionary unit,
-- enabling explicit experience sharing and reuse within the group.

-- Agent Pool: maintains N=5 agents with Performance-Novelty scores
CREATE TABLE IF NOT EXISTS `gea_agent_pool` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `agent_id` VARCHAR(255) NOT NULL UNIQUE,
  `generation_id` VARCHAR(255) NOT NULL,
  `parent_ids` TEXT,
  `fitness_score` FLOAT DEFAULT 0.0,
  `novelty_score` FLOAT DEFAULT 0.0,
  `performance_novelty_score` FLOAT DEFAULT 0.0,
  `strategies` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_pn_score` (`performance_novelty_score`),
  INDEX `idx_generation` (`generation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Shared Experience Pool: strategies and insights from successful agents
-- Core GEA innovation: all children benefit from all parents' discoveries
-- NOTE: Named gea_shared_experience (not shared_experience) to match gea_supervisor.ts
CREATE TABLE IF NOT EXISTS `gea_shared_experience` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `source_agent_id` VARCHAR(255) NOT NULL,
  `experience_type` ENUM('strategy', 'tool', 'workflow', 'insight') DEFAULT 'strategy',
  `content` TEXT NOT NULL,
  `fitness_impact` FLOAT DEFAULT 0.0,
  `usage_count` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_fitness_impact` (`fitness_impact`),
  INDEX `idx_source_agent` (`source_agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DGM Task Queue: tracks async evolution tasks dispatched via Cloud Tasks
CREATE TABLE IF NOT EXISTS `dgm_task_queue` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `run_id` VARCHAR(255) NOT NULL UNIQUE,
  `goal` TEXT NOT NULL,
  `status` ENUM('queued', 'running', 'completed', 'failed') DEFAULT 'queued',
  `cloud_task_name` VARCHAR(500),
  `fitness_score` FLOAT,
  `error_message` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`),
  INDEX `idx_run_id` (`run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
