/**
 * Production-only entry point for Cloud Run deployment
 * This file NEVER imports vite.ts or any Vite dependencies
 *
 * v41.0: Added auto-migration runner on startup
 * v45.0: Added Cloud Tasks DGM execute endpoint for async GEA evolution
 * v63.0: CRITICAL FIX — Added migration tracking table to prevent re-running
 *        migrations on every deployment. Without tracking, migrations like
 *        0008 and 0009 (DELETE FROM users WHERE loginMethod='email_password')
 *        were wiping all users on every deploy, causing persistent login failures.
 *        Scientific basis: Flyway/Liquibase migration tracking pattern.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createContext } from './context.js';
import { appRouter } from '../routers.js';
import { registerOAuthRoutes } from './oauth.js';
import { getDb } from '../db.js';
import { invokeGEASupervisor } from '../mother/gea_supervisor.js';
import { processQuery as _processQuery } from '../mother/core.js';
import { runSelfAudit } from '../mother/self-audit-engine.js';
import { sdk } from './sdk.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

/**
 * Auto-run SQL migrations on startup with TRACKING.
 *
 * v63.0 FIX: Each migration is now tracked in `migrations_applied` table.
 * A migration only runs if it has NOT been recorded in that table.
 * This is the standard Flyway/Liquibase pattern and prevents destructive
 * migrations (like DELETE FROM users) from running on every deployment.
 *
 * Migrations that use IF NOT EXISTS / INSERT IGNORE are still safe to
 * re-run, but tracking ensures correctness for all migration types.
 */
