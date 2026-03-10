/**
 * MOTHER v120.0 — Adaptive 4-Tier Complexity Router + Domain-Aware Semantic Router v3
 * Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66
 * C232 (2026-03-10): Roteador Semântico v3 — Domain-aware routing (quality > cost)
 *
 * Scientific basis:
 * - ACAR (arXiv:2602.21231, Feb 2026) — Adaptive Complexity & Attribution Routing
 *   σ-variance from N=3 probes routes tasks across 1/2/3-model execution modes
 * - RouteLLM (Ong et al., 2024) — binary classifier for dynamic routing
 * - EvoRoute (arXiv:2601.02695, 2026) — experience-driven self-routing
 * - EAGLE-2 (Li et al., arXiv:2406.16858, EMNLP 2024) — speculative decoding -40% latency
 * - FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cost-optimal LLM cascade
 *
 * C232 Quality-First Policy (user directive 2026-03-10: "priority quality answer over price"):
 * - Domain detection runs BEFORE complexity scoring
 * - Critical domains (Logic, Math, Science, Humanities, Economics, etc.) → TIER_3 minimum
 * - Expert-level queries in any domain → TIER_4
 * - Complexity score is used as a FLOOR, not a ceiling
 * - Chain 2 Mínima data: 0% PASS for gpt-4o-mini in 7/12 domains
 *
 * 4 Tiers:
 * - TIER_1 (Simple): gpt-4o-mini, 1 model, P50 latency ~0.8s, cost ~$0.0001
 * - TIER_2 (Standard): gpt-4o, 1 model, P50 latency ~1.5s, cost ~$0.001
 * - TIER_3 (Complex): gpt-4o + claude-sonnet, 2 models, P50 latency ~3s, cost ~$0.005
 * - TIER_4 (Expert): gpt-4o + claude-sonnet + gemini-2.5-pro, 3 models, P50 latency ~8s, cost ~$0.02
 */

import { detectDomain, getDomainMinimumTier } from './domain-rules';
import { getOptimalModelForDomain } from './domain-model-matrix';

export type RoutingTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';

export interface ComplexitySignals {
  queryLength: number;           // chars
  hasCodeRequest: boolean;       // contains code/implement/build
  hasMathRequest: boolean;       // contains equation/calculate/prove
  hasResearchRequest: boolean;   // contains research/arxiv/paper/study
  hasMultiStep: boolean;         // contains step-by-step/plan/roadmap
  hasCreativeRequest: boolean;   // contains write/create/generate
  hasSystemDesign: boolean;      // contains architecture/design/system
  hasIntelltechContext: boolean; // contains SHMS/geotechnical/mining/sensor
  hasMOTHERContext: boolean;     // contains MOTHER/core.ts/module/deploy
  estimatedTokens: number;       // rough token estimate
  // NC-ROUTER-003 FIX (C209): Long-form creative writing detection
  // Scientific basis: Anthropic (2024) Claude long-context guide — tasks requesting
  // >5,000 words require max_tokens ≥ 16384 and TIER_4 routing to avoid truncation.
  // FrugalGPT (Chen et al., 2023): output length is a primary routing signal.
  isLongFormCreative: boolean;   // requests ≥10 pages / ≥5000 words / ≥60 páginas
}

export interface RoutingDecision {
  tier: RoutingTier;
  primaryModel: string;
  primaryProvider: string;
  secondaryModel?: string;
  secondaryProvider?: string;
  tertiaryModel?: string;
  tertiaryProvider?: string;
  temperature: number;
  maxTokens: number;
  rationale: string;
  complexityScore: number;  // 0-100
  estimatedLatencyMs: number;
  estimatedCostUSD: number;
  useCache: boolean;
  useSpeculativeDecoding: boolean;
}

/**
 * Compute complexity signals from query string.
 * Scientific basis: Feature engineering for LLM routing (RouteLLM, 2024)
 */
