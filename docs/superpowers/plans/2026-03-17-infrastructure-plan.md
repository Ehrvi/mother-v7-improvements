# Infrastructure/DB Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix migration system, add vector cache, clean deps, fix CI, add Drizzle relations, add feedback column.

**Architecture:** Single migration directory, consolidated journal, LRU cache layer, correct CI package manager.

**Tech Stack:** TypeScript, Drizzle ORM, MySQL, GitHub Actions, pnpm, Docker

---

## Execution Order

**C1 must run first** (establishes clean migration foundation). C2 and C7 depend on the journal being correct. C3, C4, C5, C6 are independent.

Recommended sequence: **C1 → C6 → C7 → C2 → C5 → C3 → C4**

---

## C1. Migration System Consolidation

**Files:**
- Modify: `drizzle/migrations/` (rename conflicting files, add missing files)
- Modify: `drizzle/meta/_journal.json` (rebuild)
- Create: `scripts/validate-migrations.ts`

### Rollback Plan

Before touching any file:
```bash
mysql -u $DB_USER -p"$DB_PASS" -h $DB_HOST $DB_NAME \
  -e "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id;" \
  > scripts/migrations_applied_backup_$(date +%Y%m%d_%H%M%S).txt
git add scripts/migrations_applied_backup_*.txt
git commit -m "chore(C1): snapshot applied migrations before consolidation"
```

### Conflict Map

**Root `drizzle/` files to copy into `drizzle/migrations/`:**
- `0027_c189_6_missing_tables.sql` — gap filler
- `0028_c189_missing_tables_v2.sql` — gap filler
- `0026_multi_provider_cascade.sql` → rename to `0052_multi_provider_cascade.sql`

**Conflicts in `drizzle/migrations/` (keep DDL, renumber data):**
| Conflict | Keep | Rename secondary to |
|---|---|---|
| 0010 | `0010_self_proposals_schema_drift_fix.sql` | `0051_v52_cleanup_test_users.sql` |
| 0015 | `0015_v62_knowledge_index_fixed.sql` | `0054_autonomy_knowledge.sql` |
| 0016 | `0016_v63_auth_fix_and_dgm_fix.sql` | `0055_test_engineering_knowledge.sql` |
| 0017 | `0017_v63_creator_password_reset.sql` | `0056_v74_8_research_knowledge.sql` |
| 0018 | `0018_v63_correct_column_names.sql` | `0057_v74_9_monitoring_knowledge.sql` |
| 0019 | `0019_v63_seed_creator_account.sql` | `0058_v74_10_build_fix_knowledge.sql` |
| 0020 | `0020_v65_reproposal_and_knowledge_wisdom.sql` | `0059_v74_11_quality_fix_knowledge.sql` |
| 0025 | `0025_v68_knowledge_hierarchy.sql` | `0060_v69_routing_columns.sql` |
| 001 prefix | `001_shms_timescaledb_conselho.sql` | → `0053_shms_timescaledb_conselho.sql` |

### Steps

- [ ] **1.1 Snapshot applied migrations** (see rollback plan above)

- [ ] **1.2 Rename conflicting secondary files in `drizzle/migrations/`:**
  ```bash
  cd drizzle/migrations
  mv 0010_v52_cleanup_test_users.sql        0051_v52_cleanup_test_users.sql
  mv 0015_autonomy_knowledge.sql            0054_autonomy_knowledge.sql
  mv 0016_test_engineering_knowledge.sql    0055_test_engineering_knowledge.sql
  mv 0017_v74_8_research_knowledge.sql      0056_v74_8_research_knowledge.sql
  mv 0018_v74_9_monitoring_knowledge.sql    0057_v74_9_monitoring_knowledge.sql
  mv 0019_v74_10_build_fix_knowledge.sql    0058_v74_10_build_fix_knowledge.sql
  mv 0020_v74_11_quality_fix_knowledge.sql  0059_v74_11_quality_fix_knowledge.sql
  mv 0025_v69_routing_columns.sql           0060_v69_routing_columns.sql
  mv 001_shms_timescaledb_conselho.sql      0053_shms_timescaledb_conselho.sql
  ```

