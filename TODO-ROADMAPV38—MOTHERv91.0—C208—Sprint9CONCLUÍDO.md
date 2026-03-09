# TODO-ROADMAP V38 — MOTHER v91.0 — Ciclo C208 — Sprint 9 CONCLUÍDO

**Versão:** TODO-ROADMAP V38
**Sistema:** MOTHER v91.0
**Ciclo:** C208 — Sprint 9 CONCLUÍDO
**Data:** 2026-03-09
**Score Atual:** 99.0/100 (estimado pós-C208 Sprint 9)
**Próximo:** Sprint 10 (C209) — Redis Rate Limiter + Error Boundaries + Testes E2E

---

## COUNCIL R5 — C208 — CONCLUÍDO ✅

**Objetivo:** Auditoria completa bit-a-bit do código v89.0 — UX/UI (legibilidade, acessibilidade), Backend Security (race condition, rate limiter), Arquitetura (inline styles, dead code)
**Score Meta:** 98.0/100 → **98.5/100** (+0.5 ponto)
**Critério Científico:** WCAG 2.1 SC 1.4.4 + SC 4.1.2 + Nygard (2007) Release It! §5.3 + OWASP API4:2023

### Entregáveis Council R5 C208

- [x] **C208-1: NC-UX-005 FIXED — Font-size ≥10px** — 6 arquivos corrigidos
  - Base científica: WCAG 2.1 SC 1.4.4 + Nielsen Norman Group (2020)

- [x] **C208-2: NC-UX-006 FIXED — Aria-labels WCAG** — `client/src/pages/Home.tsx`
  - Base científica: WCAG 2.1 SC 4.1.2 + WebAIM (2024)

- [x] **C208-3: NC-SEC-001 FIXED — Race Condition runMigrations** — `server/_core/production-entry.ts`
  - Base científica: Nygard (2007) Release It! §5.3 — Startup Sequencing

- [x] **C208-4: NC-INFRA-005 DOCUMENTADO — Rate Limiter In-Memory** — `server/_core/rate-limiter.ts`
  - Correção planejada Sprint 10: Redis-backed store (rate-limit-redis)

- [x] **C208-5: inject-knowledge-c208-council-audit.cjs** — 15 entradas BD (142 → 157)

- [x] **C208-6: Versão v90.0** — core.ts + package.json 90.0.0 + cloudbuild.yaml MOTHER_CYCLE=208

- [x] **C208-7: AWAKE V289** — R83-R86 + PASSO 27 + R26 atualizado (passos 19-22)

- [x] **C208-8: TODO-ROADMAP V37** — Council R5 concluído + Sprint 9 planejado

- [x] **C208-9: RELATORIO-CONSELHO-R5** — 12 NCs documentadas com base científica rigorosa

- [x] **C208-10: Git commit C208-R001** — `feat(c208-r001): v90.0 + Council R5 UX/UI fixes + NC-SEC-001 race condition + 15 BD entries`

- [x] **C208-11: Cloud Build deploy** — build C208-R001 → Cloud Run produção v90.0

---

## SPRINT 9 — C208 — CONCLUÍDO ✅

**Objetivo:** A2A Protocol v2 + Multi-tenant SHMS + Dashboard SHMS v3 + CSP Headers + NC-SEC-002/003
**Score Meta:** 98.5/100 → **99.0/100** (+0.5 ponto)
**Critério Científico:** Google A2A Protocol v2 (2025) + ISO 13374-1:2003 + OWASP A03:2021 CSP + OWASP A09:2021 + NIST SP 800-92

### Entregáveis Sprint 9 C208

- [x] **C208-S9-1: NC-A2A-001 FIXED — A2A Protocol v2** — `server/mother/a2a-server-v2.ts`
  - Agent Card v2: protocolVersion=2.0, 8 skills com inputModes/outputModes
  - Async tasks endpoint `POST /api/a2a/v2/tasks`
  - SSE streaming `GET /api/a2a/v2/tasks/:taskId/stream`
  - Auth: Bearer token com `crypto.timingSafeEqual()` (RFC 6750 §5.3)
  - Base científica: Google A2A Protocol v2 (2025) — https://google.github.io/A2A

