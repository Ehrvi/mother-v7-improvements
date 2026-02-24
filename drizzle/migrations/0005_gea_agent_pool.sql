-- MOTHER v45.0: Group-Evolving Agents (GEA) Tables
-- Scientific basis: Group-Evolving Agents (Weng et al., arXiv:2602.04837)
--
-- GEA treats a GROUP of agents as the fundamental evolutionary unit,
-- enabling explicit experience sharing and reuse within the group.

-- Agent Pool: maintains N=5 agents with Performance-Novelty scores
CREATE TABLE IF NOT EXISTS gea_agent_pool (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL UNIQUE,
  generation_id VARCHAR(255) NOT NULL,
  parent_ids TEXT,                          -- JSON array of parent agent IDs
  fitness_score FLOAT DEFAULT 0.0,          -- Empirical performance score (0-1)
  novelty_score FLOAT DEFAULT 0.0,          -- Diversity from other agents (0-1)
  performance_novelty_score FLOAT DEFAULT 0.0, -- Combined score: 0.7*fitness + 0.3*novelty
  strategies TEXT,                          -- JSON array of learned strategies
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pn_score (performance_novelty_score DESC),
  INDEX idx_generation (generation_id)
);

-- Shared Experience Pool: strategies and insights from successful agents
-- Core GEA innovation: all children benefit from all parents' discoveries
CREATE TABLE IF NOT EXISTS shared_experience (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_agent_id VARCHAR(255) NOT NULL,
  experience_type ENUM('strategy', 'tool', 'workflow', 'insight') DEFAULT 'strategy',
  content TEXT NOT NULL,                    -- The strategy/insight content
  fitness_impact FLOAT DEFAULT 0.0,         -- Fitness score of the source agent
  usage_count INT DEFAULT 0,               -- How many times this was used
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fitness_impact (fitness_impact DESC),
  INDEX idx_source_agent (source_agent_id),
  FOREIGN KEY (source_agent_id) REFERENCES gea_agent_pool(agent_id) ON DELETE CASCADE
);

-- DGM Task Queue: tracks async evolution tasks dispatched via Cloud Tasks
CREATE TABLE IF NOT EXISTS dgm_task_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL UNIQUE,
  goal TEXT NOT NULL,
  status ENUM('queued', 'running', 'completed', 'failed') DEFAULT 'queued',
  cloud_task_name VARCHAR(500),            -- Cloud Tasks task name for tracking
  fitness_score FLOAT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_run_id (run_id)
);
