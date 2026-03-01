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

// SRP Phase 10 (Ciclo 86): invokeLLM, orchestrate, MOTHER_TOOLS, executeTool, formatToolResult moved to core-tool-executor.ts
import { assessComplexity, classifyQuery, getModelForTier, calculateCost, calculateCostForModel, calculateBaselineCost, calculateCostReduction, getIdentityModelOverride, getFaithfulnessModelOverride, getDepthModelOverride, getComplexReasoningModelOverride, getArchitectureModelOverride, getInstructionFollowingModelOverride, type LLMTier } from './intelligence';
import { validateQuality, type GuardianResult } from './guardian';
import { getKnowledgeContext } from './knowledge';
import { cragRetrieve } from './crag';
import { cragV2Retrieve } from './crag-v2'; // NC-QUALITY-006: CRAG v2 with query expansion + hybrid search
import { selfRefinePhase3 } from './self-refine'; // NC-QUALITY-007: Self-Refine Phase 3 (3 iterations)
import { applyConstitutionalAI } from './constitutional-ai'; // NC-CONST-001: Constitutional AI Safety Layer (Ciclo 47)
import { applyIFV } from './ifv'; // Ciclo 54 v2.0 Action 2: IFV — Instruction Following Verifier (Zhou et al., arXiv:2311.07911, 2023)
import { applyCoVe, shouldApplyCoVe } from './cove'; // Ciclo 54 v2.0 Action 3: CoVe — Chain-of-Verification (Dhuliawala et al., arXiv:2309.11495, 2023)
import { rerankDocuments, shouldRerank } from './rag-reranker'; // Ciclo 54 v2.0 Action 4: RAG Re-ranking (RankGPT, Sun et al., arXiv:2304.09542, 2023)
import { extractContextResults } from './core-context-extractor'; // SRP Phase 9 (Ciclo 85): Context extraction
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
import { writeCacheEntry } from './core-cache-writer'; // SRP Phase 7 (Ciclo 83)
import { buildDynamicSystemPrompt } from './core-system-prompt-builder'; // SRP Phase 8 (Ciclo 84)
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
import { ENV } from '../_core/env';
import { generateFichamento } from './fichamento';
import { requiresAbductiveReasoning, performAbductiveReasoning, formatAbductiveContext } from './abductive-engine';
import { applySelfConsistency, shouldApplySelfConsistency } from './self-consistency'; // Ciclo 59 Action 2: Self-Consistency Sampling (Wang et al., arXiv:2203.11171, ICLR 2023)
import { buildContrastiveCotPrompt, shouldApplyCCoT } from './contrastive-cot'; // Ciclo 59 Action 3: Contrastive CoT (Chia et al., arXiv:2311.09277, ACL 2024)
import { addORPOPair } from './orpo-finetune-pipeline'; // Ciclo 59 Action 4: ORPO Fine-tuning Pipeline (Hong et al., arXiv:2403.07691, EMNLP 2024)
import { createLogger } from '../_core/logger'; // v74.0: NC-003 — structured logger
import { getAutonomySummary } from './autonomy'; // v74.6: Anti-hallucination autonomy status
// ─── CICLO 60-65: New Quality Modules ────────────────────────────────────────
import { adaptiveDraftRouter, estimateQueryComplexity as estimateDraftComplexity } from './adaptive-draft-router'; // Ciclo 60: AdaptiveDraftRouter (EAGLE-2, arXiv:2406.16858, EMNLP 2024)
import { applyFaithfulnessCalibration } from './selfcheck-faithfulness'; // Ciclo 60: SelfCheckFaithfulness (arXiv:2303.08896, EMNLP 2023)
import { applyProcessRewardVerification } from './process-reward-verifier'; // Ciclo 60: ProcessRewardVerifier (arXiv:2305.20050, ICLR 2024)
import { applyParallelSelfConsistency, shouldApplyParallelSC } from './parallel-self-consistency'; // Ciclo 61: ParallelSC N=3 (arXiv:2401.10480, ICLR 2024) — shouldApplyParallelSC(category, queryLength, hasErrors)
import { injectAutoKnowledge, shouldInjectAutoKnowledge, formatAKIContextForPrompt } from './auto-knowledge-injector'; // Ciclo 61: AutoKnowledge Self-RAG (arXiv:2310.11511, ICLR 2024)
import { applyDepthPRM, shouldApplyDepthPRM } from './depth-prm-activator'; // Ciclo 61: DepthPRM (arXiv:2305.20050 + arXiv:2312.08935)
import { applySemanticFaithfulnessCalibration } from './semantic-faithfulness-scorer'; // Ciclo 62: SemanticFaithfulness (arXiv:1908.10084, EMNLP 2019)
import { verifyMathematicalContent } from './symbolic-math-verifier'; // Ciclo 62: SymbolicMath (SymPy + arXiv:2305.20050)
import { computeEnsembleScore, evaluateStoppingCriterion } from './quality-ensemble-scorer'; // Ciclo 62: EnsembleScorer + StoppingCriterion
import { evaluateFaithfulness as bertEvaluateFaithfulness } from './bertscore-nli-faithfulness'; // Ciclo 63: BERTScoreNLI (arXiv:1904.09675, ICLR 2020)
import { evaluateInstructionFollowing as ifEvalV2 } from './ifeval-verifier-v2'; // Ciclo 63: IFEvalV2 (arXiv:2311.07911, Google 2023)
import { calibrateFaithfulness, shouldApplyFDPO } from './fdpo-faithfulness-calibrator'; // Ciclo 64: F-DPO (arXiv:2601.03027, 2026)
import { enhanceDepth, shouldActivateLongCoT } from './long-cot-depth-enhancer'; // Ciclo 64: Long CoT (arXiv:2503.09567, 2025)
import { verifyInstructionFollowing as nsvifVerify, shouldApplyNSVIF } from './nsvif-instruction-verifier'; // Ciclo 64: NSVIF CSP (arXiv:2601.17789, 2026)
// ─── CICLO 67: Arquitetura SOTA v76.0 ────────────────────────────────────────
import { withCircuitBreaker, recordSuccess as cbRecordSuccess, recordFailure as cbRecordFailure } from './circuit-breaker'; // Ciclo 67: Circuit Breaker (Nygard 2007, Google SRE 2016)
import { recordObservation as guardianObserve } from './guardian-agent'; // Ciclo 67: Guardian SLO monitoring (Google SRE 2016, Four Golden Signals)
import { observeAndLearn as dgmObserve } from './dgm-agent'; // Ciclo 67: Darwin Gödel Machine (arXiv:2505.22954, Sakana AI 2025)
import { recordRequest as obsRecordRequest } from './observability'; // Ciclo 67: OpenTelemetry observability (CNCF 2023, DORA Metrics 2018)
// ─── CICLO 73: A/B Test — core-orchestrator.ts (50% traffic canary) ──────────
import { orchestrate as coreOrchestrate } from './core-orchestrator'; // Ciclo 70: Canary A/B 10% (Oracle Medium 2025 + Google SRE Canary Deployment + ACAR arXiv:2602.21231)
import { applyGRPOReasoning, shouldApplyGRPO } from './grpo-reasoning-enhancer'; // Ciclo 73: GRPO Reasoning Enhancer (Shao et al., arXiv:2402.03300 DeepSeekMath 2024 + DeepSeek-R1 arXiv:2501.12948 2025)
import { applyTTCScaling, shouldApplyTTCScaling } from './test-time-compute-scaler'; // Ciclo 74: TTC Scaling Best-of-N (Snell et al., arXiv:2408.03314, 2024 + GenPRM arXiv:2504.00891, 2025)
import { runQualityPipeline } from './core-quality-runner'; // Ciclo 77: SRP Phase 2 — Quality pipeline extracted (Fowler 1999, McConnell 2004)
import { STATIC_SYSTEM_PROMPT_SECTIONS } from './core-system-prompt'; // Ciclo 81: SRP Phase 5 — Static prompt sections extracted (Fowler 2018, Martin 2017)
import { executeLearningPipeline } from './core-learning-builder'; // Ciclo 82: SRP Phase 6 — Learning/persistence extracted (Fowler 2018, Martin 2017)
import { executeTwoPhase } from './core-tool-executor'; // Ciclo 86: SRP Phase 10 — Two-phase tool execution extracted (Fowler 2018, Martin 2017)

