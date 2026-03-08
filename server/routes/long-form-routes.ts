/**
 * long-form-routes.ts — REST + SSE Endpoints for Long-form Generation
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Endpoints:
 * POST /api/long-form/submit       — Submit a new long-form generation job
 * GET  /api/long-form/:jobId       — Get job status and result
 * GET  /api/long-form/:jobId/stream — SSE stream of generation progress
 * DELETE /api/long-form/:jobId     — Cancel a queued job
 * GET  /api/long-form/stats        — Queue statistics
 */

import { Router, type Request, type Response } from "express";
import type { LongFormRequest } from "../mother/long-form-generator.js";
import { longFormQueue } from "../mother/long-form-queue.js";

const router = Router();

/**
 * POST /api/long-form/submit
 * Submit a new long-form document generation job.
 *
 * Body: LongFormRequest (without jobId and onProgress)
 * Returns: { jobId, queuePosition, estimatedTimeMs }
 */
router.post("/submit", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<LongFormRequest>;

    // Validate required fields
    if (!body.title || !body.topic || !body.audience) {
      res.status(400).json({
        error: "Missing required fields: title, topic, audience",
      });
      return;
    }

    if (!body.targetPages || body.targetPages < 1 || body.targetPages > 120) {
      res.status(400).json({
        error: "targetPages must be between 1 and 120",
      });
      return;
    }

    const request: LongFormRequest = {
      title: body.title,
      type: body.type ?? "technical_report",
      targetPages: body.targetPages,
      audience: body.audience,
      topic: body.topic,
      sections: body.sections,
      language: body.language ?? "pt-BR",
      outputFormat: body.outputFormat ?? "markdown",
    };

    const { jobId, queuePosition } = await longFormQueue.submit(request);
    const stats = longFormQueue.getStats();

    res.status(202).json({
      jobId,
      queuePosition,
      estimatedTimeMs: stats.avgGenerationTimeMs * (queuePosition + 1) || 60_000,
      streamUrl: `/api/long-form/${jobId}/stream`,
      statusUrl: `/api/long-form/${jobId}`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ error: error.message ?? "Internal server error" });
  }
});

/**
 * GET /api/long-form/stats
 * Get queue statistics.
 */
router.get("/stats", (_req: Request, res: Response) => {
  res.json(longFormQueue.getStats());
});

/**
 * GET /api/long-form/:jobId
 * Get job status and result (if complete).
 */
router.get("/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = longFormQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: `Job ${jobId} not found` });
    return;
  }

  if (job.status === "complete" && job.result) {
    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      result: {
        title: job.result.title,
        wordCount: job.result.wordCount,
        pageCount: job.result.pageCount,
        generationTimeMs: job.result.generationTimeMs,
        outline: job.result.outline,
        fullText: job.result.fullText,
        metadata: job.result.metadata,
      },
    });
  } else {
    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      queuePosition: job.queuePosition,
    });
  }
});

/**
 * GET /api/long-form/:jobId/stream
 * SSE stream of generation progress.
 * Sends progress events until job is complete or errored.
 */
router.get("/:jobId/stream", (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = longFormQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: `Job ${jobId} not found` });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send current progress immediately
  res.write(`data: ${JSON.stringify({ type: "progress", data: job.progress })}\n\n`);

  // If already complete, send result and close
  if (job.status === "complete" && job.result) {
    res.write(`data: ${JSON.stringify({ type: "complete", data: job.result })}\n\n`);
    res.end();
    return;
  }

  if (job.status === "error") {
    res.write(`data: ${JSON.stringify({ type: "error", data: job.error })}\n\n`);
    res.end();
    return;
  }

  // Subscribe to future events
  const unsubscribe = longFormQueue.subscribe(jobId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    if (event.type === "complete" || event.type === "error" || event.type === "cancelled") {
      unsubscribe();
      res.end();
    }
  });

  // Heartbeat every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/**
 * DELETE /api/long-form/:jobId
 * Cancel a queued job.
 */
router.delete("/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = longFormQueue.cancel(jobId);

  if (cancelled) {
    res.json({ jobId, status: "cancelled" });
  } else {
    const job = longFormQueue.getJob(jobId);
    if (!job) {
      res.status(404).json({ error: `Job ${jobId} not found` });
    } else {
      res.status(409).json({
        error: `Cannot cancel job in status: ${job.status}`,
        currentStatus: job.status,
      });
    }
  }
});

export default router;
