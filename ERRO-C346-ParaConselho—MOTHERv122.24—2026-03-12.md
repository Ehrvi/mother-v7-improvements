# ERRO C346 — Para Discussão com o Conselho
**Data:** 2026-03-12 | **Versão:** MOTHER v122.24 | **Ciclo:** C346 (REVERTIDO)

---

## 1. DESCRIÇÃO DO PROBLEMA ORIGINAL

MOTHER v122.24 retorna **"Desculpe, o sistema está temporariamente sobrecarregado"** para queries classificadas como LONG ou VERY_LONG (ex: "escreva um resumo de um futuro livro... 15 páginas").

### Evidência Empírica (logs Cloud Run 2026-03-12T09:16:23 UTC)
```
[Orchestrator] C346 OLAR: upgraded to gemini-2.5-pro (google) for LONG output (~4500 tokens)
[Orchestrator] F1-1 ReAct: primary google failed after 90002ms: This operation was aborted
[Orchestrator] F1-1 ReAct: fallback gpt-4o-mini with 3000ms budget
[Orchestrator] F1-1 ReAct: all 3 iterations failed in 93005ms
[Guardian] G-Eval LLM quality score: 55.0
[Orchestrator] NC-CACHE-001: Skipping cache write-back for error/fallback response.
```

### Root Cause Técnica
1. OLAR classifica query como `LONG` → upgrade para `gemini-2.5-pro` (Google provider)
2. `ORCHESTRATOR_CIRCUIT_CONFIG.timeoutMs = 90000ms` — circuit breaker aborta após 90s
3. Google API não responde dentro de 90s para queries longas (possível: rate limit, latência, indisponibilidade)
4. Budget restante para fallback: `max(dynamicTimeout - 90002 - 500, 3000) = 3000ms`
5. `gpt-4o-mini` com 3000ms não consegue gerar resposta útil
6. Todos os 3 ReAct iterations falham → mensagem de erro exibida

---

## 2. FIX TENTADO (C346) — REVERTIDO POR DECISÃO DO USUÁRIO

**Ação tomada:** Substituir `gemini-2.5-pro` por `gpt-4o` para queries LONG/VERY_LONG em `output-length-estimator.ts` e `core-orchestrator.ts`.

**Motivo da reversão:** O fix C346 **degradaria drasticamente a qualidade** das respostas longas:
- `gemini-2.5-pro`: 65.536 tokens de output, melhor para geração longa, reasoning superior
- `gpt-4o`: 16.384 tokens de output (4x menos), qualidade inferior para documentos longos
- Para VERY_LONG (livros, teses, manuais): gpt-4o é insuficiente mesmo com LFSA

**Status:** Revertido via `git revert HEAD`. Código restaurado para v122.24.

---

## 3. SOLUÇÕES ALTERNATIVAS PARA DISCUSSÃO COM O CONSELHO

### Opção A: Google Streaming (Recomendada — Qualidade preservada)
**Hipótese:** O timeout ocorre porque `callProvider` usa `response.json()` (blocking) em vez de streaming. O Google Gemini suporta streaming SSE. Com streaming, os primeiros tokens chegam em <5s, e o AbortSignal não é disparado.

**Implementação:**
```typescript
// Em callProvider() para provider === 'google':
// Usar streamGenerateContent em vez de generateContent
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
  { method: 'POST', body: ..., signal }
);
// Processar SSE stream igual ao OpenAI
```

**Risco:** Médio — requer refatoração do callProvider para Google.

---

### Opção B: Budget Split Assimétrico (Simples — Qualidade preservada)
**Hipótese:** O problema é que o primary consome 100% do budget. Solução: limitar o primary a 70% do budget total, reservando 30% para fallback.

**Implementação:**
```typescript
// Em layer4_neuralGeneration:
const primaryBudget = Math.floor(effectiveBudgetMs * 0.70); // 70% para primary
const fallbackBudget = effectiveBudgetMs - primaryBudget;   // 30% garantido para fallback

const iterationBudget = Math.min(circuitConfig.timeoutMs, primaryBudget);
```

**Risco:** Baixo — mudança cirúrgica, não afeta modelo.

---

### Opção C: Google Health Check + Fallback Inteligente (Robusta)
**Hipótese:** Antes de rotear para Google, verificar se o provider está respondendo. Se não responder em 2s, usar gpt-4o como primary mantendo qualidade.

**Implementação:**
```typescript
// Em layer2_adaptiveRouting:
if (routing.primaryProvider === 'google') {
  const googleHealthy = await checkProviderHealth('google', 2000);
  if (!googleHealthy) {
    routing.primaryProvider = 'openai';
    routing.primaryModel = 'gpt-4o';
    console.log('[Orchestrator] Google unhealthy — fallback to gpt-4o');
  }
}
```

**Risco:** Médio — adiciona latência de 2s em cada request LONG/VERY_LONG.

---

### Opção D: Aumentar Timeout do Google Circuit Breaker para 120s
**Hipótese:** O Google simplesmente precisa de mais tempo. Aumentar timeoutMs de 90s para 120s.

**Risco:** Alto — aumenta o tempo de espera do usuário antes de ver o erro. Não resolve o problema de budget.

---

### Opção E: LFSA como Primary para VERY_LONG (Arquitetural)
**Hipótese:** Para VERY_LONG, não usar gemini-2.5-pro diretamente. Usar LFSA (Plan→Execute→Assemble) com gpt-4o por seção. Cada seção é MEDIUM (~2K tokens), sem risco de timeout.

**Risco:** Baixo para qualidade, médio para implementação.

---

## 4. RECOMENDAÇÃO DO AGENTE DE MANUTENÇÃO

**Prioridade para o Conselho:**
1. **Opção B** (Budget Split) como fix imediato — implementação em 30min, risco baixo
2. **Opção A** (Google Streaming) como fix definitivo — implementação em 2h, qualidade máxima
3. **Opção C** (Health Check) como complemento à Opção A

**Pergunta para o Conselho:**
> O bug ocorre porque Google API está lenta/indisponível, ou porque o timeout de 90s é insuficiente para queries longas? Precisamos de dados de latência do Google para queries LONG antes de decidir.

---

## 5. DADOS PARA O CONSELHO

| Métrica | Valor |
|---------|-------|
| Frequência do bug | Toda query LONG/VERY_LONG quando Google lento |
| Impacto no usuário | Resposta vazia + mensagem de erro |
| Modelos afetados | gemini-2.5-pro (LONG), gemini-2.5-pro (VERY_LONG) |
| Timeout atual | 90s (ORCHESTRATOR_CIRCUIT_CONFIG) |
| Budget total (query 15 pags) | ~106s (computeDynamicTimeout) |
| Budget restante para fallback | 3s (insuficiente) |
| Versão atual | v122.24 (C346 revertido) |
| Status | ABERTO — aguarda decisão do Conselho |

---

## 6. NOTA DE APRENDIZADO PARA bd_central

**Regra adicionada ao bd_central:**
> "Ao configurar OLAR para rotear para provider externo (Google, Anthropic), verificar se o timeoutMs do circuit breaker é menor que o totalBudgetMs. Se timeoutMs ≥ totalBudgetMs, o fallback nunca terá budget suficiente. Formula: timeoutMs_primary < totalBudgetMs × 0.70"

---

*Documento gerado por Manus AI em 2026-03-12 | Para discussão na próxima sessão do Conselho V111*
