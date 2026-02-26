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
  getKnowledgeHierarchy,
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
   * v69.7: Get hierarchical knowledge map with drill-down percentages + KAI/KRI/KCI metrics
   * Scientific basis:
   *   - Jiang et al. (2025, arXiv:2502.04066): SMI metric for knowledge retention measurement
   *   - Zhang et al. (2025, ACM Web Conference): Knowledge Coverage evaluation
   *   - Zins & Santos (2011, JASIST): "10 Pillars of Knowledge" hierarchical tree
   *   - UDC (Universal Decimal Classification, 2024): 10-domain knowledge taxonomy
   */
  knowledgeHierarchy: publicProcedure.query(async () => {
    const hierarchy = await getKnowledgeHierarchy();
    // KAI = Knowledge Absorption Index: absorbed / total_SoA
    // KRI = Knowledge Remaining Index: 100 - KAI
    // KCI = Knowledge Coverage Index: domains_with_data / total_domains
    const totalChunks = hierarchy.reduce((s, d) => s + d.motherChunks, 0);
    const totalSoA = hierarchy.reduce((s, d) => s + d.soaEstimate, 0);
    const coveredDomains = hierarchy.filter(d => d.motherChunks > 0).length;
    const kai = totalSoA > 0 ? Math.round((totalChunks / totalSoA) * 1000) / 10 : 0;
    const kri = Math.round((100 - kai) * 10) / 10;
    const kci = hierarchy.length > 0 ? Math.round((coveredDomains / hierarchy.length) * 1000) / 10 : 0;
    return { hierarchy, metrics: { kai, kri, kci, totalChunks, totalSoA, coveredDomains, totalDomains: hierarchy.length } };
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

  /**
   * v69.12: Defer a proposal (Adiar) — postpone review by N days
   * ISO 27001 A.12.1.2: Audit trail for all change management decisions
   * Scientific basis: ITIL Change Management (Axelos, 2019)
   */
  defer: protectedProcedure
    .input(z.object({
      id: z.number(),
      daysToDefer: z.number().min(1).max(365).default(7),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.email !== CREATOR_EMAIL) {
        throw new Error('Only creator can defer proposals');
      }
      const { getDb: getDb2 } = await import('../db');
      const db = await getDb2();
      if (!db) throw new Error('DB unavailable');
      const deferUntil = new Date(Date.now() + input.daysToDefer * 24 * 60 * 60 * 1000);
      await (db as any).execute(
        `UPDATE self_proposals SET status = 'deferred', next_reproposal_at = ?, rejection_reason = ?, updated_at = NOW() WHERE id = ?`,
        [deferUntil, input.reason ?? `Deferred by creator for \${input.daysToDefer} days`, input.id]
      );
      const { logAuditEvent: logAudit2 } = await import('../mother/update-proposals');
      await logAudit2({
        action: 'PROPOSAL_DEFERRED',
        actorEmail: ctx.user.email,
        actorType: 'creator',
        targetType: 'proposal',
        targetId: String(input.id),
        details: JSON.stringify({ daysToDefer: input.daysToDefer, deferUntil: deferUntil.toISOString(), reason: input.reason }),
        success: true,
      });
      return { success: true, deferUntil };
    }),

  /**
   * v69.12: Cancel a proposal permanently (Cancelar Definitivamente)
   * ISO 27001 A.12.1.2: Immutable audit trail — cancellation is permanent and auditable
   * Scientific basis: ITIL Change Management (Axelos, 2019); ISO/IEC 27001:2022
   */
  cancelPermanently: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().min(5),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.email !== CREATOR_EMAIL) {
        throw new Error('Only creator can permanently cancel proposals');
      }
      const { getDb: getDb3 } = await import('../db');
      const db3 = await getDb3();
      if (!db3) throw new Error('DB unavailable');
      await (db3 as any).execute(
        `UPDATE self_proposals SET 
          status = 'cancelled_permanently',
          rejection_reason = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [`PERMANENTLY CANCELLED by creator: \${input.reason}`, input.id]
      );
      const { logAuditEvent: logAudit3 } = await import('../mother/update-proposals');
      await logAudit3({
        action: 'PROPOSAL_CANCELLED_PERMANENTLY',
        actorEmail: ctx.user.email,
        actorType: 'creator',
        targetType: 'proposal',
        targetId: String(input.id),
        details: JSON.stringify({ reason: input.reason, cancelledAt: new Date().toISOString() }),
        success: true,
      });
      return { success: true };
    }),
});
