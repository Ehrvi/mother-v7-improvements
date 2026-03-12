/**
 * Output-Length-Aware Routing (OLAR) — C242
 * Conselho dos 6 — Sessão v100 — 2026-03-10
 * UPDATED: C321 — Semantic Complexity Detector v2.0 (Conselho dos 6, 2026-03-12)
 *
 * Scientific basis:
 * - arXiv:2602.02823 (R2-Router, Xue et al. 2026): "existing routers implicitly assume
 *   a single fixed quality and cost per LLM for each query, ignoring that the same LLM's
 *   quality varies with its output length"
 * - arXiv:2603.04445 (Dynamic Model Routing Survey, Moslem & Kelleher 2026)
 * - arXiv:2211.09110 (HELM, Liang et al. 2022): complexity = f(sub-tasks, external refs, artifacts)
 * - arXiv:2201.11903 (Wei et al. 2022): CoT prompting +25-40% on complex tasks
 *
 * Key insight: output_length must be a first-class routing variable.
 * A query for "write a 60-page book" requires a fundamentally different pipeline
 * than "explain quantum entanglement" — even if both score high on complexity.
 *
 * C321 UPGRADE: Semantic complexity scoring now runs BEFORE keyword matching.
 * A query like "criar framework de avaliação UI/UX" (350 chars) was classified as
 * MEDIUM/SHORT by the old heuristic, missing LFSA activation. The new detector
 * scores action verbs (1.0), external references (1.5), artifact nouns (1.5),
 * and multi-task patterns (2.0) — threshold CS ≥ 4 activates LFSA.
 */

export type OutputLengthCategory = 'MICRO' | 'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG';

export interface OutputLengthEstimate {
  category: OutputLengthCategory;
  estimatedTokens: number;
  estimatedPages: number;
  confidence: number; // 0.0 - 1.0
  requiresLFSA: boolean; // Long-Form Sequential Architecture
  detectedSignal: string; // Human-readable explanation of what triggered this estimate
  complexitySignals?: SemanticComplexitySignals; // C321: Semantic complexity breakdown
}

// ─── C321: Semantic Complexity Detector v2.0 ─────────────────────────────────
// Scientific basis: HELM (Liang et al., 2022, arXiv:2211.09110)
// Complexity = f(sub-tasks, external references, output artifacts)
// Council consensus: threshold CS ≥ 4 activates LFSA (approved 6/6, 2026-03-12)
export interface SemanticComplexitySignals {
  actionVerbCount: number;      // weight 1.0
  externalRefCount: number;     // weight 1.5
  artifactNounCount: number;    // weight 1.5
  multiTaskPatternCount: number; // weight 2.0
  totalScore: number;
  requiresLFSA: boolean;        // totalScore >= COMPLEXITY_THRESHOLD
}

// Action verbs that signal complex multi-step tasks (PT + EN)
const SEMANTIC_ACTION_VERBS: readonly string[] = [
  // Criação (peso 1.0)
  'criar', 'crie', 'desenvolver', 'desenvolva', 'implementar', 'implemente',
  'gerar', 'gere', 'construir', 'construa', 'elaborar', 'elabore',
  'projetar', 'projete', 'produzir', 'produza', 'montar', 'monte',
  // Análise (peso 1.0)
  'analisar', 'analise', 'comparar', 'compare', 'avaliar', 'avalie',
  'medir', 'meça', 'testar', 'teste', 'validar', 'valide', 'auditar',
  'diagnosticar', 'diagnostique', 'investigar', 'investigue',
  // Pesquisa (peso 1.0)
  'buscar', 'busque', 'pesquisar', 'pesquise', 'coletar', 'colete',
  'extrair', 'extraia', 'identificar', 'identifique', 'mapear', 'mapeie',
  // Síntese (peso 1.0)
  'sintetizar', 'sintetize', 'resumir', 'resuma', 'documentar', 'documente',
  'propor', 'proponha', 'recomendar', 'recomende', 'planejar', 'planeje',
  'otimizar', 'otimize', 'melhorar', 'melhore', 'corrigir', 'corrija',
  // EN equivalents
  'create', 'develop', 'implement', 'generate', 'build', 'design',
  'analyze', 'compare', 'evaluate', 'measure', 'test', 'validate',
  'research', 'collect', 'extract', 'identify', 'synthesize',
  'document', 'propose', 'recommend', 'plan', 'optimize', 'improve',
] as const;

