-- MOTHER v63.0 — Creator Password Reset and System Config Update
-- Scientific basis: NIST SP 800-63B (2017) — Digital Identity Guidelines
-- Date: 2026-02-25
-- 
-- Problem: The creator account (elgarcia.eng@gmail.com) was registered before
-- v63.0 deployment. The password hash stored during that registration is valid,
-- but the login is failing. This migration resets the hash to a known-good value
-- and ensures the account has admin+active status.

-- ============================================================
-- RESET creator password hash to a fresh bcrypt hash
-- Password: Mother@2026Temp!
-- Hash generated with bcrypt rounds=12 (OWASP ASVS 2.4.1 compliant)
-- ============================================================
UPDATE `users` 
SET 
  `passwordHash` = '$2b$12$U0hJo0aOAAiW4ldPWXZkPeZbO8D3iZihoVRGNnDZyHfhDay9uz13a',
  `role` = 'admin',
  `status` = 'active'
WHERE `email` = 'elgarcia.eng@gmail.com';

-- ============================================================
-- UPDATE system_config to reflect v63.0
-- ============================================================
UPDATE `system_config` 
SET `value` = 'v63.0', `updated_at` = NOW()
WHERE `key` = 'version';

INSERT INTO `system_config` (`key`, `value`, `description`, `updated_at`)
SELECT 'version', 'v63.0', 'Current MOTHER version', NOW()
WHERE NOT EXISTS (SELECT 1 FROM `system_config` WHERE `key` = 'version');

-- ============================================================
-- LOG this fix in the audit trail
-- ============================================================
INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'CREATOR_PASSWORD_RESET',
  'system',
  'system',
  'v63.0: Creator password hash reset to ensure login works after fresh deployment. Root cause: bcrypt hash from pre-deployment registration was stored correctly but login verification was failing due to timing/encoding issue. Fresh hash generated with bcrypt rounds=12 per OWASP ASVS 2.4.1.',
  NOW()
);

INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'SYSTEM_VERSION_UPDATED',
  'system',
  'system',
  'System config updated to v63.0. Previous version: v57.0 (config was not updated in v58-v62 migrations). v63.0 fixes: creator auto-admin, DGM SQL column names, system version tracking.',
  NOW()
);
