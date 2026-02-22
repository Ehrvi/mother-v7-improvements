/**
 * MOTHER Omniscient - tRPC Router
 * 
 * Provides API endpoints for Omniscient UI
 */

import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { knowledgeAreas, papers, paperChunks } from '../../drizzle/schema';
import { studyKnowledgeArea } from './orchestrator';
import { studyKnowledgeAreaAsync } from './orchestrator-async';
import { jobQueue } from './queue';
import { searchSimilarChunks } from './search';
import { eq, desc } from 'drizzle-orm';

export const omniscientRouter = router({
  /**
   * List all knowledge areas
   */
  listAreas: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const areas = await db
      .select()
      .from(knowledgeAreas)
      .orderBy(desc(knowledgeAreas.createdAt));

    return areas;
  }),

  /**
   * Get knowledge area by ID
   */
  getArea: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [area] = await db
        .select()
        .from(knowledgeAreas)
        .where(eq(knowledgeAreas.id, input.id));

      if (!area) throw new Error('Knowledge area not found');

      return area;
    }),

  /**
   * Create a new study job (v19.0: Async with Cloud Tasks)
   */
  createStudyJob: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        maxPapers: z.number().min(1).max(200).default(100),
      })
    )
    .mutation(async ({ input }) => {
      // v19.0: Use async orchestrator with Cloud Tasks
      // This returns immediately after enqueuing tasks (no timeout)
      const result = await studyKnowledgeAreaAsync(
        input.name,
        input.description,
        { maxPapers: input.maxPapers }
      );

      // Return with job info and enqueued count
      return {
        message: result.message,
        jobId: result.job.id,
        knowledgeAreaId: result.knowledgeAreaId,
        papersEnqueued: result.papersEnqueued,
      };
    }),

  /**
   * Get all jobs for a knowledge area
   */
  getJobs: publicProcedure
    .input(z.object({ knowledgeAreaId: z.number() }))
    .query(async ({ input }) => {
      const jobs = jobQueue.getJobsByKnowledgeArea(input.knowledgeAreaId);
      return jobs;
    }),

  /**
   * Get job by ID
   */
  getJob: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = jobQueue.getJob(input.jobId);
      if (!job) throw new Error('Job not found');
      return job;
    }),

  /**
   * Get all jobs
   */
  getAllJobs: publicProcedure.query(async () => {
    const jobs = jobQueue.getAllJobs();
    return jobs;
  }),

  /**
   * Search papers semantically
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        topK: z.number().min(1).max(20).default(5),
        minSimilarity: z.number().min(0).max(1).default(0.5),
      })
    )
    .query(async ({ input }) => {
      const results = await searchSimilarChunks(
        input.query,
        input.topK,
        input.minSimilarity
      );
      return results;
    }),

  /**
   * Get papers for a knowledge area
   */
  getPapers: publicProcedure
    .input(z.object({ knowledgeAreaId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const papersList = await db
        .select()
        .from(papers)
        .where(eq(papers.knowledgeAreaId, input.knowledgeAreaId))
        .orderBy(desc(papers.createdAt));

      return papersList;
    }),

  /**
   * Get chunks for a paper
   */
  getChunks: publicProcedure
    .input(z.object({ paperId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const chunks = await db
        .select()
        .from(paperChunks)
        .where(eq(paperChunks.paperId, input.paperId))
        .orderBy(paperChunks.chunkIndex);

      return chunks;
    }),
});
