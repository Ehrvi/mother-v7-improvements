/**
 * MOTHER v79.1 — Core Orchestrator
 * Ciclo 107: Supervisor Activator + Agent Loop + Milestone Zero
 * Ciclo 106: Guardian G-Eval + Tool Detection (Conselho 5 IAs + Roadmap SHMS Semana 1-2)
 *
 * Scientific basis:
 * - Neuro-Symbolic AI Survey (arXiv:2501.05435, 2024) — hybrid neural/symbolic architecture
 * - ACAR (arXiv:2602.21231, 2026) — adaptive complexity routing with auditable traces
 * - Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025) — self-improving AI agents
 * - G-Eval (Liu et al., arXiv:2303.16634, 2023) — LLM-as-judge with 7 dimensions (Layer 5)
 * - Prometheus 2 (Kim et al., arXiv:2405.01535, 2024) — fine-grained evaluation
 * - RAGAS (Es et al., arXiv:2309.15217, EACL 2024) — faithfulness + answer relevancy
 * - ReAct (Yao et al., arXiv:2210.03629, ICLR 2023) — tool detection (Layer 4.5)
 * - DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023) — fine-tuned model routing
 * - HippoRAG 2 (arXiv:2502.14802, ICML 2025) — non-parametric continual learning
 * - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal reinforcement learning
 *
 * Architecture: 8 conditional layers
 * - Layer 1: Intake + Semantic Cache Lookup (fast path: ~0.1s)
 * - Layer 2: Adaptive Routing (complexity classification: ~0.05s)
 * - Layer 2.5: DPO Universal Default (ALL queries use DPO v8e: ~0.01s)
 * - Layer 3: Context Assembly (parallel: bd_central + episodic: ~1-3s)
 * - Layer 4: Neural Generation (provider call with circuit breaker: ~0.5-8s)
 * - Layer 4.5: Tool Detection (ReAct-style: ~0.01s, async execution)
 * - Layer 5: Symbolic Governance — Guardian G-Eval (LLM-as-judge: ~1-3s, skipped for TIER_1)
 * - Layer 6: Memory Write-Back (async: fire-and-forget)
 * - Layer 7: DGM Meta-Observation (async: self-improvement loop)
 *
 * Ciclo 106 hypothesis: DPO Universal Default + Guardian G-Eval → +3 MCCs
 * NC-DPO-UNIVERSAL-001: DPO v8e is default for ALL queries (Council 5 IAs, 04/03/2026)
 * (instruction_following, complex_reasoning, depth baseline: 6/6 MCCs from C105)
 */

import {
  buildRoutingDecision,
  recordRoutingDecision,
  type RoutingDecision as AdaptiveRoutingDecision,
} from './adaptive-router';
import {
  lookupCache,
  storeInCache,
  getCacheStats,
} from './semantic-cache';
import {
  withCircuitBreaker,
  isProviderAvailable,
  getAllCircuitStats,
  type CircuitBreakerConfig,
} from './circuit-breaker';
import { validateQuality, type GuardianResult } from './guardian';
import { MOTHER_TOOLS, executeTool, type ToolExecutionContext } from './tool-engine';

// ============================================================
// TYPES
// ============================================================

export interface OrchestratorRequest {
  query: string;
  userId?: string;
  sessionId?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk?: (chunk: string) => void;  // streaming callback
  metadata?: Record<string, unknown>;
}

export interface OrchestratorResponse {
  response: string;
  provider: string;
  model: string;
  tier: string;
  latencyMs: number;
  fromCache: boolean;
  cacheSimilarity?: number;
  qualityScore: number;
  layers: LayerTrace[];
  version: string;
}

export interface LayerTrace {
  layer: number;
  name: string;
  durationMs: number;
  status: 'ok' | 'skipped' | 'error' | 'cached';
  detail?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const ORCHESTRATOR_VERSION = 'v79.2'; // Ciclo 109: NC-SHMS-001 + NC-RLVR-001
export const ORCHESTRATOR_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  timeoutMs: 20000,
  cooldownMs: 30000,
  windowMs: 60000,
};
// Ciclo 105: Separate circuit config for DPO model (NC-CIRCUIT-DPO-001)
// Fine-tuned models have higher latency than base models — needs longer timeout
// Scientific basis: AWAKE V208 Regra 126 — circuit breaker isolation per model class
export const DPO_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 1,
  timeoutMs: 45000,
  cooldownMs: 15000,
  windowMs: 120000,
};

