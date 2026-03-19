/**
 * Scientific Evaluation Script — MOTHER Answer Quality Benchmark
 *
 * Methodology based on:
 * - G-Eval (Liu et al., arXiv:2303.16634, 2023): Multi-dimensional LLM evaluation
 * - MT-Bench (Zheng et al., NeurIPS 2023): Multi-turn LLM assessment
 * - HELM (Liang et al., arXiv:2211.09110, 2022): Holistic structured evaluation
 * - RAGAS (Es et al., EACL 2024, arXiv:2309.15217): RAG evaluation metrics
 * - AlpacaEval (Li et al., arXiv:2404.04475, 2024): Length-controlled evaluation
 *
 * Protocol:
 * 1. Send N queries from benchmark-suite.ts to MOTHER's live API
 * 2. Collect response text, quality scores, latency
 * 3. Run multi-dimensional analysis on each response
 * 4. Output JSON with full results + statistical summary
 */

const API_URL = 'http://localhost:3000/api/mother/stream';

// 10 representative queries spanning all categories and difficulties
const TEST_QUERIES = [
  // STEM
  { id: 1, cat: 'STEM', diff: 'easy', lang: 'pt-BR',
    q: 'O que é machine learning e como ele difere de programação tradicional?',
    keywords: ['dados','modelo','treinamento','algoritmo','padrões'], minQ: 75 },
  { id: 3, cat: 'STEM', diff: 'hard', lang: 'en',
    q: 'What is the computational complexity of the attention mechanism in transformers and how does Flash Attention optimize it?',
    keywords: ['O(n²)','memory','attention','Flash','quadratic'], minQ: 70 },

  // Business
  { id: 11, cat: 'Business', diff: 'easy', lang: 'pt-BR',
    q: 'O que é uma proposta de valor e como ela diferencia uma empresa no mercado?',
    keywords: ['valor','cliente','diferenciação','mercado','benefício'], minQ: 75 },

  // AI/ML
  { id: 21, cat: 'AI/ML', diff: 'easy', lang: 'pt-BR',
    q: 'O que é RAG (Retrieval-Augmented Generation) e por que é importante?',
    keywords: ['recuperação','geração','contexto','conhecimento','LLM'], minQ: 80 },
  { id: 26, cat: 'AI/ML', diff: 'hard', lang: 'en',
    q: 'What are the key metrics for evaluating LLM quality: BLEU, ROUGE, BERTScore, and G-Eval?',
    keywords: ['BLEU','ROUGE','BERTScore','G-Eval','evaluation'], minQ: 70 },

  // Architecture
  { id: 33, cat: 'Architecture', diff: 'hard', lang: 'en',
    q: 'What are the tradeoffs between tRPC, REST, and GraphQL for a TypeScript full-stack application?',
    keywords: ['tRPC','REST','GraphQL','type-safety','performance'], minQ: 70 },

  // PT-BR
  { id: 41, cat: 'PT-BR', diff: 'easy', lang: 'pt-BR',
    q: 'Qual é a capital do Brasil e por que ela foi construída no cerrado?',
    keywords: ['Brasília','capital','Kubitschek','cerrado','planejamento'], minQ: 80 },
  { id: 45, cat: 'PT-BR', diff: 'hard', lang: 'pt-BR',
    q: 'Quais são os desafios éticos do uso de IA em processos de recrutamento?',
    keywords: ['viés','discriminação','transparência','ética','fairness'], minQ: 70 },

  // The user's original test query
  { id: 99, cat: 'Coding', diff: 'medium', lang: 'pt-BR',
    q: 'Me ajude a criar um novo componente React com TypeScript e testes unitários.',
    keywords: ['React','TypeScript','componente','teste','interface'], minQ: 75 },

  // SHMS Domain
  { id: 100, cat: 'Domain', diff: 'hard', lang: 'pt-BR',
    q: 'Descreva o procedimento de análise de vida útil remanescente (RUL) para um piezômetro do tipo Casagrande em uma barragem de terra, incluindo modelo preditivo LSTM e intervalos de confiança.',
    keywords: ['piezômetro','Casagrande','RUL','LSTM','confiança','barragem'], minQ: 65 },
];