// External reference signals (peso 1.5 — higher weight: implies research pipeline)
const SEMANTIC_EXTERNAL_REFS: readonly string[] = [
  'arxiv', 'sci-hub', 'annas-archive', 'anna\'s archive', 'scholar', 'pubmed',
  'paper', 'papers', 'artigo', 'artigos', 'literatura', 'estudo', 'estudos',
  'estado da arte', 'state of the art', 'sota', 'benchmark', 'benchmarks',
  'api', 'documentação', 'documentacao', 'manual', 'fórum', 'forum', 'github',
  'scraping', 'web search', 'internet', 'pesquisa científica', 'pesquisa cientifica',
  'referências', 'referencias', 'citações', 'citacoes', 'fonte', 'fontes',
  'evidencia', 'evidência', 'dados', 'dataset', 'base de dados',
] as const;

// Artifact nouns that signal multi-dimensional output (peso 1.5)
const SEMANTIC_ARTIFACT_NOUNS: readonly string[] = [
  'framework', 'relatório', 'relatorio', 'análise completa', 'analise completa',
  'estudo comparativo', 'roadmap', 'plano de ação', 'plano de acao',
  'metodologia', 'arquitetura', 'diagrama', 'tabela comparativa',
  'resumo executivo', 'testes', 'benchmark', 'especificação', 'especificacao',
  'avaliação', 'avaliacao', 'proposta', 'documento', 'guia', 'tutorial',
  'dashboard', 'pipeline', 'sistema', 'solução', 'solucao', 'protocolo',
  'checklist', 'matriz', 'mapa', 'modelo', 'template', 'script', 'código',
  // EN equivalents
  'report', 'analysis', 'comparative study', 'action plan', 'methodology',
  'architecture', 'diagram', 'comparative table', 'executive summary',
  'specification', 'evaluation', 'proposal', 'document', 'guide',
  // C329 BUG 7: 'livro' and 'book' were in VERY_LONG_SIGNALS but NOT in ARTIFACT_NOUNS
  // This caused CS=0 for "escreva um livro" (no artifact noun detected) — Conselho V109 diagnosis
  // Fix: add to ARTIFACT_NOUNS so semantic detector scores them correctly (weight 1.5)
  'livro', 'book', 'manual', 'novel', 'romance', 'tese', 'thesis', 'monografia',
  'monograph', 'dissertação', 'dissertacao', 'dissertation',
] as const;

// Multi-task patterns (peso 2.0 — highest: explicit enumeration of parallel tasks)
const SEMANTIC_MULTI_TASK_PATTERNS: readonly RegExp[] = [
  /\d+\.\s*\w+/g,                                    // numbered lists: "1. criar... 2. analisar"
  /primeiro[,:]?\s.*segundo[,:]?\s/gi,               // "primeiro... segundo..."
  /\b(e também|e tambem|além disso|alem disso|adicionalmente)\b/gi,
  /\b(ao mesmo tempo|simultaneamente|em paralelo)\b/gi,
  /\b(comparar|contrastar).*(com|entre|versus|vs\.?)/gi,
  /(criar|desenvolver|gerar).+?(e|,).+?(testar|avaliar|validar)/gi,
  /\b(parte|fase|etapa|passo|step)\s+\d+/gi,         // "fase 1", "step 2"
  /\b(todos|todas|cada|every)\b.*(\b(item|aspecto|dimensão|dimensao)\b)/gi,
] as const;

// Complexity scoring weights (Council consensus, 2026-03-12)
const COMPLEXITY_WEIGHTS = {
  actionVerb: 1.0,
  externalRef: 1.5,
  artifactNoun: 1.5,
  multiTaskPattern: 2.0,
} as const;

// Threshold: CS ≥ 4 activates LFSA (Council consensus 5/6, 2026-03-12)
// Env override: MOTHER_COMPLEXITY_THRESHOLD (for adaptive tuning in C323)
const COMPLEXITY_THRESHOLD = parseInt(process.env.MOTHER_COMPLEXITY_THRESHOLD || '4', 10);