export function computeComplexitySignals(query: string): ComplexitySignals {
  // Sprint 3 (C181): Normalize Unicode (NFKD) to handle accented Portuguese characters
  // Scientific basis: Unicode normalization (Unicode Standard 15.0, 2022)
  const q = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = q.split(/\s+/).length;

  return {
    queryLength: query.length,
    // EN + PT-BR keywords — Sprint 3 (C181): added Portuguese for correct tier routing
    hasCodeRequest: /\b(code|implement|build|function|class|typescript|python|javascript|sql|api|endpoint|implementar|construir|funcao|classe|desenvolver|programar|criar|codificar|rotina|script)\b/.test(q),
    hasMathRequest: /\b(equation|calculate|prove|integral|derivative|matrix|statistics|probability|formula|equacao|calcular|provar|derivada|matriz|estatistica|probabilidade|calculo)\b/.test(q),
    hasResearchRequest: /\b(research|arxiv|paper|study|literature|survey|sota|scientific|pesquisa|artigo|estudo|literatura|revisao|cientifico|embasamento|referencia|fonte)\b/.test(q),
    hasMultiStep: /\b(step-by-step|plan|roadmap|phases|stages|workflow|pipeline|architecture|design|passo-a-passo|plano|fases|etapas|fluxo|planejamento|cronograma|sprint)\b/.test(q),
    hasCreativeRequest: /\b(write|create|generate|compose|draft|story|essay|blog|report|escrever|gerar|redigir|rascunho|historia|ensaio|relatorio|documento)\b/.test(q),
    // NC-ROUTER-003 FIX v2 (C209): Detect long-form creative writing tasks.
    // Bug fix: Portuguese number formatting — "27.000" and "8.000" use dot as thousands
    // separator. Must normalize before parseInt: "27.000" → "27000", "8.000" → "8000".
    // Scientific basis: FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — output length
    //   is the strongest predictor of required model capability and max_tokens.
    // Anthropic (2024) long-context guide: tasks >5k words need max_tokens ≥ 16384.
    isLongFormCreative: (() => {
      // Normalize PT-BR thousands separator: "27.000" → "27000", "8.000" → "8000"
      const qNorm = q.replace(/(\d)\.(\d{3})(?=\D|$)/g, '$1$2');
      // Check explicit page count >= 10
      const pageMatch = qNorm.match(/(\d+)\s*(paginas?|pages?)/);
      if (pageMatch && parseInt(pageMatch[1]) >= 10) return true;
      // Check explicit word count >= 3000 (covers "8.000 palavras", "27.000 palavras")
      const wordMatch = qNorm.match(/(\d+)\s*(palavras?|words?|caracteres?|characters?)/);
      if (wordMatch && parseInt(wordMatch[1]) >= 3000) return true;
      // Check creative domain + expansion/detail keywords
      const isCreativeDomain = /\b(capitulo|chapter|cena|scene|livro|book|romance|novel|novela|historia|story|narrativa|narrative|texto|redacao|ensaio|essay)\b/.test(qNorm);
      const isLongTask = /\b(expanda|expand|detalhe|detail|aprofunde|deepen|completo|complete|inteiro|entire|full|longo|long|extenso|extensive|detalhado|detailed|pelo menos|at least|minimo|minimum)\b/.test(qNorm);
      if (isCreativeDomain && isLongTask) return true;
      return false;
    })(),
    hasSystemDesign: /\b(architecture|system|infrastructure|database|schema|microservice|distributed|scalable|arquitetura|sistema|infraestrutura|esquema|microsservico|distribuido|escalavel|modulo)\b/.test(q),
    hasIntelltechContext: /\b(intelltech|shms|geotechnical|mining|sensor|instrumentation|slope|dam|embankment|piezometer|inclinometer|geotecnico|mineracao|instrumentacao|talude|barragem|piezometro|inclinometro|monitoramento)\b/.test(q),
    hasMOTHERContext: /\b(mother|core|module|deploy|gcloud|ciclo|awake|bd_central|darwin|dgm|modulo|implantar|despertar|auto-modificacao|producao)\b/.test(q),
    estimatedTokens: Math.ceil(words * 1.3),
  };
}

/**
 * Compute complexity score (0-100) from signals.
 * Higher score → more complex → higher tier.
 */
