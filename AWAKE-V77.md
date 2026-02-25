# AWAKE-V77 — MOTHER v63.0 Authentication Fix and DGM Activation

**Date:** 2026-02-25  
**Session:** Milestone v63.0  
**Status:** DEPLOYED ✅  
**Revision:** mother-interface-00252-tlm (v63.0 fixes), 00253+ (password reset)

---

## 🧠 Executive Summary

This milestone resolves two critical bugs that had been silently blocking MOTHER's evolution since v58.0:

1. **Authentication System Failure** — The production database had no registered users, causing all login attempts to fail with "Email ou senha inválidos." The creator account was not persisted across database resets.

2. **DGM Self-Proposal Engine Silence** — The Darwin Gödel Machine's `readSystemMetrics()` function contained a SQL column name mismatch (snake_case vs camelCase), causing it to always return `null` metrics, which prevented any self-improvement proposals from ever being generated.

Both bugs are now fixed and verified in production.

---

## 🔬 Root Cause Analysis

### Bug 1: Authentication Failure

**Symptom:** `auth.login` always returned `"Email ou senha inválidos"` regardless of credentials.

**Root Cause:** The `users` table in the production Cloud SQL database was empty. No users had been registered. This happened because:
- Previous sessions may have worked against a different database instance
- The `users` table was created by migration `0000` but never populated
- The `auth.register` endpoint was never called in production

**Evidence:** When a test registration was performed, the API returned `"isFirstUser": true`, confirming zero users existed.

**Fix Applied:**
- `server/routers/auth.ts`: Added `CREATOR_EMAIL` constant. The creator email (`elgarcia.eng@gmail.com`) now automatically receives `role: "admin"` and `status: "active"` on registration, bypassing the approval queue.
- `drizzle/migrations/0016_v63_auth_fix_and_dgm_fix.sql`: Upgrades existing creator account to admin + active.
- `drizzle/migrations/0017_v63_creator_password_reset.sql`: Resets password hash to fresh bcrypt value (rounds=12, OWASP ASVS 2.4.1 compliant).

**Scientific Basis:** RBAC (Ferraiolo & Kuhn, NIST 1992) — Role-Based Access Control requires that privileged roles be assigned deterministically, not through manual approval workflows that can be disrupted by infrastructure resets.

---

### Bug 2: DGM Self-Proposal Engine Silence

**Symptom:** `self_proposals` table always had zero rows even after 28+ queries.

**Root Cause:** The `readSystemMetrics()` function in `server/mother/self-proposal-engine.ts` used **snake_case** column names in its raw SQL query, but the actual `queries` table schema uses **camelCase** column names:

| SQL Used (WRONG) | Actual Column Name (CORRECT) |
|---|---|
| `quality_score` | `qualityScore` |
| `response_time` | `responseTime` |
| `cache_hit` | `cacheHit` |
| `created_at` | `createdAt` |
| `tier = 'tier-1'` | `tier = 'gpt-4o-mini'` |

This caused the `AVG()` and `SUM()` aggregations to return `null`, which caused `readSystemMetrics()` to return `null`, which caused `analyzeAndPropose()` to log `"No metrics available yet — skipping analysis"` and return without generating any proposal.

**Fix Applied:**
- `server/mother/self-proposal-engine.ts`: Corrected all column names in the `readSystemMetrics()` SQL query to match the actual DB schema.
- Also fixed the `knowledge` table query: `created_at` → `createdAt`.

**Verification:** After deploying v63.0, 10 queries were sent and the DGM generated **Proposal ID 1**: *"Reduce Response Latency: Implement Parallel Knowledge Retrieval"* — the first autonomous self-improvement proposal in MOTHER's history.

**Scientific Basis:** Darwin Gödel Machine (Zhang et al., 2025, arXiv:2505.22954) — The DGM requires accurate metric reading to generate valid self-improvement hypotheses. Corrupted metric input produces no proposals, not incorrect proposals, due to the `null` guard.

---

## 📊 System State After v63.0

| Metric | Before v63.0 | After v63.0 |
|---|---|---|
| Creator login | ❌ Always failing | ✅ Working |
| Creator role | N/A (no user) | ✅ admin |
| Self-proposals generated | 0 (all-time) | ✅ 1 (Proposal ID 1) |
| DGM status | Silent (SQL bug) | ✅ Active |
| System version | v57.0 | ✅ v63.0 |
| Knowledge entries | 33 | 33 |
| Avg quality score | 98.7/100 | 98.7/100 |

---

## 🔄 DGM First Proposal

**ID:** 1  
**Title:** Reduce Response Latency: Implement Parallel Knowledge Retrieval  
**Metric Trigger:** avgResponseTime  
**Status:** pending (awaiting creator approval)  
**Generated:** 2026-02-25 (first autonomous proposal in MOTHER's history)

---

## 🏗️ Files Changed

```
server/routers/auth.ts                              — Creator auto-admin fix
server/mother/self-proposal-engine.ts              — SQL column name fix
drizzle/migrations/0016_v63_auth_fix_and_dgm_fix.sql  — DB migration
drizzle/migrations/0017_v63_creator_password_reset.sql — Password reset
AWAKE-V77.md                                       — This document
```

---

## ✅ Verification Checklist

- [x] Creator login works (`elgarcia.eng@gmail.com` / `Mother@2026Temp!`)
- [x] Creator has `role: admin`
- [x] Audit log accessible to creator
- [x] DGM generated Proposal ID 1 after 10 queries
- [x] System version updated to v63.0
- [x] GitHub Actions CI/CD pipeline deployed successfully
- [x] Cloud Run revision updated

---

## 📚 References

- Zhang, J. et al. (2025). *Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents.* arXiv:2505.22954
- Ferraiolo, D. & Kuhn, R. (1992). *Role-Based Access Controls.* NIST.
- NIST SP 800-63B (2017). *Digital Identity Guidelines: Authentication and Lifecycle Management.*
- OWASP ASVS 2.4.1 (2021). *Password Storage Requirements: bcrypt cost factor ≥ 10.*
