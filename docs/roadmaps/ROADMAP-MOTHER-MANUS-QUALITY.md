# ROADMAP: MOTHER Chat Quality → Nível MANUS (ou superior)

**Data:** 2026-03-12
**Versão atual MOTHER:** v122.26
**Benchmark de qualidade:** MANUS 1.6 (Meta/Monica.im)
**Objetivo:** Chat/respostas de MOTHER tão boas quanto MANUS, ou melhores.

---

## Diagnóstico: Por que MANUS é superior hoje?

### O que MANUS faz melhor que MOTHER em chat/respostas:

| Dimensão | MANUS | MOTHER Atual | Gap |
|----------|-------|-------------|-----|
| **TTFT (Time to First Token)** | <500ms (streaming imediato) | 1-3s (routing + context assembly antes de gerar) | MOTHER demora a "começar a falar" |
| **Qualidade na primeira tentativa** | Alta — prompt engineering + planning antes de gerar | Média — gera primeiro, depois tenta consertar com Self-Refine + Constitutional AI | MOTHER desperdiça latência consertando ao invés de acertar de primeira |
| **Profundidade de resposta** | Formal, profunda, citada | Variável — depende do tier routing | MOTHER às vezes dá respostas rasas em TIER_1 |
| **Citações e verificação** | Cita em tempo real, verifica cross-source | Post-generation via Citation Engine (semântico ≥2) | MOTHER cita tardiamente e nem sempre |
| **Planejamento** | Cria plano explícito antes de executar | Sem planejamento — pipeline sequencial cego | MOTHER não "pensa antes de falar" |
| **Closed-loop verification** | Cada ação verificada imediatamente | Verificação só no fim (Guardian pós-geração) | MOTHER pode acumular erros ao longo do pipeline |
| **Context window management** | Event stream + compression inteligente | Tudo carregado no contexto (sem compressão) | Context overflow em conversas longas |
| **Latência total** | ~4s para chat simples | 3-15s (simples) / 15-50s (complexo) | MOTHER 2-5x mais lenta |
| **Formato de resposta** | Consistente, bem estruturado | Inconsistente entre tiers/providers | Provider lottery: Gemini vs GPT vs Claude formatam diferente |

### O que MOTHER já faz melhor que MANUS:

| Dimensão | MOTHER | MANUS |
|----------|--------|-------|
| **Memória de longo prazo** | Episodic memory + user memory + knowledge graph | Event stream truncado + todo.md |
| **Auto-aperfeiçoamento** | DGM + DPO/ORPO fine-tuning + SWE agent | Não se auto-modifica |
| **Multi-provider resilience** | 5 providers com circuit breaker | Claude 3.5 + Qwen (2 providers) |
| **Domínio científico** | CRAG pipeline + arXiv ingestion + 100+ papers | RAG genérico |
| **Auditabilidade** | Audit trail completo, per-layer tracing | Observabilidade limitada |

---

## Roadmap: 5 Fases

### FASE 0: Fundação — Limpeza e Estabilização
**Objetivo:** Reduzir complexidade para que as mudanças subsequentes sejam seguras.
**Duração estimada:** 1 sessão
**Risco:** Baixo

#### 0.1 — Limpar imports mortos do core.ts
- Remover os ~30 imports comentados com `// C319 hygiene`
- Remover imports que existem mas nunca são chamados no corpo do arquivo
- **Critério de sucesso:** `tsc --noEmit` passa, zero imports comentados

#### 0.2 — Remover arquivos duplicados de ciclos
- Consolidar `hipporag2-indexer-c196.ts`, `c201.ts`, `c204.ts`, `c207.ts` → manter apenas o mais recente
- Consolidar `dgm-cycle2-sprint84.ts`, `dgm-cycle3-sprint85.ts`, `dgm-cycle3.ts` → manter último
- Verificar que nenhum import referencia os arquivos removidos
- **Critério de sucesso:** `tsc --noEmit` passa, ~20 arquivos removidos

#### 0.3 — Organizar documentação
- Criar `docs/awake/`, `docs/roadmaps/`, `docs/conselhos/`
- Mover os ~130 .md da raiz para subdiretórios apropriados
- Manter na raiz apenas: README.md, CHANGELOG.md, DESIGN.md
- **Critério de sucesso:** Raiz do projeto com <10 arquivos .md

