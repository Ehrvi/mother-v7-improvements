# Critical Bugs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all silent data corruption bugs, broken frontend features, and dead code in MOTHER v122.26.

**Architecture:** Code-only fixes — no DB migrations required. TypeScript types aligned to existing DB enum. Frontend components wired to real tRPC endpoints. Dead files deleted.

**Tech Stack:** TypeScript, React, tRPC v11, pnpm

---

## Pre-flight checklist

- [ ] Confirm you are on branch `fix/critical-bugs` (not `main`)
- [ ] Run `pnpm run check` — note any pre-existing TS errors before touching code
- [ ] Run `pnpm test` — record baseline pass/fail count

---

## Task 1 — Status enum alignment (B1 — code only)

**Problem:** `SelfProposal.status` in `server/mother/self-proposal-engine.ts` (line 53) uses values `'implementing'`, `'testing'`, and `'deployed'` which do not exist in the DB `self_proposals` enum. The DB enum has `'in_progress'` and `'implemented'`. Any write using the wrong string is silently discarded by MySQL.

**Files:**
- Modify: `server/mother/self-proposal-engine.ts`
- Modify: `server/mother/autonomous-update-job.ts`

### Steps

- [ ] **1a. Update the TypeScript union in `self-proposal-engine.ts` line 53.**

  Current (line 53):
  ```typescript
  status: 'pending' | 'approved' | 'implementing' | 'testing' | 'deployed' | 'rejected' | 'failed';
  ```

  Replace with:
  ```typescript
  status: 'pending' | 'approved' | 'rejected' | 'in_progress' | 'implemented' | 'failed';
  ```

- [ ] **1b. Fix first SQL write in `autonomous-update-job.ts` (~line 236).**

  Current:
  ```typescript
  `UPDATE self_proposals SET status = 'implementing', updated_at = NOW() WHERE id = ?`
  ```

  Replace `'implementing'` with `'in_progress'`:
  ```typescript
  `UPDATE self_proposals SET status = 'in_progress', updated_at = NOW() WHERE id = ?`
  ```

- [ ] **1c. Fix second SQL write in `autonomous-update-job.ts` (~line 425).**

  Current:
  ```typescript
  `UPDATE self_proposals SET status = 'testing', updated_at = NOW() WHERE id = ?`
  ```

  Replace `'testing'` with `'in_progress'` (testing is a sub-state of in-progress; DB has no separate value):
  ```typescript
  `UPDATE self_proposals SET status = 'in_progress', updated_at = NOW() WHERE id = ?`
  ```

- [ ] **1d. Search for any remaining stray uses of old values.** Run:
  ```bash
  grep -rn "'implementing'\|'testing'\|'deployed'" server/mother/
  ```
  Expected: zero matches after the fixes above.

- [ ] **1e. Test:** Run `pnpm run check`. The TypeScript compiler will now reject any code that still tries to assign `'implementing'`, `'testing'`, or `'deployed'` to a `SelfProposal.status` field. Zero errors expected.

- [ ] **1f. Commit:**
  ```bash
  git add server/mother/self-proposal-engine.ts server/mother/autonomous-update-job.ts
  git commit -m "fix(B1): align SelfProposal status enum to DB values (in_progress, implemented)"
  ```

---

## Task 2 — `rejectProposal` dual-table fix (B2)

**Problem:** In `server/mother/update-proposals.ts`, `rejectProposal()` updates only the `update_proposals` table. DGM proposals live in `self_proposals`. Rejecting a DGM proposal is a silent no-op. The `approveProposal()` function already performs the correct dual-table update and is the reference pattern.

**Files:**
- Modify: `server/mother/update-proposals.ts`
- Test: `tests/rejectProposal.test.ts`

### Steps

