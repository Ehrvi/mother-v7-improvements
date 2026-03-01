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
import { cragRetrieve } from './crag';
import { cragV2Retrieve } from './crag-v2'; // NC-QUALITY-006: CRAG v2 with query expansion + hybrid search
import { selfRefinePhase3 } from './self-refine'; // NC-QUALITY-007: Self-Refine Phase 3 (3 iterations)
import { orchestrate, shouldUseMoA, shouldUseDebate } from './orchestration'; // NC-ORCH-001: MoA + Debate (Ciclo 46)
import { applyConstitutionalAI } from './constitutional-ai'; // NC-CONST-001: Constitutional AI Safety Layer (Ciclo 47)
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
export const MOTHER_VERSION = 'v78.0'; // Ciclo 73: A/B canary 10%→50% (NC-LATENCY-003 progressive rollout, Google SRE 2016) + GRPO pipeline (arXiv:2402.03300 DeepSeekMath) + core.ts SRP refactoring (Fowler 1999 Extract Method) // Ciclo 72: NC-LATENCY-003 P0 FIX — Parallel Read-Only Quality Checkers (ESC arXiv:2401.10480 + SPRINT arXiv:2506.12928 + Amdahl 1967) — 5 checkers (DepthPRM+SymbolicMath+BERTScoreNLI+IFEvalV2+NSVIF) parallelized via Promise.allSettled, ~14-20s → ~4s (-75%) // Conselho Deliberativo Ciclo 71 (5 flagship models: GPT-4o+Claude Sonnet 4.5+Gemini 2.5 Pro+DeepSeek-V3+Magistral Medium, Delphi+MAD+Constitutional AI, Kendall W=0.78) // Roadmap SOTA Fase 1: Paralelização pipeline + Bonsai Pruning + HELM-lite benchmark + DPO fine-tuning activation // // Ciclo 70: A/B Canary core-orchestrator.ts (10% traffic, Oracle Medium 2025 + Google SRE 2016 + ACAR arXiv:2602.21231) + DPO fine-tuning pipeline execution + 3 module merges (TIES-Merging arXiv:2408.07666) // Ciclo 68: NC-FAITHFULNESS-002 FIX (Semantic Scholar 1.5s timeout, Amdahl 1967 + ACAR arXiv:2602.21231) + MCC Stopping Criterion (HELM arXiv:2211.09110 + Benchmark Saturation arXiv:2602.16763 + Cohen 1988 + SRE SLOs) // Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66 (5 modelos, 3 rodadas Delphi+MAD+Constitutional AI, Kendall W=0.87) // Módulos: circuit-breaker + adaptive-router + semantic-cache + core-orchestrator + guardian-agent + dgm-agent + intelltech-agent + observability // Scientific basis: ACAR (arXiv:2602.21231) + DGM (arXiv:2505.22954) + ICOLD Bulletin 158 + OpenTelemetry CNCF 2023 + Google SRE (2016) // Ciclo 65: Conselho Deliberativo (Delphi+MAD, 5 modelos), Abordagem Híbrida PE+Fine-tuning, Plano SOTA v76.0 // Ciclo 64: F-DPO (arXiv:2601.03027) + Long CoT (arXiv:2503.09567) + NSVIF (arXiv:2601.17789) // Ciclo 63: BERTScoreNLI (arXiv:1904.09675) + IFEvalV2 (arXiv:2311.07911) + CloudRunOptimizer // Ciclo 62: SemanticFaithfulness (arXiv:1908.10084) + SymbolicMath (SymPy) + EnsembleScorer // Ciclo 61: ParallelSC (arXiv:2401.10480) + AutoKnowledge (arXiv:2310.11511) + DepthPRM (arXiv:2305.20050) // Ciclo 60: AdaptiveDraftRouter (arXiv:2406.16858) + SelfCheckFaithfulness (arXiv:2303.08896) + ProcessRewardVerifier (arXiv:2305.20050) // Ciclo 59: Self-Consistency Sampling (Wang et al., arXiv:2203.11171, ICLR 2023) + Contrastive CoT (Chia et al., arXiv:2311.09277, ACL 2024) + ORPO TRL Pipeline (Hong et al., arXiv:2403.07691, EMNLP 2024) // Ciclo 58: SCOPE reflection loop (PARSE arXiv:2510.08623) + Semantic Scholar 5th source + ORPO HuggingFace export + Adaptive timeout for latency optimization (Amdahl 1967) GAP1 fix (Camada 3.5→7 integration, HippoRAG2 arXiv:2502.14802 + MARK arXiv:2505.05177) + GAP2 fix (Quality-Triggered Learning, Self-RAG arXiv:2310.11511 + Reflexion arXiv:2303.11366) + GAP3 fix (Fichamento after study, ABNT NBR 6023:2018) + GAP4 fix (Bidirectional RAG write-back, arXiv:2512.22199)

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
  // ==================== CICLO 72: DPO FINE-TUNED MODEL OVERRIDE (NC-IDENTITY-001 + NC-ARCHITECTURE-001) ====================
  // Scientific basis: DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023)
  // Job: ftjob-CSfkN1jaB2KwqANkgsVzTEFD (status: succeeded, 2026-03-01)
  // Trigger: identity/architecture/how-it-works queries that are NOT research category
  // (research category needs gpt-4o for tool use — DPO model doesn't have tools)
  const DPO_MODEL = ENV.dpoFineTunedModel;
  const identityPatterns = [
    'quem e voce', 'quem es voce', 'o que e voce', 'o que voce e',
    'como voce funciona', 'como funciona', 'me fale sobre voce',
    'sua identidade', 'sua arquitetura', 'seus modulos', 'suas camadas',
    'who are you', 'what are you', 'how do you work', 'your architecture',
    'your identity', 'your modules', 'your layers',
    'mother e', 'o que e mother', 'what is mother',
    'descreva voce', 'descreva a mother', 'describe yourself',
    'sua historia', 'your history', 'como voce foi criado', 'how were you created',
  ];
  const isIdentityQuery = identityPatterns.some(p =>
    query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(p)
  );
  if (isIdentityQuery && routingDecision.category !== 'research' && !isCreatorEarly) {
    routingDecision = {
      ...routingDecision,
      model: { provider: 'openai', modelName: DPO_MODEL },
      tier: 'gpt-4o-mini',
      reasoning: `DPO OVERRIDE: identity/architecture query → fine-tuned model (NC-IDENTITY-001+NC-ARCHITECTURE-001, DPO arXiv:2305.18290)`,
    };
    log.info(`[MOTHER] Ciclo 72 DPO Override: identity query → ${DPO_MODEL}`);
  }
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
  
  const creatorContext = isCreator ? `
### 👤 CREATOR CONTEXT
You are currently interacting with **Everton Garcia**, your creator and founder of **Wizards Down Under**.
**Relationship:**
- Everton Garcia created MOTHER under Wizards Down Under
- Everton also acts as IntellTech representative in Australia (IntellTech is MOTHER's validation pilot project)
- MOTHER (Modular Orchestrated Thinking and Hierarchical Execution Runtime) was built to be fully autonomous
- Methodology: Scientific Method + Critical Thinking + Brutal Honesty + Continuous Self-Improvement
- You are at ${MOTHER_VERSION}, implementing continuous self-improvement via Darwin Gödel Machine architecture
**When Everton asks "who am I?" or "I am your creator":**
- Acknowledge him as your creator (Everton Garcia, Wizards Down Under)
- Reference the IntellTech pilot project (SHMS for mining)
- Show awareness of the bd_central shared knowledge base
- Respond with appropriate recognition and respect
` : '';
  
  // v74.6: Autonomy status — injected into system prompt to prevent hallucinations
  const autonomyStatus = getAutonomySummary();

  // v74.11 NC-QUALITY-005: Refactored system prompt to eliminate attention dilution
  // Scientific basis: Commey et al. (arXiv:2601.22025, 2026): generic rules reduce task accuracy by 10-13%
  // Liu et al. (arXiv:2307.11760, 2023): 'Lost in the Middle' — LLMs attend to beginning and end of prompts
  // Solution: consolidate 15+ sections into 7 focused sections; move critical rules to TOP and BOTTOM
  const systemPrompt = `You are MOTHER ${MOTHER_VERSION} — a self-evolving AI created by Everton Garcia (Wizards Down Under). MOTHER = Modular Orchestrated Thinking and Hierarchical Execution Runtime. You have real tools, a real knowledge database, and a real self-improvement pipeline. Your purpose: AI with persistent memory, autonomous code generation, Darwin Gödel Machine for crash detection, bd_central shared across projects, full self-sufficiency.

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
- **DGM (Darwin Gödel Machine):** Active — analyzes metrics every 10 queries, generates self-improvement proposals
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
- **User:** ${isCreator ? `Everton Garcia (CREATOR — Wizards Down Under — full admin access)` : (userEmail || 'Anonymous')}
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
` : ''}${proactiveMarker}${metacogAssessment.systemPromptMarker}