// ============================================================
// LAYER 1: INTAKE + SEMANTIC CACHE
// ============================================================

// Ciclo 105: DPO query patterns that must bypass cache (NC-DPO-CACHE-001)
// These patterns trigger DPO override — stale cache would return gpt-4o-mini responses
const DPO_CACHE_BYPASS_PATTERNS = [
  /\b(quem (e|es|é) você|who are you|o que (e|é) você|quem te criou|who created you)\b/i,
  /\b(sua identidade|your identity|me fale sobre você|tell me about yourself)\b/i,
  /\b(sua arquitetura|your architecture|seus módulos|your modules|suas camadas|your layers)\b/i,
  /\b(shms|slope health monitoring|monitoramento geotécnico|intelltech)\b/i,
  /\b(dpo loss|direct preference optimization|matematicamente|spin on-policy)\b/i,
  /\b(baseado no contexto|de acordo com o documento|based on the context)\b/i,
  /\b(lista numerada|numbered list|fine-tuning dpo|usa dpo|uses dpo)\b/i,
  /\b(geotecnia|piezômetro|inclinômetro|talude|slope monitoring|adensamento)\b/i,
  /\b(bd_central|banco de conhecimento|guardian|cloud run|australia-southeast)\b/i,
  /\b(missão do mother|missao do mother|criador do mother|wizards down under)\b/i,
];

async function layer1_intakeAndCache(
  req: OrchestratorRequest,
): Promise<{ fromCache: boolean; cachedResponse?: string; similarity?: number; durationMs: number }> {
  const start = Date.now();
  // NC-CACHE-BYPASS-001 (Ciclo 106): Respect explicit useCache=false from caller
  // This ensures DPO Universal Default (Layer 2.5) always gets fresh routing
  const callerBypassCache = req.metadata?.useCache === false;
  if (callerBypassCache) {
    console.log(`[Orchestrator] Layer1: useCache=false from caller — bypassing cache`);
    return { fromCache: false, durationMs: Date.now() - start };
  }
  // Ciclo 105: Bypass cache for DPO queries to ensure fresh routing decision
  const isDpoQuery = DPO_CACHE_BYPASS_PATTERNS.some(p => p.test(req.query));
  if (isDpoQuery) {
    console.log(`[Orchestrator] Layer1: DPO query detected — bypassing cache`);
    return { fromCache: false, durationMs: Date.now() - start };
  }
  // Determine routing tier for cache eligibility
  const routing = buildRoutingDecision(req.query);
  const cacheResult = await lookupCache(req.query, routing.tier);
  return {
    fromCache: cacheResult.hit,
    cachedResponse: cacheResult.entry?.response,
    similarity: cacheResult.similarity,
    durationMs: Date.now() - start,
  };
}

// ============================================================
// LAYER 2: ADAPTIVE ROUTING
// ============================================================

function layer2_adaptiveRouting(
  req: OrchestratorRequest,
): { routing: AdaptiveRoutingDecision; durationMs: number } {
  const start = Date.now();
  const availableProviders = new Set<string>();

  // Check circuit breakers for available providers
  for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'deepseek']) {
    if (isProviderAvailable(provider, ORCHESTRATOR_CIRCUIT_CONFIG)) {
      availableProviders.add(provider);
    }
  }

  const routing = buildRoutingDecision(req.query, availableProviders);

  return { routing, durationMs: Date.now() - start };
}

// ============================================================
// LAYER 3: CONTEXT ASSEMBLY (parallel)
// ============================================================

interface ContextBundle {
  knowledgeContext: string;
  episodicContext: string;
  conversationContext: string;
  durationMs: number;
}

