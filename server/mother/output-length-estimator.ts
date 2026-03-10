/**
 * Output-Length-Aware Routing (OLAR) — C242
 * Conselho dos 6 — Sessão v100 — 2026-03-10
 *
 * Scientific basis:
 * - arXiv:2602.02823 (R2-Router, Xue et al. 2026): "existing routers implicitly assume
 *   a single fixed quality and cost per LLM for each query, ignoring that the same LLM's
 *   quality varies with its output length"
 * - arXiv:2603.04445 (Dynamic Model Routing Survey, Moslem & Kelleher 2026)
 *
 * Key insight: output_length must be a first-class routing variable.
 * A query for "write a 60-page book" requires a fundamentally different pipeline
 * than "explain quantum entanglement" — even if both score high on complexity.
 */

export type OutputLengthCategory = 'MICRO' | 'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG';

export interface OutputLengthEstimate {
  category: OutputLengthCategory;
  estimatedTokens: number;
  estimatedPages: number;
  confidence: number; // 0.0 - 1.0
  requiresLFSA: boolean; // Long-Form Sequential Architecture
  detectedSignal: string; // Human-readable explanation of what triggered this estimate
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
 */
export function estimateOutputLength(query: string): OutputLengthEstimate {
  const q = query.toLowerCase();

  // ─── Heuristic 1: Explicit page count (highest confidence) ──────────────────
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
      return {
        category: 'VERY_LONG',
        estimatedTokens: 27000, // 60 pages avg
        estimatedPages: 60,
        confidence: 0.70,
        requiresLFSA: true,
        detectedSignal: `VERY_LONG keyword: "${signal}"`,
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
      // Only Gemini 2.5 Pro can generate 60+ pages in a single call
      // But LFSA (Plan→Execute→Assemble) is preferred for quality
      return { primary: 'gemini-2.5-pro', requiresLFSA: true };

    case 'LONG':
      // Gemini 2.5 Pro preferred for long-form (65K output vs 16K for GPT-4o)
      return { primary: 'gemini-2.5-pro', requiresLFSA: false };

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