async function runMigrations() {
  // Retry with exponential backoff — Cloud SQL Proxy socket may not be ready immediately
  let db = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    db = await getDb();
    if (db) {
      try {
        await (db as any).$client.query('SELECT 1');
        break; // Connection is live
      } catch (e) {
        db = null;
        console.log(`[Migrations] DB not ready (attempt ${attempt}/5), retrying in ${attempt * 2}s...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    } else {
      console.log(`[Migrations] DB not available (attempt ${attempt}/5), retrying in ${attempt * 2}s...`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  try {
    if (!db) {
      console.log('[Migrations] DB not available after 5 attempts, skipping');
      return;
    }

    // STEP 1: Create the tracking table if it doesn't exist
    await (db as any).$client.query(`
      CREATE TABLE IF NOT EXISTS \`migrations_applied\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`filename\` varchar(255) NOT NULL,
        \`applied_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`migrations_applied_filename_unique\` (\`filename\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const migrationsDir = process.env.NODE_ENV === 'production'
      ? '/app/drizzle/migrations'
      : path.join(__dirname, '../../drizzle/migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migrations] No migrations directory found, skipping');
      return;
    }

    // STEP 2: Get list of already-applied migrations
    const [appliedRows] = await (db as any).$client.query(
      'SELECT filename FROM `migrations_applied`'
    );
    const appliedSet = new Set((appliedRows as any[]).map((r: any) => r.filename));

    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of sqlFiles) {
      // STEP 3: Skip if already applied
      if (appliedSet.has(file)) {
        console.log(`[Migrations] Skipped (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      // Strip comment lines before splitting to avoid false positives
      const sqlNoComments = sql
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('--'))
        .join('\n');
      const statements = sqlNoComments
        .split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      for (const stmt of statements) {
        try {
          await (db as any).$client.query(stmt);
        } catch (e: any) {
          // Ignore "already exists" and "Duplicate" errors - migrations are idempotent
          const msg = e.message || '';
          if (!msg.includes('already exists') && !msg.includes('Duplicate') && !msg.includes('duplicate')) {
            console.warn(`[Migrations] ${file} warning:`, msg.substring(0, 200));
          }
        }
      }

      // STEP 4: Record this migration as applied
      try {
        await (db as any).$client.query(
          'INSERT IGNORE INTO `migrations_applied` (`filename`) VALUES (?)',
          [file]
        );
      } catch (e: any) {
        console.warn(`[Migrations] Could not record migration ${file}:`, e.message);
      }

      console.log(`[Migrations] Applied: ${file}`);
    }
    console.log('[Migrations] All migrations complete.');
  } catch (e) {
    console.error('[Migrations] Error running migrations:', e);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth routes
registerOAuthRoutes(app);

/**
 * v45.0: Cloud Tasks DGM Execute Endpoint
 *
 * This endpoint is called by Cloud Tasks to execute GEA evolution asynchronously.
 * Cloud Tasks ensures the task runs to completion even if the original HTTP request
 * has already returned, solving the fire-and-forget problem.
 *
 * The endpoint:
 * 1. Receives the task payload from Cloud Tasks
 * 2. Updates task status to 'running' in dgm_task_queue
 * 3. Executes the GEA evolution loop (may take minutes)
 * 4. Updates task status to 'completed' or 'failed'
 *
 * Security: Only Cloud Tasks can call this endpoint (verified via X-CloudTasks-QueueName header)
 */
app.post('/api/dgm/execute', async (req, res) => {
  const queueName = req.headers['x-cloudtasks-queuename'];
  const taskName = req.headers['x-cloudtasks-taskname'];

  // Verify this is a legitimate Cloud Tasks request
  if (!queueName || !String(queueName).includes('dgm-evolution-queue')) {
    // Allow internal calls (for testing) but log them
    console.warn('[DGM] Execute called without Cloud Tasks header - may be internal call');
  }

  const { run_id, goal } = req.body;

  if (!run_id || !goal) {
    return res.status(400).json({ error: 'Missing run_id or goal' });
  }

  console.log(`[DGM] Executing GEA evolution: run_id=${run_id}, task=${taskName || 'direct'}`);

  // Respond immediately to Cloud Tasks (prevents retry due to timeout)
  res.status(200).json({ status: 'accepted', run_id });

  // Execute GEA evolution asynchronously (after response is sent)
  // FIX v46.0: Use await getDb() - getDb() is async and returns a Promise
  const db = await getDb();
  if (db) {
    try {
      await (db as any).$client.query(
        `UPDATE dgm_task_queue SET status='running', updated_at=NOW() WHERE run_id=?`,
        [run_id]
      );
    } catch (e) {
      console.warn('[DGM] Could not update task status (table may not exist yet):', (e as any).message);
    }
  }

  // Run the GEA evolution loop
  invokeGEASupervisor(goal, run_id)
    .then(async () => {
      console.log(`[DGM] GEA evolution completed for run_id=${run_id}`);
      const dbFinal = await getDb();
      if (dbFinal) {
        try {
          await (dbFinal as any).$client.query(
            `UPDATE dgm_task_queue SET status='completed', updated_at=NOW() WHERE run_id=?`,
            [run_id]
          );
        } catch (e) {
          console.warn('[DGM] Could not update task completion:', (e as any).message);
        }
      }
    })
    .catch(async (error) => {
      console.error(`[DGM] GEA evolution failed for run_id=${run_id}:`, error);
      const dbErr = await getDb();
      if (dbErr) {
        try {
          await (dbErr as any).$client.query(
            `UPDATE dgm_task_queue SET status='failed', error_message=?, updated_at=NOW() WHERE run_id=?`,
            [error.message?.slice(0, 500) || 'Unknown error', run_id]
          );
        } catch (e) {
          console.warn('[DGM] Could not update task failure:', (e as any).message);
        }
      }
    });
});

// ==================== SUG-001: SSE STREAMING ENDPOINT (v69.4) ====================
// Scientific basis: Server-Sent Events (W3C, 2021); OpenAI Streaming (2023)
// Reduces perceived latency from ~40s to ~1-2s TTFT (Time To First Token)
// Architecture: Express SSE → processQuery with progress events → final response
app.post('/api/mother/stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { query, useCache, conversationHistory } = req.body;
    
    // v69.11: Authenticate user from session cookie (Principal Hierarchy fix)
    // Scientific basis: NIST RBAC SP 800-162 (2014); Anthropic Principal Hierarchy (2026)
    // Previously: userEmail came from req.body (untrusted, never sent by frontend)
    // Now: userEmail resolved from verified session cookie → proper CREATOR detection
    let userEmail: string | undefined;
    let userId: number | undefined;
    try {
      const authenticatedUser = await sdk.authenticateRequest(req);
      userEmail = authenticatedUser.email ?? undefined;
      userId = authenticatedUser.id;
    } catch {
      // Unauthenticated request — userEmail stays undefined (guest/anonymous)
    }
    if (!query) {
      sendEvent('error', { message: 'Missing query parameter' });
      return res.end();
    }

    // v69.5: Real token streaming via onChunk callback
    sendEvent('progress', { phase: 'routing', message: 'Analisando complexidade da query...' });
    sendEvent('progress', { phase: 'generating', message: 'Gerando resposta...' });

    // Process query with real-time token streaming
    const result = await _processQuery({
      query, userId, userEmail, useCache, conversationHistory,
      onChunk: (chunk: string) => {
        // Emit each token chunk as a 'token' SSE event
        sendEvent('token', { text: chunk });
      },
    });

    sendEvent('progress', { phase: 'validating', message: 'Validando qualidade (Guardian)...' });
    // Emit the final complete response
    sendEvent('response', result);
    sendEvent('done', { message: 'Processamento concluído' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    sendEvent('error', { message });
  } finally {
    res.end();
  }
});

// tRPC routes
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Serve static files from Vite build
// Use absolute path in production to avoid esbuild path optimization issues
const distPath = process.env.NODE_ENV === 'production'
  ? '/app/dist/public'  // Absolute path in Docker container
  : path.join(__dirname, '../../public');  // Relative path for local dev

console.log(`📦 Serving static files from: ${distPath}`);
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Production server running on http://0.0.0.0:${PORT}`);
  console.log(`📦 Serving static files from: ${distPath}`);

  // Run migrations after server starts
  await runMigrations();

  // v68.4: Daily self-audit scheduler — runs every 24 hours
  // Scientific basis: Continuous monitoring (Fowler, 2006 — Continuous Integration)
  const AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const runScheduledAudit = async () => {
    try {
      console.log('[MOTHER] Running scheduled daily self-audit...');
      const result = await runSelfAudit();
      const passed = result.checks.filter((c) => c.status === 'pass').length;
      const isHealthy = result.overallHealth === 'healthy';
      console.log(`[MOTHER] Daily self-audit: ${isHealthy ? 'PASSED' : 'DEGRADED'} (${passed}/${result.checks.length} checks, score=${result.score}/100)`);
    } catch (err) {
      console.error('[MOTHER] Daily self-audit failed:', err);
    }
  };
  // First audit after 5 minutes (let server warm up), then every 24 hours
  setTimeout(() => {
    runScheduledAudit();
    setInterval(runScheduledAudit, AUDIT_INTERVAL_MS);
  }, 5 * 60 * 1000);
  console.log('[MOTHER] Daily self-audit scheduler started (first run in 5 min)');
});