/**
 * C321: Compute semantic complexity score for a query.
 * Returns breakdown of signals and whether LFSA should be activated.
 * Scientific basis: HELM (Liang et al., 2022), R2-Router (Xue et al., 2026)
 */
export function computeSemanticComplexity(query: string): SemanticComplexitySignals {
  const lq = query.toLowerCase();

  // Count action verbs
  const actionVerbCount = SEMANTIC_ACTION_VERBS.filter(v => lq.includes(v)).length;

  // Count external reference signals
  const externalRefCount = SEMANTIC_EXTERNAL_REFS.filter(r => lq.includes(r)).length;

  // Count artifact nouns
  const artifactNounCount = SEMANTIC_ARTIFACT_NOUNS.filter(n => lq.includes(n)).length;

  // Count multi-task patterns
  let multiTaskPatternCount = 0;
  for (const pattern of SEMANTIC_MULTI_TASK_PATTERNS) {
    const matches = query.match(new RegExp(pattern.source, pattern.flags));
    if (matches) multiTaskPatternCount += matches.length;
  }

  const totalScore =
    actionVerbCount * COMPLEXITY_WEIGHTS.actionVerb +
    externalRefCount * COMPLEXITY_WEIGHTS.externalRef +
    artifactNounCount * COMPLEXITY_WEIGHTS.artifactNoun +
    multiTaskPatternCount * COMPLEXITY_WEIGHTS.multiTaskPattern;

  return {
    actionVerbCount,
    externalRefCount,
    artifactNounCount,
    multiTaskPatternCount,
    totalScore,
    requiresLFSA: totalScore >= COMPLEXITY_THRESHOLD,
  };
}

// ─── Token density constants (calibrated for Portuguese text) ──────────────────
// Based on empirical analysis: Portuguese ≈ 2 chars/token (vs English ≈ 4 chars/token)
const TOKENS_PER_PAGE_AVG = 450;   // Standard prose, 400-600 words/page
const TOKENS_PER_WORD_PT = 1.4;    // Portuguese: 1 word ≈ 1.4 tokens
const TOKENS_PER_WORD_EN = 1.3;    // English: 1 word ≈ 1.3 tokens

// ─── Category thresholds ──────────────────────────────────────────────────────
const THRESHOLDS: Record<OutputLengthCategory, { maxTokens: number; maxPages: number }> = {
  MICRO:     { maxTokens: 256,      maxPages: 0.5  },
  SHORT:     { maxTokens: 1024,     maxPages: 2    },
  MEDIUM:    { maxTokens: 4096,     maxPages: 9    },
  LONG:      { maxTokens: 16384,    maxPages: 36   },
  VERY_LONG: { maxTokens: Infinity, maxPages: Infinity },
};

// ─── Explicit quantity patterns ───────────────────────────────────────────────
const PAGE_PATTERN    = /(\d+)\s*p[áa]g(?:inas?)?/gi;
const WORD_PATTERN    = /(\d+)\s*palavras?/gi;
const CHAPTER_PATTERN = /(\d+)\s*cap[íi]tulos?/gi;
const PAGE_PATTERN_EN = /(\d+)\s*pages?/gi;
const WORD_PATTERN_EN = /(\d+)\s*words?/gi;

// ─── Keyword signals ──────────────────────────────────────────────────────────
const VERY_LONG_SIGNALS = [
  // PT
  'livro', 'romance', 'novela', 'tese', 'dissertação', 'dissertacao',
  'manual completo', 'guia completo', 'documentação completa', 'documentacao completa',
  'relatório completo', 'relatorio completo', 'história completa', 'historia completa',
  'saga', 'trilogia', 'epopeia', 'monografia',
  // EN
  'book', 'novel', 'thesis', 'dissertation', 'complete guide', 'full manual',
  'complete documentation', 'complete report', 'full story',
];

const LONG_SIGNALS = [
  // PT
  'artigo completo', 'ensaio completo', 'análise completa', 'analise completa',
  'tutorial completo', 'capítulo', 'capitulo', 'seção detalhada', 'secao detalhada',
  'explicação detalhada', 'explicacao detalhada', 'estudo de caso completo',
  // EN
  'complete article', 'full essay', 'complete analysis', 'detailed tutorial',
  'chapter', 'detailed explanation', 'full case study',
];

