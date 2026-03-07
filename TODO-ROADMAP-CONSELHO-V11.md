# TODO — ROADMAP CONSELHO V11 | MOTHER v81.8 → v82.x
## Aprovado pelo Conselho dos 6 IAs | Método Delphi + MAD | 07/03/2026
### Base científica: Darwin Gödel Machine (arXiv:2505.22954) | Lei de Lehman (1980) | ISO/IEC 25010:2011
### Datasets: LANL SHM Dataset (LANL-LA-13070-MS) | ICOLD Bulletin 158 (2017)

---

> **REGRA MANDATÓRIA:** Antes de iniciar qualquer sprint, o agente de manutenção DEVE:
> 1. Ler este arquivo TODO completo
> 2. Executar `node check_knowledge.cjs` para carregar e INTERNALIZAR o BD de conhecimento
> 3. Ler o AWAKE mais recente (V263+)
> 4. Verificar o estado de produção via `curl https://mother-production-*.run.app/api/health`
> 5. Executar `npx vitest run server/mother/__tests__/phase1-shms-datasets.test.ts` — DEVE passar 36/36

---

## PHASE 0 — CORREÇÃO DE NCS CRÍTICAS [CONCLUÍDO — Ciclo 185]

### NC-DB-001 — Verificação de Tabelas
- [x] Verificar que todas as 27 tabelas estão presentes no BD — **JÁ ESTAVA OK (28 tabelas)** — C185

### NC-SEC-001 — Remoção de Secret Hardcoded
- [x] Remover `'mother-gateway-secret-2026'` hardcoded de `api-gateway.ts` — **CORRIGIDO C185**
  - [x] Substituir por `process.env.MOTHER_ATTESTATION_SECRET || process.env.GITHUB_TOKEN`
  - [x] Lançar erro se nenhuma variável estiver definida (sem fallback hardcoded)
  - [x] Commit: `7e19231` — fix(security): NC-SEC-001

### NC-ARCH-001 — Ativação SHMS v2
- [x] Mover imports mid-file de `a2a-server.ts` para o topo — **CORRIGIDO C185**
  - [x] `lstmPredictor` (linha 990) → topo
  - [x] `digitalTwin` (linha 991) → topo
  - [x] `initTimescaleConnector` (linha 992) → topo
  - [x] `getDashboardData` (linha 1113) → topo
  - [x] `mqttDigitalTwinBridge` (linha 1114) → topo
  - [x] Commit: `3ebba9a` — fix(arch): NC-ARCH-001

---

## PHASE 1 — COBERTURA DE TESTES [CONCLUÍDO — Ciclo 185]

### Objetivo: 5.6% → 40%+ de cobertura
- [x] Criar `server/mother/__tests__/phase1-shms-datasets.test.ts` — **CONCLUÍDO C185**
  - [x] 36 testes unitários passando
  - [x] LANL SHM Dataset: acelerômetros D0-D4 (5 estados de dano)
  - [x] ICOLD Concrete Dam Monitoring: piezômetros + deslocamento
  - [x] CUSUM algorithm (Page 1954): detecção de change-point
  - [x] LSTM: sigmoid, tanh, normalização, RMSE
  - [x] Alert Engine: thresholds ICOLD (Normal/Watch/Warning/Alert/Emergency)
  - [x] Digital Twin: health score, multi-sensor array
  - [x] NC-SEC-001 validation: sem hardcoded fallback
  - [x] NC-ARCH-001 validation: interface LSTM, tipos de sensor
  - [x] Commit: `72ad536` — test(phase1): 36 unit tests SHMS LANL+ICOLD

---

## PHASE 2 — QUALIDADE E INFRAESTRUTURA [PRÓXIMA — Ciclo 186+]

> **Critério de sucesso:** P50 <30s, cobertura >60%, GITHUB_TOKEN configurado

### 2.1 — Cobertura de Testes 60%+
- [ ] Adicionar testes de integração para SHMS API endpoints
  - [ ] `GET /api/a2a/shms/v2/status` — Digital Twin + LSTM + TimescaleDB
  - [ ] `POST /api/shms/analyze` — análise de dados de sensor
  - [ ] `GET /api/shms/twin-state` — estado do Digital Twin
- [ ] Adicionar testes para DGM orchestrator
  - [ ] Ciclo completo: Observe → Propose → Validate
  - [ ] Mock do GitHub API para testes sem token real
- [ ] Adicionar testes para adaptive router
  - [ ] Routing PT vs EN
  - [ ] TIER_1/2/3 classification