#### 0.4 — Verificar integridade
- Rodar `pnpm build` e `pnpm test`
- Garantir que nada quebrou
- **Critério de sucesso:** Build + tests passam

---

### FASE 1: Acertar de Primeira — Planning Layer + Prompt Engineering
**Objetivo:** Eliminar a necessidade de Self-Refine/Constitutional AI na maioria dos casos.
**Insight MANUS:** "Get it right the first time through better prompting and planning."
**Duração estimada:** 2-3 sessões
**Risco:** Médio
**Impacto:** Alto (reduz latência 30-50%, melhora qualidade)

#### 1.1 — Response Planning Layer (Layer 2.7 — pré-geração)
Antes de chamar o LLM para gerar, fazer uma chamada rápida (~200-500ms) para planejar a resposta:

```
Input: query + context resumido
Output: {
  responseStrategy: 'direct_answer' | 'step_by_step' | 'analysis' | 'creative' | 'code',
  keyPoints: string[],         // 3-5 pontos que a resposta DEVE cobrir
  requiredCitations: boolean,  // precisa citar fontes?
  targetLength: 'short' | 'medium' | 'long',
  tone: 'formal' | 'technical' | 'educational' | 'conversational',
  structureHint: string,       // e.g. "## Conceito\n## Exemplo\n## Conclusão"
}
```

- Usar modelo rápido (DeepSeek-V3 ou Gemini Flash) para planning
- Injetar o plano no system prompt do LLM principal
- **Base científica:** MANUS planning module + Plan-and-Solve (Wang et al., arXiv:2305.04091)
- **Critério de sucesso:** 70%+ das respostas passam Guardian ≥80 SEM Self-Refine

#### 1.2 — System Prompt Unificado de Alta Qualidade
O system prompt atual é longo (~3000 tokens) e acumulou regras de 122 versões. Reescrever:

- **Persona clara:** Definir tom, estilo e nível de profundidade esperado
- **Formato padrão:** Estrutura de resposta default (introdução → desenvolvimento → conclusão)
- **Regras de citação:** Sempre citar quando fizer claims factuais (não depender do Citation Engine post-hoc)
- **Anti-patterns:** Lista explícita do que NÃO fazer (respostas genéricas, bullet-point raso, auto-referência)
- **Instruções condicionais:** Se `responseStrategy == 'code'`, seguir formato X; se `analysis`, formato Y
- **Base científica:** MANUS system prompt as operational manual
- **Critério de sucesso:** Respostas consistentes independente do provider/tier

#### 1.3 — Provider-Agnostic Output Normalization
Problema atual: cada provider formata diferente (Gemini usa `**` excessivo, DeepSeek é conciso demais, GPT-4o é verboso).

- Criar `response-normalizer.ts`:
  - Normalizar heading levels
  - Padronizar formatação de código
  - Unificar estilo de listas
  - Remover artefatos de provider (e.g., "Certainly!", "I'd be happy to help!")
- Aplicar ANTES do Guardian (Layer 4.8)
- **Critério de sucesso:** Usuário não consegue distinguir qual provider gerou a resposta

---

### FASE 2: Latência — Streaming Inteligente + Pipeline Paralelo
**Objetivo:** TTFT <500ms, latência total -40%.
**Insight MANUS:** Resposta imediata com streaming, qualidade em background.
**Duração estimada:** 2 sessões
**Risco:** Médio-Alto
**Impacto:** Alto (UX drasticamente melhor)

#### 2.1 — Streaming-First Architecture
Reestruturar para que o LLM comece a gerar ANTES do contexto completo estar pronto:

```
Timeline atual:
  [Context 2-3s] → [LLM 2-6s] → [Quality 3-8s] → Resposta
  TTFT: 4-9s

Timeline alvo:
  [LLM começa imediatamente] → [Context chega async] → [Quality em paralelo]
  TTFT: <500ms
```

- **Fase A:** LLM inicia com query + conversation history (sem context externo)
- **Fase B:** Context sources (CRAG, KG, episodic) chegam via streaming e são injetados como "augmentation" mid-generation (técnica: prompt continuation)
- Se context chega e contradiz o que já foi gerado → marcar para Self-Refine (raro)
- **Base científica:** StreamingLLM (Xiao et al., arXiv:2309.17453), FLARE (Jiang et al., arXiv:2305.06983)
- **Critério de sucesso:** TTFT <500ms para 90% dos queries