const SHORT_SIGNALS = [
  // PT
  'resumo', 'sumário', 'sumario', 'resposta curta', 'em poucas palavras',
  'brevemente', 'sintetize', 'email', 'mensagem curta', 'nota', 'tweet',
  // EN
  'summary', 'briefly', 'short answer', 'in a few words', 'tldr', 'email',
];

const MICRO_SIGNALS = [
  // PT
  'sim ou não', 'sim ou nao', 'verdadeiro ou falso', 'defina em uma frase',
  'qual é', 'qual e', 'quando', 'onde', 'quem é', 'quem e',
  // EN
  'yes or no', 'true or false', 'define in one sentence', 'what is', 'when', 'where',
];

/**
 * Main estimation function.
 * Uses a cascade of heuristics with confidence weighting.
 * Inspired by R2-Router (arXiv:2602.02823) output budget estimation.
 *
 * C321 UPGRADE: Semantic Complexity Detector v2.0 runs FIRST (before keyword matching).
 * If CS >= COMPLEXITY_THRESHOLD (default: 4), LFSA is activated regardless of query length.
 * This fixes CR1: queries like "criar framework de avaliação UI/UX" (350 chars, score ~8)
 * were classified as MEDIUM/SHORT, missing LFSA activation entirely.
 */
// C325: Adaptive threshold telemetry — log all scores for production calibration
// Scientific basis: Moslem & Kelleher (2026, arXiv:2603.04445) — dynamic model routing
// requires empirical distribution data to set optimal thresholds.
// After 7 days of production data, analyze [C325-TELEMETRY] logs to calibrate
// MOTHER_COMPLEXITY_THRESHOLD via env var (default: 4).
// Target: false-positive rate < 5% (simple queries NOT promoted to LFSA)
const _C325_TELEMETRY_ENABLED = process.env.MOTHER_COMPLEXITY_TELEMETRY !== 'false';

