# MOTHER v122.26 — Full Upgrade to 10/10 Design Spec

**Date:** 2026-03-17
**Author:** Claude Code (Sonnet 4.6)
**Strategy:** Option B — 4 parallel git worktrees, merge in risk-ascending order
**Goal:** Raise all 6 quality areas to 10/10

---

## Overview

Four independent workstreams executed in parallel via git worktrees, then merged in order:
1. Worktree A — Security (lowest risk, merge first)
2. Worktree B — Critical Bugs (low risk, merge second — enum fix is code-only, no migration)
3. Worktree C — Infrastructure/DB (medium risk, merge third)
4. Worktree D — Frontend Redesign (highest change volume, merge last)

**Inter-worktree dependency:** B1 (enum alignment) is resolved as a code-only fix — TypeScript types and `autonomous-update-job.ts` will be updated to use the existing DB enum values (`'in_progress'` replaces `'implementing'`, `'implemented'` replaces `'deployed'`, `'testing'` is removed). No DB migration needed for B1.

---

## Worktree A — Security (3/10 → 10/10)

### A1. Auth guards on DGM endpoints
**File:** `server/routers/mother.ts`
**Problem:** `dgmResolveProposal` (L431), `dgmTestRun` (L360), `supervisor.evolve` (L447), `dgmPendingProposals` (L422), and `dgmEvents` (L411) are all `publicProcedure` — any unauthenticated caller can approve code-execution proposals, read pending proposals, and read internal DGM event logs.
**Fix:** Move all five to `protectedProcedure` with `isCreator` guard (pattern from `runBenchmark` L646). `supervisor.evolve` fallback branch must also log an audit event to confirm auth was enforced at the procedure level.

### A2. Shell injection fix
**File:** `server/mother/autonomous-update-job.ts`
**Problem:** Five injection vectors, all rooted in the `runGitCommand` wrapper (L158–164) which calls `execSync(`git -C ${repoPath} ${command}`)`:
1. L160 (wrapper itself): string-interpolated `command` passed to shell
2. L295–298: `branchName` embeds `proposalId` — `runGitCommand(repoPath, `checkout -b ${branchName}`)` — `proposalId` not yet validated as integer at this callsite
3. L388: `` runGitCommand(repoPath, `commit -m "${commitMessage}"`) `` — `commitMessage` embeds `proposal.title`, `proposal.hypothesis`, `proposal.scientificBasis` from DB. Backtick, `$(...)`, and newline not prevented by `"` escaping
4. L287: `` execSync(`cp -r ${sourcePath} ${repoPath}`) ``
5. L487: `` execSync(`rm -rf ${tempDir}`) ``

**Fix:**
- **Eliminate `runGitCommand` wrapper entirely.** Replace it with a helper `gitExec(cwd: string, args: string[]): string` that calls `execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8' })` — no shell, no interpolation.
- Update all 10+ callsites throughout the file to use `gitExec` with explicit string arrays.
- Validate `proposalId` as a strict positive integer (`/^\d+$/.test(id)`) before any use in branch names or SQL.
- Commit message: pass via `gitExec(repo, ['commit', '-m', commitMessage])` — `execFileSync` passes it as a literal argument, no shell escaping needed.
- Replace L287 with `fs.cpSync(sourcePath, repoPath, { recursive: true })` (Node.js built-in, no shell).
- Replace L487 with `fs.rmSync(tempDir, { recursive: true, force: true })` (Node.js built-in, no shell).

### A3. `allQueries` data privacy + `history` consolidation
**File:** `server/routers/mother.ts:L225,L243`
**Problem:** `allQueries` exposes all users' data to any authenticated user. `history` already correctly filters by `userId`. After fixing `allQueries`, both endpoints are functionally identical for non-creator users.
**Fix:** Add `isCreator` guard to `allQueries` — creator gets all, non-creator gets own queries only. Deprecate the `history` endpoint and have the client use `allQueries` (unified endpoint). Remove `history` procedure in a follow-up to avoid confusion.

### A4. DGM auto-approval — file-path allowlist
**File:** `server/mother/self-proposal-engine.ts`
**Problem:** `classifyProposalRisk()` only inspects `proposal.title` and `proposal.description` — does not inspect `proposed_changes`. A proposal titled "cache test improvement" that modifies `server/routers/auth.ts` would be auto-approved.
**Fix:**
1. Parse `proposed_changes` JSON and extract the `files` array. **If `proposed_changes` is null, absent, not valid JSON, or `files` is absent or empty → immediately return `'high'` risk. Do NOT fall through to keyword matching.**
2. If any file path matches blocklist patterns (`auth`, `routers`, `db`, `schema`, `autonomous`, `middleware`, `production-entry`), force `'high'` regardless of title keywords.
3. Auto-approval only allowed if ALL targeted files are within the allowlist: `server/mother/semantic-cache.ts`, `server/mother/cache*.ts`.
4. These checks run BEFORE any title/description keyword matching — keywords are a secondary signal only when file-path analysis succeeds and returns non-high.

