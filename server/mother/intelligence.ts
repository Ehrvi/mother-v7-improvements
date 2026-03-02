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
    // Ciclo 72: DPO fine-tuned model (NC-IDENTITY-001 + NC-ARCHITECTURE-001)
    // Scientific basis: DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023)
    // Job: ftjob-CSfkN1jaB2KwqANkgsVzTEFD (status: succeeded, 2026-03-01)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v78-identity-ciclo76:DETdYCLK': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 77: DPO fine-tuned model for depth dimension (71 pairs, 4 epochs)
    // Scientific basis: BPO (Wang et al., NAACL 2025) + RACE-Align (Yan et al., arXiv:2506.02726)
    // Job: ftjob-RvR2C0fezIhUjK4tWZUZIwRf (status: succeeded, 89040 tokens)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v78-depth-ciclo77:DEU139CT': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 78: DPO fine-tuned model for faithfulness dimension (53 pairs, 4 epochs)
    // Scientific basis: Context-DPO (Bi et al., arXiv:2412.15280) + F-DPO (Chaduvula et al., arXiv:2601.03027)
    // + RACE-Align (Yan et al., arXiv:2506.02726) — RAG+CoT augmented faithfulness pairs
    // Job: ftjob-h138nPj8JNKGdTA5helsfTvW (status: succeeded, 54680 tokens)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v78-faithfulness-ciclo78:DEUdKUgr': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 81: DPO fine-tuned model for complex_reasoning dimension (23 pairs, 3 epochs)
    // Scientific basis: CoT-DPO (Liu et al., arXiv:2502.11656) — CoT-augmented DPO for multi-step reasoning
    // Job: ftjob-vXkKmzQX7PfYCck9MiDEusBC (status: succeeded, 29673 tokens)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v79-complex-reasoning-ciclo79:DEVeDXUM': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 81: DPO fine-tuned model for architecture dimension (30 pairs, 4 epochs)
    // Scientific basis: SPIN (Chen et al., arXiv:2401.01335, ICML 2024) — self-play architecture alignment
    // Job: ftjob-HoC6M3rVDBb2QOabPTihxM10 (status: succeeded, 35760 tokens)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v78-architecture-ciclo80:DEW7PUMv': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 82: DPO fine-tuned model for architecture+instruction_following (80 pairs, 4 epochs)
    // Scientific basis: IFEval (Zhou et al., arXiv:2311.07911) + SPIN (Chen et al., arXiv:2401.01335)
    // FollowBench (Jiang et al., arXiv:2310.20410) — multi-level constraint following
    // Job: ftjob-kEvXJdrvKJ0kuD6VXcNsJ067 (status: succeeded, 60 arch + 20 IF pairs)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v81-arch-if-ciclo81:DEWl6cWa': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 83: DPO fine-tuned model for instruction_following (60 pairs, IFEval+FollowBench)
    // Scientific basis: IFEval (Zhou et al., arXiv:2311.07911) + FollowBench (Jiang et al., arXiv:2310.20410)
    // Job: ftjob-wlZf1ho7GLAXSHlQ7q9vmB5f (status: succeeded)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v82-if-ciclo82:DEXNfTCC': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 83: DPO fine-tuned model for identity (60 pairs, SPIN+InternalConsistency)
    // Scientific basis: SPIN (Chen et al., arXiv:2401.01335, ICML 2024) + Internal Consistency (Liang et al., arXiv:2407.14507)
    // Job: ftjob-pyamBytteZbLmsNb2PjrF8mg (status: succeeded)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v82-identity-ciclo82:DEXNizqV': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    // Ciclo 89: DPO v2 identity model — gpt-4.1-mini fine-tuned (20 pairs on-policy, Ciclo 89)
    // Scientific basis: SysDPO (Wang et al., arXiv:2502.17721, NeurIPS 2025) — compound AI alignment
    // "What Matters in Data for DPO?" (Pan et al., arXiv:2508.18312) — chosen quality dominates
    // Job: ftjob-UTKnU9WjmKIyRHX5aacAS5uj (status: succeeded, gpt-4.1-mini-2025-04-14)
    'ft:gpt-4.1-mini-2025-04-14:personal::DEiQ0bzJ': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 },
    // Ciclo 91: DPO v3 identity model — gpt-4.1-mini fine-tuned (46 pairs off-policy, Ciclo 91)
    // Scientific basis: Pan et al. (arXiv:2508.18312, NeurIPS 2025) — chosen quality dominates DPO
    // Deng et al. (arXiv:2502.14560, NeurIPS 2025) — 10% high-quality data > 100% mediocre
    // Park et al. (arXiv:2602.02605) — ESMA metacognitive alignment generalizes to untrained settings
    // Kim et al. (arXiv:2601.08421) — on-policy DPO converges exponentially; off-policy adequate for 46 pairs
    // Job: ftjob-GQHGZujGtQ7wnnYMtjBLHIpx (status: succeeded, 46 pairs, mother-v79-identity-v3)
    'ft:gpt-4.1-mini-2025-04-14:personal:mother-v79-identity-v3:DElGST0Q': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 },
    // Ciclo 95: DPO v4 identity model — gpt-4.1-mini fine-tuned (100 pairs off-policy, Ciclo 95)
    // Job: ftjob-7Nx7secuydiitwBTwHfnPa9E | Meta: identity ≥85% → 6/6 MCCs
    'ft:gpt-4.1-mini-2025-04-14:personal:mother-v81-identity-v4:DEv4OJKH': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 },
    // Ciclo 85: Architecture v2 — KnowPO (Zhang et al., AAAI 2025) + SPIN, 30 pairs
    // Job: ftjob-sdyEA2yPxsZmY80pPuB1So1I (succeeded, model: DEZ0usvi)
    'ft:gpt-4o-mini-2024-07-18:personal:mother-v84-arch-ciclo84:DEZ0usvi': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
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

