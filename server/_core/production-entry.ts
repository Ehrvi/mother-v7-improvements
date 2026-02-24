/**
 * Production-only entry point for Cloud Run deployment
 * This file NEVER imports vite.ts or any Vite dependencies
 *
 * v41.0: Added auto-migration runner on startup
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
      const statements = sql
        .split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        try {
          await (db as any).$client.query(stmt);
        } catch (e: any) {
          // Ignore "already exists" errors - migrations are idempotent
          if (!e.message?.includes('already exists') && !e.message?.includes('Duplicate')) {
            console.warn('[Migrations] Statement warning:', e.message?.substring(0, 150));
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
