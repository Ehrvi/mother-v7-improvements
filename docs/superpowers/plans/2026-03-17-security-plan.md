# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all 6 security vulnerabilities in MOTHER v122.26.

**Architecture:** Auth guards on 5 tRPC endpoints, shell injection elimination via execFileSync, data privacy fix, DGM file-path allowlist, .gitignore hardening, TLS fix.

**Tech Stack:** TypeScript, tRPC v11, Node.js execFileSync, Drizzle ORM

---

## Task 1: Auth guards on DGM endpoints (A1)

**Files:**
- Modify: `server/routers/mother.ts`
- Reference: `server/_core/trpc.ts` (procedure definitions)

Five DGM endpoints are `publicProcedure` and must be changed to `protectedProcedure` with an `isCreator` guard. Pattern to follow: `runBenchmark` (around L636) which already uses `protectedProcedure` + `ctx.user?.email !== CREATOR` check.

### Steps

- [ ] **1.1 Change `dgmTestRun` (~L360):**

  ```typescript
  dgmTestRun: protectedProcedure
    .input(
      z.object({
        benchmarkQueries: z.array(z.object({
          id: z.string(),
          query: z.string(),
          expectedMinQuality: z.number().optional().default(50),
          category: z.string().optional().default('general'),
        })).optional(),
        selfImproveSize: z.number().min(1).max(5).optional().default(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.email !== CREATOR) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'DGM test runs require creator authorization' });
      }
      // ... rest of handler unchanged
  ```

- [ ] **1.2 Change `dgmEvents` (~L411):**

  ```typescript
  dgmEvents: protectedProcedure
    .input(z.object({ since: z.number().optional().default(0) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.email !== CREATOR) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'DGM event log requires creator authorization' });
      }
      // ... rest of handler unchanged
  ```

- [ ] **1.3 Change `dgmPendingProposals` (~L422):**

  ```typescript
  dgmPendingProposals: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.email !== CREATOR) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'DGM pending proposals requires creator authorization' });
      }
      // ... rest of handler unchanged
  ```

- [ ] **1.4 Change `dgmResolveProposal` (~L431):**

  ```typescript
  dgmResolveProposal: protectedProcedure
    .input(z.object({
      proposalId: z.string(),
      approved: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.email !== CREATOR) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'DGM proposal resolution requires creator authorization' });
      }
      // ... rest of handler unchanged
  ```

- [ ] **1.5 Change `supervisor.evolve` (~L447):**

  ```typescript
  supervisor: router({
    evolve: protectedProcedure
      .input(z.object({ goal: z.string().min(1).max(2000) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.email !== CREATOR) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Supervisor evolution requires creator authorization' });
        }
        // ... rest of handler unchanged
  ```

- [ ] **1.6 Verify `TRPCError` is imported** — add if missing: `import { TRPCError } from '@trpc/server';`

- [ ] **1.7** Run TypeScript check:
  ```bash
  npx tsc --project tsconfig.server.json --noEmit 2>&1 | grep -v node_modules
  ```
  Expected: no `error TS` lines.

- [ ] **1.8 Commit:**
  ```bash
  git add server/routers/mother.ts
  git commit -m "security(A1): add protectedProcedure + isCreator guard to 5 DGM endpoints"
  ```

---

## Task 2: Shell injection fix (A2)

**Files:**
- Modify: `server/mother/autonomous-update-job.ts`

`runGitCommand` uses template-literal string interpolation to build shell commands passed to `execSync` — classic shell injection. Additionally, `cp -r` and `rm -rf` shell commands must be replaced with Node.js native equivalents.

### Steps

- [ ] **2.1 Add `execFileSync` to existing import (~L26):**

  Current:
  ```typescript
  import { execSync } from 'child_process';
  ```

  Replace with:
  ```typescript
  import { execSync, execFileSync } from 'child_process';
  ```

- [ ] **2.2 Add `proposalId` validation at start of `executeAutonomousUpdate` (~L178):**

  ```typescript
  export async function executeAutonomousUpdate(proposalId: number): Promise<UpdateJobResult> {
    // Security: validate proposalId is a strict positive integer before any use
    if (!Number.isInteger(proposalId) || proposalId <= 0) {
      throw new Error(`Invalid proposalId: must be a positive integer, got ${proposalId}`);
    }
    const startTime = Date.now();
    // ... rest unchanged
  ```

- [ ] **2.3 Replace `runGitCommand` function (L158–L164) with `gitExec`:**

  Delete `runGitCommand` entirely. Add:
  ```typescript
  // SECURITY: replaces runGitCommand — no shell interpolation, no injection risk
  function gitExec(cwd: string, args: string[]): string {
    try {
      return execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch (error: any) {
      throw new Error(`Git command failed: git -C ${cwd} ${args.join(' ')}\n${error.message}`);
    }
  }
  ```

