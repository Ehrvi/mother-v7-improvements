-- v50.0: Cleanup stuck native auth users from failed v49.0 deploy (JWT_SECRET was missing)
-- This removes all users with loginMethod='email_password' so the first registration
-- can correctly become the admin user after the JWT_SECRET fix is deployed.
-- This migration is safe to run multiple times (DELETE with WHERE is idempotent if no rows match)
DELETE FROM users WHERE loginMethod = 'email_password';
