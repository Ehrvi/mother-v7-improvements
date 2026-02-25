-- MOTHER Knowledge Index v62.0 — Fixed Migration
-- Scientific basis: Zettelkasten (Luhmann 1992) + RAG (Lewis et al 2020 arXiv 2005.11401)
-- Date: 2026-02-25
-- Corrected column names: title, content, category, tags, source, sourceType, createdAt, updatedAt

INSERT INTO `knowledge` (`title`, `content`, `category`, `tags`, `source`, `sourceType`, `createdAt`, `updatedAt`)
VALUES 
(
  'MOTHER v62.0 Autonomous CI/CD Pipeline Architecture',
  'MOTHER v62.0 implements a fully autonomous self-update pipeline based on the Darwin Godel Machine architecture (Zhang et al 2025 arXiv 2505.22954). The pipeline has three components: self-proposal-engine.ts analyzes system_metrics to identify performance gaps and generates testable hypotheses every 10 queries; autonomous-update-job.ts executes approved proposals using a ReAct loop to generate and apply code changes via GPT-5; GitHub Actions CI/CD pipeline automatically tests TypeScript, builds Docker image, and deploys to Cloud Run upon push. The only human control point is creator approval of proposals. Production URL: https://mother-interface-qtvghovzxa-ts.a.run.app. Active revision: mother-interface-00249-gmb.',
  'architecture',
  'autonomous,cicd,dgm,self-update,cloud-run',
  'AWAKE-V76 MILESTONE-v62.0',
  'learning',
  NOW(),
  NOW()
),
(
  'ESM vs CommonJS require.main crash in production',
  'Critical bug fixed in MOTHER v61.0: The autonomous-update-job.ts used require.main === module which is a CommonJS pattern. In ES Modules, require is not defined, causing a ReferenceError at module import time that crashed the production server. The fix is to use an environment variable check: process.env.AUTONOMOUS_JOB_MODE === true. This is the correct ESM-compatible pattern for conditional execution. The project uses type module in package.json and format esm in tsup config, making all files ESM by default.',
  'debugging',
  'esm,commonjs,require,crash,production',
  'AWAKE-V75 AWAKE-V76',
  'learning',
  NOW(),
  NOW()
),
(
  'GitHub Actions CI/CD for Cloud Run Configuration',
  'To configure GitHub Actions for automatic Cloud Run deployment: Create GCP Service Account with roles Cloud Run Admin, Storage Admin, Artifact Registry Writer. Create SA key JSON and store as GitHub secret GCP_SA_KEY. Store GitHub PAT as GH_PAT secret. Workflow uses google-github-actions/auth@v2 with credentials_json for authentication. Use google-github-actions/deploy-cloudrun@v2 for deployment. Key: .github/workflows/ must NOT be in .gitignore. Use npm instead of pnpm for runner compatibility. The workflow triggers on push to master and on autonomous/* branches.',
  'devops',
  'github-actions,cloud-run,cicd,deployment,gcp',
  'AWAKE-V76 autonomous-deploy.yml',
  'learning',
  NOW(),
  NOW()
),
(
  'TypeScript TS2802 Set and RegExpStringIterator iteration fix',
  'TypeScript error TS2802 occurs when spreading iterators in projects targeting ES2015 or below without downlevelIteration. The correct fix is NOT to change tsconfig.json but to use Array.from() explicitly: instead of spreading new Set use Array.from(new Set(items)). Instead of spreading str.matchAll(regex) use Array.from(str.matchAll(regex)). This is the canonical ES2015-compatible pattern per the ECMAScript specification.',
  'typescript',
  'typescript,ts2802,set,iterator,array-from,esm',
  'AWAKE-V73',
  'learning',
  NOW(),
  NOW()
),
(
  'MOTHER Login System Root Cause and Fix',
  'The MOTHER login system was broken from creation because migrations 0000 and 0001 which create the users knowledge cache_entries and queries tables were in the drizzle root directory but NOT in drizzle/migrations/ which is the directory read by the production migration runner. Fix: Created migration 0000_v57_foundation_tables.sql in drizzle/migrations/ with all core table definitions. The migration runner uses lexicographic sort so 0000 runs first. After applying this migration the login endpoint correctly returns HTTP 401 for invalid credentials instead of HTTP 500 for missing table. Auth is hardened with bcrypt cost 12 rate limiting 5 attempts per 15 minutes and timing-attack-safe comparison per NIST SP 800-63B.',
  'authentication',
  'login,auth,migration,users-table,bcrypt,rate-limiting',
  'AWAKE-V72 AUDIT-V57',
  'learning',
  NOW(),
  NOW()
),
(
  'Darwin Godel Machine DGM Self-Improvement Architecture',
  'The Darwin Godel Machine (Zhang et al 2025 arXiv 2505.22954) is an open-ended self-improving system that maintains an archive of stepping stones to avoid local optima. Key principles: Evolutionary coding where the system modifies its own source code; Empirical validation where changes are accepted only if they improve measurable fitness metrics; Open-ended exploration where diversity is maintained to prevent premature convergence; Human-in-the-loop safety with creator approval as the sole control point. MOTHER implements this via self-proposal-engine.ts for observe and hypothesize, autonomous-update-job.ts for act and evaluate, and audit_log table for archive. The fitness function is defined per proposal with target metrics.',
  'ai_architecture',
  'dgm,self-improvement,evolution,autonomous,fitness',
  'docs/ARCHITECTURE-AUTONOMOUS-SELF-UPDATE.md',
  'learning',
  NOW(),
  NOW()
),
(
  'MOTHER Production Infrastructure GCP Configuration',
  'MOTHER runs on Google Cloud Platform in the australia-southeast1 Sydney region. Key infrastructure: Cloud Run service mother-interface with min-instances 1 max-instances 10 2GB RAM 2 vCPU. Database: Cloud SQL MySQL 8.0 instance mother-db-sydney connected via Unix socket. Build: Cloud Build with Dockerfile image stored in Artifact Registry at australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface. Secrets: GCP Secret Manager stores DATABASE_URL OPENAI_API_KEY SESSION_SECRET mother-github-token. GitHub repo: https://github.com/Ehrvi/mother-v7-improvements master branch.',
  'infrastructure',
  'gcp,cloud-run,cloud-sql,mysql,docker,artifact-registry',
  'README.md cloudbuild.yaml',
  'learning',
  NOW(),
  NOW()
),
(
  'MOTHER Learning System Quality Threshold and Gradual Learning',
  'MOTHER learning system was updated in v56.0 to lower the quality threshold from 95 to 75 enabling gradual learning from approximately 60 percent of interactions instead of only the top 5 percent. The learning pipeline: Guardian evaluates response quality on 5 dimensions relevance completeness scientific_basis clarity actionability; If quality is 75 or above the interaction is stored in the knowledge table with embedding; The self-proposal-engine analyzes knowledge accumulation rate as a fitness metric. Guardian v60.0 adds citation bonus of 5 points for responses with scientific citations and stop-word filtering for more accurate ROUGE-1 relevance calculation per Liu et al 2023 G-Eval.',
  'learning',
  'learning,quality,threshold,guardian,rouge,g-eval',
  'AWAKE-V71 AWAKE-V74',
  'learning',
  NOW(),
  NOW()
),
(
  'MOTHER Migration System Production Deployment Pattern',
  'MOTHER uses a custom migration runner in production-entry.ts that reads SQL files from drizzle/migrations/ sorted lexicographically. Files must be named with numeric prefix such as 0000_ 0001_ to ensure correct order. The runner uses IF NOT EXISTS clauses to be idempotent. Critical: migrations 0000-0002 were originally missing from the migrations folder causing all core tables users knowledge cache_entries queries to be absent in production. The fix was to create 0000_v57_foundation_tables.sql with CREATE TABLE IF NOT EXISTS for all core tables. Each migration is logged to Cloud Run logs with the prefix Migrations Applied followed by filename.',
  'database',
  'migration,drizzle,mysql,production,idempotent',
  'AWAKE-V72 production-entry.ts',
  'learning',
  NOW(),
  NOW()
),
(
  'MOTHER Security Hardened Authentication OWASP ASVS v4.0',
  'MOTHER auth.ts implements hardened authentication based on OWASP ASVS v4.0 and NIST SP 800-63B. Rate limiting: 5 failed attempts per 15 minutes per IP using in-memory store per OWASP ASVS 2.2.1. Account lockout: 10 failed attempts locks account for 30 minutes per OWASP ASVS 2.2.4. Password hashing: bcrypt with cost factor 12 per OWASP ASVS 2.4.5. Timing attack prevention: always run bcrypt.compare even for non-existent users per NIST SP 800-63B. Generic error messages for both wrong email and wrong password per OWASP ASVS 2.2.2. Session management: HTTP-only Secure SameSite Strict cookies with 7-day expiry.',
  'security',
  'security,auth,owasp,bcrypt,rate-limiting,nist',
  'AWAKE-V72 server/routers/auth.ts',
  'learning',
  NOW(),
  NOW()
);

-- Log the indexing event to audit_log with correct column names
INSERT INTO `audit_log` (`action`, `actor_email`, `actor_type`, `details`, `created_at`)
VALUES (
  'KNOWLEDGE_INDEXED',
  'system@mother.ai',
  'system',
  'Indexed 10 knowledge entries from milestone v62.0 session covering v56.0 to v62.0 evolution. Topics: autonomous pipeline, ESM crash fix, GitHub Actions, TypeScript, auth, DGM, GCP, learning system, migrations, security.',
  NOW()
);
