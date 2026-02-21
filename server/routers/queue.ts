import { publicProcedure, router } from "../_core/trpc";
import { getQueueStats, getJob } from "../lib/queue";
import { z } from "zod";

export const queueRouter = router({
  // Get queue statistics
  stats: publicProcedure.query(async () => {
    const stats = await getQueueStats();
    
    if (!stats) {
      return {
        enabled: false,
        message: "Queue not available (Redis not configured)",
      };
    }
    
    const total = stats.waiting + stats.active + stats.completed + stats.failed + stats.delayed;
    
    return {
      enabled: true,
      stats: {
        waiting: stats.waiting,
        active: stats.active,
        completed: stats.completed,
        failed: stats.failed,
        delayed: stats.delayed,
        total,
      },
      health: {
        status: stats.failed > 100 ? "degraded" : "healthy",
        failureRate: total > 0 ? ((stats.failed / total) * 100).toFixed(2) + "%" : "0%",
      },
    };
  }),
  
  // Get job status by ID
  job: publicProcedure
    .input(z.object({
      jobId: z.string(),
    }))
    .query(async ({ input }) => {
      const job = await getJob(input.jobId);
      
      if (!job) {
        return {
          found: false,
          message: "Job not found",
        };
      }
      
      return {
        found: true,
        job: {
          id: job.id,
          name: job.name,
          data: job.data,
          progress: await job.getState(),
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          returnvalue: job.returnvalue,
          failedReason: job.failedReason,
        },
      };
    }),
});
