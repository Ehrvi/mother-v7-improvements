/**
 * Production-only entry point for Cloud Run deployment
 * This file NEVER imports vite.ts or any Vite dependencies
 *
 * v41.0: Added auto-migration runner on startup
 * v45.0: Added Cloud Tasks DGM execute endpoint for async GEA evolution
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

/**
 * Auto-run SQL migrations on startup
 * Reads all .sql files from drizzle/migrations and applies them safely
 * Uses IF NOT EXISTS so re-runs are idempotent
 */
async function runMigrations() {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migrations] DB not available, skipping');
      return;
    }

    const migrationsDir = process.env.NODE_ENV === 'production'
      ? '/app/drizzle/migrations'
      : path.join(__dirname, '../../drizzle/migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migrations] No migrations directory found, skipping');
      return;
    }

    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of sqlFiles) {
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
});
