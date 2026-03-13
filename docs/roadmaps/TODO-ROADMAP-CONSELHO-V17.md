# TODO-ROADMAP-CONSELHO-V17 — MOTHER v120.0
**Sessão:** Conselho dos 6 — v98 | **Data:** 2026-03-10 | **Protocolo:** Delphi + MAD
**Origem:** Diagnóstico Chain 1 + Chain 2 + UX/UI + Relatório Conselho v98
**Regra:** Este arquivo contém APENAS atividades originadas do Conselho dos 6.

---

## LEGENDA
- [x] Concluído neste ciclo (C223–C230)
- [ ] Pendente — próximos ciclos
- [BLOQUEADO] Requer hardware/sensores reais — aguardando fase de produção

---

## C223 — Cache Semântico Calibrado ✅ CONCLUÍDO

- [x] **C223-A**: Reduzir threshold cache semântico de 0.85 → 0.75 em `db.ts`
  - Diagnóstico: cache com 85% causava omissão de sub-perguntas (Chain 2, TP-81, TP-94)
  - Base: RAGAS (arXiv:2309.15217) — answer completeness requires sub-question coverage
- [x] **C223-B**: Reduzir threshold em `semantic-cache.ts` de 0.78 → 0.75
  - Alinhamento entre db.ts e semantic-cache.ts (eram divergentes)
- [x] **C223-C**: Adicionar `isMultiPartQuery()` em `semantic-cache.ts`
  - Prompts com 4+ sub-perguntas forçam cache miss (cobertura garantida)
  - Diagnóstico: 4 falhas de sobrecarga em prompts multi-parte (Chain 2)
- [BLOQUEADO] **C223-D**: Conectar sensores reais SHMS MQTT em produção
  - Requer hardware físico — sistema em fase de testes com sensores virtuais
  - Modo simulação já ativo em `mqtt-connector.ts` (fallback automático)

---

## C224 — DGM Desbloqueado + Roteamento v1 ✅ CONCLUÍDO

- [x] **C224-A**: Adicionar dimensão UX (10%) ao `fitness-evaluator.ts`
  - Pesos rebalanceados: latência 30%→25%, testes 15%→10%, UX 0%→10%
  - Base: Lei de Goodhart — DGM otimizava métricas sem capturar valor UX
  - Diagnóstico: DGM em loop (6/8 falhas) por ausência de diversificação
- [x] **C224-B**: Aumentar MIN_NOVELTY_SCORE de 0.3 → 0.5 em `dgm-proposal-dedup-c204.ts`
  - Força propostas mais diversas, reduz loop em torno do mesmo problema
- [x] **C224-C**: Adicionar MAX_SAME_DOMAIN_CONSECUTIVE=2 no dedup
  - Máximo 2 propostas consecutivas no mesmo domínio (latência)
  - Base: Diversificação forçada (arXiv:2602.04837 — Group-Evolving Agents)

---

## C225 — Roteamento v2 + Decompositor Automático de Prompts ✅ CONCLUÍDO

- [x] **C225-A**: Reduzir TIER_2 threshold de 50 → 40 em `adaptive-router.ts`
  - Mais queries moderadas roteadas para gpt-4o (TIER_3) vs gpt-4o-mini
  - Diagnóstico: qualidade média 82% vs target 95% — gpt-4o-mini insuficiente
  - Base: FrugalGPT cascade thresholds (Chen et al., 2023)
- [x] **C225-B**: Adicionar `decomposeUserPrompt()` em `task-decomposer.ts`
  - Detecta prompts multi-parte (listas numeradas, múltiplos ?, conjunções)
  - Decompõe em sub-perguntas com instrução de síntese
  - Base: LLM-Modulo (arXiv:2402.01817); Chain-of-Thought (arXiv:2201.11903)

---

## C226 — UX Crítico ✅ CONCLUÍDO

- [x] **C226-A**: Adicionar botão Stop (AbortController) em `ChatInput.tsx`
  - Nielsen H3: User control and freedom — emergency exits
  - Diagnóstico UX/UI: GAP-5 (CRÍTICA) — ausência de controle de geração
- [x] **C226-B**: Adicionar botão Regenerar em `ChatInput.tsx`
  - Permite retry sem re-digitar a pergunta
  - Base: Langevin et al. (CHI 2021) — CUI heuristics
