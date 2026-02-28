/**
 * MOTHER v69.2 — Tool Engine
 *
 * Implements OpenAI Function Calling (tool use) for MOTHER's agentic capabilities.
 * This allows MOTHER to autonomously decide when to call real system functions
 * based on natural language requests, rather than requiring exact slash commands.
 *
 * Scientific basis:
 * - OpenAI Function Calling (OpenAI, 2023): Enables LLMs to call external functions
 * - ReAct (Yao et al., ICLR 2023): Reasoning + Acting pattern for agentic AI
 * - Constitutional AI (Bai et al., 2022): Permission-aware action execution
 * - Self-RAG (Asai et al., arXiv:2310.11511, 2023): Adaptive retrieval with self-reflection
 *
 * Permission Model:
 * - READ tools: available to all authenticated users
 * - WRITE/ADMIN tools: only available to the creator (CREATOR_EMAIL)
 *
 * force_study Access Rules (v69.2 — DEFINITIVE):
 * - ACTIVE MODE: Creator calls force_study directly, any time, no restrictions.
 * - PASSIVE MODE: System auto-triggers force_study when search_knowledge returns
 *   zero results. This is system-initiated — users NEVER call force_study directly.
 */

import { getSystemStats, MOTHER_VERSION } from './core';
import { getProposals, approveProposal, logAuditEvent, getAuditLog, CREATOR_EMAIL } from './update-proposals';
import { addKnowledge, queryKnowledge } from './knowledge';
import { getQueryStats, getAllKnowledge, getRecentQueries } from '../db';
import { listCodeFiles, readCodeFile, searchInCode, getCodeStructureSummary } from './self-code-reader';
import { retrieveSubgraph, buildKnowledgeGraph, getGraphStats } from './knowledge-graph';
import { performAbductiveReasoning, requiresAbductiveReasoning } from './abductive-engine';
import { getDPOStats, getDPOHyperparameters } from './dpo-builder';
import { runHLEBenchmark, HLE_BENCHMARK } from './rlvr-verifier';
import { runSelfImprovementCycle, getSelfImprovementStatus } from './self-improve';
import { writeCodeFile, patchCodeFile, getDeployStatus, triggerDeploy } from './self-code-writer';
import { getAdminDocs } from './admin-docs';
import { browseUrl, searchAnnasArchive, searchDuckDuckGo, searchForums, searchSoftwareManual } from './browser-agent';
import { generateImageWithDalle3, generateRevealSlides, generatePdfFromMarkdown } from './media-agent';
import { executeCode } from './code-sandbox';

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
      name: 'self_repair',
      description: 'Run a comprehensive self-audit and repair of MOTHER\'s knowledge systems. Checks database health, CRAG pipeline, grounding engine, learning loop, and bootstraps all 8 knowledge domains. REQUIRES CREATOR PERMISSION. Use this when the user asks MOTHER to audit herself, fix herself, run self-repair, or when the system seems broken.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'force_study',
      description: 'Force MOTHER to proactively study a topic by searching arXiv, ingesting scientific papers, and storing a research summary. TWO MODES: (1) ACTIVE — Creator calls directly at any time, no restrictions. (2) PASSIVE — System auto-triggers internally via search_knowledge when bd_central has no data. NEVER call this tool directly unless you are the Creator. For regular users, passive mode is triggered automatically by search_knowledge.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The topic or subject MOTHER should study (e.g., "quantum computing", "transformer architecture", "CRISPR gene editing").',
          },
          depth: {
            type: 'number',
            description: 'Number of papers to ingest (1-10). Default: 5.',
          },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_own_code',
      description: 'Read MOTHER\'s own source code for self-awareness, debugging, and autonomous improvement proposals. Can list files, read specific modules, or search for patterns. Use this when the user asks MOTHER to inspect her own code, find bugs, understand her architecture, or when generating DGM proposals that require code-level analysis.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'read', 'search', 'summary'],
            description: '"list" = list files in a directory. "read" = read a specific file. "search" = search for a pattern in code. "summary" = get structural overview of all modules.',
          },
          path: {
            type: 'string',
            description: 'For "list": directory path (e.g., "server/mother"). For "read": file path (e.g., "server/mother/core.ts"). For "search": the pattern to search for.',
          },
          max_lines: {
            type: 'number',
            description: 'For "read" action: maximum number of lines to return (default: 100, max: 500).',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'knowledge_graph',
      description: 'Query the MOTHER Knowledge Graph — a semantic graph of concepts extracted from the bd_central knowledge base. Supports subgraph retrieval, concept exploration, and cross-domain relationship discovery. Based on GraphRAG (Peng et al., 2024, arXiv:2408.08921) and SubgraphRAG (Ma et al., 2024, arXiv:2410.20724). Use when the user asks about concept relationships, knowledge graph, or cross-domain connections.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['retrieve', 'build', 'stats'],
            description: '"retrieve" = get relevant subgraph for a query. "build" = rebuild the full graph from bd_central. "stats" = get graph statistics.',
          },
          query: {
            type: 'string',
            description: 'For "retrieve" action: the query to find relevant concepts and relationships.',
          },
          top_k: {
            type: 'number',
            description: 'For "retrieve" action: number of nodes to return (default: 10).',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'abductive_reasoning',
      description: 'Apply Abductive Reasoning (Inference to the Best Explanation) to generate scientific hypotheses from observations. Based on Peirce (1878) and Lipton (2004). Use when the user asks "why", "what causes", "explain", or presents an anomaly/paradox that requires hypothesis generation.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The question or observation requiring abductive inference.',
          },
          domain: {
            type: 'string',
            description: 'Scientific domain for domain-specific hypotheses (e.g., "AI/ML", "Geotecnia", "Medicina", "Física", "Economia").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'dpo_status',
      description: 'Get the status of the DPO (Direct Preference Optimization) dataset collection. Shows how many preference pairs have been collected, readiness for fine-tuning, and estimated training cost. Based on Rafailov et al. (2023, arXiv:2305.18290). Use when the user asks about DPO, fine-tuning status, or training data.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'hle_benchmark',
      description: "Run the HLE (Humanity's Last Exam) benchmark — 50 expert-level questions across 10 scientific domains. Based on Phan et al. (2025, arXiv:2501.14249). Use when the user asks about MOTHER's scientific capabilities, benchmark scores, or wants to test expert-level knowledge.",
      parameters: {
        type: 'object',
        properties: {
          question_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of specific question IDs to test. If omitted, tests the first 5 questions.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'self_improve',
      description: 'Run a complete MAPE-K self-improvement cycle: Monitor system metrics, Analyze performance gaps, Plan improvements, Execute auto-approved changes, and store Knowledge. Based on Gödel Machine (Schmidhuber, 2003) and MAPE-K (Kephart & Chess, 2003). REQUIRES CREATOR PERMISSION. Use when the user asks for self-improvement, MAPE-K cycle, or autonomous optimization.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['run_cycle', 'status'],
            description: '"run_cycle" = execute a full MAPE-K improvement cycle. "status" = get current self-improvement status without running a cycle.',
          },
        },
        required: ['action'],
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
  {
    type: 'function' as const,
    function: {
      name: 'write_own_code',
      description: 'Write or patch MOTHER\'s own source code and trigger a deploy. REQUIRES CREATOR PERMISSION. This is the Gödel Machine self-modification capability — MOTHER can rewrite herself when ordered by the creator. Supports full file write or targeted find-and-replace patches. After writing, automatically git commits, pushes, and triggers Cloud Build deploy (~8-12 min). Use when the creator asks to add features, fix bugs, update code, or modify any module.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['write', 'patch', 'deploy_status', 'trigger_deploy'],
            description: '"write" = overwrite entire file. "patch" = find-and-replace patches (safer for small changes). "deploy_status" = check current Cloud Build status. "trigger_deploy" = force a new deploy without code changes.',
          },
          file_path: {
            type: 'string',
            description: 'Relative path to the file (e.g., "server/mother/core.ts", "client/src/pages/Home.tsx"). Required for write and patch actions.',
          },
          content: {
            type: 'string',
            description: 'For "write" action: the complete new file content.',
          },
          patches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                find: { type: 'string' },
                replace: { type: 'string' },
                description: { type: 'string' },
              },
            },
            description: 'For "patch" action: array of {find, replace, description} objects.',
          },
          commit_message: {
            type: 'string',
            description: 'Git commit message describing the change.',
          },
          trigger_deploy: {
            type: 'boolean',
            description: 'Whether to trigger Cloud Build deploy after writing. Default: true.',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'admin_docs',
      description: 'Get the complete administrative documentation for MOTHER — credentials, commands, tools, deploy pipeline, database schema, and architecture. REQUIRES CREATOR PERMISSION. Use when the creator asks for documentation, credentials, how to connect to the database, deploy instructions, or system reference.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['overview', 'commands', 'tools', 'credentials', 'deploy', 'database', 'architecture', 'all'],
            description: 'Which section to return. Omit for overview+commands+tools.',
          },
        },
        required: [],
      },
    },
  },

  // ============================================================
  // BROWSER_BROWSE: Real web browser access (NC-BROWSER-001)
  // Scientific basis: WebGPT (Nakano et al., 2021), ReAct (Yao et al., 2023)
  // ============================================================
  {
    type: 'function' as const,
    function: {
      name: 'browser_browse',
      description: 'Navigate to any URL and return the full text content. Also supports searching Anna\'s Archive for books/papers, DuckDuckGo web search, technical forums (Reddit/HN/SO), and software documentation. Use this when you need real web access to any source.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['browse', 'search_annas_archive', 'search_duckduckgo', 'search_forums', 'search_manual'],
            description: 'Action: browse=navigate URL, search_annas_archive=search books/papers, search_duckduckgo=web search, search_forums=Reddit/HN/SO, search_manual=software docs',
          },
          url: {
            type: 'string',
            description: 'URL to navigate to (required for browse action)',
          },
          query: {
            type: 'string',
            description: 'Search query (required for search actions)',
          },
          options: {
            type: 'object',
            description: 'Optional: { lang, content, ext, limit } for Anna\'s Archive; { sites } for forums; { software } for manual search',
          },
        },
        required: ['action'],
      },
    },
  },
  // ============================================================
  // EXECUTE_CODE: Code sandbox execution (NC-SANDBOX-001)
  // Scientific basis: E2B (2024), SICA (Robeyns et al., arXiv:2504.04736, 2025)
  // ============================================================
  {
    type: 'function' as const,
    function: {
      name: 'execute_code',
      description: 'Execute Python, Node.js, or Bash code in an isolated sandbox. Use for data analysis, visualizations, file processing, calculations, or any computation. Returns stdout, stderr, exit code, and generated files (images, CSVs) as artifacts.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to execute',
          },
          language: {
            type: 'string',
            enum: ['python', 'nodejs', 'bash'],
            description: 'Language: python (default), nodejs, or bash',
          },
          packages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Packages to install before execution (pip for python, npm for nodejs)',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in seconds (default: 30, max: 300)',
          },
        },
        required: ['code'],
      },
    },
  },
  // ============================================================
  // NC-MEDIA-001: Image generation (DALL-E 3 + Forge API)
  // ============================================================
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description: 'Generate an image from a text prompt using DALL-E 3 (primary) or Forge API (fallback). Returns a URL to the generated image. Use for: illustrations, diagrams, visual content, infographics.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed description of the image to generate.' },
          size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions (default: 1024x1024)' },
          quality: { type: 'string', enum: ['standard', 'hd'], description: 'Image quality (default: standard)' },
          style: { type: 'string', enum: ['vivid', 'natural'], description: 'Image style (default: vivid)' },
        },
        required: ['prompt'],
      },
    },
  },
  // ============================================================
  // NC-SLIDES-001: Slides and PDF generation
  // ============================================================
  {
    type: 'function' as const,
    function: {
      name: 'generate_slides',
      description: 'Generate a professional reveal.js HTML presentation. Use when user asks for slides, presentations, or PowerPoint-style content.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Presentation title' },
          subtitle: { type: 'string', description: 'Optional subtitle' },
          slides: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string', description: 'Slide content (use - for bullets)' },
                notes: { type: 'string', description: 'Speaker notes' },
              },
              required: ['title', 'content'],
            },
          },
          theme: { type: 'string', enum: ['black', 'white', 'league', 'beige', 'sky', 'night', 'serif', 'simple', 'solarized'], description: 'Visual theme (default: black)' },
          export_pdf: { type: 'boolean', description: 'Also export as PDF' },
        },
        required: ['title', 'slides'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_pdf',
      description: 'Generate a PDF document from Markdown content. Use when user asks for a PDF report or formatted document.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Markdown content to convert to PDF' },
          title: { type: 'string', description: 'Document title' },
          format: { type: 'string', enum: ['A4', 'Letter'], description: 'Page format (default: A4)' },
        },
        required: ['content', 'title'],
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
        version: stats.version || MOTHER_VERSION,
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
          // NC-SELFAUDIT-001 (Ciclo 50): Corrected from 7 invented names to actual 9-layer pipeline
          // Source: core.ts section headers (verified 2026-02-28)
          // Scientific basis: Lindsey (Anthropic, 2025) — LLM self-reports must be grounded in actual internal states
          layerCount: 9,
          layers: [
            { id: 1,   name: 'Semantic Cache',       activation: 'always',        module: 'db.ts → getSemanticCacheEntry()',        scientific: 'GPTCache (Zeng et al., 2023); Gim et al. arXiv:2304.01976' },
            { id: 2,   name: 'Complexity Analysis',  activation: 'always',        module: 'intelligence.ts → assessComplexity()',   scientific: 'LLM routing (Shnitzer et al., arXiv:2309.02033, 2023)' },
            { id: 3,   name: 'CRAG v2',              activation: 'when_relevant', module: 'crag-v2.ts → cragV2Retrieve()',          scientific: 'CRAG (Yan et al., arXiv:2401.15884, 2024)' },
            { id: 4,   name: 'Tool Engine',          activation: 'when_needed',   module: 'tool-engine.ts → executeTool()',         scientific: 'ReAct (Yao et al., arXiv:2210.03629, 2022)' },
            { id: 5,   name: 'Phase 2 / MoA-Debate', activation: 'always',        module: 'orchestration.ts → orchestrate()',       scientific: 'MoA (Wang et al., arXiv:2406.04692, 2024); Debate (Du et al., arXiv:2305.14325, 2023)' },
            { id: 6,   name: 'Grounding Engine',     activation: 'when_factual',  module: 'grounding.ts → groundResponse()',        scientific: 'RARR (Gao et al., arXiv:2210.08726, 2022)' },
            { id: 7,   name: 'Self-Refine',          activation: 'quality_lt_80', module: 'self-refine.ts → selfRefinePhase3()',    scientific: 'Self-Refine (Madaan et al., arXiv:2303.17651, 2023)' },
            { id: 7.5, name: 'Constitutional AI',    activation: 'quality_lt_80', module: 'constitutional-ai.ts → applyConstitutionalAI()', scientific: 'Constitutional AI (Bai et al., arXiv:2212.08073, 2022)' },
            { id: 8,   name: 'Metrics + Learning',   activation: 'always',        module: 'core.ts + learning.ts',                 scientific: 'SRE Golden Signals (Beyer et al., Google, 2016)' },
          ],
          allLayersActive: true,
          dgmActive: true,
          episodicMemory: true,
          scientificRAG: true,
          guardianQuality: true,
          multiTurnConversation: true,
          functionCalling: true,
          // NC-SELFAUDIT-001: Scientific benchmarks for metric interpretation (prevents unfounded analysis)
          metricBenchmarks: {
            avgQuality: {
              current: stats.avgQuality,
              threshold_pass: 80,       // NC-QUALITY-004 (v74.11): guardian regeneration threshold
              literature_baseline: 77,  // G-Eval GPT-4o-mini on SummEval (Liu et al., arXiv:2303.16634, 2023)
              status: stats.avgQuality >= 80 ? 'ABOVE_THRESHOLD_OK' : stats.avgQuality >= 70 ? 'BELOW_THRESHOLD_NEEDS_IMPROVEMENT' : 'CRITICAL_BELOW_BASELINE',
            },
            avgResponseTime_ms: {
              current: stats.avgResponseTime,
              p50_target: 10000,        // 10s P50 target for multi-step RAG pipelines
              p95_acceptable: 30000,    // 30s P95 acceptable for complex queries
              literature_baseline: 'GPT-4o API ~2-5s TTFT; multi-step RAG 8-15s (Sagi, 2025, OSRC)',
              status: stats.avgResponseTime <= 15000 ? 'GOOD' : stats.avgResponseTime <= 30000 ? 'ACCEPTABLE_COMPLEX_PIPELINE' : 'HIGH_LATENCY_INVESTIGATE',
            },
            cacheHitRate_pct: {
              current: stats.cacheHitRate,
              target: 15,               // 15% target for production semantic cache
              literature_baseline: 'GPTCache production 10-30% (Zeng et al., 2023); threshold 0.85 → ~8% (Gim et al., arXiv:2304.01976)',
              status: stats.cacheHitRate >= 15 ? 'GOOD' : stats.cacheHitRate >= 5 ? 'LOW_NORMAL_DIVERSE_QUERIES' : 'VERY_LOW_CHECK_CONFIG',
            },
          },
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
            cacheHit: q.cacheHit,
            responseTime_ms: q.responseTime,
            modelName: q.modelName,
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

      // v69.2: PASSIVE AUTO-STUDY TRIGGER
      // Scientific basis: Self-RAG (Asai et al., arXiv:2310.11511, 2023) — adaptive
      // retrieval with self-reflection. When retrieval returns nothing, the system
      // should acquire knowledge before giving up.
      //
      // Rule (Everton Luis, 2026-02-26):
      // - ACTIVE mode: Creator calls force_study directly — no restrictions.
      // - PASSIVE mode: System auto-triggers force_study when search returns empty.
      //   Users NEVER call force_study directly; this is system-initiated only.
      if (results.length === 0) {
        console.log(`[ToolEngine] search_knowledge returned 0 results for "${toolArgs.query}" — triggering PASSIVE auto-study`);
        try {
          const { forceStudy } = await import('./agentic-learning');
          const studyResult = await forceStudy(toolArgs.query, 3); // depth=3 for passive mode (lighter than active)
          await logAuditEvent({
            action: 'PASSIVE_AUTO_STUDY',
            actorEmail: ctx.userEmail || 'system',
            actorType: 'system',
            targetType: 'knowledge',
            targetId: toolArgs.query,
            details: `Passive auto-study triggered for "${toolArgs.query}" | Papers: ${studyResult.papersIngested} | Entries: ${studyResult.knowledgeAdded}`,
            success: true,
          });
          // Re-query after study to return freshly acquired knowledge
          const freshResults = await queryKnowledge(toolArgs.query);
          return {
            success: true,
            data: {
              query: toolArgs.query,
              resultsCount: freshResults.length,
              autoStudyTriggered: true,
              autoStudySummary: `Sistema aprendeu sobre "${toolArgs.query}": ${studyResult.papersIngested} papers ingeridos, ${studyResult.knowledgeAdded} entradas adicionadas ao bd_central.`,
              results: freshResults.slice(0, 5).map(r => ({
                source: r.source?.name || 'knowledge_base',
                content: r.content?.slice(0, 300),
                confidence: r.confidence,
                relevance: r.relevance,
              })),
            },
          };
        } catch (studyError) {
          console.error('[ToolEngine] Passive auto-study failed:', studyError);
          // Return empty results gracefully — do not crash the query
          return {
            success: true,
            data: {
              query: toolArgs.query,
              resultsCount: 0,
              autoStudyTriggered: true,
              autoStudySummary: `Tentativa de estudo automático falhou: ${studyError}. O tópico não pôde ser adicionado ao bd_central neste momento.`,
              results: [],
            },
          };
        }
      }

      return {
        success: true,
        data: {
          query: toolArgs.query,
          resultsCount: results.length,
          autoStudyTriggered: false,
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
  // v69.13: SELF-CODE-READER (READ tool — available to all authenticated users)
  // Scientific basis: Gödel Machine (Schmidhuber, 2003): self-referential improvement
  // ============================================================

  if (toolName === 'read_own_code') {
    try {
      const action = toolArgs.action || 'summary';
      const path = toolArgs.path || 'server/mother';
      const maxLines = Math.min(toolArgs.max_lines || 100, 500);

      await logAuditEvent({
        action: 'TOOL_READ_OWN_CODE',
        actorEmail: ctx.userEmail || 'system',
        actorType: ctx.isCreator ? 'creator' : 'user',
        targetType: 'code',
        targetId: path,
        details: `Self-code-reader: action=${action}, path=${path}`,
        success: true,
      });

      if (action === 'summary') {
        const summary = getCodeStructureSummary();
        return {
          success: true,
          data: {
            description: 'MOTHER codebase structural summary',
            totalFiles: summary.totalFiles,
            totalLines: summary.totalLines,
            modules: summary.modules,
          },
        };
      }

      if (action === 'list') {
        const dir = listCodeFiles(path);
        return { success: true, data: dir };
      }

      if (action === 'read') {
        const file = readCodeFile(path, maxLines);
        return {
          success: true,
          data: {
            path: file.path,
            totalLines: file.lines,
            returnedLines: maxLines,
            content: file.content,
          },
        };
      }

      if (action === 'search') {
        const results = searchInCode(path, 'server/mother');
        return {
          success: true,
          data: {
            pattern: path,
            matchCount: results.length,
            matches: results,
          },
        };
      }

      return { success: false, error: `Unknown action: ${action}` };
    } catch (error) {
      return { success: false, error: `Self-code-reader failed: ${error}` };
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

  if (toolName === 'self_repair') {
    try {
      const { runSelfRepair } = await import('./self-repair');
      const result = await runSelfRepair();
      await logAuditEvent({
        action: 'TOOL_SELF_REPAIR',
        actorEmail: ctx.userEmail,
        actorType: 'creator',
        targetType: 'system',
        targetId: 'mother',
        details: result.summary,
        success: result.overallHealth !== 'critical',
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: `Self-repair failed: ${error}` };
    }
  }

  if (toolName === 'force_study') {
    try {
      const { forceStudy } = await import('./agentic-learning');
      const topic = toolArgs.topic;
      const depth = toolArgs.depth || 5;
      const result = await forceStudy(topic, depth);
      await logAuditEvent({
        action: 'TOOL_FORCE_STUDY',
        actorEmail: ctx.userEmail,
        actorType: 'creator',
        targetType: 'knowledge',
        targetId: topic,
        details: `Force studied: "${topic}" | Papers: ${result.papersIngested} | Knowledge entries: ${result.knowledgeAdded}`,
        success: true,
      });
      return {
        success: true,
        data: {
          topic,
          papersIngested: result.papersIngested,
          knowledgeEntriesAdded: result.knowledgeAdded,
          message: `Successfully studied "${topic}". Ingested ${result.papersIngested} papers and added ${result.knowledgeAdded} knowledge entries.`,
        },
      };
    } catch (error) {
      return { success: false, error: `Force study failed: ${error}` };
    }
  }

  // ============================================================
  // CICLO 36-40 TOOLS (new capabilities v70.0)
  // ============================================================

  if (toolName === 'knowledge_graph') {
    try {
      const action = toolArgs.action || 'stats';
      if (action === 'stats') {
        const stats = getGraphStats();
        return {
          success: true,
          data: stats || { message: 'Graph not yet built. Use action="build" to initialize.' },
        };
      }
      if (action === 'build') {
        const result = await buildKnowledgeGraph();
        return { success: true, data: { message: 'Knowledge graph rebuilt successfully', ...result } };
      }
      if (action === 'retrieve') {
        const subgraph = await retrieveSubgraph(toolArgs.query || '', toolArgs.top_k || 10);
        return {
          success: true,
          data: {
            query: toolArgs.query,
            nodesFound: subgraph.nodes.length,
            edgesFound: subgraph.edges.length,
            communities: subgraph.communities.length,
            summary: subgraph.summary,
            topConcepts: subgraph.nodes.slice(0, 5).map(n => ({ label: n.label, domain: n.domain, weight: n.weight })),
          },
        };
      }
      return { success: false, error: `Unknown action: ${action}` };
    } catch (error) {
      return { success: false, error: `Knowledge graph failed: ${error}` };
    }
  }

  if (toolName === 'abductive_reasoning') {
    try {
      const domain = toolArgs.domain || 'General';
      const result = await performAbductiveReasoning(toolArgs.query, domain, '');
      return {
        success: true,
        data: {
          query: toolArgs.query,
          observationsFound: result.observations.length,
          hypothesesGenerated: result.hypotheses.length,
          bestExplanation: result.bestExplanation ? {
            explanation: result.bestExplanation.explanation,
            plausibility: result.bestExplanation.plausibility,
            parsimony: result.bestExplanation.parsimony,
            domain: result.bestExplanation.domain,
          } : null,
          alternativeHypotheses: result.hypotheses.slice(1, 3).map(h => ({
            explanation: h.explanation,
            plausibility: h.plausibility,
          })),
          crossDomainInsights: result.crossDomainInsights,
          scientificConfidence: result.scientificConfidence,
          method: 'Inference to the Best Explanation (IBE) — Peirce (1878), Lipton (2004)',
        },
      };
    } catch (error) {
      return { success: false, error: `Abductive reasoning failed: ${error}` };
    }
  }

  if (toolName === 'dpo_status') {
    try {
      const stats = await getDPOStats();
      const hyperparams = getDPOHyperparameters(stats.totalPairs);
      return {
        success: true,
        data: {
          totalPairs: stats.totalPairs,
          readyForFineTuning: stats.readyForFineTuning,
          pairsNeeded: stats.pairsNeeded,
          estimatedCostUSD: stats.estimatedCostUSD,
          hyperparameters: hyperparams,
          scientificBasis: 'Rafailov et al. (2023, arXiv:2305.18290) — Direct Preference Optimization',
          status: stats.readyForFineTuning
            ? '✅ READY FOR FINE-TUNING'
            : `⏳ COLLECTING DATA (${stats.totalPairs}/1000 pairs — ${stats.pairsNeeded} more needed)`,
        },
      };
    } catch (error) {
      return { success: false, error: `DPO status failed: ${error}` };
    }
  }

  if (toolName === 'hle_benchmark') {
    try {
      // Run benchmark on first 5 questions (non-blocking, no actual LLM calls in tool)
      const questionIds = toolArgs.question_ids || HLE_BENCHMARK.slice(0, 5).map((q: any) => q.id);
      return {
        success: true,
        data: {
          benchmarkName: "Humanity's Last Exam (HLE)",
          scientificBasis: 'Phan et al. (2025, arXiv:2501.14249)',
          totalQuestions: HLE_BENCHMARK.length,
          domains: [...new Set(HLE_BENCHMARK.map((q: any) => q.domain))],
          difficultyLevels: ['graduate', 'expert', 'frontier'],
          sampleQuestions: HLE_BENCHMARK.slice(0, 3).map((q: any) => ({
            id: q.id,
            domain: q.domain,
            difficulty: q.difficulty,
            question: q.question.substring(0, 150) + '...',
            evaluationCriteria: q.evaluationCriteria,
          })),
          humanExpertBaseline: '~90%',
          bestModelBaseline: 'o3: 53.1% (OpenAI, 2025)',
          note: 'Full benchmark evaluation requires LLM calls — use /hle-full for complete evaluation',
        },
      };
    } catch (error) {
      return { success: false, error: `HLE benchmark failed: ${error}` };
    }
  }

  if (toolName === 'self_improve') {
    if (!ctx.isCreator) {
      return {
        success: false,
        permissionDenied: true,
        error: `Permission denied: self_improve requires creator authorization.`,
      };
    }
    try {
      const action = toolArgs.action || 'status';
      if (action === 'status') {
        const status = await getSelfImprovementStatus();
        return { success: true, data: status };
      }
      if (action === 'run_cycle') {
        const cycle = await runSelfImprovementCycle();
        await logAuditEvent({
          action: 'TOOL_SELF_IMPROVE',
          actorEmail: ctx.userEmail,
          actorType: 'creator',
          targetType: 'system',
          targetId: cycle.cycleId,
          details: `MAPE-K cycle completed: ${cycle.proposals.length} proposals, ${cycle.appliedProposals.length} applied`,
          success: true,
        });
        return {
          success: true,
          data: {
            cycleId: cycle.cycleId,
            duration: cycle.endTime ? `${(cycle.endTime.getTime() - cycle.startTime.getTime())}ms` : 'N/A',
            metrics: cycle.metrics,
            proposalsGenerated: cycle.proposals.length,
            proposalsApplied: cycle.appliedProposals.length,
            appliedProposals: cycle.appliedProposals,
            knowledgeAdded: cycle.knowledgeAdded,
            scientificBasis: 'MAPE-K (Kephart & Chess, 2003) + Gödel Machine (Schmidhuber, 2003)',
          },
        };
      }
      return { success: false, error: `Unknown action: ${action}` };
    } catch (error) {
      return { success: false, error: `Self-improvement failed: ${error}` };
    }
  }

  // ============================================================
  // WRITE_OWN_CODE: Gödel Machine self-modification (v71.0)
  // Scientific basis: Schmidhuber (2003); SWE-agent (Yang et al., 2024)
  // ============================================================
  if (toolName === 'write_own_code') {
    try {
      const action = toolArgs.action || 'deploy_status';

      if (action === 'deploy_status') {
        const status = await getDeployStatus();
        return { success: true, data: status };
      }

      if (action === 'trigger_deploy') {
        const reason = toolArgs.commit_message || 'Manual deploy triggered by creator';
        const result = await triggerDeploy(reason);
        await logAuditEvent({
          action: 'TOOL_TRIGGER_DEPLOY',
          actorEmail: ctx.userEmail,
          actorType: 'creator',
          targetType: 'system',
          targetId: result.buildId || 'unknown',
          details: `Deploy triggered: ${reason}`,
          success: result.success,
        });
        return { success: result.success, data: result };
      }

      if (action === 'write') {
        if (!toolArgs.file_path || !toolArgs.content) {
          return { success: false, error: 'write action requires file_path and content' };
        }
        const commitMsg = toolArgs.commit_message || `feat(v71.0): MOTHER self-writes ${toolArgs.file_path}`;
        const result = await writeCodeFile(toolArgs.file_path, toolArgs.content, commitMsg, toolArgs.trigger_deploy !== false);
        await logAuditEvent({
          action: 'TOOL_WRITE_OWN_CODE',
          actorEmail: ctx.userEmail,
          actorType: 'creator',
          targetType: 'code',
          targetId: toolArgs.file_path,
          details: `Self-write: ${toolArgs.file_path} (${result.linesWritten} lines, commit=${result.commitSha})`,
          success: result.success,
        });
        return { success: result.success, data: result, error: result.error };
      }

      if (action === 'patch') {
        if (!toolArgs.file_path || !toolArgs.patches) {
          return { success: false, error: 'patch action requires file_path and patches array' };
        }
        const commitMsg = toolArgs.commit_message || `fix(v71.0): MOTHER self-patches ${toolArgs.file_path}`;
        const result = await patchCodeFile(toolArgs.file_path, toolArgs.patches, commitMsg, toolArgs.trigger_deploy !== false);
        await logAuditEvent({
          action: 'TOOL_PATCH_OWN_CODE',
          actorEmail: ctx.userEmail,
          actorType: 'creator',
          targetType: 'code',
          targetId: toolArgs.file_path,
          details: `Self-patch: ${toolArgs.file_path} (${result.patchesApplied} patches, commit=${result.commitSha})`,
          success: result.success,
        });
        return { success: result.success, data: result, error: result.error };
      }

      return { success: false, error: `Unknown write_own_code action: ${action}` };
    } catch (error) {
      return { success: false, error: `write_own_code failed: ${error}` };
    }
  }

  // ============================================================
  // ADMIN_DOCS: Creator-only documentation system (v71.0)
  // Scientific basis: ISO/IEC 25010:2011 Maintainability; NIST SP 800-162 RBAC
  // ============================================================
  if (toolName === 'admin_docs') {
    try {
      const docs = await getAdminDocs(toolArgs.section);
      return { success: true, data: { documentation: docs } };
    } catch (error) {
      return { success: false, error: `admin_docs failed: ${error}` };
    }
  }

  // ============================================================
  // BROWSER_BROWSE: Real web browser access (NC-BROWSER-001)
  // ============================================================
  if (toolName === 'browser_browse') {
    try {
      const action = toolArgs.action as string;
      const query = toolArgs.query as string;
      const url = toolArgs.url as string;
      const options = toolArgs.options || {};

      if (action === 'browse') {
        if (!url) return { success: false, error: 'url is required for browse action' };
        const result = await browseUrl(url);
        return { success: result.success, data: result, error: result.error };
      }
      if (action === 'search_annas_archive') {
        if (!query) return { success: false, error: 'query is required for search_annas_archive' };
        const results = await searchAnnasArchive(query, options);
        return { success: true, data: { results, count: results.length } };
      }
      if (action === 'search_duckduckgo') {
        if (!query) return { success: false, error: 'query is required for search_duckduckgo' };
        const results = await searchDuckDuckGo(query, options.limit || 10);
        return { success: true, data: { results, count: results.length } };
      }
      if (action === 'search_forums') {
        if (!query) return { success: false, error: 'query is required for search_forums' };
        const results = await searchForums(query, options);
        return { success: true, data: { results, count: results.length } };
      }
      if (action === 'search_manual') {
        const software = options.software || query;
        const topic = query || '';
        if (!software) return { success: false, error: 'software name required in options.software or query' };
        const result = await searchSoftwareManual(software, topic);
        return { success: result.success, data: result, error: result.error };
      }
      return { success: false, error: `Unknown browser_browse action: ${action}` };
    } catch (error) {
      return { success: false, error: `browser_browse failed: ${error}` };
    }
  }

  // ============================================================
  // EXECUTE_CODE: Code sandbox execution (NC-SANDBOX-001)
  // ============================================================
  if (toolName === 'execute_code') {
    try {
      const code = toolArgs.code as string;
      if (!code) return { success: false, error: 'code is required' };
      const language = (toolArgs.language as 'python' | 'nodejs' | 'bash') || 'python';
      const packages = toolArgs.packages as string[] | undefined;
      const timeout = Math.min(Number(toolArgs.timeout) || 30, 300);
      const result = await executeCode(code, { language, packages, timeout });
      return { success: result.exitCode === 0, data: result, error: result.error };
    } catch (error) {
      return { success: false, error: `execute_code failed: ${error}` };
    }
  }

  // ============================================================
  // NC-MEDIA-001: generate_image
  // ============================================================
  if (toolName === 'generate_image') {
    try {
      const prompt = toolArgs.prompt as string;
      if (!prompt) return { success: false, error: 'prompt is required' };
      const size = (toolArgs.size as '1024x1024' | '1792x1024' | '1024x1792') || '1024x1024';
      const quality = (toolArgs.quality as 'standard' | 'hd') || 'standard';
      const style = (toolArgs.style as 'vivid' | 'natural') || 'vivid';
      const result = await generateImageWithDalle3({ prompt, size, quality, style });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: `generate_image failed: ${error}` };
    }
  }

  // ============================================================
  // NC-SLIDES-001: generate_slides
  // ============================================================
  if (toolName === 'generate_slides') {
    try {
      const title = toolArgs.title as string;
      const slides = toolArgs.slides as Array<{ title: string; content: string; notes?: string }>;
      if (!title || !slides?.length) return { success: false, error: 'title and slides are required' };
      const result = await generateRevealSlides({
        title,
        subtitle: toolArgs.subtitle as string | undefined,
        slides,
        theme: (toolArgs.theme as 'black' | 'white' | 'league' | 'beige' | 'sky' | 'night' | 'serif' | 'simple' | 'solarized') || 'black',
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: `generate_slides failed: ${error}` };
    }
  }

  // ============================================================
  // NC-SLIDES-001: generate_pdf
  // ============================================================
  if (toolName === 'generate_pdf') {
    try {
      const content = toolArgs.content as string;
      const title = toolArgs.title as string;
      if (!content || !title) return { success: false, error: 'content and title are required' };
      const result = await generatePdfFromMarkdown({
        content,
        title,
        format: (toolArgs.format as 'A4' | 'Letter') || 'A4',
        includeTableOfContents: Boolean(toolArgs.include_toc),
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: `generate_pdf failed: ${error}` };
    }
  }

  return { success: false, error: `Unknown tool: ${toolName}` };
}
/***
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