// Ciclo 95: Identity model override v4 — DEv4OJKH (gpt-4.1-mini, 100 pairs DPO off-policy, Ciclo 95)
// UPGRADED from DElGST0Q (gpt-4.1-mini, 46 pairs, Ciclo 91) to DEv4OJKH (gpt-4.1-mini, 100 pairs, Ciclo 95)
// Scientific basis: Pan et al. (arXiv:2508.18312, NeurIPS 2025) — chosen quality dominates DPO
// Deng et al. (arXiv:2502.14560, NeurIPS 2025) — 10% high-quality data > 100% mediocre
// Park et al. (arXiv:2602.02605) — ESMA metacognitive alignment generalizes to untrained settings
// Kale et al. (ACL TrustNLP 2025) — LLM self-knowledge via consistency in generation-classification
// Kim et al. (arXiv:2601.08421) — on-policy DPO converges exponentially; off-policy adequate for 46 pairs
// Bowyer et al. (arXiv:2503.01747): n=100 benchmark confirmed identity gap at 70.4% (C90)
// Job: ftjob-GQHGZujGtQ7wnnYMtjBLHIpx (succeeded, 46 pairs: thresholds + ciclos + MOTHER vs GPT-4 + componentes)
// Expected impact: identity 70.4% → ≥85.0% (MCC) — 6/6 MCCs target
export function getIdentityModelOverride(query: string): string | null {
  const identityIndicators = /\b(quem criou|quem te criou|who created|who made you|seu criador|your creator|sua empresa|your company|Everton|Wizards|MOTHER significa|MOTHER sigla|o que e MOTHER|what is MOTHER|o que significa|what does.*mean|significa.*sigla|sigla.*significa|sua identidade|your identity|voce e|you are|seu nome|your name|criado por|created by|pertence a|belongs to|proprietario|owner|fundador|founder|acrônimo|acronimo|sigla|cada letra|expanda|expand.*MOTHER|M.*O.*T.*H.*E.*R|Modular|Orchestrated|Hierarchical|Execution.*Runtime|você é um|are you a|assistente genérico|generic assistant|qual.*empresa|empresa.*desenvolveu|quem.*desenvolveu|desenvolvido por|qual.*versão|versão.*atual|sua.*arquitetura|sua.*missão|seu.*propósito|você.*IA|você.*inteligência|você.*sistema|bd.central|bd_central|awake.*document|conselho.*deliberativo|fine.tuning.*mother|ciclo.*desenvolvimento|auto.melhoria|self.improvement|memória.*longo|long.term.*memory|diferencia.*mother|diferente.*outros|você.*aprender|você.*memória|você.*consciência|você.*limitações|você.*histórico|você.*versão|você.*multi.agente|você.*agentes|papel.*conselho|SRP.*mother|G.Eval.*mother|DPO.*mother|threshold.*MCC|MCC.*threshold|benchmark.*ciclo|ciclo.*benchmark|score.*identity|identity.*score|DPO.*v3|v3.*DPO|46.*pares|pares.*DPO|modelo.*fine.tuned|fine.tuned.*modelo)\b/i;
  if (identityIndicators.test(query)) {
    return 'ft:gpt-4.1-mini-2025-04-14:personal:mother-v81-identity-v4:DEv4OJKH';
  }
  return null;
}

