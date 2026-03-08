-- Migration 0037: learning_evaluations + dgm_signals
-- MOTHER v88.0 | C206 | Sprint 7 | 2026-03-09
--
-- Base científica:
-- - G-EVAL: Liu et al. (2023) arXiv:2303.16634 — LLM-as-Judge evaluation framework
-- - Reflexion: Shinn et al. (2023) arXiv:2303.11366 — verbal reinforcement learning
-- - Darwin Gödel Machine: Zhang et al. (2025) arXiv:2505.22954 — self-improving AI
-- - IEEE 1028-2008 — Software Reviews and Audits
--
-- Tabelas criadas:
--   1. learning_evaluations — armazena avaliações G-EVAL de cada resposta
--   2. dgm_signals — armazena sinais de melhoria enviados ao DGM
--
-- Relacionamento: learning_evaluations (1) → (N) dgm_signals
-- Trigger: 3 avaliações consecutivas < 0.70 → dgm_signal gerado

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela 1: learning_evaluations
-- Armazena avaliações G-EVAL de cada resposta de MOTHER
-- Dimensões: coherence (0.30) + consistency (0.20) + fluency (0.15) + relevance (0.35)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `learning_evaluations` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `session_id` varchar(255) NOT NULL COMMENT 'ID da sessão de chat',
  `cycle_id` varchar(50) NOT NULL COMMENT 'Ciclo MOTHER (e.g., C206)',
  `query_hash` varchar(64) NOT NULL COMMENT 'SHA256 da query (privacidade)',
  `response_hash` varchar(64) NOT NULL COMMENT 'SHA256 da resposta (privacidade)',
  `g_eval_score` decimal(5,4) NOT NULL COMMENT 'Score G-EVAL composto [0.0-1.0]',
  `coherence` decimal(5,4) NOT NULL COMMENT 'Coerência [0.0-1.0] — peso 0.30',
  `consistency` decimal(5,4) NOT NULL COMMENT 'Consistência [0.0-1.0] — peso 0.20',
  `fluency` decimal(5,4) NOT NULL COMMENT 'Fluência [0.0-1.0] — peso 0.15',
  `relevance` decimal(5,4) NOT NULL COMMENT 'Relevância [0.0-1.0] — peso 0.35',
  `reflexion_triggered` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 se Reflexion foi ativado (score < 0.70)',
  `reflexion_critique` text COMMENT 'Critique gerada pelo Reflexion (Shinn 2023)',
  `dgm_signal_sent` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 se sinal DGM foi enviado (3 consecutivos < threshold)',
  `evaluation_model` varchar(100) NOT NULL DEFAULT 'gpt-4o' COMMENT 'Modelo usado para G-EVAL',
  `evaluation_latency_ms` int COMMENT 'Latência da avaliação G-EVAL em ms',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_le_session_id` (`session_id`),
  INDEX `idx_le_cycle_id` (`cycle_id`),
  INDEX `idx_le_g_eval_score` (`g_eval_score`),
  INDEX `idx_le_created_at` (`created_at`),
  INDEX `idx_le_reflexion_triggered` (`reflexion_triggered`),
  INDEX `idx_le_dgm_signal_sent` (`dgm_signal_sent`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='G-EVAL evaluations for Closed-Loop Learning — C206 | arXiv:2303.16634';

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela 2: dgm_signals
-- Armazena sinais de melhoria enviados ao DGM pelo Closed-Loop Learning
-- Trigger: 3 avaliações consecutivas com G-EVAL < 0.70
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dgm_signals` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `cycle_id` varchar(50) NOT NULL COMMENT 'Ciclo MOTHER que gerou o sinal',
  `trigger_reason` text NOT NULL COMMENT 'Razão do sinal (e.g., "3 consecutive G-EVAL < 0.70")',
  `consecutive_count` int NOT NULL DEFAULT 3 COMMENT 'Número de avaliações consecutivas abaixo do threshold',
  `avg_g_eval_score` decimal(5,4) NOT NULL COMMENT 'Média G-EVAL das avaliações que geraram o sinal',
  `min_g_eval_score` decimal(5,4) NOT NULL COMMENT 'Menor G-EVAL das avaliações que geraram o sinal',
  `weakness_pattern` text COMMENT 'Padrão de fraqueza identificado (Reflexion critique)',
  `dgm_proposal_generated` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 se o DGM gerou proposta em resposta ao sinal',
  `dgm_proposal_id` varchar(36) COMMENT 'ID da proposta DGM gerada (FK para dgm_proposals se existir)',
  `resolution_status` enum('pending','in_progress','resolved','dismissed') NOT NULL DEFAULT 'pending',
  `resolved_at` timestamp NULL COMMENT 'Quando o sinal foi resolvido',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ds_cycle_id` (`cycle_id`),
  INDEX `idx_ds_resolution_status` (`resolution_status`),
  INDEX `idx_ds_created_at` (`created_at`),
  INDEX `idx_ds_avg_g_eval` (`avg_g_eval_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='DGM improvement signals from Closed-Loop Learning — C206 | arXiv:2505.22954';

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Inserir sinal DGM inicial para validar a tabela
-- Representa o estado pré-C206: ciclo cognitivo estava ABERTO antes de C205
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `dgm_signals`
  (`id`, `cycle_id`, `trigger_reason`, `consecutive_count`, `avg_g_eval_score`, `min_g_eval_score`, `weakness_pattern`, `resolution_status`, `resolved_at`)
VALUES
  (
    'c205-baseline-signal',
    'C205',
    'Baseline signal: closed-loop learning activated in C205. Prior to C205, cognitive loop was OPEN (no G-EVAL feedback to DGM). This signal marks the transition to closed-loop operation.',
    3,
    0.6800,
    0.6200,
    'Open cognitive loop: RESPONSE→G-EVAL→MEMORY→DGM chain was not connected. DGM was generating proposals without consuming feedback from previous sessions (NC-LOOP-001).',
    'resolved',
    NOW()
  );
