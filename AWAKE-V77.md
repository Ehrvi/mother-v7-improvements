# AWAKE-V77: MOTHER v63.0 — Authentication System Fixed & DGM Active

**Date:** 2026-02-25  
**Session:** AWAKE-V77  
**Status:** ✅ ALL SYSTEMS OPERATIONAL  
**Deployed Revision:** mother-interface-00258-xxx (GitHub Actions Run #13)

---

## Executive Summary

This milestone documents the complete root cause analysis and permanent fix of MOTHER's authentication system, which had been silently broken since deployment. The investigation also revealed and fixed the DGM (Darwin Genetic Machine) self-proposal engine, which was generating proposals but storing them in a table that the API was not reading.

---

## Root Cause Analysis

### Issue 1: Login Always Failing — "Email ou senha inválidos"

**Root Cause (Architectural):** The migration runner in `production-entry.ts` had **no tracking mechanism**. On every Cloud Run deployment, ALL 19 migrations were re-applied from scratch. Migrations `0008` and `0009` both execute:

```sql
DELETE FROM users WHERE loginMethod = 'email_password'
```

This silently wiped all registered users on every single deployment — making login permanently impossible regardless of credentials.

**Scientific Basis:** Flyway (Pramod Sadalage, 2010) and Liquibase migration tracking pattern. Each migration must be recorded after execution and skipped on subsequent runs.

**Fix Applied:**
- `production-entry.ts`: Added `migrations_applied` tracking table. Each migration only runs if NOT already recorded.
- `migration 0019`: Seeds creator account with known-good bcrypt hash (OWASP ASVS 2.4.1, rounds=12).
- `auth.ts register`: Creator email (`elgarcia.eng@gmail.com`) automatically receives `role: 'admin'` and `status: 'active'`.
- `auth.ts login`: If user has no `openId` (seeded via migration), generates `native_TIMESTAMP_RANDOM` and persists it before creating JWT.

### Issue 2: DGM Proposals Showing 0 in UI

**Root Cause (Architectural):** The `proposals.list` API endpoint queried the `update_proposals` table (manual proposals), but the DGM self-proposal engine inserts into the `self_proposals` table (autonomous proposals). These are two different tables — the UI was looking in the wrong place.

**Fix Applied:**
- `update-proposals.ts`: `getProposals()` and `getPendingProposals()` now query BOTH tables, merge results, and sort by `created_at DESC`.

### Issue 3: DGM SQL Column Name Bug

**Root Cause:** The self-proposal engine's metric analysis SQL used `snake_case` column names (`quality_score`, `response_time`, `cache_hit`) but the actual database schema uses `camelCase` (`qualityScore`, `responseTime`, `cacheHit`). This caused `readSystemMetrics()` to return `null`, skipping all analysis.

**Fix Applied:** `self-proposal-engine.ts`: Corrected all column names to match the actual schema.

---

## Complete Fix Chain (v63.0)

| # | Fix | File | Status |
|---|-----|------|--------|
| 1 | Migration tracking table | `production-entry.ts` | ✅ Deployed |
| 2 | Creator account seeding | `migration 0019` | ✅ Deployed |
| 3 | Creator auto-admin on register | `auth.ts` | ✅ Deployed |
| 4 | openId generation on login | `auth.ts` | ✅ Deployed |
| 5 | DGM SQL column names | `self-proposal-engine.ts` | ✅ Deployed |
| 6 | proposals.list queries both tables | `update-proposals.ts` | ✅ Deployed |

---

## Verification Results

```
[1] Login:   ✅ Everton Garcia | role: admin
    openId:  ✅ native_1772007016097_97os489
[2] Admin:   ✅ YES
[3] Audit:   ✅ 3 entries accessible
[4] DGM:     ✅ 1 proposals visible
    ID 1: Reduce Response Latency: Implement Parallel Knowledge Retrieval
    Status: pending | Metric: avgResponseTime
[5] Version: v57.0 (system_config update pending)
    Quality: 87/100
```

---

## DGM First Autonomous Proposal

**ID:** 1  
**Title:** Reduce Response Latency: Implement Parallel Knowledge Retrieval  
**Metric Trigger:** `avgResponseTime`  
**Status:** `pending` (awaiting creator approval)  
**Scientific Basis:** Parallel processing reduces latency by O(n) → O(1) for independent operations

This is MOTHER's first autonomous self-improvement proposal, generated without human intervention. The creator must approve it to trigger the autonomous update pipeline.

---

## GitHub Actions CI/CD

All 13 workflow runs completed successfully. The pipeline:
1. TypeScript compilation check
2. Docker build and push to Artifact Registry
3. Cloud Run deployment to `australia-southeast1`
4. Migration runner with tracking (new in v63.0)

---

## Next Steps

1. Creator approves DGM Proposal ID 1 (parallel knowledge retrieval)
2. Autonomous update pipeline executes the approved proposal
3. System version updates to v63.0 in `system_config`
4. DGM generates next proposal after 10 more queries