- [ ] **1.3 Copy root `drizzle/` gap files into `drizzle/migrations/`:**
  ```bash
  cp drizzle/0027_c189_6_missing_tables.sql   drizzle/migrations/0027_c189_6_missing_tables.sql
  cp drizzle/0028_c189_missing_tables_v2.sql  drizzle/migrations/0028_c189_missing_tables_v2.sql
  cp drizzle/0026_multi_provider_cascade.sql  drizzle/migrations/0052_multi_provider_cascade.sql
  ```

- [ ] **1.4 Rebuild `drizzle/meta/_journal.json`:**

  ```json
  {
    "version": "7",
    "dialect": "mysql",
    "entries": [
      { "idx": 0,  "version": "5", "when": 1771429260826, "tag": "0000_slimy_roxanne_simpson",            "breakpoints": true },
      { "idx": 1,  "version": "5", "when": 1771429410613, "tag": "0001_deep_bastion",                     "breakpoints": true },
      { "idx": 2,  "version": "5", "when": 1771910178305, "tag": "0002_ancient_joshua_kane",              "breakpoints": true },
      { "idx": 3,  "version": "5", "when": 1771910178400, "tag": "0003_mother_v56_complete",              "breakpoints": true },
      { "idx": 4,  "version": "5", "when": 1771910178500, "tag": "0004_amem_zettelkasten",                "breakpoints": true },
      { "idx": 5,  "version": "5", "when": 1771910178600, "tag": "0005_gea_agent_pool",                   "breakpoints": true },
      { "idx": 6,  "version": "5", "when": 1771910178700, "tag": "0006_v47_fitness_history",              "breakpoints": true },
      { "idx": 7,  "version": "5", "when": 1771910178800, "tag": "0007_v49_native_auth",                  "breakpoints": true },
      { "idx": 8,  "version": "5", "when": 1771910178900, "tag": "0008_v50_cleanup_stuck_users",          "breakpoints": true },
      { "idx": 9,  "version": "5", "when": 1771910179000, "tag": "0009_v51_cleanup_invalid_session_users","breakpoints": true },
      { "idx": 10, "version": "5", "when": 1771910179100, "tag": "0010_self_proposals_schema_drift_fix",  "breakpoints": true },
      { "idx": 11, "version": "5", "when": 1771910179200, "tag": "0011_v56_user_memory_proposals_audit",  "breakpoints": true },
      { "idx": 12, "version": "5", "when": 1771910179300, "tag": "0012_v58_creator_auth_and_improvements","breakpoints": true },
      { "idx": 13, "version": "5", "when": 1771910179400, "tag": "0013_v58_fix_config_and_knowledge",     "breakpoints": true },
      { "idx": 14, "version": "5", "when": 1771910179500, "tag": "0014_v62_knowledge_index_milestone",    "breakpoints": true },
      { "idx": 15, "version": "5", "when": 1771910179600, "tag": "0015_v62_knowledge_index_fixed",        "breakpoints": true },
      { "idx": 16, "version": "5", "when": 1771910179700, "tag": "0016_v63_auth_fix_and_dgm_fix",         "breakpoints": true },
      { "idx": 17, "version": "5", "when": 1771910179800, "tag": "0017_v63_creator_password_reset",       "breakpoints": true },
      { "idx": 18, "version": "5", "when": 1771910179900, "tag": "0018_v63_correct_column_names",         "breakpoints": true },
      { "idx": 19, "version": "5", "when": 1771910180000, "tag": "0019_v63_seed_creator_account",         "breakpoints": true },
      { "idx": 20, "version": "5", "when": 1771910180100, "tag": "0020_v65_reproposal_and_knowledge_wisdom","breakpoints": true },
      { "idx": 21, "version": "5", "when": 1771910180200, "tag": "0021_v65_fix_reproposal_columns",       "breakpoints": true },
      { "idx": 22, "version": "5", "when": 1771910180300, "tag": "0022_v65_fix_knowledge_wisdom_duplicates","breakpoints": true },
      { "idx": 23, "version": "5", "when": 1771910180400, "tag": "0023_v67_schema_alignment",             "breakpoints": true },
      { "idx": 24, "version": "5", "when": 1771910180500, "tag": "0024_v68_sprint3_metrics",              "breakpoints": true },
      { "idx": 25, "version": "5", "when": 1771910180600, "tag": "0025_v68_knowledge_hierarchy",          "breakpoints": true },
      { "idx": 26, "version": "5", "when": 1771910180700, "tag": "0026_v69_8_udc_full_taxonomy",          "breakpoints": true },
      { "idx": 27, "version": "5", "when": 1771910180800, "tag": "0027_c189_6_missing_tables",            "breakpoints": true },
      { "idx": 28, "version": "5", "when": 1771910180900, "tag": "0028_c189_missing_tables_v2",           "breakpoints": true },
      { "idx": 37, "version": "5", "when": 1771910181000, "tag": "0037_c206_learning_evaluations",        "breakpoints": true },
      { "idx": 38, "version": "5", "when": 1771910181100, "tag": "0038_c211_calibration_history",         "breakpoints": true },
      { "idx": 39, "version": "5", "when": 1771910181200, "tag": "0039_c213_c217_knowledge",              "breakpoints": true },
      { "idx": 40, "version": "5", "when": 1771910181300, "tag": "0040_c218_sgm_proofs_shell_sessions",   "breakpoints": true },
      { "idx": 41, "version": "5", "when": 1771910181400, "tag": "0041_c218_c220_knowledge",              "breakpoints": true },
      { "idx": 42, "version": "5", "when": 1771910181500, "tag": "0042_c221_chain1_diagnostics_knowledge","breakpoints": true },
      { "idx": 43, "version": "5", "when": 1771910183000, "tag": "0043_c_vector_indexes",                 "breakpoints": true },
      { "idx": 44, "version": "5", "when": 1771910183100, "tag": "0044_b5_user_feedback_column",          "breakpoints": true },
      { "idx": 51, "version": "5", "when": 1771910182000, "tag": "0051_v52_cleanup_test_users",           "breakpoints": true },
      { "idx": 52, "version": "5", "when": 1771910182100, "tag": "0052_multi_provider_cascade",           "breakpoints": true },
      { "idx": 53, "version": "5", "when": 1771910182200, "tag": "0053_shms_timescaledb_conselho",        "breakpoints": true },
      { "idx": 54, "version": "5", "when": 1771910182300, "tag": "0054_autonomy_knowledge",               "breakpoints": true },
      { "idx": 55, "version": "5", "when": 1771910182400, "tag": "0055_test_engineering_knowledge",       "breakpoints": true },
      { "idx": 56, "version": "5", "when": 1771910182500, "tag": "0056_v74_8_research_knowledge",         "breakpoints": true },
      { "idx": 57, "version": "5", "when": 1771910182600, "tag": "0057_v74_9_monitoring_knowledge",       "breakpoints": true },
      { "idx": 58, "version": "5", "when": 1771910182700, "tag": "0058_v74_10_build_fix_knowledge",       "breakpoints": true },
      { "idx": 59, "version": "5", "when": 1771910182800, "tag": "0059_v74_11_quality_fix_knowledge",     "breakpoints": true },
      { "idx": 60, "version": "5", "when": 1771910182900, "tag": "0060_v69_routing_columns",              "breakpoints": true }
    ]
  }
  ```

