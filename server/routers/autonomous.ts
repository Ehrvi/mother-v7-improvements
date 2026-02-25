/**
 * MOTHER v61.0 — Autonomous Update Router
 * 
 * tRPC router for triggering and monitoring autonomous self-updates.
 * Only the creator (elgarcia.eng@gmail.com) can approve proposals
 * and trigger the autonomous update job.
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { execSync } from 'child_process';
import { getSelfProposals } from '../mother/self-proposal-engine';
import { executeAutonomousUpdate } from '../mother/autonomous-update-job';
import { getDb } from '../db';

const CREATOR_EMAIL = 'elgarcia.eng@gmail.com';

export const autonomousRouter = router({
  // ============================================================
  // Get all self-proposals
  // ============================================================
  getProposals: publicProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const proposals = await getSelfProposals(input.status);
      return { proposals };
    }),

  // ============================================================
  // Approve a proposal (creator only)
  // ============================================================
  approveProposal: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Only creator can approve
      if (ctx.user?.email !== CREATOR_EMAIL) {
        throw new Error('Only the creator can approve proposals');
      }
      
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');
      
      await (db as any).$client.query(
        `UPDATE self_proposals SET status = 'approved', updated_at = NOW() WHERE id = ?`,
        [input.proposalId]
      );
      
      // Log the approval
      await (db as any).$client.query(
        `INSERT INTO audit_log (action, actor_email, actor_type, target_type, target_id, details, success)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'PROPOSAL_APPROVED',
          ctx.user.email,
          'human',
          'proposal',
          String(input.proposalId),
          JSON.stringify({ approvedBy: ctx.user.email, timestamp: new Date().toISOString() }),
          1,
        ]
      );
      
      return { success: true, message: `Proposal ${input.proposalId} approved` };
    }),

  // ============================================================
  // Execute autonomous update (creator only)
  // Triggers the self-coding engine
  // ============================================================
  executeUpdate: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Only creator can trigger execution
      if (ctx.user?.email !== CREATOR_EMAIL) {
        throw new Error('Only the creator can trigger autonomous updates');
      }
      
      // Option 1: Run inline (for testing)
      // This runs the autonomous update job directly in the current process
      // In production, this should trigger a Cloud Run Job instead
      const useCloudRunJob = process.env.USE_CLOUD_RUN_JOB === 'true';
      
      if (useCloudRunJob) {
        // Trigger Cloud Run Job
        try {
          const projectId = process.env.GCLOUD_PROJECT || 'mothers-library-mcp';
          const region = process.env.GCLOUD_REGION || 'australia-southeast1';
          
          const command = `gcloud run jobs execute mother-autonomous-update-job \
            --region=${region} \
            --project=${projectId} \
            --update-env-vars=PROPOSAL_ID=${input.proposalId} \
            --async`;
          
          execSync(command, { stdio: 'pipe' });
          
          return {
            success: true,
            mode: 'cloud-run-job',
            message: `Cloud Run Job triggered for proposal ${input.proposalId}`,
          };
        } catch (error: any) {
          throw new Error(`Failed to trigger Cloud Run Job: ${error.message}`);
        }
      } else {
        // Run inline (async, non-blocking)
        executeAutonomousUpdate(input.proposalId)
          .then(result => {
            console.log(`[Autonomous] Update job completed:`, result);
          })
          .catch(error => {
            console.error(`[Autonomous] Update job failed:`, error);
          });
        
        return {
          success: true,
          mode: 'inline',
          message: `Autonomous update started for proposal ${input.proposalId}. Check logs for progress.`,
        };
      }
    }),

  // ============================================================
  // Get audit log
  // ============================================================
  getAuditLog: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.email !== CREATOR_EMAIL) {
        throw new Error('Only the creator can view the audit log');
      }
      
      const db = await getDb();
      if (!db) return { entries: [] };
      
      const [rows] = await (db as any).$client.query(
        `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`,
        [input.limit]
      );
      
      return { entries: rows || [] };
    }),
});
