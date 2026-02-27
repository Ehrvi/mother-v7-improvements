/**
 * MOTHER v69.1 - Layer 3: Intelligence Layer (Multi-Provider Cascade Router)
 *
 * Scientific Basis:
 * - FrugalGPT (Chen et al., 2023): cascade routing reduces cost by up to 98% — arXiv:2305.05176
 * - RouteLLM (Ong et al., 2024): learned routing with preference data — arXiv:2406.18665
 * - LLMRouterBench (Hu et al., 2026): static classifiers match LLM-based routers at 95% accuracy
 * - Bandarkar et al. (arXiv:2510.04694, 2025): multilingual routing requires Unicode normalization
 * - ReAct (Yao et al., 2022): tool-augmented reasoning requires function-calling capable models
 *
 * Architecture:
 * - Level 1 (Simple):    DeepSeek V3 — factual/simple queries ($0.02/M tokens)
 * - Level 2 (General):   Gemini 2.5 Flash — general/analytical queries ($0.075/M tokens)
 * - Level 3 (Coding):    Claude Sonnet 4.5 — code/technical queries ($3/$15 per M)
 * - Level 4 (Complex):   GPT-4o — complex reasoning/synthesis ($2.50/$10 per M)
 * - Level 5 (Research):  GPT-4o — autonomous study/knowledge ingestion (tool use)
 *
 * v69.1 Changes (Cycle 16):
 * - BUG FIX: Unicode NFKD normalization — accent-insensitive matching
 *   "otimizacao" now matches "otimizacao", "analise" matches "analise", etc.
 *   (Bandarkar et al., arXiv:2510.04694, 2025)
 * - NEW: 'research' category routes to gpt-4o for tool-use capability
 *   (ReAct, Yao et al., 2022 — force_study tool requires function calling)
 * - BUG FIX: "estude", "estado da arte", "otimizacao" now correctly route to research
 */

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'mistral';
export type LLMModel = { provider: LLMProvider; modelName: string; };
export type QueryCategory = 'simple' | 'general' | 'coding' | 'complex_reasoning' | 'research';

export interface RoutingDecision {
  category: QueryCategory;
  model: LLMModel;
  confidence: number;
  reasoning: string;
  tier: string;
  complexityScore: number;
  confidenceScore: number;
}