- [ ] **1.5 Create `scripts/validate-migrations.ts`:**

  ```typescript
  #!/usr/bin/env tsx
  /**
   * scripts/validate-migrations.ts
   * Validates drizzle/migrations/ for gaps and duplicate numbers.
   * Run: pnpm tsx scripts/validate-migrations.ts
   */
  import fs from "fs";
  import path from "path";

  const MIGRATIONS_DIR = path.resolve("drizzle/migrations");
  const JOURNAL_PATH = path.resolve("drizzle/meta/_journal.json");

  interface JournalEntry { idx: number; tag: string; }
  interface Journal { entries: JournalEntry[]; }

  export function validateMigrations(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();

    const numMap = new Map<number, string[]>();
    for (const f of files) {
      const match = f.match(/^(\d+)_/);
      if (!match) { errors.push(`Non-numeric prefix: ${f}`); continue; }
      const n = parseInt(match[1], 10);
      if (!numMap.has(n)) numMap.set(n, []);
      numMap.get(n)!.push(f);
    }

    for (const [n, names] of numMap) {
      if (names.length > 1) {
        errors.push(`Duplicate migration ${String(n).padStart(4, "0")}: ${names.join(", ")}`);
      }
    }

    const journal: Journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
    const journalTags = new Set(journal.entries.map(e => e.tag));
    const fileTags = new Set(files.map(f => f.replace(".sql", "")));

    for (const tag of fileTags) {
      if (!journalTags.has(tag)) errors.push(`File ${tag}.sql not in _journal.json`);
    }
    for (const tag of journalTags) {
      if (!fileTags.has(tag)) errors.push(`Journal entry ${tag} has no .sql file`);
    }

    const valid = errors.length === 0;
    if (valid) console.log(`[validate-migrations] OK — ${files.length} migrations, 0 errors`);
    else errors.forEach(e => console.error(`[validate-migrations] ERROR: ${e}`));
    return { valid, errors };
  }

  const { valid } = validateMigrations();
  if (!valid) process.exit(1);
  ```

