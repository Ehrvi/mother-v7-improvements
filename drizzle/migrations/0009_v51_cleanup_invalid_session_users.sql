-- v51.0: Cleanup native auth users created during v50.0 deploy where VITE_APP_ID was missing.
-- These users have valid password hashes but their JWT sessions are invalid because appId=""
-- was embedded in the token, causing 'Session payload missing required fields' on every request.
-- Deleting them allows the first registration to correctly become the admin user again.
-- This migration is idempotent: safe to run multiple times.
DELETE FROM users WHERE loginMethod = 'email_password';
