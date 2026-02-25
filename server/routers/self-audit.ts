/**
 * MOTHER v67.9 - Self-Audit Router (Ciclo 3: Autonomia)
 * 
 * v67.9 UPGRADE: Replaced LLM-based fake audit with REAL programmatic audit.
 * The old implementation (v7.0) asked an LLM to "describe" an audit.
 * This implementation ACTUALLY runs the checks programmatically.
 * 
 * Scientific basis:
 * - Continuous Verification (Humble & Farley, 2010): automated quality gates
 * - Chaos Engineering (Basiri et al., 2016): systematic fault injection
 * - RAGAS (Es et al., EACL 2024): RAG pipeline quality metrics
 * - G-Eval (Liu et al., 2023): LLM-based quality evaluation
 */
import { publicProcedure, router } from '../_core/trpc';
import { z } from 'zod';
import { getDb } from '../db';
import { auditLog } from '../../drizzle/schema';
import { runSelfAudit } from '../mother/self-audit-engine';
import { desc } from 'drizzle-orm';

export const selfAuditRouter = router({
  /**
   * Run the real self-audit
   * v67.9: Programmatic checks — not LLM theater
   */
  runAudit: publicProcedure
    .input(z.object({
      varredura: z.enum(['1', '2', '3']).optional().describe('Scan pass (kept for API compatibility)'),
      focus: z.string().optional().describe('Specific area to focus on (kept for API compatibility)'),
    }))
    .mutation(async () => {
      const result = await runSelfAudit();
      return {
        varredura: '1',
        report: formatAuditReport(result),
        timestamp: result.timestamp,
        knowledgeUsed: result.checks.length,
        // v67.9: also return structured data
        structured: result,
      };
    }),

  /**
   * Get audit history from audit_log table
   * v67.9: Now actually reads from the database
   */
  getHistory: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { audits: [], totalRuns: 0 };
    
    try {
      const history = await db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt))
        .limit(20);
      
      const selfAudits = history.filter(h => h.action === 'self_audit_completed');
      
      return {
        audits: selfAudits.map(a => ({
          id: a.id,
          timestamp: a.createdAt,
          details: a.details ? JSON.parse(a.details) : null,
        })),
        totalRuns: selfAudits.length,
      };
    } catch (e) {
      return { audits: [], totalRuns: 0 };
    }
  }),

  /**
   * Quick health check — lightweight version of the full audit
   * Returns just the overall health status without running all checks
   */
  quickHealth: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { status: 'critical', message: 'Database unavailable' };
    
    try {
      const knowledgeResult = await db.execute('SELECT COUNT(*) as count FROM knowledge');
      const count = (knowledgeResult as any)[0]?.[0]?.count ?? 0;
      
      const chunksResult = await db.execute(
        'SELECT COUNT(*) as count FROM paper_chunks WHERE embedding IS NOT NULL'
      );
      const chunks = (chunksResult as any)[0]?.[0]?.count ?? 0;
      
      return {
        status: count > 50 && chunks > 500 ? 'healthy' : count > 20 ? 'degraded' : 'critical',
        knowledge_count: count,
        chunks_with_embeddings: chunks,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return { status: 'critical', message: String(e) };
    }
  }),
});

/**
 * Format audit result as human-readable report
 */
function formatAuditReport(result: Awaited<ReturnType<typeof runSelfAudit>>): string {
  const statusEmoji: Record<string, string> = { pass: '✅', warn: '⚠️', fail: '❌' };
  const healthEmoji: Record<string, string> = { healthy: '🟢', degraded: '🟡', critical: '🔴' };
  
  let report = `# MOTHER Self-Audit Report\n`;
  report += `**Version:** ${result.version}\n`;
  report += `**Timestamp:** ${result.timestamp}\n`;
  report += `**Overall Health:** ${healthEmoji[result.overallHealth]} ${result.overallHealth.toUpperCase()} (${result.score}/100)\n\n`;
  
  report += `## Checks\n\n`;
  for (const check of result.checks) {
    report += `### ${statusEmoji[check.status]} ${check.name}\n`;
    report += `- **Score:** ${check.score}/100\n`;
    report += `- **Status:** ${check.status.toUpperCase()}\n`;
    report += `- **Details:** ${check.details}\n\n`;
  }
  
  if (result.recommendations.length > 0) {
    report += `## Recommendations\n\n`;
    for (const rec of result.recommendations) {
      report += `- ${rec}\n`;
    }
  }
  
  return report;
}