- [ ] **1.6 Run validator:**
  ```bash
  pnpm tsx scripts/validate-migrations.ts
  ```
  Expected: `[validate-migrations] OK — 43 migrations, 0 errors`

- [ ] **1.7 Commit:**
  ```bash
  git add drizzle/migrations/ drizzle/meta/_journal.json scripts/validate-migrations.ts
  git commit -m "fix(C1): consolidate migration directories — single drizzle/migrations/ with rebuilt journal"
  ```

---

## C2. Vector Search Optimization

**Files:**
- Create: `drizzle/migrations/0043_c_vector_indexes.sql`
- Modify: `server/db.ts` (add LRU cache)

### Steps

- [ ] **2.1 Create index migration** (`drizzle/migrations/0043_c_vector_indexes.sql`):

  ```sql
  -- Migration 0043: C2 — vector search performance indexes
  -- MySQL B-tree index on created_at: O(log n) vs O(n) full table scan
  -- Index on domain: reduces knowledge lookup scan from ~500 rows to ~50

  ALTER TABLE semantic_cache
    ADD INDEX idx_semantic_cache_created_at (created_at DESC);

  ALTER TABLE knowledge
    ADD INDEX idx_knowledge_domain (domain);
  ```

- [ ] **2.2 Add LRU cache to `server/db.ts`** before `getSemanticCacheEntry`:

  ```typescript
  // C2: Module-level LRU cache for semantic cache entries
  // Cap: 200 entries × ~8KB avg ≈ 1.6 MB overhead (acceptable for Cloud Run 4Gi)
  const SEMANTIC_LRU_MAX = 200;
  const _semanticLruCache = new Map<string, { entry: SemanticCache; accessedAt: number }>();

  function _lruGet(key: string): SemanticCache | undefined {
    const item = _semanticLruCache.get(key);
    if (!item) return undefined;
    _semanticLruCache.delete(key);
    _semanticLruCache.set(key, { entry: item.entry, accessedAt: Date.now() });
    return item.entry;
  }

  function _lruSet(key: string, entry: SemanticCache): void {
    if (_semanticLruCache.has(key)) _semanticLruCache.delete(key);
    if (_semanticLruCache.size >= SEMANTIC_LRU_MAX) {
      const oldest = _semanticLruCache.keys().next().value;
      if (oldest) _semanticLruCache.delete(oldest);
    }
    _semanticLruCache.set(key, { entry, accessedAt: Date.now() });
  }
  ```

- [ ] **2.3 Update `getSemanticCacheEntry` to check LRU first:**

  ```typescript
  export async function getSemanticCacheEntry(
    queryEmbedding: number[],
    threshold = 0.75
  ): Promise<SemanticCache | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    // C2: Check LRU cache first — key: base64 of first 8 floats
    const embeddingKey = Buffer.from(
      new Float64Array(queryEmbedding.slice(0, 8)).buffer
    ).toString("base64");
    const cached = _lruGet(embeddingKey);
    if (cached) return cached;

    // ... existing DB fetch logic unchanged ...

    if (bestEntry) _lruSet(embeddingKey, bestEntry);
    return bestEntry;
  }
  ```

- [ ] **2.4** Run `pnpm run check` — 0 TypeScript errors.

- [ ] **2.5 Commit:**
  ```bash
  git add drizzle/migrations/0043_c_vector_indexes.sql drizzle/meta/_journal.json server/db.ts
  git commit -m "feat(C2): add created_at/domain indexes + 200-entry LRU cache for semantic search"
  ```

---

## C3. Dependency Cleanup

**Files:**
- Modify: `package.json`

### Steps

- [ ] **3.1 Move to `devDependencies`:** `playwright`, `supertest`

- [ ] **3.2 Remove from `dependencies`:** `pg`, `@types/pg`, `wouter`

- [ ] **3.3 Remove from `pnpm.patchedDependencies`:** the `wouter@3.7.1` patch entry

