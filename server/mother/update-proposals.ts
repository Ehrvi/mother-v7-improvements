/**
 * MOTHER v56.0 - Update Proposals & Authorization System
 * Implements Requirements #5, #6, and #7:
 * - Req #5: User can interact with MOTHER and order architecture updates
 * - Req #6: ONLY the creator (elgarcia.eng@gmail.com) can authorize updates
 * - Req #7: MOTHER must be fully autonomous in self-updating without losing functionality
 *
 * Scientific basis:
 * - RBAC (Ferraiolo & Kuhn, NIST 1992): Role-Based Access Control ensures only
 *   authorized principals can approve system changes
 * - Human-in-the-Loop AI (Amershi et al., CHI 2019): Creator approval gate ensures
 *   safety while enabling autonomous operation
 * - Safe Self-Modification (Omohundro, 2008): Any self-modifying system requires
 *   explicit authorization to prevent unintended behavior
 */

import { getDb } from '../db';
import { execSync } from 'child_process';
import { createLogger } from '../_core/logger'; // v74.0: NC-003 structured logger
const log = createLogger('PROPOSALS');

// The ONLY authorized email for approving updates
export const CREATOR_EMAIL = 'elgarcia.eng@gmail.com';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'implementing' | 'completed' | 'failed';
export type ProposedBy = 'creator' | 'mother' | 'system';
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export interface UpdateProposal {
  id: number;
  proposedBy: ProposedBy;
  title: string;
  description: string;
  rationale?: string;
  affectedModules?: string;
  estimatedImpact: ImpactLevel;
  status: ProposalStatus;
  approvedByEmail?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  implementationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  source?: 'manual' | 'dgm'; // v72.0: identifies which table the proposal came from
}

export interface CreateProposalInput {
  proposedBy: ProposedBy;
  title: string;
  description: string;
  rationale?: string;
  affectedModules?: string[];
  estimatedImpact?: ImpactLevel;
}

/**
 * Create a new update proposal
 * Can be proposed by MOTHER, the creator, or the system
 */
