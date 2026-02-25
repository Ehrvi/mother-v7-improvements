/**
 * MOTHER v65.0 - Update Proposals Router
 * Implements Req #5 (interactive proposals), Req #6 (creator-only authorization)
 * v65.0: Added SM-2 re-proposal scheduling and knowledge wisdom endpoints
 *
 * Scientific basis:
 * - RBAC (Ferraiolo & Kuhn, NIST 1992): Role-based access control
 * - Human-in-the-Loop AI (Amershi et al., CHI 2019): Creator approval gate
 * - SM-2 Algorithm (Wozniak, 1990): Spaced repetition for re-proposal timing
 * - Knowledge Wisdom Formula: W(d) = K_MOTHER(d) / K_SoA(d) × 100%
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import {
  createProposal,
  approveProposal,
  rejectProposal,
  getPendingProposals,
  getProposals,
  motherProposeUpdate,
  getAuditLog,
  CREATOR_EMAIL,
} from '../mother/update-proposals';
import { getUserMemoryStats } from '../mother/user-memory';
import {
  getProposalsWithReproposal,
  getKnowledgeWisdomStats,
  calculateReproposalSchedule,
} from '../mother/reproposal-engine';

export const proposalsRouter = router({
  /**
   * List all proposals (with optional status filter)
   */
  list: publicProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'implementing', 'completed', 'failed']).optional(),
        limit: z.number().min(1).max(100).optional().default(20),
      })
    )
    .query(async ({ input }) => {
      return await getProposals(input.status, input.limit);
    }),

  /**
   * List proposals with SM-2 re-proposal metadata
   * Scientific basis: SM-2 Algorithm (Wozniak, 1990)
   */
  listWithReproposal: publicProcedure.query(async () => {
    return await getProposalsWithReproposal();
  }),

  /**
   * Get knowledge wisdom statistics
   * Formula: W(d) = K_MOTHER(d) / K_SoA(d) × 100%
   * Scientific basis: Chase & Simon (1973), Ericsson (2006)
   */
  knowledgeWisdom: publicProcedure.query(async () => {
    return await getKnowledgeWisdomStats();
  }),

  /**
   * Get pending proposals (requires auth)
   */
  pending: protectedProcedure.query(async () => {
    return await getPendingProposals();
  }),

  /**
   * Create a new proposal (any authenticated user can propose)
   * Req #5: User can interact with MOTHER and order architecture updates
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(5).max(500),
        description: z.string().min(10),
        rationale: z.string().optional(),
        affectedModules: z.array(z.string()).optional(),
        estimatedImpact: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const isCreator = ctx.user.email === CREATOR_EMAIL;
      const id = await createProposal({
        proposedBy: isCreator ? 'creator' : 'system',
        title: input.title,
        description: input.description,
        rationale: input.rationale,
        affectedModules: input.affectedModules,
        estimatedImpact: input.estimatedImpact,
      });
      return { id, success: id !== null };
    }),

  /**
   * Approve a proposal — ONLY the creator can do this
   * Req #6: Only elgarcia.eng@gmail.com can authorize updates
   */
  approve: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
        implementationNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await approveProposal(
        input.proposalId,
        ctx.user.email ?? '',
        input.implementationNotes
      );
      return result;
    }),

  /**
   * Reject a proposal — ONLY the creator can do this
   * v65.0: Now schedules SM-2 re-proposal automatically
   */
  reject: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
        reason: z.string().min(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await rejectProposal(
        input.proposalId,
        ctx.user.email ?? '',
        input.reason
      );

      if (result.success) {
        try {
          // Get current rejection count
          const { getDb } = await import('../db');
          const db = await getDb();
          if (db) {
            const [rows] = await (db as any).$client.query(
              `SELECT rejection_count, ef_factor FROM self_proposals WHERE id = ?`,
              [input.proposalId]
            );
            const current = (rows as any[])[0];
            const currentRejectionCount = (current?.rejection_count || 0) + 1;
            const currentEF = current?.ef_factor || 2.5;

            // Calculate SM-2 re-proposal schedule
            const schedule = calculateReproposalSchedule(
              currentRejectionCount,
              currentEF,
              input.reason,
              new Date()
            );

            // Update with SM-2 schedule
            await (db as any).$client.query(
              `UPDATE self_proposals SET
                 rejection_count = ?,
                 rejection_reason = ?,
                 next_reproposal_at = ?,
                 ef_factor = ?,
                 improvement_notes = ?
               WHERE id = ?`,
              [
                currentRejectionCount,
                input.reason,
                schedule.nextAt,
                schedule.efFactor,
                schedule.improvementSuggestion,
                input.proposalId,
              ]
            );

            return {
              ...result,
              schedule: {
                nextReproposalAt: schedule.nextAt,
                intervalDays: schedule.intervalDays,
                requiresImprovement: schedule.requiresImprovement,
                improvementSuggestion: schedule.improvementSuggestion,
              },
            };
          }
        } catch (scheduleError) {
          console.error('[MOTHER] SM-2 scheduling failed:', scheduleError);
        }
      }

      return result;
    }),

  /**
   * MOTHER proposes an update to herself
   * Req #7: MOTHER is autonomous in proposing self-updates
   */
  motherPropose: protectedProcedure
    .input(
      z.object({
        title: z.string().min(5).max(500),
        description: z.string().min(10),
        rationale: z.string(),
        affectedModules: z.array(z.string()),
        impact: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only creator can trigger MOTHER to propose (security measure)
      if (ctx.user.email !== CREATOR_EMAIL) {
        return { success: false, reason: 'Only creator can trigger MOTHER proposals' };
      }
      const id = await motherProposeUpdate(
        input.title,
        input.description,
        input.rationale,
        input.affectedModules,
        input.impact
      );
      return { id, success: id !== null };
    }),

  /**
   * Get audit log
   * Req #6: Tamper-evident audit trail
   */
  auditLog: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .query(async ({ input }) => {
      return await getAuditLog(input.limit);
    }),

  /**
   * Get user memory statistics
   * Req #4: Per-user personalized memory
   */
  userMemoryStats: protectedProcedure.query(async ({ ctx }) => {
    return await getUserMemoryStats(ctx.user.id);
  }),
});
