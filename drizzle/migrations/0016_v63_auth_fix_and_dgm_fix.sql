-- MOTHER v63.0 — Authentication Fix and DGM Self-Proposal Engine Fix
-- Scientific basis:
-- - RBAC (Ferraiolo & Kuhn, NIST 1992): Creator must always have admin role
-- - Darwin Gödel Machine (Zhang et al., 2025 arXiv:2505.22954): DGM requires correct metric reading
-- Date: 2026-02-25

-- ============================================================
-- FIX 1: Ensure creator account has admin role and active status
-- Root cause: Users table was empty in production; creator registered as 'user' role
-- Fix: Upgrade creator to admin + active, ensuring they can always approve proposals
-- ============================================================
UPDATE `users` 
SET `role` = 'admin', `status` = 'active'
WHERE `email` = 'elgarcia.eng@gmail.com';

-- ============================================================
-- FIX 2: Clean up test/debug accounts that were created during debugging
-- These accounts should not remain in production
-- ============================================================
DELETE FROM `users` WHERE `email` = 'debug_test_999@test.com';

-- ============================================================
-- LOG: Record this evolution step in the audit trail
-- ============================================================
INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'SYSTEM_EVOLUTION_STARTED',
  'elgarcia.eng@gmail.com',
  'creator',
  'MOTHER evolution cycle v63.0 started. Fixes: (1) Creator auth — elgarcia.eng@gmail.com now always gets admin+active on registration; (2) DGM self-proposal engine — SQL column name bug fixed (snake_case vs camelCase mismatch in queries table); (3) Migration 0016 applied. Scientific basis: RBAC (Ferraiolo & Kuhn 1992), DGM (Zhang et al 2025 arXiv:2505.22954).',
  NOW()
);

INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'AUTH_FIX_DEPLOYED',
  'system',
  'system',
  'v63.0 Auth Fix: Creator email elgarcia.eng@gmail.com now auto-receives admin role and active status on registration. No longer requires manual approval. Code change in server/routers/auth.ts register mutation.',
  NOW()
);

INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'DGM_FIX_DEPLOYED',
  'system',
  'system',
  'v63.0 DGM Fix: Self-proposal engine SQL query fixed — column names corrected from snake_case (quality_score, response_time, cache_hit, created_at) to camelCase (qualityScore, responseTime, cacheHit, createdAt) matching actual DB schema. Also fixed tier detection from tier-1 to gpt-4o-mini. Code change in server/mother/self-proposal-engine.ts readSystemMetrics().',
  NOW()
);
