-- v52.0: Cleanup test users created during v51.0 validation
-- Removes the test user (test-admin-v51@mother.ai) used for API validation
-- so the real user can register as the first admin.
-- This migration is idempotent: safe to run multiple times.
DELETE FROM users WHERE email = 'test-admin-v51@mother.ai';
