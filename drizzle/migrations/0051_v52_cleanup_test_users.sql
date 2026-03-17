-- v52.0: Cleanup test users created during v51.0 validation
-- Removes test users created during API validation so the real user
-- can register as the first admin with their correct name.
-- This migration is idempotent: safe to run multiple times.
DELETE FROM users WHERE email = 'test-admin-v51@mother.ai';
DELETE FROM users WHERE email = 'elgarcia.eng@gmail.com' AND name = 'Check';