export function computeComplexityScore(signals: ComplexitySignals): number {
  let score = 0;

  // Base score from query length
  if (signals.queryLength > 500) score += 20;
  else if (signals.queryLength > 200) score += 10;
  else if (signals.queryLength > 100) score += 5;

  // Feature bonuses
  if (signals.hasCodeRequest) score += 20;
  if (signals.hasMathRequest) score += 20;
  if (signals.hasResearchRequest) score += 15;
  if (signals.hasMultiStep) score += 15;
  if (signals.hasSystemDesign) score += 20;
  if (signals.hasIntelltechContext) score += 10;
  if (signals.hasMOTHERContext) score += 15;
  if (signals.hasCreativeRequest) score += 5;
  // NC-ROUTER-003 FIX (C209): Long-form creative writing → force TIER_4 score
  // Scientific basis: FrugalGPT (Chen et al., 2023) — output length is the primary
  //   routing signal. Requests for ≥10 pages / ≥5000 words need TIER_4 (score ≥76).
  if (signals.isLongFormCreative) score = Math.max(score, 80); // Force TIER_4

  // Token estimate bonus
  if (signals.estimatedTokens > 500) score += 10;
  else if (signals.estimatedTokens > 200) score += 5;

  return Math.min(100, score);
}

/**
 * Map complexity score to routing tier.
 * Scientific basis: FrugalGPT cascade thresholds (Chen et al., 2023)
 * C225: Adjusted thresholds to route more queries to TIER_3 (gpt-4o)
 * Diagnóstico Chain 2: qualidade 82% vs target 95% — gpt-4o-mini insuficiente para queries moderadas
 * - 0-25: TIER_1 (simple factual, short responses) — gpt-4o-mini
 * - 26-40: TIER_2 (standard reasoning) — gpt-4o-mini (C225: 26-50 → 26-40)
 * - 41-75: TIER_3 (moderate to complex multi-step, code, research) — gpt-4o (C225: 51-75 → 41-75)
 * - 76-100: TIER_4 (expert system design, MOTHER/Intelltech) — gpt-4o
 */
export function scoreTier(score: number): RoutingTier {
  if (score <= 25) return 'TIER_1';
  if (score <= 40) return 'TIER_2';  // C225: 50 → 40 (Conselho v98, 2026-03-10)
  if (score <= 75) return 'TIER_3';  // C225: now captures 41-75 (was 51-75)
  return 'TIER_4';
}

/**
 * Build full routing decision from query.
 * C232: Now integrates domain-aware routing (quality > cost policy).
 * Main entry point for the adaptive router.
 *
 * Routing algorithm (C232 Tiered-Adaptive):
 * 1. Detect domain (domain-rules.ts)
 * 2. Compute complexity score (complexity signals)
 * 3. Final tier = max(domain_minimum_tier, complexity_tier)
 * 4. Domain minimum acts as a FLOOR, never a ceiling
 *
 * Scientific basis:
 * - RouteLLM (Ong et al., 2024): domain-aware routing improves quality
 * - ACAR (arXiv:2602.21231, 2026): adaptive routing with domain signals
 * - Chain 2 Mínima (2026-03-10): 0% PASS in 7/12 domains with gpt-4o-mini
 */