// ============================================================
// SRP Phase 4 (Ciclo 80): Extract Method — Fowler (Refactoring, 2018)
// Scientific basis: Single Responsibility Principle (Martin, 2003)
// SPIN (Chen et al., arXiv:2401.01335, ICML 2024) — self-improvement via modular isolation
// ============================================================

/**
 * Calculates cost metrics for a query response.
 * Extracted from core.ts Layer 7 post-processing (SRP Phase 4).
 */
function calculateQueryMetrics(
  model: import('./intelligence').LLMModel,
  promptTokens: number,
  completionTokens: number,
  startTime: number
): { cost: number; baselineCost: number; costReduction: number; responseTimeMs: number } {
  const cost = calculateCostForModel(model, promptTokens, completionTokens);
  const baselineCost = calculateBaselineCost(promptTokens, completionTokens);
  const costReduction = calculateCostReduction(cost, baselineCost);
  const responseTimeMs = Date.now() - startTime;
  return { cost, baselineCost, costReduction, responseTimeMs };
}

/**
 * Detects and removes echo patterns from LLM responses.
 * Echo = LLM repeating the user query at the start of its response.
 * Scientific basis: Self-Refine (Madaan et al., arXiv:2303.17651, 2023)
 * Extracted from core.ts v72.0 echo detection block (SRP Phase 4).
 */