export async function createProposal(input: CreateProposalInput): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) {
      log.warn('[Proposals] DB not available');
      return null;
    }

    const result = await (db as any).$client.query(
      `INSERT INTO update_proposals 
       (proposed_by, title, description, rationale, affected_modules, estimated_impact, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        input.proposedBy,
        input.title,
        input.description,
        input.rationale || null,
        input.affectedModules ? JSON.stringify(input.affectedModules) : null,
        input.estimatedImpact || 'medium',
      ]
    );

    const id = result[0]?.insertId;
    log.info(`[Proposals] ✅ Created proposal ID ${id}: "${input.title}" (by: ${input.proposedBy})`);
    
    // Log to audit trail
    await logAuditEvent({
      action: 'proposal_created',
      actorType: input.proposedBy,
      targetType: 'update_proposal',
      targetId: String(id),
      details: `Proposal: "${input.title}" (impact: ${input.estimatedImpact || 'medium'})`,
      success: true,
    });

    return id || null;
  } catch (error) {
    log.error('[Proposals] Failed to create proposal:', error);
    return null;
  }
}

/**
 * Approve a proposal — ONLY the creator can do this
 * Req #6: Only elgarcia.eng@gmail.com can authorize updates
 */
export async function approveProposal(
  proposalId: number,
  approverEmail: string,
  implementationNotes?: string
): Promise<{ success: boolean; reason: string }> {
  // CRITICAL: Check creator authorization
  if (approverEmail !== CREATOR_EMAIL) {
    await logAuditEvent({
      action: 'proposal_approval_denied',
      actorEmail: approverEmail,
      actorType: 'user',
      targetType: 'update_proposal',
      targetId: String(proposalId),
      details: `Unauthorized approval attempt by ${approverEmail}`,
      success: false,
    });
    
    return {
      success: false,
      reason: `Unauthorized: Only ${CREATOR_EMAIL} can approve update proposals (Req #6)`,
    };
  }

  try {
    const db = await getDb();
    if (!db) return { success: false, reason: 'DB not available' };

    // v72.0: Fix — update BOTH tables (manual and DGM)
    // Root cause: approveProposal only updated update_proposals, but DGM proposals
    // live in self_proposals — 0 rows affected = silent fail, proposals stayed 'pending'/'failed'
    const [manualResult] = await (db as any).$client.query(
      `UPDATE update_proposals 
       SET status = 'approved', approved_by_email = ?, approved_at = NOW(), 
           implementation_notes = ?, updated_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [approverEmail, implementationNotes || null, proposalId]
    );
    const [dgmResult] = await (db as any).$client.query(
      `UPDATE self_proposals 
       SET status = 'approved', approved_by = ?, approved_at = NOW(), 
           updated_at = NOW()
       WHERE id = ? AND status IN ('pending', 'failed')`,
      [approverEmail, proposalId]
    );
    const affectedRows = ((manualResult as any).affectedRows || 0) + ((dgmResult as any).affectedRows || 0);
    if (affectedRows === 0) {
      log.warn(`[Proposals] ⚠️ No rows updated for proposal ${proposalId} — may already be approved or not found`);
    }
    log.info(`[Proposals] ✅ Proposal ${proposalId} approved (manual:${(manualResult as any).affectedRows || 0} dgm:${(dgmResult as any).affectedRows || 0})`);
    
    await logAuditEvent({
      action: 'proposal_approved',
      actorEmail: approverEmail,
      actorType: 'creator',
      targetType: 'update_proposal',
      targetId: String(proposalId),
      details: `Approved by creator: ${approverEmail}`,
      success: true,
    });

    // ============================================================
    // TRIGGER: Dispatch the SWE-Agent Cloud Run Job
    // Scientific basis: DGM (Zhang et al., 2025) — approval gates the
    // autonomous improvement loop. After approval, the job executes
    // the proposed code changes, compiles, and opens a PR.
    // ============================================================
    triggerSweAgentJob(proposalId).catch(err => {
      log.error(`[Proposals] SWE-Agent job trigger failed (non-blocking): ${err.message}`);
    });

    return { success: true, reason: 'Proposal approved by creator. SWE-Agent job dispatched.' };
  } catch (error) {
    log.error('[Proposals] Failed to approve proposal:', error);
    return { success: false, reason: `DB error: ${error}` };
  }
}

/**
 * Reject a proposal — ONLY the creator can do this
 */
export async function rejectProposal(
  proposalId: number,
  approverEmail: string,
  reason: string
): Promise<{ success: boolean; reason: string }> {
  // CRITICAL: Check creator authorization
  if (approverEmail !== CREATOR_EMAIL) {
    return {
      success: false,
      reason: `Unauthorized: Only ${CREATOR_EMAIL} can reject update proposals (Req #6)`,
    };
  }

  try {
    const db = await getDb();
    if (!db) return { success: false, reason: 'DB not available' };

    await (db as any).$client.query(
      `UPDATE update_proposals 
       SET status = 'rejected', rejected_reason = ?, updated_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [reason, proposalId]
    );

    await logAuditEvent({
      action: 'proposal_rejected',
      actorEmail: approverEmail,
      actorType: 'creator',
      targetType: 'update_proposal',
      targetId: String(proposalId),
      details: `Rejected: ${reason}`,
      success: true,
    });

    return { success: true, reason: 'Proposal rejected' };
  } catch (error) {
    log.error('[Proposals] Failed to reject proposal:', error);
    return { success: false, reason: `DB error: ${error}` };
  }
}

/**
 * Get all pending proposals
 * v63.0: Queries BOTH update_proposals (manual) and self_proposals (DGM autonomous)
 */
export async function getPendingProposals(): Promise<UpdateProposal[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    // Query update_proposals (manual proposals)
    const [manualRows] = await (db as any).$client.query(
      `SELECT id, 'mother' as proposed_by, title, description, '' as rationale,
              '' as affected_modules, 'medium' as estimated_impact,
              status, NULL as approved_by_email, NULL as approved_at,
              NULL as rejected_reason, NULL as implementation_notes,
              created_at, updated_at, 'manual' as source
       FROM update_proposals WHERE status = 'pending' ORDER BY created_at DESC`
    ).catch(() => [[]]);

    // Query self_proposals (DGM autonomous proposals)
    const [dgmRows] = await (db as any).$client.query(
      `SELECT id, 'mother' as proposed_by, title, description, hypothesis as rationale,
              metric_trigger as affected_modules, 'high' as estimated_impact,
              status, approved_by as approved_by_email, approved_at,
              NULL as rejected_reason, fitness_function as implementation_notes,
              created_at, updated_at, 'dgm' as source
       FROM self_proposals WHERE status = 'pending' ORDER BY created_at DESC`
    ).catch(() => [[]]);

    return [...(manualRows || []), ...(dgmRows || [])].map(mapRowToProposal);
  } catch (error) {
    log.error('[Proposals] Failed to get pending proposals:', error);
    return [];
  }
}

/**
 * Get all proposals with optional status filter
 * v63.0: Queries BOTH update_proposals (manual) and self_proposals (DGM autonomous)
 * Scientific basis: DGM (Zhang et al., 2025) — autonomous proposals are first-class citizens
 */
export async function getProposals(status?: ProposalStatus, limit = 20): Promise<UpdateProposal[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const whereClause = status ? `WHERE status = '${status}'` : '';

    // Query update_proposals (manual proposals)
    const [manualRows] = await (db as any).$client.query(
      `SELECT id, 'mother' as proposed_by, title, description, '' as rationale,
              '' as affected_modules, 'medium' as estimated_impact,
              status, NULL as approved_by_email, NULL as approved_at,
              NULL as rejected_reason, NULL as implementation_notes,
              created_at, updated_at, 'manual' as source
       FROM update_proposals ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      [Math.ceil(limit / 2)]
    ).catch(() => [[]]);

    // Query self_proposals (DGM autonomous proposals)
    const [dgmRows] = await (db as any).$client.query(
      `SELECT id, 'mother' as proposed_by, title, description, hypothesis as rationale,
              metric_trigger as affected_modules, 'high' as estimated_impact,
              status, approved_by as approved_by_email, approved_at,
              NULL as rejected_reason, fitness_function as implementation_notes,
              created_at, updated_at, 'dgm' as source
       FROM self_proposals ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      [limit]
    ).catch(() => [[]]);

    // Merge and sort by created_at descending
    const all = [...(manualRows || []), ...(dgmRows || [])]
      .map(mapRowToProposal)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return all;
  } catch (error) {
    log.error('[Proposals] Failed to get proposals:', error);
    return [];
  }
}

/**
 * MOTHER proposes an update to herself
 * Req #5: MOTHER can propose updates; Req #6: Creator must approve
 */
export async function motherProposeUpdate(
  title: string,
  description: string,
  rationale: string,
  affectedModules: string[],
  impact: ImpactLevel = 'medium'
): Promise<number | null> {
  log.info(`[Proposals] MOTHER proposing update: "${title}"`);
  
  return createProposal({
    proposedBy: 'mother',
    title,
    description,
    rationale,
    affectedModules,
    estimatedImpact: impact,
  });
}

// ============================================================
// AUDIT LOG
// ============================================================

export interface AuditLogInput {
  action: string;
  actorEmail?: string;
  actorType: 'creator' | 'user' | 'system' | 'mother';
  targetType?: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
  success: boolean;
}

/**
 * Log an audit event — immutable record of all system changes
 * Req #6: Tamper-evident audit trail
 */
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await (db as any).$client.query(
      `INSERT INTO audit_log (action, actor_email, actor_type, target_type, target_id, details, ip_address, success, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        input.action,
        input.actorEmail || null,
        input.actorType,
        input.targetType || null,
        input.targetId || null,
        input.details || null,
        input.ipAddress || null,
        input.success ? 1 : 0,
      ]
    );
  } catch (error) {
    // Audit logging should never block the main flow
    log.error('[AuditLog] Failed to log event (non-blocking):', error);
  }
}