- [ ] **2a. Inside `rejectProposal()`, add the second table update mirroring `approveProposal()`.**

  After the existing `update_proposals` query, add:
  ```typescript
  const [manualResult] = await (db as any).$client.query(
    `UPDATE update_proposals
     SET status = 'rejected', rejected_reason = ?, updated_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [reason, proposalId]
  );
  const [dgmResult] = await (db as any).$client.query(
    `UPDATE self_proposals
     SET status = 'rejected', updated_at = NOW()
     WHERE id = ? AND status IN ('pending', 'failed')`,
    [proposalId]
  );
  const affectedRows =
    ((manualResult as any).affectedRows || 0) +
    ((dgmResult as any).affectedRows || 0);
  if (affectedRows === 0) {
    log.warn(`[Proposals] No rows updated for reject on proposal ${proposalId} — already rejected or not found`);
  }
  ```

- [ ] **2b. Write unit test:**

  Create `tests/rejectProposal.test.ts`:
  ```typescript
  import { vi, it, expect } from 'vitest';
  vi.mock('../server/db', () => ({
    getDb: vi.fn().mockResolvedValue({
      $client: {
        query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      },
    }),
  }));

  it('rejectProposal updates both tables', async () => {
    const { rejectProposal } = await import('../server/mother/update-proposals');
    const result = await rejectProposal(42, 'elgarcia.eng@gmail.com', 'test reason');
    expect(result.success).toBe(true);
    const { getDb } = await import('../server/db');
    const db = await (getDb as any)();
    const calls: string[] = db.$client.query.mock.calls.map((c: any[]) => c[0] as string);
    expect(calls.some(sql => sql.includes('update_proposals'))).toBe(true);
    expect(calls.some(sql => sql.includes('self_proposals'))).toBe(true);
  });
  ```

- [ ] **2c.** Run `pnpm test tests/rejectProposal.test.ts` — passes.

- [ ] **2d. Commit:**
  ```bash
  git add server/mother/update-proposals.ts tests/rejectProposal.test.ts
  git commit -m "fix(B2): rejectProposal now updates both update_proposals and self_proposals tables"
  ```

---

## Task 3 — `String.replace` → `replaceAll` (B3)

**Problem:** Line 134 of `server/mother/autonomous-update-job.ts` uses `currentContent.replace(change.findText, change.replaceWith)`. String `.replace()` with a string argument replaces only the **first** occurrence — diffs with repeated patterns silently fail.

**Files:**
- Modify: `server/mother/autonomous-update-job.ts` (line 134 only)
- Test: `tests/replaceAll.test.ts`

### Steps

- [ ] **3a. Change line 134 only:**

  Current:
  ```typescript
  const newContent = currentContent.replace(change.findText, change.replaceWith);
  ```

  Replace with:
  ```typescript
  const newContent = currentContent.replaceAll(change.findText, change.replaceWith);
  ```

  **Do NOT touch** any other `.replace()` call in the file. Specifically, the regex-based `.replace(/"/g, '\\"')` near line 388 is already global and will be removed entirely by Worktree A's `gitExec` migration.

- [ ] **3b. Write test:**

  Create `tests/replaceAll.test.ts`:
  ```typescript
  import { it, expect } from 'vitest';

  it('replaceAll replaces all occurrences, not just the first', () => {
    const content = 'foo bar foo baz foo';
    const result = content.replaceAll('foo', 'qux');
    expect(result).toBe('qux bar qux baz qux');
    expect(result.includes('foo')).toBe(false);
  });
  ```

- [ ] **3c.** Run `pnpm test tests/replaceAll.test.ts` — passes. Run `pnpm run check` — zero new TS errors.

- [ ] **3d. Commit:**
  ```bash
  git add server/mother/autonomous-update-job.ts tests/replaceAll.test.ts
  git commit -m "fix(B3): use replaceAll to replace all occurrences in DGM diff application"
  ```

---

## Task 4 — Dead code deletion (B4)

**Problem:** Four unreachable client files reference a non-existent `/api/chat` endpoint and cause bundle bloat.

**Files to delete:**
- `client/src/pages/Home.tsx`
- `client/src/components/ChatInterface.tsx`
- `client/src/lib/MotherContext.tsx`
- `client/src/pages/SHMSDashboardV3.tsx`

### Steps

- [ ] **4a. Verify `App.tsx` does not import any of the four files:**
  ```bash
  grep -n "Home[^V]\|ChatInterface\|MotherContext\|SHMSDashboardV3" client/src/App.tsx
  ```
  Expected: zero matches.

- [ ] **4b. Verify no other file imports them:**
  ```bash
  grep -rn "from.*pages/Home['\"]" client/src/
  grep -rn "from.*ChatInterface" client/src/
  grep -rn "from.*MotherContext" client/src/
  grep -rn "from.*SHMSDashboardV3" client/src/
  ```
  Expected: zero matches each. If any match found, resolve before deleting.

- [ ] **4c. Delete the four files:**
  ```bash
  rm client/src/pages/Home.tsx
  rm client/src/components/ChatInterface.tsx
  rm client/src/lib/MotherContext.tsx
  rm client/src/pages/SHMSDashboardV3.tsx
  ```

- [ ] **4d.** Run `pnpm run check` — zero TypeScript errors. Run `pnpm test` — all pass.

- [ ] **4e. Commit:**
  ```bash
  git add -u
  git commit -m "chore(B4): delete dead client files (Home.tsx, ChatInterface, MotherContext, SHMSDashboardV3)"
  ```

---

## Task 5 — Feedback button → API call (B5)

**Problem:** 👍/👎 buttons only update local state. `queries` table has no `user_feedback` column yet (that's Worktree C). This task adds the tRPC plumbing; the procedure is a logging stub until C's migration runs.

**Files:**
- Modify: `server/routers/mother.ts`
- Modify: `client/src/pages/HomeV2.tsx`
- Test: `tests/feedback.test.tsx`

### Steps

- [ ] **5a. Add `submitFeedback` mutation to `motherRouter` in `server/routers/mother.ts`:**

  ```typescript
  submitFeedback: protectedProcedure
    .input(
      z.object({
        queryId: z.string(),
        feedback: z.enum(['up', 'down']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Worktree B stub — logs only. Worktree C adds user_feedback column.
      // When C migration runs, replace this body with:
      // await db.$client.query(
      //   `UPDATE queries SET user_feedback = ? WHERE id = ?`,
      //   [input.feedback === 'up' ? 1 : -1, input.queryId]
      // );
      const log = (await import('../_core/logger')).createLogger('FEEDBACK');
      log.info(
        `[B5-stub] Feedback received: queryId=${input.queryId} value=${input.feedback} userId=${ctx.user?.id ?? 'unknown'}`
      );
      return { success: true, persisted: false, note: 'Worktree C migration pending' };
    }),
  ```

- [ ] **5b. Add mutation hook in `HomeV2.tsx`:**

  After the existing `queryMutation` declaration (~line 350):
  ```typescript
  const submitFeedbackMutation = trpc.mother.submitFeedback.useMutation();
  ```

- [ ] **5c. Wire the feedback button `onClick` in `HomeV2.tsx` (~line 850):**

  Current:
  ```typescript
  onClick={() => setFeedback(f => ({ ...f, [msg.id]: f[msg.id] === dir ? undefined as unknown as 'up' : dir }))}
  ```

  Replace with:
  ```typescript
  onClick={() => {
    const next = feedback[msg.id] === dir ? undefined : dir;
    setFeedback(f => ({ ...f, [msg.id]: next as 'up' | 'down' }));
    if (next) {
      submitFeedbackMutation.mutate({ queryId: msg.id, feedback: next });
    }
  }}
  ```

- [ ] **5d.** Run `pnpm run check` — zero TS errors. Run `pnpm test` — passes.

- [ ] **5e. Commit:**
  ```bash
  git add server/routers/mother.ts client/src/pages/HomeV2.tsx
  git commit -m "feat(B5): wire feedback buttons to trpc.mother.submitFeedback (stub until C migration)"
  ```

---

## Task 6 — `SessionHistory` tRPC fix (B6)

**Problem:** `SessionHistory.tsx` makes a raw `GET /api/trpc/mother.getSessions` fetch — plain GET to bare tRPC URL returns 400. Delete handler is local-only with no server call.

**Files:**
- Modify: `server/routers/mother.ts`
- Modify: `client/src/components/SessionHistory.tsx`
- Test: `tests/SessionHistory.test.tsx`

### Steps

- [ ] **6a. Add `getSessions` query to `motherRouter`:**

  ```typescript
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    try {
      const [rows] = await (db as any).$client.query(
        `SELECT session_id AS id, MIN(query) AS title, MAX(query) AS preview,
                MIN(created_at) AS createdAt, MAX(updated_at) AS updatedAt,
                COUNT(*) AS messageCount
         FROM queries
         WHERE user_id = ? AND session_id IS NOT NULL
         GROUP BY session_id
         ORDER BY MAX(updated_at) DESC LIMIT 50`,
        [ctx.user.id]
      );
      return (rows as any[]) ?? [];
    } catch {
      return []; // session_id column not yet added (Worktree C)
    }
  }),
  ```

- [ ] **6b. Add `deleteSession` mutation to `motherRouter`:**

  ```typescript
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await (db as any).$client.query(
          `DELETE FROM queries WHERE session_id = ? AND user_id = ?`,
          [input.sessionId, ctx.user.id]
        );
        return { success: true };
      } catch {
        return { success: false }; // session_id column not yet added (Worktree C)
      }
    }),
  ```

- [ ] **6c. Rewrite `SessionHistory.tsx` to use tRPC properly.**

  Remove the raw `useEffect` fetch block. Replace `const [sessions, setSessions]` and `const [loading, setLoading]` with:
  ```typescript
  const sessionsQuery = trpc.mother.getSessions.useQuery(undefined, { staleTime: 30_000 });
  const sessions = sessionsQuery.data ?? [];
  const loading = sessionsQuery.isLoading;
  ```

  Add mutation with refetch on success:
  ```typescript
  const deleteSessionMutation = trpc.mother.deleteSession.useMutation({
    onSuccess: () => sessionsQuery.refetch(),
  });
  ```

  Update `handleDelete` confirmed branch:
  ```typescript
  if (confirmDelete === sessionId) {
    deleteSessionMutation.mutate({ sessionId });
    onDeleteSession?.(sessionId);
    setConfirmDelete(null);
  }
  ```

  Remove `setSessions((prev) => prev.filter(...))` — `onSuccess` triggers refetch.

- [ ] **6d.** Run `pnpm run check` and `pnpm test` — both pass.

- [ ] **6e. Commit:**
  ```bash
  git add server/routers/mother.ts client/src/components/SessionHistory.tsx
  git commit -m "fix(B6): SessionHistory uses tRPC properly; deleteSession hits server with auth guard"
  ```

---

## Task 7 — Orchestration dead categories (B7)

**Problem:** `orchestration.ts` references `'natural_science'`, `'philosophy'`, `'economics'`, `'health_care'` in `mediumComplexityCategories` to trigger MoA, but `intelligence.ts` `classifyQuery()` never produces these values — these queries fall through to `'general'` and skip MoA entirely.

**Files:**
- Modify: `server/mother/intelligence.ts`
- Test: `tests/classifyQuery.test.ts`

### Steps

- [ ] **7a. Expand the `QueryCategory` type in `intelligence.ts`:**

  Current:
  ```typescript
  export type QueryCategory = 'simple' | 'general' | 'coding' | 'complex_reasoning' | 'research' | 'creative';
  ```

  Replace with:
  ```typescript
  export type QueryCategory =
    | 'simple' | 'general' | 'coding' | 'complex_reasoning' | 'research' | 'creative'
    | 'natural_science' | 'philosophy' | 'economics' | 'health_care';
  ```

- [ ] **7b. Add model mapping for new categories in `getModelForCategory()`:**

  ```typescript
  case 'natural_science': return { provider: 'anthropic', modelName: 'claude-sonnet-4-6' };
  case 'philosophy':      return { provider: 'anthropic', modelName: 'claude-sonnet-4-6' };
  case 'economics':       return { provider: 'openai', modelName: 'gpt-4o' };
  case 'health_care':     return { provider: 'anthropic', modelName: 'claude-sonnet-4-6' };
  ```

- [ ] **7c. Add keyword detection arrays in `classifyQuery()` after the `creativePatterns` block:**

  ```typescript
  const naturalSciencePatterns = [
    'fisica', 'quimica', 'biologia', 'geologia', 'astronomia', 'ecologia',
    'evolucao', 'genetica', 'celula', 'atomo', 'molecula', 'reacao quimica',
    'sistema solar', 'buraco negro', 'relatividade', 'campo magnetico',
    'especie', 'ecosistema', 'biodiversidade', 'fotossintese', 'mitocondria',
    'physics', 'chemistry', 'biology', 'geology', 'astronomy', 'ecology',
    'evolution', 'genetics', 'cell', 'atom', 'molecule', 'chemical reaction',
    'solar system', 'black hole', 'magnetic field', 'species', 'ecosystem',
    'biodiversity', 'photosynthesis', 'mitochondria',
  ];
  const philosophyPatterns = [
    'filosofia', 'filosofico', 'etica', 'moral', 'ontologia', 'epistemologia',
    'existencialismo', 'utilitarismo', 'nietzsche', 'kant', 'aristoteles',
    'platon', 'descartes', 'hegel', 'consciencia', 'livre arbitrio',
    'determinismo', 'ceticismo', 'fenomenologia', 'metafisica',
    'philosophy', 'philosophical', 'ethics', 'morality', 'ontology',
    'epistemology', 'existentialism', 'utilitarianism', 'consciousness',
    'free will', 'determinism', 'skepticism', 'phenomenology', 'metaphysics',
  ];
  const economicsPatterns = [
    'economia', 'economico', 'macroeconomia', 'microeconomia',
    'inflacao', 'deflacao', 'pib', 'gdp', 'taxa de juros', 'politica monetaria',
    'politica fiscal', 'keynesianismo', 'neoliberalismo', 'mercado de trabalho',
    'desemprego', 'crescimento economico', 'divida publica', 'balanca comercial',
    'economics', 'economy', 'macroeconomics', 'microeconomics',
    'inflation', 'deflation', 'interest rate', 'monetary policy',
    'fiscal policy', 'keynesian', 'neoliberal', 'labor market',
    'unemployment', 'economic growth', 'national debt', 'trade balance',
  ];
  const healthCarePatterns = [
    'saude', 'medico', 'medicina', 'diagnostico medico', 'tratamento',
    'doenca', 'sintoma', 'vacina', 'farmaco', 'farmaceutico', 'cirurgia',
    'oncologia', 'cardiologia', 'neurologia', 'diabetes', 'hipertensao',
    'sistema imunologico', 'virus', 'bacteria', 'epidemia', 'pandemia',
    'health', 'medical', 'medicine', 'diagnosis', 'treatment',
    'disease', 'symptom', 'vaccine', 'drug', 'pharmaceutical', 'surgery',
    'oncology', 'cardiology', 'neurology', 'diabetes', 'hypertension',
    'immune system', 'virus', 'bacteria', 'epidemic', 'pandemic',
  ];

  const naturalScienceScore = naturalSciencePatterns.filter(p => q.includes(p)).length;
  const philosophyScore    = philosophyPatterns.filter(p => q.includes(p)).length;
  const economicsScore     = economicsPatterns.filter(p => q.includes(p)).length;
  const healthCareScore    = healthCarePatterns.filter(p => q.includes(p)).length;
  ```

- [ ] **7d. Insert routing branches BEFORE `complexScore >= 1` and AFTER `creativeScore >= 1`:**

  ```typescript
  } else if (philosophyScore >= 1) {
    category = 'philosophy';
    confidence = Math.min(0.92, 0.75 + philosophyScore * 0.05);
  } else if (naturalScienceScore >= 1) {
    category = 'natural_science';
    confidence = Math.min(0.92, 0.75 + naturalScienceScore * 0.05);
  } else if (economicsScore >= 1) {
    category = 'economics';
    confidence = Math.min(0.92, 0.75 + economicsScore * 0.05);
  } else if (healthCareScore >= 1) {
    category = 'health_care';
    confidence = Math.min(0.92, 0.75 + healthCareScore * 0.05);
  }
  ```

- [ ] **7e. Write tests:**

  Create `tests/classifyQuery.test.ts`:
  ```typescript
  import { classifyQuery } from '../server/mother/intelligence';
  import { it, expect } from 'vitest';

  it('philosophy query returns philosophy category', () => {
    const r = classifyQuery('Discuss the ethics of utilitarianism and free will');
    expect(r.category).toBe('philosophy');
  });

  it('natural_science query returns natural_science category', () => {
    const r = classifyQuery('Explain quantum mechanics and superposition');
    expect(r.category).toBe('natural_science');
  });

  it('economics query returns economics category', () => {
    const r = classifyQuery('Analyze inflation and monetary policy');
    expect(r.category).toBe('economics');
  });

  it('health_care query returns health_care category', () => {
    const r = classifyQuery('Explain the immune system response to a pandemic');
    expect(r.category).toBe('health_care');
  });
  ```

- [ ] **7f.** Run `pnpm test tests/classifyQuery.test.ts` — all 4 pass. Run `pnpm run check` — zero errors.

- [ ] **7g. Commit:**
  ```bash
  git add server/mother/intelligence.ts tests/classifyQuery.test.ts
  git commit -m "feat(B7): add natural_science, philosophy, economics, health_care to classifyQuery (enables MoA)"
  ```

---

## Task 8 — LSTM stub explicit response (B8)

**Problem:** `predictStructuralBehavior()` in `server/shms/digital-twin-engine-c205.ts` silently returns plausible-looking data without indicating it is a stub. Callers cannot distinguish real LSTM predictions from the rule-based fallback.

**Files:**
- Modify: `server/shms/digital-twin-engine-c205.ts`
- Test: `tests/digitalTwin.test.ts`

### Steps

- [ ] **8a. Update return type to include `status` and `warning` fields:**

  ```typescript
  ): Promise<{
    status: 'not_implemented' | 'ok';
    prediction: 'stable' | 'degrading' | 'critical';
    predictions: never[];
    confidence: number;
    horizonHours: number;
    warning?: string;
  }>
  ```

- [ ] **8b. Replace the stub body with an explicit not-implemented response:**

  ```typescript
  const twin = twinRegistry.get(structureId);
  const WARNING = 'PredictiveEngine LSTM integration pending (C207)';

  if (!twin) {
    return { status: 'not_implemented', prediction: 'stable', predictions: [],
             confidence: 0, horizonHours, warning: WARNING };
  }

  const ruleBasedPrediction =
    twin.riskLevel === 'critical' ? 'critical' :
    twin.riskLevel === 'high'     ? 'degrading' : 'stable';
  const ruleBasedConfidence =
    twin.riskLevel === 'critical' ? 0.7 :
    twin.riskLevel === 'high'     ? 0.6 : 0.8;

  return { status: 'not_implemented', prediction: ruleBasedPrediction, predictions: [],
           confidence: ruleBasedConfidence, horizonHours, warning: WARNING };
  ```

- [ ] **8c. Write test:**

  Create `tests/digitalTwin.test.ts`:
  ```typescript
  import { predictStructuralBehavior } from '../server/shms/digital-twin-engine-c205';
  import { it, expect } from 'vitest';

  it('returns warning and status=not_implemented for unknown structure', async () => {
    const result = await predictStructuralBehavior('UNKNOWN-999', 24);
    expect(result.status).toBe('not_implemented');
    expect(result.warning).toContain('C207');
    expect(result.predictions).toEqual([]);
  });
  ```

- [ ] **8d.** Run `pnpm test tests/digitalTwin.test.ts` — passes. Run `pnpm run check` — zero TS errors.

- [ ] **8e. Commit:**
  ```bash
  git add server/shms/digital-twin-engine-c205.ts tests/digitalTwin.test.ts
  git commit -m "fix(B8): LSTM stub returns explicit not_implemented status and warning (pending C207)"
  ```

---

## Final integration checks

- [ ] Run `pnpm run check` — zero TypeScript errors across the whole project
- [ ] Run `pnpm test` — all tests pass
- [ ] Confirm dead files are gone: `ls client/src/pages/Home.tsx` → "No such file or directory"
- [ ] Smoke-test: `pnpm dev`, click 👍 on a MOTHER message, confirm tRPC call to `mother.submitFeedback` in Network tab with 200 response
- [ ] Open SessionHistory panel — confirm it loads (empty list is OK — `session_id` column may not exist yet)

---

## Merge gate

- `pnpm run check` exits 0
- `pnpm test` exits 0 with no new failures
- Dead files confirmed deleted
- Branch is `fix/critical-bugs` — merge AFTER `fix/security` (Worktree A) per merge order