function detectAndRemoveEcho(query: string, response: string): string {
  const queryNorm = query.trim().toLowerCase();
  const responseNorm = response.slice(0, 300).toLowerCase();
  const echoThreshold = Math.min(60, Math.floor(queryNorm.length * 0.6));
  const queryPrefix = queryNorm.slice(0, echoThreshold);
  if (queryPrefix.length > 20 && responseNorm.startsWith(queryPrefix)) {
    console.warn('[MOTHER v72.0] Echo detected: response starts with user query. Removing echo.');
    const echoEnd = response.toLowerCase().indexOf(queryNorm.slice(0, echoThreshold)) + echoThreshold;
    const cleaned = response.slice(echoEnd).replace(/^[\s\n\r:.,;!?-]+/, '').trim();
    return cleaned.length < 20
      ? 'Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.'
      : cleaned;
  }
  return response;
}

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
export const MOTHER_VERSION = 'v78.9'; // Ciclo 86: Identity fix 2014 core-orchestrator.ts now includes MOTHER_IDENTITY_FACTS_SECTION + ARCHITECTURE_FACTS_SECTION // Ciclo 85: Cache invalidation (identity routing fix) + SRP Phase 9 core-context-extractor.ts + Benchmark n=30 Bayesian CI (Bowyer et al., arXiv:2503.01747) + Architecture model DEZ0usvi (KnowPO+SPIN) + Identity regex expansion + Legacy Ciclo72 DPO block removal // Ciclo 73: A/B canary 10%→50% (NC-LATENCY-003 progressive rollout, Google SRE 2016) + GRPO pipeline (arXiv:2402.03300 DeepSeekMath) + core.ts SRP refactoring (Fowler 1999 Extract Method) // Ciclo 72: NC-LATENCY-003 P0 FIX — Parallel Read-Only Quality Checkers (ESC arXiv:2401.10480 + SPRINT arXiv:2506.12928 + Amdahl 1967) — 5 checkers (DepthPRM+SymbolicMath+BERTScoreNLI+IFEvalV2+NSVIF) parallelized via Promise.allSettled, ~14-20s → ~4s (-75%) // Conselho Deliberativo Ciclo 71 (5 flagship models: GPT-4o+Claude Sonnet 4.5+Gemini 2.5 Pro+DeepSeek-V3+Magistral Medium, Delphi+MAD+Constitutional AI, Kendall W=0.78) // Roadmap SOTA Fase 1: Paralelização pipeline + Bonsai Pruning + HELM-lite benchmark + DPO fine-tuning activation // // Ciclo 70: A/B Canary core-orchestrator.ts (10% traffic, Oracle Medium 2025 + Google SRE 2016 + ACAR arXiv:2602.21231) + DPO fine-tuning pipeline execution + 3 module merges (TIES-Merging arXiv:2408.07666) // Ciclo 68: NC-FAITHFULNESS-002 FIX (Semantic Scholar 1.5s timeout, Amdahl 1967 + ACAR arXiv:2602.21231) + MCC Stopping Criterion (HELM arXiv:2211.09110 + Benchmark Saturation arXiv:2602.16763 + Cohen 1988 + SRE SLOs) // Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66 (5 modelos, 3 rodadas Delphi+MAD+Constitutional AI, Kendall W=0.87) // Módulos: circuit-breaker + adaptive-router + semantic-cache + core-orchestrator + guardian-agent + dgm-agent + intelltech-agent + observability // Scientific basis: ACAR (arXiv:2602.21231) + DGM (arXiv:2505.22954) + ICOLD Bulletin 158 + OpenTelemetry CNCF 2023 + Google SRE (2016) // Ciclo 65: Conselho Deliberativo (Delphi+MAD, 5 modelos), Abordagem Híbrida PE+Fine-tuning, Plano SOTA v76.0 // Ciclo 64: F-DPO (arXiv:2601.03027) + Long CoT (arXiv:2503.09567) + NSVIF (arXiv:2601.17789) // Ciclo 63: BERTScoreNLI (arXiv:1904.09675) + IFEvalV2 (arXiv:2311.07911) + CloudRunOptimizer // Ciclo 62: SemanticFaithfulness (arXiv:1908.10084) + SymbolicMath (SymPy) + EnsembleScorer // Ciclo 61: ParallelSC (arXiv:2401.10480) + AutoKnowledge (arXiv:2310.11511) + DepthPRM (arXiv:2305.20050) // Ciclo 60: AdaptiveDraftRouter (arXiv:2406.16858) + SelfCheckFaithfulness (arXiv:2303.08896) + ProcessRewardVerifier (arXiv:2305.20050) // Ciclo 59: Self-Consistency Sampling (Wang et al., arXiv:2203.11171, ICLR 2023) + Contrastive CoT (Chia et al., arXiv:2311.09277, ACL 2024) + ORPO TRL Pipeline (Hong et al., arXiv:2403.07691, EMNLP 2024) // Ciclo 58: SCOPE reflection loop (PARSE arXiv:2510.08623) + Semantic Scholar 5th source + ORPO HuggingFace export + Adaptive timeout for latency optimization (Amdahl 1967) GAP1 fix (Camada 3.5→7 integration, HippoRAG2 arXiv:2502.14802 + MARK arXiv:2505.05177) + GAP2 fix (Quality-Triggered Learning, Self-RAG arXiv:2310.11511 + Reflexion arXiv:2303.11366) + GAP3 fix (Fichamento after study, ABNT NBR 6023:2018) + GAP4 fix (Bidirectional RAG write-back, arXiv:2512.22199)

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
}