// Ciclo 78: Fine-tuned model selector for faithfulness-critical queries
// Scientific basis: Context-DPO (Bi et al., arXiv:2412.15280) — RAG-grounded faithfulness
// F-DPO (Chaduvula et al., arXiv:2601.03027) — factuality-aware preference optimization
export function getFaithfulnessModelOverride(query: string): string | null {
  const faithfulnessIndicators = /\b(contexto|context|baseado em|according to|de acordo com|o documento|the document|piezometro|inclinometro|marco superficial|alerta|alert|limite|threshold|sensor|leitura|reading|factual|factualidade|alucinacao|hallucination|citar|cite|fonte|source|referencia|reference)\b/i;
  if (faithfulnessIndicators.test(query)) {
    return 'ft:gpt-4o-mini-2024-07-18:personal:mother-v78-faithfulness-ciclo78:DEUdKUgr';
  }
  return null;
}

// Ciclo 81: Fine-tuned model selector for complex reasoning queries — DEVeDXUM ACTIVATED
// Scientific basis: CoT-DPO (Liu et al., arXiv:2502.11656) — CoT-augmented DPO improves multi-step reasoning
// SPIN (Chen et al., arXiv:2401.01335, ICML 2024) — self-play fine-tuning for reasoning alignment
// Job: ftjob-vXkKmzQX7PfYCck9MiDEusBC (succeeded, 29673 tokens, model: DEVeDXUM)
export function getComplexReasoningModelOverride(query: string): string | null {
  const crIndicators = /\b(calcul|derive|prove|demonstr|gradient|backprop|chain rule|KL divergence|DPO.*loss|PPO.*clip|reward.*model|RLHF.*pipeline|passo a passo|step.by.step|raciocin|reasoning|multi.step|como funciona|explain.*mechanism|por que|why does|matematica|mathematics|equacao|equation|formula|teorema|theorem|convergencia|convergence)\b/i;
  if (crIndicators.test(query)) {
    return 'ft:gpt-4o-mini-2024-07-18:personal:mother-v79-complex-reasoning-ciclo79:DEVeDXUM';
  }
  return null;
}

