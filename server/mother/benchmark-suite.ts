/**
 * MOTHER v69.13 — Scientific Benchmark Suite
 * 
 * 50 standard queries for objective quality measurement (MMLU-style).
 * Each query has an expected answer and evaluation criteria.
 * 
 * Scientific Basis:
 * - MMLU (Hendrycks et al., arXiv:2009.03300, 2020): Massive Multitask Language
 *   Understanding benchmark — 57 subjects, 14,000+ questions.
 * - RAGAS (Es et al., EACL 2024): RAG-specific evaluation: faithfulness,
 *   answer relevancy, context precision.
 * - G-Eval (Liu et al., arXiv:2303.16634, 2023): LLM-based evaluation with
 *   chain-of-thought for NLG tasks.
 * - BIG-bench (Srivastava et al., arXiv:2206.04615, 2022): Beyond the Imitation
 *   Game — diverse tasks for measuring capabilities.
 * 
 * Benchmark Categories (10 per domain × 5 domains = 50 queries):
 * 1. STEM (Science, Technology, Engineering, Math)
 * 2. Business & Strategy (Intelltech domain)
 * 3. AI & Machine Learning
 * 4. Systems Architecture
 * 5. Portuguese Language (PT-BR routing validation)
 */

import { getDb } from '../db';
import { mysqlTable, int, varchar, text, timestamp, decimal } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export interface BenchmarkQuery {
  id: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  query: string;
  expectedKeywords: string[]; // Keywords that should appear in a good answer
  minQualityScore: number; // Minimum acceptable quality score (0-100)
  language: 'pt-BR' | 'en';
}

export interface BenchmarkResult {
  queryId: number;
  query: string;
  response: string;
  qualityScore: number;
  responseTime: number;
  tier: string;
  keywordsFound: string[];
  keywordsCoverage: number; // 0-1
  passed: boolean;
  timestamp: string;
}

export interface BenchmarkRun {
  cycleId: string; // e.g., "cycle-31"
  version: string; // e.g., "v69.13"
  startedAt: string;
  completedAt: string;
  totalQueries: number;
  passedQueries: number;
  passRate: number; // 0-1
  avgQualityScore: number;
  avgResponseTime: number;
  avgKeywordCoverage: number;
  results: BenchmarkResult[];
}

/**
 * The 50 standard benchmark queries
 * Scientific basis: MMLU (Hendrycks et al., 2020) — multitask evaluation
 */