const PRICING: Record<LLMProvider, Record<string, { input: number; output: number }>> = {
  deepseek: { 'deepseek-chat': { input: 0.02 / 1_000_000, output: 0.02 / 1_000_000 } },
  google: {
    'gemini-2.5-flash': { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
    'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.00 / 1_000_000 },
  },
  anthropic: {
    'claude-sonnet-4-5': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    'claude-opus-4-5': { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
    'claude-opus-4-6': { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
  },
  openai: {
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4': { input: 30.00 / 1_000_000, output: 60.00 / 1_000_000 },
  },
  mistral: { 'mistral-small-latest': { input: 0.10 / 1_000_000, output: 0.30 / 1_000_000 } },
};

export function getModelForCategory(category: QueryCategory): LLMModel {
  switch (category) {
    case 'simple': return { provider: 'deepseek', modelName: 'deepseek-chat' };
    case 'general': return { provider: 'google', modelName: 'gemini-2.5-flash' };
    case 'coding': return { provider: 'anthropic', modelName: 'claude-sonnet-4-5' };
    case 'complex_reasoning': return { provider: 'openai', modelName: 'gpt-4o' };
    case 'research': return { provider: 'openai', modelName: 'gpt-4o' };
  }
}

export function classifyQuery(query: string): RoutingDecision {
  // v69.1: Unicode NFKD normalization for accent-insensitive matching
  // Bandarkar et al. (arXiv:2510.04694, 2025): multilingual routing requires normalization.
  // Portuguese users often type without accents (e.g., "otimizacao" vs "otimizacao").
  const normalize = (s: string): string =>
    s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const q = normalize(query);
  const wordCount = query.split(/\s+/).length;

  // ── Research/Study indicators (routes to gpt-4o for tool use) ─────────────
  // v69.1: New 'research' category. These queries MUST use gpt-4o to trigger
  // force_study tool. ReAct (Yao et al., 2022) requires function-calling models.
  const researchPatterns = [
    'estude', 'estudar', 'aprenda', 'aprender',
    'pesquise', 'pesquisar', 'investigue', 'investigar',
    'descubra', 'descobrir',
    'estado da arte', 'estado-da-arte',
    'revisao de literatura', 'revisao bibliografica',
    'busca cientifica', 'literatura cientifica',
    'artigo cientifico', 'papers recentes', 'paper recente',
    'arxiv', 'anna archive', 'annas archive',
    'buscar na internet', 'pesquisar online', 'buscar na web',
    'aprenda sobre', 'aprenda tudo', 'aprenda nivel god',
    'quero que voce saiba', 'quero que voce aprenda',
    'ingira conhecimento', 'adicione ao banco de conhecimento',
    'force study', 'force_study',
    'busque na web', 'busque artigos',
    // v69.9: Added missing high-quality routing keywords (RC-1 fix)
    // Scientific methodology commands — must use gpt-4o (Liu et al., 2023; Es et al., 2023)
    'metodologia cientifica', 'embasamento cientifico', 'embasamento',
    'cite', 'citar', 'citacao', 'referencias bibliograficas', 'referencias',
    'paper', 'papers', 'artigo', 'artigos', 'publicacao', 'publicacoes',
    'fonte', 'fontes', 'literatura',
    // Audit/introspection commands — must use gpt-4o for tool access
    'audite', 'auditoria', 'audit', 'inspecione', 'inspecionar',
    'vasculhe', 'vasculhar', 'varra', 'varrer',
    'verifique seu', 'verificar seu', 'diagnostique', 'diagnosticar',
    'analise seu codigo', 'analise o codigo', 'analise o seu codigo',
    'avalie seu codigo', 'avalie o seu codigo',
    'ordem do criador', 'ordem:', 'inspecione o sistema',
    // Quality/comparison commands
    'qualidade das respostas', 'melhore sua', 'melhore o',
    'compare as', 'comparar as', 'versus', 'benchmark',
    'avaliacao de qualidade', 'g-eval', 'ragas',
    // v72.0: File/code read-write access — MUST use gpt-4o with tools (Gödel Machine)
    // Scientific basis: SWE-agent (Yang et al., 2024, arXiv:2405.15793)
    'leia o arquivo', 'ler arquivo', 'read file', 'leia o codigo', 'ler o codigo',
    'escreva no arquivo', 'escreva o arquivo', 'write file', 'write to file',
    'modifique o arquivo', 'modify file', 'edite o arquivo', 'edit file',
    'atualize o arquivo', 'update file', 'patch file', 'patche o arquivo',
    'server/mother', 'client/src', 'core.ts', 'tool-engine', 'intelligence.ts',
    'seu proprio codigo', 'seu codigo', 'your code', 'your own code',
    'write_own_code', 'read_own_code', 'admin_docs', 'list_own_files',
    'git commit', 'git push', 'cloud build', 'trigger deploy', 'triggar deploy',
    'acesse o codigo', 'acesse seu codigo', 'access your code', 'access the code',
    'leia seu codigo', 'leia o seu codigo', 'read your code',
    'escreva seu codigo', 'escreva no seu codigo', 'write your code',
    'altere o codigo', 'altere seu codigo', 'change your code', 'change the code',
    'corrija o codigo', 'corrija seu codigo', 'fix your code', 'fix the code',
    'adicione ao codigo', 'adicione no codigo', 'add to code', 'add to your code',
    '/docs', '/write', 'documentacao admin', 'admin documentation',
    // v74.0: NC-011 fix — Self-diagnosis keywords force research category (gpt-4o + self-code-reader)
    // Scientific basis: SWE-agent (Yang et al., 2024, arXiv:2405.15793) — code-reading tools
    // required for accurate self-diagnosis; without tools, LLM hallucinates file names
    'auto-diagnostico', 'auto-diagnóstico', 'varredura do sistema', 'varredura em todo',
    'nao-conformidades', 'não-conformidades', 'nao conformidades', 'não conformidades',
    'auditoria cientifica', 'auditoria científica',
    'iso/iec 25010', 'ieee 730', 'self-audit', 'system scan',
    'listar todas', 'lista de problemas', 'lista de erros', 'lista de bugs',
    'plano de implementacao', 'plano de implementação', 'checklist do plano',
    'solucao completa', 'solução completa', 'linhas que devem ser alteradas',
    'nao conformidade', 'não conformidade', 'conformidade do sistema',
    // v74.4: NC-012 fix — Bug scan keywords force research category (gpt-4o + read_own_code)
    // Scientific basis: ReAct (Yao et al., arXiv:2210.03629, 2022) — tool use must be triggered
    // by routing BEFORE LLM decides; 'auto' tool_choice fails for scan prompts without routing
    // ToolFormer (Schick et al., arXiv:2302.04761, 2023): tools must be called, not planned
    'bugs reais', 'bug real', 'scan de bugs', 'escaneamento completo', 'escaneamento do sistema',
    'escaneamento', 'bugs confirmados', 'medida de controle', 'faca um escaneamento',
    'faça um escaneamento', 'scanning', 'code scan', 'inspecione os arquivos',
    'inspecionar os arquivos', 'leia os arquivos reais', 'use suas ferramentas',
    'self-code-reader', 'use a ferramenta', 'use suas ferramentas de leitura',
    // v74.5: NC-013 fix — Feature implementation requests → research category (gpt-4o + write_own_code)
    // Scientific basis: SWE-bench (Jimenez et al., 2024, arXiv:2310.06770): code agents must execute,
    // not describe. ToolFormer (Schick et al., arXiv:2302.04761, 2023): tool calls must be immediate.
    // Gödel Machine (Schmidhuber, 2003): self-modification requires direct action, not planning.
    // ROOT CAUSE: 'implementar' is in codingPatterns → routes to claude-sonnet (no write_own_code tool)
    // FIX: 'implementar uma funcionalidade' → researchPatterns → gpt-4o (has write_own_code)
    'implementar uma funcionalidade', 'implementar funcionalidade', 'adicionar funcionalidade',
    'adicionar uma funcionalidade', 'adicione uma funcionalidade', 'adicione a funcionalidade',
    'implemente uma funcionalidade', 'implemente a funcionalidade', 'implemente o recurso',
    'adicionar recurso', 'adicione o recurso', 'criar funcionalidade', 'crie a funcionalidade',
    'feature request', 'add feature', 'implement feature', 'build feature',
    'drag and drop', 'drag-and-drop', 'arrastar e soltar', 'upload de arquivo',
    'file upload', 'file extraction', 'extrair conteudo', 'extrair o conteudo',
    'adicione ao seu codigo', 'adicione no seu codigo', 'add to your own code',
    'adicione esta funcionalidade', 'adicione essa funcionalidade',
    'voce mesmo adicione', 'voce mesmo implemente', 'you yourself implement',
    'implemente voce mesmo', 'implemente voce mesma',
  ];
  const researchScore = researchPatterns.filter(p => q.includes(normalize(p))).length;

  // ── Coding indicators ─────────────────────────────────────────────────────
  const codingPatterns = [
    'code', 'function', 'class', 'method', 'variable', 'debug', 'error',
    'typescript', 'javascript', 'python', 'java', 'sql', 'api', 'endpoint',
    'implement', 'refactor', 'bug', 'syntax', 'compile', 'runtime', 'stack trace',
    'algorithm', 'data structure', 'regex', 'async', 'promise', 'callback',
    'docker', 'kubernetes', 'git', 'github', 'deploy', 'ci/cd', 'pipeline',
    'codigo', 'funcao', 'classe', 'metodo', 'variavel',
    'depurar', 'refatorar', 'implementar',
    'algoritmo', 'estrutura de dados', 'assincrono',
  ];
  const codingScore = codingPatterns.filter(p => q.includes(normalize(p))).length;

  // ── Complex reasoning indicators ──────────────────────────────────────────
  const complexPatterns = [
    'analyze', 'compare', 'evaluate', 'synthesize', 'critique', 'argue',
    'philosophical', 'ethical', 'strategy', 'business plan', 'research',
    'scientific', 'hypothesis', 'methodology', 'framework', 'architecture',
    'design system', 'trade-off', 'pros and cons', 'decision', 'recommend',
    'comprehensive', 'in-depth', 'detailed analysis', 'explain why',
    'analise completa', 'analise detalhada',
    'pontos fortes', 'pontos fracos', 'swot',
    'estrategia', 'movimentos estrategicos',
    'comparar', 'avaliar', 'avalie', 'sintetize',
    'filosofico', 'etico',
    'plano de negocios',
    'cientifico', 'hipotese', 'metodologia',
    'decisao', 'recomende', 'recomendacao',
    'abrangente', 'aprofundado', 'explique por que', 'explique porque',
    'implicacoes', 'consequencias',
    'diagnostico', 'proposta de valor',
    'analise swot',
    'proximos 12 meses',
    'faca uma analise',
    'quais sao as implicacoes',
    'argumento de', 'teorema', 'incompletude', 'alinhamento de ia',
    'otimizacao', 'otimize', 'otimizar',
    'arquitetura de software', 'design de sistema',
    'analise critica', 'revisao critica',
    'melhores praticas', 'boas praticas',
    'comparacao entre', 'diferencas entre',
    'vantagens e desvantagens', 'pros e contras',
  ];
  const complexScore = complexPatterns.filter(p => q.includes(normalize(p))).length;

  // ── General indicators ────────────────────────────────────────────────────
  const generalPatterns = [
    'what is', 'how does', 'explain', 'describe', 'tell me about',
    'summary', 'overview', 'list', 'difference between', 'history of',
    'definition', 'meaning', 'example', 'tutorial', 'guide',
    'o que e', 'como funciona', 'explique', 'descreva',
    'me fale sobre', 'resumo', 'visao geral',
    'diferenca entre', 'historia de',
    'definicao', 'exemplo', 'guia',
    'considerando', 'qual e',
  ];
  const generalScore = generalPatterns.filter(p => q.includes(normalize(p))).length;

  // ── Routing decision ──────────────────────────────────────────────────────
  let category: QueryCategory;
  let confidence: number;
  let reasoning: string;

  if (researchScore >= 1) {
    category = 'research';
    confidence = Math.min(0.97, 0.80 + researchScore * 0.05);
    reasoning = `Research/study query (${researchScore} indicators) → gpt-4o for tool use`;
  } else if (codingScore >= 2) {
    category = 'coding';
    confidence = Math.min(0.95, 0.70 + codingScore * 0.05);
    reasoning = `Coding query (${codingScore} indicators)`;
  } else if (complexScore >= 2 || (complexScore >= 1 && wordCount > 40) || wordCount > 70) {
    category = 'complex_reasoning';
    confidence = Math.min(0.92, 0.65 + complexScore * 0.07);
    reasoning = `Complex reasoning (${complexScore} indicators, ${wordCount} words)`;
  } else if (generalScore >= 1 || wordCount > 20) {
    category = 'general';
    confidence = Math.min(0.90, 0.70 + generalScore * 0.05);
    reasoning = `General query (${generalScore} indicators, ${wordCount} words)`;
  } else {
    category = 'simple';
    confidence = 0.85;
    reasoning = `Simple/factual query (${wordCount} words)`;
  }

  const model = getModelForCategory(category);

  const tierMap: Record<QueryCategory, string> = {
    simple: 'gpt-4o-mini', general: 'gpt-4o-mini',
    coding: 'gpt-4o', complex_reasoning: 'gpt-4o', research: 'gpt-4o',
  };

  const complexityScoreMap: Record<QueryCategory, number> = {
    simple: 0.2, general: 0.45, coding: 0.70, complex_reasoning: 0.85, research: 0.80,
  };

  return { category, model, confidence, reasoning,
    tier: tierMap[category], complexityScore: complexityScoreMap[category], confidenceScore: confidence };
}

export interface ComplexityAssessment {
  tier: string; complexityScore: number; confidenceScore: number; reasoning: string;
}
export type LLMTier = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4';

export function assessComplexity(query: string): ComplexityAssessment {
  const decision = classifyQuery(query);
  return { tier: decision.tier as LLMTier, complexityScore: decision.complexityScore,
    confidenceScore: decision.confidenceScore, reasoning: decision.reasoning };
}

export function getModelForTier(tier: LLMTier): string {
  switch (tier) {
    case 'gpt-4o-mini': return 'gpt-4o-mini';
    case 'gpt-4o': return 'gpt-4o';
    case 'gpt-4': return 'gpt-4';
  }
}

export function calculateCostForModel(model: LLMModel, inputTokens: number, outputTokens: number): number {
  const providerPricing = PRICING[model.provider];
  if (!providerPricing) return 0;
  const modelPricing = providerPricing[model.modelName];
  if (!modelPricing) return 0;
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
}

export function calculateCost(tier: LLMTier, inputTokens: number, outputTokens: number): number {
  const pricing: Record<LLMTier, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4': { input: 30.00 / 1_000_000, output: 60.00 / 1_000_000 },
  };
  const prices = pricing[tier];
  return (inputTokens * prices.input) + (outputTokens * prices.output);
}

export function calculateBaselineCost(inputTokens: number, outputTokens: number): number {
  return calculateCost('gpt-4', inputTokens, outputTokens);
}

export function calculateCostReduction(actualCost: number, baselineCost: number): number {
  if (baselineCost === 0) return 0;
  return ((baselineCost - actualCost) / baselineCost) * 100;
}