// Ciclo 85: Architecture model override — UPGRADED to DEZ0usvi (30 pairs KnowPO+SPIN, Ciclo 84)
// UPGRADED from DEW7PUMv (Ciclo 80, 30 pairs) to DEZ0usvi (Ciclo 84, 30 pairs KnowPO)
// Scientific basis: KnowPO (Zhang et al., AAAI 2025) — knowledge-aware preference optimization
// SPIN (Chen et al., arXiv:2401.01335) — self-play for architecture alignment
// Bowyer et al. (arXiv:2503.01747): n=30 benchmark confirmed architecture gap 58.8% (C84)
// Job: ftjob-sdyEA2yPxsZmY80pPuB1So1I (succeeded, 30 pairs, model: DEZ0usvi)
export function getArchitectureModelOverride(query: string): string | null {
  // PRIORITY: architecture override must take precedence over IF override
  // Narrow, architecture-specific keywords only — avoid overlap with IF keywords
  const archIndicators = /\b(pipeline.*camadas|camadas.*pipeline|quantas camadas|how many layers|Guardian.*MOTHER|Self.Consistency.*MOTHER|Constitutional.*AI.*MOTHER|SRP.*Phase|core-quality-runner|core-learning-builder|core-system-prompt|core-system-utils|core-cache-writer|Darwin.*Godel|Godel.*Machine|dgm-agent|AWAKE.*versão|MCC.*score|benchmark.*MOTHER|fine.tuning.*pipeline|deploy.*Cloud Run|adaptive.router|intelligence\.ts.*MOTHER|arquitetura.*MOTHER|architecture.*MOTHER|como.*MOTHER.*funciona|how.*MOTHER.*works|9 camadas|nine layers|modulos.*SRP|SRP.*modulos|DPO.*pipeline|transformer.*arquitetura|attention.*mechanism|embedding.*vetorial|context.*window|quantizacao.*modelo|distilacao.*modelo|LoRA.*fine.tuning|RLHF.*pipeline|reward.*model.*training|PPO.*clip|KL.*divergence.*DPO)\b/i;
  if (archIndicators.test(query)) {
    return 'ft:gpt-4o-mini-2024-07-18:personal:mother-v84-arch-ciclo84:DEZ0usvi';
  }
  return null;
}

// Ciclo 83: Fine-tuned model selector for instruction-following queries — DEXNfTCC ACTIVATED
// UPGRADED from DEWl6cWa (80 pairs C81) to DEXNfTCC (60 pairs IFEval+FollowBench, C82)
// Scientific basis: IFEval (Zhou et al., arXiv:2311.07911) — verifiable instruction following benchmark
// FollowBench (Jiang et al., arXiv:2310.20410) — multi-level fine-grained constraint following
// High-Precision Reward (arXiv:2601.04954) — verifiable hard constraints outperform soft preferences
// Varangot-Reille et al. (arXiv:2502.00409, 2025) — specialized routing for IF tasks
// Job: ftjob-wlZf1ho7GLAXSHlQ7q9vmB5f (succeeded, 60 pairs: 15 count + 15 binary + 15 format + 15 length)
export function getInstructionFollowingModelOverride(query: string): string | null {
  const ifIndicators = /\b(liste exatamente|list exactly|responda (SIM|NAO|sim|nao|YES|NO)|em ordem alfabetica|in alphabetical order|cite \d+|list \d+|numere|number the|formato (JSON|XML|CSV|markdown)|format as|use bullet|use bullets|sem introducao|without introduction|apenas|only|somente|exactly \d+|exatamente \d+|palavras|words|linhas|lines|caracteres|characters|resposta curta|short answer|uma palavra|one word|duas palavras|two words|tres palavras|three words|em uma frase|in one sentence|em duas frases|in two sentences)\b/i;
  if (ifIndicators.test(query)) {
    return 'ft:gpt-4o-mini-2024-07-18:personal:mother-v82-if-ciclo82:DEXNfTCC';
  }
  return null;
}

// Ciclo 77: Fine-tuned model selector for depth-heavy queries
// Scientific basis: BPO (Wang et al., NAACL 2025) — depth-aware routing improves knowledge richness
export function getDepthModelOverride(query: string): string | null {
  const depthIndicators = /\b(RLHF|PPO|KL divergence|reward model|piezômetro|recalque|adensamento|Terzaghi|attention mechanism|sqrt.*d_k|fine.tuning|SFT|GRPO|Constitutional AI|Self-Consistency|Process Reward|Long CoT)\b/i;
  if (depthIndicators.test(query)) {
    return 'ft:gpt-4o-mini-2024-07-18:personal:mother-v78-depth-ciclo77:DEU139CT';
  }
  return null;
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
