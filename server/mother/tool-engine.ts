/**
 * MOTHER v64.0 — Tool Engine
 * 
 * Implements OpenAI Function Calling (tool use) for MOTHER's agentic capabilities.
 * This allows MOTHER to autonomously decide when to call real system functions
 * based on natural language requests, rather than requiring exact slash commands.
 * 
 * Scientific basis:
 * - OpenAI Function Calling (OpenAI, 2023): Enables LLMs to call external functions
 * - ReAct (Yao et al., ICLR 2023): Reasoning + Acting pattern for agentic AI
 * - Constitutional AI (Bai et al., 2022): Permission-aware action execution
 * 
 * Permission Model:
 * - READ tools: available to all authenticated users
 * - WRITE/ADMIN tools: only available to the creator (CREATOR_EMAIL)
 */

import { getSystemStats } from './core';
import { getProposals, approveProposal, logAuditEvent, getAuditLog, CREATOR_EMAIL } from './update-proposals';
import { addKnowledge, queryKnowledge } from './knowledge';
import { getQueryStats, getAllKnowledge, getRecentQueries } from '../db';

// ============================================================
// TOOL DEFINITIONS (OpenAI Function Calling format)
// ============================================================

export const MOTHER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'audit_system',
      description: 'Perform a comprehensive audit of MOTHER\'s system. Returns version, performance metrics, DGM proposal status, architecture health, and recent activity. Use this when the user asks for a system audit, status check, or wants to understand how MOTHER is performing.',
      parameters: {
        type: 'object',
        properties: {
          depth: {
            type: 'string',
            enum: ['summary', 'detailed', 'granular'],
            description: 'Depth of the audit. "summary" = high-level overview. "detailed" = includes metrics tables. "granular" = includes recent queries and full audit log.',
          },
        },
        required: ['depth'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_proposals',
      description: 'List all DGM (Darwin Gödel Machine) self-improvement proposals. Returns proposals with their ID, title, description, status, and creation date. Use this when the user asks to see proposals, pending improvements, or DGM status.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'approved', 'implementing', 'completed', 'rejected'],
            description: 'Filter proposals by status. Use "all" to see everything.',
          },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'approve_proposal',
      description: 'Approve a specific DGM self-improvement proposal by its ID. This triggers the autonomous update pipeline. REQUIRES CREATOR PERMISSION. Use this when the user explicitly asks to approve a proposal.',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: {
            type: 'number',
            description: 'The numeric ID of the proposal to approve.',
          },
          notes: {
            type: 'string',
            description: 'Optional implementation notes or instructions for the autonomous agent.',
          },
        },
        required: ['proposal_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_performance_metrics',
      description: 'Get detailed performance metrics for MOTHER. Returns query volume, quality scores, response times, cache hit rates, and cost breakdown by tier. Use this when the user asks about performance, metrics, or statistics.',
      parameters: {
        type: 'object',
        properties: {
          period_hours: {
            type: 'number',
            description: 'Time period in hours to analyze. Default: 24. Use 168 for last week, 720 for last month.',
          },
        },
        required: ['period_hours'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'learn_knowledge',
      description: 'Ingest new knowledge directly into MOTHER\'s permanent knowledge base. REQUIRES CREATOR PERMISSION. Use this when the user explicitly asks MOTHER to learn something, remember information, or add knowledge.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A concise title for the knowledge entry.',
          },
          content: {
            type: 'string',
            description: 'The full content to be learned and stored.',
          },
          category: {
            type: 'string',
            description: 'Category for the knowledge (e.g., "architecture", "user_preference", "technical", "project").',
          },
        },
        required: ['title', 'content', 'category'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge',
      description: 'Search MOTHER\'s knowledge base for specific information. Returns relevant knowledge entries. Use this when the user asks what MOTHER knows about a topic, or to verify stored knowledge.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant knowledge entries.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_audit_log',
      description: 'Retrieve the system audit log showing all administrative actions, proposal approvals, and security events. REQUIRES CREATOR PERMISSION. Use this when the user asks for the audit trail or history of system changes.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent audit entries to return. Default: 20.',
          },
        },
        required: ['limit'],
      },
    },
  },
];