### A5. `.gitignore` hardening
**File:** `.gitignore`
**Fix:** Add `.env.production`, `.env.*.local`, `*.env`. Add `.env.example` as an explicit tracked file via `!.env.example`.

### A6. TLS certificate validation
**File:** `server/db.ts`
**Problem:** `rejectUnauthorized: false` for non-localhost connections.
**Fix:** Set `rejectUnauthorized: true`. For Cloud SQL connections, the GCP-provided SSL certificate is already trusted by the system CA bundle — no custom CA path needed.

---

## Worktree B — Critical Bugs (5/10 → 8/10 quality)

### B1. Status enum alignment (code-only, no migration)
**Files:** `server/mother/self-proposal-engine.ts`, `server/mother/autonomous-update-job.ts`
**Decision:** TypeScript types updated to match existing DB enum. DB enum is the source of truth.
**Mapping:**
- `'implementing'` → `'in_progress'`
- `'testing'` → `'in_progress'` (consolidate — testing is a sub-state of in-progress)
- `'deployed'` → `'implemented'`
- TypeScript union updated to: `'pending' | 'approved' | 'rejected' | 'in_progress' | 'implemented' | 'failed'`

### B2. `rejectProposal` dual-table update
**File:** `server/mother/update-proposals.ts`
**Problem:** `rejectProposal` only updates `update_proposals`, not `self_proposals`.
**Fix:** Mirror the `approveProposal` dual-update pattern — update both tables atomically.

### B3. `String.replace` → `replaceAll`
**File:** `server/mother/autonomous-update-job.ts`
**Problem:** `String.replace()` at **line 134** (`currentContent.replace(change.findText, change.replaceWith)`) replaces only the first occurrence of a literal string — diffs with repeated patterns silently fail.
**Fix:** Replace line 134 only: `currentContent.replaceAll(change.findText, change.replaceWith)`. Do NOT touch the regex-based `.replace(/"/g, '\\"')` at line 388 — that call is already global and will be eliminated entirely by the A2 `gitExec` migration anyway.

### B4. Dead code removal
**Files to delete:**
- `client/src/pages/Home.tsx` (superseded by HomeV2, not routed)
- `client/src/components/ChatInterface.tsx` (unused, uses dead `/api/chat`)
- `client/src/lib/MotherContext.tsx` (uses dead `/api/chat` endpoint)
- `client/src/pages/SHMSDashboardV3.tsx` (synthetic data only, unrouted)

### B5. Feedback button → API call + DB column (migration in Worktree C)
**Files:** `client/src/pages/HomeV2.tsx`, `server/routers/mother.ts`, `drizzle/schema.ts`
**Problem:** 👍/👎 only updates local state. `queries` table has no `userFeedback` column.
**Fix:**
- Worktree B: Add `trpc.mother.submitFeedback` mutation (frontend + router procedure)
- Worktree C: Add migration `C_feedback_column.sql` — `ALTER TABLE queries ADD COLUMN user_feedback TINYINT DEFAULT NULL` (1=positive, -1=negative, NULL=no feedback)
- Worktree B procedure will be a no-op stub that logs until Worktree C migration runs

### B6. `SessionHistory` fix
**File:** `client/src/components/SessionHistory.tsx`
**Problem:** Raw `GET /api/trpc/mother.getSessions` fails (tRPC needs query params). Delete is local-only.
**Fix:** Use tRPC client properly (`trpc.mother.getSessions.useQuery()`). Implement `trpc.mother.deleteSession` mutation on server with proper auth guard.

### B7. `orchestration.ts` dead category alignment
**File:** `server/mother/orchestration.ts`, `server/mother/intelligence.ts`
**Fix:** Add `'natural_science'`, `'philosophy'`, `'economics'`, `'health_care'` to `classifyQuery()` in `intelligence.ts` — these are legitimate complex query types that should trigger MoA. Map them from relevant keywords.

### B8. LSTM stub — explicit error
**File:** `server/shms/digital-twin-engine-c205.ts`
**Fix:** Replace silent no-op with `return { status: 'not_implemented', predictions: [], warning: 'PredictiveEngine LSTM integration pending (C207)' }` so callers can handle the absent predictions explicitly.

