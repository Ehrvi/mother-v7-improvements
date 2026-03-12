/**
 * Quality Benchmark Suite — Automated testing of MOTHER vs MANUS-level quality
 * 50 queries across 5 categories: factual, analysis, creative, code, domain
 * Scientific basis: HELM (Liang et al., arXiv:2211.09110, 2022)
 */

import { createLogger } from '../_core/logger';

const log = createLogger('BENCHMARK');

export interface BenchmarkQuery {
  id: string;
  category: 'factual' | 'analysis' | 'creative' | 'code' | 'domain';
  query: string;
  expectedTraits: string[];
  minQualityScore: number;
}

export interface BenchmarkResult {
  queryId: string;
  category: string;
  query: string;
  qualityScore: number;
  latencyMs: number;
  hasCitations: boolean;
  hasStructure: boolean;
  wordCount: number;
  passed: boolean;
  issues: string[];
}

export interface BenchmarkSuiteResult {
  timestamp: Date;
  version: string;
  totalQueries: number;
  passed: number;
  failed: number;
  avgQualityScore: number;
  avgLatencyMs: number;
  categoryResults: Record<string, { passed: number; total: number; avgScore: number }>;
  results: BenchmarkResult[];
}

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // Factual (10)
  { id: 'F01', category: 'factual', query: 'What is the transformer architecture in deep learning?', expectedTraits: ['attention', 'encoder', 'decoder'], minQualityScore: 80 },
  { id: 'F02', category: 'factual', query: 'Explique o que é CRAG (Corrective RAG) e como funciona', expectedTraits: ['retrieval', 'correction', 'hallucination'], minQualityScore: 80 },
  { id: 'F03', category: 'factual', query: 'What is Constitutional AI?', expectedTraits: ['safety', 'principles', 'harmless'], minQualityScore: 80 },
  { id: 'F04', category: 'factual', query: 'O que é o método científico?', expectedTraits: ['hipótese', 'experimento', 'observação'], minQualityScore: 80 },
  { id: 'F05', category: 'factual', query: 'Explain the difference between DPO and RLHF', expectedTraits: ['preference', 'reward', 'optimization'], minQualityScore: 80 },
  { id: 'F06', category: 'factual', query: 'What is a knowledge graph?', expectedTraits: ['nodes', 'edges', 'relationships'], minQualityScore: 80 },
  { id: 'F07', category: 'factual', query: 'Explique RAG (Retrieval Augmented Generation)', expectedTraits: ['retrieval', 'generation', 'context'], minQualityScore: 80 },
  { id: 'F08', category: 'factual', query: 'What is self-consistency in LLM reasoning?', expectedTraits: ['sampling', 'majority', 'consistency'], minQualityScore: 80 },
  { id: 'F09', category: 'factual', query: 'O que é fine-tuning de modelos de linguagem?', expectedTraits: ['pré-treinamento', 'adaptação', 'dataset'], minQualityScore: 80 },
  { id: 'F10', category: 'factual', query: 'Explain Chain-of-Thought prompting', expectedTraits: ['reasoning', 'step_by_step', 'intermediate'], minQualityScore: 80 },

  // Analysis (10)
  { id: 'A01', category: 'analysis', query: 'Compare MoA (Mixture of Agents) vs single-agent LLM approaches for quality', expectedTraits: ['quality', 'cost', 'latency'], minQualityScore: 75 },
  { id: 'A02', category: 'analysis', query: 'Analise os prós e contras do uso de cache semântico em sistemas de IA', expectedTraits: ['latência', 'custo', 'consistência'], minQualityScore: 75 },
  { id: 'A03', category: 'analysis', query: 'What are the tradeoffs between model size and inference speed in production?', expectedTraits: ['latency', 'cost', 'quality'], minQualityScore: 75 },
  { id: 'A04', category: 'analysis', query: 'Avalie a arquitetura de circuit breaker para chamadas de API de LLM', expectedTraits: ['resiliência', 'fallback', 'timeout'], minQualityScore: 75 },
  { id: 'A05', category: 'analysis', query: 'Compare GraphRAG with traditional vector-based RAG for knowledge retrieval', expectedTraits: ['graph', 'vector', 'recall'], minQualityScore: 75 },
  { id: 'A06', category: 'analysis', query: 'Analyze the impact of temperature on LLM response quality', expectedTraits: ['factual', 'creative', 'deterministic'], minQualityScore: 75 },
  { id: 'A07', category: 'analysis', query: 'Quais são as vantagens de usar múltiplos providers de LLM?', expectedTraits: ['redundância', 'custo', 'qualidade'], minQualityScore: 75 },
  { id: 'A08', category: 'analysis', query: 'Evaluate Self-Refine vs planning-first for LLM quality improvement', expectedTraits: ['latency', 'iterations', 'quality'], minQualityScore: 75 },
  { id: 'A09', category: 'analysis', query: 'Compare episodic memory vs RAG for long-term AI knowledge', expectedTraits: ['persistence', 'retrieval', 'personalization'], minQualityScore: 75 },
  { id: 'A10', category: 'analysis', query: 'Analise o impacto do streaming de tokens na experiência do usuário', expectedTraits: ['TTFT', 'percepção', 'latência'], minQualityScore: 75 },

  // Creative (10)
  { id: 'C01', category: 'creative', query: 'Write a technical blog post introduction about autonomous AI agents', expectedTraits: ['engaging', 'technical', 'clear'], minQualityScore: 70 },
  { id: 'C02', category: 'creative', query: 'Explique como funciona um transformer usando uma analogia simples', expectedTraits: ['analogia', 'simples', 'claro'], minQualityScore: 70 },
  { id: 'C03', category: 'creative', query: 'Create a metaphor explaining RAG to a non-technical stakeholder', expectedTraits: ['metaphor', 'business', 'clear'], minQualityScore: 70 },
  { id: 'C04', category: 'creative', query: 'Escreva um resumo executivo sobre IA auto-aperfeiçoante', expectedTraits: ['executivo', 'benefícios', 'conciso'], minQualityScore: 70 },
  { id: 'C05', category: 'creative', query: 'Draft a project proposal for an AI-powered monitoring system', expectedTraits: ['scope', 'timeline', 'deliverables'], minQualityScore: 70 },
  { id: 'C06', category: 'creative', query: 'Write a tutorial outline for building a RAG pipeline from scratch', expectedTraits: ['steps', 'tools', 'practical'], minQualityScore: 70 },
  { id: 'C07', category: 'creative', query: 'Crie uma explicação visual (em texto) de arquitetura multi-agente', expectedTraits: ['visual', 'estruturado', 'claro'], minQualityScore: 70 },
  { id: 'C08', category: 'creative', query: 'Write a comparison table between 5 popular LLM providers', expectedTraits: ['table', 'comparison', 'practical'], minQualityScore: 70 },
  { id: 'C09', category: 'creative', query: 'Escreva um case study de IA em monitoramento de barragens', expectedTraits: ['barragem', 'sensores', 'resultados'], minQualityScore: 70 },
  { id: 'C10', category: 'creative', query: 'Create a decision flowchart for choosing between RAG strategies', expectedTraits: ['flowchart', 'decision', 'criteria'], minQualityScore: 70 },

  // Code (10)
  { id: 'D01', category: 'code', query: 'Implement a semantic cache in TypeScript using cosine similarity', expectedTraits: ['typescript', 'cosine', 'cache'], minQualityScore: 75 },
  { id: 'D02', category: 'code', query: 'Write a circuit breaker pattern implementation in Node.js', expectedTraits: ['states', 'timeout', 'fallback'], minQualityScore: 75 },
  { id: 'D03', category: 'code', query: 'Implemente um rate limiter com sliding window em TypeScript', expectedTraits: ['sliding_window', 'rate', 'typescript'], minQualityScore: 75 },
  { id: 'D04', category: 'code', query: 'Create a retry mechanism with exponential backoff and jitter', expectedTraits: ['exponential', 'jitter', 'retry'], minQualityScore: 75 },
  { id: 'D05', category: 'code', query: 'Write a semantic text chunker with overlap in TypeScript', expectedTraits: ['chunking', 'overlap', 'semantic'], minQualityScore: 75 },
  { id: 'D06', category: 'code', query: 'Implement an LRU cache with TTL support in TypeScript', expectedTraits: ['LRU', 'TTL', 'eviction'], minQualityScore: 75 },
  { id: 'D07', category: 'code', query: 'Crie um middleware Express para logging estruturado com request ID', expectedTraits: ['middleware', 'request_id', 'structured'], minQualityScore: 75 },
  { id: 'D08', category: 'code', query: 'Write a priority queue implementation for task scheduling', expectedTraits: ['heap', 'priority', 'dequeue'], minQualityScore: 75 },
  { id: 'D09', category: 'code', query: 'Implement a pub-sub event bus in TypeScript', expectedTraits: ['subscribe', 'publish', 'events'], minQualityScore: 75 },
  { id: 'D10', category: 'code', query: 'Create a health check endpoint monitoring multiple dependencies', expectedTraits: ['health', 'dependencies', 'timeout'], minQualityScore: 75 },

  // Domain / SHMS (10)
  { id: 'S01', category: 'domain', query: 'Explain how piezometers work in dam monitoring', expectedTraits: ['pressure', 'water', 'geotechnical'], minQualityScore: 70 },
  { id: 'S02', category: 'domain', query: 'O que é um inclinômetro e como é usado em monitoramento de taludes?', expectedTraits: ['inclinação', 'deslocamento', 'talude'], minQualityScore: 70 },
  { id: 'S03', category: 'domain', query: 'What are the ICOLD guidelines for dam safety monitoring?', expectedTraits: ['safety', 'monitoring', 'guidelines'], minQualityScore: 70 },
  { id: 'S04', category: 'domain', query: 'Explique digital twin aplicado a monitoramento de barragens', expectedTraits: ['simulação', 'real_time', 'sensores'], minQualityScore: 70 },
  { id: 'S05', category: 'domain', query: 'How does MQTT protocol work for IoT sensor data?', expectedTraits: ['MQTT', 'publish', 'subscribe'], minQualityScore: 70 },
  { id: 'S06', category: 'domain', query: 'O que é um filtro de Kalman aplicado a dados de sensores?', expectedTraits: ['predição', 'ruído', 'estado'], minQualityScore: 70 },
  { id: 'S07', category: 'domain', query: 'Describe key metrics for structural health monitoring (SHM)', expectedTraits: ['displacement', 'strain', 'vibration'], minQualityScore: 70 },
  { id: 'S08', category: 'domain', query: 'Quais são os principais riscos em barragens e como IA pode ajudar?', expectedTraits: ['risco', 'monitoramento', 'alerta'], minQualityScore: 70 },
  { id: 'S09', category: 'domain', query: 'Explain static vs dynamic analysis in geotechnical engineering', expectedTraits: ['static', 'dynamic', 'load'], minQualityScore: 70 },
  { id: 'S10', category: 'domain', query: 'How can anomaly detection be applied to dam monitoring data?', expectedTraits: ['anomaly', 'threshold', 'detection'], minQualityScore: 70 },
];