export function estimateOutputLength(query: string): OutputLengthEstimate {
  const q = query.toLowerCase();

  // ─── C321 Heuristic 0: Semantic Complexity Detector v2.0 (RUNS FIRST) ────────────
  // Scientific basis: HELM (Liang et al., 2022, arXiv:2211.09110)
  // Fixes CR1: short queries with high semantic complexity were missing LFSA activation
  const complexitySignals = computeSemanticComplexity(query);

  // C325: Emit telemetry for every query — enables adaptive threshold calibration
  // Disable with MOTHER_COMPLEXITY_TELEMETRY=false in production if log volume is too high
  if (_C325_TELEMETRY_ENABLED) {
    console.log(`[C325-TELEMETRY] score=${complexitySignals.totalScore.toFixed(2)} threshold=${COMPLEXITY_THRESHOLD} lfsa=${complexitySignals.requiresLFSA} verbs=${complexitySignals.actionVerbCount} refs=${complexitySignals.externalRefCount} artifacts=${complexitySignals.artifactNounCount} patterns=${complexitySignals.multiTaskPatternCount} qlen=${query.length}`);
  }

  if (complexitySignals.requiresLFSA) {
    // Determine category based on score magnitude
    const cs = complexitySignals.totalScore;
    const category: OutputLengthCategory = cs >= 12 ? 'VERY_LONG' : cs >= 8 ? 'LONG' : 'MEDIUM';
    const estimatedTokens = cs >= 12 ? 20000 : cs >= 8 ? 8000 : 4000;
    const estimatedPages = Math.ceil(estimatedTokens / TOKENS_PER_PAGE_AVG);
    return {
      category,
      estimatedTokens,
      estimatedPages,
      confidence: 0.78,
      requiresLFSA: true,
      detectedSignal: `[C321] Semantic complexity CS=${cs.toFixed(1)} ≥ ${COMPLEXITY_THRESHOLD} (verbs=${complexitySignals.actionVerbCount}, refs=${complexitySignals.externalRefCount}, artifacts=${complexitySignals.artifactNounCount}, patterns=${complexitySignals.multiTaskPatternCount}) → LFSA activated`,
      complexitySignals,
    };
  }

  // ─── Heuristic 1: Explicit page count (highest confidence) ──────────────
  const pageMatches = [...query.matchAll(PAGE_PATTERN), ...query.matchAll(PAGE_PATTERN_EN)];
  if (pageMatches.length > 0) {
    const pageCount = Math.max(...pageMatches.map(m => parseInt(m[1])));
    const estimatedTokens = pageCount * TOKENS_PER_PAGE_AVG;
    const category = tokensToCategory(estimatedTokens);
    return {
      category,
      estimatedTokens,
      estimatedPages: pageCount,
      confidence: 0.92,
      requiresLFSA: category === 'VERY_LONG',
      detectedSignal: `Explicit page count: ${pageCount} pages → ${estimatedTokens} tokens`,
    };
  }

  // ─── Heuristic 2: Explicit word count ────────────────────────────────────────
  const wordMatches = [...query.matchAll(WORD_PATTERN), ...query.matchAll(WORD_PATTERN_EN)];
  if (wordMatches.length > 0) {
    const wordCount = Math.max(...wordMatches.map(m => parseInt(m[1])));
    const estimatedTokens = Math.ceil(wordCount * TOKENS_PER_WORD_PT);
    const category = tokensToCategory(estimatedTokens);
    return {
      category,
      estimatedTokens,
      estimatedPages: Math.ceil(estimatedTokens / TOKENS_PER_PAGE_AVG),
      confidence: 0.88,
      requiresLFSA: category === 'VERY_LONG',
      detectedSignal: `Explicit word count: ${wordCount} words → ${estimatedTokens} tokens`,
    };
  }

  // ─── Heuristic 3: Explicit chapter count ─────────────────────────────────────
  const chapterMatches = [...query.matchAll(CHAPTER_PATTERN)];
  if (chapterMatches.length > 0) {
    const chapterCount = Math.max(...chapterMatches.map(m => parseInt(m[1])));
    const estimatedPages = chapterCount * 10; // avg 10 pages/chapter
    const estimatedTokens = estimatedPages * TOKENS_PER_PAGE_AVG;
    const category = tokensToCategory(estimatedTokens);
    return {
      category,
      estimatedTokens,
      estimatedPages,
      confidence: 0.75,
      requiresLFSA: category === 'VERY_LONG',
      detectedSignal: `Explicit chapter count: ${chapterCount} chapters → ~${estimatedPages} pages`,
    };
  }

  // ─── Heuristic 4: Keyword signals ────────────────────────────────────────────
  for (const signal of VERY_LONG_SIGNALS) {
    if (q.includes(signal)) {
      // C329 BUG 9: H4 path was returning without complexitySignals
      // Fix: compute and include complexitySignals so core.ts can log them
      // Scientific basis: C325 telemetry requires complexitySignals on ALL LFSA paths
      const h4Signals = computeSemanticComplexity(query);
      return {
        category: 'VERY_LONG',
        estimatedTokens: 27000, // 60 pages avg
        estimatedPages: 60,
        confidence: 0.70,
        requiresLFSA: true,
        detectedSignal: `VERY_LONG keyword: "${signal}" (CS=${h4Signals.totalScore.toFixed(1)})`,
        complexitySignals: h4Signals, // C329 BUG 9: include for C325 telemetry
      };
    }
  }

  for (const signal of LONG_SIGNALS) {
    if (q.includes(signal)) {
      return {
        category: 'LONG',
        estimatedTokens: 6000, // ~13 pages
        estimatedPages: 13,
        confidence: 0.65,
        requiresLFSA: false,
        detectedSignal: `LONG keyword: "${signal}"`,
      };
    }
  }

  for (const signal of MICRO_SIGNALS) {
    if (q.includes(signal)) {
      return {
        category: 'MICRO',
        estimatedTokens: 128,
        estimatedPages: 0.3,
        confidence: 0.72,
        requiresLFSA: false,
        detectedSignal: `MICRO keyword: "${signal}"`,
      };
    }
  }

  for (const signal of SHORT_SIGNALS) {
    if (q.includes(signal)) {
      return {
        category: 'SHORT',
        estimatedTokens: 512,
        estimatedPages: 1,
        confidence: 0.68,
        requiresLFSA: false,
        detectedSignal: `SHORT keyword: "${signal}"`,
      };
    }
  }

  // ─── Heuristic 5: Query length as proxy ──────────────────────────────────────
  // Longer queries tend to require longer responses (R2-Router finding)
  const queryTokens = Math.ceil(query.length / 2); // PT: ~2 chars/token
  if (queryTokens > 500) {
    return {
      category: 'LONG',
      estimatedTokens: 4000,
      estimatedPages: 9,
      confidence: 0.45,
      requiresLFSA: false,
      detectedSignal: `Long query (${queryTokens} tokens) → LONG response expected`,
    };
  }

  // ─── Default: MEDIUM ─────────────────────────────────────────────────────────
  return {
    category: 'MEDIUM',
    estimatedTokens: 2000,
    estimatedPages: 4,
    confidence: 0.40,
    requiresLFSA: false,
    detectedSignal: 'Default: no explicit signals detected',
  };
}