- [ ] **3.4 Verify no remaining imports:**
  ```bash
  grep -r "from 'wouter'" --include="*.ts" --include="*.tsx" client/ server/
  grep -r "from 'pg'" --include="*.ts" server/
  ```
  Expected: 0 results each.

- [ ] **3.5** Run `pnpm install && pnpm run check` — 0 errors.

- [ ] **3.6 Commit:**
  ```bash
  git add package.json pnpm-lock.yaml
  git commit -m "chore(C3): move playwright/supertest to devDeps; remove pg, @types/pg, wouter"
  ```

---

## C4. CI/CD pnpm Fix

**Files:**
- Modify: `.github/workflows/autonomous-deploy.yml`

### Steps

- [ ] **4.1 Replace `npm install` with pnpm in the `typecheck` job:**

  Replace:
  ```yaml
  - name: Install dependencies
    run: npm install --legacy-peer-deps
  ```

  With:
  ```yaml
  - name: Setup pnpm
    uses: pnpm/action-setup@v2
    with:
      version: 10

  - name: Install dependencies
    run: pnpm install --frozen-lockfile
  ```

- [ ] **4.2 Update npm run commands to pnpm:**
  ```yaml
  - name: TypeScript compilation check
    run: pnpm run build
  ```

- [ ] **4.3 Commit:**
  ```bash
  git add .github/workflows/autonomous-deploy.yml
  git commit -m "fix(C4): replace npm install --legacy-peer-deps with pnpm/action-setup + pnpm install --frozen-lockfile"
  ```

---

## C5. Drizzle Relations

**Files:**
- Modify: `drizzle/relations.ts`

### Steps

- [ ] **5.1 Replace entire `drizzle/relations.ts` content:**

  ```typescript
  import { relations } from "drizzle-orm";
  import { users, queries, selfProposals, auditLog } from "./schema";

  /**
   * C5: Drizzle relations definitions
   * Enables type-safe JOINs and eager loading via drizzle's query API.
   */

  // users ↔ queries (one-to-many)
  export const usersRelations = relations(users, ({ many }) => ({
    queries: many(queries),
  }));

  export const queriesRelations = relations(queries, ({ one }) => ({
    user: one(users, {
      fields: [queries.userId],
      references: [users.id],
    }),
  }));

  // selfProposals ↔ auditLog (one-to-many — logical, not FK)
  // auditLog.targetType = 'self_proposal' AND auditLog.targetId = selfProposals.id::string
  export const selfProposalsRelations = relations(selfProposals, ({ many }) => ({
    auditEntries: many(auditLog),
  }));

  export const auditLogRelations = relations(auditLog, ({ one }) => ({
    selfProposal: one(selfProposals, {
      fields: [auditLog.targetId],
      references: [selfProposals.id],
    }),
  }));

  /**
   * TODO (deferred): queries → knowledge relation
   * Requires a join table: query_knowledge_hits(query_id, knowledge_id, score)
   * Track under: C5-deferred-knowledge-relation
   */
  ```

- [ ] **5.2** Run `pnpm run check` — 0 errors.

- [ ] **5.3 Commit:**
  ```bash
  git add drizzle/relations.ts
  git commit -m "feat(C5): add Drizzle relations for users/queries and selfProposals/auditLog"
  ```

---

## C6. db:push Script Fix

**Files:**
- Create: `scripts/db-migrate.ts`
- Modify: `package.json` scripts

### Steps

- [ ] **6.1 Create `scripts/db-migrate.ts`:**

  ```typescript
  #!/usr/bin/env tsx
  /**
   * scripts/db-migrate.ts
   * C6: Applies all pending Drizzle migrations from drizzle/migrations/.
   * Replaces broken "drizzle-kit generate && drizzle-kit migrate".
   *
   * Usage: pnpm db:push
   */
  import { drizzle } from "drizzle-orm/mysql2";
  import { migrate } from "drizzle-orm/mysql2/migrator";
  import { createPool } from "mysql2/promise";
  import { validateMigrations } from "./validate-migrations.js";
  import path from "path";

  async function main() {
    const { valid, errors } = validateMigrations();
    if (!valid) {
      console.error("[db-migrate] Aborting: migration validation failed");
      errors.forEach(e => console.error(" ", e));
      process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { console.error("[db-migrate] ERROR: DATABASE_URL not set"); process.exit(1); }

    const rawUrl = dbUrl.replace("mysql://", "http://").replace("@/", "@localhost/");
    const url = new URL(rawUrl);
    const socketPath = url.searchParams.get("unix_socket");

    const poolConfig = socketPath
      ? { user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
          database: url.pathname.slice(1), socketPath }
      : { host: url.hostname, port: url.port ? parseInt(url.port) : 3306,
          user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
          database: url.pathname.slice(1), ssl: { rejectUnauthorized: true } };

    const pool = createPool(poolConfig as any);
    const db = drizzle(pool);

    console.log("[db-migrate] Applying pending migrations ...");
    await migrate(db, { migrationsFolder: path.resolve("drizzle/migrations") });
    console.log("[db-migrate] Done.");
    await pool.end();
  }

  main().catch(err => { console.error("[db-migrate] Fatal:", err); process.exit(1); });
  ```