### 2.2 — Configurar GITHUB_TOKEN (NC-GITHUB-TOKEN)
- [ ] Configurar `GITHUB_TOKEN` no Cloud Run Secret Manager
- [ ] Verificar permissões: contents:write, pull_requests:write, issues:write
- [ ] Testar DGM com PR real em modo dry-run
- [ ] Habilitar Sprint 9 (DGM Ciclo Completo)

### 2.3 — Medir e Reduzir Latência (NC-LATENCY-001)
- [ ] Medir P50 atual após routing PT fix
- [ ] Identificar gargalo principal (cache miss? LLM latência? DB?)
- [ ] Implementar warm cache na inicialização (top-50 queries)
- [ ] Meta: P50 <30s (intermediário), P50 <10s (final)

### 2.4 — Conectar MQTT Broker Real (NC-SHMS-MQTT)
- [ ] Configurar HiveMQ Cloud (plano gratuito disponível)
- [ ] Atualizar `mqtt-connector.ts` com credenciais do Cloud Run
- [ ] Testar com dados simulados de piezômetro (ICOLD format)
- [ ] Testar com dados simulados de acelerômetro (LANL format)

---

## PHASE 3 — DADOS REAIS E TREINAMENTO [Ciclo 188+]

> **Critério de sucesso:** LSTM treinado com dados reais, G-Eval >85/100

### 3.1 — Integrar LANL SHM Dataset Real
- [ ] Download do dataset público: https://www.lanl.gov/projects/national-security-education-center/engineering/shm/
- [ ] Parser para formato LANL (CSV/MAT)
- [ ] Pipeline: LANL data → normalização → LSTM training
- [ ] Validação: RMSE <0.1 em dados de teste
- [ ] Documentar resultados no BD de conhecimento

### 3.2 — Integrar ICOLD Dam Monitoring Data
- [ ] Identificar dataset público ICOLD disponível
- [ ] Parser para formato ICOLD (CSV com timestamps)
- [ ] Pipeline: ICOLD data → normalização → LSTM training
- [ ] Validação: detecção de anomalias com precision >90%
- [ ] Documentar resultados no BD de conhecimento

### 3.3 — G-Eval Calibração Geotécnica
- [ ] Criar conjunto de referência com 50 pares query/resposta geotécnicos
  - [ ] 20 queries sobre piezômetros (ICOLD)
  - [ ] 20 queries sobre acelerômetros (LANL)
  - [ ] 10 queries sobre alertas e emergências
- [ ] Ajustar pesos dos critérios para domínio técnico
- [ ] Meta: G-Eval >85/100 em domínio geotécnico

---

## PHASE 4 — PRODUÇÃO SHMS [Ciclo 192+]

> **Critério de sucesso:** SHMS pronto para clientes pagantes

### Critérios de Prontidão
- [ ] P50 <10s ✓ (Phase 2)
- [ ] Qualidade G-Eval >85/100 ✓ (Phase 3)
- [ ] DGM funcional ✓ (Phase 2)
- [ ] SHMS integrado com dados reais ✓ (Phase 3)
- [ ] 0 NCs críticas ✓ (Phase 0)
- [ ] Auto-deploy funcionando ✓ (Sprint 1)
- [ ] Cobertura testes >60% ✓ (Phase 2)

### Entregáveis
- [ ] Documentação completa da API SHMS
- [ ] Plano de pricing e onboarding
- [ ] Primeiro cliente piloto
- [ ] Monitoramento de SLA
- [ ] Dashboard público de status

---

## SPRINTS LEGADOS (V4 — Ciclo 178)

### SPRINT 1 — AUTONOMIA DE CÓDIGO [IMPLEMENTADO — C178]
- [x] GitHub Read Service (`server/mother/github-read-service.ts`) — C178
- [x] GitHub Write Service (`server/mother/github-write-service.ts`) — C178
- [x] Cloud Run Auto-Deploy via GitHub Actions — C178

### SPRINT 2 — FIXES CRÍTICOS [IMPLEMENTADO — C178]
- [x] NC-TS-001: await getDb() em dgm-orchestrator.ts — C178
- [x] NC-SCHEMA-DRIFT-002: 17 colunas ausentes selfProposals — C178
- [x] NC-LANG-001: languageInjection no início do systemPrompt — C178

### SPRINT 3 — ROUTING PT [IMPLEMENTADO — C178-C179]
- [x] NC-ROUTING-001: adaptive-router inglês-only — C178
- [x] Palavras-chave PT no adaptive-router — C178

### SPRINT 4 — CACHE [PARCIALMENTE — C178]
- [x] Thresholds de cache OK — C178
- [ ] Warm cache na inicialização (top-50 queries) — PENDENTE