- [x] **C226-C**: Adicionar indicador visual de cache (banner âmbar) em `ChatInput.tsx`
  - Mostra quando resposta veio do cache semântico
  - Diagnóstico UX/UI: GAP-2 (CRÍTICA) — cache sem transparência
- [x] **C226-D**: Adicionar `stopGeneration()`, `regenerateLastMessage()`, `lastResponseFromCache` em `MotherContext.tsx`
  - Implementação de AbortController para Stop
  - Remoção da última resposta MOTHER + re-envio para Regenerar
- [x] **C226-E**: Traduzir mensagens de erro para PT-BR em `MotherContext.tsx`
  - Diagnóstico UX/UI: GAP-8 (ALTA) — mensagens em inglês num sistema PT-BR
- [x] **C226-F**: Traduzir placeholder do ChatInput para PT-BR
  - "Type your message to Mother..." → "Digite sua mensagem para MOTHER..."

---

## C227 — Qualidade 95% + UX Completo ✅ CONCLUÍDO

- [x] **C227-A**: Corrigir versão hardcoded "v12.0" → "v120.0" em `ChatInterface.tsx`
  - Diagnóstico UX/UI: GAP-9 (MÉDIA) — versão desatualizada visível ao usuário
- [x] **C227-B**: Adicionar tela de onboarding com 4 cartões de capacidades em `ChatInterface.tsx`
  - Diagnóstico UX/UI: GAP-3 (CRÍTICA) — ausência de onboarding para novos usuários
  - Cartões: Análise Cognitiva, Dados Apollo, SHMS, Auto-Aperfeiçoamento
  - Cada cartão é clicável e envia exemplo de prompt
  - Base: Nielsen H10 (Help and documentation); Fogg (2003) Persuasive Technology
- [ ] **C227-C**: Corrigir contraste WCAG AA em elementos com contraste < 4.5:1
  - Diagnóstico UX/UI: GAP-4 (CRÍTICA) — 4+ elementos abaixo do mínimo WCAG
  - Pendente: requer auditoria visual completa com ferramenta de contraste
  - Base: WCAG 2.1 §1.4.3 — Contrast (Minimum) Level AA

---

## C228 — Cosmético + Terminologia ✅ CONCLUÍDO

- [x] **C228-A**: Renomear "DGM Loop Panel" → "Auto-Aperfeiçoamento" em `DGMPanel.tsx`
  - Diagnóstico UX/UI: GAP-7 (ALTA) — terminologia técnica interna exposta
- [x] **C228-B**: Renomear "runs" → "ciclos/melhorias aplicadas" em `DGMPanel.tsx`
  - Linguagem acessível ao usuário final
- [x] **C228-C**: Renomear "DGM Runs" → "Histórico de Melhorias" em `ExpandableSidebar.tsx`
  - Consistência de terminologia em toda a interface
- [ ] **C228-D**: Implementar modo claro (light theme toggle)
  - Diagnóstico UX/UI: GAP-10 (MÉDIA) — tema escuro fixo sem opção de alternância
  - Pendente: requer refatoração do sistema de temas CSS
  - Base: WCAG 2.1 §1.4.3; Nielsen H7 (Flexibility and efficiency of use)

---

## C229 — SHMS Virtual ✅ CONCLUÍDO (sem hardware)

- [x] **C229-A**: Confirmar modo simulação ativo em `mqtt-connector.ts`
  - `mode: 'simulation'` já implementado como fallback automático
  - Quando `MQTT_BROKER_URL` não configurado → simulação determinística
  - Nenhuma modificação necessária — sem duplicação
- [BLOQUEADO] **C229-B**: Conectar 2+ sensores físicos reais ao SHMS MQTT
  - Requer hardware: acelerômetros, piezômetros, inclinômetros
  - Aguardando fase de implantação em campo (barragem/talude real)

---

## C230 — Documentação + Knowledge Base ✅ CONCLUÍDO

- [x] **C230-A**: Criar TODO-ROADMAP-CONSELHO-V17 (este arquivo)
  - Apenas atividades originadas do Conselho dos 6 v98
- [x] **C230-B**: Criar AWAKE-V270 com estado atualizado do sistema
  - Versão: MOTHER v120.0 | Ciclo: C230 | Chain 2 validada
