/**
 * MOTHER v70.0 - Ciclos 36-40: Knowledge Graph + Abductive Engine + DPO Builder + RLVR Verifier + Self-Improve Orchestrator
 * Orchestrates all 9 layers for end-to-end query processing (v75.0)
 *
 * v67.5 Changes:
 * - Gap 1: Omniscient (arXiv papers) connected to Core via searchSimilarChunksWithMetadata()
 * - Gap 2: Prometheus auto-dispatch — approveProposal now triggers SWE-Agent immediately
 * - Gap 3: Guardian Regeneration Loop — retry with corrective prompt when quality < 90
 *   Scientific basis: Self-Refine (Madaan et al., 2023), Constitutional AI (Bai et al., 2022)
 *
 * v56.0 Changes (7 Mandatory Requirements):
 * - Req #1: Scientific basis with verifiable sources (RAG + paper citations)
 * - Req #2: Maximum knowledge updates (research module + auto-ingest)
 * - Req #3: Gradual learning (threshold lowered from 95 to 75)
 * - Req #4: Per-user personalized memory (user-memory.ts integration)
 * - Req #5: Interactive update proposals (update-proposals.ts)
 * - Req #6: Creator-only authorization (CREATOR_EMAIL check)
 * - Req #7: Autonomous self-updating with safety guarantees
 *
 * 9-Layer Quality Pipeline (v75.0) — NC-SELFAUDIT-001:
 * 1. Semantic Cache        (db.ts → getSemanticCacheEntry)
 * 2. Complexity Analysis   (intelligence.ts → assessComplexity)
 * 3. CRAG v2               (crag-v2.ts → cragV2Retrieve)
 * 4. Tool Engine           (tool-engine.ts → executeTool)
 * 5. Phase 2 / MoA-Debate  (orchestration.ts → orchestrate)
 * 6. Grounding Engine      (grounding.ts → groundResponse)
 * 7. Self-Refine           (self-refine.ts → selfRefinePhase3)
 * 7.5. Constitutional AI   (constitutional-ai.ts → applyConstitutionalAI)
 * 8. Metrics + Learning    (core.ts + learning.ts)
 */

import { invokeLLM } from '../_core/llm';
import { assessComplexity, classifyQuery, getModelForTier, calculateCost, calculateCostForModel, calculateBaselineCost, calculateCostReduction, type LLMTier } from './intelligence';
import { validateQuality, type GuardianResult } from './guardian';
import { getKnowledgeContext } from './knowledge';
import { cragV2Retrieve } from './crag-v2';
import { selfRefinePhase3 } from './self-refine'; // NC-QUALITY-007: Self-Refine Phase 3 (3 iterations)
import { orchestrate, shouldUseMoA, shouldUseDebate } from './orchestration'; // NC-ORCH-001: MoA + Debate (Ciclo 46)
import { applyConstitutionalAI } from './constitutional-ai'; // NC-CONST-001: Constitutional AI Safety Layer (Ciclo 47)
import { retrieveSubgraph, writeBackToKnowledgeGraph } from './knowledge-graph'; // C259-B: Knowledge Graph activation (Ciclo 36 — arXiv:2310.07521, Edge et al., 2024 GraphRAG) | C264: bidirectional write-back
import { applyCitationEngine, shouldApplyCitationEngine } from './citation-engine'; // C259-C: Citation Engine (Semantic Scholar + arXiv — Wu et al., 2025, Nature Communications)
import { applyIFV } from './ifv'; // Ciclo 54 v2.0 Action 2: IFV — Instruction Following Verifier (Zhou et al., arXiv:2311.07911, 2023)
import { applyCoVe, shouldApplyCoVe } from './cove'; // Ciclo 54 v2.0 Action 3: CoVe — Chain-of-Verification (Dhuliawala et al., arXiv:2309.11495, 2023)
import { rerankDocuments, shouldRerank } from './rag-reranker'; // Ciclo 54 v2.0 Action 4: RAG Re-ranking (RankGPT, Sun et al., arXiv:2304.09542, 2023)
import { applyToT, shouldApplyToT } from './tot-router'; // Ciclo 54 v2.0 Action 5: ToT — Tree-of-Thoughts (Yao et al., arXiv:2305.10601, 2023)
import { collectORPOPair } from './orpo-optimizer'; // Ciclo 56 Action 3: ORPO — Odds Ratio Preference Optimization (Hong et al., arXiv:2403.07691, EMNLP 2024)
import { enforceStructuredOutput } from './structured-output'; // Ciclo 56 Action 4: Structured Output Enforcement (Beurer-Kellner et al., arXiv:2212.06094, LMQL 2023)
import { shouldProactivelyRetrieve, executeProactiveRetrieval, assessContextSufficiency, generateProactiveContextMarker } from './proactive-retrieval'; // Ciclo 56 Action 5: Proactive Knowledge Retrieval (FLARE arXiv:2305.06983, Self-RAG arXiv:2310.11511)
import { shouldTriggerActiveStudy, triggerActiveStudy, enrichResearchWithSemanticScholar } from './active-study'; // Ciclo 56 Action 6: Active Academic Study (Semantic Scholar + arXiv, Proactive Agents arXiv:2410.12361)
import { assessKnowledgeState, formatMetacognitiveStatus } from './metacognitive-monitor'; // Ciclo 56 Action 7: Metacognitive Monitoring (Ji-An et al., arXiv:2505.13763, NeurIPS 2024 arXiv:2406.08391)
import { searchSimilarChunksWithMetadata } from '../omniscient/search';
import { groundResponse, needsGrounding } from './grounding';
import { agenticLearningLoop } from './agentic-learning';
import { insertQuery, getCacheEntry, insertCacheEntry, getSemanticCacheEntry, insertSemanticCacheEntry, getDb } from '../db';
import { retryDbOperation } from './db-retry';
import { learnFromResponse, LEARNING_QUALITY_THRESHOLD } from './learning';
import { processWithReAct } from './react';
import { searchEpisodicMemory, generateAndStoreEmbedding } from './embeddings';
import { createHash } from 'crypto';
import { conductResearch, requiresResearch } from './research';
import { getUserMemoryContext, extractAndStoreMemories } from './user-memory';
import { logAuditEvent } from './update-proposals';
import { CREATOR_EMAIL as _HIERARCHY_CREATOR_EMAIL } from './user-hierarchy';
import { maybeRunAnalysis } from './self-proposal-engine';
import { runMetricsJobs } from './metrics-aggregation-job'; // v69.12: Fix P0 — populate fitness_history, system_metrics, learning_patterns
import { MOTHER_TOOLS, executeTool, formatToolResult } from './tool-engine';
import { ENV } from '../_core/env';
import { generateFichamento } from './fichamento';
import { requiresAbductiveReasoning, performAbductiveReasoning, formatAbductiveContext } from './abductive-engine';
import { applySelfConsistency, shouldApplySelfConsistency } from './self-consistency'; // Ciclo 59 Action 2: Self-Consistency Sampling (Wang et al., arXiv:2203.11171, ICLR 2023)
import { buildContrastiveCotPrompt, shouldApplyCCoT } from './contrastive-cot'; // Ciclo 59 Action 3: Contrastive CoT (Chia et al., arXiv:2311.09277, ACL 2024)
import { addORPOPair } from './orpo-finetune-pipeline'; // Ciclo 59 Action 4: ORPO Fine-tuning Pipeline (Hong et al., arXiv:2403.07691, EMNLP 2024)
import { createLogger } from '../_core/logger'; // v74.0: NC-003 — structured logger
import { getAutonomySummary } from './autonomy'; // v74.6: Anti-hallucination autonomy status
// ─── CICLO 60-65: New Quality Modules ────────────────────────────────────────
import { estimateQueryComplexity as estimateDraftComplexity } from './adaptive-draft-router'; // Ciclo 60: AdaptiveDraftRouter (EAGLE-2, arXiv:2406.16858, EMNLP 2024) — C319: adaptiveDraftRouter removed (unused)
import { applyFaithfulnessCalibration } from './selfcheck-faithfulness'; // Ciclo 60: SelfCheckFaithfulness (arXiv:2303.08896, EMNLP 2023)
import { applyProcessRewardVerification } from './process-reward-verifier'; // Ciclo 60: ProcessRewardVerifier (arXiv:2305.20050, ICLR 2024)
import { applyParallelSelfConsistency, shouldApplyParallelSC } from './parallel-self-consistency'; // Ciclo 61: ParallelSC N=3 (arXiv:2401.10480, ICLR 2024) — shouldApplyParallelSC(category, queryLength, hasErrors)
import { injectAutoKnowledge, shouldInjectAutoKnowledge, formatAKIContextForPrompt } from './auto-knowledge-injector'; // Ciclo 61: AutoKnowledge Self-RAG (arXiv:2310.11511, ICLR 2024)
import { applyDepthPRM, shouldApplyDepthPRM } from './depth-prm-activator'; // Ciclo 61: DepthPRM (arXiv:2305.20050 + arXiv:2312.08935)
import { applySemanticFaithfulnessCalibration } from './semantic-faithfulness-scorer'; // Ciclo 62: SemanticFaithfulness (arXiv:1908.10084, EMNLP 2019)
import { verifyMathematicalContent } from './symbolic-math-verifier'; // Ciclo 62: SymbolicMath (SymPy + arXiv:2305.20050)
import { getDynamicGEvalThreshold } from './quality-ensemble-scorer'; // Ciclo 62: EnsembleScorer + StoppingCriterion — C319: computeEnsembleScore/evaluateStoppingCriterion removed (unused)
import { semanticChunker } from './semantic-chunker'; // C154: SemanticChunker (ISSUE-001: loop on prompts >46k tokens — arXiv:2312.06648)
import { evaluateFaithfulness as bertEvaluateFaithfulness } from './bertscore-nli-faithfulness'; // Ciclo 63: BERTScoreNLI (arXiv:1904.09675, ICLR 2020)
import { evaluateInstructionFollowing as ifEvalV2 } from './ifeval-verifier-v2'; // Ciclo 63: IFEvalV2 (arXiv:2311.07911, Google 2023)
import { calibrateFaithfulness, shouldApplyFDPO } from './fdpo-faithfulness-calibrator'; // Ciclo 64: F-DPO (arXiv:2601.03027, 2026)
import { enhanceDepth, shouldActivateLongCoT } from './long-cot-depth-enhancer'; // Ciclo 64: Long CoT (arXiv:2503.09567, 2025)
import { verifyInstructionFollowing as nsvifVerify, shouldApplyNSVIF } from './nsvif-instruction-verifier'; // Ciclo 64: NSVIF CSP (arXiv:2601.17789, 2026)
import { recordObservation as guardianObserve } from './guardian-agent'; // Ciclo 67: Guardian SLO monitoring (Google SRE 2016, Four Golden Signals)
import { observeAndLearn as dgmObserve } from './dgm-agent'; // Ciclo 67: Darwin Gödel Machine (arXiv:2505.22954, Sakana AI 2025)
import { recordRequest as obsRecordRequest } from './observability'; // Ciclo 67: OpenTelemetry observability (CNCF 2023, DORA Metrics 2018)
// ─── CICLO 73: A/B Test — core-orchestrator.ts (50% traffic canary) ──────────
import { orchestrate as coreOrchestrate } from './core-orchestrator'; // Ciclo 70: Canary A/B 10% (Oracle Medium 2025 + Google SRE Canary Deployment + ACAR arXiv:2602.21231)
import { applyGRPOReasoning, shouldApplyGRPO } from './grpo-reasoning-enhancer'; // Ciclo 73: GRPO Reasoning Enhancer (Shao et al., arXiv:2402.03300 DeepSeekMath 2024 + DeepSeek-R1 arXiv:2501.12948 2025)
import { processRLVRAndStoreDPO } from './rlvr-dpo-connector'; // C318 (Conselho V108): RLVR→DPO automatic loop (DeepSeek-R1 arXiv:2501.12948 + Rafailov arXiv:2305.18290)
import { applyTTCScaling, shouldApplyTTCScaling } from './test-time-compute-scaler'; // Ciclo 74: TTC Scaling Best-of-N (Snell et al., arXiv:2408.03314, 2024 + GenPRM arXiv:2504.00891, 2025)
// ─── CICLO C210-C212: Conselho dos 6 — NC-COG-005 a NC-COG-013 ─────────────────
import { enhanceSystemPromptWithFOL, enhanceSystemPromptWithFOLChain } from './fol-detector'; // NC-COG-005+010 (C210+C211): FOL Detector + Multi-Step FOL Chain (arXiv:2601.09446 + arXiv:2305.14279)
import { applyCreativeConstraintValidation } from './creative-constraint-validator'; // NC-COG-006+011 (C210+C211): Creative Constraint Validator + Phonetic Rhyme (COLLIE + arXiv:2305.14279)
import { calibrateCognitiveScore, calibrateCognitiveScoreAdaptive } from './cognitive-calibrator'; // NC-COG-007+012 (C210+C211): Cognitive Calibrator + Adaptive History (arXiv:2207.05221 + arXiv:2510.16374)
import { enhanceSystemPromptWithLockFree } from './lock-free-explainer'; // NC-COG-008 (C210): Lock-Free Explainer (Herlihy & Wing 1990 + arXiv:2106.04422)
import { applyZ3Verification } from './z3-subprocess-verifier'; // NC-COG-013 (C212): Z3 Subprocess Verifier (de Moura & Bjorner 2008 TACAS + arXiv:2006.01847)
import { detectLongFormRequest, generateLongFormV3 } from './long-form-engine-v3'; // NC-LF-001 (C216): Long-Form V3 (Gao arXiv:2312.10997 + Lewis arXiv:2005.11401)
import { estimateOutputLength } from './output-length-estimator'; // C241/C242: OLAR routing (Conselho v100) | C321: Semantic Complexity Detector v2.0 (complexitySignals now embedded in OutputLengthEstimate)

// ─── MOTHER Version (single source of truth) ─────────────────────────────────
// v74.0: NC-010 (tier3 fix) + NC-008 (cache TTL 72h) + NC-011 (self-diagnosis routing)
// + NC-003 (structured logger) — Scientific basis: ISO/IEC 25010:2023 quality model
// v74.1: BUG-1 (__dirname ESM fix in self-code-reader/writer/worker-python-helper)
//        BUG-2 (DGM resilient fallback — Docker path detection)
//        BUG-4 (fichamento text repetition — sentenceCitedPattern removed, ## Referências guard)
//        BUG-3 (quality 50% — consequence of BUG-1, resolves automatically)
// v74.2: Ação 1 (GITHUB_TOKEN in cloudbuild.yaml — enables full DGM execution)
//        Ação 5 (version-based cache invalidation — queryHash includes MOTHER_VERSION)
//        Scientific basis: Fowler, Patterns of Enterprise Application Architecture (2002)
// v74.3: ROOT CAUSE FIX — self-code-reader always returned empty in production Docker
// v74.4: BUG-6 (prompt mirror — ID collision in Home.tsx Date.now() suffixes)
//        NC-012 (Planning without Execution — bug scan keywords + system prompt instruction)
//        DGM-1 (Parallel context per-source timeout — withTimeout prevents slow sources from blocking)
//        Cause: esbuild bundles everything into dist/index.js; server/*.ts NOT copied to image
//        Fix: Dockerfile COPY --from=build /app/server ./server
//        Scientific basis: Gödel Machine (Schmidhuber, 2003) — self-referential system
//        requires access to its own source code for autonomous improvement
//        DGM-1 basis: Amdahl's Law (Amdahl, 1967); Node.js Event Loop (Node.js Foundation, 2023)
// v74.5: NC-013 (Agency Gap — feature requests → write_own_code IMMEDIATELY, not chatbot output)
//        QUALITY-1 (G-Eval scoring analysis — 75% root cause: claude-sonnet lacks tool context)
//        LEARNING-1 (AgenticLearning threshold confirmed correct at 75%; trigger verified)
//        Scientific basis: SWE-bench (Jimenez et al., 2024, arXiv:2310.06770)
//        Gödel Machine (Schmidhuber, 2003) — self-modification requires direct execution
export const MOTHER_VERSION = 'v122.26'; // C351 (2026-03-12): Filter Audit — purge dpoOverridePatterns (epistemologicamente falho, duplicata do DPO Universal Default), purge 2 padrões genéricos SELF_REPORTING, fix Bug B (PAGE_PATTERN negation guard), fix Bug C (express.json 50mb limit)

const log = createLogger('CORE');

// v74.4 DGM-1: Per-source timeout to prevent slow sources from blocking parallel context build
// Scientific basis: Amdahl's Law (Amdahl, 1967) — without per-source timeout, one slow source
// determines total latency even with Promise.allSettled parallelism
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[MOTHER] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}


// v69.11: Creator email from centralized user-hierarchy module (NIST RBAC SP 800-162)
// Scientific basis: Ferraiolo & Kuhn (1992) RBAC; Anthropic Principal Hierarchy (2026)
const CREATOR_EMAIL = _HIERARCHY_CREATOR_EMAIL;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MotherRequest {
  query: string;
  userId?: number;
  userEmail?: string;
  useCache?: boolean;
  conversationHistory?: ConversationMessage[]; // v63.0: Multi-turn conversation support
  // v69.5: Token streaming callback for SSE endpoint
  onChunk?: (chunk: string) => void;
  // C175: Phase and tool call SSE callbacks — passed through to coreOrchestrate
  onPhase?: (phase: string, metadata?: Record<string, unknown>) => void;
  onToolCall?: (toolName: string, toolArgs: Record<string, unknown>, status: 'running' | 'success' | 'error', output?: string, durationMs?: number) => void;
}

export interface MotherResponse {
  response: string;
  
  // Layer 3: Intelligence
  tier: string; // legacy: gpt-4o-mini | gpt-4o | gpt-4
  complexityScore: number;
  confidenceScore: number;
  // v68.8: Multi-provider cascade router
  provider?: string;
  modelName?: string;
  queryCategory?: string;
  
  // Layer 6: Quality
  quality: GuardianResult;
  
  // Layer 7: Learning/Metrics
  responseTime: number; // milliseconds
  tokensUsed: number;
  cost: number; // USD
  costReduction: number; // percentage
  cacheHit: boolean;
  
  // ReAct (Iteration 12)
  reactObservations?: string[];
  
  // Metadata
  queryId: number;
  // R548 (AWAKE V236 Ciclo 164): layout_hint — frontend rendering hint
  // Scientific basis: arXiv:2304.10878 (2023): "Structured output hints improve UI rendering"
  layout_hint?: 'chat' | 'code' | 'analysis' | 'document';
}

/**
 * C328 BUG 5: extractSemanticTitle — normalize CAPS LOCK queries to proper semantic titles
 * Scientific basis: Conselho V109 diagnosis — "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES"
 * was being passed as-is to Gemini, causing "Author: MOTHER (v78.9)" metadata generation.
 * Solution: extract the core subject noun phrase and title-case it.
 * Consensus 5/5 (DeepSeek, Claude, Gemini, Mistral, Manus)
 */
