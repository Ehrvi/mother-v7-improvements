-- MOTHER v63.0 — Corrected Column Names Fix
-- Fixes migration 0017 which used wrong column names for system_config
-- system_config uses: config_key, config_value (NOT key, value)
-- users table uses: passwordHash (camelCase, correct)
-- Date: 2026-02-25

-- ============================================================
-- FIX: Reset creator password hash (correct column names)
-- Password: Mother@2026Temp!
-- Hash: bcrypt rounds=12 (OWASP ASVS 2.4.1)
-- ============================================================
UPDATE `users` 
SET 
  `passwordHash` = '$2b$12$U0hJo0aOAAiW4ldPWXZkPeZbO8D3iZihoVRGNnDZyHfhDay9uz13a',
  `role` = 'admin',
  `status` = 'active'
WHERE `email` = 'elgarcia.eng@gmail.com';

-- ============================================================
-- FIX: Update system version to v63.0 (correct column names)
-- system_config uses config_key and config_value
-- ============================================================
UPDATE `system_config` 
SET `config_value` = 'v63.0', `updated_at` = NOW()
WHERE `config_key` = 'mother_version';

INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`)
VALUES ('mother_version', 'v63.0', 'Current MOTHER version — v63.0 Auth Fix and DGM Activation');

-- ============================================================
-- LOG this correction in the audit trail
-- ============================================================
INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'MIGRATION_COMPLETED',
  'system',
  'system',
  'Migration 0018 applied. Corrected column names from migration 0017: system_config uses config_key/config_value (not key/value). Creator password hash reset successful. System version updated to v63.0.',
  NOW()
);
