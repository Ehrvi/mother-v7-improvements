-- MOTHER Knowledge Index — Milestone v62.0
-- Scientific basis: Zettelkasten (Luhmann, 1992) + RAG (Lewis et al., 2020, arXiv:2005.11401)
-- Date: 2026-02-25
-- Purpose: Index all key knowledge acquired during the v56.0-v62.0 evolution sessions

-- ============================================================
-- KNOWLEDGE ENTRIES: MOTHER v62.0 Autonomous Pipeline Session
-- ============================================================

INSERT INTO knowledge (topic, content, source, category, quality_score, created_at, updated_at)
VALUES 
(
  'MOTHER v62.0 — Autonomous CI/CD Pipeline Architecture',
  'MOTHER v62.0 implements a fully autonomous self-update pipeline based on the Darwin Gödel Machine (DGM) architecture (Zhang et al., 2025, arXiv:2505.22954). The pipeline consists of three components: (1) self-proposal-engine.ts analyzes system_metrics to identify performance gaps and generates testable hypotheses every 10 queries; (2) autonomous-update-job.ts executes approved proposals using a ReAct loop (Think→Act→Observe) to generate and apply code changes via GPT-5; (3) GitHub Actions CI/CD pipeline automatically tests TypeScript, builds Docker image, and deploys to Cloud Run upon push. The only human control point is creator approval of proposals. Production URL: https://mother-interface-qtvghovzxa-ts.a.run.app. Active revision: mother-interface-00246-j5w.',
  'AWAKE-V76 / MILESTONE-v62.0',
  'architecture',
  100,
  NOW(),
  NOW()
),
(
  'ESM vs CommonJS: require.main crash in production',
  'Critical bug fixed in MOTHER v61.0: The autonomous-update-job.ts used `if (require.main === module)` which is a CommonJS pattern. In ES Modules (ESM), `require` is not defined, causing a ReferenceError at module import time that crashed the production server. The fix is to use an environment variable check: `if (process.env.AUTONOMOUS_JOB_MODE === "true")`. This is the correct ESM-compatible pattern for conditional execution. The project uses "type": "module" in package.json and "format": "esm" in tsup config, making all files ESM by default.',
  'AWAKE-V75 / AWAKE-V76',
  'debugging',
  100,
  NOW(),
  NOW()
),
(
  'GitHub Actions CI/CD for Cloud Run — Configuration',
  'To configure GitHub Actions for automatic Cloud Run deployment: (1) Create GCP Service Account with roles: Cloud Run Admin, Storage Admin, Artifact Registry Writer. (2) Create SA key JSON and store as GitHub secret GCP_SA_KEY. (3) Store GitHub PAT as GH_PAT secret. (4) Workflow uses google-github-actions/auth@v2 with credentials_json for authentication. (5) Use google-github-actions/deploy-cloudrun@v2 for deployment. Key: .github/workflows/ must NOT be in .gitignore. Use npm instead of pnpm for runner compatibility. The workflow triggers on push to master and on autonomous/* branches.',
  'AWAKE-V76 / autonomous-deploy.yml',
  'devops',
  98,
  NOW(),
  NOW()
),
(
  'TypeScript TS2802: Set and RegExpStringIterator iteration fix',
  'TypeScript error TS2802 occurs when spreading iterators (Set, RegExpStringIterator) in projects targeting ES2015 or below without downlevelIteration. The correct fix is NOT to change tsconfig.json (which may not apply to the server build), but to use Array.from() explicitly: instead of [...new Set(items)] use Array.from(new Set(items)). Instead of [...str.matchAll(regex)] use Array.from(str.matchAll(regex)). This is the canonical ES2015-compatible pattern per the ECMAScript specification.',
  'AWAKE-V73',
  'typescript',
  100,
  NOW(),
  NOW()
),
(
  'MOTHER Login System — Root Cause and Fix',
  'The MOTHER login system was broken from creation because migrations 0000 and 0001 (which create the users, knowledge, cache_entries, and queries tables) were in the drizzle/ root directory but NOT in drizzle/migrations/ which is the directory read by the production migration runner. Fix: Created migration 0000_v57_foundation_tables.sql in drizzle/migrations/ with all core table definitions. The migration runner uses lexicographic sort, so 0000 runs first. After applying this migration, the login endpoint correctly returns HTTP 401 for invalid credentials instead of HTTP 500 for missing table. Auth is hardened with bcrypt (cost 12), rate limiting (5 attempts/15min), and timing-attack-safe comparison (NIST SP 800-63B).',
  'AWAKE-V72 / AUDIT-V57',
  'authentication',
  100,
  NOW(),
  NOW()
),
(
  'Darwin Gödel Machine (DGM) — Self-Improvement Architecture',
  'The Darwin Gödel Machine (Zhang et al., 2025, arXiv:2505.22954) is an open-ended self-improving system that maintains an archive of stepping stones — diverse intermediate solutions — to avoid local optima. Key principles: (1) Evolutionary coding: the system modifies its own source code; (2) Empirical validation: changes are accepted only if they improve measurable fitness metrics; (3) Open-ended exploration: diversity is maintained to prevent premature convergence; (4) Human-in-the-loop safety: creator approval as the sole control point. MOTHER implements this via self-proposal-engine.ts (observe+hypothesize), autonomous-update-job.ts (act+evaluate), and audit_log table (archive). The fitness function is defined per proposal with target metrics.',
  'docs/ARCHITECTURE-AUTONOMOUS-SELF-UPDATE.md',
  'ai_architecture',
  100,
  NOW(),
  NOW()
),
(
  'MOTHER Production Infrastructure — GCP Configuration',
  'MOTHER runs on Google Cloud Platform (GCP) in the australia-southeast1 (Sydney) region. Key infrastructure: Cloud Run service mother-interface with min-instances=1, max-instances=10, 2GB RAM, 2 vCPU. Database: Cloud SQL MySQL 8.0 instance mother-db-sydney connected via Unix socket (/cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney). Build: Cloud Build with Dockerfile, image stored in Artifact Registry (australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface). Secrets: GCP Secret Manager stores DATABASE_URL, OPENAI_API_KEY, SESSION_SECRET, mother-github-token. GitHub repo: https://github.com/Ehrvi/mother-v7-improvements (master branch).',
  'README.md / cloudbuild.yaml',
  'infrastructure',
  98,
  NOW(),
  NOW()
),
(
  'MOTHER Learning System — Quality Threshold and Gradual Learning',
  'MOTHER learning system (learning.ts) was updated in v56.0 to lower the quality threshold from 95 to 75, enabling gradual learning from approximately 60% of interactions instead of only the top 5%. The learning pipeline: (1) Guardian evaluates response quality on 5 dimensions (relevance, completeness, scientific_basis, clarity, actionability); (2) If quality >= 75, the interaction is stored in the knowledge table with embedding; (3) The self-proposal-engine analyzes knowledge accumulation rate as a fitness metric. Guardian v60.0 adds citation bonus (+5 points for responses with scientific citations in Author et al., Year format) and stop-word filtering for more accurate ROUGE-1 relevance calculation (Liu et al., 2023, G-Eval).',
  'AWAKE-V71 / AWAKE-V74',
  'learning',
  97,
  NOW(),
  NOW()
),
(
  'MOTHER Migration System — Production Deployment Pattern',
  'MOTHER uses a custom migration runner (production-entry.ts) that reads SQL files from drizzle/migrations/ sorted lexicographically. Files must be named with numeric prefix (e.g., 0000_, 0001_) to ensure correct order. The runner uses IF NOT EXISTS clauses to be idempotent. Critical: migrations 0000-0002 were originally missing from the migrations folder, causing all core tables (users, knowledge, cache_entries, queries) to be absent in production. The fix was to create 0000_v57_foundation_tables.sql with CREATE TABLE IF NOT EXISTS for all core tables. Each migration is logged to Cloud Run logs with [Migrations] Applied: filename.sql.',
  'AWAKE-V72 / production-entry.ts',
  'database',
  99,
  NOW(),
  NOW()
),
(
  'MOTHER Security — Hardened Authentication (OWASP ASVS v4.0)',
  'MOTHER auth.ts implements hardened authentication based on OWASP ASVS v4.0 and NIST SP 800-63B: (1) Rate limiting: 5 failed attempts per 15 minutes per IP using in-memory store (OWASP ASVS 2.2.1); (2) Account lockout: 10 failed attempts locks account for 30 minutes (OWASP ASVS 2.2.4); (3) Password hashing: bcrypt with cost factor 12 (OWASP ASVS 2.4.5); (4) Timing attack prevention: always run bcrypt.compare even for non-existent users (NIST SP 800-63B); (5) Generic error messages: "Email ou senha inválidos" for both wrong email and wrong password (OWASP ASVS 2.2.2); (6) Session management: HTTP-only, Secure, SameSite=Strict cookies with 7-day expiry.',
  'AWAKE-V72 / server/routers/auth.ts',
  'security',
  100,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  content = VALUES(content),
  quality_score = VALUES(quality_score),
  updated_at = NOW();

-- Log this indexing event to audit_log
INSERT INTO audit_log (action, actor, details, created_at)
VALUES (
  'KNOWLEDGE_INDEXED',
  'system-migration-v62.0',
  'Indexed 10 knowledge entries from milestone v62.0 session (v56.0-v62.0 evolution). Topics: autonomous pipeline, ESM/CJS, GitHub Actions, TypeScript, auth, DGM, GCP, learning system, migrations, security.',
  NOW()
)
ON DUPLICATE KEY UPDATE created_at = created_at;