interface EvalResult {
  queryId: number;
  category: string;
  difficulty: string;
  language: string;
  query: string;
  responseLength: number;
  wordCount: number;
  qualityScore: number | null;
  latencyMs: number;
  keywordsFound: string[];
  keywordCoverage: number;
  hasCitations: boolean;
  hasStructure: boolean;
  hasCodeBlocks: boolean;
  languageMatchOK: boolean;
  passed: boolean;
  responsePreview: string;
  error: string | null;
}

async function sendQuery(query: string): Promise<{ text: string; latencyMs: number; qualityScore: number | null }> {
  const start = Date.now();
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        useCache: false,
        conversationHistory: [],
      }),
      signal: AbortSignal.timeout(180000), // 3min
    });

    const fullText = await resp.text();
    const latencyMs = Date.now() - start;

    // Parse SSE chunks to extract response text and quality score
    let responseText = '';
    let qualityScore: number | null = null;

    for (const line of fullText.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) responseText += parsed.text;
        if (parsed.content) responseText += parsed.content;
        if (parsed.qualityScore !== undefined) qualityScore = parsed.qualityScore;
        if (parsed.quality_score !== undefined) qualityScore = parsed.quality_score;
        // Check for chunk format
        if (parsed.choices?.[0]?.delta?.content) responseText += parsed.choices[0].delta.content;
      } catch { /* skip non-JSON lines */ }
    }

    // If we couldn't parse SSE, use raw text
    if (!responseText && fullText.length > 0) {
      responseText = fullText.slice(0, 5000);
    }

    return { text: responseText, latencyMs, qualityScore };
  } catch (err) {
    return { text: '', latencyMs: Date.now() - start, qualityScore: null };
  }
}