#### 2.2 — Paralelizar Quality Checks (Layer 5)
Atualmente: Guardian → Self-Refine → Constitutional AI → CoVe → IFEval → BERTScore → F-DPO → PRM → NSVIF → Z3 → Citation Engine **(sequencial)**

Proposta: Agrupar em 3 blocos paralelos:

```
Bloco A (obrigatório, ~1-2s):       Bloco B (condicional, ~1s):         Bloco C (async, fire-and-forget):
├── Guardian G-Eval (7D)             ├── Citation Engine                  ├── BERTScore-NLI
├── Response Normalizer              ├── CoVe (se factual claims)         ├── F-DPO Calibration
└── IFEval v2                        └── PRM (se TIER_3/4 + STEM)        ├── NSVIF CSP
                                                                          └── Z3 Verifier
```

- Bloco A roda sempre (quality gate)
- Bloco B roda em paralelo com A (conditional)
- Bloco C roda async após resposta entregue (feedback loop, não bloqueia usuário)
- Self-Refine e Constitutional AI: SÓ se Guardian <80 (não mais por default)
- **Critério de sucesso:** Latência Layer 5 de 3-8s → 1-2s

#### 2.3 — Unificar core.ts e core-orchestrator.ts
Eliminar o A/B canary dual-pipeline:

- Avaliar qual pipeline tem melhor qualidade nos logs de produção
- Migrar todas as features para o vencedor (provavelmente `core-orchestrator.ts`)
- Remover `core.ts` como pipeline alternativo (manter apenas exports utilitários: MOTHER_VERSION, etc.)
- Uma única entrada: `processQuery()` → `orchestrate()`
- **Critério de sucesso:** Um único pipeline, `core.ts` reduzido a <200 linhas (re-exports + LFSA interceptor)

---

### FASE 3: Contexto — Memória Inteligente + Compression
**Objetivo:** Respostas mais contextuais e personalizadas, sem context overflow.
**Insight MANUS:** Event stream + compression + persistent files.
**Duração estimada:** 2 sessões
**Risco:** Médio
**Impacto:** Alto (qualidade de conversação multi-turn)

#### 3.1 — Conversation Compression
Implementar compressão inteligente de histórico:

- Para conversas com >10 mensagens: comprimir mensagens antigas em sumário
- Manter últimas 5 mensagens intactas + sumário das anteriores
- Usar modelo rápido (DeepSeek-V3) para gerar sumário
- **Base científica:** MANUS compression events, MemGPT (Packer et al., arXiv:2310.08560)
- **Critério de sucesso:** Conversas de 50+ mensagens sem degradação de qualidade

#### 3.2 — Context Relevance Scoring
Nem todo contexto deve ser injetado no prompt:

- Pontuar cada source (CRAG, KG, episodic, user memory) por relevância ao query
- Só injetar contexto com score >0.6
- Priorizar: user memory > episodic > CRAG > KG (ordem de personalização)
- **Base científica:** Self-RAG (Asai et al., arXiv:2310.11511) — "retrieve only when needed"
- **Critério de sucesso:** Prompt médio reduzido em 30%, qualidade mantida ou melhorada

#### 3.3 — Proactive Memory Recall
Quando o usuário referencia algo de conversas anteriores:

- Detectar referências implícitas ("aquele assunto", "como falamos ontem", "continua de onde paramos")
- Buscar episodic memory com similarity search
- Injetar como contexto privilegiado
- **Critério de sucesso:** MOTHER "lembra" de conversas passadas naturalmente

---

### FASE 4: Arquitetura de Plataforma — Plugin System
**Objetivo:** Preparar MOTHER para hospedar múltiplas aplicações (SHMS é a primeira).
**Insight:** MOTHER como kernel, aplicações como plugins.
**Duração estimada:** 3-4 sessões
**Risco:** Alto (refatoração arquitetural)
**Impacto:** Transformacional (habilita a visão de plataforma-mãe)

#### 4.1 — Tool Registry Pattern
Transformar `tool-engine.ts` monolítico em registry:

```typescript
// server/mother/tool-registry.ts
interface ToolPlugin {
  name: string;
  domain: string;              // 'core' | 'shms' | 'custom'
  tools: ToolDefinition[];
  initialize(): Promise<void>;
  execute(toolName: string, args: any, context: ToolContext): Promise<ToolResult>;
}

class ToolRegistry {
  register(plugin: ToolPlugin): void;
  getToolsForDomain(domain: string): ToolDefinition[];
  getAllTools(): ToolDefinition[];
  execute(toolName: string, args: any, context: ToolContext): Promise<ToolResult>;
}
```

- Migrar tools atuais para plugins por domínio:
  - `core-tools.ts`: audit_system, search_knowledge, force_study, etc.
  - `code-tools.ts`: read_own_code, write_own_code, execute_code
  - `research-tools.ts`: browse_url, search_duckduckgo, search_forums
  - `media-tools.ts`: generate_image, generate_pdf, generate_slides
  - `shms-tools.ts`: SHMS-specific tools (futuros)
- **Critério de sucesso:** Novas aplicações registram tools sem tocar core.ts

#### 4.2 — Pipeline Layer Interface
Extrair cada layer em módulo plugável:

```typescript
// server/mother/pipeline/layer.ts
interface PipelineLayer {
  name: string;
  order: number;
  condition?(request: PipelineRequest): boolean;  // skip se false
  execute(request: PipelineRequest, context: PipelineContext): Promise<PipelineResult>;
  parallel?: boolean;  // pode rodar em paralelo com outras layers do mesmo grupo
}

class Pipeline {
  addLayer(layer: PipelineLayer): void;
  removeLayer(name: string): void;
  process(request: PipelineRequest): Promise<PipelineResponse>;
}
```

- Cada layer registrada com `condition()` para ativação condicional
- Pipeline resolve dependências e paraleliza automaticamente
- Novas aplicações podem adicionar layers específicas (e.g., SHMS geotechnical validator)
- **Critério de sucesso:** Adicionar nova layer requer 1 arquivo, zero edições em core

#### 4.3 — Application Registry
Sistema de registro de aplicações filhas:

```typescript
interface MotherApplication {
  id: string;
  name: string;
  version: string;
  tools: ToolPlugin[];
  layers?: PipelineLayer[];
  routes?: ExpressRouter;
  memoryNamespace: string;      // isolamento de memória
  initialize(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}
```

- SHMS migrado para ser a primeira `MotherApplication`
- Aplicações compartilham: memória (com namespace), quality pipeline, providers
- Aplicações isolam: tools específicos, routes específicos, dados
- **Critério de sucesso:** SHMS funciona como plugin, não como código hardcoded no core

---

### FASE 5: Superioridade — Fechar os Gaps e Superar MANUS
**Objetivo:** MOTHER supera MANUS em qualidade de chat.
**Duração estimada:** 2-3 sessões
**Risco:** Médio
**Impacto:** Diferenciação

#### 5.1 — Closed-Loop Inline Verification
Implementar verificação durante a geração (não apenas pós):

- Durante streaming, analisar chunks para detectar:
  - Hallucination patterns (claims sem base no contexto)
  - Contradições com contexto fornecido
  - Auto-referência indevida
- Se detectado: interromper, inserir correção, continuar
- **Base científica:** MANUS closed-loop + FLARE active retrieval
- **Vantagem sobre MANUS:** MOTHER tem knowledge graph + episodic memory para verificação mais rica

#### 5.2 — Adaptive Depth Control
Problema: MANUS sempre dá respostas profundas. MOTHER varia com tier.

- Implementar depth target baseado no tipo de query:
  - Perguntas factuais simples: resposta concisa (2-3 frases)
  - Perguntas conceituais: resposta educacional com exemplos
  - Análises: resposta estruturada com seções
  - Código: solução + explicação + edge cases
- Injetar no planning layer (Fase 1.1) como `depthTarget`
- **Critério de sucesso:** Zero respostas "rasas" para queries complexas

#### 5.3 — Multi-Source Citation (Real-Time)
MANUS cita em tempo real. MOTHER cita post-hoc (ou não cita):

