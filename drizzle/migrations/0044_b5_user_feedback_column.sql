-- Migration 0044: B5/C7 — user_feedback column on queries table
-- Adds user satisfaction signal for RLHF / DPO fine-tuning pipeline
-- Scientific basis: Christiano et al. (2017) "Deep Reinforcement Learning from Human Preferences"
--   arXiv:1706.03741 — RLHF requires explicit human feedback signal
-- Values: NULL=no feedback, 1=positive, 0=negative
-- NULL default ensures backward compatibility

ALTER TABLE queries
  ADD COLUMN IF NOT EXISTS `user_feedback` TINYINT DEFAULT NULL
    COMMENT 'User satisfaction: 1=positive, 0=negative, NULL=no feedback (RLHF signal)';
