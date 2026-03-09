-- NC-COG-012: Domain-Adaptive Calibration History Table -- MOTHER v95.0 -- C211
-- Base: arXiv:2207.05221 (Kadavath et al. 2022) + arXiv:2510.16374 (2025)
-- Consenso Conselho: unanimidade (3/3 membros MAD)
-- Purpose: Store calibration history per cognitive domain for adaptive ECE correction
-- ECE target: 0.05 -> 0.02 with adaptive history

CREATE TABLE IF NOT EXISTS `calibration_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `domain` varchar(50) NOT NULL COMMENT 'Cognitive domain: formal_logic, creative_structured, etc.',
  `declared_score` float NOT NULL COMMENT 'Score declared by MOTHER before calibration',
  `observed_score` float NOT NULL COMMENT 'Observed/actual score after evaluation',
  `overconfidence` float NOT NULL COMMENT 'declared_score - observed_score (positive = overconfident)',
  `query_hash` varchar(64) DEFAULT NULL COMMENT 'SHA256 hash of query for deduplication',
  `session_id` varchar(128) DEFAULT NULL COMMENT 'Session identifier',
  `model_used` varchar(100) DEFAULT NULL COMMENT 'LLM model used for this response',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calibration_domain` (`domain`),
  KEY `idx_calibration_created` (`created_at`),
  KEY `idx_calibration_query_hash` (`query_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NC-COG-012: Adaptive calibration history per cognitive domain';