- Integrar citação no system prompt: "Para CADA claim factual, inclua a fonte inline"
- Formato: `[Autor, Ano]` no texto + referências completas no final
- Knowledge graph + arXiv papers como base de citação
- **Vantagem sobre MANUS:** MOTHER tem base de papers indexados; MANUS busca web em tempo real (mais lento, menos preciso)
- **Critério de sucesso:** 90%+ das claims factuais citadas em respostas complexas

#### 5.4 — Quality Benchmark Suite (MANUS-Comparative)
Criar suite de benchmarks para medir MOTHER vs MANUS:

- 50 queries de teste em 5 categorias:
  - Factual/Scientific (10)
  - Analysis/Reasoning (10)
  - Creative Writing (10)
  - Code Generation (10)
  - Domain-Specific/SHMS (10)
- Métricas: G-Eval 7D, RAGAS faithfulness, human preference, latência
- Rodar semanalmente via CI/CD
- **Critério de sucesso:** MOTHER ≥ MANUS em 4/5 categorias

---

## Resumo Visual do Roadmap

```
FASE 0 ─── Limpeza & Estabilização ──────────────── [1 sessão] ──── Risco: Baixo
  └── imports mortos, arquivos duplicados, docs

FASE 1 ─── Acertar de Primeira ──────────────────── [2-3 sessões] ── Risco: Médio
  ├── 1.1 Planning Layer (pré-geração)
  ├── 1.2 System Prompt unificado
  └── 1.3 Provider-agnostic normalization

FASE 2 ─── Latência & Pipeline ──────────────────── [2 sessões] ──── Risco: Médio-Alto
  ├── 2.1 Streaming-first (TTFT <500ms)
  ├── 2.2 Quality checks paralelos
  └── 2.3 Unificar core.ts + core-orchestrator.ts

FASE 3 ─── Contexto & Memória ──────────────────── [2 sessões] ──── Risco: Médio
  ├── 3.1 Conversation compression
  ├── 3.2 Context relevance scoring
  └── 3.3 Proactive memory recall

FASE 4 ─── Plataforma (Plugin System) ──────────── [3-4 sessões] ── Risco: Alto
  ├── 4.1 Tool Registry
  ├── 4.2 Pipeline Layer Interface
  └── 4.3 Application Registry (SHMS como plugin)

FASE 5 ─── Superioridade sobre MANUS ───────────── [2-3 sessões] ── Risco: Médio
  ├── 5.1 Closed-loop inline verification
  ├── 5.2 Adaptive depth control
  ├── 5.3 Multi-source citation (real-time)
  └── 5.4 Benchmark suite comparativa
```

---

## Métricas de Sucesso Global

| Métrica | MOTHER Atual | Alvo Pós-Roadmap | MANUS Ref |
|---------|-------------|------------------|-----------|
| TTFT | 1-3s | <500ms | <500ms |
| Latência total (simples) | 3-15s | 2-4s | ~4s |
| Latência total (complexo) | 15-50s | 5-15s | ~15s |
| Guardian ≥80 sem Self-Refine | ~50% | ≥70% | N/A |
| Respostas com citação | ~30% | ≥90% | ~80% |
| Context overflow em 50+ msgs | Frequente | Zero | Raro |
| Arquivos em server/mother/ | 200 | ~80 | N/A |
| Pipeline de qualidade (layers) | 11 sequenciais | 3 blocos paralelos | ~4 (closed-loop) |
| Providers suportados | 5 | 5 | 2 |
| Aplicações suportadas | 1 (SHMS hardcoded) | N (plugin) | N/A |

---

## Dependências entre Fases

```
FASE 0 ──→ FASE 1 ──→ FASE 2 ──→ FASE 3
                  └──→ FASE 4 (pode iniciar em paralelo com Fase 2/3)
                              └──→ FASE 5 (requer Fase 1+2+3 completas)
```

- **Fase 0 é pré-requisito** para todas as outras (codebase limpo)
- **Fases 1, 2, 3** são sequenciais (cada uma builda sobre a anterior)
- **Fase 4** pode iniciar após Fase 1 (independente de latência/contexto)
- **Fase 5** é a fase final de polimento (requer tudo anterior)

---

*Roadmap criado em 2026-03-12 — Sessão de análise comparativa MOTHER vs MANUS*