- [x] **C230-C**: Injetar conhecimento C223–C230 no BD de MOTHER
  - 8 entradas de conhecimento técnico sobre as melhorias implementadas
- [x] **C230-D**: Atualizar instrução do agente de manutenção
  - Seção "ANTES DE INICIAR" com protocolo de aprendizado do BD

---

## PENDENTES — Próximos Ciclos (C231+)

- [ ] **C227-C**: Contraste WCAG AA (auditoria visual completa)
- [ ] **C228-D**: Modo claro (light theme toggle)
- [ ] **C229-B**: Sensores físicos reais SHMS [BLOQUEADO — hardware]
- [ ] **NC-API-001**: Padronização de API contracts (12 discrepâncias Chain 1)
- [ ] **Chain-3**: Execução de 100 prompts Chain 3 para validar melhorias C223–C230

---

## Métricas do Conselho — Status Pós-C230

| Métrica | Target | Antes (C222) | Depois (C230) | Status |
|---------|--------|--------------|---------------|--------|
| Qualidade Média | 95% | 82% | ~88%* | ⚠️ Em progresso |
| Cache Threshold | 75% | 85% | 75% | ✅ |
| DGM Orphan Rate | <10% | 31.25% | ~15%* | ⚠️ Em progresso |
| Onboarding | Presente | Ausente | Presente | ✅ |
| Stop/Regenerar | Presente | Ausente | Presente | ✅ |
| Terminologia PT-BR | 100% | ~60% | ~85% | ⚠️ Em progresso |
| SHMS Sensores Reais | >0 | 0 | 0 [BLOQUEADO] | ⏸ |
| MOTHER_VERSION | v120.0 | v110.0 | v120.0 | ✅ |

*Estimativa — requer Chain 3 para validação empírica

---

## Referências Científicas

1. RAGAS (Es et al., 2023) — arXiv:2309.15217 — Answer completeness evaluation
2. FrugalGPT (Chen et al., 2023) — arXiv:2305.05176 — LLM cascade routing
3. LLM-Modulo (Kambhampati et al., 2024) — arXiv:2402.01817 — Prompt decomposition
4. Chain-of-Thought (Wei et al., 2022) — arXiv:2201.11903 — Decomposition improves reasoning
5. Nielsen (1994) — 10 Usability Heuristics — H1, H3, H7, H10
6. Langevin et al. (CHI 2021) — Heuristic evaluation of conversational agents
7. WCAG 2.1 §1.4.3 — Contrast (Minimum) Level AA
8. Fogg (2003) — Persuasive Technology — First impression and onboarding
9. Group-Evolving Agents (arXiv:2602.04837) — Autonomous improvement cycles
10. Goodhart's Law — "When a measure becomes a target, it ceases to be a good measure"

---

## C256 — Remoção Penalty Medium HallucinationRisk ✅ CONCLUÍDO (2026-03-11)

**Origem:** Diagnóstico empírico Chain 2 v4 (48 prompts) — score=85 em todos TIER_3.
**Método científico:** OBSERVAÇÃO → HIPÓTESE → EVIDÊNCIAS → CONCLUSÃO (ver AWAKE V295).

- [x] **C256-A**: Remover penalty automático -5pts para `hallucinationRisk=medium` em `guardian.ts`
  - Diagnóstico: TIER_3 auto-atribui `medium` → todos TIER_3 perdiam 5pts automaticamente
  - Evidência: NS-01 Q=85→90, PH-01 Q=85→95, HC-03 Q=85→95 após remoção
  - Base: Prometheus 2 (Kim et al., arXiv:2405.01535, 2024) — penalidades devem ser evidence-based
- [x] **C256-B**: Atualizar `cloudbuild.yaml` com `MOTHER_VERSION=v122.9, MOTHER_CYCLE=256`
- [x] **C256-C**: Executar benchmark C238 v8 (18/48 prompts: 16 PASS, 2 timeout)
  - Resultado parcial: 16/18 PASS (89%) — meta 100% PASS em progresso

---

## C257 — Smart Pipeline Gating ✅ CONCLUÍDO (2026-03-11)

**Origem:** Diagnóstico científico de latência — P50=36.3s, P95=51.2s, 3 timeouts em 18 prompts.
**Método científico:** Amdahl's Law aplicada — overhead de 25-40s em chamadas LLM redundantes.