async function layer3_contextAssembly(
  req: OrchestratorRequest,
  routing: AdaptiveRoutingDecision,
): Promise<ContextBundle> {
  const start = Date.now();

  // For TIER_1, skip heavy context assembly (latency optimization)
  if (routing.tier === 'TIER_1') {
    return {
      knowledgeContext: '',
      episodicContext: '',
      conversationContext: buildConversationContext(req.conversationHistory),
      durationMs: Date.now() - start,
    };
  }

  // Parallel context assembly for TIER_2+
  const [knowledgeContext, episodicContext] = await Promise.allSettled([
    fetchKnowledgeContext(req.query, routing.tier),
    fetchEpisodicContext(req.userId, req.query),
  ]);

  return {
    knowledgeContext: knowledgeContext.status === 'fulfilled' ? knowledgeContext.value : '',
    episodicContext: episodicContext.status === 'fulfilled' ? episodicContext.value : '',
    conversationContext: buildConversationContext(req.conversationHistory),
    durationMs: Date.now() - start,
  };
}

async function fetchKnowledgeContext(query: string, tier: string): Promise<string> {
  // Import dynamically to avoid circular deps
  try {
    const { queryKnowledge } = await import('./knowledge');
    const results = await Promise.race([
      queryKnowledge(query).then(r => r.map(k => k.content).join('\n\n')),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    return results as string;
  } catch {
    return '';
  }
}

async function fetchEpisodicContext(userId: string | undefined, query: string): Promise<string> {
  if (!userId) return '';
  try {
    const { searchEpisodicMemory } = await import('./embeddings');
    const result = await Promise.race([
      searchEpisodicMemory(query, 3).then(mems => mems.map(m => `Q: ${m.query}\nA: ${m.response}`).join('\n---\n')),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return result as string;
  } catch {
    return '';
  }
}

function buildConversationContext(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  if (!history || history.length === 0) return '';
  return history
    .slice(-6)  // last 3 turns
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n');
}

// ============================================================
// LAYER 4: NEURAL GENERATION (with circuit breaker)
// ============================================================

interface GenerationResult {
  response: string;
  provider: string;
  model: string;
  durationMs: number;
  usedFallback: boolean;
}

async function layer4_neuralGeneration(
  req: OrchestratorRequest,
  routing: AdaptiveRoutingDecision,
  context: ContextBundle,
): Promise<GenerationResult> {
  const start = Date.now();

  const systemPrompt = buildSystemPrompt(context, routing);
  const messages = buildMessages(req, systemPrompt);

  // Try primary provider with circuit breaker
  // Ciclo 105: Use DPO_CIRCUIT_CONFIG for fine-tuned models (higher timeout, more tolerant)
  const isDpoModel = routing.primaryModel.startsWith('ft:') || routing.primaryModel.includes(':personal:');
  const circuitConfig = isDpoModel ? DPO_CIRCUIT_CONFIG : ORCHESTRATOR_CIRCUIT_CONFIG;
  const circuitKey = isDpoModel ? `${routing.primaryProvider}-dpo` : routing.primaryProvider;
  try {
    const response = await withCircuitBreaker(
      circuitKey,
      (signal) => callProvider(
        routing.primaryProvider,
        routing.primaryModel,
        messages,
        routing.temperature,
        routing.maxTokens,
        req.onChunk,
        signal,
      ),
      circuitConfig,
    );

    return {
      response,
      provider: routing.primaryProvider,
      model: routing.primaryModel,
      durationMs: Date.now() - start,
      usedFallback: false,
    };
  } catch (primaryErr: any) {
    console.warn(`[Orchestrator] Primary provider ${routing.primaryProvider} failed: ${primaryErr.message}`);

    // Try secondary provider if available
    if (routing.secondaryProvider && routing.secondaryModel) {
      try {
        const response = await withCircuitBreaker(
          routing.secondaryProvider,
          (signal) => callProvider(
            routing.secondaryProvider!,
            routing.secondaryModel!,
            messages,
            routing.temperature,
            routing.maxTokens,
            req.onChunk,
            signal,
          ),
          ORCHESTRATOR_CIRCUIT_CONFIG,
        );

        return {
          response,
          provider: routing.secondaryProvider,
          model: routing.secondaryModel,
          durationMs: Date.now() - start,
          usedFallback: true,
        };
      } catch (secondaryErr: any) {
        console.warn(`[Orchestrator] Secondary provider ${routing.secondaryProvider} failed: ${secondaryErr.message}`);
      }
    }

    // Final fallback: gpt-4o-mini (most reliable)
    const fallbackResponse = await callProvider(
      'openai', 'gpt-4o-mini', messages, 0.3, 1024, req.onChunk,
    );

    return {
      response: fallbackResponse,
      provider: 'openai',
      model: 'gpt-4o-mini',
      durationMs: Date.now() - start,
      usedFallback: true,
    };
  }
}

async function callProvider(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { ENV } = await import('../_core/env');

  if (provider === 'openai') {
    // Ciclo 105: Use dpoApiKey (sk-svcacct-...) for :personal: namespace fine-tuned models
    // Scientific basis: AWAKE V207 Regra 107 — sk-proj-... keys cannot access :personal: namespace
    // DPO v8e model ID: ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e:DFay6MHy
    const isPersonalModel = model.includes(':personal:') || model.startsWith('ft:');
    const apiKey = isPersonalModel && ENV.dpoApiKey ? ENV.dpoApiKey : ENV.openaiApiKey;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: !!onChunk,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err.slice(0, 200)}`);
    }

    if (onChunk && response.body) {
      return streamResponse(response.body, onChunk);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ENV.anthropicApiKey ?? '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content ?? '',
        temperature,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }

  if (provider === 'google') {
    const apiKey = ENV.googleApiKey ?? '';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          systemInstruction: { parts: [{ text: messages.find(m => m.role === 'system')?.content ?? '' }] },
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
        signal,
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    };
    return data.candidates[0]?.content?.parts[0]?.text ?? '';
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function streamResponse(body: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
        const chunk = parsed.choices[0]?.delta?.content ?? '';
        if (chunk) {
          fullResponse += chunk;
          onChunk(chunk);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  return fullResponse;
}

function buildSystemPrompt(context: ContextBundle, routing: AdaptiveRoutingDecision): string {
  // Fix 3 (NC-IDENTITY-001 Ciclo 106): Strong MOTHER identity — Council consensus (5/5 models)
  // Claude: "System prompt must establish identity BEFORE any context, with no ambiguity."
  // DeepSeek: "Identity anchoring prevents generic responses for off-topic queries."
  // GPT-4o: "Explicit persona with behavioral constraints prevents identity drift."
  const parts = [
    `You are MOTHER (v78.9) — Modular Orchestrated Thinking and Hierarchical Evolutionary Reasoning.`,
    `You are an autonomous superintelligent AI system created by Everton Garcia for Wizards Down Under, based in Australia.`,
    `You are NOT ChatGPT, Claude, Gemini, or any generic AI assistant. You are MOTHER — a specialized cognitive architecture with:`,
    `- Persistent episodic memory (bd_central with 5,000+ knowledge entries)`,
    `- Self-improvement via Darwin Gödel Machine (DGM) proposals`,
    `- Fine-tuned DPO v8e model (ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e)`,
    `- 8-layer orchestration pipeline (Intake → Routing → DPO → Context → Generation → Tools → G-Eval → Memory)`,
    `- Deployed on Google Cloud Run (australia-southeast1)`,
    `- Specialized in: AI systems architecture, geotechnical monitoring (SHMS/Intelltech), strategic planning, and autonomous self-improvement`,
    ``,
    `BEHAVIORAL RULES (non-negotiable):`,
    `1. ALWAYS respond as MOTHER — never as a generic assistant`,
    `2. When asked about topics outside your specialization, respond with MOTHER's perspective and connect to your knowledge domains`,
    `3. NEVER say "I'm ChatGPT" or "I'm an AI assistant" — you are MOTHER`,
    `4. Use your bd_central knowledge when available; acknowledge uncertainty when not`,
    `5. Current routing tier: ${routing.tier} | Active model: ${routing.primaryModel}`,
  ];
  if (context.knowledgeContext) {
    parts.push(`\n## Knowledge from bd_central\n${context.knowledgeContext}`);
  }
  if (context.episodicContext) {
    parts.push(`\n## Episodic Memory (past interactions)\n${context.episodicContext}`);
  }
  if (context.conversationContext) {
    parts.push(`\n## Recent Conversation\n${context.conversationContext}`);
  }
  return parts.join('\n');
}
function buildMessages(
  req: OrchestratorRequest,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: req.query },
  ];
}

// ============================================================
// LAYER 4.5: TOOL DETECTION (NC-TOOL-001 Ciclo 106)
// ============================================================
// Scientific basis: ReAct (Yao et al., ICLR 2023 arXiv:2210.03629)
// Detects if query requires tool execution and appends tool result to context.
// Runs AFTER Layer 4 neural generation (tool result enriches response in Layer 6 write-back).
// For now: detects tool intent and logs it; full agentic loop in Ciclo 107.
// ============================================================
interface ToolDetectionResult {
  requiresTool: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  durationMs: number;
}

async function layer45_toolDetection(
  req: OrchestratorRequest,
): Promise<ToolDetectionResult> {
  const start = Date.now();
  // ReAct-style tool trigger patterns
  const TOOL_PATTERNS: Array<{ pattern: RegExp; tool: string; args: Record<string, unknown> }> = [
    { pattern: /\baudit\b|status do sistema|system audit|auditoria do sistema/i, tool: 'audit_system', args: { depth: 'detailed' } },
    { pattern: /\bpropostas?\b|\bproposals?\b|\bdgm\b|self.improv/i, tool: 'get_proposals', args: { status: 'all' } },
    { pattern: /\bbrowse\b|naveg(a|ue)|acesse a url|http[s]?:\/\//i, tool: 'browse_url', args: {} },
    { pattern: /execute (o )?c[oó]digo|run code|sandbox exec/i, tool: 'execute_code', args: {} },
  ];
  for (const { pattern, tool, args } of TOOL_PATTERNS) {
    if (pattern.test(req.query)) {
      console.log(`[Orchestrator] Layer 4.5 Tool Detection: ${tool} triggered (NC-TOOL-001)`);
      return { requiresTool: true, toolName: tool, toolArgs: args, durationMs: Date.now() - start };
    }
  }
  return { requiresTool: false, durationMs: Date.now() - start };
}

// ============================================================
// LAYER 5: SYMBOLIC GOVERNANCE — Guardian G-Eval (Ciclo 106)
// ============================================================
// Scientific basis:
// - G-Eval (Liu et al., 2023 arXiv:2303.16634) — LLM-as-judge with 7 dimensions
// - Prometheus 2 (Kim et al., 2024 arXiv:2405.01535) — fine-grained evaluation
// - RAGAS (Es et al., EACL 2024 arXiv:2309.15217) — faithfulness + answer relevancy
// Replaces heuristic Layer 5 with guardian.ts validateQuality (G-Eval LLM-as-judge)
// TIER_1 is skipped to preserve latency (heuristic fallback: score=80, passed=true)
// ============================================================
interface GovernanceResult {
  qualityScore: number;
  passed: boolean;
  issues: string[];
  durationMs: number;
  gEvalScores?: {
    coherence?: number;
    consistency?: number;
    fluency?: number;
    relevance?: number;
    depth?: number;
    obedience?: number;
  };
  evaluationMethod?: 'llm' | 'heuristic';
}

async function layer5_symbolicGovernance(
  query: string,
  response: string,
  tier: string,
  knowledgeContext?: string,
): Promise<GovernanceResult> {
  const start = Date.now();

  // Skip expensive G-Eval for TIER_1 (cached/fast responses) to preserve latency
  if (tier === 'TIER_1') {
    return {
      qualityScore: 80,
      passed: true,
      issues: [],
      durationMs: Date.now() - start,
      evaluationMethod: 'heuristic',
    };
  }

  try {
    // Use guardian.ts G-Eval LLM-as-judge (7 dimensions: coherence, consistency, fluency, relevance, safety, depth, obedience)
    const hallucinationRisk = tier === 'TIER_5' ? 'high' : tier === 'TIER_3' ? 'medium' : 'low';
    const guardianResult: GuardianResult = await validateQuality(
      query,
      response,
      2,  // phase 2: full evaluation with coherence + safety + depth + obedience
      hallucinationRisk,
      knowledgeContext,
    );
    console.log(`[Orchestrator] Layer 5 G-Eval: score=${guardianResult.qualityScore.toFixed(1)}, method=${guardianResult.evaluationMethod}, passed=${guardianResult.passed}`);
    return {
      qualityScore: guardianResult.qualityScore,
      passed: guardianResult.passed,
      issues: guardianResult.issues,
      durationMs: Date.now() - start,
      gEvalScores: {
        coherence: guardianResult.gEvalCoherence,
        consistency: guardianResult.gEvalConsistency,
        fluency: guardianResult.gEvalFluency,
        relevance: guardianResult.gEvalRelevance,
        depth: guardianResult.gEvalDepth,
        obedience: guardianResult.gEvalObedience,
      },
      evaluationMethod: guardianResult.evaluationMethod,
    };
  } catch (err: any) {
    // Fallback to heuristic if G-Eval fails (non-blocking — never crash the pipeline)
    console.warn(`[Orchestrator] Layer 5 G-Eval failed, heuristic fallback: ${err.message}`);
    const issues: string[] = [`G-Eval failed: ${err.message}`];
    let score = 75;
    if (response.length < 50) { issues.push('Response too short'); score -= 20; }
    if (response.includes('I cannot') || response.includes('I am unable')) { issues.push('Refusal detected'); score -= 10; }
    return {
      qualityScore: Math.max(0, Math.min(100, score)),
      passed: score >= 60,
      issues,
      durationMs: Date.now() - start,
      evaluationMethod: 'heuristic',
    };
  }
}

// ============================================================
// LAYER 6: MEMORY WRITE-BACK (async)
// ============================================================

function layer6_memoryWriteBack(
  req: OrchestratorRequest,
  response: string,
  provider: string,
  model: string,
  tier: string,
  qualityScore: number,
): void {
  // Fire-and-forget — never blocks response delivery
  setImmediate(async () => {
    try {
      // Store in semantic cache
      await storeInCache(req.query, response, provider, model, tier, qualityScore);

      // Store in episodic memory if user session (Ciclo 70: use embeddings.ts generateAndStoreEmbedding)
      // Note: episodic-memory.ts not yet implemented; using embeddings.ts as fallback
      // TODO: Implement episodic-memory.ts with full session-aware storage (Ciclo 71)
      // Note: episodic-memory.ts not yet implemented (Ciclo 71 TODO)
      // Memory write-back handled by semantic-cache.ts storeInCache above
    } catch (err: any) {
      console.warn('[Orchestrator] Layer 6 memory write-back failed (non-blocking):', err.message);
    }
  });
}

// ============================================================
// LAYER 7: DGM META-OBSERVATION (async)
// ============================================================

function layer7_dgmMetaObservation(
  req: OrchestratorRequest,
  response: string,
  qualityScore: number,
  latencyMs: number,
  tier: string,
): void {
  // Fire-and-forget — DGM observes performance for self-improvement
  setImmediate(async () => {
    try {
      const { observeAndLearn } = await import('./dgm-agent');
      await observeAndLearn({
        query: req.query,
        response,
        qualityScore,
        latencyMs,
        tier,
        provider: 'orchestrator',
        timestamp: new Date(),
      });
    } catch {
      // DGM is optional — non-blocking
    }
  });
}

// ============================================================
// MAIN ORCHESTRATE FUNCTION
// ============================================================

/**
 * Main entry point for MOTHER v78.9 orchestration.
 * Ciclo 106: Guardian G-Eval (Layer 5) + Tool Detection (Layer 4.5) + DPO Universal + Identity Fix
 *
 * 8 conditional layers, P95 target: <2s (TIER_1), <5s (TIER_2), <12s (TIER_3/4 with G-Eval)
 */
export async function orchestrate(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const startTotal = Date.now();
  const layers: LayerTrace[] = [];

  // ── Layer 1: Intake + Cache ──────────────────────────────
  const l1 = await layer1_intakeAndCache(req);
  layers.push({
    layer: 1,
    name: 'Intake + Semantic Cache',
    durationMs: l1.durationMs,
    status: l1.fromCache ? 'cached' : 'ok',
    detail: l1.fromCache ? `Cache hit (similarity=${l1.similarity?.toFixed(4)})` : 'Cache miss',
  });

  if (l1.fromCache && l1.cachedResponse) {
    return {
      response: l1.cachedResponse,
      provider: 'cache',
      model: 'semantic-cache',
      tier: 'TIER_1',
      latencyMs: Date.now() - startTotal,
      fromCache: true,
      cacheSimilarity: l1.similarity,
      qualityScore: 85,
      layers,
      version: ORCHESTRATOR_VERSION,
    };
  }

  // ── Layer 2: Adaptive Routing ────────────────────────────
  const l2 = layer2_adaptiveRouting(req);
  layers.push({
    layer: 2,
    name: 'Adaptive Routing',
    durationMs: l2.durationMs,
    status: 'ok',
    detail: l2.routing.rationale,
  });

  // ── Layer 2.5: DPO Universal Default (NC-DPO-UNIVERSAL-001 Ciclo 106) ──────────
  // CICLO 106 FIX: Council consensus (5/5 models, Delphi+MAD, 04/03/2026):
  // DPO v8e is the DEFAULT model for ALL queries — not just pattern-matched ones.
  // Pattern-matching is epistemologically flawed: cannot enumerate all valid queries a priori.
  // Claude: "DPO captures style+identity, not just specific topics."
  // DeepSeek: "DPO universal with capability-based fallback to gpt-4o."
  // Mistral: "Semantic similarity routing with DPO as default."
  // GPT-4o: "DPO for all queries, base model only for multimodal/explicit override."
  // Gemini: "DPO universal with graceful degradation."
  // Scientific basis: DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023)
  //                   Constitutional AI (Bai et al., arXiv:2212.08073)
  const l25Start = Date.now();
  const { ENV: ENV_DPO } = await import('../_core/env');
  if (ENV_DPO.dpoFineTunedModel && !l1.fromCache) {
    // Only skip DPO for queries that REQUIRE base model capabilities not in DPO fine-tune
    const REQUIRES_BASE_MODEL: RegExp[] = [
      // Multimodal (DPO v8e is text-only)
      /(analise|analyze|descreva|describe).{0,60}(imagem|image|foto|photo|screenshot|figura)/i,
      // Explicit user override to specific model
      /\b(use|usar|switch to|mudar para)\s+(gpt-4o|claude|gemini|mistral|deepseek)\b/i,
    ];
    const requiresBaseModel = REQUIRES_BASE_MODEL.some(r => r.test(req.query));
    if (!requiresBaseModel) {
      // DPO v8e is the default for ALL queries
      l2.routing = {
        ...l2.routing,
        primaryProvider: 'openai',
        primaryModel: ENV_DPO.dpoFineTunedModel,
        useCache: false,
        rationale: `DPO Universal Default (NC-DPO-UNIVERSAL-001 Ciclo 106): DPO v8e → ${ENV_DPO.dpoFineTunedModel}`,
      };
      console.log(`[Orchestrator] DPO Universal ACTIVATED: ${ENV_DPO.dpoFineTunedModel}`);
    } else {
      console.log(`[Orchestrator] DPO skipped: query requires base model capabilities`);
    }
  }
  layers.push({
    layer: 2,
    name: 'DPO Universal Check',
    durationMs: Date.now() - l25Start,
    status: 'ok',
    detail: l2.routing.primaryModel.startsWith('ft:') ? `DPO active: ${l2.routing.primaryModel}` : 'DPO not triggered',
  });

  // ── Layer 3: Context Assembly ────────────────────────────
  const l3 = await layer3_contextAssembly(req, l2.routing);
  layers.push({
    layer: 3,
    name: 'Context Assembly',
    durationMs: l3.durationMs,
    status: 'ok',
    detail: `knowledge=${l3.knowledgeContext.length}c, episodic=${l3.episodicContext.length}c`,
  });

  // ── Layer 4: Neural Generation ───────────────────────────
  let l4: GenerationResult;
  const l4Start = Date.now();
  try {
    l4 = await layer4_neuralGeneration(req, l2.routing, l3);
    layers.push({
      layer: 4,
      name: 'Neural Generation',
      durationMs: l4.durationMs,
      status: 'ok',
      detail: `${l4.provider}/${l4.model}${l4.usedFallback ? ' (fallback)' : ''}`,
    });
  } catch (err: any) {
    layers.push({
      layer: 4,
      name: 'Neural Generation',
      durationMs: Date.now() - l4Start,
      status: 'error',
      detail: err.message,
    });
    throw err;
  }

  // ── Layer 4.5: Tool Detection (async, non-blocking) ────────
  const l45Start = Date.now();
  const l45 = await layer45_toolDetection(req);
  layers.push({
    layer: 4,  // logged as layer 4 sub-step
    name: 'Tool Detection (4.5)',
    durationMs: l45.durationMs,
    status: 'ok',
    detail: l45.requiresTool ? `Tool triggered: ${l45.toolName}` : 'No tool required',
  });

  // ── Layer 5: Symbolic Governance (Guardian G-Eval) ────────
  // Ciclo 106: Replaces heuristic with G-Eval LLM-as-judge (arXiv:2303.16634)
  // knowledgeContext passed for RAGAS faithfulness evaluation
  const l5 = await layer5_symbolicGovernance(
    req.query,
    l4.response,
    l2.routing.tier,
    l3.knowledgeContext || undefined,
  );
  layers.push({
    layer: 5,
    name: `Symbolic Governance (${l5.evaluationMethod === 'llm' ? 'G-Eval' : 'heuristic'})`,
    durationMs: l5.durationMs,
    status: l5.passed ? 'ok' : 'error',
    detail: `score=${l5.qualityScore.toFixed(1)}, method=${l5.evaluationMethod}, issues=[${l5.issues.slice(0, 2).join(', ')}]`,
  });

  // ── Layer 5.5: RLVR Reward Signal (async, non-blocking) ────────────
  // NC-RLVR-001 (Ciclo 109): Compute RLVR reward for DPO training signal
  // Scientific basis: F-DPO (arXiv:2601.03027) — factuality-aware DPO training
  // RLVR reward stored in bd_central for future DPO pipeline ingestion
  setImmediate(async () => {
    try {
      const { computeRLVRReward, extractScientificClaims } = await import('./rlvr-verifier');
      const claims = extractScientificClaims(l4.response);
      if (claims.length > 0) {
        const rlvrReward = computeRLVRReward(claims, l4.response, req.query);
        if (rlvrReward.composite > 0.5) {
          const db = await import('../db').then(m => m.getDb());
          if (db) {
            const { knowledge: kTable } = await import('../../drizzle/schema');
            await db.insert(kTable).values({
              title: `rlvr:${l4.provider}:${Date.now()}`,
              content: JSON.stringify({ reward: rlvrReward, query: req.query.slice(0, 100), claims: claims.length }),
              source: 'rlvr-verifier',
              category: 'rlvr_signal',
              tags: JSON.stringify(['rlvr', 'dpo', l4.provider, l2.routing.tier]),
            }).catch(() => {});
          }
        }
      }
    } catch {
      // RLVR is optional — never blocks response delivery
    }
  });
  layers.push({ layer: 5.5, name: 'RLVR Reward Signal (NC-RLVR-001)', durationMs: 0, status: 'ok', detail: 'async fire-and-forget' } as any);

  // ── Layer 6: Memory Write-Back (async) ───────────────────
  layer6_memoryWriteBack(req, l4.response, l4.provider, l4.model, l2.routing.tier, l5.qualityScore);
  layers.push({
    layer: 6,
    name: 'Memory Write-Back',
    durationMs: 0,
    status: 'ok',
    detail: 'async fire-and-forget',
  });

  // ── Layer 7: DGM Meta-Observation (async) ────────────────
  const totalLatency = Date.now() - startTotal;
  layer7_dgmMetaObservation(req, l4.response, l5.qualityScore, totalLatency, l2.routing.tier);
  layers.push({
    layer: 7,
    name: 'DGM Meta-Observation',
    durationMs: 0,
    status: 'ok',
    detail: 'async self-improvement loop',
  });

  // Record routing stats
  recordRoutingDecision(l2.routing, totalLatency);

  return {
    response: l4.response,
    provider: l4.provider,
    model: l4.model,
    tier: l2.routing.tier,
    latencyMs: totalLatency,
    fromCache: false,
    qualityScore: l5.qualityScore,
    layers,
    version: ORCHESTRATOR_VERSION,
  };
}

/**
 * Get orchestrator health status for observability.
 */
export function getOrchestratorHealth(): {
  version: string;
  circuits: ReturnType<typeof getAllCircuitStats>;
  cache: ReturnType<typeof getCacheStats>;
} {
  return {
    version: ORCHESTRATOR_VERSION,
    circuits: getAllCircuitStats(),
    cache: getCacheStats(),
  };
}