/**
 * Get recent audit log entries
 */
export async function getAuditLog(limit = 50): Promise<any[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const [rows] = await (db as any).$client.query(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?',
      [limit]
    );

    return rows || [];
  } catch (error) {
    log.error('[AuditLog] Failed to get log:', error);
    return [];
  }
}

// ============================================================
// HELPERS
// ============================================================

function mapRowToProposal(row: any): UpdateProposal {
  return {
    id: row.id,
    proposedBy: row.proposed_by,
    title: row.title,
    description: row.description,
    rationale: row.rationale,
    affectedModules: row.affected_modules,
    estimatedImpact: row.estimated_impact,
    status: row.status,
    approvedByEmail: row.approved_by_email,
    approvedAt: row.approved_at,
    rejectedReason: row.rejected_reason,
    implementationNotes: row.implementation_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source || 'manual', // v72.0: track which table the proposal came from
  };
}

// ============================================================
// SWE-AGENT JOB TRIGGER
// Dispatches the Cloud Run Job to execute the approved proposal.
// Falls back to inline execution if Cloud Run Job is not configured.
// Scientific basis: DGM (Zhang et al., 2025); SWE-agent (Xia et al., 2025)
// ============================================================
export async function triggerSweAgentJob(proposalId: number): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'mothers-library-mcp';
  const region = process.env.GCLOUD_REGION || 'australia-southeast1';
  const jobName = process.env.SWE_AGENT_JOB_NAME || 'mother-swe-agent-job';
  const useCloudRunJob = process.env.USE_CLOUD_RUN_JOB === 'true';

  log.info(`[SWE-Trigger] Dispatching SWE-Agent for proposal ${proposalId}`);
  log.info(`[SWE-Trigger] Mode: ${useCloudRunJob ? 'Cloud Run Job' : 'Inline (fallback)'}`);

  if (useCloudRunJob) {
    // PRIMARY: Trigger the Cloud Run Job (isolated, scalable, production-grade)
    const command = [
      'gcloud run jobs execute', jobName,
      `--region=${region}`,
      `--project=${projectId}`,
      `--update-env-vars=PROPOSAL_ID=${proposalId},AUTONOMOUS_JOB_MODE=true`,
      '--async',
    ].join(' ');

    log.info(`[SWE-Trigger] Executing: ${command}`);
    execSync(command, { stdio: 'pipe' });
    log.info(`[SWE-Trigger] ✅ Cloud Run Job dispatched for proposal ${proposalId}`);

    await logAuditEvent({
      action: 'SWE_AGENT_JOB_DISPATCHED',
      actorType: 'system',
      targetType: 'proposal',
      targetId: String(proposalId),
      details: `Cloud Run Job '${jobName}' dispatched for proposal ${proposalId}`,
      success: true,
    });
  } else {
    // FALLBACK: Run inline (async, non-blocking) — used when Cloud Run Job is not set up
    log.info(`[SWE-Trigger] ⚠️  USE_CLOUD_RUN_JOB not set. Running inline (non-blocking).`);
    const { executeAutonomousUpdate } = await import('./autonomous-update-job');
    executeAutonomousUpdate(proposalId)
      .then(result => {
        log.info(`[SWE-Trigger] Inline job completed: ${result.success ? '✅' : '❌'} ${result.message}`);
      })
      .catch(err => {
        log.error(`[SWE-Trigger] Inline job error: ${err.message}`);
      });

    await logAuditEvent({
      action: 'SWE_AGENT_INLINE_STARTED',
      actorType: 'system',
      targetType: 'proposal',
      targetId: String(proposalId),
      details: `Inline SWE-Agent started for proposal ${proposalId} (Cloud Run Job not configured)`,
      success: true,
    });
  }
}
