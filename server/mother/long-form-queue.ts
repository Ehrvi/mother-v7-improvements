/**
 * long-form-queue.ts — Async Job Queue for Long-form Generation
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Producer-consumer pattern for async workloads (Dijkstra, 1965)
 * - SSE (Server-Sent Events) for real-time progress streaming
 * - In-memory queue with persistence hooks for Cloud SQL
 *
 * Architecture:
 * - Jobs are queued and processed sequentially (1 at a time to avoid OpenAI rate limits)
 * - Progress is streamed via SSE to the client
 * - Completed jobs are cached in memory for 1 hour
 */

import { EventEmitter } from "events";
import type { LongFormDocument, LongFormProgress, LongFormRequest } from "./long-form-generator.js";
import { longFormGenerator } from "./long-form-generator.js";

export type JobStatus = "queued" | "running" | "complete" | "error" | "cancelled";

export interface LongFormJob {
  id: string;
  request: LongFormRequest;
  status: JobStatus;
  progress: LongFormProgress;
  result?: LongFormDocument;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  queuePosition: number;
}

export interface QueueStats {
  total: number;
  queued: number;
  running: number;
  complete: number;
  error: number;
  avgGenerationTimeMs: number;
}

/**
 * LongFormQueue — manages async long-form document generation jobs.
 *
 * Clients submit jobs and receive a jobId.
 * They then subscribe to SSE progress events using the jobId.
 * When complete, the full document is available via GET /api/long-form/:jobId
 */
export class LongFormQueue extends EventEmitter {
  private jobs = new Map<string, LongFormJob>();
  private queue: string[] = []; // jobIds in order
  private isProcessing = false;
  private completedGenerationTimes: number[] = [];
  /** Cache TTL: 1 hour */
  private readonly cacheTtlMs = 60 * 60 * 1000;

  /**
   * Submit a new long-form generation job.
   * Returns the jobId immediately.
   */
  async submit(request: LongFormRequest): Promise<{ jobId: string; queuePosition: number }> {
    const jobId = `lf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queuePosition = this.queue.length + (this.isProcessing ? 1 : 0);

    const job: LongFormJob = {
      id: jobId,
      request: { ...request, jobId },
      status: "queued",
      progress: {
        jobId,
        phase: "outline",
        currentSection: 0,
        totalSections: 0,
        percentComplete: 0,
        wordCount: 0,
      },
      createdAt: new Date(),
      queuePosition,
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNext();
    }

    return { jobId, queuePosition };
  }

  /**
   * Get job status and progress.
   */
  getJob(jobId: string): LongFormJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Cancel a queued job.
   */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "queued") return false;

    job.status = "cancelled";
    this.queue = this.queue.filter((id) => id !== jobId);
    this.emit(`job:${jobId}`, { type: "cancelled" });
    return true;
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    const jobs = Array.from(this.jobs.values());
    const completionTimes = this.completedGenerationTimes;
    const avgTime =
      completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

    return {
      total: jobs.length,
      queued: jobs.filter((j) => j.status === "queued").length,
      running: jobs.filter((j) => j.status === "running").length,
      complete: jobs.filter((j) => j.status === "complete").length,
      error: jobs.filter((j) => j.status === "error").length,
      avgGenerationTimeMs: Math.round(avgTime),
    };
  }

  /**
   * Subscribe to progress events for a job.
   * Returns an unsubscribe function.
   */
  subscribe(
    jobId: string,
    callback: (event: { type: string; data: LongFormProgress | LongFormDocument | string }) => void
  ): () => void {
    const handler = callback;
    this.on(`job:${jobId}`, handler);
    return () => this.off(`job:${jobId}`, handler);
  }

  /**
   * Process the next job in the queue.
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const jobId = this.queue.shift()!;
    const job = this.jobs.get(jobId);

    if (!job || job.status === "cancelled") {
      this.processNext();
      return;
    }

    job.status = "running";
    job.startedAt = new Date();

    try {
      // Attach progress callback
      job.request.onProgress = (progress: LongFormProgress) => {
        job.progress = progress;
        this.emit(`job:${jobId}`, { type: "progress", data: progress });
      };

      const result = await longFormGenerator.generate(job.request);

      job.status = "complete";
      job.result = result;
      job.completedAt = new Date();

      if (job.startedAt) {
        const duration = job.completedAt.getTime() - job.startedAt.getTime();
        this.completedGenerationTimes.push(duration);
        // Keep only last 20 measurements
        if (this.completedGenerationTimes.length > 20) {
          this.completedGenerationTimes.shift();
        }
      }

      this.emit(`job:${jobId}`, { type: "complete", data: result });

      // Schedule cache cleanup
      setTimeout(() => {
        this.jobs.delete(jobId);
      }, this.cacheTtlMs);
    } catch (err: unknown) {
      const error = err as Error;
      job.status = "error";
      job.error = error.message ?? "Unknown error";
      job.completedAt = new Date();

      this.emit(`job:${jobId}`, { type: "error", data: job.error });
    } finally {
      // Process next job
      this.processNext();
    }
  }
}

// Singleton instance
export const longFormQueue = new LongFormQueue();
