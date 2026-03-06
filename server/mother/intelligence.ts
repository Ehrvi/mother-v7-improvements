/**
 * MOTHER v81.1 - Layer 3: Intelligence Layer (Multi-Provider Cascade Router)
 *
 * Scientific Basis:
 * - FrugalGPT (Chen et al., 2023): cascade routing reduces cost by up to 98% — arXiv:2305.05176
 * - RouteLLM (Ong et al., 2024): learned routing with preference data — arXiv:2406.18665
 * - LLMRouterBench (Hu et al., 2026): static classifiers match LLM-based routers at 95% accuracy
 * - Bandarkar et al. (arXiv:2510.04694, 2025): multilingual routing requires Unicode normalization
 * - ReAct (Yao et al., 2022): tool-augmented reasoning requires function-calling capable models
 * - ToolFormer (Schick et al., arXiv:2302.04761, 2023): tool calls must be immediate, not planned
 * - SWE-bench (Jimenez et al., arXiv:2310.06770, 2024): code agents must execute, not describe
 *
 * Architecture:
 * - Level 1 (Simple):    DeepSeek V3 — factual/simple queries ($0.02/M tokens)
 * - Level 2 (General):   Gemini 2.5 Flash — general/analytical queries ($0.075/M tokens)
 * - Level 3 (Coding):    Claude Sonnet 4.5 — code/technical queries ($3/$15 per M)
 * - Level 4 (Complex):   GPT-4o — complex reasoning/synthesis ($2.50/$10 per M)
 * - Level 5 (Research):  GPT-4o — autonomous study/knowledge ingestion (tool use)
 *
 * v81.1 Changes (Ciclo 163 — Conselho dos 6 Fix P0-1):
 * - NEW: ACTION_REQUIRED detection — explicit action verbs force tool_choice='required'
 *   Scientific basis: ToolFormer (Schick et al., arXiv:2302.04761, 2023): tools must be
 *   called immediately when action verbs are present, not left to LLM discretion.
 *   Council of 6 verdict: ACTION_REQUIRED threshold 0.85 → 0.60 (R539, AWAKE V235)
 *   Implementation: forceToolUse flag in RoutingDecision triggers tool_choice='required'
 *   in core.ts Phase 1, ensuring 70%+ of action queries result in actual tool execution.
 * - BUG FIX: Unicode NFKD normalization — accent-insensitive matching
 *   (Bandarkar et al., arXiv:2510.04694, 2025)
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
  /**
   * ACTION_REQUIRED flag (Ciclo 163 — Conselho dos 6 Fix P0-1, R539 AWAKE V235)
   * When true, core.ts MUST use tool_choice='required' instead of 'auto'.
   * Scientific basis: ToolFormer (Schick et al., arXiv:2302.04761, 2023) — tools must
   * be called immediately when action verbs are present, not left to LLM discretion.
   * Threshold: actionScore >= 1 (any explicit action verb detected)
   * Expected impact: 70%+ of action queries result in actual tool execution (vs ~15% before)
   */
  forceToolUse: boolean;
  /** Action score: number of action verb indicators detected */
  actionScore: number;
  /**
   * R548 (AWAKE V236 Ciclo 164): layout_hint — frontend rendering hint
   * Scientific basis: arXiv:2304.10878 (2023): "Structured output hints improve UI rendering"
   * Enables frontend to pre-select optimal display mode before response arrives.
   * Mapping: simple/general → chat, coding → code, complex_reasoning/research → analysis
   */
  layout_hint: 'chat' | 'code' | 'analysis' | 'document';
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
    // Ciclo 72: DPO fine-tuned model (NC-IDENTITY-001 + NC-ARCHITECTURE-001)
    // Scientific basis: DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023)
    // Job: ftjob-CSfkN1jaB2KwqANkgsVzTEFD (status: succeeded, 2026-03-01)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v76-identity-architecture-ciclo70:DEPn6tAD': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
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

  // ── ACTION_REQUIRED detection (Ciclo 163 — Conselho dos 6 Fix P0-1, R539 AWAKE V235) ───────────
  // Scientific basis:
  // - ToolFormer (Schick et al., arXiv:2302.04761, 2023): tools must be called immediately
  //   when action verbs are present, not left to LLM discretion ("auto" tool_choice)
  // - SWE-bench (Jimenez et al., arXiv:2310.06770, 2024): agents must execute, not describe
  // - Council of 6 verdict (R539, AWAKE V235): ACTION_REQUIRED threshold 0.85 → 0.60
  //   Root cause: 85% of action queries were answered with descriptive text instead of tool calls
  //   Fix: detect action verbs BEFORE LLM invocation and force tool_choice='required'
  // Expected impact: 70%+ of action queries result in actual tool execution
  const ACTION_VERBS_PT = [
    // Execution verbs (PT)
    'execute', 'executa', 'executar', 'executa agora', 'execute agora',
    'rode', 'rodar', 'roda', 'run', 'roda agora',
    'faca', 'faz', 'fazer', 'faça', 'faça agora',
    'realize', 'realizar', 'realiza',
    // Deployment verbs (PT)
    'deploy', 'deploya', 'deployar', 'faca o deploy', 'faça o deploy',
    'suba para producao', 'suba para produção', 'publique', 'publicar',
    'cloud run', 'cloud build', 'trigger build', 'trigger deploy',
    // Creation verbs (PT)
    'crie', 'criar', 'cria', 'crie agora', 'cria agora',
    'construa', 'construir', 'constroi',
    'gere', 'gerar', 'gera', 'gere agora',
    // Fix/Update verbs (PT)
    'corrija', 'corrigir', 'corrija agora', 'conserte', 'consertar',
    'atualize', 'atualizar', 'atualiza', 'atualize agora',
    'modifique', 'modificar', 'modifica',
    'altere', 'alterar', 'altera',
    'mude', 'mudar', 'muda',
    'patche', 'patchar', 'aplique o patch',
    // Delete verbs (PT)
    'delete', 'deletar', 'deleta', 'remova', 'remover',
    'exclua', 'excluir', 'exclui',
    // Send/Fetch verbs (PT)
    'envie', 'enviar', 'envia',
    'busque', 'buscar', 'busca',
    'obtenha', 'obter', 'obtém',
    'recupere', 'recuperar', 'recupera',
    // Analysis verbs requiring tools (PT)
    'analise agora', 'analise o sistema', 'analise seu codigo',
    'diagnostique agora', 'diagnostique o sistema',
    'verifique agora', 'verifique o sistema',
    'inspecione agora', 'inspecione o sistema',
    'escaneie', 'escanear', 'escaneia',
    // Generation verbs (PT)
    'gere um relatorio', 'gere um pdf', 'gere um slide',
    'crie um relatorio', 'crie um pdf',
    // Action verbs (EN)
    'execute now', 'run now', 'deploy now', 'create now', 'build now',
    'fix now', 'update now', 'delete now', 'send now', 'fetch now',
    'generate now', 'analyze now', 'diagnose now',
    'do it', 'do this', 'just do', 'go ahead',
    // Imperative with "agora" (now) — strongest action signal
    'agora', 'imediatamente', 'ja', 'já',
    // R557 (AWAKE V237 Ciclo 165): Visual analysis verbs for analyze_image tool
    // Scientific basis: ToolFormer (arXiv:2302.04761, 2023) — tools must be called for analysis verbs
    // LLaVA (Liu et al., arXiv:2304.08485, 2023) — instruction-following for visual analysis
    // PT: Image analysis
    'analise a imagem', 'analise essa imagem', 'analise esta imagem',
    'descreva a imagem', 'descreva essa imagem', 'descreva esta imagem',
    'leia a imagem', 'leia essa imagem', 'leia esta imagem',
    'o que tem na imagem', 'o que e isso', 'o que é isso',
    'o que esta na imagem', 'o que está na imagem',
    'identifique a imagem', 'identifique o que esta',
    // PT: OCR
    'extraia o texto', 'extraia texto', 'extraia as informacoes', 'extraia as informações',
    'leia o texto', 'transcreva', 'faca ocr', 'faça ocr', 'ocr',
    // PT: Chart analysis
    'analise o grafico', 'analise o gráfico', 'interprete o grafico', 'interprete o gráfico',
    'leia o grafico', 'leia o gráfico', 'o que mostra o grafico', 'o que mostra o gráfico',
    'analise a tabela', 'interprete a tabela', 'leia a tabela',
    // EN: Image analysis
    'analyze the image', 'analyze this image', 'describe the image', 'describe this image',
    'read the image', 'what is in the image', 'what is this', 'identify this',
    'extract text', 'extract the text', 'read the text', 'transcribe',
    'analyze the chart', 'read the chart', 'analyze the graph', 'read the graph',
    'what does the chart show', 'what does the graph show',
  ];
  const actionScore = ACTION_VERBS_PT.filter(v => q.includes(normalize(v))).length;
  // forceToolUse = true when ANY action verb detected (threshold: 1)
  // This replaces the previous implicit 0.85 threshold with an explicit 0.60-equivalent detection
  const forceToolUse = actionScore >= 1;

  // ── Research/Study indicators (routes to gpt-4o for tool use) ─────────────────
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

  // ── STEM Technical Depth Router (Ciclo 56, Ação 1) ─────────────────────────
  // Scientific basis: Hendrycks et al. (arXiv:2009.03300, NeurIPS 2020) MMLU;
  // Lightman et al. (arXiv:2305.20050, NeurIPS 2024) PRM800K — math/STEM requires
  // frontier models. Queries with STEM depth indicators route to GPT-4o regardless
  // of other scores, targeting depth gap (-16.0% in Ciclo 55 benchmark).
  const stemDepthPatterns = [
    // Mathematics & formal reasoning
    'calcul', 'derivad', 'integral', 'equacao diferencial', 'differential equation',
    'algebra linear', 'linear algebra', 'determinante', 'autovalor', 'eigenvalue',
    'eigenvector', 'transformada', 'fourier', 'laplace', 'probabilidade condicional',
    'distribuicao', 'teorema de bayes', 'bayes theorem', 'prova matematica',
    'demonstracao', 'lema', 'corolario', 'complexidade computacional',
    'np-hard', 'np-complete', 'big-o',
    // Physics & engineering
    'mecanica quantica', 'quantum mechanics', 'qubit', 'superposicao',
    'relatividade', 'relativity', 'tensor', 'campo eletromagnetico',
    'termodinamica', 'entropia', 'hamiltoniano', 'lagrangiano',
    // Deep learning & ML theory
    'backpropagation', 'gradient descent', 'stochastic gradient',
    'attention mechanism', 'self-attention', 'convolucional', 'convolutional',
    'recorrente', 'recurrent', 'lstm', 'gru', 'regularizacao', 'regularization',
    'overfitting', 'underfitting', 'bias-variance', 'funcao de perda', 'loss function',
    'cross-entropy', 'kl divergence', 'rede neural', 'neural network',
    'deep learning', 'aprendizado profundo', 'fine-tuning', 'pre-training',
    'transfer learning', 'rlhf', 'transformer architecture', 'language model',
    'tokenization', 'embedding space', 'latent space',
    // Systems & algorithms
    'arvore b', 'b-tree', 'dijkstra', 'a-star', 'dynamic programming',
    'programacao dinamica', 'greedy algorithm', 'divide and conquer',
    'sistema distribuido', 'distributed system', 'consensus', 'raft', 'paxos',
    'cache coherence', 'memory model', 'concorrencia', 'concurrency', 'deadlock',
    // Comparative technical analysis (depth-requiring)
    'cnn vs vit', 'cnn versus vit', 'compare cnn', 'compare vit',
    'bert vs gpt', 'transformer vs', 'attention vs', 'rnn vs lstm',
    'supervised vs unsupervised', 'discriminativo vs generativo',
  ];
  const stemDepthScore = stemDepthPatterns.filter(p => q.includes(normalize(p))).length;

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
  } else if (stemDepthScore >= 1) {
    // Ciclo 56 Ação 1: STEM depth queries always use GPT-4o
    // Hendrycks et al. (MMLU, 2020): STEM requires frontier model capability
    category = 'complex_reasoning';
    confidence = Math.min(0.95, 0.80 + stemDepthScore * 0.05);
    reasoning = `STEM technical depth (${stemDepthScore} indicators) → gpt-4o for depth`;
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

  // R548 (AWAKE V236 Ciclo 164): layout_hint — frontend rendering hint
  // Scientific basis: arXiv:2304.10878 (2023): "Structured output hints improve UI rendering"
  // Mapping: simple/general → chat, coding → code, complex_reasoning/research → analysis
  const layoutHintMap: Record<QueryCategory, 'chat' | 'code' | 'analysis' | 'document'> = {
    simple: 'chat',
    general: 'chat',
    coding: 'code',
    complex_reasoning: 'analysis',
    research: 'analysis',
  };
  // Override: if query contains document/report/slide keywords → 'document'
  const documentKeywords = /relatório|report|documento|document|pdf|slide|apresentação|presentation/i;
  const layout_hint: 'chat' | 'code' | 'analysis' | 'document' =
    documentKeywords.test(query) ? 'document' : layoutHintMap[category];

  return { category, model, confidence, reasoning,
    tier: tierMap[category], complexityScore: complexityScoreMap[category], confidenceScore: confidence,
    forceToolUse, actionScore, layout_hint };
}

export interface ComplexityAssessment {
  tier: string; complexityScore: number; confidenceScore: number; reasoning: string;
  forceToolUse: boolean; actionScore: number;
  layout_hint: 'chat' | 'code' | 'analysis' | 'document'; // R548 (AWAKE V236 Ciclo 164)
}
export type LLMTier = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4';

export function assessComplexity(query: string): ComplexityAssessment {
  const decision = classifyQuery(query);
  return { tier: decision.tier as LLMTier, complexityScore: decision.complexityScore,
    confidenceScore: decision.confidenceScore, reasoning: decision.reasoning,
    forceToolUse: decision.forceToolUse, actionScore: decision.actionScore,
    layout_hint: decision.layout_hint }; // R548 (AWAKE V236 Ciclo 164)
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
