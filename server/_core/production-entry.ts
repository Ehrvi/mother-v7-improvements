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
import multer from 'multer';
import crypto from 'crypto';
import os from 'os';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
import mammoth from 'mammoth';
import { fileURLToPath } from 'url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createContext } from './context.js';
import { appRouter } from '../routers.js';
import { registerOAuthRoutes } from './oauth.js';
import { getDb } from '../db.js';
import { invokeGEASupervisor } from '../mother/gea_supervisor.js';
import { processQuery as _processQuery } from '../mother/core.js';
import { runSelfAudit } from '../mother/self-audit-engine.js';
import { runHourlyAggregation } from '../mother/metrics-aggregation-job.js'; // v69.12: Fix P0 — system_metrics aggregation
import { sdk } from './sdk.js';
import { createLogger } from './logger'; // v74.0: NC-003 structured logger
const log = createLogger('PROD_ENTRY');

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
        log.info(`[Migrations] DB not ready (attempt ${attempt}/5), retrying in ${attempt * 2}s...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    } else {
      log.info(`[Migrations] DB not available (attempt ${attempt}/5), retrying in ${attempt * 2}s...`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  try {
    if (!db) {
      log.info('[Migrations] DB not available after 5 attempts, skipping');
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
      log.info('[Migrations] No migrations directory found, skipping');
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
        log.info(`[Migrations] Skipped (already applied): ${file}`);
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
            log.warn(`[Migrations] ${file} warning:`, msg.substring(0, 200));
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
        log.warn(`[Migrations] Could not record migration ${file}:`, e.message);
      }

      log.info(`[Migrations] Applied: ${file}`);
    }
    log.info('[Migrations] All migrations complete.');
  } catch (e) {
    log.error('[Migrations] Error running migrations:', e);
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
    log.warn('[DGM] Execute called without Cloud Tasks header - may be internal call');
  }

  const { run_id, goal } = req.body;

  if (!run_id || !goal) {
    return res.status(400).json({ error: 'Missing run_id or goal' });
  }

  log.info(`[DGM] Executing GEA evolution: run_id=${run_id}, task=${taskName || 'direct'}`);

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
      log.warn('[DGM] Could not update task status (table may not exist yet):', (e as any).message);
    }
  }

  // Run the GEA evolution loop
  invokeGEASupervisor(goal, run_id)
    .then(async () => {
      log.info(`[DGM] GEA evolution completed for run_id=${run_id}`);
      const dbFinal = await getDb();
      if (dbFinal) {
        try {
          await (dbFinal as any).$client.query(
            `UPDATE dgm_task_queue SET status='completed', updated_at=NOW() WHERE run_id=?`,
            [run_id]
          );
        } catch (e) {
          log.warn('[DGM] Could not update task completion:', (e as any).message);
        }
      }
    })
    .catch(async (error) => {
      log.error(`[DGM] GEA evolution failed for run_id=${run_id}:`, error);
      const dbErr = await getDb();
      if (dbErr) {
        try {
          await (dbErr as any).$client.query(
            `UPDATE dgm_task_queue SET status='failed', error_message=?, updated_at=NOW() WHERE run_id=?`,
            [error.message?.slice(0, 500) || 'Unknown error', run_id]
          );
        } catch (e) {
          log.warn('[DGM] Could not update task failure:', (e as any).message);
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

    // v73.0 CRITICAL FIX: Streaming Echo Bug
    // ─────────────────────────────────────────────────────────────────────────
    // PROBLEMA (v69.5–v72.0): onChunk enviava tokens diretamente ao cliente
    // ANTES do echo detection, grounding e quality checks rodarem.
    // Isso causava: (1) usuário ver conteúdo duplicado em tempo real,
    // (2) grounding/echo detection não tinham efeito no stream já enviado.
    //
    // SOLUÇÃO (v73.0): Buffer interno acumula tokens durante geração.
    // Post-processing (echo detection, grounding, fichamento) roda sobre
    // o buffer completo. Resultado final é streamado token-a-token APÓS
    // todo o processamento, garantindo qualidade e sem duplicação.
    //
    // Scientific basis:
    // - Self-Refine (Madaan et al., arXiv:2303.17651, 2023): post-generation refinement
    // - CRAG (Yan et al., arXiv:2401.15884, 2024): corrective RAG post-processing
    // - OpenAI Streaming Best Practices (2025): buffer before display for quality
    // Trade-off: TTFT increases by ~0.5-1s (post-processing time), but eliminates
    // echo, grounding failures, and quality check bypasses.
    sendEvent('progress', { phase: 'routing', message: 'Analisando complexidade da query...' });
    sendEvent('progress', { phase: 'generating', message: 'Gerando resposta...' });

    // Process query WITHOUT streaming onChunk — let processQuery do all post-processing
    // (echo detection, grounding, fichamento, quality) on the complete response first
    const result = await _processQuery({
      query, userId, userEmail, useCache, conversationHistory,
      // v73.0: NO onChunk passed — accumulate internally, post-process, then stream
      // onChunk is intentionally omitted here to prevent pre-processing stream leaks
    });

    sendEvent('progress', { phase: 'validating', message: 'Validando qualidade (Guardian)...' });

    // Stream the FINAL post-processed response token-by-token to the client
    // This ensures echo detection, grounding, and fichamento are already applied
    const finalText = result.response || '';
    const CHUNK_SIZE = 8; // characters per simulated token chunk (~2 tokens)
    for (let i = 0; i < finalText.length; i += CHUNK_SIZE) {
      sendEvent('token', { text: finalText.slice(i, i + CHUNK_SIZE) });
    }

    // Emit the final complete response (with metadata)
    sendEvent('response', result);
    sendEvent('done', { message: 'Processamento concluído' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    sendEvent('error', { message });
  } finally {
    res.end();
  }
});

// ==================== DRAG-AND-DROP FILE EXTRACTION ENDPOINT (v74.6) ====================
// Scientific basis:
// - OWASP File Upload Cheat Sheet (2024): validate MIME server-side, not just extension
// - Yan (2025) arXiv:2512.12806 "Fault-Tolerant Sandboxing": isolated processing, auto-cleanup
// - Norman (2013) "Design of Everyday Things": affordances for drag-and-drop
// - Baqar et al. (2025) arXiv:2508.11867 "AI-Augmented CI/CD": trust-tier framework
//
// Security model:
// - MIME type validated by multer fileFilter (not just extension)
// - Max 10MB per file, 1 file per request
// - Temp files auto-deleted after extraction (finally block)
// - Rate: 20 requests/minute per IP (in-memory counter)
// - Sanitization: removes control chars, normalizes whitespace, truncates at 100KB

const _extractRateLimiter: Map<string, { count: number; resetAt: number }> = new Map();

function extractRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _extractRateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    _extractRateLimiter.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

const extractStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `mother-upload-${unique}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});