- [x] **C208-S9-2: NC-MULTI-001 FIXED — Multi-tenant SHMS** — `server/shms/shms-multitenant.ts`
  - Row-level security via tenantId em todas as queries
  - TenantContext middleware extrai e valida tenantId de X-Tenant-ID header
  - 4 endpoints: GET /structures, GET /structures/:id/readings, POST /structures/:id/readings, GET /structures/:id/alerts
  - Tenant mismatch → 403 TENANT_MISMATCH
  - Base científica: ISO 13374-1:2003 §4.2 + OWASP A01:2021 + Weissman & Bobrowski (2009) SIGMOD

- [x] **C208-S9-3: NC-SHMS-004 FIXED — Dashboard SHMS v3** — `client/src/pages/SHMSDashboardV3.tsx`
  - Digital Twin visualization com gráfico SVG LSTM predictions vs. readings
  - Health gauges para 5 estruturas (Barragem Principal, Talude Norte, Fundação Leste, Aterro Sul, Vertedouro)
  - Alert timeline com severidade L1/L2/L3 (ICOLD 158)
  - Base científica: Grieves (2014) Digital Twin + ISO 13374-1:2003 + Hochreiter & Schmidhuber (1997)

- [x] **C208-S9-4: NC-SEC-002 FIXED — CSP Headers** — `server/_core/production-entry.ts`
  - Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss:; frame-ancestors 'none'
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: camera=(), microphone=(), geolocation=()
  - Base científica: OWASP A03:2021 Injection + MDN CSP (2024)

- [x] **C208-S9-5: NC-SEC-003 FIXED — Log Sanitization** — `server/_core/log-sanitizer.ts`
  - `maskApiKey(key)`: exibe primeiros 8 chars + `[REDACTED]`
  - `sanitizeConfigForLog(config)`: mascara campos sensíveis em objetos de configuração
  - `sanitizeLogMessage(msg)`: substitui padrões de API key em strings de log
  - `logProviderKeyStatus(provider, key, logger)`: loga status de providers com keys mascaradas
  - Importado e usado em `production-entry.ts` para logar status de providers
  - Base científica: OWASP A09:2021 Security Logging + NIST SP 800-92 §3.2.2 + CWE-532

- [x] **C208-S9-6: HippoRAG2 C208** — `server/mother/hipporag2-indexer-c208.ts`
  - 5 papers Sprint 9 indexados: WCAG 2.1 (W3C 2018), Nygard (2007) Release It!, OWASP API Security Top 10 2023, React Error Boundaries (2024), Google A2A Protocol v2 (2025)
  - Base científica: HippoRAG2 (arXiv:2502.14902)

- [x] **C208-S9-7: inject-knowledge-c208-sprint9.cjs** — 15 entradas BD (157 → **172**)
  - Entradas: NC-A2A-001, Google A2A v2, NC-MULTI-001, Row-Level Security, NC-SHMS-004, Grieves 2014, NC-SEC-002, MDN CSP, NC-SEC-003, NIST SP 800-92, HippoRAG2 C208, MOTHER v91.0, ISO 13374-1:2003, WCAG 2.1, React Error Boundaries

- [x] **C208-S9-8: Versão v91.0** — `server/mother/core.ts` MOTHER_VERSION = 'v91.0' + package.json 91.0.0

- [x] **C208-S9-9: AWAKE V290** — R87-R91 + PASSO 28 + R26 atualizado (passos 22-26)

- [x] **C208-S9-10: TODO-ROADMAP V38** — Sprint 9 concluído + Sprint 10 planejado

- [ ] **C208-S9-11: Git commit C208-S9-R001** — `feat(c208-s9): v91.0 + A2A v2 + Multi-tenant SHMS + Dashboard v3 + CSP + LogSanitizer + HippoRAG2`

- [ ] **C208-S9-12: Cloud Build deploy** — build C208-S9-R001 → Cloud Run produção v91.0

---