export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // ── STEM (10 queries) ─────────────────────────────────────────────────────
  {
    id: 1, category: 'STEM', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é machine learning e como ele difere de programação tradicional?',
    expectedKeywords: ['dados', 'modelo', 'treinamento', 'algoritmo', 'padrões'],
    minQualityScore: 75,
  },
  {
    id: 2, category: 'STEM', difficulty: 'medium', language: 'pt-BR',
    query: 'Explique o teorema de Bayes e sua aplicação em classificação de texto.',
    expectedKeywords: ['probabilidade', 'prior', 'posterior', 'likelihood', 'Bayes'],
    minQualityScore: 75,
  },
  {
    id: 3, category: 'STEM', difficulty: 'hard', language: 'en',
    query: 'What is the computational complexity of the attention mechanism in transformers and how does Flash Attention optimize it?',
    expectedKeywords: ['O(n²)', 'memory', 'attention', 'Flash', 'quadratic'],
    minQualityScore: 70,
  },
  {
    id: 4, category: 'STEM', difficulty: 'medium', language: 'pt-BR',
    query: 'Como funciona o algoritmo de backpropagation em redes neurais?',
    expectedKeywords: ['gradiente', 'erro', 'camadas', 'derivada', 'pesos'],
    minQualityScore: 75,
  },
  {
    id: 5, category: 'STEM', difficulty: 'easy', language: 'pt-BR',
    query: 'Qual é a diferença entre supervised e unsupervised learning?',
    expectedKeywords: ['rótulos', 'classificação', 'clustering', 'dados', 'supervisão'],
    minQualityScore: 80,
  },
  {
    id: 6, category: 'STEM', difficulty: 'hard', language: 'en',
    query: 'Explain the mathematical foundations of RLHF (Reinforcement Learning from Human Feedback).',
    expectedKeywords: ['reward', 'policy', 'PPO', 'preference', 'KL divergence'],
    minQualityScore: 70,
  },
  {
    id: 7, category: 'STEM', difficulty: 'medium', language: 'pt-BR',
    query: 'O que é overfitting e como regularização L1 e L2 ajudam a preveni-lo?',
    expectedKeywords: ['overfitting', 'regularização', 'Lasso', 'Ridge', 'generalização'],
    minQualityScore: 75,
  },
  {
    id: 8, category: 'STEM', difficulty: 'easy', language: 'pt-BR',
    query: 'Explique o conceito de embedding vetorial em NLP.',
    expectedKeywords: ['vetor', 'semântica', 'Word2Vec', 'representação', 'dimensão'],
    minQualityScore: 75,
  },
  {
    id: 9, category: 'STEM', difficulty: 'hard', language: 'en',
    query: 'What are the key differences between GPT-4, Claude, and Gemini architectures?',
    expectedKeywords: ['transformer', 'context', 'training', 'architecture', 'parameters'],
    minQualityScore: 65,
  },
  {
    id: 10, category: 'STEM', difficulty: 'medium', language: 'pt-BR',
    query: 'Como funciona o algoritmo de busca vetorial com cosine similarity?',
    expectedKeywords: ['coseno', 'similaridade', 'vetor', 'produto', 'normalização'],
    minQualityScore: 75,
  },

  // ── Business & Strategy (10 queries) ─────────────────────────────────────
  {
    id: 11, category: 'Business', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é uma proposta de valor e como ela diferencia uma empresa no mercado?',
    expectedKeywords: ['valor', 'cliente', 'diferenciação', 'mercado', 'benefício'],
    minQualityScore: 75,
  },
  {
    id: 12, category: 'Business', difficulty: 'medium', language: 'pt-BR',
    query: 'Como calcular o ROI de um projeto de implementação de IA em uma empresa?',
    expectedKeywords: ['ROI', 'investimento', 'retorno', 'custo', 'benefício'],
    minQualityScore: 75,
  },
  {
    id: 13, category: 'Business', difficulty: 'hard', language: 'pt-BR',
    query: 'Quais são as principais barreiras de adoção de IA em empresas B2B e como superá-las?',
    expectedKeywords: ['adoção', 'resistência', 'ROI', 'cultura', 'integração'],
    minQualityScore: 70,
  },
  {
    id: 14, category: 'Business', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é SaaS e quais são as vantagens desse modelo de negócio?',
    expectedKeywords: ['SaaS', 'assinatura', 'escalabilidade', 'receita', 'recorrente'],
    minQualityScore: 80,
  },
  {
    id: 15, category: 'Business', difficulty: 'medium', language: 'pt-BR',
    query: 'Como estruturar uma estratégia go-to-market para um produto de IA?',
    expectedKeywords: ['mercado', 'segmento', 'canal', 'posicionamento', 'estratégia'],
    minQualityScore: 75,
  },
  {
    id: 16, category: 'Business', difficulty: 'hard', language: 'en',
    query: 'How should an AI company price its products to maximize market penetration while maintaining profitability?',
    expectedKeywords: ['pricing', 'value', 'competition', 'margin', 'penetration'],
    minQualityScore: 70,
  },
  {
    id: 17, category: 'Business', difficulty: 'medium', language: 'pt-BR',
    query: 'Quais métricas são essenciais para monitorar a saúde de um negócio SaaS?',
    expectedKeywords: ['MRR', 'churn', 'LTV', 'CAC', 'NPS'],
    minQualityScore: 75,
  },
  {
    id: 18, category: 'Business', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é análise SWOT e como ela é usada no planejamento estratégico?',
    expectedKeywords: ['forças', 'fraquezas', 'oportunidades', 'ameaças', 'estratégia'],
    minQualityScore: 80,
  },
  {
    id: 19, category: 'Business', difficulty: 'hard', language: 'pt-BR',
    query: 'Como a Intelltech pode usar IA para monitoramento geotécnico em mineração?',
    expectedKeywords: ['sensores', 'dados', 'predição', 'risco', 'monitoramento'],
    minQualityScore: 65,
  },
  {
    id: 20, category: 'Business', difficulty: 'medium', language: 'pt-BR',
    query: 'Qual é a diferença entre product-led growth e sales-led growth?',
    expectedKeywords: ['produto', 'vendas', 'adoção', 'viral', 'conversão'],
    minQualityScore: 75,
  },

  // ── AI & Machine Learning (10 queries) ───────────────────────────────────
  {
    id: 21, category: 'AI/ML', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é RAG (Retrieval-Augmented Generation) e por que é importante?',
    expectedKeywords: ['recuperação', 'geração', 'contexto', 'conhecimento', 'LLM'],
    minQualityScore: 80,
  },
  {
    id: 22, category: 'AI/ML', difficulty: 'medium', language: 'en',
    query: 'What is the difference between fine-tuning and RAG for domain-specific AI applications?',
    expectedKeywords: ['fine-tuning', 'RAG', 'retrieval', 'training', 'knowledge'],
    minQualityScore: 75,
  },
  {
    id: 23, category: 'AI/ML', difficulty: 'hard', language: 'en',
    query: 'Explain the DGM (Darwin Gödel Machine) approach to self-improving AI systems.',
    expectedKeywords: ['self-improvement', 'mutation', 'fitness', 'evolution', 'Gödel'],
    minQualityScore: 65,
  },
  {
    id: 24, category: 'AI/ML', difficulty: 'medium', language: 'pt-BR',
    query: 'Como funciona o mecanismo de atenção multi-cabeça (multi-head attention)?',
    expectedKeywords: ['atenção', 'cabeças', 'query', 'key', 'value'],
    minQualityScore: 75,
  },
  {
    id: 25, category: 'AI/ML', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é prompt engineering e quais são as melhores práticas?',
    expectedKeywords: ['prompt', 'instrução', 'contexto', 'few-shot', 'chain-of-thought'],
    minQualityScore: 80,
  },
  {
    id: 26, category: 'AI/ML', difficulty: 'hard', language: 'en',
    query: 'What are the key metrics for evaluating LLM quality: BLEU, ROUGE, BERTScore, and G-Eval?',
    expectedKeywords: ['BLEU', 'ROUGE', 'BERTScore', 'G-Eval', 'evaluation'],
    minQualityScore: 70,
  },
  {
    id: 27, category: 'AI/ML', difficulty: 'medium', language: 'pt-BR',
    query: 'Como implementar um sistema de cache semântico para LLMs?',
    expectedKeywords: ['cache', 'embedding', 'similaridade', 'coseno', 'hash'],
    minQualityScore: 70,
  },
  {
    id: 28, category: 'AI/ML', difficulty: 'easy', language: 'pt-BR',
    query: 'Qual é a diferença entre GPT-4o, GPT-4o-mini e DeepSeek?',
    expectedKeywords: ['modelo', 'custo', 'performance', 'tokens', 'capacidade'],
    minQualityScore: 75,
  },
  {
    id: 29, category: 'AI/ML', difficulty: 'hard', language: 'en',
    query: 'How does CRAG (Corrective RAG) improve upon standard RAG pipelines?',
    expectedKeywords: ['corrective', 'retrieval', 'quality', 'web', 'evaluation'],
    minQualityScore: 65,
  },
  {
    id: 30, category: 'AI/ML', difficulty: 'medium', language: 'pt-BR',
    query: 'O que é Constitutional AI e como ela garante segurança em LLMs?',
    expectedKeywords: ['constitutional', 'segurança', 'princípios', 'RLHF', 'Anthropic'],
    minQualityScore: 70,
  },

  // ── Systems Architecture (10 queries) ────────────────────────────────────
  {
    id: 31, category: 'Architecture', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é arquitetura de microsserviços e quais são suas vantagens?',
    expectedKeywords: ['microsserviços', 'escalabilidade', 'independência', 'deploy', 'serviços'],
    minQualityScore: 80,
  },
  {
    id: 32, category: 'Architecture', difficulty: 'medium', language: 'en',
    query: 'How does Server-Sent Events (SSE) differ from WebSockets for real-time streaming?',
    expectedKeywords: ['SSE', 'WebSocket', 'unidirectional', 'bidirectional', 'streaming'],
    minQualityScore: 75,
  },
  {
    id: 33, category: 'Architecture', difficulty: 'hard', language: 'en',
    query: 'What are the tradeoffs between tRPC, REST, and GraphQL for a TypeScript full-stack application?',
    expectedKeywords: ['tRPC', 'REST', 'GraphQL', 'type-safety', 'performance'],
    minQualityScore: 70,
  },
  {
    id: 34, category: 'Architecture', difficulty: 'medium', language: 'pt-BR',
    query: 'Como o Google Cloud Run difere do Kubernetes para deploy de aplicações?',
    expectedKeywords: ['Cloud Run', 'Kubernetes', 'serverless', 'containers', 'escala'],
    minQualityScore: 75,
  },
  {
    id: 35, category: 'Architecture', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é RBAC (Role-Based Access Control) e como implementá-lo?',
    expectedKeywords: ['RBAC', 'papéis', 'permissões', 'usuários', 'acesso'],
    minQualityScore: 80,
  },
  {
    id: 36, category: 'Architecture', difficulty: 'hard', language: 'en',
    query: 'How does Drizzle ORM compare to Prisma for MySQL in a production TypeScript application?',
    expectedKeywords: ['Drizzle', 'Prisma', 'ORM', 'TypeScript', 'performance'],
    minQualityScore: 65,
  },
  {
    id: 37, category: 'Architecture', difficulty: 'medium', language: 'pt-BR',
    query: 'Como implementar um sistema de cache com Redis para reduzir latência?',
    expectedKeywords: ['Redis', 'cache', 'latência', 'TTL', 'hit rate'],
    minQualityScore: 75,
  },
  {
    id: 38, category: 'Architecture', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é CI/CD e como o Google Cloud Build automatiza o processo?',
    expectedKeywords: ['CI/CD', 'integração', 'deploy', 'automação', 'pipeline'],
    minQualityScore: 80,
  },
  {
    id: 39, category: 'Architecture', difficulty: 'hard', language: 'en',
    query: 'What are the best practices for implementing zero-downtime deployments on Cloud Run?',
    expectedKeywords: ['zero-downtime', 'rolling', 'health check', 'traffic', 'revision'],
    minQualityScore: 65,
  },
  {
    id: 40, category: 'Architecture', difficulty: 'medium', language: 'pt-BR',
    query: 'Como implementar observabilidade (logs, métricas, traces) em uma aplicação Node.js?',
    expectedKeywords: ['logs', 'métricas', 'traces', 'OpenTelemetry', 'monitoramento'],
    minQualityScore: 70,
  },

  // ── Portuguese Language Validation (10 queries) ──────────────────────────
  {
    id: 41, category: 'PT-BR', difficulty: 'easy', language: 'pt-BR',
    query: 'Qual é a capital do Brasil e por que ela foi construída no cerrado?',
    expectedKeywords: ['Brasília', 'capital', 'Kubitschek', 'cerrado', 'planejamento'],
    minQualityScore: 80,
  },
  {
    id: 42, category: 'PT-BR', difficulty: 'medium', language: 'pt-BR',
    query: 'Explique a diferença entre inteligência artificial fraca e forte.',
    expectedKeywords: ['fraca', 'forte', 'AGI', 'consciência', 'capacidade'],
    minQualityScore: 75,
  },
  {
    id: 43, category: 'PT-BR', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é blockchain e como ele garante a imutabilidade dos dados?',
    expectedKeywords: ['blockchain', 'hash', 'bloco', 'imutabilidade', 'descentralizado'],
    minQualityScore: 80,
  },
  {
    id: 44, category: 'PT-BR', difficulty: 'medium', language: 'pt-BR',
    query: 'Como a LGPD (Lei Geral de Proteção de Dados) afeta empresas de tecnologia?',
    expectedKeywords: ['LGPD', 'dados', 'privacidade', 'consentimento', 'ANPD'],
    minQualityScore: 75,
  },
  {
    id: 45, category: 'PT-BR', difficulty: 'hard', language: 'pt-BR',
    query: 'Quais são os desafios éticos do uso de IA em processos de recrutamento?',
    expectedKeywords: ['viés', 'discriminação', 'transparência', 'ética', 'fairness'],
    minQualityScore: 70,
  },
  {
    id: 46, category: 'PT-BR', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é computação em nuvem e quais são os principais provedores?',
    expectedKeywords: ['nuvem', 'AWS', 'Azure', 'Google Cloud', 'infraestrutura'],
    minQualityScore: 80,
  },
  {
    id: 47, category: 'PT-BR', difficulty: 'medium', language: 'pt-BR',
    query: 'Como funciona o mercado de carbono e qual é o papel da tecnologia?',
    expectedKeywords: ['carbono', 'emissões', 'créditos', 'mercado', 'sustentabilidade'],
    minQualityScore: 70,
  },
  {
    id: 48, category: 'PT-BR', difficulty: 'easy', language: 'pt-BR',
    query: 'O que é DevOps e como ele melhora o ciclo de desenvolvimento de software?',
    expectedKeywords: ['DevOps', 'colaboração', 'automação', 'deploy', 'cultura'],
    minQualityScore: 80,
  },
  {
    id: 49, category: 'PT-BR', difficulty: 'hard', language: 'pt-BR',
    query: 'Quais são as principais diferenças entre SQL e NoSQL e quando usar cada um?',
    expectedKeywords: ['SQL', 'NoSQL', 'relacional', 'escalabilidade', 'schema'],
    minQualityScore: 75,
  },
  {
    id: 50, category: 'PT-BR', difficulty: 'medium', language: 'pt-BR',
    query: 'Como a inteligência artificial está transformando o setor de saúde no Brasil?',
    expectedKeywords: ['saúde', 'diagnóstico', 'dados', 'hospitais', 'IA'],
    minQualityScore: 70,
  },
];