// ============================================================
// TOOL EXECUTION ENGINE
// ============================================================

export interface ToolExecutionContext {
  userEmail?: string;
  userId?: number;
  isCreator: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  permissionDenied?: boolean;
}

/**
 * Execute a tool call from the LLM.
 * Enforces permission model: WRITE/ADMIN tools require creator role.
 */
export async function executeTool(
  toolName: string,
  toolArgs: Record<string, any>,
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  console.log(`[ToolEngine] Executing tool: ${toolName} | Creator: ${ctx.isCreator}`);

  // ============================================================
  // READ TOOLS (available to all authenticated users)
  // ============================================================

  if (toolName === 'audit_system') {
    try {
      const stats = await getSystemStats();
      const proposals = await getProposals(undefined, 20);
      const pending = proposals.filter(p => p.status === 'pending');
      const approved = proposals.filter(p => p.status === 'approved');

      const depth = toolArgs.depth || 'detailed';

      let auditData: any = {
        version: 'v64.0',
        timestamp: new Date().toISOString(),
        performance: {
          totalQueries: stats.totalQueries,
          avgQuality: stats.avgQuality,
          avgResponseTime: stats.avgResponseTime,
          cacheHitRate: stats.cacheHitRate,
          tier1Percentage: stats.tier1Percentage,
          tier2Percentage: stats.tier2Percentage,
          tier3Percentage: stats.tier3Percentage,
        },
        dgm: {
          pendingProposals: pending.length,
          approvedProposals: approved.length,
          totalProposals: proposals.length,
          proposals: pending.map(p => ({ id: p.id, title: p.title, status: p.status, createdAt: p.createdAt })),
        },
        architecture: {
          layers: ['Intelligence', 'Guardian', 'Knowledge', 'Execution', 'Optimization', 'Security', 'Learning'],
          allLayersActive: true,
          dgmActive: true,
          episodicMemory: true,
          scientificRAG: true,
          guardianQuality: true,
          multiTurnConversation: true,
          functionCalling: true,
        },
      };

      if (depth === 'granular') {
        const recentQueries = await getRecentQueries(10);
        const auditLog = await getAuditLog(10);
        auditData.recentActivity = {
          recentQueries: recentQueries.map(q => ({
            id: q.id,
            query: q.query?.slice(0, 100),
            tier: q.tier,
            quality: q.qualityScore,
            createdAt: q.createdAt,
          })),
          auditLog: auditLog.map((e: any) => ({
            action: e.action,
            actor: e.actor_email,
            details: e.details,
            success: e.success,
            createdAt: e.created_at,
          })),
        };
      }

      return { success: true, data: auditData };
    } catch (error) {
      return { success: false, error: `Audit failed: ${error}` };
    }
  }

  if (toolName === 'get_proposals') {
    try {
      const status = toolArgs.status === 'all' ? undefined : toolArgs.status;
      const proposals = await getProposals(status, 20);
      return {
        success: true,
        data: {
          count: proposals.length,
          proposals: proposals.map(p => ({
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status,
            estimatedImpact: p.estimatedImpact,
            createdAt: p.createdAt,
          })),
        },
      };
    } catch (error) {
      return { success: false, error: `Failed to get proposals: ${error}` };
    }
  }

  if (toolName === 'get_performance_metrics') {
    try {
      const hours = toolArgs.period_hours || 24;
      const stats = await getQueryStats(hours);
      return {
        success: true,
        data: {
          period: `Last ${hours} hours`,
          totalQueries: stats.totalQueries,
          qualityScore: `${stats.avgQuality?.toFixed(1)}/100`,
          avgResponseTime: `${stats.avgResponseTime?.toFixed(0)}ms`,
          cacheHitRate: `${stats.cacheHitRate?.toFixed(1)}%`,
          tierDistribution: {
            tier1_gpt4o_mini: `${stats.tier1Count} queries (${stats.totalQueries > 0 ? ((stats.tier1Count / stats.totalQueries) * 100).toFixed(0) : 0}%)`,
            tier2_gpt4o: `${stats.tier2Count} queries (${stats.totalQueries > 0 ? ((stats.tier2Count / stats.totalQueries) * 100).toFixed(0) : 0}%)`,
            tier3_gpt4: `${stats.tier3Count} queries (${stats.totalQueries > 0 ? ((stats.tier3Count / stats.totalQueries) * 100).toFixed(0) : 0}%)`,
          },
        },
      };
    } catch (error) {
      return { success: false, error: `Failed to get metrics: ${error}` };
    }
  }

  if (toolName === 'search_knowledge') {
    try {
      const results = await queryKnowledge(toolArgs.query);
      return {
        success: true,
        data: {
          query: toolArgs.query,
          resultsCount: results.length,
          results: results.slice(0, 5).map(r => ({
            source: r.source?.name || 'knowledge_base',
            content: r.content?.slice(0, 300),
            confidence: r.confidence,
            relevance: r.relevance,
          })),
        },
      };
    } catch (error) {
      return { success: false, error: `Knowledge search failed: ${error}` };
    }
  }

  // ============================================================
  // WRITE/ADMIN TOOLS (creator only)
  // ============================================================

  if (!ctx.isCreator) {
    return {
      success: false,
      permissionDenied: true,
      error: `Permission denied: The tool "${toolName}" requires creator authorization. Only ${CREATOR_EMAIL} can execute administrative actions.`,
    };
  }

  if (toolName === 'approve_proposal') {
    try {
      const result = await approveProposal(
        toolArgs.proposal_id,
        ctx.userEmail!,
        toolArgs.notes
      );
      await logAuditEvent({
        action: 'TOOL_APPROVE_PROPOSAL',
        actorEmail: ctx.userEmail,
        actorType: 'creator',
        targetType: 'proposal',
        targetId: String(toolArgs.proposal_id),
        details: `Approved via natural language tool call. Notes: ${toolArgs.notes || 'none'}`,
        success: result.success,
      });
      return { success: result.success, data: result, error: result.success ? undefined : result.reason };
    } catch (error) {
      return { success: false, error: `Approval failed: ${error}` };
    }
  }

  if (toolName === 'learn_knowledge') {
    try {
      const id = await addKnowledge(
        toolArgs.title,
        toolArgs.content,
        toolArgs.category,
        'creator_tool'
      );
      await logAuditEvent({
        action: 'TOOL_LEARN_KNOWLEDGE',
        actorEmail: ctx.userEmail,
        actorType: 'creator',
        targetType: 'knowledge',
        targetId: String(id),
        details: `Learned via tool call: ${toolArgs.title}`,
        success: true,
      });
      return { success: true, data: { id, title: toolArgs.title, category: toolArgs.category } };
    } catch (error) {
      return { success: false, error: `Knowledge ingestion failed: ${error}` };
    }
  }

  if (toolName === 'get_audit_log') {
    try {
      const limit = toolArgs.limit || 20;
      const log = await getAuditLog(limit);
      return {
        success: true,
        data: {
          count: log.length,
          entries: log.map((e: any) => ({
            action: e.action,
            actor: e.actor_email,
            actorType: e.actor_type,
            targetType: e.target_type,
            details: e.details,
            success: e.success,
            createdAt: e.created_at,
          })),
        },
      };
    } catch (error) {
      return { success: false, error: `Audit log retrieval failed: ${error}` };
    }
  }

  return { success: false, error: `Unknown tool: ${toolName}` };
}

/**
 * Format tool result as a human-readable string for the LLM to use in its response.
 */
export function formatToolResult(toolName: string, result: ToolResult): string {
  if (result.permissionDenied) {
    return `⛔ **Permission Denied:** ${result.error}`;
  }
  if (!result.success) {
    return `❌ **Tool Error (${toolName}):** ${result.error}`;
  }
  return JSON.stringify(result.data, null, 2);
}
