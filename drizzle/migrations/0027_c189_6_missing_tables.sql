-- C189 NC-DB-001 FIX — 6 tabelas ausentes no banco de produção mother_v7_prod
-- Gerado em: 2026-03-08 | Auditoria C188 → C189
-- Execute no Cloud SQL Studio selecionando o banco: mother_v7_prod
-- SEGURO: usa CREATE TABLE IF NOT EXISTS — não quebra nada se já existir

CREATE TABLE IF NOT EXISTS `dgm_task_queue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `run_id` varchar(255) NOT NULL,
  `task_type` varchar(100) NOT NULL,
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `payload` text,
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fitness_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agent_id` varchar(100) DEFAULT NULL,
  `fitness_score` float NOT NULL,
  `quality_score` float DEFAULT NULL,
  `cache_hit_rate` float DEFAULT NULL,
  `avg_response_time_ms` int DEFAULT NULL,
  `generation_number` int DEFAULT 0,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gea_agent_pool` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agent_id` varchar(100) NOT NULL,
  `system_prompt` text,
  `performance_novelty_score` float DEFAULT 0,
  `generation_number` int DEFAULT 0,
  `parent_ids` text,
  `mutation_type` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gea_shared_experience` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy` text NOT NULL,
  `performance_gain` float DEFAULT 0,
  `usage_count` int DEFAULT 0,
  `source_agent_id` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `knowledge_wisdom` (
  `id` int NOT NULL AUTO_INCREMENT,
  `insight` text NOT NULL,
  `source_ids` text,
  `confidence_score` float DEFAULT 0.5,
  `domain` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `self_proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(500) NOT NULL,
  `description` text,
  `hypothesis` text,
  `metric_trigger` varchar(255) DEFAULT NULL,
  `metric_value` varchar(50) DEFAULT NULL,
  `metric_target` float DEFAULT NULL,
  `proposed_changes` text,
  `fitness_function` text,
  `version_tag` varchar(50) DEFAULT NULL,
  `scientific_basis` text,
  `rejection_count` int DEFAULT 0,
  `ef_factor` float DEFAULT 2.5,
  `parent_proposal_id` int DEFAULT NULL,
  `improvement_notes` text,
  `approved_at` timestamp NULL DEFAULT NULL,
  `approved_by` varchar(100) DEFAULT NULL,
  `next_reproposal_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text,
  `status` enum('pending','approved','rejected','implemented','failed','in_progress') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verificação: mostre as tabelas criadas
SELECT table_name, table_rows, create_time 
FROM information_schema.tables 
WHERE table_schema = 'mother_v7_prod' 
  AND table_name IN ('dgm_task_queue','fitness_history','gea_agent_pool','gea_shared_experience','knowledge_wisdom','self_proposals')
ORDER BY table_name;