---

## Worktree C — Infrastructure/DB (5/10 → 10/10)

### C1. Migration system consolidation
**Problem:** Two parallel directories (`drizzle/` root with 3-file journal vs `drizzle/migrations/` with 40+ files). Duplicate numbers: 0010, 0015, 0016, 0017, 0018, 0019, 0020, 0025 each have two files. Out-of-sequence file: `001_shms_timescaledb_conselho.sql`. Numbering gap: 0027–0036 missing from `drizzle/migrations/` but present in `drizzle/` root.

**Fix:**
1. Inventory ALL SQL files across both directories (`drizzle/` root: 0000–0003, 0026–0028; `drizzle/migrations/`: 0000–0025, 0026, 0037+).
2. Before copying, check root files 0000–0003 against their `drizzle/migrations/` counterparts — if identical content, skip; if different, treat as a conflict and resolve manually.
3. **Known conflicts to resolve explicitly:**
   - `0010`: keep `0010_self_proposals_schema_drift_fix.sql` (more complete), rename `0010_v52_cleanup_test_users.sql` → `0051_v52_cleanup_test_users.sql`
   - `0015–0020, 0025`: same pattern — keep the schema-critical file, renumber the secondary file to max+1
   - **`0026`**: `drizzle/migrations/0026_v69_8_udc_full_taxonomy.sql` vs `drizzle/0026_multi_provider_cascade.sql` — these are **two different migrations**. Renumber the root file → `0052_multi_provider_cascade.sql`
   - `001_shms_timescaledb_conselho.sql` (non-standard format) → rename to `0053_shms_timescaledb_conselho.sql`
4. Copy ALL files `drizzle/0027_*` through `drizzle/0036_*` from the root to `drizzle/migrations/`, preserving their numeric prefixes. Verify the resulting sequence is contiguous from 0027–0036 before proceeding. (Known files: `0027_c189_6_missing_tables.sql`, `0028_c189_missing_tables_v2.sql` — confirm 0029–0036 exist in root before this step.)
5. Rebuild `_journal.json` to track all consolidated migrations
6. Add `scripts/validate-migrations.ts` — checks for number conflicts and gaps at startup
7. Add `B5_feedback_column.sql` migration here (see B5)
8. **Rollback plan:** Before running on production, snapshot `migrations_applied` table (`mysqldump -t migrations_applied > backup.sql`) and copy `_journal.json`. Rollback: `mysql < backup.sql` and restore `_journal.json`.

### C2. Vector search optimization
**Problem:** `getSemanticCacheEntry()` full table scan over 500 rows in Node.js memory — O(n).
**Fix (additive only):**
1. Add `created_at` index on `semantic_cache` table (migration)
2. Add `domain` index on `knowledge` table (migration)
3. Add module-level LRU cache (Map, 200-entry cap, TTL-aware) for hot embeddings in `server/db.ts`
4. Document upgrade path to MySQL VECTOR type (MySQL 9.0+) in `docs/` as a future milestone

### C3. Dependency cleanup
**File:** `package.json`
- `playwright` → `devDependencies` (~200MB removed from prod Docker image)
- `supertest` → `devDependencies`
- Remove `pg` and `@types/pg` (MySQL-only project)
- Remove `wouter` (duplicate router — `react-router-dom` is the active one)

### C4. CI/CD package manager consistency
**File:** `.github/workflows/autonomous-deploy.yml`
**Fix:** Replace `npm install --legacy-peer-deps` with `pnpm install --frozen-lockfile`. Add `pnpm/action-setup@v2` step before install.

### C5. Drizzle relations
**File:** `drizzle/relations.ts`
**Fix:** Add `relations()` definitions for: `users ↔ queries`, `queries → knowledge` (via search results), `selfProposals ↔ auditLog`.

### C6. `db:push` script fix
**File:** `package.json` scripts
**Fix:** Replace the broken `drizzle-kit generate && drizzle-kit migrate` (which only sees 3-file journal) with `tsx scripts/db-migrate.ts` — the custom runner that uses `migrations_applied` tracking table and processes all files in `drizzle/migrations/` in numeric order.

---

## Worktree D — Frontend Redesign (6/10 → 10/10)

### D1. Component architecture decomposition

**Current:** `HomeV2.tsx` (~1000 lines) — monolith.

