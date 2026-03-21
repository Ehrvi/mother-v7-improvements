# AWAKE-V61: MOTHER v46.0 - Async/Await Bug Fix & GEA Validation

**Date:** 2026-02-25 15:30 GMT+11
**Version:** 46.0
**Status:** VALIDATED

## 1. Executive Summary

Version 46.0 successfully addresses a critical `async/await` bug that was preventing the Group-Evolving Agents (GEA) framework from persisting its state to the Cloud SQL database. The bug caused the database connection to be `undefined` in the asynchronous context of a Cloud Tasks callback, leading to a `TypeError: Cannot read properties of undefined (reading 'query')`.

This release also includes fixes for MySQL 8.0 compatibility in database migrations and corrects a table name reference in the GEA supervisor. With these fixes, the entire DGM/GEA loop is now executing and persisting state correctly in the production environment.

## 2. Key Bugs Fixed

### 2.1. Critical: Missing `await` on `getDb()` in Async Contexts

- **Symptom:** `TypeError: Cannot read properties of undefined (reading 'query')` in Cloud Run logs during Cloud Tasks callback execution for `/api/dgm/execute`.
- **Root Cause:** The `getDb()` function is asynchronous and returns a `Promise`. In both `server/_core/production-entry.ts` (the Cloud Tasks handler) and `server/routers/mother.ts` (the initial task queueing endpoint), the function was called without `await`, resulting in an `undefined` database object.
- **Fix:** Added `await` to all `getDb()` calls in asynchronous contexts. A full codebase audit was performed to ensure no other instances of this bug existed.

### 2.2. Bug: Incorrect Cloud SQL Instance in `cloudbuild.yaml`

- **Symptom:** Initial debugging showed that the Unix socket connection to the Sydney database was not being established correctly, despite the `DATABASE_URL` secret being correct.
- **Root Cause:** The `cloudbuild.yaml` deployment configuration was still referencing the old `us-central1` Cloud SQL instance via the `--add-cloudsql-instances` flag (`mothers-library-mcp:us-central1:mother-db`).
- **Fix:** Updated `cloudbuild.yaml` to point to the correct Sydney instance: `mothers-library-mcp:australia-southeast1:mother-db-sydney`.

### 2.3. Bug: Incorrect Table Name in GEA Supervisor

- **Symptom:** `Error: Table 'mother_v7_prod.shared_experience' doesn't exist` in Cloud Run logs.
- **Root Cause:** The database migration `0005_gea_agent_pool.sql` correctly named the table `gea_shared_experience`, but the code in `server/mother/gea_supervisor.ts` was still referencing the old name `shared_experience`.
- **Fix:** Updated all SQL queries in `gea_supervisor.ts` to use the correct `gea_shared_experience` table name.

### 2.4. Bug: MySQL 8.0 Incompatible Migration Syntax

- **Symptom:** Database migrations `0004` and `0005` were failing silently or causing warnings because Cloud SQL for MySQL 8.0 does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS`.
- **Fix:**
    - Rewrote `0004_amem_zettelkasten.sql` to use separate `ALTER TABLE ... ADD COLUMN` statements without `IF NOT EXISTS`.
    - Improved the migration runner in `production-entry.ts` to more robustly handle and ignore "Duplicate column name" and "Duplicate key name" errors, making the migrations idempotent.

## 3. Validation

End-to-end validation was performed by triggering the `/api/trpc/mother.supervisor.evolve` endpoint. The following results confirm the success of v46.0:

- **Cloud Tasks Execution:** The Cloud Tasks callback for run `b7bf1bba-fd5a-4267-af3a-e8ff1f016827` completed successfully.
- **No TypeError:** The `TypeError: Cannot read properties of undefined (reading 'query')` error is **no longer present** in the logs.
- **Database Persistence:** The logs confirm that the new agent was successfully stored in the database:
  > `[GEA] Agent b7bf1bba stored in pool (fitness=0.50, novelty=1.00, pn=0.65)`
- **Full GEA Loop Completion:** The entire GEA evolution loop completed without errors:
  > `[DGM] GEA evolution completed for run_id=b7bf1bba-fd5a-4267-af3a-e8ff1f016827`

## 4. System State

- **Cloud Run Revision:** `mother-interface-00215-q74` is serving 100% of traffic.
- **Image Digest:** `sha256:06b2fc1c9f63324ee8f7537ff73977959aa625f85c2e9a788ee819afc3b3fd89`
- **Database:** All migrations are applied, and all GEA tables (`gea_agent_pool`, `gea_shared_experience`, `dgm_task_queue`) are populated correctly.

**Conclusion:** MOTHER v46.0 is stable and validated. The core DGM/GEA evolution loop is now functioning as designed in production as intended.