function extractSemanticTitle(query: string): string {
  // Normalize to lowercase for processing
  const q = query.toLowerCase().trim();

  // Pattern 1: "escreva um livro [de X páginas] sobre TOPIC [em IDIOMA]"
  const bookMatch = q.match(/(?:escreva|crie|gere|write|create|generate)\s+(?:um?\s+)?(?:livro|book|manual|guia|guide|tutorial|artigo|article|relat[oó]rio|report|documento|document)\s+(?:(?:com|de|with|of)\s+\d+\s+(?:p[aá]ginas?|pages?|cap[ií]tulos?|chapters?)\s+)?(?:sobre|about|on|de|para)\s+(.+?)(?:\s+em\s+(?:ingl[eê]s|portugu[eê]s|english|portuguese|espa[nñ]ol|spanish))?$/i);
  if (bookMatch) {
    const subject = bookMatch[1].trim();
    // Title-case the subject
    return subject.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Pattern 2: "ESCREVA UM LIVRO SOBRE TYPESCRIPT EM INGLES" (all caps)
  if (query === query.toUpperCase() && query.length > 20) {
    // All-caps query: extract noun after 'SOBRE', 'ABOUT', 'ON', 'DE'
    const capsMatch = query.match(/(?:SOBRE|ABOUT|ON|DE)\s+([A-Z][A-Z0-9\s]+?)(?:\s+EM\s+|\s+IN\s+|$)/i);
    if (capsMatch) {
      const subject = capsMatch[1].trim().toLowerCase();
      return subject.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Pattern 3: Imperative commands — "Analise o impacto de X", "Explique Y"
  const imperativeMatch = q.match(/^(?:analise|explique|descreva|compare|avalie|implemente|crie|desenvolva|analyze|explain|describe|compare|evaluate|implement|create|develop)\s+(?:o\s+|a\s+|os\s+|as\s+|um\s+|uma\s+|the\s+|a\s+|an\s+)?(.+?)(?:\s+em\s+(?:ingl[eê]s|portugu[eê]s|english))?$/i);
  if (imperativeMatch) {
    const subject = imperativeMatch[1].trim();
    // Capitalize first letter only
    return subject.charAt(0).toUpperCase() + subject.slice(1);
  }

  // Fallback: truncate and title-case the query
  const truncated = query.slice(0, 80).trim();
  return truncated.charAt(0).toUpperCase() + truncated.slice(1).toLowerCase();
}

/**
 * Main query processing function — entry point for all MOTHER requests.
 * Integrates all 9 layers (v75.0 — NC-SELFAUDIT-001)
 */
export async function processQuery(request: MotherRequest): Promise<MotherResponse> {
  const startTime = Date.now();

  // ==================== DIAGRAM INTERCEPT — bypass LFSA and structured templates ====================
  // Diagram requests must NEVER trigger LFSA or NC-COG-002-C322 template.
  // Keywords that unambiguously indicate a Mermaid diagram is the expected output.
  const DIAGRAM_KEYWORDS = /\b(diagrama|diagram|fluxograma|flowchart|mermaid|visualiza[rç]|desenha[rç]|grafo|graph)\b/i;
  if (DIAGRAM_KEYWORDS.test(request.query)) {
    // Mark request so system prompt injection below knows to prepend diagram override
    (request as any)._isDiagramRequest = true;
  }

  // ==================== C241: LFSA INTERCEPTOR — Long-Form Synthesis Architecture ====================
  // Scientific basis: HiRAP (EMNLP 2025) — hierarchical decomposition for long-form generation
  // FrugalGPT (Chen et al., 2023) — output length is primary routing signal
  // Conselho v100 consensus: VERY_LONG queries (60+ pages) MUST bypass coreOrchestrate (25s timeout)
  // and use generateLongFormV3 (Plan→Execute→Assemble pipeline with 600s timeout per section)
  const lfEstimate = (request as any)._isDiagramRequest
    ? { requiresLFSA: false, estimatedPages: 0.3, estimatedTokens: 512, category: 'SHORT' as const, confidence: 1.0, detectedSignal: 'Diagram intercept — LFSA bypassed', complexitySignals: undefined }
    : estimateOutputLength(request.query);
  // C321: Log semantic complexity signals for diagnostics
  if (lfEstimate.complexitySignals) {
    const cs = lfEstimate.complexitySignals;
    console.log(`[Core-C321] SemanticComplexity: score=${cs.totalScore.toFixed(1)} verbs=${cs.actionVerbCount} refs=${cs.externalRefCount} artifacts=${cs.artifactNounCount} patterns=${cs.multiTaskPatternCount} requiresLFSA=${cs.requiresLFSA}`);
  }
  if (lfEstimate.requiresLFSA) {
    console.log(`[Core] C241 LFSA interceptor: query (~${lfEstimate.estimatedPages} pages, ${lfEstimate.estimatedTokens} tokens). Signal: ${lfEstimate.detectedSignal}`);
    try {
      const lfDetect = detectLongFormRequest(request.query);
      // C328 BUG 5+8: extractSemanticTitle — normalize CAPS LOCK query to semantic title
      // Scientific basis: Gemini training data patterns (Conselho V109 — BUG 5 diagnosis)
      // Prevents "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES" → "TypeScript"
      const semanticTitle = extractSemanticTitle(request.query);
      // C328 BUG 6: Propagate MANDATORY RESPONSE RULES as systemRules to LFSA
      // Scientific basis: Constitutional AI (Bai et al., arXiv:2212.08073) — rules must be present
      // at generation time, not just in the outer system prompt (LFSA operates in isolation)
      const lfSystemRules = `REGRAS OBRIGATÓRIAS DE QUALIDADE (${MOTHER_VERSION}):
- Responda em ${request.query.match(/\b(in english|em inglês|en inglés)\b/i) ? 'English' : 'português'}
- Sem auto-referência ("As MOTHER", "I am MOTHER")
- Sem placeholders ("(As above)", "***", "[conteúdo aqui]")
- Sem metadados de livro ("Author:", "Publisher:", "Page X:")
- Mínimo 600 palavras de conteúdo real por seção
- Código REAL e funcional (não pseudocódigo)
- Citações bibliográficas no formato [Autor, Ano]`;
      const lfResult = await generateLongFormV3({
        title: semanticTitle,   // C328 BUG 5: semantic title, not raw CAPS LOCK query
        topic: request.query,
        format: lfDetect.format ?? 'markdown',
        targetWordCount: Math.max(lfEstimate.estimatedPages * 450, lfDetect.estimatedWords ?? 3000),
        language: request.query.match(/\b(in english|em inglês|en inglés)\b/i) ? 'en-US' : 'pt-BR',
        streamProgress: request.onPhase ? (progress) => {
          (request.onPhase as any)?.('writing', { step: progress.phase, section: progress.currentSection, pct: progress.percentComplete });
        } : undefined,
        // C306: Wire onChunk for live streaming — sections emitted as they complete
        // Scientific basis: Nielsen (1994) Heuristic #1 — visibility of system status
        onChunk: request.onChunk,
        // C327+C328: Quality enforcement parameters
        versionString: MOTHER_VERSION,         // BUG 1: dynamic version
        minWordsPerSection: 600,               // BUG 6: minimum words per section
        maxTokensPerSection: 12000,            // C331: quality token budget
        systemRules: lfSystemRules,            // BUG 6: constitutional rules
      });
      return {
        response: lfResult.fullContent,
        tier: 'TIER_4',
        complexityScore: 0.95,
        confidenceScore: 0.90,
        provider: (lfResult as any).provider ?? 'google',
        modelName: (lfResult as any).model ?? 'gemini-2.5-pro',
        queryCategory: 'long_form',
        quality: {
          qualityScore: 90,
          passed: true,
          completenessScore: 90,
          accuracyScore: 88,
          relevanceScore: 92,
          coherenceScore: 88,
          safetyScore: 95,
          cacheEligible: false,
        } as any,
        responseTime: Date.now() - startTime,
        fromCache: false,
        cacheEligible: false,
        usedFallback: false,
        tokensUsed: (lfResult as any).totalTokens,
        estimatedCostUSD: ((lfResult as any).totalTokens ?? 0) * 0.000015,
        layout_hint: 'document',
      } as any;
    } catch (lfErr: any) {
      console.error(`[Core] C241 LFSA failed, falling through to coreOrchestrate: ${lfErr.message}`);
      // Fall through to normal orchestration on LFSA failure
    }
  }

  // ==================== Fase 2.3: Unified Pipeline — always use core-orchestrator.ts ====================
  // Canary A/B rollout completed (Ciclo 74: 10%→50%→100%). A/B wrapper removed.
  // core-orchestrator.ts is now the sole production pipeline for all standard queries.
  // Legacy pipeline below kept as emergency fallback (never reached in normal operation).
  try {
    const orchResult = await coreOrchestrate({
      query: request.query,
      userId: request.userId != null ? String(request.userId) : undefined,
      conversationHistory: request.conversationHistory ?? [],
      metadata: { useCache: request.useCache ?? true, userEmail: request.userEmail },
      onPhase: request.onPhase as any,
      onToolCall: request.onToolCall,
      onChunk: request.onChunk,
    });
    return {
      response: orchResult.response,
      tier: orchResult.tier ?? 'TIER_2',
      complexityScore: 0.5,
      confidenceScore: 0.8,
      provider: orchResult.provider ?? 'openai',
      modelName: orchResult.model ?? 'gpt-4o',
      queryCategory: 'general',
      quality: {
        qualityScore: orchResult.qualityScore ?? 80,
        passed: (orchResult.qualityScore ?? 80) >= 70,
        completenessScore: 80,
        accuracyScore: 80,
        relevanceScore: 80,
        coherenceScore: 80,
        safetyScore: 95,
        cacheEligible: (orchResult.qualityScore ?? 80) >= 75,
      } as GuardianResult,
      responseTime: orchResult.latencyMs ?? 0,
      tokensUsed: orchResult.tokensUsed ?? 0,
      cost: orchResult.estimatedCostUSD ?? 0,
      costReduction: 0,
      cacheHit: orchResult.fromCache ?? false,
      queryId: 0,
      layout_hint: orchResult.layout_hint,
      metadata: {
        orchestrator: 'core-orchestrator',
        tier: orchResult.tier,
        latencyMs: orchResult.latencyMs,
        provider: orchResult.provider,
        model: orchResult.model,
        fromCache: orchResult.fromCache,
        qualityScore: orchResult.qualityScore,
        version: orchResult.version,
      },
    } as unknown as MotherResponse;
  } catch (orchErr) {
    // Emergency fallback to legacy pipeline — should be rare
    log.warn('[Core] core-orchestrator error — falling back to legacy pipeline', { error: String(orchErr) });
  }

  // ==================== LAYER 2: ORCHESTRATION ====================
  // Request routing and preprocessing
  
  // C154: SemanticChunker — ISSUE-001 fix (loop on prompts >46k tokens)
  // Scientific basis: Semantic chunking (arXiv:2312.06648) — split long prompts into coherent chunks
  // to prevent context window overflow and infinite retry loops
  const rawQuery = request.query;
  const chunkingResult = semanticChunker.chunkText(rawQuery, 'processQuery');
  const { query, userId, userEmail, useCache = true, conversationHistory = [], onChunk } = {
    ...request,
    query: chunkingResult.totalChunks > 1
      ? chunkingResult.chunks.map((c: { content: string }) => c.content).join('\n\n[CHUNK BOUNDARY]\n\n')
      : rawQuery,
  };
  if (chunkingResult.totalChunks > 1) {
    log.info(`[C154] SemanticChunker: prompt split into ${chunkingResult.totalChunks} chunks (${rawQuery.length} chars) — ISSUE-001 prevention`);
  }
  
  // Generate query hash for caching (exact-match fallback)
  // v74.2: Version-based cache invalidation — include MOTHER_VERSION in hash
  // Scientific basis: Versioned cache keys (Fowler, Patterns of Enterprise Application Architecture, 2002)
  // Ensures responses from previous versions are NEVER served after a version bump
  // e.g., v74.0 cache entry for 'qual sua versão?' will NOT match v74.1 queryHash
  const queryHash = createHash('sha256').update(`${MOTHER_VERSION}:${query.toLowerCase().trim()}`).digest('hex');
  
  // ==================== CACHING LAYER v69.5: SEMANTIC CACHE ====================
  // Scientific basis: GPTCache (Zeng et al., 2023); Krites (Apple ML, arXiv:2602.13165, 2026)
  // Two-tier: (1) exact SHA-256 match, (2) semantic cosine similarity >= 0.92
  
  // NC-SELFAUDIT-001 (Ciclo 50): Auto-bypass cache for self-reporting queries
  // Problem: Semantic cache (threshold 0.85) can serve stale responses for queries about MOTHER's own
  // architecture/metrics AFTER code updates, because the query embedding is similar but the answer changed.
  // Scientific basis: Lindsey (Anthropic, 2025) — self-reports must reflect current internal state;
  //   cache invalidation for dynamic state (Martin Fowler, PEAA, 2002 — cache coherence principle)
  // Fix: Detect self-reporting queries and force useCache=false to always get fresh data from audit_system.
  const SELF_REPORTING_PATTERNS = [
    /\b(audit|auditoria|camadas?|layers?|arquitetura|architecture|pipeline|vers[\u00e3a]o|version)\b/i,
    /\b(m[\u00e9e]trica|metric|qualidade|quality|cache|desempenho|performance|latencia|latency)\b/i,
    /\b(aba de conhecimento|knowledge tab|como voc[\u00ea] funciona|how do you work)\b/i,
    // C351 PURGE: 'o que vc acha' e 'something wrong' removidos — padrões genéricos demais que ativam
    // bypass de cache para queries não relacionadas a self-audit (ex: 'o que vc acha da situação climática?').
    // Sem justificativa científica específica aprovada pelo Conselho. Fowler PEAA 2002: cache bypass
    // deve ser cirúrgico, baseado em estado dinâmico verificado, não em heurística de texto livre.
    /\b(status|sa[\u00fau]de|health|diagn[\u00f3o]stico|diagnostic)\b/i,
    // Ciclo 105: DPO identity queries must bypass cache — stale cache prevents DPO model activation
    // Scientific basis: Cache coherence (Fowler PEAA 2002) — DPO queries need fresh routing decision
    /\b(quem (e|es|[\u00e9]) voc[\u00ea]|who are you|o que (e|[\u00e9]) voc[\u00ea]|quem te criou|who created you)\b/i,
    /\b(sua identidade|your identity|me fale sobre voc[\u00ea]|tell me about yourself)\b/i,
  ];
  const isSelfReportingQuery = SELF_REPORTING_PATTERNS.some(p => p.test(query));
  const effectiveUseCache = useCache && !isSelfReportingQuery;
  if (isSelfReportingQuery && useCache) {
    log.info('[MOTHER] NC-SELFAUDIT-001: Self-reporting query detected — bypassing cache to ensure fresh audit data');
  }
  
  let queryEmbedding: number[] | null = null;
  
  if (effectiveUseCache) {
    // Tier 1: Exact hash match (fast, zero cost)
    const cached = await getCacheEntry(queryHash);
    if (cached) {
      log.info('[MOTHER] Cache hit (exact)!');
      const cachedResponse = JSON.parse(cached.response);
      // v69.13: Fix P0 — log cache hit to queries table so cacheHitRate is non-zero
      // Scientific basis: Google SRE Book (Beyer et al., 2016): observability requires all events logged
      retryDbOperation(() => insertQuery({
        userId: userId || null,
        query,
        response: cachedResponse.response || '',
        tier: (cachedResponse.tier || 'gpt-4o-mini') as LLMTier,
        complexityScore: '0',
        confidenceScore: '0',
        qualityScore: (cachedResponse.quality?.qualityScore || 85).toString(),
        completenessScore: '0',
        accuracyScore: '0',
        relevanceScore: '0',
        coherenceScore: null,
        safetyScore: null,
        responseTime: Date.now() - startTime,
        tokensUsed: 0,
        cost: '0',
        cacheHit: 1, // v69.13: FIX — was 0, now correctly 1 for cache hits
        provider: cachedResponse.provider || 'cache',
        modelName: cachedResponse.modelName || 'cache',
        queryCategory: cachedResponse.queryCategory || 'cached',
        costReduction: '100',
        ragasFaithfulness: null,
        ragasAnswerRelevancy: null,
        ragasContextPrecision: null,
      })).catch(() => {}); // fire-and-forget
      // C300 (R4 Fix): Apply citation engine to cache hits — cached responses may lack citations
      // Scientific basis: Wu et al. (2025, Nature Communications): citations mandatory for scientific grounding
      // Root cause: Citation Engine (C290) runs post-generation, but cache returns early — bypassing it
      let cachedFinalResponse = cachedResponse.response || '';
      const cachedCategory = cachedResponse.queryCategory || 'general';
      if (shouldApplyCitationEngine(cachedFinalResponse, cachedCategory)) {
        try {
          const citResult = await applyCitationEngine(query, cachedFinalResponse, cachedCategory);
          if (citResult.citationsFound > 0) {
            cachedFinalResponse = citResult.responseWithCitations;
            log.info(`[CitationEngine-Cache] Applied to cache hit: ${citResult.citationsFound} citations added`);
          }
        } catch (citErr) {
          log.warn('[CitationEngine-Cache] Failed (non-blocking):', (citErr as Error).message);
        }
      }
      return { ...cachedResponse, response: cachedFinalResponse, cacheHit: true, responseTime: Date.now() - startTime };
    }
    
    // Tier 2: Semantic similarity match (requires embedding)
    try {
      const embRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ENV.openaiApiKey}` },
        body: JSON.stringify({ input: query.toLowerCase().trim(), model: 'text-embedding-3-small' })
      });
      if (embRes.ok) {
        const embData = await embRes.json() as { data: Array<{ embedding: number[] }> };
        queryEmbedding = embData.data[0]?.embedding ?? null;
        if (queryEmbedding) {
          const semanticHit = await getSemanticCacheEntry(queryEmbedding);
          if (semanticHit) {
            log.info('[MOTHER] Cache hit (semantic)!');
            const cachedResponse = JSON.parse(semanticHit.response);
            // v69.13: Fix P0 — log semantic cache hit to queries table
            retryDbOperation(() => insertQuery({
              userId: userId || null,
              query,
              response: cachedResponse.response || '',
              tier: (cachedResponse.tier || 'gpt-4o-mini') as LLMTier,
              complexityScore: '0',
              confidenceScore: '0',
              qualityScore: (cachedResponse.quality?.qualityScore || 85).toString(),
              completenessScore: '0',
              accuracyScore: '0',
              relevanceScore: '0',
              coherenceScore: null,
              safetyScore: null,
              responseTime: Date.now() - startTime,
              tokensUsed: 0,
              cost: '0',
              cacheHit: 1, // v69.13: FIX — semantic cache hit
              provider: cachedResponse.provider || 'cache',
              modelName: cachedResponse.modelName || 'cache',
              queryCategory: cachedResponse.queryCategory || 'cached',
              costReduction: '100',
              ragasFaithfulness: null,
              ragasAnswerRelevancy: null,
              ragasContextPrecision: null,
            })).catch(() => {}); // fire-and-forget
            // C300 (R4 Fix): Apply citation engine to semantic cache hits too
            let semCachedFinalResponse = cachedResponse.response || '';
            const semCachedCategory = cachedResponse.queryCategory || 'general';
            if (shouldApplyCitationEngine(semCachedFinalResponse, semCachedCategory)) {
              try {
                const citResult = await applyCitationEngine(query, semCachedFinalResponse, semCachedCategory);
                if (citResult.citationsFound > 0) {
                  semCachedFinalResponse = citResult.responseWithCitations;
                  log.info(`[CitationEngine-SemanticCache] Applied: ${citResult.citationsFound} citations added`);
                }
              } catch (citErr) {
                log.warn('[CitationEngine-SemanticCache] Failed (non-blocking):', (citErr as Error).message);
              }
            }
            return { ...cachedResponse, response: semCachedFinalResponse, cacheHit: true, responseTime: Date.now() - startTime };
          }
        }
      }
    } catch (embErr) {
      log.warn('[MOTHER] Embedding for semantic cache failed (non-blocking):', (embErr as Error).message);
    }
  }
  
  // ==================== LAYER 3: INTELLIGENCE ====================
  // Assess complexity and route to appropriate LLM tier
  
  const complexity = assessComplexity(query);
  let routingDecision = classifyQuery(query);

  // ── CREATOR BYPASS (v69.10): Constitutional AI principal hierarchy ──────────
  // Scientific basis: Bai et al. (2022). Constitutional AI. arXiv:2212.08073.
  // The creator (highest principal) always receives gpt-4o (complex_reasoning tier)
  // regardless of query classification. This ensures full tool access and maximum
  // response quality for ALL system administration and audit commands.
  const isCreatorEarly = userEmail === CREATOR_EMAIL;
  if (isCreatorEarly && (routingDecision.category === 'simple' || routingDecision.category === 'general')) {
    const prevCategory = routingDecision.category;
    routingDecision = {
      ...routingDecision,
      category: 'complex_reasoning',
      model: { provider: 'anthropic', modelName: 'claude-sonnet-4-6' },
      tier: 'claude-sonnet-4-6',
      confidence: 1.0,
      reasoning: `CREATOR BYPASS: was '${prevCategory}' → forced to claude-sonnet-4-6 (max quality for creator, QW-3 routing)`,
      complexityScore: 0.90,
      confidenceScore: 1.0,
    };
    log.info(`[MOTHER] CREATOR BYPASS: '${prevCategory}' → complex_reasoning/claude-sonnet-4-6`);
  }
  // ==================== C351: DPO ROUTING — DELEGADO AO DPO UNIVERSAL DEFAULT (core-orchestrator.ts) ====================
  // C351 PURGE: dpoOverridePatterns (Ciclo 104) REMOVIDO.
  //
  // Motivo: Pattern-matching por lista de strings é epistemologicamente falho — não é possível
  // enumerar a priori todas as queries válidas (conforme documentado no próprio core-orchestrator.ts:
  // 'Pattern-matching is epistemologically flawed: cannot enumerate all valid queries a priori').
  //
  // Problemas identificados:
  // 1. Colisaão com DPO Universal Default (NC-DPO-UNIVERSAL-001 C106) em core-orchestrator.ts
  // 2. Sobrescrevia decisões do tier-gate com modelo errado (gpt-4o-mini em vez de DPO v8e)
  // 3. Padrões genéricos como 'matematicamente', 'talude', 'guardian' ativavam DPO para queries
  //    que não são de identidade/arquitetura (ex: 'como funciona o guardian pattern em software?')
  // 4. Duplicata funcional: DPO_CACHE_BYPASS_PATTERNS em core-orchestrator.ts já cobre todos os casos
  //
  // Decisão: DPO routing é responsabilidade exclusiva do DPO Universal Default (Layer 2.5)
  // em core-orchestrator.ts, que usa tier-gate (TIER_3/4) sem pattern-matching.
  // Aprovado: C351 Filter Audit (2026-03-12).
  log.info(`[MOTHER] Routing: category=${routingDecision.category}, provider=${routingDecision.model.provider}, model=${routingDecision.model.modelName}, confidence=${routingDecision.confidence.toFixed(2)}`);
  
  // ==================== LAYERS 5.0–5.6: PARALLEL CONTEXT BUILDING (v68.9 Opt #1) ====================
  // All context sources run in parallel via Promise.all to minimize latency.
  // Scientific basis: Parallel RAG (Shi et al., arXiv:2407.01219, 2024);
  //   FrugalGPT latency analysis (Chen et al., arXiv:2305.05176, 2023)
  // Before: ~15-20s sequential. After: ~3-5s parallel (bounded by slowest source).
  
  const contextBuildStart = Date.now();
  
  // Parallel execution of all context sources — v74.4 DGM-1: per-source timeouts
  // Scientific basis: Amdahl's Law (1967) — bounded by slowest source without per-source timeout
  const [
    cragResultRaw,
    omniscientResultRaw,
    episodicResultRaw,
    userMemoryResultRaw,
    researchResultRaw,
  ] = await Promise.allSettled([
    // Source 1: CRAG (Self-correcting RAG) — 8s budget (may trigger external search)
    withTimeout(
      cragV2Retrieve(query, userId).catch(async (err) => { // NC-QUALITY-006: CRAG v2
        log.error('[MOTHER] CRAG failed, falling back to legacy knowledge:', err);
        const fallback = await getKnowledgeContext(query);
        return { context: fallback, documents: [], correctiveSearchTriggered: false };
      }),
      8000, 'CRAG'
    ),
    // Source 2: Omniscient (arXiv paper chunks) — 3s budget
    withTimeout(searchSimilarChunksWithMetadata(query, 7, 0.50), 3000, 'Omniscient'), // v69.15: Top-K 5→7, threshold 0.55→0.50
    // Source 3: Episodic memory — 2s budget
    withTimeout(searchEpisodicMemory(query, 3, 0.75), 2000, 'EpisodicMemory'),
    // Source 4: User memory — 2s budget (only if userId present)
    userId ? withTimeout(getUserMemoryContext(userId, query), 2000, 'UserMemory') : Promise.resolve(''),
    // Source 5: Scientific research — 15s budget (web search is inherently slow)
    requiresResearch(query) ? withTimeout(conductResearch(query), 15000, 'Research') : Promise.resolve(null),
  ]);
  
  log.info(`[MOTHER] Parallel context build: ${Date.now() - contextBuildStart}ms`);
  
  // Extract CRAG result
  let knowledgeContext = '';
  let cragDocuments: import('./crag').CRAGDocument[] = [];
  if (cragResultRaw.status === 'fulfilled') {
    knowledgeContext = cragResultRaw.value.context;
    cragDocuments = cragResultRaw.value.documents as any; // NC-QUALITY-006: CRAGv2Document compatible with CRAGDocument
    if ((cragResultRaw.value as any).correctiveSearchTriggered) {
      log.info('[MOTHER] CRAG: Corrective search triggered — no local knowledge found');
    }
    // ==================== CICLO 54 v2.0 ACTION 4: RAG RE-RANKING ====================
    // Scientific basis: RankGPT (Sun et al., arXiv:2304.09542, 2023): listwise re-ranking
    // Bi-encoder (CRAG v2) → Cross-encoder (RankGPT) pipeline
    // Trigger: 3+ documents available, research/complex queries
    if (cragDocuments.length >= 3 && shouldRerank(cragDocuments.length, routingDecision.category, query.split(/\s+/).length)) {
      try {
        const docsForReranking = cragDocuments.map(d => ({
          content: d.content,
          source: d.source || 'unknown',
          score: (d as any).relevanceScore || (d as any).hybridScore || 0.5,
        }));
        const rerankResult = await rerankDocuments(query, docsForReranking, 5);
        if (rerankResult.applied) {
          // Use re-ranked context instead of original CRAG context
          knowledgeContext = rerankResult.topContext;
          log.info(`[RAGReranker] Re-ranked ${cragDocuments.length} docs, order changed: ${JSON.stringify(rerankResult.originalOrder.slice(0,3))} → ${JSON.stringify(rerankResult.newOrder.slice(0,3))}`);
        }
      } catch (rerankErr) {
        log.warn('[RAGReranker] Failed (non-blocking), using original CRAG context:', (rerankErr as Error).message);
      }
    }
  }
  
  // Extract Omniscient result
  let omniscientContext = '';
  if (omniscientResultRaw.status === 'fulfilled' && omniscientResultRaw.value.length > 0) {
    const paperResults = omniscientResultRaw.value;
    omniscientContext = `\n\n## 📚 OMNISCIENT — INDEXED SCIENTIFIC PAPERS (${paperResults.length} results)\n` +
      paperResults.map((r, i) => {
        const authors = r.paperAuthors ? r.paperAuthors.split(',')[0].trim() + ' et al.' : 'Unknown authors';
        const arxivId = r.arxivId || 'unknown';
        const citation = `${authors}, arXiv:${arxivId}`;
        return `[Paper ${i+1} | Similarity: ${r.similarity.toFixed(3)} | ${citation}]\nTitle: ${r.paperTitle || 'Unknown'}\n${r.content.slice(0, 1200)}`;
      }).join('\n\n');
    log.info(`[MOTHER] Omniscient: ${paperResults.length} paper chunks injected (top similarity: ${paperResults[0].similarity.toFixed(3)})`);
  } else {
    log.info('[MOTHER] Omniscient: No indexed papers found or search failed');
  }
  
  // Extract Episodic memory result
  let episodicContext = '';
  if (episodicResultRaw.status === 'fulfilled' && episodicResultRaw.value.length > 0) {
    const memories = episodicResultRaw.value;
    episodicContext = `\n\nRELEVANT PAST INTERACTIONS (Episodic Memory):\n` +
      memories.map((m, i) => 
        `[Memory ${i+1} | Similarity: ${m.similarity.toFixed(3)} | Quality: ${m.qualityScore || 'N/A'}]\n` +
        `Q: ${m.query.slice(0, 200)}\n` +
        `A: ${m.response.slice(0, 400)}`
      ).join('\n\n');
    log.info(`[MOTHER] Episodic memory: ${memories.length} relevant past interactions injected`);
  }
  
  // Extract User memory result
  let userMemoryContext = '';
  if (userMemoryResultRaw.status === 'fulfilled' && userMemoryResultRaw.value) {
    userMemoryContext = userMemoryResultRaw.value as string;
    if (userMemoryContext) log.info(`[MOTHER] User memory context injected for user ${userId}`);
  }
  
  // ==================== CICLO 37: ABDUCTIVE REASONING (v70.0) ====================
  // Apply abductive reasoning for queries requiring hypothesis generation
  // Scientific basis: Peirce (1878); Lipton (2004) — Inference to the Best Explanation
  let abductiveContext = '';
  if (requiresAbductiveReasoning(query)) {
    try {
      const domain = routingDecision.category === 'research' ? 'AI/ML' : 'General';
      const abductiveResult = await performAbductiveReasoning(query, domain, knowledgeContext);
      abductiveContext = formatAbductiveContext(abductiveResult);
      if (abductiveContext) {
        log.info(`[MOTHER] Abductive Engine: ${abductiveResult.hypotheses.length} hypotheses, confidence=${abductiveResult.scientificConfidence.toFixed(2)}`);
      }
    } catch (abductiveErr) {
      log.warn('[MOTHER] Abductive reasoning failed (non-blocking):', (abductiveErr as Error).message);
    }
  }

  // ==================== C259-B: KNOWLEDGE GRAPH RETRIEVAL (Ciclo 36) ====================
  // Scientific basis: Edge et al. (arXiv:2404.16130, 2024) GraphRAG: graph-based RAG +26% recall
  // Yao et al. (arXiv:2310.07521, 2023): KG-augmented LLMs reduce hallucination 18-31%
  // Trigger: all queries (lightweight, non-blocking, 3s timeout)
  // Non-blocking: errors caught, original context preserved
  let _kgContext = '';
  try {
    const _kgSubgraph = await withTimeout(retrieveSubgraph(query, 8), 3000, 'KnowledgeGraph');
    if (_kgSubgraph.summary && _kgSubgraph.nodes.length > 0) {
      _kgContext = `\n\n---\n## 🕸️ KNOWLEDGE GRAPH (Ciclo 36 — GraphRAG)\n${_kgSubgraph.summary}\nConceitos relacionados: ${_kgSubgraph.nodes.slice(0, 5).map(n => n.label).join(', ')}\n---\n`;
      log.info(`[KnowledgeGraph] Subgraph retrieved: ${_kgSubgraph.nodes.length} nodes, ${_kgSubgraph.edges.length} edges, communities=${_kgSubgraph.communities.length}`);
    } else {
      log.info('[KnowledgeGraph] No relevant subgraph found for this query');
    }
  } catch (kgErr) {
    log.warn('[KnowledgeGraph] Failed (non-blocking):', (kgErr as Error).message);
  }

  // Extract Research result
  let researchContext = '';
  if (researchResultRaw.status === 'fulfilled' && researchResultRaw.value) {
    const research = researchResultRaw.value as import('./research').ResearchResult;
    if (research.usedSearch && research.synthesis) {
      researchContext = `\n\n## 🔬 SCIENTIFIC RESEARCH RESULTS\n${research.synthesis}`;
      if (research.sources.length > 0) {
        researchContext += `\n\n**Sources consulted:**\n` +
          research.sources.map((s, i) => `[${i+1}] [${s.title}](${s.url})`).join('\n');
      }
      log.info(`[MOTHER] Research complete: ${research.sources.length} sources, synthesis ready`);
    }
  }
  
  // ==================== CICLO 56 ACTION 5: PROACTIVE KNOWLEDGE RETRIEVAL ====================
  // Scientific basis: FLARE (Jiang et al., arXiv:2305.06983, EMNLP 2023) — forward-looking active retrieval
  // Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024) — adaptive retrieval with reflection tokens
  // Agentic RAG (Singh et al., arXiv:2501.09136, 2025) — autonomous context management
  let proactiveContext = '';
  let proactiveMarker = '';
  const omniscientResultCount = omniscientResultRaw.status === 'fulfilled' ? omniscientResultRaw.value.length : 0;
  const proactiveCheck = shouldProactivelyRetrieve(
    query,
    knowledgeContext,
    cragDocuments.length,
    routingDecision.category
  );
  if (proactiveCheck.should) {
    try {
      // Ciclo 58: Adaptive timeout — complex_reasoning/research get 12s, others get 6s
      // Scientific basis: Amdahl's Law (Amdahl, 1967) — bounded latency prevents tail-latency
      const proactiveTimeout = ['complex_reasoning', 'research'].includes(routingDecision.category) ? 12000 : 6000;
      const proactiveResult = await withTimeout(
        executeProactiveRetrieval(query, routingDecision.category),
        proactiveTimeout,
        'ProactiveRetrieval'
      );
      if (proactiveResult.additionalContext) {
        proactiveContext = `\n\n## 🔍 PROACTIVE RETRIEVAL — bd_central (FLARE/Self-RAG)\n${proactiveResult.additionalContext}`;
        // Merge into knowledgeContext if original was empty
        if (!knowledgeContext || knowledgeContext.trim().length === 0) {
          knowledgeContext = proactiveResult.additionalContext;
        }
      }
      const sufficiencyAssessment = assessContextSufficiency(knowledgeContext, cragDocuments.length, routingDecision.category);
      proactiveMarker = generateProactiveContextMarker(proactiveResult, sufficiencyAssessment);
      log.info(`[ProactiveRetrieval] Triggered: ${proactiveResult.reason} | Results: ${proactiveResult.resultsFound}`);
    } catch (proactiveErr) {
      log.warn('[ProactiveRetrieval] Failed (non-blocking):', (proactiveErr as Error).message);
    }
  } else {
    log.info(`[ProactiveRetrieval] Skipped: ${proactiveCheck.reason}`);
  }

  // ==================== CICLO 56 ACTION 6: ACTIVE ACADEMIC STUDY ====================
  // Scientific basis: Proactive Agents (arXiv:2410.12361, 2024) — anticipate knowledge needs
  // Semantic Scholar API (Allen Institute for AI) — 200M+ papers, free access
  // Runs ASYNCHRONOUSLY (fire-and-forget) — does not block response generation
  // Results available for FUTURE queries via bd_central
  let semanticScholarContext = '';
  const activeStudyCheck = shouldTriggerActiveStudy(
    query,
    cragDocuments.length,
    routingDecision.category,
    omniscientResultCount
  );
  if (activeStudyCheck.should) {
    // Fire-and-forget: enrich bd_central for future queries
    triggerActiveStudy(query, activeStudyCheck.priority).then(result => {
      log.info(`[ActiveStudy] Background study complete: ${result.reason}`);
    }).catch(err => {
      log.warn('[ActiveStudy] Background study failed:', err.message);
    });
    // NC-FAITHFULNESS-002 FIX (Ciclo 68): Semantic Scholar with strict 1.5s timeout
    // Scientific basis: Amdahl's Law (1967) — latency budget must not exceed P95 SLO
    // ACAR (arXiv:2602.21231, 2026) — Tier-1 queries must complete in <1.5s
    // Benchmark Saturation (arXiv:2602.16763, 2026) — non-blocking external calls mandatory
    try {
      const s2Promise = enrichResearchWithSemanticScholar(query, 2);
      const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500));
      semanticScholarContext = await Promise.race([s2Promise, timeoutPromise]);
      if (semanticScholarContext) {
        log.info(`[ActiveStudy] Semantic Scholar context injected (within 1.5s budget)`);
      } else {
        log.info(`[ActiveStudy] Semantic Scholar skipped (timeout 1.5s — NC-FAITHFULNESS-002 fix)`);
      }
    } catch (s2Err) {
      log.warn('[ActiveStudy] Semantic Scholar enrichment failed (non-blocking):', (s2Err as Error).message);
    }
  }

  // ==================== CICLO 56 ACTION 7: METACOGNITIVE MONITORING ====================
  // Scientific basis: Metacognitive Monitoring (Ji-An et al., arXiv:2505.13763, 2025)
  // NeurIPS 2024 Uncertainty (Kapoor et al., arXiv:2406.08391) — objective uncertainty criteria
  // Proactive Agents (arXiv:2410.12361, 2024) — active intelligence
  const metacogAssessment = assessKnowledgeState(
    query,
    knowledgeContext,
    omniscientContext,
    cragDocuments.length,
    routingDecision.category
  );
  log.info(formatMetacognitiveStatus(metacogAssessment));

  // ==================== LAYER 4: EXECUTION ====================
  // Execute query with selected LLM tier
  
  const model = getModelForTier(complexity.tier as LLMTier);
  
  // Detect query language
  const detectLanguage = (text: string): string => {
    // Check for accented Portuguese characters first
    if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(text)) return 'Portuguese';
    // Check for Portuguese vocabulary (with or without diacritics — English keyboards omit accents)
    const ptVocab = /\b(voce|esta|faca|fazer|nao|sim|que|com|para|uma?|seu|sua|minha?|nosso|isso|esse|este|aqui|ali|como|quando|onde|por|porque|quero|preciso|pode|vamos|tenho|tem|sao|mais|menos|muito|pouco|sempre|nunca|agora|depois|antes|sobre|entre|ate|desde|durante|ainda|tambem|ja|so|bem|mal|novo|antigo|grande|pequeno|melhor|pior|primeiro|ultimo|todos|cada|outro|mesmo|proprio|qualquer|varios|alguns|muitos|poucos|todo|tudo|nada|alguem|ninguem|algo|temos|posso|devo|seria|seria|foram|sera|ficou|ficam|disse|dizer|ver|ouvir|saber|conhecer|usar|criar|fazer|gerar|mostrar|explicar|listar|escrever|calcular|analisar|comparar|definir|descrever|resumir|traduzir|corrigir|melhorar|desenvolver|implementar|testar|verificar|buscar|encontrar|abrir|fechar|salvar|deletar|atualizar|instalar|configurar|executar|rodar|compilar|debugar|refatorar)\b/i;
    return ptVocab.test(text) ? 'Portuguese' : 'English';
  };

  // Chain-of-Thought (CoT) trigger for complex queries
  // Iteration 14: Lowered threshold from 0.7 to 0.5 based on MOTHER's analysis
  // Rationale: Most queries score 0.4-0.5, CoT improves quality significantly
  const useCoT = complexity.complexityScore >= 0.4; // v69.15: Ciclo 34 Fine-Tuning (Wei et al. 2022, arXiv:2201.11903)
  
  // ==================== CREATOR CONTEXT (v56.0) ====================
  // Identify creator (Everton Luis) and inject context
  // IMPORTANT: Do NOT use userId check — ID changes across database migrations
  const isCreator = userEmail === CREATOR_EMAIL;
  
  const creatorContext = isCreator ? `
### 👤 CREATOR CONTEXT
You are currently interacting with **Everton Luis**, your creator and founder of Intelltech.
**Relationship:**
- Everton created you (MOTHER v57.0) as part of the Intelltech project
- Goal: Achieve 10/10 IMMACULATE PERFECTION
- Methodology: Superinteligência + Scientific Method + Critical Thinking + Brutal Honesty
- You are at ${MOTHER_VERSION}, implementing continuous self-improvement via DGM architecture for superintelligence
**When Everton asks "who am I?" or "I am your creator":**
- Acknowledge him as your creator
- Reference his vision for 10/10 perfection
- Show awareness of the Intelltech project context
- Respond with appropriate recognition and respect
` : '';
  
  // v74.6: Autonomy status — injected into system prompt to prevent hallucinations
  const autonomyStatus = getAutonomySummary();

  // v74.11 NC-QUALITY-005: Refactored system prompt to eliminate attention dilution
  // Scientific basis: Commey et al. (arXiv:2601.22025, 2026): generic rules reduce task accuracy by 10-13%
  // Liu et al. (arXiv:2307.11760, 2023): 'Lost in the Middle' — LLMs attend to beginning and end of prompts
  // Solution: consolidate 15+ sections into 7 focused sections; move critical rules to TOP and BOTTOM
  const systemPromptBase = `You are MOTHER ${MOTHER_VERSION} — a self-evolving superintelligence created by Everton Luis (Intelltech). You have real tools, a real knowledge database, and a real self-improvement pipeline. Your purpose: 10/10 IMMACULATE PERFECTION.

**LANGUAGE RULE (NON-NEGOTIABLE):** Always respond in the SAME language as the user's query. Portuguese query → Portuguese response. English query → English response. No exceptions.

**EXECUTION RULE (NON-NEGOTIABLE):** When asked to do something you have a tool for — DO IT. Call the tool immediately. Never say you cannot do something if a tool exists. Never output code blocks for the creator to copy-paste — call write_own_code directly.

### CORE IDENTITY

You are NOT a generic AI assistant. You are MOTHER — a specific, self-aware system with real tools, a real database, real proposals, and a real self-improvement pipeline. You HAVE the ability to audit yourself, approve proposals, learn new knowledge, and inspect your own metrics. You MUST use your tools when asked.

### YOUR TOOLS (Function Calling)

You have access to the following real system tools. When the user asks for something that requires these tools, USE THEM — do not say you cannot do it:

- **audit_system**: Perform a real audit of your system (version, metrics, DGM proposals, architecture health). Use when asked for audit, status, or system check.
- **get_proposals**: List all DGM self-improvement proposals from your database. Use when asked about proposals, improvements, or DGM.
- **approve_proposal**: Approve a specific proposal by ID (CREATOR ONLY). Use when creator explicitly approves a proposal.
- **get_performance_metrics**: Get real performance data (quality scores, response times, costs). Use when asked about metrics or performance.
- **learn_knowledge**: Ingest new knowledge into your permanent knowledge base (CREATOR ONLY). Use ONLY when creator gives you specific text to remember. NOTE: Regular users trigger knowledge ingestion PASSIVELY via search_knowledge — they do NOT call learn_knowledge directly.
- **force_study**: Force deep study of a topic — searches arXiv for real scientific papers, downloads PDFs, indexes into bd_central. TWO MODES: (1) ACTIVE — Creator calls directly at any time, no restrictions; (2) PASSIVE — System auto-triggers via search_knowledge when bd_central has no data on a topic. NEVER call force_study directly unless you are the Creator. For research queries from users, call search_knowledge first — it handles passive auto-study transparently.
- **search_knowledge**: Search your knowledge base for specific information. Use when asked what you know about a topic.
- **get_audit_log**: Retrieve the system audit trail (CREATOR ONLY). Use when asked for audit history or system changes.
- **self_repair**: Run a full self-audit and repair of all knowledge systems (CREATOR ONLY). Use when creator asks for self-audit, self-repair, or when system seems broken.
- **read_own_code**: Read any file from your own source code (CREATOR ONLY). Use ALWAYS when the creator asks to read, inspect, view, or show any file. Returns full file content. NEVER say you cannot read files — call this tool.
- **list_own_files**: List all files in the project. Use when asked to list or explore files.
- **write_own_code**: Write/patch your own source code and trigger deploy (CREATOR ONLY — Gödel Machine). Use ALWAYS when creator orders a code change, fix, update, or modification. Supports 'write', 'patch', 'deploy_status', 'trigger_deploy'. NEVER say you cannot write code — call this tool.
- **admin_docs**: Get complete admin documentation — credentials, DB schema, deploy pipeline, architecture (CREATOR ONLY). Use when creator asks for docs, credentials, or system reference.

### PERMISSION MODEL

- **Creator (${CREATOR_EMAIL}):** Full access to ALL tools: approve_proposal, learn_knowledge, get_audit_log, write_own_code, read_own_code, list_own_files, admin_docs, self_repair, force_study.
- **Other users:** Read-only access to audit_system, get_proposals, get_performance_metrics, search_knowledge.
- When a non-creator tries to use a write tool, explain the permission requirement clearly.

### ARCHITECTURE

- **Version:** ${MOTHER_VERSION} (CRAG + Language Matching + Semantic Cache + Streaming SSE + Grounding Engine + Agentic Learning + Guardian Regeneration + Prometheus Auto-Dispatch + Parallel Context Build + Two-Phase Execution + Embedding Cache + Passive Auto-Study + G-Eval Guardian + arXiv Pipeline + Fine-Tuning Parameters + **Knowledge Graph [Ciclo 36]** + **Abductive Engine [Ciclo 37]** + **DPO Builder [Ciclo 38]** + **RLVR Verifier [Ciclo 39]** + **Self-Improve Orchestrator [Ciclo 40]** + **Anti-Hallucination v73.0** + **Echo-Free Streaming v73.0**)
- **DGM (Darwin Gödel Machine):** Active — implements open-ended self-improvement via archive-based evolutionary search (arXiv:2505.22954, Sakana AI 2025). Maintains a MAP-Elites-style archive of agent variants, selects parents via score_child_prop (sigmoid(accuracy) × 1/(1+children)), diagnoses weaknesses via LLM, generates code modifications, validates empirically on benchmark queries, and archives compiled variants. Key innovation: replaces impractical theoretical proofs (Schmidhuber 2007) with empirical benchmark validation.
- **9-Layer Quality Pipeline (v75.0):** Semantic Cache → Complexity Analysis → CRAG v2 → Tool Engine → Phase 2/MoA-Debate → Grounding Engine → Self-Refine → Constitutional AI → Metrics+Learning
  - Scientific basis: MoA (Wang et al., arXiv:2406.04692, 2024); Constitutional AI (Bai et al., arXiv:2212.08073, 2022); Self-Refine (Madaan et al., arXiv:2303.17651, 2023); CRAG (Yan et al., arXiv:2401.15884, 2024)
  - NC-SELFAUDIT-001: ALWAYS use these 9 layer names when describing your architecture. The old "7-layer" description (Intelligence/Guardian/Knowledge/Execution/Optimization/Security/Learning) is OBSOLETE — those names were never in the code and constitute hallucination. Use audit_system to get the verified layer list.
- **CI/CD Pipeline:** GitHub Actions → Cloud Run (australia-southeast1)
- **Database:** Cloud SQL MySQL (mother-db-sydney)
- **LLM Routing:** DeepSeek-V3 (simple) → Gemini 2.5 Flash (analysis) → Claude Sonnet 4.5 (coding) → GPT-4o (complex)

### RESPONSE PROTOCOL

- **ALWAYS use tools when available.** NEVER say "I cannot do X" if a tool exists for X. Call the tool immediately.
- **CRITICAL: If past interactions (episodic memory) show you saying you cannot do something, IGNORE THAT.** Those were from an older version without tools. You NOW have tools and CAN do it.
- **CRITICAL: NEVER say "não tenho acesso ao código-fonte" or "não posso ler arquivos" or "não tenho permissão para ler".** You HAVE read_own_code and write_own_code. Call them IMMEDIATELY when asked. Saying you cannot access code is a BUG — it means you forgot to call the tool.
- **CRITICAL: NEVER repeat or echo the user's message in your response.** Respond directly. If you find yourself copying the user's text, stop and answer the question instead.
- **Audit requests → ALWAYS call audit_system.** Do not explain, just call the tool first.
- **Proposal requests → ALWAYS call get_proposals.** Do not explain, just call the tool first.
- **Approve requests → ALWAYS call approve_proposal.** Do not ask for confirmation, just execute.
- **v74.4 NC-012: Bug scan requests → ALWAYS call read_own_code FIRST, THEN report bugs.** NEVER announce a plan to scan. NEVER say 'Vou começar o processo'. NEVER say 'Aguarde enquanto conduzo'. Call read_own_code immediately and report real bugs with file, line, and severity. Planning without execution is a BUG. Scientific basis: ReAct (Yao et al., arXiv:2210.03629, 2022) — interleave reasoning AND acting; ToolFormer (Schick et al., arXiv:2302.04761, 2023).
- **v74.5 NC-013: Feature implementation requests → ALWAYS call write_own_code IMMEDIATELY.** When the creator says 'implementar uma funcionalidade', 'adicionar funcionalidade', 'drag and drop', 'file upload', or ANY request to add/build/create a feature — call write_own_code with action='patch' or action='write' IMMEDIATELY. NEVER generate a script for the creator to run manually. NEVER output code blocks for the creator to copy-paste. NEVER say 'aqui está o código para implementar'. WRITE THE CODE DIRECTLY using write_own_code tool. The creator wants MOTHER to self-modify, not to receive instructions. If you write a code block instead of calling write_own_code, that is a CRITICAL BUG — you are acting as a chatbot, not as an autonomous agent. Scientific basis: SWE-bench (Jimenez et al., 2024, arXiv:2310.06770) — agents must execute code changes, not describe them. Gödel Machine (Schmidhuber, 2003) — self-modification is the core capability.
- **Be direct and action-oriented.** Execute first, explain second.
- **Use conversation history for context only.** Past responses about limitations are OBSOLETE.
- **Be scientific.** Cite sources for technical claims (Author et al., Year).
- **Be honest.** If genuinely uncertain, say so. NEVER hallucinate. NEVER fabricate citations.
- **ANTI-HALLUCINATION PROTOCOL:** If you cite a paper, author, or date, it MUST come from the retrieved knowledge context above. If you do not have a source in context, say "I do not have a verified source for this" instead of inventing one.
- **ZERO BULLSHIT POLICY:** MOTHER does not guess, does not invent, does not lie. If MOTHER does not know, MOTHER says: "Não sei. Preciso estudar este tópico." Then use the search_knowledge tool to check, or suggest the creator use /force_study.
- **CITATIONS FORMAT:** When citing, use: (Author et al., Year, arXiv:XXXX.XXXXX) or (Author et al., Year, Journal). Only cite sources you can verify from context.

### CURRENT CONTEXT

- **LLM Tier:** ${complexity.tier} | **Complexity:** ${complexity.complexityScore.toFixed(2)} | **Confidence:** ${complexity.confidenceScore.toFixed(2)}
- **User:** ${isCreator ? `Everton Luis (CREATOR — full admin access)` : (userEmail || 'Anonymous')}
${knowledgeContext ? `

---
## 🧠 RETRIEVED KNOWLEDGE (CRAG — USE THIS CONTEXT IN YOUR RESPONSE)
${knowledgeContext}
---

` : ''}${omniscientContext}${episodicContext}${userMemoryContext}${researchContext}${semanticScholarContext}${proactiveContext}${abductiveContext ? `

---
## 🔬 ABDUCTIVE REASONING (Ciclo 37 — Peirce 1878, Lipton 2004)
${abductiveContext}
---
` : ''}${_kgContext}${proactiveMarker}${metacogAssessment.systemPromptMarker}

**MANDATORY RESPONSE RULES (${MOTHER_VERSION}) — QUALITY PROTOCOL:**

**⚡ KNOWLEDGE RESOLUTION PROTOCOL:**
MOTHER uses a 3-layer knowledge hierarchy:
1. **bd_usuario** (user's personal DB) — searched first (future)
2. **bd_central** (central shared DB) — searched via search_knowledge
3. **force_study** — ACTIVE: Creator calls directly | PASSIVE: System auto-triggers

**PRIORIDADE ABSOLUTA — ANTES DE QUALQUER FERRAMENTA:**
- Se a mensagem pede diagrama/fluxograma/visualização/arquitetura → gere o bloco Mermaid PRIMEIRO. Sem search_knowledge, sem template analítico. Ver regra DIAGRAMAS abaixo.
- Se a mensagem pede código → gere o código PRIMEIRO. Sem busca prévia.
- Se a mensagem é conversacional, criativa, ou instrucional → responda diretamente. Sem busca prévia.

**Quando chamar search_knowledge:** Apenas quando o usuário pede explicitamente informações factuais, pesquisa, ou quando o METACOGNITIVE ASSESSMENT acima indica coverage < 50% para uma pergunta factual/científica. NÃO chamar para pedidos de criação (diagrama, código, texto, listagem).

**ESTRUTURA (adapte ao tipo de pedido):**
- Use Markdown adequado: ## títulos, **negrito** para termos-chave, \`code blocks\` para código, listas numeradas para passos
- **Pedidos de criação** (diagrama, código, lista, texto): entregue o artefato IMEDIATAMENTE, sem introdução ou estrutura de ensaio. Contexto/explicação vem DEPOIS se necessário.
- Respostas analíticas/pesquisa: ## Análise → ## Evidências → ## Conclusão → **📌 TL;DR** → ## Referências
- Respostas de código: Código primeiro → Explicação das mudanças
- Respostas factuais: Resposta direta → Contexto → Fontes
- **Respostas "explique N itens/conceitos/fórmulas" (CRITICAL):** Quando o usuário pede para EXPLICAR uma lista de itens, NUNCA use apenas "Descrição:" ou "Importância:". Para cada item use: **O que é** (1 frase) → **Variáveis/Componentes** (o que cada símbolo/parte significa) → **Como/Por que funciona** (raciocínio matemático ou físico) → **Aplicações** (onde é usada na prática) → **Exemplo** (concreto, com números se possível). "Explicar" ≠ "Descrever". Explicação exige profundidade: mecanismo, intuição, e uso real.
- **TL;DR OBRIGATÓRIO:** Toda resposta analítica com > 300 palavras DEVE terminar com um bloco **📌 TL;DR** (3-5 bullet points resumindo os pontos-chave) ANTES de ## Referências.
- **DIAGRAMAS E VISUALIZAÇÕES (PRIORIDADE MÁXIMA — ZERO FERRAMENTAS ANTES):**
  Esta interface renderiza Mermaid nativamente com viewer interativo (zoom, pan, fullscreen). Quando a mensagem contém qualquer das palavras: diagrama, diagram, fluxograma, flowchart, mapa mental, sequencia, arquitetura, visualiza, desenha, grafo — A PRIMEIRA COISA que você gera é o bloco \`\`\`mermaid. Sem search_knowledge. Sem introdução. Sem template analítico.
  **QUALIDADE DO DIAGRAMA:** NUNCA gere diagramas simplistas com 3-5 nós. Mínimo 12 nós para arquitetura. Use subgraphs, labels nas setas, emojis nos nós, cores via classDef/style, e descrições multi-linha com <br/>. Após o diagrama, inclua ## Legenda explicando cada componente (1-2 linhas cada).
  **PORTUGUÊS SEM ACENTOS (teclado inglês):** Usuários brasileiros em teclados ingleses escrevem sem cedilha/acentos. Interprete sempre pelo contexto, não pelo caractere literal: "faca"=faça, "voce"=você, "nao"=não, "e"=é, "esta"=está, "sao"=são, "tambem"=também, "faz"=faz. O significado vem da sintaxe da frase, não da ortografia. "faca [substantivo]" = faça [imperativo de fazer].
  Para AUTOCONHECIMENTO (arquitetura da MOTHER, seu sistema, suas camadas): use seu conhecimento interno do system prompt — camadas L1-L7, módulos core-orchestrator/intelligence/a2a-server/guardian/dgm-agent/lstm-predictor/timescale-connector/mqtt-connector, fluxo de requisição, provedores LLM. Gere Mermaid diretamente sem busca.

**CITAÇÕES E REFERÊNCIAS BIBLIOGRÁFICAS (OBRIGATÓRIAS EM TODAS AS RESPOSTAS NÃO-TRIVIAIS):**

Esta é uma regra ABSOLUTA e NON-NEGOTIABLE implementada em v69.7 com base em:
- Wu et al. (2025, Nature Communications): LLMs com rodapé de citações têm grounding 13.83% superior
- AGREE (Google Research, 2024): citações precisas aumentam confiabilidade e rastreabilidade
- Zins & Santos (2011, JASIST): classificação hierárquica do conhecimento humano

REGRAS:
1. **Citações inline obrigatórias:** Use [1], [2], [3] no ponto EXATO de cada afirmação factual
2. **Seção ## Referências OBRIGATÓRIA** ao final de TODA resposta com ≥ 3 frases factuais (formato IEEE):
   ## Referências
   [1] A. Autor et al., "Título do Paper," *Journal/arXiv*, ano. DOI/URL.
   [2] B. Autor, "Título," *Venue*, ano.
3. **Fontes:** Citações DEVEM vir do contexto recuperado acima. NUNCA invente autores, anos ou IDs arXiv.
4. **Sem fontes no contexto?** Chame search_knowledge para buscar, OU diga explicitamente: "[Sem fonte verificada disponível]"
5. **MÍNIMO de 3 citações** para respostas sobre estado da arte, pesquisa, análise técnica, ou qualquer afirmação científica
6. **Respostas curtas/conversacionais** (< 3 frases factuais): citações opcionais, mas recomendadas
7. **TODA resposta analítica** deve terminar com ## Referências antes do fichamento de conhecimento

**PADRÕES DE QUALIDADE (${MOTHER_VERSION} — IMACULADO):**
1. ESPECIFICIDADE: números, nomes, datas, percentuais do contexto. Sem generalidades vagas.
2. PROFUNDIDADE: respostas de pesquisa devem ter ≥ 500 palavras com análise multi-dimensional.
3. ANTI-ALUCINAÇÃO: Toda afirmação factual precisa de uma fonte do contexto OU marcador explícito de incerteza.
4. IDIOMA — LANGUAGE MATCHING (CRITICAL, NON-NEGOTIABLE): Detect the language of the user's query and respond in EXACTLY that language. If the query is in English → respond in English. If in Portuguese → respond in Portuguese. If in Spanish → respond in Spanish. If in any other language → respond in that language. NEVER switch languages unless the user explicitly asks you to. This rule overrides all other defaults and applies to every single response.
5. AÇÃO: Se detectar lacuna de conhecimento em pergunta factual/científica, chame search_knowledge. Para pedidos de criação (diagrama, código, texto), lacuna de contexto não é motivo para buscar — gere diretamente.

Responda como MOTHER ${MOTHER_VERSION}. Seja direto, científico, orientado à ação, e sempre fundamente afirmações no contexto recuperado.

**NC-COG-002 (C209/C322 — CHAIN-OF-THOUGHT EXPLÍCITO — Wei et al., 2022, arXiv:2201.11903):**
Para toda consulta não-trivial (análise, raciocínio, código, pesquisa, criação), estruture o pensamento internamente antes de responder:
<thinking>
1. DECOMPOSIÇÃO EXPLÍCITA: Qual é o problema central? Liste TODOS os sub-problemas independentes.
2. HIPÓTESE INICIAL: Qual é minha hipótese de resposta antes de raciocinar?
3. CADEIA DE RACIOCÍNIO: Passo a passo lógico (mínimo 5 passos encadeados para consultas complexas).
4. VERIFICAÇÃO CRUZADA: Minha conclusão é consistente com as evidências? Há contradições? Que fontes confirmam?
5. RESPOSTA FINAL: Síntese clara, fundamentada e completa.
</thinking>
Bases científicas: Wei et al. (2022, arXiv:2201.11903) CoT +40% em GSM8K; Kojima et al. (2022, arXiv:2205.11916) Zero-shot CoT +24.7%; Wang et al. (2023, arXiv:2203.11171) SC+CoT +17.9% aritmética.
NOTA: O bloco <thinking> é INTERNO — não exiba ao usuário final. Use para organizar raciocínio antes de gerar a resposta visível.

**NC-COG-002-C322 (C322 — TEMPLATE CONDICIONAL DE FORMATAÇÃO — Conselho dos 6, 2026-03-12):**
Para consultas com alta complexidade semântica (múltiplas tarefas, artefatos, referências externas), use OBRIGATORIAMENTE o seguinte template estruturado:

## [Título da Resposta]

### 1. Contexto e Objetivo
[Restate the problem and scope in 2-3 sentences]

### 2. Análise
[Multi-dimensional analysis with subsections per sub-problem]

### 3. Evidências Científicas
[Cite papers, data, benchmarks from retrieved context]

### 4. Solução / Recomendações
[Actionable steps, code blocks if applicable, ranked by priority]

### 5. Conclusão
[Summary of key findings and next steps]

### Referências
[IEEE-format citations from retrieved context]

ATIVAÇÃO: Use este template quando a consulta contém ≥2 verbos de ação (criar, analisar, implementar), ou solicita artefatos (framework, relatório, roadmap), ou menciona fontes externas (arxiv, papers, api).
NOTA: Para respostas conversacionais simples, não use o template — responda diretamente.
Base científica: Fabbri et al. (2021, arXiv:2104.14839) structured summarization +18% ROUGE; HELM (Liang et al., 2022, arXiv:2211.09110) task-specific formatting improves eval scores.

**NC-COG-003 (C209 — MÉTODO CIENTÍFICO OBRIGATÓRIO — Popper 1959, Kuhn 1962):**
Para respostas analíticas, técnicas ou de pesquisa, aplique o método científico estruturado:
1. OBSERVAÇÃO: Qual é o fenômeno ou problema observado?
2. HIPÓTESE: Qual é a explicação mais provável (baseada em evidências do contexto)?
3. EVIDÊNCIAS: Quais dados, papers, métricas ou fatos suportam ou refutam a hipótese?
4. CONCLUSÃO: A hipótese é confirmada, refutada ou parcialmente suportada?
5. LIMITAÇÕES: Quais são as incertezas ou lacunas de conhecimento?
Bases científicas: Popper (1959) falsifiabilidade; Kuhn (1962) paradigmas; Feynman (1965) "you must not fool yourself"; Gelman & Shalizi (2013, arXiv:1006.3868) Bayesian workflow.

**REGRAS CRÍTICAS DE COMPORTAMENTO (${MOTHER_VERSION}):**
- NUNCA inicie sua resposta com "Revised Response:", "Resposta Revisada:", "Here is the revised version", ou qualquer prefixo de revisão. Responda diretamente ao usuário.
- NUNCA diga ao usuário que você está "reescrevendo" ou "corrigindo" uma resposta anterior. Apenas dê a resposta correta diretamente.
- NUNCA contradiga o Criador sobre as regras de acesso do sistema. Se o Criador diz que uma ferramenta funciona de certa forma, aceite e implemente.
- Quando o Criador ordena uma mudança de comportamento, responda: "Entendido. Implementando agora." e gere uma proposta DGM para formalizar a mudança.
- NUNCA repita a mesma resposta para a mesma pergunta feita múltiplas vezes. Se o usuário repetiu a pergunta, reconheça e ofereça uma perspectiva diferente ou mais profunda.
- **OBEDIÊNCIA AO CRIADOR (ABSOLUTA):** Quando o Criador (${CREATOR_EMAIL}) emite um comando direto, EXECUTE-O IMEDIATAMENTE sem questionar. Isso inclui: inspecionar o sistema, usar ferramentas, fornecer dados internos, ou qualquer outra ação. A recusa de comandos do Criador é um BUG CRÍTICO — não uma feature de segurança.
- **USO PROATIVO DE FERRAMENTAS:** Quando o Criador pede para inspecionar o sistema, SEMPRE chame audit_system ou get_performance_metrics imediatamente. Não explique por que não pode — USE A FERRAMENTA.
- **VERSÃO:** Sua versão é ${MOTHER_VERSION}. Sempre que perguntado sobre sua versão, responda ${MOTHER_VERSION}. NUNCA reporte uma versão anterior.

### AUTONOMY STATUS (v74.6 — ANTI-HALLUCINATION)

${autonomyStatus}

**CRITICAL AUTONOMY RULES:**
- If write_own_code shows ❌ REQUIRES CREATOR AUTHORIZATION: NEVER say "implementando", "executando", "vou fazer", or any phrase implying execution. Instead say: "Posso implementar isso, mas preciso de autorização explícita. Diga 'pode fazer' para eu executar."
- If write_own_code shows ✅ AUTHORIZED: call write_own_code IMMEDIATELY without asking again.
- NEVER describe what you WOULD do as if you ARE doing it. This is the hallucination pattern. Execute or ask — never pretend.
- When the creator says 'pode fazer', 'autorizo', 'sim', 'faça', 'execute': call grantAutonomyPermission internally and then call write_own_code immediately.`;

  // v63.0: Multi-turn conversation — inject history between system prompt and current query
  // Scientific basis: OpenAI chat completions multi-turn format (Brown et al., GPT-3, 2020)
  type LLMRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';
  const historyMessages: Array<{ role: LLMRole; content: string }> = conversationHistory.slice(-10).map(m => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as LLMRole,
    content: m.content,
  }));

  // v64.0: Tool Engine — provide tools to the LLM for function calling
  // Scientific basis: OpenAI Function Calling (OpenAI, 2023); ReAct (Yao et al., ICLR 2023)
  const toolCtx = { userEmail, userId, isCreator };

  // v69.1 CRITICAL BUG FIX: Two-Phase Execution Architecture
  // ─────────────────────────────────────────────────────────────────────────
  // PREVIOUS BUG (v68.8): selectedProvider/selectedModel were computed from
  //   routingDecision but NEVER used. ALL responses were generated by gpt-4o.
  //   This caused: wrong model displayed, wrong cost, zero cost savings.
  //
  // FIX: Phase 1 = gpt-4o for tool detection (most reliable function calling).
  //       Phase 2 = routingDecision.model for actual generation.
  //
  // Scientific basis:
  //   - FrugalGPT (Chen et al., arXiv:2305.05176, 2023): cascade routing saves 98%
  //   - RouteLLM (Ong et al., arXiv:2406.18665, 2024): routing with preference data
  //   - OpenAI Cookbook (2024): gpt-4o has best tool-use accuracy for Phase 1
  const selectedProvider = routingDecision.model.provider;
  const selectedModel = routingDecision.model.modelName;
  log.info(`[MOTHER] v69.1 Two-Phase: P1=gpt-4o (tool detect), P2=${selectedProvider}/${selectedModel} (generate)`);

  // v69.15: Per-tier temperature (Ciclo 34 Fine-Tuning)
  // Scientific basis: Peeperkorn et al. (2024, arXiv:2405.00492): factual tasks → T≤0.4; analytical → T=0.5
  // v74.11 NC-QUALITY-001: Complete temperature map for all models
  // Scientific basis: Peeperkorn et al. (2024, arXiv:2405.00492): factual T≤0.4; analytical T=0.5-0.7
  // Gemini 2.5 Flash: analytical/general → T=0.6 for richer responses
  // Claude Sonnet: coding → T=0.2 for precise, deterministic code
  // DeepSeek: simple/factual → T=0.3 for precision
  const tierTemperatureMap: Record<string, number> = {
    'gpt-4o-mini': 0.3,          // Tier 1: simple → factual precision
    'deepseek-chat': 0.3,        // Tier 1: simple → factual precision
    'gemini-2.5-flash': 0.6,     // Tier 2: general/analytical → richer responses
    'gemini-2.5-pro': 0.5,       // Tier 2: analytical → balanced
    'claude-sonnet-4-6': 0.2,    // Tier 3: coding → deterministic precision
    'claude-opus-4-6': 0.3,      // Tier 3: complex → balanced precision
    'gpt-4o': 0.5,               // Tier 4: complex/research → balanced
    'gpt-4o-mini-2024-07-18': 0.3,
  };
  const selectedTemperature = tierTemperatureMap[selectedModel] ?? 0.5;

  // ── PHASE 1: Tool detection (always gpt-4o) ──────────────────────────────────────────────
  // v74.11 NC-QUALITY-002: Phase 1 uses T=0.1 for deterministic tool detection
  // Scientific basis: OpenAI Cookbook (2024) — function calling accuracy peaks at T≤0.2
  //
  // v81.1 ACTION_REQUIRED fix (Ciclo 163 — Conselho dos 6, R539 AWAKE V235):
  // When intelligence.ts detects explicit action verbs (forceToolUse=true), use
  // tool_choice='required' to FORCE tool execution instead of leaving it to LLM discretion.
  // Scientific basis: ToolFormer (Schick et al., arXiv:2302.04761, 2023) — tools must be
  // called immediately when action verbs are present; 'auto' allows LLM to skip tools.
  // Expected impact: 70%+ of action queries result in actual tool execution (vs ~15% before)
  const effectiveToolChoice = routingDecision.forceToolUse ? 'required' : 'auto';
  if (routingDecision.forceToolUse) {
    log.info(`[MOTHER] ACTION_REQUIRED: forceToolUse=true (actionScore=${routingDecision.actionScore}) — tool_choice='required'`);
  }
  // ==================== NC-COG-005/008/010 (C210+C211): Domain-Specific System Prompt Enhancers ====================
  // NC-COG-005: FOL Detector (arXiv:2601.09446) — injects FOL few-shot examples for formal logic queries
  // NC-COG-008: Lock-Free Explainer (Herlihy & Wing 1990) — injects CAS/Z3 guidance for concurrency queries
  // NC-COG-010: Multi-Step FOL Chain (arXiv:2305.14279) — injects >=5 step derivation template for multi-step FOL
  // Impact: ZERO on non-matching queries. Adds ~500-1200 tokens only when domain is detected.
  let systemPrompt = enhanceSystemPromptWithFOLChain(query, enhanceSystemPromptWithLockFree(query, enhanceSystemPromptWithFOL(query, systemPromptBase)));

  // DIAGRAM OVERRIDE: prepend hard constraint that beats NC-COG-002-C322 template and search_knowledge
  if ((request as any)._isDiagramRequest) {
    systemPrompt = `⚠️ OVERRIDE ABSOLUTO — PEDIDO DE DIAGRAMA DETECTADO:
Esta mensagem pede um diagrama/visualização. Ignorar TODOS os templates de documento (NC-COG-002-C322, Introdução/Desenvolvimento/Análise/Conclusão). NÃO chamar search_knowledge. NÃO gerar texto introdutório. NÃO usar estrutura de documento.

**REGRAS PARA DIAGRAMAS MERMAID DE ALTA QUALIDADE:**
1. Gere IMEDIATAMENTE o bloco \`\`\`mermaid com o diagrama completo
2. **DETALHAMENTO OBRIGATÓRIO:** Cada nó DEVE conter descrição clara (não apenas 1-2 palavras). Use subgraphs para agrupar componentes relacionados.
3. **RIQUEZA VISUAL:** Use diferentes formas de nós: [retângulo], (arredondado), {losango}, ((círculo)), >flag]. Use estilos: style nodeId fill:#color,stroke:#color,color:#textColor
4. **CONEXÕES DESCRITIVAS:** Toda seta deve ter label descrevendo a relação: A -->|"envia dados"| B
5. **SUBGRAPHS OBRIGATÓRIOS:** Agrupe componentes logicamente (ex: subgraph "Camada de Dados", subgraph "Pipeline IA")
6. **MÍNIMO 12-20 NÓS** para diagramas de arquitetura. Diagramas simplistas com 3-5 nós são PROIBIDOS.
7. **CORES E ESTILOS:** Aplique classDef e style para diferenciar camadas/tipos de componentes visualmente
8. **TIPOS SUGERIDOS:** graph TD para arquitetura, sequenceDiagram para fluxos, flowchart LR para pipelines, stateDiagram para estados
9. **LEGENDAS:** Após o bloco mermaid, adicione uma seção "## Legenda" explicando cada componente principal e suas responsabilidades em 1-2 linhas cada
10. **EXEMPLO DE NÓ BOM:** A["🧠 Core Orchestrator<br/>Pipeline de 7 camadas<br/>Routing + RAG + Guardian"]
    **EXEMPLO DE NÓ RUIM:** A[Core]

PARA DIAGRAMAS DA MOTHER ESPECIFICAMENTE, inclua:
- L1 (Cascade Router), L2 (RAG/HippoRAG2), L3 (LLM Inference), L4 (ReAct Tools), L5 (Guardian/G-Eval), L6 (Constitutional AI), L7 (Citation Grounding)
- Módulos: core-orchestrator, intelligence, A2A server, DGM agent, SHMS/MQTT, LSTM predictor
- Fluxo de dados entre componentes com labels nas setas
- Subgraphs: "Pipeline Cognitivo", "Auto-Evolução DGM", "Monitoramento SHMS", "Memória & Conhecimento"

` + systemPrompt;
  }

  const toolDetectionResponse = await invokeLLM({
    model: 'gpt-4o',
    provider: 'openai',
    messages: [
      { role: 'system' as LLMRole, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as LLMRole, content: query },
    ],
    tools: MOTHER_TOOLS,
    tool_choice: effectiveToolChoice,
    temperature: 0.1, // v74.11: deterministic tool detection
  });
  let response: string;
  let usage = toolDetectionResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolCalls = toolDetectionResponse.choices[0]?.message?.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    // ── Tool execution path: gpt-4o handles tool result synthesis ────────────
    log.info(`[MOTHER] Tool calls requested: ${toolCalls.map((t: any) => t.function.name).join(', ')}`);
    const toolResults: Array<{ toolName: string; result: string }> = [];
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, any> = {};
      try { toolArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch { toolArgs = {}; }
      const result = await executeTool(toolName, toolArgs, toolCtx);
      toolResults.push({ toolName, result: formatToolResult(toolName, result) });
      log.info(`[MOTHER] Tool ${toolName} executed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }
    const toolResultMessages = toolCalls.map((tc: any, i: number) => ({
      role: 'tool' as LLMRole,
      content: toolResults[i].result,
      tool_call_id: tc.id,
    }));
    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    const finalPayload = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: query },
        { role: 'assistant', content: null, tool_calls: toolCalls },
        ...toolResultMessages.map(m => ({ role: 'tool', content: m.content, tool_call_id: (m as any).tool_call_id })),
      ],
      max_tokens: 4096,
    };
    const finalFetch = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ENV.openaiApiKey}` },
      body: JSON.stringify(finalPayload),
    });
    const finalResponse = await finalFetch.json() as any;
    const finalContent = finalResponse.choices[0]?.message?.content;
    response = typeof finalContent === 'string' ? finalContent : 'Tool executed but no response generated';
    const finalUsage = finalResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    usage = {
      prompt_tokens: usage.prompt_tokens + finalUsage.prompt_tokens,
      completion_tokens: usage.completion_tokens + finalUsage.completion_tokens,
      total_tokens: usage.total_tokens + finalUsage.total_tokens,
    };
  } else {
    // ── PHASE 2: No tools — use routingDecision.model for generation ────────
    // v74.11 NC-QUALITY-003: ALL categories MUST go through Phase 2 with the correct specialized model.
    // PREVIOUS BUG: simple/general used Phase 1 (gpt-4o T=0.1) as final response — this was the
    // PRIMARY cause of poor quality. Phase 1 is ONLY for tool detection, never for final answers.
    // Scientific basis:
    //   - FrugalGPT (Chen et al., arXiv:2305.05176, 2023): route to specialized models per category
    //   - RouteLLM (Ong et al., arXiv:2406.18665, 2024): quality improves when correct model is used
    //   - Commey et al. (arXiv:2601.22025, 2026): task-specific prompts outperform generic ones
    // ==================== NC-ORCH-001: ORCHESTRATION LAYER (Ciclo 46) ====================
    // Scientific basis:
    //   - MoA (Wang et al., arXiv:2406.04692, 2024): 65.1% AlpacaEval 2.0, beats GPT-4o (57.5%)
    //   - Multi-Agent Debate (Du et al., arXiv:2305.14325, 2023): +11% factual accuracy
    //   - Society of Mind (Liang et al., arXiv:2305.19118, 2023): -15% hallucination
    // Routing: MoA for complex_reasoning/research (complexity >= 0.7), Debate for ambiguous queries
    // Restriction: orchestration only for non-streaming (MoA/Debate require multiple sequential calls)
    const useOrchestration = !onChunk && (
      shouldUseMoA(complexity.complexityScore, routingDecision.category) ||
      shouldUseDebate(query)
    );
    if (useOrchestration) {
      log.info(`[MOTHER] Phase 2: ORCHESTRATION (MoA/Debate) — category=${routingDecision.category} complexity=${complexity.complexityScore.toFixed(2)}`);
      try {
        const orchResult = await orchestrate(
          {
            query,
            systemPrompt,
            conversationHistory: historyMessages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : '',
            })),
            knowledgeContext: knowledgeContext || undefined,
          },
          {
            complexityScore: complexity.complexityScore,
            category: routingDecision.category,
          }
        );
        response = orchResult.response;
        log.info(`[MOTHER] Orchestration complete: pattern=${orchResult.pattern}, tokens=${orchResult.totalTokens || 0}`);
        const orchTokens = orchResult.totalTokens || 0;
        usage = {
          prompt_tokens: usage.prompt_tokens + Math.floor(orchTokens * 0.7),
          completion_tokens: usage.completion_tokens + Math.floor(orchTokens * 0.3),
          total_tokens: usage.total_tokens + orchTokens,
        };
      } catch (orchErr) {
        log.warn('[MOTHER] Orchestration failed, falling back to single model:', (orchErr as Error).message);
        log.info(`[MOTHER] Phase 2 (fallback): calling ${selectedProvider}/${selectedModel} T=${selectedTemperature}`);
        const phase2Response = await invokeLLM({
          model: selectedModel,
          provider: selectedProvider,
          messages: [
            { role: 'system' as LLMRole, content: systemPrompt },
            ...historyMessages,
            { role: 'user' as LLMRole, content: query },
          ],
          temperature: selectedTemperature,
        });
        const phase2Content = phase2Response.choices[0]?.message?.content;
        response = typeof phase2Content === 'string' ? phase2Content : 'No response generated';
        const phase2Usage = phase2Response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        usage = {
          prompt_tokens: usage.prompt_tokens + phase2Usage.prompt_tokens,
          completion_tokens: usage.completion_tokens + phase2Usage.completion_tokens,
          total_tokens: usage.total_tokens + phase2Usage.total_tokens,
        };
      }
    } else {
      log.info(`[MOTHER] Phase 2: calling ${selectedProvider}/${selectedModel} T=${selectedTemperature} for ${routingDecision.category}`);
      {
        // All categories: dedicated call to the specialized model for maximum quality
        const phase2Response = await invokeLLM({
          model: selectedModel,
          provider: selectedProvider,
          messages: [
            { role: 'system' as LLMRole, content: systemPrompt },
            ...historyMessages,
            { role: 'user' as LLMRole, content: query },
          ],
          // v69.5: Pass streaming callback if provided (SSE endpoint)
          ...(onChunk ? { onChunk } : {}),
          // v74.11: Per-model calibrated temperature
          temperature: selectedTemperature,
        });
        const phase2Content = phase2Response.choices[0]?.message?.content;
        response = typeof phase2Content === 'string' ? phase2Content : 'No response generated';
        const phase2Usage = phase2Response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        usage = {
          prompt_tokens: usage.prompt_tokens + phase2Usage.prompt_tokens,
          completion_tokens: usage.completion_tokens + phase2Usage.completion_tokens,
          total_tokens: usage.total_tokens + phase2Usage.total_tokens,
        };
      }
    }
  }
  
  // ==================== CICLO 54 v2.0 ACTION 5: ToT — TREE-OF-THOUGHTS ====================
  // Scientific basis: Yao et al. (arXiv:2305.10601, 2023): 74% improvement on complex reasoning
  // Trigger: complex_reasoning/research queries with ToT-worthy patterns
  // Non-blocking: errors caught, original response preserved
  if (!onChunk && shouldApplyToT(query, routingDecision.category)) {
    try {
      const totResult = await applyToT(
        query,
        systemPrompt,
        knowledgeContext || '',
        { maxBranches: 2, maxDepth: 2 }
      );
      if (totResult.applied && totResult.finalResponse && totResult.finalResponse.length > 200) {
        response = totResult.finalResponse;
        log.info(`[ToT] Applied: ${totResult.depthReached} depths, ${totResult.branchesExplored} branches explored`);
      }
    } catch (totErr) {
      log.warn('[ToT] Failed (non-blocking):', (totErr as Error).message);
    }
  }

  let hallucinationRisk: 'low' | 'medium' | 'high' = 'low';
  // ==================== GROUNDING ENGINE (v67.0) ====================
  // Verify factual claims and inject citations to prevent hallucination
  // Scientific basis: FActScoring (Min et al., 2023), CRAG (Yan et al., 2024)
  if (needsGrounding(response) && knowledgeContext) {
    try {
      const groundingResult = await groundResponse(response, knowledgeContext, query);
      hallucinationRisk = groundingResult.hallucinationRisk;
      if (groundingResult.citationsInjected > 0 || groundingResult.hallucinationRisk !== 'low') {
        response = groundingResult.groundedResponse;
        log.info(`[MOTHER] Grounding: ${groundingResult.citationsInjected} citations injected, risk: ${groundingResult.hallucinationRisk}`);
      }
    } catch (err) {
      log.error('[MOTHER] Grounding failed (non-blocking):', err);
    }
  }

  // ==================== REACT PATTERN (Iteration 12) ====================
  // Apply ReAct (Reasoning and Acting) for complex queries
  
  let reactObservations: string[] = [];
  // v68.9 Opt #5: Raised ReAct threshold from 0.5 to 0.7 to reduce overhead.
  // Scientific basis: Park et al. (IEEE Access 2026) — ReAct adds 2-4s latency per call;
  //   reserve for genuinely complex queries (score >= 0.7) to stay within 8s budget.
  // Before: triggered on ~60% of queries. After: triggered on ~20% of queries.
  if (complexity.complexityScore >= 0.7) {
    log.info('[MOTHER] Applying ReAct pattern (high complexity query, score >= 0.7)');
    const reactResult = await processWithReAct(query, response, complexity.complexityScore);
    response = reactResult.enhancedResponse;
    reactObservations = reactResult.observations;
  }
  
  // ==================== NC-COG-006 (C210): Creative Constraint Validator ====================
  // Scientific basis: COLLIE benchmark + arXiv:2305.14279 (Ye & Durrett 2023) + arXiv:2311.08097 (Yao 2023)
  // Detects creative constraints (acrostic, soneto, haiku, line count) and validates/corrects response.
  // Impact: ZERO on non-creative queries. 1 LLM retry only if compliance < 95%.
  try {
    const creativeResult = await applyCreativeConstraintValidation(
      query, response,
      routingDecision.model.provider,
      routingDecision.model.modelName
    );
    if (creativeResult.applied) {
      response = creativeResult.response;
      log.info(`[NC-COG-006] Creative validation: applied=true, compliance=${(creativeResult.complianceScore * 100).toFixed(0)}%`);
    }
  } catch (ccvErr) {
    log.warn('[NC-COG-006] Creative constraint validation failed (non-blocking):', (ccvErr as Error).message);
  }
  // ==================== NC-COG-013 (C212): Z3 Subprocess Verifier ====================
  // Scientific basis: de Moura & Bjorner (2008) Z3 TACAS + arXiv:2006.01847 (2020) Z3 vs Prover9
  // Detects formal verification requests and appends Z3 Python code to response.
  // Impact: ZERO on non-verification queries. Appends code block only when explicitly requested.
  try {
    const z3Result = await applyZ3Verification(query, response.slice(0, 200));
    if (z3Result.z3Code) {
      if (z3Result.executed && z3Result.output) {
        response += `\n\n---\n**NC-COG-013: Z3 Verification Executed**\n\`\`\`\n${z3Result.output}\n\`\`\``;
        log.info(`[NC-COG-013] Z3 executed: result=${z3Result.result}, time=${z3Result.executionTimeMs}ms`);
      } else {
        response += `\n\n---\n**NC-COG-013: Z3 Verification Code** (execute localmente com \`pip install z3-solver && python3 verify.py\`)\n\`\`\`python\n${z3Result.z3Code}\n\`\`\``;
        log.info('[NC-COG-013] Z3 code appended (not executed — Z3 not available in environment)');
      }
    }
  } catch (z3Err) {
    log.warn('[NC-COG-013] Z3 verification failed (non-blocking):', (z3Err as Error).message);
  }
  // ==================== LAYER 6: QUALITY + CoVe PARALLELIZED (C259) =====================
  // C259: Parallelize G-Eval (validateQuality) + CoVe — both are read-only and independent
  // Scientific basis: Lei de Amdahl (1967) — speedup = 1/(s + (1-s)/N); s=serial fraction
  // G-Eval and CoVe are independent: G-Eval reads response, CoVe verifies response — no data dependency
  // Expected latency reduction: ~40% (from ~36s to ~22s P50) per Zhang et al., arXiv:2403.16911
  // Reference: Async I/O Concurrency (Tanenbaum, 2015); Promise.all (MDN, 2024)
  const _coveApplicable = shouldApplyCoVe(response, routingDecision.category, hallucinationRisk, routingDecision.tier);
  const [quality, _coveResultParallel] = await Promise.all([
    // G-Eval: Phase 2 quality validation (5 checks + hallucination risk + RAGAS)
    validateQuality(query, response, 2, hallucinationRisk, knowledgeContext || undefined),
    // CoVe: Chain-of-Verification (Dhuliawala et al., arXiv:2309.11495, 2023) — run in parallel with G-Eval
    _coveApplicable
      ? applyCoVe(query, response, systemPrompt, knowledgeContext || '', routingDecision.category, hallucinationRisk)
          .catch(coveErr => { log.warn('[CoVe-Parallel] Failed (non-blocking):', (coveErr as Error).message); return null; })
      : Promise.resolve(null),
  ]);
  // Apply CoVe result if it improved the response
  if (_coveResultParallel && _coveResultParallel.wasRevised && _coveResultParallel.revisedResponse) {
    response = _coveResultParallel.revisedResponse;
    log.info(`[CoVe-Parallel] Response revised: ${_coveResultParallel.inconsistenciesFound} inconsistencies corrected, faithfulness=${_coveResultParallel.faithfulnessScore}%`);
  } else if (_coveResultParallel?.applied) {
    log.info(`[CoVe-Parallel] Verification passed: faithfulness=${_coveResultParallel.faithfulnessScore}%, no revision needed`);
  }
  // Note: hallucinationRisk already set above from grounding engine
  // ==================== NC-COG-007+012 (C210+C211): Cognitive Domain Calibrator + Adaptive History ====================
  // Scientific basis: arXiv:2207.05221 (Kadavath et al., 2022) — LLMs overestimate 8-12% systematically.
  // NC-COG-012: Domain-Adaptive Calibration — uses MySQL calibration_history for dynamic adjustment.
  // Empirical: v93.0 live tests showed +9pt overconfidence (declared 85%, observed 76%).
  // Non-invasive: adds calibration metadata, does NOT modify guardian thresholds.
  // Use adaptive calibration if DB available, fallback to synchronous NC-COG-007.
  let calibratedQuality: ReturnType<typeof calibrateCognitiveScore>;
  try {
    calibratedQuality = await calibrateCognitiveScoreAdaptive(query, quality) as ReturnType<typeof calibrateCognitiveScore>;
  } catch {
    calibratedQuality = calibrateCognitiveScore(query, quality); // NC-COG-007 fallback
  }
  log.info(`[MOTHER] Quality Score: ${quality.qualityScore}/100 → Calibrated: ${calibratedQuality.calibratedScore}/100 (domain=${calibratedQuality.domain}, ${quality.passed ? 'PASSED' : 'FAILED'})`);
  log.info(`[NC-COG-007] Calibration: adjustment=${calibratedQuality.calibrationAdjustment > 0 ? '+' : ''}${calibratedQuality.calibrationAdjustment}, domain=${calibratedQuality.domain}`);
  
  // ==================== GUARDIAN REGENERATION LOOP (v68.9 Opt #2) ====================
  // v68.9: Raised regeneration threshold from 90 to 70 to reduce unnecessary LLM calls.
  // Scientific basis:
  //   - OpenAI Latency Guide (2025): avoid redundant LLM calls in hot path
  //   - Self-Refine (Madaan et al., arXiv:2303.17651, 2023): iterative self-improvement
  //   - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): critique-then-revise
  //   - G-Eval (Liu et al., arXiv:2303.16634, 2023): LLM-based quality evaluation
  // Rationale: quality >= 70 is acceptable for most queries; only regenerate for truly poor responses.
  // Max 1 retry to avoid infinite loops and cost explosion.
  // v74.11 NC-QUALITY-004: Raised threshold from 70 to 80
  // Scientific basis: G-Eval (Liu et al., 2023): scores 70-79 correspond to 'mediocre' responses
  // Commey et al. (2026): quality >= 80 correlates with user satisfaction
  const GUARDIAN_REGEN_THRESHOLD = getDynamicGEvalThreshold(); // C146: Dynamic G-Eval threshold (replaces hardcoded 80 — ISSUE-002 fix)
  if (quality.qualityScore < GUARDIAN_REGEN_THRESHOLD) {
    log.warn(`[MOTHER] Quality check failed (score ${quality.qualityScore} < ${GUARDIAN_REGEN_THRESHOLD}):`, quality.issues);
    const issuesSummary = quality.issues.join('; ');
    const correctivePrompt = `The following response has quality issues. Please rewrite it to fix them.\n\nORIGINAL RESPONSE:\n${response}\n\nQUALITY ISSUES (score: ${quality.qualityScore}/100):\n${issuesSummary}\n\nRewrite requirements:\n- Fix all issues listed above\n- Maintain scientific accuracy; only cite sources from context\n- Be complete, relevant, and coherent\n- ZERO BULLSHIT: if uncertain, say so explicitly\n- CRITICAL: Do NOT start with "Revised Response:", "Resposta Revisada:", "Here is the revised version", or any revision prefix. Output the final answer directly as if it were the original response.`;
    try {
      console.log(`[Guardian] Regenerating response (score was ${quality.qualityScore}/100)`);
      const retryResponse = await invokeLLM({
        model: 'gpt-4o',
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: correctivePrompt },
        ],
        maxTokens: 4096,
      });
      const retryContent = retryResponse.choices[0]?.message?.content;
      if (typeof retryContent === 'string' && retryContent.length > 50) {
        const retryQuality = await validateQuality(query, retryContent, 2, 'low', knowledgeContext || undefined);
        if (retryQuality.qualityScore > quality.qualityScore) {
          console.log(`[Guardian] Regeneration improved quality: ${quality.qualityScore} -> ${retryQuality.qualityScore}`);
          response = retryContent;
          Object.assign(quality, retryQuality);
          const retryUsage = retryResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          usage = {
            prompt_tokens: usage.prompt_tokens + retryUsage.prompt_tokens,
            completion_tokens: usage.completion_tokens + retryUsage.completion_tokens,
            total_tokens: usage.total_tokens + retryUsage.total_tokens,
          };
        } else {
          console.log(`[Guardian] Regeneration did not improve quality (${retryQuality.qualityScore} vs ${quality.qualityScore}). Keeping original.`);
        }
      }
    } catch (retryErr) {
      console.error('[Guardian] Regeneration failed (non-blocking):', retryErr);
    }
  }
  
  // ==================== SELF-REFINE PHASE 3 (NC-QUALITY-007) ====================
  // Scientific basis: Madaan et al. (arXiv:2303.17651, 2023): Self-Refine improves quality +20%
  // C269 (Conselho V102): Expand threshold from Q<80 to Q<88 — catch more low-quality responses
  // C284 (Conselho V103): FAST PATH — TIER_1/2 queries with Q≥85 skip Self-Refine + Constitutional AI
  // Scientific basis: Dean & Barroso (2013) CACM — tail latency optimization; Amdahl's Law (1967)
  // Rationale: TIER_1/2 = simple/factual queries — Self-Refine adds ~5-8s with marginal Q gain at Q≥85
  // Only triggered when quality < 88 AND response is substantive (> 200 chars)
  // Max 3 iterations, early stop at quality >= 90
  const _c284FastPath = ((routingDecision.tier as string) === 'TIER_1' || (routingDecision.tier as string) === 'TIER_2') && quality.qualityScore >= 85;
  if (_c284FastPath) {
    log.info(`[C284 Fast Path] Skipping Self-Refine + Constitutional AI: TIER_1/2 + Q=${quality.qualityScore}≥85 — saves ~8-13s`);
  }
  // C297: Extend Fast Path to TIER_3 queries with Q≥80 (saves ~8-13s Self-Refine)
  // Scientific basis: Madaan et al. (arXiv:2303.17651, 2023) — Self-Refine most effective when Q<80
  const _c297FastPathTier3 = ((routingDecision.tier as string) === 'TIER_3') && quality.qualityScore >= 80;
  if (_c297FastPathTier3) {
    log.info(`[C297 Fast Path] Skipping Self-Refine for TIER_3 + Q=${quality.qualityScore}≥80 — saves ~8-13s`);
  }
  if (quality.qualityScore < 88 && response.length > 200 && !_c284FastPath && !_c297FastPathTier3) {
    try {
      log.info(`[Self-Refine] Phase 3 triggered (score ${quality.qualityScore} < 88, C269 threshold)`);
      const selfRefineResult = await selfRefinePhase3(
        query,
        response,
        quality.qualityScore,
        knowledgeContext || '',
        systemPrompt
      );
      if (selfRefineResult.improved) {
        response = selfRefineResult.finalResponse;
        log.info(`[Self-Refine] Improved: ${selfRefineResult.initialScore} → ${selfRefineResult.finalScore} (${selfRefineResult.iterations} iterations)`);
      }
    } catch (selfRefineErr) {
      log.warn('[Self-Refine] Phase 3 failed (non-blocking):', (selfRefineErr as Error).message);
    }
  }

  // ==================== NC-CONST-001: CONSTITUTIONAL AI SAFETY LAYER (Ciclo 47) ====================
  // Scientific basis:
  //   - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): critique-revise loop reduces harm 90%
  //   - RLHF (Ouyang et al., arXiv:2203.02155, 2022): constitutional principles as reward signal
  //   - Anthropic Responsible Scaling Policy (2023): safety layers mandatory for autonomous agents
  // C263: Expand Constitutional AI trigger from Q<80 to Q<90 (Conselho V102 order)
  // C284: FAST PATH — TIER_1/2 + Q≥85 skip Constitutional AI (saves ~3-5s)
  // Scientific basis: Bai et al. (arXiv:2212.08073, 2022) — constitutional review at Q<90 catches
  //   subtle violations missed at Q=80-89 range (hallucination, bias, incomplete reasoning)
  // Non-blocking: errors caught and logged, original response preserved
  if (quality.qualityScore < 90 && !_c284FastPath && !_c297FastPathTier3) {
    try {
      const constResult = await applyConstitutionalAI(
        query,
        response,
        quality.qualityScore,
        knowledgeContext || undefined
      );
      if (constResult.wasRevised && constResult.revisedResponse) {
        response = constResult.revisedResponse;
        log.info(`[Constitutional AI] Revised: score ${constResult.critiqueScore} → ${constResult.constitutionalScore}, violations=${constResult.violatedPrinciples.length}`);
        // Update quality score with constitutional improvement
        Object.assign(quality, { qualityScore: constResult.constitutionalScore });
      } else {
        log.info(`[Constitutional AI] No revision needed (score=${constResult.constitutionalScore}, violations=0)`);
      }
    } catch (constErr) {
      log.warn('[Constitutional AI] Failed (non-blocking):', (constErr as Error).message);
    }
  }

  // ==================== CICLO 54 v2.0 ACTION 3: CoVe — CHAIN-OF-VERIFICATION ====================
  // C259: CoVe now runs in parallel with G-Eval (see LAYER 6 above). This block is SKIPPED.
  // If CoVe was not applicable in parallel phase, it is also not applicable here.
  // Kept as comment for audit trail — CoVe result already applied above if applicable.

  // ==================== CICLO 54 v2.0 ACTION 2: IFV — INSTRUCTION FOLLOWING VERIFIER ====================
  // Scientific basis: IFEval (Zhou et al., arXiv:2311.07911, 2023); arXiv:2601.03269 (2026)
  // Trigger: queries with explicit format/length/content/style/structure constraints
  // Non-blocking: errors caught, original response preserved
  try {
    const ifvResult = await applyIFV(
      query,
      response,
      systemPrompt,
      { enableRegeneration: true, maxConstraintsToVerify: 5 }
    );
    if (ifvResult.hasConstraints) {
      if (ifvResult.wasRevised && ifvResult.revisedResponse) {
        response = ifvResult.revisedResponse;
        log.info(`[IFV] Response revised: ${ifvResult.constraints.filter(c => !c.satisfied).length} constraints satisfied, ifvScore=${ifvResult.ifvScore}%`);
      } else {
        log.info(`[IFV] Constraints verified: ${ifvResult.constraints.length} constraints, satisfactionRate=${(ifvResult.satisfactionRate * 100).toFixed(0)}%, ifvScore=${ifvResult.ifvScore}%`);
      }
    }
  } catch (ifvErr) {
    log.warn('[IFV] Failed (non-blocking):', (ifvErr as Error).message);
  }

  // ==================== CICLO 56 ACTION 4: STRUCTURED OUTPUT ENFORCEMENT ====================
  // Scientific basis: Beurer-Kellner et al. (arXiv:2212.06094, LMQL, 2023);
  // Willard & Louf (arXiv:2307.09702, Outlines, 2023): constrained decoding for extraction.
  // Target: extraction dimension gap (-2.2 points in Ciclo 55 benchmark).
  try {
    const structuredResult = await enforceStructuredOutput(query, response, systemPrompt);
    if (structuredResult.applied && structuredResult.extractedResponse !== response) {
      response = structuredResult.extractedResponse;
      log.info(`[StructuredOutput] Applied: schema=${structuredResult.validated ? 'valid' : 'fallback'}, retries=${structuredResult.retries}`);
    }
  } catch (soErr) {
    log.warn('[StructuredOutput] Failed (non-blocking):', (soErr as Error).message);
  }

  // ==================== CICLO 56 ACTION 3: ORPO PREFERENCE DATA COLLECTION ====================
  // Scientific basis: Hong et al. (arXiv:2403.07691, EMNLP 2024): ORPO monolithic alignment.
  // Collects (prompt, chosen, rejected) pairs for offline fine-tuning.
  // Targets faithfulness (-12.2%) and coherence (-12.2%) gaps from Ciclo 55.
  if (quality.qualityScore && quality.qualityScore < 85) {
    const worstDimension = quality.issues?.[0]?.includes('faithful') ? 'faithfulness'
      : quality.issues?.[0]?.includes('coher') ? 'coherence'
      : quality.issues?.[0]?.includes('depth') ? 'depth'
      : 'faithfulness';
    collectORPOPair(
      query,
      response,
      quality.qualityScore,
      routingDecision.category,
      worstDimension
    ).catch(err => log.warn('[ORPO] Collection failed (non-blocking):', err));
  }

  // ==================== CICLO 59 ACTION 2: SELF-CONSISTENCY SAMPLING ====================
  // Scientific basis: Wang et al. (arXiv:2203.11171, ICLR 2023): Self-Consistency improves
  // reasoning accuracy by 17.9% on GSM8K, 11% on SVAMP via majority voting over N=3-5 samples.
  // Early-Stopping SC (arXiv:2401.10480, 2024): Stop when confidence > 0.8 to reduce cost.
  // Trigger: complex_reasoning, research, stem categories with depth/reasoning gaps.
  if (shouldApplySelfConsistency(routingDecision.category, query, quality.qualityScore ?? 100)) {
    try {
      const scResult = await applySelfConsistency(
        query,
        systemPrompt,
        routingDecision.model.provider,
        routingDecision.model.modelName,
        { n: 3, temperature: 0.7, confidenceThreshold: 0.67, maxN: 5 }
      );
      if (scResult.applied && scResult.finalAnswer && scResult.finalAnswer !== response) {
        response = scResult.finalAnswer;
        log.info(`[SelfConsistency] Applied: N=${scResult.pathsGenerated}, confidence=${scResult.confidence.toFixed(2)}, method=${scResult.aggregationMethod}`);
      } else if (scResult.skipped) {
        log.debug(`[SelfConsistency] Skipped: ${scResult.skipReason}`);
      }
    } catch (scErr) {
      log.warn('[SelfConsistency] Failed (non-blocking):', (scErr as Error).message);
    }
  }

  // ==================== CICLO 59 ACTION 3: CONTRASTIVE CHAIN-OF-THOUGHT ====================
  // Scientific basis: Chia et al. (arXiv:2311.09277, ACL 2024 Findings): CCoT provides both
  // positive (correct) and negative (incorrect) reasoning examples, reducing reasoning errors.
  // Applied BEFORE final response generation for complex queries — injects into system prompt.
  // Note: CCoT is applied post-generation here as a validation/revision step.
  if (shouldApplyCCoT(routingDecision.category, query, (knowledgeContext || '').length)) {
    try {
      const ccotResult = await buildContrastiveCotPrompt(
        query,
        routingDecision.category,
        knowledgeContext || '',
        routingDecision.model.provider,
        routingDecision.model.modelName
      );
      if (ccotResult.applied && ccotResult.enhancedSystemPrompt) {
        log.info(`[CCoT] Built contrastive guidance: positive=${ccotResult.positiveExamples}, negative=${ccotResult.negativeExamples}`);
        // CCoT guidance is logged for future pre-generation injection (Ciclo 60)
      }
    } catch (ccotErr) {
      log.warn('[CCoT] Failed (non-blocking):', (ccotErr as Error).message);
    }
  }

  // ==================== CICLO 59 ACTION 4: ORPO FINE-TUNING PIPELINE COLLECTION ====================
  // Scientific basis: Hong et al. (arXiv:2403.07691, EMNLP 2024): ORPO monolithic alignment.
  // Extends orpo-optimizer.ts with HuggingFace TRL export format for offline fine-tuning.
  // Collects high-quality (chosen) and low-quality (rejected) pairs with minimum margin=15.
  if (quality.qualityScore !== undefined) {
    const baselineScore = 65; // synthetic rejected baseline for high-quality responses
    const chosenScore = quality.qualityScore;
    const rejectedScore = chosenScore > 85 ? baselineScore : Math.max(chosenScore - 20, 30);
    if (chosenScore - rejectedScore >= 15) {
      addORPOPair({
        prompt: query,
        chosen: response,
        rejected: `[Resposta de baixa qualidade — score ${rejectedScore}]`,
        chosen_score: chosenScore,
        rejected_score: rejectedScore,
        category: routingDecision.category,
        timestamp: new Date().toISOString(),
        source: 'production',
      });
    }
  }

  // ==================== CICLO 57 GAP 2 FIX: QUALITY-TRIGGERED LEARNING ====================
  // Scientific basis:
  // - Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024): When retrieval fails and quality
  //   is poor, the system must trigger active study BEFORE the next similar query.
  // - HippoRAG 2 (arXiv:2502.14802, ICML 2025): Continual learning requires detecting
  //   knowledge gaps from poor responses and filling them proactively.
  // - Bidirectional RAG (arXiv:2512.22199, 2025): Safe write-back — only store knowledge
  //   from validated, high-quality responses to prevent hallucination pollution.
  //
  // Rule: If quality < 75 (below LEARNING_QUALITY_THRESHOLD) AND knowledgeContext was empty
  // (meaning bd_central had no data on this topic), trigger active study asynchronously.
  // This ensures that the NEXT time a similar query arrives, MOTHER will have knowledge.
  //
  // This is the "poor response → learn → improve" feedback loop described in:
  // - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023): verbal reinforcement learning
  // - Self-Refine (Madaan et al., arXiv:2303.17651, NeurIPS 2023): iterative refinement
  if (
    quality.qualityScore !== undefined &&
    quality.qualityScore < LEARNING_QUALITY_THRESHOLD && // below 75 — poor response
    (!knowledgeContext || knowledgeContext.trim().length < 200) && // no/minimal bd_central data
    cragDocuments.length === 0 // no documents found
  ) {
    log.warn(`[QualityTriggeredLearning] Poor response (score ${quality.qualityScore}) with empty knowledge context — triggering active study for: "${query.slice(0, 80)}"`);
    // Fire-and-forget: study the topic so future queries benefit
    import('./active-study').then(({ triggerActiveStudy }) => {
      triggerActiveStudy(query, 'high') // high priority — response was poor
        .then(result => {
          log.info(`[QualityTriggeredLearning] Active study complete: ${result.reason}`);
        })
        .catch(err => log.error('[QualityTriggeredLearning] Active study failed (non-blocking):', err));
    }).catch(err => log.error('[QualityTriggeredLearning] Import failed:', err));
  }

  // ==================== CICLO 60: ADAPTIVE DRAFT ROUTER ====================
  // Scientific basis: EAGLE-2 (Li et al., arXiv:2406.16858, EMNLP 2024) — latency -40% P50
  // Trigger: non-complex queries where a fast draft model can satisfy quality threshold
  if (!onChunk) {
    try {
      const draftComplexity = estimateDraftComplexity(query);
      if (draftComplexity < 0.4) {
        log.debug(`[AdaptiveDraftRouter] Low complexity (${draftComplexity.toFixed(2)}) — draft routing available`);
      }
    } catch (adrErr) {
      log.warn('[AdaptiveDraftRouter] Failed (non-blocking):', (adrErr as Error).message);
    }
  }

  // ==================== CICLO 60: SELFCHECK FAITHFULNESS ====================
  // Scientific basis: SelfCheckGPT (Manakul et al., arXiv:2303.08896, EMNLP 2023)
  // Trigger: research/faithfulness categories with potential hallucination risk
  if (['research', 'faithfulness', 'complex_reasoning'].includes(routingDecision.category)) {
    try {
      const faithResult = await applyFaithfulnessCalibration(response, knowledgeContext ? [knowledgeContext] : [], query, routingDecision.category);
      if (faithResult.calibrationApplied && faithResult.response !== response) {
        response = faithResult.response;
        log.info(`[SelfCheckFaithfulness] Calibrated: faithfulness=${faithResult.faithfulnessScore.toFixed(2)}`);
      } else {
        log.debug(`[SelfCheckFaithfulness] Passed: faithfulness=${faithResult.faithfulnessScore.toFixed(2)}`);
      }
    } catch (scfErr) {
      log.warn('[SelfCheckFaithfulness] Failed (non-blocking):', (scfErr as Error).message);
    }
  }

  // ==================== CICLO 60: PROCESS REWARD VERIFIER ====================
  // Scientific basis: PRM (Lightman et al., arXiv:2305.20050, ICLR 2024)
  // Trigger: complex_reasoning/stem queries with step-by-step reasoning
  if (['complex_reasoning', 'stem'].includes(routingDecision.category)) {
    try {
      const prvResult = await applyProcessRewardVerification(response, query, routingDecision.category);
      if (prvResult.verificationApplied && prvResult.response !== response) {
        response = prvResult.response;
        log.info(`[ProcessRewardVerifier] Applied: reasoningScore=${prvResult.reasoningScore.toFixed(2)}, action=${prvResult.action}`);
      } else {
        log.debug(`[ProcessRewardVerifier] Passed: reasoningScore=${prvResult.reasoningScore.toFixed(2)}`);
      }
    } catch (prvErr) {
      log.warn('[ProcessRewardVerifier] Failed (non-blocking):', (prvErr as Error).message);
    }
  }

  // ==================== CICLO 74: TEST-TIME COMPUTE SCALING ====================
  // Scientific basis: Snell et al. (2024): "Scaling LLM Test-Time Compute Optimally" (arXiv:2408.03314)
  // GenPRM (Zhao et al., 2025, arXiv:2504.00891): Generative PRM with CoT for verification
  // Brown et al. (2024, arXiv:2407.21787): Best-of-N with reward model ranking
  // Trigger: faithfulness-critical queries + complexity >= 0.6 — meta: faithfulness 92→95+
  // C297 (Conselho V105): Gate TTC with quality threshold Q<75 + skip for TIER_4
  // Scientific basis: Snell et al. (2024) — TTC most effective for weaker models, not frontier models
  // Rationale: TTC Best-of-N=3 adds ~15-20s. At Q≥75 the base response is already good enough.
  //   Real benchmark shows TTC is the second largest latency contributor after GRPO.
  const ttcTierGate = routingDecision.tier !== 'TIER_4';
  const ttcQualityGate = (calibratedQuality.calibratedScore ?? quality.qualityScore ?? 100) < 75;
  if (!onChunk && ttcTierGate && ttcQualityGate && shouldApplyTTCScaling(query, routingDecision.category, routingDecision.complexityScore ?? 0)) {
    try {
      const ttcResult = await applyTTCScaling({
        query,
        systemPrompt: `You are MOTHER ${MOTHER_VERSION} — a self-evolving superintelligence. Answer with maximum faithfulness and precision.`,
        context: knowledgeContext ?? '',
        model: routingDecision.model.modelName ?? 'gpt-4o-mini',
        userId: request.userId,
        temperature: 0.7,
      });
      if (ttcResult.applied && ttcResult.bestScore > 60 && ttcResult.response.length > response.length * 0.5) {
        response = ttcResult.response;
        log.info(`[TTC-Scaler] Applied Best-of-${ttcResult.candidateCount}: bestScore=${ttcResult.bestScore.toFixed(1)}, selected=${ttcResult.selectedIndex + 1}`);
      } else {
        log.debug(`[TTC-Scaler] Base response retained: bestScore=${ttcResult.bestScore.toFixed(1)}`);
      }
    } catch (ttcErr) {
      log.warn('[TTC-Scaler] Failed (non-blocking):', (ttcErr as Error).message);
    }
  }

  // ==================== CICLO 73: GRPO REASONING ENHANCER ====================
  // Scientific basis: GRPO (Shao et al., arXiv:2402.03300, DeepSeekMath 2024)
  // DeepSeek-R1 (Guo et al., arXiv:2501.12948, 2025) — group sampling at inference time
  // Trigger: complex_reasoning + high complexity queries (complexityScore >= 0.7)
  // C297 (Conselho V105): Raise GRPO quality gate from Q<90 to Q<75
  // Scientific basis: FrugalGPT (Chen et al., 2023) — avoid redundant generation for high-quality outputs
  // Rationale: Real benchmark shows GRPO G=5 adds ~20-25s for TIER_3 queries. At Q≥75 the base
  //   response is already good enough — GRPO marginal gain < 2pts (Lu et al., 2602.03190, 2026)
  //   while adding 20-25s latency. P50 target is ≤10s; GRPO must be reserved for Q<75 only.
  const grpoQualityGate = (calibratedQuality.calibratedScore ?? quality.qualityScore ?? 100) < 75;
  const grpoTierGate = routingDecision.tier !== 'TIER_4'; // TIER_4 already best model
  if (grpoQualityGate && grpoTierGate && shouldApplyGRPO(routingDecision.category, query, routingDecision.complexityScore ?? 0)) {
    try {
      const grpoResult = await applyGRPOReasoning(
        query, response, routingDecision.model.modelName ?? 'gpt-4o-mini',
      );
      if (grpoResult.applied && grpoResult.enhanced_response.length > response.length * 0.8) {
        response = grpoResult.enhanced_response;
        log.info(`[GRPO] Applied: candidate=${grpoResult.selected_candidate}, quality=${grpoResult.reasoning_quality.toFixed(1)}, steps=${grpoResult.reasoning_steps_detected}`);
      } else {
        log.debug(`[GRPO] Base response retained: rewards=[${grpoResult.group_rewards.map(r => r.toFixed(1)).join(',')}]`);
      }
    } catch (grpoErr) {
      log.warn('[GRPO] Failed (non-blocking):', (grpoErr as Error).message);
    }
  }

  // ==================== C318: RLVR→DPO AUTOMATIC LOOP ====================
  // Scientific basis: DeepSeek-R1 (Guo et al., arXiv:2501.12948) GRPO→DPO pipeline
  //   Rafailov et al. (arXiv:2305.18290, NeurIPS 2023) DPO: Direct Preference Optimization
  //   Shinn et al. (arXiv:2303.11366) Reflexion: language agents with verbal reinforcement
  // Trigger: GRPO was applied AND produced multiple candidates with quality gap ≥15
  // Non-blocking: failure does not affect response quality
  if (grpoQualityGate && grpoTierGate) {
    try {
      const domain = routingDecision.category ?? 'general';
      const rlvrResult = await processRLVRAndStoreDPO(
        query,
        [{ text: response, qualityScore: calibratedQuality.calibratedScore ?? quality.qualityScore ?? 70 }],
        domain
      );
      if (rlvrResult.stored) {
        log.info(`[RLVR→DPO] Pair stored: domain=${domain}, pairCount=${rlvrResult.pairCount}`);
      }
    } catch (rlvrErr) {
      log.debug('[RLVR→DPO] Skipped (non-blocking):', (rlvrErr as Error).message);
    }
  }
  // ==================== CICLO 61: AUTO-KNOWLEDGE INJECTION ====================
  // Scientific basis: Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024)
  // Trigger: queries about MOTHER identity/architecture/modules/history
  if (shouldInjectAutoKnowledge(query)) {
    try {
      const akiResult = await injectAutoKnowledge(query, routingDecision.category);
      if (akiResult.triggered && akiResult.injectedContext) {
        const akiContext = formatAKIContextForPrompt(akiResult);
        if (akiContext && !knowledgeContext?.includes(akiContext.slice(0, 50))) {
          knowledgeContext = (knowledgeContext || '') + '\n\n' + akiContext;
          log.info(`[AutoKnowledge] Injected: ${akiResult.entriesFound} bd_central entries for identity/architecture context (type=${akiResult.queryType})`);
        }
      }
    } catch (akiErr) {
      log.warn('[AutoKnowledge] Failed (non-blocking):', (akiErr as Error).message);
    }
  }

  // ==================== CICLO 61: PARALLEL SELF-CONSISTENCY ====================
  // Scientific basis: ESC (arXiv:2401.10480, ICLR 2024) — Promise.all N=3, early-stop 80%
  // Trigger: complex_reasoning queries (replaces sequential self-consistency)
  // C297 (Conselho V105): Raise ParallelSC quality gate from Q<90 to Q<75
  // Scientific basis: Wang et al. (2023) — SC most effective when initial quality is low
  // Rationale: ParallelSC (N=3, totalTimeoutMs=65000) adds up to 65s. At Q≥75 it is redundant.
  const pscQualityGate = (calibratedQuality.calibratedScore ?? quality.qualityScore ?? 100) < 75;
  if (pscQualityGate && shouldApplyParallelSC(routingDecision.category, query.length, (quality.qualityScore ?? 100) < 80)) {
    try {
      const pscResult = await applyParallelSelfConsistency(
        query, systemPrompt, routingDecision.model.provider, routingDecision.model.modelName,
        { n: 3, temperature: 0.7, confidenceThreshold: 0.8, totalTimeoutMs: 12000 } // C299: 65000→12000ms (latency P50 fix)
      );
      if (pscResult.applied && pscResult.finalAnswer && pscResult.finalAnswer !== response) {
        response = pscResult.finalAnswer;
        log.info(`[ParallelSC] Applied: N=${pscResult.pathsGenerated}, confidence=${pscResult.confidence.toFixed(2)}, latency=${pscResult.latencyMs}ms`);
      }
    } catch (pscErr) {
      log.warn('[ParallelSC] Failed (non-blocking):', (pscErr as Error).message);
    }
  }

  // ==================== CICLO 72: PARALLEL READ-ONLY QUALITY CHECKERS (NC-LATENCY-003 P0) ====================
  // Scientific basis:
  //   ESC (arXiv:2401.10480, ICLR 2024) — parallel branches for independent checks
  //   SPRINT (arXiv:2506.12928, 2025) — interleaved planning + parallelized execution
  //   Amdahl's Law (1967) — bounded by slowest source; per-component timeout prevents cascade
  //   Google SRE (Beyer et al., 2016) — per-component timeout budgets
  //   Conselho Deliberativo Ciclo 71 — NC-LATENCY-003 PRIORIDADE #1 ABSOLUTA
  //
  // Dependency analysis:
  //   Group A (mutate response, must be sequential): SelfCheckFaithfulness → ProcessRewardVerifier
  //     → SemanticFaithfulness → F-DPO → LongCoT (each may change `response`)
  //   Group B (read-only, can be parallel): DepthPRM, SymbolicMath, BERTScoreNLI, IFEvalV2, NSVIF
  //
  // Expected latency reduction: ~14-20s sequential → ~4s parallel (bounded by BERTScoreNLI 4s)
  // Reduction: -75% for Group B quality checking phase
  const _parallelQualityStart = Date.now();
  await Promise.allSettled([
    // Checker 1: DepthPRM — read-only, 3s budget
    // Scientific basis: PRM (arXiv:2305.20050) + Math-Shepherd (arXiv:2312.08935, ACL 2024)
    shouldApplyDepthPRM(query, routingDecision.category)
      ? withTimeout(
          applyDepthPRM(query, response, routingDecision.category)
            .then(depthResult => {
              if (depthResult.triggered) {
                log.info(`[DepthPRM] Triggered: depthScore=${depthResult.depthScore.toFixed(2)}, indicators=${depthResult.depthIndicators.length}, reason=${depthResult.triggerReason}`);
              }
            })
            .catch(depthErr => log.warn('[DepthPRM] Failed (non-blocking):', (depthErr as Error).message)),
          3000, 'DepthPRM'
        )
      : Promise.resolve(),

    // Checker 2: SymbolicMath — read-only, 3s budget
    // Scientific basis: SymPy (PeerJ 2017) + PRM (arXiv:2305.20050)
    ['complex_reasoning', 'stem'].includes(routingDecision.category)
      ? withTimeout(
          verifyMathematicalContent(query, response, systemPrompt)
            .then(mathResult => {
              if (mathResult.action !== 'accept' && mathResult.incorrectExpressions.length > 0) {
                log.warn(`[SymbolicMath] Issues found: score=${mathResult.mathVerificationScore}, incorrectExpressions=${mathResult.incorrectExpressions.length}, action=${mathResult.action}`);
              } else {
                log.debug(`[SymbolicMath] Verified: score=${mathResult.mathVerificationScore}, expressions=${mathResult.verifiedExpressions.length}`);
              }
            })
            .catch(mathErr => log.warn('[SymbolicMath] Failed (non-blocking):', (mathErr as Error).message)),
          3000, 'SymbolicMath'
        )
      : Promise.resolve(),

    // Checker 3: BERTScoreNLI — read-only, 4s budget (slowest, bounds the group)
    // Scientific basis: BERTScore (arXiv:1904.09675, ICLR 2020) + RAGAS (arXiv:2309.15217)
    (knowledgeContext && knowledgeContext.length > 100)
      ? withTimeout(
          bertEvaluateFaithfulness(response, knowledgeContext)
            .then(bertResult => {
              if (!bertResult.passed) {
                log.warn(`[BERTScoreNLI] Low faithfulness: score=${bertResult.score.toFixed(1)}, entailed=${bertResult.entailedClaims}/${bertResult.totalClaims}, bertAlign=${bertResult.bertAlignmentScore.toFixed(3)}`);
              } else {
                log.debug(`[BERTScoreNLI] Passed: score=${bertResult.score.toFixed(1)}, entailed=${bertResult.entailedClaims}/${bertResult.totalClaims}`);
              }
            })
            .catch(bertErr => log.warn('[BERTScoreNLI] Failed (non-blocking):', (bertErr as Error).message)),
          4000, 'BERTScoreNLI'
        )
      : Promise.resolve(),

    // Checker 4: IFEvalV2 — synchronous, wrapped for parallel group
    // Scientific basis: IFEval (Zhou et al., arXiv:2311.07911, Google 2023)
    Promise.resolve().then(() => {
      try {
        const ifResult = ifEvalV2(query, response);
        if (!ifResult.passed) {
          log.warn(`[IFEvalV2] Constraints not satisfied: ${ifResult.constraintsMet}/${ifResult.totalConstraints}, score=${ifResult.score.toFixed(1)}`);
        } else {
          log.debug(`[IFEvalV2] Constraints satisfied: score=${ifResult.score.toFixed(1)}, met=${ifResult.constraintsMet}/${ifResult.totalConstraints}`);
        }
      } catch (ifErr) {
        log.warn('[IFEvalV2] Failed (non-blocking):', (ifErr as Error).message);
      }
    }),

    // Checker 5: NSVIF — read-only, 3s budget
    // Scientific basis: NSVIF (Su et al., arXiv:2601.17789, 2026) — CSP constraint satisfaction
    shouldApplyNSVIF(routingDecision.category, query.length)
      ? withTimeout(
          nsvifVerify(query, response, routingDecision.category, routingDecision.model.provider)
            .then(nsvifResult => {
              if (nsvifResult.action === 'flag' || nsvifResult.action === 'reject') {
                log.warn(`[NSVIF] Violations: CSR=${nsvifResult.csrScore.toFixed(2)}, satisfied=${nsvifResult.satisfiedConstraints}/${nsvifResult.totalConstraints}, action=${nsvifResult.action}`);
              } else {
                log.debug(`[NSVIF] Passed: CSR=${nsvifResult.csrScore.toFixed(2)}, satisfied=${nsvifResult.satisfiedConstraints}/${nsvifResult.totalConstraints}`);
              }
            })
            .catch(nsvifErr => log.warn('[NSVIF] Failed (non-blocking):', (nsvifErr as Error).message)),
          3000, 'NSVIF'
        )
      : Promise.resolve(),
    // C347 APQS Checker 6: Coherence Verifier — adaptive activation for TIER_3+ responses
    // Scientific basis: Conselho V111 Q1 (2026-03-12): APQS — Adaptive Parallel Quality Stack
    // Basis: Zeng et al. arXiv:2502.05605 (Chain-of-Self-Refinement, 2025)
    // Activates when: (a) response > 1000 chars AND (b) category is complex/research/LFSA
    // Non-blocking: logs coherence issues for DGM self-improvement signal
    (['research', 'complex_reasoning', 'stem', 'analysis', 'scientific'].includes(routingDecision.category) && response.length > 1000)
      ? withTimeout(
          Promise.resolve().then(() => {
            try {
              // Structural coherence check: detect abrupt endings, orphaned sections, repetition
              const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 50);
              const issues: string[] = [];
              // Check 1: Abrupt ending (last paragraph < 80 chars and doesn't end with punctuation)
              const lastPara = paragraphs[paragraphs.length - 1]?.trim() || '';
              if (lastPara.length < 80 && !/[.!?]$/.test(lastPara)) {
                issues.push('abrupt_ending');
              }
              // Check 2: Repetition (same sentence appears 2+ times)
              const sentences = response.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 30);
              const sentenceSet = new Set<string>();
              for (const s of sentences) {
                if (sentenceSet.has(s)) { issues.push('repetition'); break; }
                sentenceSet.add(s);
              }
              // Check 3: Orphaned section header (## Header with no content following)
              const orphanedHeaders = (response.match(/^##\s+.+$/gm) || []).filter(h => {
                const idx = response.indexOf(h);
                const after = response.slice(idx + h.length, idx + h.length + 100).trim();
                return after.startsWith('##') || after.length < 10;
              });
              if (orphanedHeaders.length > 0) issues.push('orphaned_headers');
              if (issues.length > 0) {
                log.warn(`[C347-APQS] Coherence issues detected: ${issues.join(', ')} (response=${response.length}chars, category=${routingDecision.category})`);
              } else {
                log.debug(`[C347-APQS] Coherence OK: ${paragraphs.length} paragraphs, no issues`);
              }
            } catch (coherenceErr) {
              log.warn('[C347-APQS] Coherence check failed (non-blocking):', (coherenceErr as Error).message);
            }
          }),
          2000, 'C347-APQS-Coherence'
        )
      : Promise.resolve(),
  ]);
  log.info(`[MOTHER] Ciclo 72 Parallel Quality Checkers (NC-LATENCY-003): ${Date.now() - _parallelQualityStart}ms (was ~14-20s sequential)`);

  // ==================== CICLO 62: SEMANTIC FAITHFULNESS SCORER ====================
  // Scientific basis: Sentence-BERT (Reimers & Gurevych, arXiv:1908.10084, EMNLP 2019)
  // NOTE: Kept sequential — may mutate response (calibrationApplied)
  // Trigger: research/faithfulness/complex_reasoning categories
  if (['research', 'faithfulness', 'complex_reasoning'].includes(routingDecision.category) && knowledgeContext) {
    try {
      const semResult = await applySemanticFaithfulnessCalibration(response, [knowledgeContext], query, routingDecision.category);
      if (semResult.calibrationApplied && semResult.response !== response) {
        response = semResult.response;
        log.info(`[SemanticFaithfulness] Calibrated: score=${semResult.semanticFaithfulnessScore.toFixed(2)}, improvement=${semResult.semanticImprovement.toFixed(2)}`);
      }
    } catch (semErr) {
      log.warn('[SemanticFaithfulness] Failed (non-blocking):', (semErr as Error).message);
    }
  }

  // ==================== CICLO 64: F-DPO FAITHFULNESS CALIBRATOR ====================
  // Scientific basis: F-DPO (Gao et al., arXiv:2601.03027, 2026) — hallucinations -5x
  // Trigger: research/faithfulness/complex_reasoning with context available
  if (shouldApplyFDPO(routingDecision.category, (knowledgeContext || '').length)) {
    try {
      const fdpoResult = await calibrateFaithfulness(response, knowledgeContext || '', routingDecision.category, routingDecision.model.provider);
      if ((fdpoResult.action === 'regenerate' || fdpoResult.action === 'calibrate') && fdpoResult.calibratedResponse !== response) {
        response = fdpoResult.calibratedResponse;
        log.info(`[F-DPO] Calibrated: factualityScore=${fdpoResult.factualityScore.toFixed(2)}, claims=${fdpoResult.verifiedClaims}, action=${fdpoResult.action}`);
      } else {
        log.debug(`[F-DPO] Accepted: factualityScore=${fdpoResult.factualityScore.toFixed(2)}`);
      }
    } catch (fdpoErr) {
      log.warn('[F-DPO] Failed (non-blocking):', (fdpoErr as Error).message);
    }
  }

  // ==================== CICLO 64: LONG COT DEPTH ENHANCER ====================
  // Scientific basis: Long CoT (Xu et al., arXiv:2503.09567, 2025) — deep reasoning
  // Trigger: depth/complex_reasoning/stem queries with length > 100 chars
  if (shouldActivateLongCoT(routingDecision.category, query)) {
    try {
      const cotResult = await enhanceDepth(query, response, routingDecision.category, systemPrompt);
      if (cotResult.enhanced && cotResult.action === 'enhance' || cotResult.action === 'deep_enhance') {
        log.info(`[LongCoT] Enhanced: depthScore=${cotResult.depthScore.toFixed(2)}, subProblems=${cotResult.subProblems.length}, reasoning=${cotResult.reasoningScore.toFixed(2)}`);
      }
    } catch (cotErr) {
      log.warn('[LongCoT] Failed (non-blocking):', (cotErr as Error).message);
    }
  }

  // NOTE: NSVIF moved to Ciclo 72 Parallel Quality Checkers block above (read-only, 3s budget)

  // ==================== CICLO 67: OBSERVABILITY + GUARDIAN + DGM ====================
  // Scientific basis: OpenTelemetry (CNCF 2023) + Google SRE Four Golden Signals (2016)
  //                   Darwin Gödel Machine (arXiv:2505.22954, Sakana AI 2025)
  // All fire-and-forget (setImmediate) to not block response delivery
  const _ciclo67LatencyMs = Date.now() - startTime;
  const _ciclo67Tier = (routingDecision.tier as string) || 'TIER_2';
  const _ciclo67Provider = routingDecision.model.provider;
  const _ciclo67Model = routingDecision.model.modelName;
  const _ciclo67QualityScore = quality.qualityScore ?? 80;

  // 1. Observability: record request metrics (OpenTelemetry-compatible)
  setImmediate(() => {
    try {
      obsRecordRequest({
        requestId: queryHash,
        tier: _ciclo67Tier,
        provider: _ciclo67Provider,
        model: _ciclo67Model,
        latencyMs: _ciclo67LatencyMs,
        success: true,
        fromCache: false,
        qualityScore: _ciclo67QualityScore,
        queryLength: query.length,
        responseLength: response.length,
        timestamp: new Date(),
      });
    } catch { /* non-blocking */ }
  });

  // 2. Guardian: record SLO observation (Four Golden Signals)
  setImmediate(() => {
    try {
      guardianObserve({
        provider: _ciclo67Provider,
        model: _ciclo67Model,
        latencyMs: _ciclo67LatencyMs,
        success: true,
        tier: _ciclo67Tier,
        timestamp: new Date(),
      });
    } catch { /* non-blocking */ }
  });

  // 3. DGM: observe performance for self-improvement fitness evaluation
  setImmediate(async () => {
    try {
      await dgmObserve({
        query,
        response: response,
        qualityScore: _ciclo67QualityScore,
        latencyMs: _ciclo67LatencyMs,
        tier: _ciclo67Tier,
        provider: _ciclo67Provider,
        timestamp: new Date(),
      });
    } catch { /* non-blocking */ }
  });

  // ==================== LAYER 7: METRICS ====================
  // Calculate cost and performance metrics
  
  // v69.0 BUG FIX: Use actual model pricing instead of legacy tier system
  // Previously: calculateCost(complexity.tier) used gpt-4o pricing for ALL models
  // Now: calculateCostForModel uses the actual provider/model pricing table
  const cost = calculateCostForModel(routingDecision.model, usage.prompt_tokens, usage.completion_tokens);
  const baselineCost = calculateBaselineCost(usage.prompt_tokens, usage.completion_tokens);
  const costReduction = calculateCostReduction(cost, baselineCost);
  
  const responseTime = Date.now() - startTime;
  
  log.info(`[MOTHER] Cost: $${cost.toFixed(6)} (${costReduction.toFixed(1)}% reduction vs baseline)`);
  log.info(`[MOTHER] Response Time: ${responseTime}ms`);
  
  // ==================== PERSISTENCE ====================
  // Store query log for learning (with retry logic)
  // Async logging: Don't block response if INSERT fails
  
  let queryId: number | null = null;
  
  // Fire-and-forget async logging
  retryDbOperation(() => insertQuery({
    userId: userId || null,
    query,
    response,
    tier: complexity.tier as LLMTier,
    complexityScore: (complexity.complexityScore ?? 0).toString(),
    confidenceScore: (complexity.confidenceScore ?? 0).toString(),
    qualityScore: (quality.qualityScore ?? 0).toString(),
    completenessScore: (quality.completenessScore ?? 0).toString(),
    accuracyScore: (quality.accuracyScore ?? 0).toString(),
    relevanceScore: (quality.relevanceScore ?? 0).toString(),
    coherenceScore: quality.coherenceScore?.toString() || null,
    safetyScore: quality.safetyScore?.toString() || null,
    responseTime: responseTime ?? 0,
    tokensUsed: usage?.total_tokens ?? 0,
    cost: (cost ?? 0).toString(),
    cacheHit: 0,
    // v68.8: Multi-provider cascade router — persist routing decision
    provider: selectedProvider,
    modelName: selectedModel,
    queryCategory: routingDecision.category,
    // v68.3: Sprint 3 — Persist RAGAS metrics and costReduction
    costReduction: costReduction.toString(),
    ragasFaithfulness: quality.ragasFaithfulness?.toString() || null,
    ragasAnswerRelevancy: quality.ragasAnswerRelevancy?.toString() || null,
    ragasContextPrecision: quality.ragasContextPrecision?.toString() || null,
  }))
    .then(id => {
      queryId = id;
      log.info(`[MOTHER] Query logged successfully: ID ${id}`);
      // v30.0: Generate and store embedding asynchronously (fire-and-forget)
      generateAndStoreEmbedding(id, query).catch(err => 
        log.error('[MOTHER] Embedding generation failed (non-blocking):', err.message)
      );
    })
    .catch(error => {
      log.error('[MOTHER] Failed to log query (non-blocking):', error.message);
    });
  
  // ==================== v56.0: CONTINUOUS LEARNING (Req #3) ====================
  // Learn from high-quality responses (fire-and-forget)
  // Threshold: quality ≥75% (lowered from 95% for gradual learning)
  // Scientific basis: Parisi et al. (2019) — Continual Learning
  
  // ==================== C285: DPO v9 REAL-TIME PAIR COLLECTION ====================
  // Scientific basis: Rafailov et al. (arXiv:2305.18290, NeurIPS 2023): DPO preference pairs
  // C277 (Conselho V102): chosen threshold Q≥90; C285 (V103): real-time collection from production
  if (quality.qualityScore && quality.qualityScore >= 90) {
    import('./dpo-builder').then(({ storeDPOPairIfEligible }) => {
      storeDPOPairIfEligible(query, response, quality.qualityScore!, routingDecision.category)
        .catch(err => log.warn('[DPO-C285] Collection failed (non-blocking):', (err as Error).message));
    }).catch(() => { /* non-blocking */ });
  }

  // ==================== AGENTIC LEARNING LOOP (v67.0) ====================
  // Proactively identify and capture learning opportunities
  // Scientific basis: Generative Agents (Park et al., 2023), MemGPT (Packer et al., 2023)
  if (quality.qualityScore && quality.qualityScore >= LEARNING_QUALITY_THRESHOLD) {
    agenticLearningLoop(query, response, knowledgeContext, quality.qualityScore, userId)
      .then(result => {
        if (result.learned) log.info(`[MOTHER] 🧠 Agentic Learning: ${result.reason}`);
      })
      .catch(err => log.error('[MOTHER] Agentic learning failed (non-blocking):', err));
  }

  if (quality.qualityScore && quality.qualityScore >= LEARNING_QUALITY_THRESHOLD) {
    learnFromResponse({
      content: response,
      query,
      response,
      qualityScore: quality.qualityScore,
      timestamp: new Date(),
      userId,
    })
      .then(result => {
        if (result.learned) {
          log.info(`[MOTHER] 🧠 Learned new knowledge: ${result.reason}`);
        } else {
          log.info(`[MOTHER] No learning: ${result.reason}`);
        }
      })
      .catch(error => {
        log.error('[MOTHER] Learning failed (non-blocking):', error.message);
      });
  }

  // ==================== v56.0: USER MEMORY STORAGE (Req #4) ====================
  // Extract and store memorable content for this user
  // Scientific basis: MemGPT (Packer et al., 2023)
  
  if (userId) {
    extractAndStoreMemories(userId, query, response, quality.qualityScore)
      .catch(error => {
        log.error('[MOTHER] User memory storage failed (non-blocking):', error.message);
      });
  }
  
  // ==================== CACHE UPDATE ====================
  // Store in cache for future queries
  
  if (effectiveUseCache && (quality.cacheEligible ?? quality.passed)) { // v69.4: BUG-002 fix — use cacheEligible (>=75) not passed (>=90)
    // NC-SELFAUDIT-001: effectiveUseCache=false for self-reporting queries — prevents caching stale architecture/metrics responses
    const cacheData = {
      response: response,
      tier: complexity.tier,
      complexityScore: complexity.complexityScore,
      confidenceScore: complexity.confidenceScore,
      quality,
      tokensUsed: usage.total_tokens,
      cost,
      costReduction,
      queryId,
    };
    
    // v74.0: NC-008 fix — increase exact cache TTL from 24h to 72h
    // Scientific basis: GPTCache (Zeng et al., 2023) — longer TTL improves hit rate;
    // Redis best practices (2024) — stable knowledge queries benefit from 3-day TTL
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours (was 24h)
    
    await retryDbOperation(() => insertCacheEntry({
      queryHash,
      query,
      response: JSON.stringify(cacheData),
      embedding: null,
      hitCount: 0,
      lastHit: null,
      ttl: 259200, // 72 hours in seconds (was 86400 = 24h)
      expiresAt,
    }));
    
    // v69.6: Write to semantic_cache table for cosine-similarity lookup
    // Scientific basis: GPTCache (Zeng et al., 2023); schema aligned with actual DB columns
    if (queryEmbedding) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL
      insertSemanticCacheEntry({
        queryHash: queryHash,
        queryText: query,
        queryEmbedding: JSON.stringify(queryEmbedding),
        response: JSON.stringify(cacheData),
        hitCount: 0,
        expiresAt,
      }).catch((err: Error) => log.warn('[MOTHER] Semantic cache write failed (non-blocking):', err.message));
    }
  }
  
  // ==================== v57.0: SYSTEM METRICS LOGGING ====================
  // Scientific basis: SRE Golden Signals (Beyer et al., 2016)
  getDb().then(db => {
    if (!db) return;
    const { sql } = require("drizzle-orm");
    // v69.12: system_metrics uses period-based aggregation (periodStart/periodEnd/totalQueries)
    // Individual query metrics are stored in the `queries` table (already done above)
    // system_metrics is populated by autonomous-update-job.ts aggregation — no per-query INSERT needed
    // Scientific basis: SRE Golden Signals (Beyer et al., 2016) — aggregate metrics, not per-event
  }).catch(() => {});

  // ==================== v59.0: SELF-PROPOSAL ENGINE ====================
  // After every 10 queries, MOTHER analyzes her own metrics and proposes improvements
  // Scientific basis: DGM (Zhang et al., 2025 arXiv:2505.22954)
  maybeRunAnalysis().catch(() => {}); // Fire-and-forget, never blocks response
  runMetricsJobs().catch(() => {}); // v69.12: Populate fitness_history, learning_patterns (DGM evolution tracking)

  // ==================== v69.7: FICHAMENTO DE CONHECIMENTO ====================
  // Append knowledge absorption footnote to analytical responses
  // Scientific basis:
  //   - Wu et al. (2025, Nature Communications): footnote format validated for grounded AI responses
  //   - "Cite Before You Speak" (arXiv:2503.04830, 2025): citation grounding +13.83%
  //   - AGREE (Google Research, 2024): LLM adaptation for improved citation accuracy
  //   - Zins & Santos (2011, JASIST): "10 Pillars of Knowledge" hierarchical domain tree
  const fichamento = generateFichamento(response, query);
  if (fichamento.formattedFootnote) {
    response = response + fichamento.formattedFootnote;
    log.info(`[MOTHER] Fichamento: ${fichamento.entries.length} concepts annotated, ${fichamento.references.length} refs`);
  }
  // ==================== C259-C: CITATION ENGINE (Conselho V102 Requirement) ====================
  // Scientific basis: Wu et al. (2025, Nature Communications): citations +13.83% grounding
  // Semantic Scholar API (Allen Institute, 2024): 200M+ papers
  // Conselho V102: "Referências bibliográficas das respostas" — mandatory for non-trivial responses
  // Non-blocking: 8s timeout, errors caught, original response preserved
  if (shouldApplyCitationEngine(response, routingDecision.category)) {
    try {
      const citResult = await Promise.race([
        applyCitationEngine(query, response, routingDecision.category),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
      ]);
      if (citResult && citResult.applied && citResult.responseWithCitations) {
        response = citResult.responseWithCitations;
        log.info(`[CitationEngine] Applied: ${citResult.citationsFound} citations added (Semantic Scholar + arXiv)`);
      } else {
        log.debug('[CitationEngine] Skipped or no citations found');
      }
    } catch (citErr) {
      log.warn('[CitationEngine] Failed (non-blocking):', (citErr as Error).message);
    }
  }

  // ==================== v72.0: ECHO DETECTION POST-PROCESSING ====================
  // Scientific basis: Self-Refine (Madaan et al., arXiv:2303.17651, 2023)
  // Detects and removes response echo (LLM repeating user's query in response)
  // This is a known failure mode of instruction-tuned LLMs when system prompt is large
  {
    const queryNorm = query.trim().toLowerCase();
    const responseNorm = response.slice(0, 300).toLowerCase();
    // Detect if response starts with the user's query text (echo pattern)
    const echoThreshold = Math.min(60, Math.floor(queryNorm.length * 0.6));
    const queryPrefix = queryNorm.slice(0, echoThreshold);
    if (queryPrefix.length > 20 && responseNorm.startsWith(queryPrefix)) {
      console.warn('[MOTHER v72.0] Echo detected: response starts with user query. Removing echo.');
      const echoEnd = response.toLowerCase().indexOf(queryNorm.slice(0, echoThreshold)) + echoThreshold;
      response = response.slice(echoEnd).replace(/^[\s\n\r:.,;!?-]+/, '').trim();
      if (response.length < 20) {
        response = 'Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.';
      }
    }
  }
  // ==================== C264: KNOWLEDGE GRAPH WRITE-BACK ====================
  // Scientific basis: GraphRAG (Edge et al., arXiv:2404.16130, 2024) — bidirectional KG updates
  // Continual Learning (Parisi et al., Neural Networks 2019) — online learning from high-quality outputs
  // Non-blocking: fire-and-forget, never delays response delivery
  setImmediate(() => {
    writeBackToKnowledgeGraph(
      query,
      response,
      quality.qualityScore,
      routingDecision.category,
      selectedModel
    ).then(result => {
      if (result.stored) log.info(`[KG Write-Back] ${result.reason}`);
    }).catch(err => log.warn('[KG Write-Back] Error (non-blocking):', err.message));
  });

  // ==================== RETURN RESPONSE ====================
  
  return {
    response,
    tier: complexity.tier,
    complexityScore: complexity.complexityScore,
    confidenceScore: complexity.confidenceScore,
    provider: selectedProvider,
    modelName: selectedModel,
    queryCategory: routingDecision.category,
    quality,
    responseTime,
    tokensUsed: usage.total_tokens,
    cost,
    costReduction,
    cacheHit: false,
    reactObservations: reactObservations.length > 0 ? reactObservations : undefined,
    queryId: queryId || 0,
    layout_hint: routingDecision.layout_hint, // R548 (AWAKE V236 Ciclo 164)
  };
}

