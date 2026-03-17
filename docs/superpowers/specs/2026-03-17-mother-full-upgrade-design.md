# MOTHER v122.26 — Full Upgrade to 10/10 Design Spec

**Date:** 2026-03-17
**Author:** Claude Code (Sonnet 4.6)
**Strategy:** Option B — 4 parallel git worktrees, merge in risk-ascending order
**Goal:** Raise all 6 quality areas to 10/10

---

## Overview

Four independent workstreams executed in parallel via git worktrees, then merged in order:
1. Worktree A — Security (lowest risk, merge first)
2. Worktree B — Critical Bugs (low risk, merge second)
3. Worktree C — Infrastructure/DB (medium risk, merge third)
4. Worktree D — Frontend Redesign (highest change volume, merge last)

---

## Worktree A — Security (3/10 → 10/10)

### A1. Auth guards on DGM endpoints
**File:** `server/routers/mother.ts`
**Problem:** `dgmResolveProposal` (L431), `dgmTestRun` (L360), `supervisor.evolve` (L447) are `publicProcedure` — any unauthenticated caller can approve code-execution proposals.
**Fix:** Move all three to `protectedProcedure` with `isCreator` guard (pattern from `runBenchmark` L646).

### A2. Shell injection fix
**File:** `server/mother/autonomous-update-job.ts`
**Problem:** `execSync(`git -C ${repoPath} ${command}`)` allows shell metacharacter injection via `proposalId`.
**Fix:** Replace with `execFileSync('git', ['-C', repoPath, ...argArray])`. Validate `proposalId` as integer before use. Same fix for `cp -r` calls.

### A3. `allQueries` data privacy
**File:** `server/routers/mother.ts:243`
**Problem:** Any authenticated user can retrieve all users' query history.
**Fix:** Non-creator users get only their own queries (filter by `userId`). Creator gets all.

### A4. DGM auto-approval allowlist
**File:** `server/mother/self-proposal-engine.ts`
**Problem:** Keyword matching on proposal title is trivially bypassed.
**Fix:** Auto-approval only allowed if `proposed_changes` targets files within an explicit allowlist: `server/mother/semantic-cache.ts`, `server/mother/cache*.ts`. Any proposal touching `auth`, `routers`, `db`, `schema`, `autonomous`, `middleware` → forced manual approval.

### A5. `.gitignore` hardening
**File:** `.gitignore`
**Fix:** Add `.env.production`, `.env.*.local`, `*.env`, `!.env.example`

### A6. TLS certificate validation
**File:** `server/db.ts`
**Problem:** `rejectUnauthorized: false` for non-localhost connections.
**Fix:** Set `rejectUnauthorized: true`. Use GCP Cloud SQL CA bundle path if needed.

---

## Worktree B — Critical Bugs (5/10 → 7/10 quality)

### B1. Status enum alignment
**Files:** `drizzle/schema.ts`, `server/mother/self-proposal-engine.ts`, `server/mother/autonomous-update-job.ts`
**Problem:** TypeScript uses `'implementing'|'testing'|'deployed'`; DB enum has `'implemented'|'in_progress'`. Writes fail silently.
**Fix:** Align TypeScript types to DB enum values. DB migration to add missing values if needed. Single source of truth in `schema.ts`.

### B2. `rejectProposal` dual-table update
**File:** `server/mother/update-proposals.ts`
**Problem:** `rejectProposal` only updates `update_proposals`, not `self_proposals`.
**Fix:** Mirror the `approveProposal` dual-update pattern — update both tables.

### B3. `String.replace` → `replaceAll`
**File:** `server/mother/autonomous-update-job.ts`
**Problem:** `String.replace()` only replaces first occurrence — diffs with repeated patterns silently fail.
**Fix:** Use `replaceAll()` or regex with `/g` flag.

### B4. Dead code removal
**Files to delete:**
- `client/src/pages/Home.tsx` (superseded by HomeV2)
- `client/src/components/ChatInterface.tsx` (unused)
- `client/src/lib/MotherContext.tsx` (uses dead `/api/chat` endpoint)
- `client/src/pages/SHMSDashboardV3.tsx` (synthetic data only, unrouted)