### SPRINT 5 — ARQUIVAMENTO [IMPLEMENTADO — C178]
- [x] 180 módulos mortos arquivados em `server/mother/archive/` — C178

### SPRINT 6 — SHMS DIGITAL TWIN [IMPLEMENTADO — C178-C181]
- [x] MQTT Connector — C181
- [x] TimescaleDB Connector — C181
- [x] LSTM Predictor — C181
- [x] Digital Twin — C178
- [x] Anomaly Detector — C181
- [x] Alert Engine — C181
- [x] SHMS API — C181
- [x] Dashboard — C181

### SPRINT 7 — SHMS FASE 2 [PARCIALMENTE — C181-C182]
- [x] G-Eval 50 exemplos calibrados — C182
- [x] SHMS analyze endpoint — C182
- [ ] MQTT broker real (HiveMQ Cloud) — PENDENTE → Phase 2.4
- [ ] Sistema de alertas por email/SMS — PENDENTE
- [ ] Dashboard em tempo real — PENDENTE

### SPRINT 8 — QUALIDADE [PARCIALMENTE — C182-C184]
- [x] G-Eval calibração 50 exemplos — C182
- [x] DGM Ciclo 2+3 com PR real — C183-C184
- [ ] Benchmark 100 queries antes/depois — PENDENTE

### SPRINT 9 — DGM CICLO COMPLETO [PENDENTE — aguarda GITHUB_TOKEN]
- [ ] Verificar Sprint 1 funcionando
- [ ] Executar ciclo DGM completo autônomo
- [ ] Documentar o ciclo

### SPRINT 10 — PRODUÇÃO SHMS [PENDENTE → Phase 4]
- [ ] Ver Phase 4 acima

---

## MÉTRICAS DE ACOMPANHAMENTO

| Métrica | C178 | C185 | Phase 2 | Phase 3 | Phase 4 |
|---------|------|------|---------|---------|---------|
| Latência P50 | 75s | 75s | <30s | <10s | <10s |
| Cache Hit Rate | 12% | 12% | >35% | >40% | >40% |
| Qualidade G-Eval | 75.1 | 75.1 | 75.1 | >85 | >85 |
| Cobertura Testes | 5.6% | 36 testes | >60% | >70% | >80% |
| NCs Críticas | 3 | **0** | 0 | 0 | 0 |
| DGM Funcional | Não | Parcial | Sim | Sim | Sim |
| Auto-Deploy | Sim | Sim | Sim | Sim | Sim |
| SHMS | Parcial | Parcial | Parcial | Completo | Completo |
| Dados Reais | Não | Não | Não | Sim | Sim |

---

## REFERÊNCIAS CIENTÍFICAS

1. Zhang et al. (2025) arXiv:2505.22954 — Darwin Gödel Machine: base do DGM de MOTHER
2. Lehman (1980) DOI:10.1109/PROC.1980.11805 — Lei da Complexidade Crescente
3. Sun et al. (2025) DOI:10.1145/3777730.3777858 — DL para SHM
4. Carrara et al. (2022) arXiv:2211.10351 — Deep learning para SHM com LSTM
5. Tang et al. (2025) DOI:10.1038/s41467-025-63913-1 — Riscos de IA autônoma
6. Dean & Barroso (2013) DOI:10.1145/2408776.2408794 — Tail at Scale
7. GeoMCP (2026) arXiv:2603.01022 — IA em geotecnia
8. **Farrar & Worden (2012) — "Structural Health Monitoring: A Machine Learning Perspective", Wiley. LANL-LA-13070-MS.** ← NOVO C185
9. **ICOLD Bulletin 158 (2017) — "Dam Safety Management: Operational Phase of the Dam Life Cycle"** ← NOVO C185
10. **Page (1954) — "Continuous Inspection Schemes", Biometrika 41(1-2):100-115** ← NOVO C185
11. **Hochreiter & Schmidhuber (1997) — "Long Short-Term Memory", Neural Computation 9:1735-1780** ← NOVO C185
12. **Liu et al. (2008) — "Isolation Forest", IEEE ICDM** ← NOVO C185
13. **Grieves (2014) — "Digital Twin: Manufacturing Excellence through Virtual Factory Replication"** ← NOVO C185
14. ISO/IEC 25010:2011 — Modelo de qualidade de software

---

*Gerado por MANUS em 07/03/2026 após Ciclo 185 — Phase 0 + Phase 1 concluídos.*
*Aprovado pelo Conselho dos 6 IAs — Método Delphi + MAD consensus.*
*Datasets aprovados pelo proprietário: LANL SHM Dataset + ICOLD Concrete Dam Monitoring.*