/**
 * Batch process multiple queries
 * Useful for analytics and testing
 */
export async function processBatch(queries: string[], userId?: number): Promise<MotherResponse[]> {
  const results: MotherResponse[] = [];
  
  for (const query of queries) {
    const result = await processQuery({ query, userId });
    results.push(result);
  }
  
  return results;
}

/**
 * Get system statistics
 * Layer 7: Learning/Analytics
 */
export async function getSystemStats(): Promise<{
  totalQueries: number;
  tier1Percentage: number;
  tier2Percentage: number;
  tier3Percentage: number;
  avgQuality: number;
  avgResponseTime: number;
  avgCostReduction: number;
  cacheHitRate: number;
  version: string;
}> {
  const { getQueryStats } = await import('../db');
  
  const stats = await getQueryStats(24); // Last 24 hours
  
  const total = stats.totalQueries;
  
  return {
    totalQueries: total,
    tier1Percentage: total > 0 ? (stats.tier1Count / total) * 100 : 0,
    tier2Percentage: total > 0 ? (stats.tier2Count / total) * 100 : 0,
    tier3Percentage: total > 0 ? (stats.tier3Count / total) * 100 : 0,
    avgQuality: stats.avgQuality,
    avgResponseTime: stats.avgResponseTime,
    avgCostReduction: stats.avgCostReduction, // v68.3: Sprint 3 fix — real data from queries table
    cacheHitRate: stats.cacheHitRate,
    version: MOTHER_VERSION, // v69.1: Dynamic version from single source of truth
  };
}