- [ ] **2.4 Update ALL `runGitCommand` callsites:**

  | Location | Old call | New call |
  |---|---|---|
  | ~L298 | `runGitCommand(repoPath, \`checkout -b ${branchName}\`)` | `gitExec(repoPath, ['checkout', '-b', branchName])` |
  | ~L299 | `runGitCommand(repoPath, 'config user.name "MOTHER Autonomous Agent"')` | `gitExec(repoPath, ['config', 'user.name', 'MOTHER Autonomous Agent'])` |
  | ~L300 | `runGitCommand(repoPath, 'config user.email "mother@intelltech.ai"')` | `gitExec(repoPath, ['config', 'user.email', 'mother@intelltech.ai'])` |
  | ~L376 | `runGitCommand(repoPath, 'add -A')` | `gitExec(repoPath, ['add', '-A'])` |
  | ~L388 | `runGitCommand(repoPath, \`commit -m "${commitMessage.replace(/"/g, '\\"')}"\`)` | `gitExec(repoPath, ['commit', '-m', commitMessage])` |
  | ~L390 | `runGitCommand(repoPath, 'rev-parse HEAD')` | `gitExec(repoPath, ['rev-parse', 'HEAD'])` |
  | ~L394 | `runGitCommand(repoPath, \`push origin ${branchName}\`)` | `gitExec(repoPath, ['push', 'origin', branchName])` |

- [ ] **2.5 Replace `cp -r` shell call (~L287):**

  Current:
  ```typescript
  execSync(`cp -r ${sourcePath} ${repoPath}`, ...)
  ```

  Replace with:
  ```typescript
  fs.cpSync(sourcePath, repoPath, { recursive: true });
  ```

  Verify `fs` is imported: `import fs from 'fs';` or `import * as fs from 'fs';`

- [ ] **2.6 Replace `rm -rf` shell call (~L487):**

  Current:
  ```typescript
  execSync(`rm -rf ${tempDir}`, ...)
  ```

  Replace with:
  ```typescript
  fs.rmSync(tempDir, { recursive: true, force: true });
  ```

- [ ] **2.7 Verify `runGitCommand` is fully deleted** — no remaining references:
  ```bash
  grep -n "runGitCommand" server/mother/autonomous-update-job.ts
  ```
  Expected: zero matches.

- [ ] **2.8** Run TypeScript check:
  ```bash
  npx tsc --project tsconfig.server.json --noEmit 2>&1 | grep -v node_modules
  ```
  Expected: no `error TS` lines.

- [ ] **2.9 Commit:**
  ```bash
  git add server/mother/autonomous-update-job.ts
  git commit -m "security(A2): replace shell-interpolated execSync with execFileSync + fs.cpSync/rmSync"
  ```

---

## Task 3: allQueries data privacy (A3)

**Files:**
- Modify: `server/routers/mother.ts`

`allQueries` at ~L243 returns all users' query history to any authenticated user. `history` (L225) correctly filters to `ctx.user.id`. Fix: creator sees all, everyone else sees their own rows only.

### Steps

- [ ] **3.1 Replace `allQueries` handler body:**

  ```typescript
  allQueries: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const isCreator = ctx.user?.email === CREATOR;
      if (isCreator) {
        // Creator sees all queries across all users
        return await getRecentQueries(input.limit);
      }
      // Non-creator users see only their own queries
      const queries = await getRecentQueries(input.limit);
      return queries.filter(q => q.userId === ctx.user.id);
    }),
  ```

- [ ] **3.2** Run TypeScript check:
  ```bash
  npx tsc --project tsconfig.server.json --noEmit 2>&1 | grep -v node_modules
  ```
  Expected: no `error TS` lines.

- [ ] **3.3 Commit:**
  ```bash
  git add server/routers/mother.ts
  git commit -m "security(A3): scope allQueries to own data for non-creator users"
  ```

---

## Task 4: DGM auto-approval file-path allowlist (A4)

**Files:**
- Modify: `server/mother/self-proposal-engine.ts`

`classifyProposalRisk` only checks `title` and `description` text — trivially bypassed. Fix adds structural JSON validation and file-path checks that run BEFORE any keyword matching.

### Steps

- [ ] **4.1 Add blocklist and allowlist constants before `classifyProposalRisk`:**

  ```typescript
  // Security: file-path patterns that always force HIGH risk
  // Any proposal touching these paths cannot be auto-approved
  const BLOCKED_PATH_PATTERNS = [
    'auth',
    'routers',
    '/db',
    'schema',
    'autonomous',
    'middleware',
    'production-entry',
  ];

  // Security: ONLY these file patterns are eligible for LOW-risk auto-approval
  const ALLOWLISTED_PATHS = [
    'server/mother/semantic-cache.ts',
    'server/mother/cache',
  ];
  ```