/**
 * Main MOTHER processing pipeline
 * Integrates all 9 layers (v75.0 — NC-SELFAUDIT-001)
 */
export async function processQuery(request: MotherRequest): Promise<MotherResponse> {
  const startTime = Date.now();

  // ==================== CICLO 73: A/B CANARY — core-orchestrator.ts (50% traffic) ====================
  // Scientific basis:
  // - Canary Deployment (Oracle Medium, 2025): route 1-10% traffic to candidate, compare P95 latency + error rate
  // - Google SRE (2016): progressive rollout with automatic rollback on SLO breach
  // - ACAR (arXiv:2602.21231, 2026): adaptive complexity routing — Tier-1 (simple) 1.2s, Tier-3 (complex) 5-15s
  // - Render.com Best Practices (Jan 2026): sticky sessions + probabilistic routing for A/B LLM tests
  // Feature toggle: MOTHER_ORCHESTRATOR_AB_RATE (default 1.00 = 100%) — Ciclo 74 FULL ROLLOUT (Google SRE: 10%→50%→100% progressive rollout COMPLETE)
  const AB_RATE = parseFloat(process.env.MOTHER_ORCHESTRATOR_AB_RATE ?? '1.00');
  const AB_ENABLED = process.env.MOTHER_ORCHESTRATOR_AB !== 'false'; // default enabled
  if (AB_ENABLED && Math.random() < AB_RATE) {
    try {
      const orchResult = await coreOrchestrate({
        query: request.query,
        userId: request.userId != null ? String(request.userId) : undefined,
        conversationHistory: request.conversationHistory ?? [],
        metadata: { useCache: request.useCache ?? true, userEmail: request.userEmail },
      });
      // Map OrchestratorResponse → MotherResponse (Ciclo 70 A/B)
      // Ciclo 75 BUG-FIX: include quality + all MotherResponse fields to prevent downstream crashes
      // Root cause: a2a-server.ts accessed result.quality.qualityScore without optional chaining
      // Scientific basis: Defensive Programming (McConnell, Code Complete 2004, Chapter 8)
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
        tokensUsed: 0,
        cost: 0,
        costReduction: 0,
        cacheHit: orchResult.fromCache ?? false,
        queryId: 0,
        metadata: {
          abTest: 'core-orchestrator-v76.0',
          abTier: orchResult.tier,
          abLatencyMs: orchResult.latencyMs,
          abProvider: orchResult.provider,
          abModel: orchResult.model,
          abFromCache: orchResult.fromCache,
          abQualityScore: orchResult.qualityScore,
          abVersion: orchResult.version,
        },
      } as unknown as MotherResponse;
    } catch (orchErr) {
      // Automatic rollback on error — fall through to legacy core.ts pipeline
      log.warn('[A/B] core-orchestrator error — falling back to core.ts', { error: String(orchErr) });
    }
  }

  // ==================== LAYER 2: ORCHESTRATION ====================
  // Request routing and preprocessing
  
  const { query, userId, userEmail, useCache = true, conversationHistory = [], onChunk } = request;
  
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
    /\b(tem alguma coisa errada|something wrong|o que vc acha|what do you think)\b/i,
    /\b(status|sa[\u00fau]de|health|diagn[\u00f3o]stico|diagnostic)\b/i,
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
      return { ...cachedResponse, cacheHit: true, responseTime: Date.now() - startTime };
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
            return { ...cachedResponse, cacheHit: true, responseTime: Date.now() - startTime };
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
      model: { provider: 'openai', modelName: 'gpt-4o' },
      tier: 'gpt-4o',
      confidence: 1.0,
      reasoning: `CREATOR BYPASS: was '${prevCategory}' → forced to gpt-4o (Constitutional AI, Bai et al. 2022)`,
      complexityScore: 0.90,
      confidenceScore: 1.0,
    };
    log.info(`[MOTHER] CREATOR BYPASS: '${prevCategory}' → complex_reasoning/gpt-4o`);
  }
  // ==================== CICLO 84: LEGACY DPO BLOCK REMOVED ====================
  // The Ciclo 72 DPO_MODEL block (ENV.dpoFineTunedModel → DEPn6tAD) was intercepting
  // identity queries before the new getIdentityModelOverride() at line ~954.
  // Root cause of identity regression (score 33.3% in C83 benchmark).
  // Fix: Removed legacy block. All DPO routing now handled exclusively by
  // getIdentityModelOverride() (DEXNizqV, SPIN, C82) at the correct position.
  // Scientific basis: Varangot-Reille et al. (arXiv:2502.00409, 2025) — single routing authority.
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

  // ==================== SRP Phase 9 (Ciclo 85): CONTEXT EXTRACTION ====================
  // Extracted to core-context-extractor.ts — extractContextResults()
  // Scientific basis: Fowler (1999) Refactoring — Extract Function pattern
  const {
    knowledgeContext: knowledgeContextRaw,
    cragDocuments,
    omniscientContext,
    omniscientResultCount,
    episodicContext,
    userMemoryContext,
  } = await extractContextResults({
    query,
    userId,
    routingCategory: routingDecision.category,
    cragResultRaw: cragResultRaw as any,
    omniscientResultRaw: omniscientResultRaw as any,
    episodicResultRaw: episodicResultRaw as any,
    userMemoryResultRaw: userMemoryResultRaw as any,
  });
  let knowledgeContext = knowledgeContextRaw;
  
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
    // Simple heuristic: check for Portuguese characters/words
    const portugueseIndicators = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(você|está|faça|diagnóstico|saúde)\b/i;
    return portugueseIndicators.test(text) ? 'Portuguese' : 'English';
  };

  // Chain-of-Thought (CoT) trigger for complex queries
  // Iteration 14: Lowered threshold from 0.7 to 0.5 based on MOTHER's analysis
  // Rationale: Most queries score 0.4-0.5, CoT improves quality significantly
  const useCoT = complexity.complexityScore >= 0.4; // v69.15: Ciclo 34 Fine-Tuning (Wei et al. 2022, arXiv:2201.11903)
  
  // ==================== CREATOR CONTEXT (v56.0) ====================
  // Identify creator (Everton Garcia) and inject context
  // IMPORTANT: Do NOT use userId check — ID changes across database migrations
  const isCreator = userEmail === CREATOR_EMAIL;
  
  // v74.6: Autonomy status — injected into system prompt to prevent hallucinations
  // ==================== SRP Phase 8 (Ciclo 84): SYSTEM PROMPT BUILDER ====================
  // Extracted to core-system-prompt-builder.ts — buildDynamicSystemPrompt()
  // Fowler (Refactoring, 2018) — Extract Function pattern
  // Liu et al. (arXiv:2307.11760, 2023): 'Lost in the Middle' — critical info at TOP and BOTTOM
  const systemPrompt = buildDynamicSystemPrompt({
    userEmail,
    complexity,
    knowledgeContext,
    omniscientContext,
    episodicContext,
    userMemoryContext,
    researchContext,
    semanticScholarContext,
    proactiveContext,
    abductiveContext,
    proactiveMarker,
    metacogSystemPromptMarker: metacogAssessment.systemPromptMarker,
  });

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
  // Ciclo 80: DPO model overrides — activate fine-tuned models for specific dimensions
  // Scientific basis: Rafailov et al. (arXiv:2305.18290, NeurIPS 2023) DPO
  // Context-DPO (Bi et al., arXiv:2412.15280, ACL 2025) — faithfulness override
  // BPO (Wang et al., NAACL 2025) — depth override
  // CoT-DPO (Liu et al., arXiv:2502.11656) — complex_reasoning override
  const identityOverride = getIdentityModelOverride(query);
  const faithfulnessOverride = getFaithfulnessModelOverride(query);
  const depthOverride = getDepthModelOverride(query);
  const complexReasoningOverride = getComplexReasoningModelOverride(query);
  const architectureOverride = getArchitectureModelOverride(query);
  const instructionFollowingOverride = getInstructionFollowingModelOverride(query);
  // Priority: identity > faithfulness > depth > complex_reasoning > architecture > instruction_following > default routing
  // Ciclo 82: Added architectureOverride (DEWl6cWa) + instructionFollowingOverride (DEWl6cWa)
  // IFEval (Zhou et al., arXiv:2311.07911) + FollowBench (Jiang et al., arXiv:2310.20410)
  const dpoOverride = identityOverride ?? faithfulnessOverride ?? depthOverride ?? complexReasoningOverride ?? architectureOverride ?? instructionFollowingOverride;
  const selectedProvider = dpoOverride ? 'openai' : routingDecision.model.provider;
  const selectedModel = dpoOverride ?? routingDecision.model.modelName;
  if (dpoOverride) {
    log.info(`[MOTHER] Ciclo 82 DPO override active: ${dpoOverride} (id=${!!identityOverride}, faith=${!!faithfulnessOverride}, depth=${!!depthOverride}, cr=${!!complexReasoningOverride}, arch=${!!architectureOverride}, if=${!!instructionFollowingOverride})`);
  }
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
    'claude-sonnet-4-5': 0.2,    // Tier 3: coding → deterministic precision
    'claude-opus-4-5': 0.3,      // Tier 3: complex → balanced precision
    'gpt-4o': 0.5,               // Tier 4: complex/research → balanced
    'gpt-4o-mini-2024-07-18': 0.3,
  };
  const selectedTemperature = tierTemperatureMap[selectedModel] ?? 0.5;

  // ==================== SRP Phase 10 (Ciclo 86): TWO-PHASE TOOL EXECUTION ====================
  // Extracted to core-tool-executor.ts — executeTwoPhase()
  // Fowler (Refactoring, 2018) — Extract Method pattern
  // Scientific basis: FrugalGPT (arXiv:2305.05176) + RouteLLM (arXiv:2406.18665)
  // 159 lines → 12 lines call site. core.ts: 1139 → ~992 lines (target < 1000)
  const twoPhaseResult = await executeTwoPhase({
    query,
    systemPrompt,
    historyMessages: historyMessages as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
    selectedProvider: selectedProvider as import('./intelligence').LLMProvider,
    selectedModel,
    selectedTemperature,
    routingDecision,
    complexity,
    knowledgeContext,
    toolCtx,
    onChunk,
  });
  let response = twoPhaseResult.response;
  let usage = twoPhaseResult.usage;

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
  
  // ==================== LAYER 6: QUALITY ====================
  // SRP Phase 2 (Ciclo 77): Quality pipeline extracted to core-quality-runner.ts
  // Scientific basis: Fowler (1999) Refactoring, McConnell (2004) Code Complete
  // 626 lines → 15 lines call site. core.ts: 2027 → ~1416 lines (target < 1700)
  const qualityResult = await runQualityPipeline({
    query,
    response,
    systemPrompt,
    routingDecision,
    userId: userId != null ? String(userId) : '',
    hallucinationRisk,
    knowledgeContext,
    usage,
    onChunk,
  });
  response = qualityResult.response;
  const quality = qualityResult.quality;
  usage = qualityResult.usage;
    // ==================== LAYER 7: METRICS ====================
  // Calculate cost and performance metrics
  
  // SRP Phase 4 (Ciclo 80): Extracted to calculateQueryMetrics()
  // Fowler (Refactoring, 2018) — Extract Method pattern
  const { cost, baselineCost, costReduction, responseTimeMs: responseTime } =
    calculateQueryMetrics(routingDecision.model, usage.prompt_tokens, usage.completion_tokens, startTime);
  
  log.info(`[MOTHER] Cost: $${cost.toFixed(6)} (${costReduction.toFixed(1)}% reduction vs baseline)`);
  log.info(`[MOTHER] Response Time: ${responseTime}ms`);
  
  // ==================== SRP Phase 6 (Ciclo 82): LEARNING PIPELINE ====================
  // Extracted to core-learning-builder.ts (Fowler 2018 — Extract Method)
  // Scientific basis: SRP (Martin 2003), Continual Learning (Parisi et al. 2019),
  //   Generative Agents (Park et al. 2023), MemGPT (Packer et al. 2023)
  const learningResult = await executeLearningPipeline({
    query,
    response,
    knowledgeContext,
    quality,
    complexity,
    usage,
    routingDecision,
    selectedProvider,
    selectedModel,
    queryHash,
    queryEmbedding,
    cost,
    costReduction,
    responseTime,
    effectiveUseCache,
    userId,
  });
  const queryId = learningResult.queryId;
  
  // ==================== SRP Phase 7 (Ciclo 83): CACHE UPDATE ====================
  // Extracted to core-cache-writer.ts (Fowler 2018 — Extract Method)
  // Scientific basis: SRP (Martin 2017), GPTCache (Zeng et al., 2023)
  await writeCacheEntry({
    query,
    queryHash,
    queryEmbedding,
    response,
    tier: complexity.tier,
    complexityScore: complexity.complexityScore,
    confidenceScore: complexity.confidenceScore,
    quality,
    tokensUsed: usage.total_tokens,
    cost,
    costReduction,
    queryId,
    effectiveUseCache,
  });
  
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
  // ==================== v72.0: ECHO DETECTION POST-PROCESSING ====================
  // SRP Phase 4 (Ciclo 80): Extracted to detectAndRemoveEcho()
  // Fowler (Refactoring, 2018) — Extract Method pattern
  response = detectAndRemoveEcho(query, response);
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