- [ ] **6.2 Update `package.json` scripts:**

  Replace:
  ```json
  "db:push": "drizzle-kit generate && drizzle-kit migrate"
  ```
  With:
  ```json
  "db:push": "tsx scripts/db-migrate.ts"
  ```

- [ ] **6.3 Test dry-run:**
  ```bash
  DATABASE_URL="mysql://user:pass@localhost/testdb" pnpm db:push
  ```
  Expected:
  ```
  [validate-migrations] OK — 44 migrations, 0 errors
  [db-migrate] Applying pending migrations ...
  [db-migrate] Done.
  ```

- [ ] **6.4 Commit:**
  ```bash
  git add scripts/db-migrate.ts package.json
  git commit -m "fix(C6): replace broken drizzle-kit generate&&migrate with tsx scripts/db-migrate.ts"
  ```

---

## C7. feedback_column Migration (from B5)

**Files:**
- Create: `drizzle/migrations/0044_b5_user_feedback_column.sql`
- Modify: `drizzle/meta/_journal.json` (entry already included in C1 rebuild)
- Modify: `drizzle/schema.ts`

### Steps

- [ ] **7.1 Create migration file** (`drizzle/migrations/0044_b5_user_feedback_column.sql`):

  ```sql
  -- Migration 0044: B5/C7 — user_feedback column on queries table
  -- Adds user satisfaction signal for RLHF / DPO fine-tuning pipeline
  -- Scientific basis: Christiano et al. (2017) "Deep Reinforcement Learning from Human Preferences"
  --   arXiv:1706.03741 — RLHF requires explicit human feedback signal
  -- Values: NULL=no feedback, 1=positive, 0=negative
  -- NULL default ensures backward compatibility

  ALTER TABLE queries
    ADD COLUMN IF NOT EXISTS `user_feedback` TINYINT DEFAULT NULL
      COMMENT 'User satisfaction: 1=positive, 0=negative, NULL=no feedback (RLHF signal)';
  ```

- [ ] **7.2 Add `userFeedback` field to `drizzle/schema.ts` `queries` table:**

  After the `embedding` field and before `createdAt`:
  ```typescript
  // RLHF signal (B5, C7): user satisfaction feedback
  // Scientific basis: Christiano et al. (2017) arXiv:1706.03741
  userFeedback: int("user_feedback"), // 1=positive, 0=negative, NULL=no feedback
  ```

- [ ] **7.3** Run `pnpm run check` — 0 TypeScript errors.

- [ ] **7.4 Apply migration:**
  ```bash
  pnpm db:push
  ```
  Expected:
  ```
  [validate-migrations] OK — 44 migrations, 0 errors
  [db-migrate] Applying pending migrations ...
  [db-migrate] Done.
  ```

- [ ] **7.5 Commit:**
  ```bash
  git add drizzle/migrations/0044_b5_user_feedback_column.sql drizzle/schema.ts
  git commit -m "feat(C7/B5): add user_feedback TINYINT column to queries table for RLHF pipeline"
  ```

---

## Merge gate

Before creating PR for Worktree C (merge third per spec):

- [ ] `pnpm tsx scripts/validate-migrations.ts` — 0 errors
- [ ] `pnpm run check` — 0 TypeScript errors
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm run build` — 0 build errors
- [ ] No `wouter` or `pg` imports remain in codebase
- [ ] CI workflow uses `pnpm install --frozen-lockfile`
- [ ] `user_feedback` column exists in production DB after `pnpm db:push`
- [ ] Branch is `fix/infrastructure` — merge AFTER `fix/security` and `fix/critical-bugs`