- [ ] **4.2 Replace `classifyProposalRisk` function body:**

  ```typescript
  export function classifyProposalRisk(proposal: SelfProposal): 'low' | 'medium' | 'high' {
    // --- Step 1: Validate proposed_changes structure ---
    // null/absent → HIGH risk
    if (!proposal.proposedChanges) return 'high';

    let parsedChanges: { files?: string[] } | null = null;
    try {
      parsedChanges = JSON.parse(proposal.proposedChanges);
    } catch {
      return 'high'; // Unparseable JSON → HIGH risk
    }

    if (!parsedChanges || !Array.isArray(parsedChanges.files) || parsedChanges.files.length === 0) {
      return 'high'; // Missing or empty files array → HIGH risk
    }

    const files: string[] = parsedChanges.files;

    // --- Step 2: File-path blocklist (BEFORE title/description keywords) ---
    for (const file of files) {
      const normalizedFile = file.toLowerCase().replace(/\\/g, '/');
      if (BLOCKED_PATH_PATTERNS.some(pattern => normalizedFile.includes(pattern))) {
        return 'high';
      }
    }

    // --- Step 3: File-path allowlist check ---
    const allFilesAllowed = files.every(file => {
      const normalizedFile = file.toLowerCase().replace(/\\/g, '/');
      return ALLOWLISTED_PATHS.some(allowed => normalizedFile.startsWith(allowed));
    });

    // --- Step 4: Title/description keyword matching (secondary signal only) ---
    const text = `${proposal.title} ${proposal.description}`.toLowerCase();

    if (HIGH_RISK_KEYWORDS.some(kw => text.includes(kw))) return 'high';

    // LOW risk requires BOTH: no high-risk keywords AND all files in allowlist
    if (allFilesAllowed && LOW_RISK_KEYWORDS.some(kw => text.includes(kw))) return 'low';

    return 'medium';
  }
  ```

- [ ] **4.3** Run TypeScript check:
  ```bash
  npx tsc --project tsconfig.server.json --noEmit 2>&1 | grep -v node_modules
  ```
  Expected: no `error TS` lines.

- [ ] **4.4 Commit:**
  ```bash
  git add server/mother/self-proposal-engine.ts
  git commit -m "security(A4): add file-path blocklist+allowlist to classifyProposalRisk before keyword matching"
  ```

---

## Task 5: .gitignore hardening (A5)

**Files:**
- Modify: `.gitignore`

### Steps

- [ ] **5.1 Append to `.gitignore`:**

  ```gitignore
  # Security hardening — exclude all production/local env variants
  .env.production
  .env.*.local
  *.env
  # Track the example file so contributors know what vars are needed
  !.env.example
  ```

- [ ] **5.2 Verify `.env.example` is NOT ignored:**
  ```bash
  git check-ignore -v .env.example
  ```
  Expected: no output (file is tracked).

- [ ] **5.3 Verify `.env.production` IS ignored:**
  ```bash
  git check-ignore -v .env.production
  ```
  Expected: output showing the rule that matches.

- [ ] **5.4 Commit:**
  ```bash
  git add .gitignore
  git commit -m "security(A5): harden .gitignore — exclude .env.production, .env.*.local, *.env; track .env.example"
  ```

---

## Task 6: TLS certificate validation (A6)

**Files:**
- Modify: `server/db.ts`

Line ~100 sets `rejectUnauthorized: false` for non-localhost connections, allowing MITM attacks against the DB. GCP Cloud SQL certificates are trusted by the system CA bundle — `rejectUnauthorized: true` works without custom CA config.

### Steps

- [ ] **6.1 Locate line ~100 in `server/db.ts`:**

  Current:
  ```typescript
  ssl: (host === '127.0.0.1' || host === 'localhost') ? false : (process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }),
  ```

  Replace with:
  ```typescript
  ssl: (host === '127.0.0.1' || host === 'localhost')
    ? false
    : (process.env.DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: true }),
  ```

- [ ] **6.2** Run TypeScript check:
  ```bash
  npx tsc --project tsconfig.server.json --noEmit 2>&1 | grep -v node_modules
  ```
  Expected: no `error TS` lines.

- [ ] **6.3** Start dev server, confirm `[Database] F1-3: Connecting via TCP to ...` log appears without SSL error.

- [ ] **6.4 Commit:**
  ```bash
  git add server/db.ts
  git commit -m "security(A6): enable TLS certificate validation for non-localhost DB connections"
  ```

---

## Final verification

- [ ] Run full TypeScript check across project:
  ```bash
  npx tsc --project tsconfig.server.json --noEmit
  ```
  Expected: 0 errors.

- [ ] Run all tests:
  ```bash
  pnpm test
  ```
  Expected: all suites pass, 0 failed.

- [ ] Confirm 0 `runGitCommand` references remain:
  ```bash
  grep -rn "runGitCommand" server/
  ```
  Expected: zero matches.

- [ ] Confirm 5 DGM endpoints are `protectedProcedure`:
  ```bash
  grep -n "dgmTestRun\|dgmEvents\|dgmPendingProposals\|dgmResolveProposal\|supervisor" server/routers/mother.ts | grep "publicProcedure"
  ```
  Expected: zero matches.

---

## Merge gate

- `pnpm run check` exits 0
- `pnpm test` exits 0
- Branch is `fix/security` — merge FIRST per spec merge order
- Open PR: `security: Worktree A — 6 vulnerabilities fixed (A1–A6)`