export function buildRoutingDecision(query: string, availableProviders?: Set<string>): RoutingDecision {
  const signals = computeComplexitySignals(query);
  const complexityScore = computeComplexityScore(signals);
  const complexityTier = scoreTier(complexityScore);

  // C232: Domain detection — runs BEFORE complexity scoring
  // Quality-first policy: domain minimum tier acts as a floor
  const domainResult = detectDomain(query);
  const domainMinTier = getDomainMinimumTier(domainResult);

  // C232: Final tier = max(domain_minimum_tier, complexity_tier)
  // Tier ordering: TIER_1 < TIER_2 < TIER_3 < TIER_4
  const TIER_ORDER: Record<RoutingTier, number> = { TIER_1: 1, TIER_2: 2, TIER_3: 3, TIER_4: 4 };
  const tier: RoutingTier = TIER_ORDER[domainMinTier] > TIER_ORDER[complexityTier]
    ? domainMinTier
    : complexityTier;

  if (domainMinTier !== 'TIER_1' && TIER_ORDER[domainMinTier] > TIER_ORDER[complexityTier]) {
    console.log(`[Router] C232 Domain override: ${complexityTier} → ${tier} (domain=${domainResult.domain}, confidence=${domainResult.confidence.toFixed(2)})`);
  }

  // Default available providers (all)
  const available = availableProviders ?? new Set(['openai', 'anthropic', 'google', 'mistral', 'deepseek']);

  const tierConfigs: Record<RoutingTier, Omit<RoutingDecision, 'rationale' | 'complexityScore'>> = {
    TIER_1: {
      tier: 'TIER_1',
      primaryModel: 'gpt-4o-mini',
      primaryProvider: 'openai',
      temperature: 0.3,
      maxTokens: 1024,
      estimatedLatencyMs: 800,
      estimatedCostUSD: 0.0001,
      useCache: true,
      useSpeculativeDecoding: false,
    },
    TIER_2: {
      tier: 'TIER_2',
      primaryModel: 'gpt-4o',
      primaryProvider: 'openai',
      temperature: 0.5,
      maxTokens: 2048,
      estimatedLatencyMs: 1500,
      estimatedCostUSD: 0.001,
      useCache: true,
      useSpeculativeDecoding: false,
    },
    TIER_3: {
      tier: 'TIER_3',
      primaryModel: 'gpt-4o',
      primaryProvider: 'openai',
      secondaryModel: available.has('anthropic') ? 'claude-sonnet-4-6' : undefined,
      secondaryProvider: available.has('anthropic') ? 'anthropic' : undefined,
      temperature: 0.6,
      maxTokens: 4096,
      estimatedLatencyMs: 3000,
      estimatedCostUSD: 0.005,
      useCache: false,
      useSpeculativeDecoding: false,
    },
    TIER_4: {
      tier: 'TIER_4',
      primaryModel: 'gpt-4o',
      primaryProvider: 'openai',
      secondaryModel: available.has('anthropic') ? 'claude-sonnet-4-6' : undefined,
      secondaryProvider: available.has('anthropic') ? 'anthropic' : undefined,
      tertiaryModel: available.has('google') ? 'gemini-2.5-pro' : undefined,
      tertiaryProvider: available.has('google') ? 'google' : undefined,
      temperature: 0.7,
      maxTokens: 8192,
      estimatedLatencyMs: 8000,
      estimatedCostUSD: 0.02,
      useCache: false,
      useSpeculativeDecoding: false,
    },
  };

  const config = tierConfigs[tier];

  // NC-ROUTER-003 FIX (C209): Override TIER_4 max_tokens for long-form creative writing.
  // Standard TIER_4 uses 8192 tokens (~6000 words). Long-form tasks (60 páginas =
  // ~27000 words = ~36000 tokens) require 16384 tokens per API call.
  // Scientific basis: OpenAI (2024) gpt-4o max_tokens=16384; FrugalGPT (Chen et al., 2023)
  //   — output length is the primary routing signal for model and budget selection.
  // Anthropic (2024) long-context guide: tasks >5k words need max_tokens ≥ 16384.
  if (tier === 'TIER_4' && signals.isLongFormCreative) {
    (config as RoutingDecision).maxTokens = 16384;
    (config as RoutingDecision).estimatedLatencyMs = 45000;
    (config as RoutingDecision).estimatedCostUSD = 0.08;
  }

  // ── C246: Domain-Model Matrix Override (DMM v1.0) ──────────────────────────────
  // Replaces C240 (C244 empirical, 12 prompts) with C246 (meta-analysis, 9 benchmarks).
  //
  // Scientific basis:
  //   - Multi-benchmark meta-analysis: MMLU-Pro (Wang et al., 2024, arXiv:2406.01574),
  //     GPQA Diamond (Rein et al., 2023, arXiv:2311.12022), HumanEval (Chen et al., 2021,
  //     arXiv:2107.03374), SWE-Bench (Jimenez et al., 2023, arXiv:2310.06770), MATH+AIME
  //     (Hendrycks et al., 2021, arXiv:2103.03874), MT-Bench (Zheng et al., 2023,
  //     arXiv:2306.05685), LegalBench (Guha et al., 2023, arXiv:2308.11462), MedQA (Jin
  //     et al., 2021, arXiv:2009.13081), FinanceBench (Islam et al., 2023, arXiv:2311.11944)
  //   - UNESCO FOS taxonomy (OECD Frascati Manual 2015): 12 major domains, 73 subdomains
  //   - Quality-first policy (user directive 2026-03-10): domain expertise > DPO identity
  //   - Override threshold: confidence ≥ 0.55 (statistically significant)
  //   - DPO gate in core-orchestrator.ts skips DPO when primaryProvider !== 'openai'
  //
  // Key findings (C246, 11/03/2026):
  //   gemini-2.5-pro: FORMAL_SCIENCES (AIME 86.7%), NATURAL_SCIENCES (GPQA 84.0%),
  //     ENGINEERING_TECHNOLOGY (SWE-Bench 63.2%), INFORMATION_SCIENCE, INTERDISCIPLINARY
  //   claude-opus-4-6: HUMANITIES (Philosophy 88.3%), LAW (LegalBench 78.9%),
  //     MEDICAL_HEALTH (MedQA 93.7%), CREATIVE_ARTS (MT-Bench Writing 9.6/10),
  //     BUSINESS_MANAGEMENT (FinanceBench 86.3%), SOCIAL_SCIENCES (Psychology 86.4%)
  let domainPreferredOverride = '';
  const dmmAssignment = getOptimalModelForDomain(domainResult.domain, 0.55);
  if (dmmAssignment && available.has(dmmAssignment.provider)) {
    (config as RoutingDecision).primaryModel = dmmAssignment.model;
    (config as RoutingDecision).primaryProvider = dmmAssignment.provider;
    domainPreferredOverride = ` [C246 DMM: ${dmmAssignment.model} score=${dmmAssignment.score.toFixed(1)} conf=${dmmAssignment.confidence.toFixed(2)}]`;
    console.log(`[Router] C246 DMM override: ${dmmAssignment.model} (domain=${domainResult.domain}, score=${dmmAssignment.score.toFixed(1)}, confidence=${dmmAssignment.confidence.toFixed(2)})`);
  } else if (domainResult.preferredModel && domainResult.confidence > 0.6) {
    // Fallback to C240 legacy preferredModel if DMM has no entry for this domain
    const preferredModel = domainResult.preferredModel;
    const preferredProvider = preferredModel.startsWith('claude') ? 'anthropic'
      : preferredModel.startsWith('gemini') ? 'google'
      : 'openai';
    if (available.has(preferredProvider)) {
      (config as RoutingDecision).primaryModel = preferredModel;
      (config as RoutingDecision).primaryProvider = preferredProvider;
      domainPreferredOverride = ` [C240 legacy: ${preferredModel}]`;
    }
  }

  // Build rationale (C232: include domain detection info)
  const activeSignals = Object.entries(signals)
    .filter(([k, v]) => typeof v === 'boolean' && v)
    .map(([k]) => k.replace('has', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase());

  const domainOverride = TIER_ORDER[domainMinTier] > TIER_ORDER[complexityTier]
    ? ` [C232 domain override: ${complexityTier}→${tier}, domain=${domainResult.domain}]`
    : '';

  const rationale = `Complexity score ${complexityScore}/100 → ${tier}${domainOverride}${domainPreferredOverride}. ` +
    `Domain: ${domainResult.domain} (confidence=${domainResult.confidence.toFixed(2)}). ` +
    `Active signals: [${activeSignals.join(', ') || 'none'}]. ` +
    `Model: ${config.primaryModel}${config.secondaryModel ? ` + ${config.secondaryModel}` : ''}${config.tertiaryModel ? ` + ${config.tertiaryModel}` : ''}. ` +
    `Est. latency: ${config.estimatedLatencyMs}ms, cost: $${config.estimatedCostUSD.toFixed(4)}.`;

  return {
    ...config,
    rationale,
    complexityScore,
  };
}

/**
 * Get routing statistics for observability.
 */
export interface RouterStats {
  totalRequests: number;
  tierDistribution: Record<RoutingTier, number>;
  avgComplexityScore: number;
  avgLatencyMs: number;
}

// In-memory stats (reset on restart)
const routerStats = {
  totalRequests: 0,
  tierCounts: { TIER_1: 0, TIER_2: 0, TIER_3: 0, TIER_4: 0 } as Record<RoutingTier, number>,
  totalComplexityScore: 0,
  totalLatencyMs: 0,
};

export function recordRoutingDecision(decision: RoutingDecision, actualLatencyMs?: number): void {
  routerStats.totalRequests++;
  routerStats.tierCounts[decision.tier]++;
  routerStats.totalComplexityScore += decision.complexityScore;
  routerStats.totalLatencyMs += actualLatencyMs ?? decision.estimatedLatencyMs;
}

export function getRouterStats(): RouterStats {
  const total = routerStats.totalRequests || 1;
  return {
    totalRequests: routerStats.totalRequests,
    tierDistribution: { ...routerStats.tierCounts },
    avgComplexityScore: routerStats.totalComplexityScore / total,
    avgLatencyMs: routerStats.totalLatencyMs / total,
  };
}