export function evaluateBenchmarkResponse(
  query: BenchmarkQuery,
  response: string,
  qualityScore: number,
  latencyMs: number,
): BenchmarkResult {
  const issues: string[] = [];
  const wordCount = response.split(/\s+/).length;
  const hasCitations = /\[\d+\]/.test(response);
  const hasStructure = /^##\s/m.test(response);
  const responseLower = response.toLowerCase();

  if (qualityScore < query.minQualityScore) {
    issues.push(`Quality ${qualityScore} < min ${query.minQualityScore}`);
  }

  for (const trait of query.expectedTraits) {
    const t = trait.toLowerCase().replace(/_/g, ' ');
    if (!responseLower.includes(t) && !responseLower.includes(trait.toLowerCase())) {
      issues.push(`Missing trait: ${trait}`);
    }
  }

  if (query.category !== 'factual' && wordCount < 80) {
    issues.push(`Too short for ${query.category}: ${wordCount} words`);
  }

  if (latencyMs > 30000) {
    issues.push(`Latency ${latencyMs}ms > 30s`);
  }

  return {
    queryId: query.id,
    category: query.category,
    query: query.query,
    qualityScore,
    latencyMs,
    hasCitations,
    hasStructure,
    wordCount,
    passed: issues.length === 0,
    issues,
  };
}

export function aggregateBenchmarkResults(
  version: string,
  results: BenchmarkResult[],
): BenchmarkSuiteResult {
  const categoryResults: Record<string, { passed: number; total: number; avgScore: number }> = {};

  for (const r of results) {
    if (!categoryResults[r.category]) {
      categoryResults[r.category] = { passed: 0, total: 0, avgScore: 0 };
    }
    categoryResults[r.category].total++;
    if (r.passed) categoryResults[r.category].passed++;
    categoryResults[r.category].avgScore += r.qualityScore;
  }

  for (const cat of Object.values(categoryResults)) {
    cat.avgScore = cat.total > 0 ? Math.round(cat.avgScore / cat.total) : 0;
  }

  return {
    timestamp: new Date(),
    version,
    totalQueries: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    avgQualityScore: results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.qualityScore, 0) / results.length)
      : 0,
    avgLatencyMs: results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
      : 0,
    categoryResults,
    results,
  };
}
