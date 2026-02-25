-- MOTHER v63.0 — Seed Creator Account (runs ONCE due to migration tracking)
-- Now that production-entry.ts has migration tracking (migrations_applied table),
-- this migration will only run once and will NOT be re-applied on subsequent deployments.
--
-- This seeds the creator account with a known-good bcrypt hash.
-- Password: Mother@2026Temp!
-- Hash: bcrypt rounds=12 (OWASP ASVS 2.4.1)
-- Generated: 2026-02-25
--
-- If the creator account already exists (from a previous registration), this
-- UPDATE will refresh the hash to the known-good value.
-- If the account does not exist, the INSERT IGNORE will create it.

-- Update existing creator account
UPDATE `users` 
SET 
  `passwordHash` = '$2b$12$U0hJo0aOAAiW4ldPWXZkPeZbO8D3iZihoVRGNnDZyHfhDay9uz13a',
  `role` = 'admin',
  `status` = 'active',
  `loginMethod` = 'email_password'
WHERE `email` = 'elgarcia.eng@gmail.com';

-- Insert creator account if it doesn't exist
INSERT IGNORE INTO `users` (`name`, `email`, `passwordHash`, `loginMethod`, `role`, `status`)
VALUES (
  'Everton Garcia',
  'elgarcia.eng@gmail.com',
  '$2b$12$U0hJo0aOAAiW4ldPWXZkPeZbO8D3iZihoVRGNnDZyHfhDay9uz13a',
  'email_password',
  'admin',
  'active'
);

-- Update system version
UPDATE `system_config` 
SET `config_value` = 'v63.0', `updated_at` = NOW()
WHERE `config_key` = 'mother_version';

-- Log this seeding
INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'CREATOR_ACCOUNT_SEEDED',
  'system',
  'system',
  'Migration 0019: Creator account seeded with known-good bcrypt hash. This migration runs ONCE due to migrations_applied tracking table introduced in v63.0. Root cause of persistent login failure: migrations 0008 and 0009 were deleting all email_password users on every deployment because the migration runner had no tracking mechanism.',
  NOW()
);