### B5. Feedback button → API call
**File:** `client/src/pages/HomeV2.tsx`
**Problem:** 👍/👎 only updates local state, never sent to server.
**Fix:** Add `trpc.mother.submitFeedback` mutation. Backend stores feedback in `queries` table (`userFeedback` column or new `feedback` field).

### B6. `SessionHistory` fix
**File:** `client/src/components/SessionHistory.tsx`
**Problem:** Raw `GET /api/trpc/mother.getSessions` fails (tRPC needs query params). Delete is local-only.
**Fix:** Use tRPC client properly (`trpc.mother.getSessions.useQuery()`). Implement server-side delete mutation.

### B7. `orchestration.ts` dead category cleanup
**File:** `server/mother/orchestration.ts`
**Problem:** `mediumComplexityCategories` includes `'natural_science'`, `'philosophy'`, `'economics'` which `intelligence.ts` never produces.
**Fix:** Remove unreachable categories OR add them to `classifyQuery()` in `intelligence.ts`.

### B8. LSTM stub documentation
**File:** `server/shms/digital-twin-engine-c205.ts`
**Fix:** Replace silent stub with explicit `throw new Error('PredictiveEngine not implemented')` or return a clearly marked mock result, so callers know they're not getting real predictions.

---

## Worktree C — Infrastructure/DB (5/10 → 10/10)

### C1. Migration system consolidation
**Problem:** Two parallel migration directories (`drizzle/` and `drizzle/migrations/`), disconnected journal, duplicate numbers (0010, 0015–0020, 0025).
**Fix:**
1. Rename all duplicate files to sequential non-conflicting numbers
2. Move all migrations to `drizzle/migrations/` as the single source
3. Rebuild `_journal.json` to reflect all 40+ migrations
4. Add `scripts/validate-migrations.ts` that checks for number conflicts on startup

### C2. Vector search optimization
**Problem:** `getSemanticCacheEntry()` full table scan over 500 rows in Node.js memory — O(n) with knowledge base size.
**Fix (additive, no breaking change):**
1. Add `created_at` index on `semantic_cache` table
2. Add `domain` index on `knowledge` table
3. Add application-level LRU cache (Map with 200-entry cap) for recently computed embeddings
4. Document migration path to MySQL VECTOR type (MySQL 9.0+) or pgvector as future upgrade

### C3. Dependency cleanup
**File:** `package.json`
**Moves:**
- `playwright` → `devDependencies` (~200MB removed from prod image)
- `supertest` → `devDependencies`
- Remove `pg` and `@types/pg` (MySQL-only project, dead dependency)
- Remove `wouter` (project uses `react-router-dom` — duplicate router)

### C4. CI/CD package manager consistency
**File:** `.github/workflows/autonomous-deploy.yml`
**Problem:** CI uses `npm install --legacy-peer-deps` but project uses `pnpm`.
**Fix:** Switch CI to `pnpm install --frozen-lockfile`. Add `pnpm` setup step.

### C5. Drizzle relations stub
**File:** `drizzle/relations.ts`
**Problem:** Currently empty — no typed joins available.
**Fix:** Add Drizzle `relations()` definitions for the core tables: `users ↔ queries`, `queries ↔ knowledge`, `selfProposals ↔ auditLog`.

### C6. `db:push` script fix
**File:** `package.json` scripts
**Problem:** `db:push` runs `drizzle-kit` which only sees the 3-migration journal, not the 40+ production migrations.
**Fix:** Replace with custom `scripts/db-migrate.ts` that runs all files in `drizzle/migrations/` in order, using the `migrations_applied` tracking table already in production.

---

## Worktree D — Frontend Redesign (6/10 → 10/10)

### D1. Component architecture decomposition

**Current:** `HomeV2.tsx` (~1000 lines) — monolith containing SSE engine, sidebar, message list, input, stats, DGM panel.