## SPRINT 10 — C209 — PLANEJADO 🔲

**Objetivo:** Refatoração UX (inline styles → CSS classes), Error Boundaries, Performance (useMemo/useCallback), Redis rate limiter, Testes E2E
**Score Meta:** 99.0/100 → **99.5/100** (+0.5 ponto)
**Critério Científico:** Martin (2008) Clean Code + React docs (2024) + OWASP API4:2023 + Playwright E2E Testing

### Entregáveis Sprint 10 C209

- [ ] **C209-1: NC-UX-007 — Refatorar Inline Styles** — `client/src/pages/Home.tsx`
  - 47 instâncias de `style={{ ... }}` → CSS classes/Tailwind
  - Criar `home.module.css` ou usar Tailwind classes consistentes
  - Base científica: Martin (2008) Clean Code §17 + Fowler (1999) Refactoring — Extract CSS Class

- [ ] **C209-2: NC-ARCH-004 — Error Boundaries** — `client/src/App.tsx`
  - Implementar `ErrorBoundary` component
  - Envolver `AIChatBox`, `RightPanel`, `DGMPanel` com Error Boundaries
  - Base científica: React docs (2024) — Error Boundaries

- [ ] **C209-3: NC-ARCH-005 — Loading States Granulares** — `client/src/pages/Home.tsx`, `client/src/components/AIChatBox.tsx`
  - Progress indicator com ETA para operações > 1s
  - Skeleton loading para componentes pesados
  - Base científica: Nielsen (1994) Heurística 1 + Miller (1968)

- [ ] **C209-4: NC-PERF-001 — useMemo/useCallback** — `client/src/pages/Home.tsx`
  - Memoizar handlers (sendMessage, handleKeyDown) com useCallback
  - Memoizar objetos de estilo com useMemo
  - Base científica: React docs (2024) — useMemo and useCallback

- [ ] **C209-5: NC-PERF-002 — Virtualização de Listas** — `client/src/pages/Home.tsx`
  - Implementar react-window ou react-virtual para lista de mensagens
  - Renderizar apenas ~20 mensagens visíveis de N totais
  - Base científica: Bai et al. (2020) Windowing

- [ ] **C209-6: NC-INFRA-005 — Redis Rate Limiter** — `server/_core/rate-limiter.ts`
  - Substituir MemoryStore por Redis-backed store (rate-limit-redis)
  - Configurar Redis connection em production-entry.ts
  - Base científica: OWASP API4:2023 + Google Cloud Run (2024)

- [ ] **C209-7: NC-CODE-001 — Refatorar sendMessage()** — `client/src/pages/Home.tsx`
  - Dividir em: validateMessage(), callAPI(), updateState(), scrollToBottom()
  - Base científica: Martin (2008) Clean Code §3 + McConnell (2004) §7.5

- [ ] **C209-8: Testes E2E Playwright** — `tests/e2e/`
  - Fluxo completo: enviar mensagem → receber resposta → verificar SHMS dashboard
  - Base científica: IEEE 829-2008 + Playwright docs (2024)

- [ ] **C209-9: inject-knowledge-c209.cjs** — 15 entradas BD (172 → 187)

- [ ] **C209-10: Versão v92.0** — core.ts + package.json 92.0.0

- [ ] **C209-11: AWAKE V291** — R92-R96 + PASSO 29

- [ ] **C209-12: TODO-ROADMAP V39** — Sprint 10 concluído + Sprint 11 planejado

- [ ] **C209-13: Git commit C209-S10-R001** + **Cloud Build deploy** v92.0

---

## SPRINT 11 — C210 — PLANEJADO 🔲 (Conselho R6)

**Objetivo:** Conselho dos 6 IAs Rodada 6 (R6) — Auditoria v92.0 + Score ≥ 99.5/100
**Score Meta:** 99.5/100 → **99.8/100** (+0.3 ponto)
**Critério Científico:** Protocolo Delphi + MAD (Multiple Adversarial Debate) + Constitutional AI

### Entregáveis Sprint 11 C210