/**
 * Evaluate a single response against benchmark criteria
 */
export function evaluateBenchmarkResponse(
  query: BenchmarkQuery,
  response: string,
  qualityScore: number,
  responseTime: number,
  tier: string,
): BenchmarkResult {
  const responseLower = response.toLowerCase();
  const keywordsFound = query.expectedKeywords.filter(kw => 
    responseLower.includes(kw.toLowerCase())
  );
  const keywordsCoverage = keywordsFound.length / query.expectedKeywords.length;
  
  const passed = qualityScore >= query.minQualityScore && keywordsCoverage >= 0.4;
  
  return {
    queryId: query.id,
    query: query.query,
    response: response.slice(0, 500), // Truncate for storage
    qualityScore,
    responseTime,
    tier,
    keywordsFound,
    keywordsCoverage,
    passed,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get benchmark queries for a specific category
 */
export function getBenchmarksByCategory(category: string): BenchmarkQuery[] {
  return BENCHMARK_QUERIES.filter(q => q.category === category);
}

/**
 * Get benchmark queries by difficulty
 */
export function getBenchmarksByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): BenchmarkQuery[] {
  return BENCHMARK_QUERIES.filter(q => q.difficulty === difficulty);
}

/**
 * Calculate aggregate statistics for a benchmark run
 */
export function calculateBenchmarkStats(results: BenchmarkResult[]): {
  passRate: number;
  avgQualityScore: number;
  avgResponseTime: number;
  avgKeywordCoverage: number;
  byCategory: Record<string, { passRate: number; avgQuality: number }>;
} {
  if (results.length === 0) {
    return { passRate: 0, avgQualityScore: 0, avgResponseTime: 0, avgKeywordCoverage: 0, byCategory: {} };
  }
  
  const passRate = results.filter(r => r.passed).length / results.length;
  const avgQualityScore = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
  const avgKeywordCoverage = results.reduce((sum, r) => sum + r.keywordsCoverage, 0) / results.length;
  
  // By category
  const categories = [...new Set(BENCHMARK_QUERIES.map(q => q.category))];
  const byCategory: Record<string, { passRate: number; avgQuality: number }> = {};
  
  for (const cat of categories) {
    const catResults = results.filter(r => {
      const query = BENCHMARK_QUERIES.find(q => q.id === r.queryId);
      return query?.category === cat;
    });
    if (catResults.length > 0) {
      byCategory[cat] = {
        passRate: catResults.filter(r => r.passed).length / catResults.length,
        avgQuality: catResults.reduce((sum, r) => sum + r.qualityScore, 0) / catResults.length,
      };
    }
  }
  
  return { passRate, avgQualityScore, avgResponseTime, avgKeywordCoverage, byCategory };
}