**New architecture:**
```
client/src/
├── store/
│   └── chatStore.ts              # Zustand store — all chat state
├── hooks/
│   └── useSSEStream.ts           # SSE engine extracted as custom hook
├── pages/
│   └── HomeV2.tsx                # ~80 lines — pure orchestration shell
└── components/chat/
    ├── ChatSidebar.tsx           # Left sidebar + command buttons
    ├── MessageList.tsx           # Scrollable message feed
    ├── MessageBubble.tsx         # Individual message (user/MOTHER)
    ├── QuickPrompts.tsx          # Follow-up chips after last message
    ├── StreamingInput.tsx        # Input bar + file drop + controls
    ├── PhaseHeader.tsx           # Phase indicator + stream speed + stats
    ├── DGMPanel.tsx              # DGM test + lineage panel
    └── FeedbackButtons.tsx       # 👍/👎 with API integration
```

### D2. State management — Zustand
**Why:** 15+ `useState` calls in a single component is unmanageable. Zustand provides:
- `messages[]` — full conversation history
- `streamingState` — `idle | streaming | stopped`
- `currentPhase` — active pipeline phase
- `activeToolCalls[]` — ReAct tool call trace
- `stats` — latency, tier, cost, quality per message
- `feedback` — per-message feedback state
- Persistence to `localStorage` (replaces broken `MotherContext`)

### D3. `useSSEStream` hook
Extract the 150-line SSE engine from `HomeV2.tsx` into `hooks/useSSEStream.ts`:
- Returns `{ sendMessage, stopStream, isStreaming }`
- Internally dispatches to Zustand store
- Handles abort, reconnect, and all event types (`token`, `phase`, `tool_call`, `done`, `error`)

### D4. Phase 5 features implementation
Implement the "Fase 5" commands as real UI panels (not just chat text):

| Command | Implementation |
|---------|---------------|
| `/shell` | `ShellPanel.tsx` — terminal emulator connecting to E2B sandbox via `/api/shell` SSE |
| `/editor` | `CodeEditorPanel.tsx` — Monaco editor + file tree via `/api/editor` endpoint |
| `/graph` | `DependencyGraph.tsx` — D3 force graph of server module dependencies |
| `/projects` | `ProjectsPanel.tsx` — list of DGM proposals + metrics dashboard |

These open as sliding panels (Sheet from shadcn/ui) rather than chat responses.

### D5. Design system unification
- Purge hand-rolled inline OKLCH `style` props from `HomeV2.tsx`
- Use shadcn/ui components throughout: `Sheet`, `Card`, `Badge`, `Button`, `Tooltip`
- Standardize on CSS variables for the OKLCH color palette (define in `globals.css`)
- `SHMSPage.tsx` migrated to use the same design tokens

### D6. Empty/loading/error states
Every async component gets explicit states:
- Message list loading skeleton
- Empty conversation landing screen with quick-start prompts
- Error boundary per panel with retry action
- Streaming indicator (animated typing cursor)

---

## Merge Order & Risk Management

| Step | Branch | Risk | Gate |
|------|--------|------|------|
| 1 | `fix/security` (Worktree A) | Low | `npm run check` passes |
| 2 | `fix/critical-bugs` (Worktree B) | Low | All existing tests pass |
| 3 | `fix/infrastructure` (Worktree C) | Medium | Migration dry-run on dev DB |
| 4 | `feat/frontend-redesign` (Worktree D) | High | Visual smoke test + E2E SSE test |

---

## Success Criteria (10/10)

| Area | Metric |
|------|--------|
| Security | 0 public endpoints that trigger code execution; no secrets in git |
| Quality | 0 `as any` in auth/DGM paths; enum alignment; no dead code |
| Infrastructure | Single migration system; vector index; correct deps |
| Tests | All mocks point to real paths; >80% coverage on critical paths |
| Frontend | `HomeV2.tsx` < 100 lines; all Phase 5 features functional |
| Core | Feedback stored; sessions loadable; all slash commands work |