/**
 * Map token count to category
 */
function tokensToCategory(tokens: number): OutputLengthCategory {
  if (tokens <= THRESHOLDS.MICRO.maxTokens)  return 'MICRO';
  if (tokens <= THRESHOLDS.SHORT.maxTokens)  return 'SHORT';
  if (tokens <= THRESHOLDS.MEDIUM.maxTokens) return 'MEDIUM';
  if (tokens <= THRESHOLDS.LONG.maxTokens)   return 'LONG';
  return 'VERY_LONG';
}

/**
 * Get recommended max_tokens for a given category and model
 * Ensures we never request more than the model can produce
 */
export function getMaxTokensForCategory(
  category: OutputLengthCategory,
  model: string
): number {
  // Model output limits (empirically verified, March 2026)
  const MODEL_LIMITS: Record<string, number> = {
    'gpt-4o-mini':          16384,
    'gpt-4o':               16384,
    'claude-sonnet-4-6':    8192,
    'claude-opus-4-6':      8192,
    'gemini-2.5-pro':       65536,
    'gemini-2.5-flash':     65536,
    'deepseek-reasoner':    8192,
    'mistral-large-latest': 8192,
  };

  const modelLimit = MODEL_LIMITS[model] ?? 8192;

  const CATEGORY_TARGETS: Record<OutputLengthCategory, number> = {
    MICRO:     256,
    SHORT:     1024,
    MEDIUM:    4096,
    LONG:      16384,
    VERY_LONG: 65536, // Only Gemini 2.5 Pro can handle this
  };

  return Math.min(CATEGORY_TARGETS[category], modelLimit);
}

/**
 * Select the best primary model for a given output length category
 * Implements the OLAR routing matrix (Conselho v100 consensus)
 */
export function selectModelForOutputLength(
  category: OutputLengthCategory,
  domainMinTier?: string
): { primary: string; requiresLFSA: boolean } {
  switch (category) {
    case 'VERY_LONG':
      // C346 (2026-03-12): gpt-4o for VERY_LONG — LFSA handles 60+ pages via Plan→Execute→Assemble
      // gemini-2.5-pro was timing out at 90s (Cloud Run AbortSignal) causing 'sistema sobrecarregado'
      // Root cause: ORCHESTRATOR_CIRCUIT_CONFIG.timeoutMs=90s consumed all budget, leaving 0ms for fallback
      // Scientific basis: LFSA pipeline is model-agnostic; gpt-4o 128K context is sufficient per section
      return { primary: 'gpt-4o', requiresLFSA: true };

    case 'LONG':
      // C346 (2026-03-12): gpt-4o for LONG — gemini-2.5-pro timeout fix
      // gpt-4o 128K context handles LONG outputs (≤36 pages = ~16K tokens) reliably
      return { primary: 'gpt-4o', requiresLFSA: false };

    case 'MEDIUM':
      // gpt-4o for medium complexity (quality > cost per Conselho directive)
      return { primary: 'gpt-4o', requiresLFSA: false };

    case 'SHORT':
      return { primary: 'gpt-4o-mini', requiresLFSA: false };

    case 'MICRO':
      return { primary: 'gpt-4o-mini', requiresLFSA: false };

    default:
      return { primary: 'gpt-4o', requiresLFSA: false };
  }
}
