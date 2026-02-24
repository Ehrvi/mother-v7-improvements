-- MOTHER v47.0: Fitness History & GEA Improvements
-- Scientific basis:
--   - Darwin Gödel Machine (Zhang et al., arXiv:2505.22954) — cross-generation fitness tracking
--   - Group-Evolving Agents (Weng et al., arXiv:2602.04837) — embedding-based novelty
--   - A-MEM (Xu et al., arXiv:2502.12110) — memory consolidation
--
-- Changes:
--   1. fitness_history: tracks fitness improvement across DGM generations
--   2. gea_agent_pool: adds full_fitness_breakdown (JSON) and embedding columns
--   3. gea_shared_experience: adds embedding column for embedding-based novelty
--   4. dgm_task_queue: adds full_fitness_breakdown column

-- 1. Fitness History Table: cross-generation fitness tracking
CREATE TABLE IF NOT EXISTS `fitness_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `run_id` VARCHAR(255) NOT NULL,
  `generation` INT NOT NULL DEFAULT 0,
  `fitness_score` FLOAT NOT NULL,
  `correctness` FLOAT DEFAULT 0.0,
  `efficiency` FLOAT DEFAULT 0.0,
  `robustness` FLOAT DEFAULT 0.0,
  `maintainability` FLOAT DEFAULT 0.0,
  `novelty` FLOAT DEFAULT 0.0,
  `label` VARCHAR(20) DEFAULT 'ACCEPTABLE',
  `parent_run_id` VARCHAR(255),
  `goal_summary` VARCHAR(500),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_run_id` (`run_id`),
  INDEX `idx_fitness` (`fitness_score`),
  INDEX `idx_generation` (`generation`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Add full_fitness_breakdown to gea_agent_pool
ALTER TABLE `gea_agent_pool` ADD COLUMN `full_fitness_breakdown` TEXT;

-- 3. Add embedding to gea_shared_experience for embedding-based novelty
ALTER TABLE `gea_shared_experience` ADD COLUMN `content_embedding` TEXT;

-- 4. Add full_fitness_breakdown to dgm_task_queue
ALTER TABLE `dgm_task_queue` ADD COLUMN `full_fitness_breakdown` TEXT;