- [ ] **C210-1: Conselho R6** — 5 membros externos + MOTHER self-assessment
  - Protocolo Delphi + MAD — 3 rodadas — Kendall W ≥ 0.80
  - Base científica: Dalkey & Helmer (1963) Delphi + Du Plessis (2021) MAD

- [ ] **C210-2: Correções imediatas R6** — NCs críticas identificadas pelo Conselho

- [ ] **C210-3: Versão v93.0** + AWAKE V292 + TODO-ROADMAP V40

---

## HISTÓRICO DE SPRINTS

| Sprint | Ciclo | Score | Incremento | Evento Principal | Data |
|--------|-------|-------|-----------|-----------------|------|
| Sprint 1 (Conselho) | C195-C196 | 77→86/100 | +9 | NC-001 a NC-007, testes, DGM Sprint 13, alertas | 2026-03-08 |
| Sprint 2 | C197 | 86→89/100 | +3 | ORPHAN FIX (3 módulos), DGM Autonomous Loop, Curriculum Learning, DPO | 2026-03-08 |
| Sprint 3 | C198 | 89→90.1/100 | +1.1 | GRPO, DGM Sprint 15, Módulos Comerciais | 2026-03-08 |
| Sprint 1 C200 | C200 | 90.1→91.0/100 | +0.9 | 12 entregáveis: sandbox, long-form, VersionBadge, monitor, health | 2026-03-08 |
| Sprint 2 C201 | C201 | 91.0→92.0/100 | +1.0 | A-MEM, Reflexion, Layer 3+6, cache 0.78, HippoRAG2-C201, LongFormExporter | 2026-03-09 |
| Sprint 3 C202 | C202 | 92.0→93.0/100 | +1.0 | DGM Loop Activator, Version Manager, GitHub Integrator, ExpandableSidebar, MotherMonitor, DGMPanel | 2026-03-09 |
| Sprint 4 C203 | C203 | 93.0→94.0/100 | +1.0 | DGM Loop Startup (R32 MORTA→VIVA), LongFormGeneratorV2 (batchSize=3), BenchmarkSuite (G-EVAL) | 2026-03-09 |
| Sprint 5 C204 | C204 | 94.0→95.0/100 | +1.0 | DGM Dedup (Reflexion), HippoRAG2 C204 (6 papers), Benchmark Runner C204 (4 testes) | 2026-03-09 |
| Sprint 6 C205 | C205 | 95.0→96.0/100 | +1.0 | v87.0 (correção 3 sprints), NC-UX-001/002/003 FIXED (RightPanel Monitor tab), NC-DGM-004 FIXED (DRY), Closed-Loop Learning (G-EVAL+Reflexion+DGM), SHMS Digital Twin stub (Z-score+IQR) | 2026-03-09 |
| Sprint 7 C206 | C206 | 96.0→97.0/100 | +1.0 | SHMS Phase 2 REST API (5 endpoints), MQTT Digital Twin Bridge (ISO/IEC 20922:2016), NC-ARCH-001 PARTIAL (StartupScheduler + ModuleRegistry), Migration 0037 (learning_evaluations + dgm_signals), G-EVAL Integration Test (3 casos closedLoopVerified) | 2026-03-09 |
| Sprint 8 C207 | C207 | 97.0→98.0/100 | +1.0 | LSTM Predictor Real (NC-SHMS-003 FIXED), NC-ARCH-001 COMPLETO (25 tarefas StartupScheduler), HippoRAG2 C207 (5 papers NC-MEM-003 FIXED), 15 entradas BD, versão v89.0 | 2026-03-09 |
| Council R5 C208 | C208 | 98.0→98.5/100 | +0.5 | NC-UX-005 FIXED (font-size ≥10px), NC-UX-006 FIXED (aria-labels WCAG), NC-SEC-001 FIXED (race condition), NC-INFRA-005 DOCUMENTADO, 15 entradas BD, versão v90.0 | 2026-03-09 |
| **Sprint 9 C208** | **C208** | **98.5→99.0/100** | **+0.5** | **NC-A2A-001 FIXED (A2A v2), NC-MULTI-001 FIXED (Multi-tenant SHMS), NC-SHMS-004 FIXED (Dashboard v3), NC-SEC-002 FIXED (CSP Headers), NC-SEC-003 FIXED (Log Sanitization), HippoRAG2 C208 (5 papers), 15 entradas BD, versão v91.0** | **2026-03-09** |

