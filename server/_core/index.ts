// FIX: dotenv v17.3.1 'import dotenv/config' breaks Node.js v25 native fetch (undici)
// Symptom: ALL API calls (OpenAI, Google, Anthropic) → Connect Timeout Error (10s)  
// Root cause: dotenv v17 process patching conflicts with undici's TLS connection handling
// Solution: Use dotenv.config() explicitly with processEnv option (no process patching)
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { a2aRouter } from "../mother/a2a-server";
import { warmCache } from "../mother/semantic-cache"; // R547 (AWAKE V236 Ciclo 164): Cache warming
// Sprint 1 C200: New routes (health, monitor, long-form)
import healthRouter from "../routes/health.js";
import monitorRouter from "../routes/monitor-routes.js";
import longFormRouter from "../routes/long-form-routes.js";
// Sprint 2 C201: HippoRAG2 indexing + Reflexion engine
import { scheduleKGBuild as scheduleC201Indexing } from "../mother/hipporag2.js";
import { processQuery } from "../mother/core";
// Vite imports moved to dynamic imports to avoid bundling in production

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // A2A Protocol routes (NC-COLLAB-001)
  // Agent Card: GET /.well-known/agent.json
  // Diagnostics: GET /api/a2a/diagnostics
  // Knowledge: GET/POST /api/a2a/knowledge
  // Query: POST /api/a2a/query
  // Status: GET /api/a2a/status
  app.use(a2aRouter);
  // Sprint 1 C200: Health, Monitor, Long-form routes
  app.use("/api/health", healthRouter);
  app.use("/api/version", (_req, res) => res.redirect("/api/health/version"));
  app.use("/api/monitor", monitorRouter);
  app.use("/api/long-form", longFormRouter);

  // SHMS v2 routes — must be BEFORE Vite catch-all (setupVite)
  // Without this, /api/shms/v2/* falls through to Vite which returns HTML
  const { shmsRouter } = await import("../_core/routers/shms-router.js");
  app.use("/api/shms/v2", shmsRouter);

  // ==================== SOTA Gap 3: CONCURRENCY LIMITER ====================
  // Scientific basis: Backpressure pattern (Reactive Streams, 2014); Circuit Breaker (Nygard, 2007)
  // Benchmark finding: 60% of sequential queries returned "sistema sobrecarregado" under load
  // Solution: semaphore-based concurrency limiter — max 3 concurrent processQuery + queue of 10
  const MAX_CONCURRENT = 3;
  const MAX_QUEUE = 10;
  let _activeConcurrent = 0;
  const _waitQueue: Array<() => void> = [];

  const acquireSemaphore = (): Promise<void> => {
    if (_activeConcurrent < MAX_CONCURRENT) {
      _activeConcurrent++;
      return Promise.resolve();
    }
    if (_waitQueue.length >= MAX_QUEUE) {
      return Promise.reject(new Error('Server at capacity — please retry'));
    }
    return new Promise<void>((resolve) => {
      _waitQueue.push(() => { _activeConcurrent++; resolve(); });
    });
  };

  const releaseSemaphore = () => {
    _activeConcurrent--;
    if (_waitQueue.length > 0) {
      const next = _waitQueue.shift()!;
      next();
    }
  };

  // SSE streaming endpoint — must be registered BEFORE Vite middleware
  // (Vite catch-all returns HTML for unmatched routes, causing "Resposta não recebida")
  app.post("/api/mother/stream", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { query, useCache, conversationHistory } = req.body;
      if (!query) {
        sendEvent('error', { message: 'Missing query parameter' });
        return res.end();
      }

      // SOTA Gap 3: Acquire concurrency semaphore (backpressure)
      try {
        await acquireSemaphore();
      } catch {
        sendEvent('error', { message: 'Sistema temporariamente ocupado. Por favor, aguarde alguns segundos e tente novamente.', retryable: true, activeRequests: _activeConcurrent, queueLength: _waitQueue.length });
        return res.end();
      }

      const _ttftStart = Date.now();
      sendEvent('thinking', {
        message: '\ud83e\udde0 MOTHER está processando...',
        timestamp: _ttftStart,
        version: process.env.MOTHER_VERSION || 'v122.26',
      });
      sendEvent('progress', { phase: 'routing', message: 'Analisando complexidade da query...', ttft_ms: Date.now() - _ttftStart });

      let _streamingTokenCount = 0;
      const result = await processQuery({
        query, useCache, conversationHistory,
        onChunk: (chunk: string) => {
          try {
            _streamingTokenCount++;
            sendEvent('token', { text: chunk, streaming: true, token_index: _streamingTokenCount });
          } catch { /* non-blocking */ }
        },
        onPhase: (phase: string, meta?: Record<string, unknown>) => {
          try {
            sendEvent('phase', { phase, elapsed_ms: Date.now() - _ttftStart, ...meta });
            const phaseMessages: Record<string, string> = {
              'routing': 'Roteando para o modelo ideal...',
              'retrieval': 'Buscando conhecimento relevante...',
              'generation': 'Gerando resposta com IA...',
              'quality': 'Validando qualidade (Guardian)...',
              'grounding': 'Verificando fontes e citações...',
              'cove': 'Verificando consistência (CoVe)...',
              'constitutional': 'Aplicando princípios constitucionais...',
              'citation': 'Buscando referências científicas...',
            };
            if (phaseMessages[phase]) {
              sendEvent('progress', { phase, message: phaseMessages[phase], elapsed_ms: Date.now() - _ttftStart });
            }
          } catch { /* non-blocking */ }
        },
        onToolCall: (toolName: string, toolArgs: Record<string, unknown>, status: string, output?: string, durationMs?: number) => {
          try {
            sendEvent('tool_call', { id: `tc-${Date.now()}`, name: toolName, input: toolArgs, status, output, durationMs, timestamp: Date.now() });
          } catch { /* non-blocking */ }
        },
      });

      sendEvent('progress', { phase: 'validating', message: 'Validando qualidade (Guardian)...', elapsed_ms: Date.now() - _ttftStart });

      const finalText = result.response || '';
      const CHUNK_SIZE = 16;
      if (_streamingTokenCount === 0) {
        for (let i = 0; i < finalText.length; i += CHUNK_SIZE) {
          sendEvent('token', { text: finalText.slice(i, i + CHUNK_SIZE) });
        }
      } else {
        sendEvent('stream_complete', { tokens_sent: _streamingTokenCount, elapsed_ms: Date.now() - _ttftStart });
      }

      const totalTime = Date.now() - _ttftStart;
      sendEvent('response', { ...result, ttft_ms: totalTime, streaming_chunks: Math.ceil(finalText.length / CHUNK_SIZE) });
      sendEvent('done', { message: 'Processamento concluído', total_ms: totalTime, quality_score: result.quality?.qualityScore, citations_count: (result as any).citations?.length ?? 0 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Stream] processQuery threw:', message);
      sendEvent('error', { message });
      const degradationText = 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente em alguns segundos.';
      sendEvent('token', { text: degradationText });
      sendEvent('response', { response: degradationText, tier: 'TIER_1', provider: 'error', modelName: 'fallback', quality: { qualityScore: 0, passed: false }, responseTime: 0, cost: 0, cacheHit: false });
      sendEvent('done', { message: 'Error fallback', total_ms: 0, quality_score: 0 });
    } finally {
      releaseSemaphore(); // SOTA Gap 3: always release concurrency slot
      res.end();
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite.js");
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // R547 (AWAKE V236 Ciclo 164): Cache warming — fire-and-forget, non-blocking
    // Scientific basis: Proactive caching (Sadeghi et al., 2020): pre-warming reduces cold-start
    // Delay 2s to allow DB connection to stabilize before querying
    setTimeout(() => warmCache().catch(e => console.warn('[CacheWarming] Startup warm failed:', e)), 2000);
    // C201-4b: HippoRAG2 indexing — index C200-C201 papers (non-blocking, 30s delay)
    // Scientific basis: HippoRAG2 (arXiv:2502.14802) — non-parametric continual learning
    scheduleC201Indexing();
    // SHMS Knowledge Seeder — inject ICOLD/ISO/PNSB norms into RAG (5s delay, non-blocking)
    setTimeout(async () => {
      try {
        const { seedShmsKnowledge } = await import("../mother/shms-knowledge-seeder.js");
        await seedShmsKnowledge();
      } catch (e) { console.warn('[SHMS] Knowledge seeding failed (non-blocking):', e); }
    }, 5000);
  });
}

startServer().catch(console.error);