function analyzeResponse(query: typeof TEST_QUERIES[0], text: string, qualityScore: number | null, latencyMs: number): EvalResult {
  const lower = text.toLowerCase();
  const foundKw = query.keywords.filter(k => lower.includes(k.toLowerCase()));
  const kwCoverage = foundKw.length / query.keywords.length;
  const wordCount = text.split(/\s+/).length;

  // Language detection (simple heuristic)
  const ptWords = ['também','como','para','são','mais','pode','sobre','quando'];
  const enWords = ['the','and','for','with','that','this','from','which'];
  const ptCount = ptWords.filter(w => lower.includes(w)).length;
  const enCount = enWords.filter(w => lower.includes(w)).length;
  const detectedLang = ptCount > enCount ? 'pt-BR' : 'en';
  const langMatch = detectedLang === query.lang;

  const hasCitations = /arXiv:|doi\.org|\(\d{4}\)|et al\.|\\[\d+\\]/i.test(text);
  const hasStructure = /^##\s/m.test(text);
  const hasCode = /```/.test(text);

  const meetsQuality = qualityScore !== null ? qualityScore >= query.minQ : true;
  const passed = meetsQuality && kwCoverage >= 0.4 && wordCount >= 50 && langMatch;

  return {
    queryId: query.id,
    category: query.cat,
    difficulty: query.diff,
    language: query.lang,
    query: query.q,
    responseLength: text.length,
    wordCount,
    qualityScore,
    latencyMs,
    keywordsFound: foundKw,
    keywordCoverage: Math.round(kwCoverage * 100) / 100,
    hasCitations,
    hasStructure,
    hasCodeBlocks: hasCode,
    languageMatchOK: langMatch,
    passed,
    responsePreview: text.slice(0, 300) + (text.length > 300 ? '...' : ''),
    error: text.length === 0 ? 'Empty response' : null,
  };
}

async function main() {
  console.log('=== MOTHER Scientific Benchmark ===');
  console.log(`Queries: ${TEST_QUERIES.length}`);
  console.log(`API: ${API_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results: EvalResult[] = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const q = TEST_QUERIES[i];
    console.log(`[${i + 1}/${TEST_QUERIES.length}] Q${q.id} (${q.cat}/${q.diff}/${q.lang}): ${q.q.slice(0, 60)}...`);

    const { text, latencyMs, qualityScore } = await sendQuery(q.q);
    const result = analyzeResponse(q, text, qualityScore, latencyMs);
    results.push(result);

    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | Q=${result.qualityScore ?? 'N/A'} | ${result.latencyMs}ms | KW=${result.keywordCoverage} | Words=${result.wordCount} | Lang=${result.languageMatchOK ? '✓' : '✗'}`);
    if (!result.passed && result.error) console.log(`  Error: ${result.error}`);
  }

  // Statistical summary
  const passed = results.filter(r => r.passed).length;
  const qScores = results.filter(r => r.qualityScore !== null).map(r => r.qualityScore!);
  const latencies = results.map(r => r.latencyMs);
  const kwCoverages = results.map(r => r.keywordCoverage);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const std = (arr: number[]) => {
    const m = avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, arr.length));
  };

  const summary = {
    timestamp: new Date().toISOString(),
    totalQueries: TEST_QUERIES.length,
    passed,
    failed: TEST_QUERIES.length - passed,
    passRate: Math.round(passed / TEST_QUERIES.length * 100),
    qualityScore: {
      mean: Math.round(avg(qScores) * 10) / 10,
      std: Math.round(std(qScores) * 10) / 10,
      min: qScores.length > 0 ? Math.min(...qScores) : 0,
      max: qScores.length > 0 ? Math.max(...qScores) : 0,
      distribution: {
        '90-100': qScores.filter(s => s >= 90).length,
        '80-89': qScores.filter(s => s >= 80 && s < 90).length,
        '70-79': qScores.filter(s => s >= 70 && s < 80).length,
        '<70': qScores.filter(s => s < 70).length,
      },
    },
    latencyMs: {
      mean: Math.round(avg(latencies)),
      std: Math.round(std(latencies)),
      p50: latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] || 0,
      p95: latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0,
      min: Math.min(...latencies),
      max: Math.max(...latencies),
    },
    keywordCoverage: {
      mean: Math.round(avg(kwCoverages) * 100),
      std: Math.round(std(kwCoverages) * 100),
    },
    byCategory: {} as Record<string, { count: number; passed: number; avgQ: number; avgLatency: number }>,
    byDifficulty: {} as Record<string, { count: number; passed: number; avgQ: number }>,
    citationRate: Math.round(results.filter(r => r.hasCitations).length / results.length * 100),
    structureRate: Math.round(results.filter(r => r.hasStructure).length / results.length * 100),
    languageMatchRate: Math.round(results.filter(r => r.languageMatchOK).length / results.length * 100),
    codeBlockRate: Math.round(results.filter(r => r.hasCodeBlocks).length / results.length * 100),
  };

  // By category
  for (const cat of ['STEM', 'Business', 'AI/ML', 'Architecture', 'PT-BR', 'Coding', 'Domain']) {
    const catResults = results.filter(r => r.category === cat);
    if (catResults.length > 0) {
      const catQScores = catResults.filter(r => r.qualityScore !== null).map(r => r.qualityScore!);
      summary.byCategory[cat] = {
        count: catResults.length,
        passed: catResults.filter(r => r.passed).length,
        avgQ: Math.round(avg(catQScores) * 10) / 10,
        avgLatency: Math.round(avg(catResults.map(r => r.latencyMs))),
      };
    }
  }

  // By difficulty
  for (const diff of ['easy', 'medium', 'hard']) {
    const diffResults = results.filter(r => r.difficulty === diff);
    if (diffResults.length > 0) {
      const diffQScores = diffResults.filter(r => r.qualityScore !== null).map(r => r.qualityScore!);
      summary.byDifficulty[diff] = {
        count: diffResults.length,
        passed: diffResults.filter(r => r.passed).length,
        avgQ: Math.round(avg(diffQScores) * 10) / 10,
      };
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  console.log('\n=== INDIVIDUAL RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