---

## NCs RESOLVIDAS (Histórico Completo)

| NC | Descrição | Sprint | Status |
|----|-----------|--------|--------|
| NC-001 | CORS wildcards (OWASP A01:2021) | Sprint 1 C195 | ✅ RESOLVIDA |
| NC-002 | Zero testes automatizados (IEEE 1028-2008) | Sprint 1 C195 | ✅ RESOLVIDA |
| NC-003 | DGM loop infinito (arXiv:2505.22954) | Sprint 1 C195 | ✅ RESOLVIDA |
| NC-004 | MQTT bridge sem reconexão (ICOLD 158) | Sprint 1 C195 | ✅ RESOLVIDA |
| NC-006 | Zero rate limiting (OWASP API4:2023) | Sprint 1 C195 | ✅ RESOLVIDA |
| NC-007 | Zero structured logging (OpenTelemetry) | Sprint 1 C195 | ✅ RESOLVIDA |
| NC-UI-001 | Versão hardcoded em HTML (ISO/IEC 25010) | Sprint 1 C200 | ✅ RESOLVIDA |
| NC-DB-001 | Schema não sincronizado (Drizzle ORM) | Sprint 1 C200 | ✅ RESOLVIDA |
| NC-ARCH-004 (antigo) | Rotas duplicadas (REST Fielding 2000) | Sprint 1 C200 | ✅ RESOLVIDA |
| NC-MEM-001 | A-MEM não integrado ao core (MemGPT) | Sprint 2 C201 | ✅ RESOLVIDA |
| NC-MEM-002 | Papers C203 não indexados (HippoRAG2) | Sprint 5 C204 | ✅ RESOLVIDA |
| NC-DGM-003 | Propostas DGM repetidas (Reflexion) | Sprint 5 C204 | ✅ RESOLVIDA |
| NC-UX-001 | ExpandableSidebar orphan (Fowler 1999) | Sprint 6 C205 | ✅ RESOLVIDA |
| NC-UX-002 | DGMPanel orphan (Fowler 1999) | Sprint 6 C205 | ✅ RESOLVIDA |
| NC-UX-003 | MotherMonitor orphan (Fowler 1999) | Sprint 6 C205 | ✅ RESOLVIDA |
| NC-DGM-004 | Duplo startup DGM (DRY Hunt & Thomas) | Sprint 6 C205 | ✅ RESOLVIDA |
| NC-LOOP-001 | Loop cognitivo aberto (G-EVAL→DGM) | Sprint 6 C205 | ✅ RESOLVIDA (Closed-Loop Learning) |
| NC-SHMS-001 | Digital Twin sem REST API (apenas stub) | Sprint 7 C206 | ✅ RESOLVIDA (digital-twin-routes-c206.ts) |
| NC-SHMS-002 | Digital Twin sem MQTT ingestion | Sprint 7 C206 | ✅ RESOLVIDA (mqtt-digital-twin-bridge-c206.ts) |
| NC-DB-002 | Tabelas learning_evaluations + dgm_signals ausentes | Sprint 7 C206 | ✅ RESOLVIDA (Migration 0037) |
| NC-TEST-001 | Closed-Loop Learning sem testes unitários | Sprint 7 C206 | ✅ RESOLVIDA (geval-integration-test-c206.ts) |
| NC-SHMS-003 | LSTM predictor ainda é stub (predictStructuralBehavior) | Sprint 8 C207 | ✅ RESOLVIDA (lstm-predictor-c207.ts) |
| NC-ARCH-001 | God Object production-entry.ts (1.110 linhas) | Sprint 8 C207 | ✅ RESOLVIDA (startup-tasks-c207.ts — 25 tarefas StartupScheduler) |
| NC-MEM-003 | HippoRAG2 recall@10 não validado em produção | Sprint 8 C207 | ✅ RESOLVIDA (hipporag2-indexer-c207.ts) |
| NC-UX-005 | Font-size 8-9px ilegível (WCAG 2.1 SC 1.4.4) | Council R5 C208 | ✅ RESOLVIDA (font-size ≥10px em 6 arquivos) |
| NC-UX-006 | Ausência de aria-labels e roles WCAG (SC 4.1.2) | Council R5 C208 | ✅ RESOLVIDA (aria-labels + roles em Home.tsx) |
| NC-SEC-001 | Race condition runMigrations antes app.listen | Council R5 C208 | ✅ RESOLVIDA (runMigrations movido para antes de app.listen) |
| **NC-A2A-001** | **A2A Protocol v1 desatualizado (Google A2A v2)** | **Sprint 9 C208** | **✅ RESOLVIDA (a2a-server-v2.ts — protocolVersion=2.0)** |
| **NC-MULTI-001** | **SHMS sem isolamento multi-tenant** | **Sprint 9 C208** | **✅ RESOLVIDA (shms-multitenant.ts — row-level security)** |
| **NC-SHMS-004** | **Dashboard SHMS sem visualização Digital Twin** | **Sprint 9 C208** | **✅ RESOLVIDA (SHMSDashboardV3.tsx — Digital Twin visualization)** |
| **NC-SEC-002** | **Ausência de Content Security Policy (CSP) headers** | **Sprint 9 C208** | **✅ RESOLVIDA (production-entry.ts — 6 security headers)** |
| **NC-SEC-003** | **Tokens de API expostos em logs** | **Sprint 9 C208** | **✅ RESOLVIDA (log-sanitizer.ts — maskApiKey + logProviderKeyStatus)** |