**New architecture:**
```
client/src/
├── store/
│   └── chatStore.ts              # Zustand — all chat state
├── hooks/
│   └── useSSEStream.ts           # SSE engine as custom hook
├── pages/
│   └── HomeV2.tsx                # ~80 lines — orchestration shell only
└── components/chat/
    ├── ChatSidebar.tsx           # Left sidebar + command buttons
    ├── MessageList.tsx           # Scrollable message feed
    ├── MessageBubble.tsx         # Individual message (user/MOTHER)
    ├── QuickPrompts.tsx          # Follow-up chips
    ├── StreamingInput.tsx        # Input bar + file drop + speed control
    ├── PhaseHeader.tsx           # Phase indicator + stats
    ├── DGMPanel.tsx              # DGM test + lineage panel
    └── FeedbackButtons.tsx       # 👍/👎 with trpc.mother.submitFeedback
```

### D2. State management — Zustand
Replace 15+ `useState` calls with a single Zustand store:
- `messages[]`, `streamingState`, `currentPhase`, `activeToolCalls[]`, `stats`, `feedback`
- `localStorage` persistence (replacing broken `MotherContext`)

### D3. `useSSEStream` hook
Extract the 150-line SSE engine into `hooks/useSSEStream.ts`:
- Returns `{ sendMessage, stopStream, isStreaming }`
- Dispatches to Zustand store internally
- Handles all event types: `token`, `phase`, `tool_call`, `done`, `error`, `progress`, `thinking`, `response`

### D4. Phase 5 features — with auth gates
All Phase 5 panels are creator-only. Authorization enforced at both the frontend route level (redirect if not creator) and the backend API endpoint level (`protectedProcedure` + `isCreator`).

| Command | Panel | Backend Endpoint | Auth |
|---------|-------|-----------------|------|
| `/shell` | `ShellPanel.tsx` — xterm.js terminal → E2B sandbox | `POST /api/shell` (SSE, creator only) | `isCreator` |
| `/editor` | `CodeEditorPanel.tsx` — Monaco + file tree | `GET/PUT /api/editor/:path` (creator only) | `isCreator` |
| `/graph` | `DependencyGraph.tsx` — D3 force graph | `GET /api/graph` (creator only) | `isCreator` |
| `/projects` | `ProjectsPanel.tsx` — DGM proposals dashboard | existing tRPC `dgmPendingProposals` (now protected) | `isCreator` |

Panels open as `Sheet` (shadcn/ui) from the right side.

### D5. Design system unification
- Remove all inline OKLCH `style` props → CSS variables in `globals.css`
- Use shadcn/ui throughout: `Sheet`, `Card`, `Badge`, `Button`, `Tooltip`, `Skeleton`
- `SHMSPage.tsx` uses the same design tokens

### D6. Complete state coverage
Every async component:
- Loading skeleton
- Empty state with action prompt
- Error boundary with retry
- Streaming animated cursor

---

## Merge Order & Risk Management

| Step | Branch | Risk | Gate |
|------|--------|------|------|
| 1 | `fix/security` (Worktree A) | Low | `pnpm run check` passes; all auth tests pass |
| 2 | `fix/critical-bugs` (Worktree B) | Low | All existing tests pass; no new TypeScript errors |
| 3 | `fix/infrastructure` (Worktree C) | Medium | Migration dry-run passes; `validate-migrations.ts` reports 0 conflicts; `pnpm test` passes |
| 4 | `feat/frontend-redesign` (Worktree D) | High | `pnpm run check` passes; SSE E2E test passes; Phase 5 panels render without errors |

**Rollback for C:** Before merging, snapshot `migrations_applied` table and `_journal.json`. If deploy fails, restore snapshot and `git revert` the C merge commit.

---

## Success Criteria (10/10)

| Area | Metric |
|------|--------|
| Security (3→10) | 0 public endpoints adjacent to code execution; no secrets in git; shell injection eliminated; auto-approval uses file-path allowlist |
| Quality (5→10) | 0 enum mismatches; `rejectProposal` atomic; dead code deleted; `replaceAll` fix applied; LSTM stub explicit |
| Infrastructure (5→10) | Single migration directory; 0 number conflicts; vector LRU cache; correct deps; CI uses pnpm |
| Tests (3→10) | Mocks point to real paths; >80% coverage on auth, pipeline, DGM, SSE flows; migration validation test |
| Frontend (6→10) | `HomeV2.tsx` < 100 lines; Zustand store; `useSSEStream` hook; all Phase 5 panels functional and creator-gated |
| Core (8→10) | Feedback stored in DB; sessions loadable and deletable; all slash commands routed correctly; MoA categories aligned |