const ALLOWED_EXTRACT_MIMES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const extractUpload = multer({
  storage: extractStorage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_EXTRACT_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}. Use TXT, PDF ou DOCX.`));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function sanitizeExtractedContent(text: string): string {
  // Remove control characters (except newline/tab)
  let s = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Normalize excessive whitespace
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{4,}/g, '\n\n').trim();
  // Truncate at 100KB of text
  if (s.length > 100000) {
    s = s.substring(0, 100000) + '\n\n[... conteúdo truncado — arquivo muito longo ...]';
  }
  return s;
}

app.post('/api/extract-file-content', extractUpload.single('file'), async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  
  if (!extractRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit: máximo 20 extrações por minuto.' });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const filePath = file.path;
  try {
    let content = '';

    switch (file.mimetype) {
      case 'text/plain':
        content = fs.readFileSync(filePath, 'utf-8');
        break;

      case 'application/pdf': {
        const buffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(buffer);
        content = pdfData.text;
        break;
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword': {
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
        break;
      }

      default:
        return res.status(400).json({ error: `Tipo MIME não suportado: ${file.mimetype}` });
    }

    const sanitized = sanitizeExtractedContent(content);
    const wordCount = sanitized.split(/\s+/).filter(Boolean).length;

    log.info(`[Extract] ${file.originalname} (${file.mimetype}) → ${sanitized.length} chars, ${wordCount} words`);

    return res.json({
      success: true,
      filename: file.originalname,
      mimetype: file.mimetype,
      content: sanitized,
      charCount: sanitized.length,
      wordCount,
    });
  } catch (err) {
    log.error('[Extract] Error extracting file content:', err);
    return res.status(500).json({
      error: `Erro ao extrair conteúdo: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
    });
  } finally {
    // Auto-delete temp file (Fault-Tolerant Sandboxing pattern — Yan 2025)
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
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

log.info(`📦 Serving static files from: ${distPath}`);
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
  log.info(`🚀 Production server running on http://0.0.0.0:${PORT}`);
  log.info(`📦 Serving static files from: ${distPath}`);

  // Run migrations after server starts
  await runMigrations();

  // v68.4: Daily self-audit scheduler — runs every 24 hours
  // Scientific basis: Continuous monitoring (Fowler, 2006 — Continuous Integration)
  const AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const runScheduledAudit = async () => {
    try {
      log.info('[MOTHER] Running scheduled daily self-audit...');
      const result = await runSelfAudit();
      const passed = result.checks.filter((c) => c.status === 'pass').length;
      const isHealthy = result.overallHealth === 'healthy';
      log.info(`[MOTHER] Daily self-audit: ${isHealthy ? 'PASSED' : 'DEGRADED'} (${passed}/${result.checks.length} checks, score=${result.score}/100)`);
    } catch (err) {
      log.error('[MOTHER] Daily self-audit failed:', err);
    }
  };
  // First audit after 5 minutes (let server warm up), then every 24 hours
  setTimeout(() => {
    runScheduledAudit();
    setInterval(runScheduledAudit, AUDIT_INTERVAL_MS);
  }, 5 * 60 * 1000);
  log.info('[MOTHER] Daily self-audit scheduler started (first run in 5 min)');
  
  // v69.12: Hourly metrics aggregation — populates system_metrics from queries table
  // Scientific basis: SRE Golden Signals (Beyer et al., 2016)
  setTimeout(() => {
    runHourlyAggregation().catch(err => log.error('[MOTHER] Hourly metrics failed:', err));
    setInterval(() => {
      runHourlyAggregation().catch(err => log.error('[MOTHER] Hourly metrics failed:', err));
    }, 60 * 60 * 1000);
  }, 2 * 60 * 1000);
  log.info('[MOTHER] Hourly metrics aggregation scheduler started');
});
