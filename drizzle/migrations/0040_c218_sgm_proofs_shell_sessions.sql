-- Migration 0040: C218 — sgm_proofs + shell_sessions tables
-- MOTHER v100.0 → v105.0 — Phase 4 Production SHMS
-- Conselho dos 6 — Protocolo Delphi + MAD — 2026-03-10
--
-- Base científica:
-- - Schmidhuber (2006) Gödel Machines: sgm_proofs table for Bayesian self-modification records
-- - arXiv:2512.09458 Agentic AI Architectures: shell_sessions for persistent execution context
-- - ISO 13822:2010: shms_alert_log for geotechnical alert audit trail

-- ============================================================
-- TABLE: sgm_proofs
-- Stores Bayesian proof records for SGM self-modification decisions
-- P(benefit|evidence) = P(evidence|benefit) × P(benefit) / P(evidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS sgm_proofs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposal_id VARCHAR(255) NOT NULL,
  hypothesis TEXT NOT NULL,
  prior_probability FLOAT NOT NULL COMMENT 'P(benefit) based on historical success rate',
  likelihood_ratio FLOAT NOT NULL COMMENT 'P(evidence|benefit) from static code analysis',
  posterior_probability FLOAT NOT NULL COMMENT 'Bayes posterior: P(benefit|evidence)',
  risk_score FLOAT NOT NULL COMMENT 'Risk = (1-posterior) × estimatedRisk × moduleCriticality',
  approved TINYINT(1) DEFAULT 0 COMMENT '1 if posterior >= 0.95 AND risk_score <= 0.001',
  reasoning TEXT,
  affected_modules JSON,
  success_rate FLOAT DEFAULT NULL COMMENT 'Updated after execution with actual outcome',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME DEFAULT NULL,
  INDEX idx_proposal_id (proposal_id),
  INDEX idx_approved (approved),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SGM Bayesian proof records — arXiv:2510.10232';

-- ============================================================
-- TABLE: shell_sessions
-- Stores persistent shell session state for NC-SENS-001
-- arXiv:2512.09458: Agentic AI needs persistent execution context
-- ============================================================
CREATE TABLE IF NOT EXISTS shell_sessions (
  id VARCHAR(255) PRIMARY KEY,
  state ENUM('idle', 'running', 'error') DEFAULT 'idle',
  working_dir VARCHAR(1024) DEFAULT '/home/ubuntu',
  env_vars JSON COMMENT 'Session environment variables snapshot',
  history JSON COMMENT 'Array of CommandResult objects',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_command_at DATETIME DEFAULT NULL,
  total_commands INT DEFAULT 0,
  total_execution_ms BIGINT DEFAULT 0,
  INDEX idx_state (state),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Persistent shell sessions — NC-SENS-001';

-- ============================================================
-- TABLE: shms_alert_log
-- Audit trail for SHMS alerts sent via Email/SMS
-- ISO 13822:2010: geotechnical alert documentation requirement
-- ============================================================
CREATE TABLE IF NOT EXISTS shms_alert_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id VARCHAR(255) NOT NULL,
  sensor_id VARCHAR(255) NOT NULL,
  alert_type ENUM('CRITICAL', 'WARNING', 'INFO') NOT NULL,
  metric_name VARCHAR(255) NOT NULL,
  metric_value FLOAT NOT NULL,
  threshold FLOAT NOT NULL,
  channel ENUM('email', 'sms', 'fcm', 'webhook') NOT NULL,
  recipient VARCHAR(512) NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  delivery_status ENUM('pending', 'sent', 'failed', 'delivered') DEFAULT 'pending',
  delivery_latency_ms INT DEFAULT NULL COMMENT 'Time from detection to delivery',
  error_message TEXT DEFAULT NULL,
  site_id VARCHAR(255) DEFAULT NULL COMMENT 'Multi-tenant site identifier',
  INDEX idx_alert_id (alert_id),
  INDEX idx_sensor_id (sensor_id),
  INDEX idx_sent_at (sent_at),
  INDEX idx_delivery_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SHMS alert audit log — ISO 13822:2010';

-- ============================================================
-- TABLE: shms_federated_sites
-- Multi-site registry for Federated Learning SHMS
-- arXiv:1811.11400: McMahan et al., Federated Learning
-- ============================================================
CREATE TABLE IF NOT EXISTS shms_federated_sites (
  id VARCHAR(255) PRIMARY KEY,
  site_name VARCHAR(255) NOT NULL,
  site_url VARCHAR(1024),
  public_key TEXT COMMENT 'RSA public key for secure gradient exchange',
  last_sync_at DATETIME DEFAULT NULL,
  model_version VARCHAR(64) DEFAULT 'v1.0',
  local_samples INT DEFAULT 0 COMMENT 'Number of local training samples',
  contribution_weight FLOAT DEFAULT 1.0 COMMENT 'FedAvg weight = local_samples / total_samples',
  status ENUM('active', 'inactive', 'syncing') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Federated Learning site registry — arXiv:1811.11400';