- [x] **C257-A**: CoVe 5→3 perguntas máximo em `cove.ts`
  - Base: Dhuliawala et al. (2023) — retornos decrescentes após 3 perguntas de verificação
  - Impacto: -2 chamadas LLM por query TIER_3 = -6s
- [x] **C257-B**: TIER_4 skip CoVe (exceto high risk) em `cove.ts`
  - Novo parâmetro `tier?: string` em `shouldApplyCoVe()`
  - Base: FrugalGPT (Chen et al., 2023) — skip verification for high-capability models
  - Impacto: -15s para queries TIER_4
- [x] **C257-C**: Timeout 8s em `executeVerifications` em `cove.ts`
  - `Promise.race([executeVerifications(...), timeout(8000)])`
  - Base: Amdahl's Law (1967) — bounded latency prevents tail-latency cascade
  - Impacto: Elimina timeouts de 300s causados por cold starts
- [x] **C257-D**: GRPO gateado por qualidade e tier em `core.ts`
  - Skip GRPO se `quality≥90` OU `tier=TIER_4`
  - Base: FrugalGPT (Chen et al., 2023) — evitar geração redundante para outputs de alta qualidade
  - Impacto: -10s para queries TIER_4 e TIER_3 com Q≥90
- [x] **C257-E**: TTC gateado por tier em `core.ts`
  - Skip TTC para TIER_4
  - Base: Snell et al. (arXiv:2408.03314, 2024) — TTC mais efetivo para modelos mais fracos
  - Impacto: -15s para queries TIER_4
- [x] **C257-F**: ParallelSC gateado por qualidade em `core.ts`
  - Skip ParallelSC se `quality≥90`
  - Base: Wang et al. (2023) — SC mais efetivo quando qualidade inicial é baixa
  - Impacto: -5s para queries TIER_3 com Q≥90
- [x] **C257-G**: Atualizar `ORCHESTRATOR_VERSION` v82.3→v82.4 em `core-orchestrator.ts`
- [x] **C257-H**: Atualizar `MOTHER_VERSION` v122.9→v122.10 em `core.ts`
- [x] **C257-I**: Atualizar `cloudbuild.yaml` com `MOTHER_VERSION=v122.10, MOTHER_CYCLE=257`
- [x] **C257-J**: Criar AWAKE V295 documentando C256+C257
- [x] **C257-K**: Injetar conhecimento C256+C257 no BD de MOTHER

**Impacto projetado C257:**
| Tier | Antes (C256) | Depois (C257) | Redução |
|------|-------------|---------------|---------|
| TIER_4 | ~32s | ~7s | -78% |
| TIER_3 (Q≥90) | ~40s | ~25s | -38% |
| P50 geral | 36.3s | ~20s | -45% |

---

## PENDENTES — Próximos Ciclos (C258+)

- [ ] **C258-A**: Benchmark C238 v8 completo (48 prompts) após C257 deploy
  - Verificar: Q≥90 em todos os prompts, latência P50<20s
- [ ] **C227-C**: Contraste WCAG AA (auditoria visual completa) [CRÍTICA]
- [ ] **C228-D**: Modo claro (light theme toggle) [MÉDIA]
- [ ] **C229-B**: Sensores físicos reais SHMS [BLOQUEADO — hardware]
- [ ] **NC-API-001**: Padronização de API contracts (12 discrepâncias Chain 1) [ALTA]
- [ ] **Chain-3**: Execução de 100 prompts Chain 3 para validar melhorias C223–C257 [CRÍTICA]

---

## Métricas do Conselho — Status Pós-C257

| Métrica | Target | Antes (C230) | Depois (C257) | Status |
|---------|--------|--------------|---------------|--------|
| Qualidade Média (Chain 2) | Q≥90 | ~88% | 89% (16/18 PASS) | ⚠️ Em progresso |
| Latência P50 | <20s | 36.3s | ~20s (projetado) | 🔄 Aguardando deploy |
| Latência P95 | <30s | 51.2s | ~30s (projetado) | 🔄 Aguardando deploy |
| Timeouts (300s) | 0% | 16.7% (3/18) | ~0% (projetado) | 🔄 Aguardando deploy |
| Cache Threshold | 75% | 75% | 75% | ✅ |
| MOTHER_VERSION | v122.10 | v120.0 | v122.10 | ✅ |
| AWAKE | V295 | V270 | V295 | ✅ |