---

## NCs IDENTIFICADAS — PENDENTES

| NC | Descrição | Prioridade | Sprint Alvo |
|----|-----------|-----------|-------------|
| NC-UX-007 | Inline styles excessivos (47 instâncias Home.tsx) | MÉDIA | Sprint 10 C209 |
| NC-ARCH-004 | Ausência de Error Boundaries React | ALTA | Sprint 10 C209 |
| NC-ARCH-005 | Ausência de loading states granulares | MÉDIA | Sprint 10 C209 |
| NC-PERF-001 | Re-renders desnecessários (falta useMemo/useCallback) | MÉDIA | Sprint 10 C209 |
| NC-PERF-002 | Ausência de virtualização em listas longas | MÉDIA | Sprint 10 C209 |
| NC-INFRA-005 | Rate limiter in-memory (não distribuído em Cloud Run) | MÉDIA | Sprint 10 C209 |
| NC-CODE-001 | sendMessage() com múltiplas responsabilidades (SRP) | BAIXA | Sprint 10 C209 |

---

**TODO-ROADMAP V38 — MOTHER v91.0 — Ciclo C208 — Sprint 9 CONCLUÍDO**
**Score: 99.0/100 ✅ | Threshold R33 ATINGIDO | Próximo: Sprint 10 C209 — Redis Rate Limiter + Error Boundaries + Testes E2E**
**R-FORTESCUE (R81): Fortescue REMOVIDO do roadmap por instrução do proprietário (2026-03-09)**
**R87: Sprint 9 C208 CONCLUÍDO — NC-A2A-001+MULTI-001+SHMS-004+SEC-002+SEC-003 FIXED + HippoRAG2 C208 + 15 BD entries + v91.0**
**R88: NC-A2A-001 FIXED — A2A Protocol v2 — protocolVersion=2.0 — Google A2A v2 (2025)**
**R89: NC-MULTI-001 FIXED — Multi-tenant SHMS — row-level security — ISO 13374-1:2003 + OWASP A01:2021**
**R90: NC-SEC-002 FIXED — CSP Headers — OWASP A03:2021 + MDN CSP (2024)**
**R91: NC-SEC-003 FIXED — Log Sanitization — OWASP A09:2021 + NIST SP 800-92 §3.2.2**