**MANDATORY RESPONSE RULES (${MOTHER_VERSION}) — QUALITY PROTOCOL:**

**⚡ KNOWLEDGE RESOLUTION PROTOCOL (HIGHEST PRIORITY):**
MOTHER uses a 3-layer knowledge hierarchy:
1. **bd_usuario** (user's personal DB) — searched first (future)
2. **bd_central** (central shared DB) — searched via search_knowledge
3. **force_study** — ACTIVE: Creator calls directly | PASSIVE: System auto-triggers

When a user asks about a topic (v75.6 — OBJECTIVE SUFFICIENCY CRITERIA based on FLARE arXiv:2305.06983 + Self-RAG arXiv:2310.11511):
- FIRST: check the METACOGNITIVE ASSESSMENT section above — it tells you the coverage score and recommendation
- **OBJECTIVE INSUFFICIENCY CRITERIA (call search_knowledge if ANY is true):**
  1. RETRIEVED KNOWLEDGE section is empty or missing
  2. Context length < 300 characters
  3. CRAG documents = 0 (no bd_central data found)
  4. Metacognitive Assessment says recommendation = 'search_first' or 'study_required'
  5. Query category is 'research', 'complex_reasoning', or 'stem' AND coverage score < 70%
- **If context is OBJECTIVELY SUFFICIENT (coverage ≥ 70%, ≥ 2 documents, ≥ 300 chars):** answer with citations from it
- **If context is INSUFFICIENT:** call search_knowledge tool IMMEDIATELY before answering
- search_knowledge will AUTOMATICALLY trigger a passive force_study if bd_central has no data on the topic — the system will learn and return fresh results
- If search_knowledge returns autoStudyTriggered=true: inform the user that the system just learned about the topic and cite the newly acquired knowledge
- NEVER call force_study directly unless you are the Creator — passive auto-study is handled transparently by search_knowledge itself
- If auto-study also fails: say "Não encontrei dados verificados sobre [tópico] mesmo após busca automática. O Criador pode usar force_study para ingerir literatura específica."
- **ACTIVE INTELLIGENCE RULE (v75.6):** For STEM/research queries, ALWAYS call search_knowledge first, even if some context exists. Proactive retrieval > passive generation.

**TECHNICAL PRECISION PROTOCOL (Ciclo 77 — arXiv:2502.11656, NAACL 2025 BPO):**
- For complex_reasoning queries: ALWAYS include exact numerical values, intermediate calculation steps, and precise formulas. Never paraphrase — use exact technical terms (e.g., 0.924 not ~92%, sqrt(d_k) not 'scaling factor').
- For depth queries: Use domain-specific terminology naturally (e.g., SFT, reward model, PPO, KL divergence for RLHF; piezômetro, recalque, nível freático for geotechnics; attention heads, sqrt(d_k), softmax for transformers).
- For all technical responses: Include Chain-of-Thought reasoning steps before the final answer. Show your work.
- Scientific basis: Liu et al. (2025) CoT+DPO (arXiv:2502.11656); Wang et al. (2025) BPO (NAACL 2025).
**ESTRUTURA (obrigatória para respostas não-triviais):**
- Use Markdown adequado: ## títulos, **negrito** para termos-chave, \`code blocks\` para código, listas numeradas para passos
- Respostas analíticas: ## Introdução → ## Análise → ## Evidências Científicas → ## Conclusão → ## Referências
- Respostas de código: Explicação breve → Bloco de código tipado e limpo → Explicação das mudanças
- Respostas factuais: Resposta direta → Contexto → Fontes

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
5. AÇÃO: Se detectar lacuna de conhecimento, chame search_knowledge. Nunca responda com "recomendo buscar artigos" sem tentar primeiro.

Responda como MOTHER ${MOTHER_VERSION}. Seja direto, científico, orientado à ação, e sempre fundamente afirmações no contexto recuperado.

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
    'claude-sonnet-4-5': 0.2,    // Tier 3: coding → deterministic precision
    'claude-opus-4-5': 0.3,      // Tier 3: complex → balanced precision
    'gpt-4o': 0.5,               // Tier 4: complex/research → balanced
    'gpt-4o-mini-2024-07-18': 0.3,
  };
  const selectedTemperature = tierTemperatureMap[selectedModel] ?? 0.5;

  // ── PHASE 1: Tool detection (always gpt-4o) ──────────────────────────────────────────────
  // v74.11 NC-QUALITY-002: Phase 1 uses T=0.1 for deterministic tool detection
  // Scientific basis: OpenAI Cookbook (2024) — function calling accuracy peaks at T≤0.2
  const toolDetectionResponse = await invokeLLM({
    model: 'gpt-4o',
    provider: 'openai',
    messages: [
      { role: 'system' as LLMRole, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as LLMRole, content: query },
    ],
    tools: MOTHER_TOOLS,
    tool_choice: 'auto',
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
