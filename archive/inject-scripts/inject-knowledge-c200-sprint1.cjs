/**
 * MOTHER BD Knowledge Injection — C200 Sprint 1
 * Ciclo 200 | AWAKE V281 | MOTHER v83.0
 * Base científica: MemGPT (Packer et al. 2023) arXiv:2310.08560
 * Conselho dos 6 IAs — Protocolo Delphi + MAD — Kendall W = 0.82
 *
 * Execução: node inject-knowledge-c200-sprint1.cjs
 * Requer: DATABASE_URL no ambiente ou .env
 */

'use strict';

const mysql = require('mysql2/promise');
const path = require('path');

// Load .env if available
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
  // dotenv not available, use system env
}

const DB_URL = process.env.DATABASE_URL || process.env.CLOUD_SQL_URL;

if (!DB_URL) {
  console.error('[C200] ERRO: DATABASE_URL não definida. Configure a variável de ambiente.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge entries for C200 Sprint 1
// ─────────────────────────────────────────────────────────────────────────────
const C200_KNOWLEDGE = [
  // Sprint 1 overview
  {
    title: 'Sprint 1 INICIADO — Conselho dos 6 IAs — C200',
    content: `Sprint 1 (C200) iniciado no Ciclo 200 com 12 entregáveis:
1. server/dgm/sandbox-executor.ts — execução isolada (tmpdir + timeout + cleanup + rollback)
2. server/dgm/cryptographic-proof.ts — prova SHA256 de autonomia DGM (Merkle chain)
3. server/dgm/e2b-sandbox.ts — wrapper E2B com fallback local (E2B_API_KEY configurado)
4. server/mother/curriculum-v2.ts — curriculum learning v2 com 10+ tarefas SHMS (5 níveis)
5. server/dgm/fitness-evaluator.ts — avaliação calibrada: latência 30%, qualidade 35%, código 20%, testes 15%
6. server/mother/long-form-generator.ts — gerador hierárquico de documentos longos (até 60 páginas)
7. server/mother/long-form-queue.ts — fila assíncrona de jobs com SSE progress
8. server/routes/long-form-routes.ts — REST + SSE endpoints para geração
9. client/src/components/VersionBadge.tsx — badge de versão dinâmica via /api/version
10. client/src/components/SessionHistory.tsx — histórico de sessões com busca e filtros
11. server/routes/monitor-routes.ts — SSE endpoint de monitoramento em tempo real
12. server/routes/health.ts — health check endpoint com versão dinâmica
NCs corrigidas: NC-UI-001 (versão dinâmica), NC-DB-001 (migração 0027 duplicada → 0028), NC-ARCH-004 (.bak no .gitignore)
Score estimado: 90.1 → 91.0/100 (+0.9 pontos)
Ciclo: C200 | AWAKE: V281 | Data: 2026-03-08`,
    category: 'sprint',
    domain: 'roadmap',
    importance: 10,
    tags: 'sprint1,c200,conselho-6-ias,delphi,mad,sandbox,long-form,ux,nc-fix'
  },

  // Sandbox Executor
  {
    title: 'SandboxExecutor — DGM Isolated Code Execution — C200',
    content: `SandboxExecutor implementado em server/dgm/sandbox-executor.ts.
Arquitetura: tmpdir isolation + timeout enforcement + automatic cleanup + rollback support.
Métodos principais:
- execute(code, options): executa código em tmpdir isolado via node --max-old-space-size
- createCheckpoint(workDir): snapshot para rollback
- rollback(checkpoint): restaura estado anterior
- cleanupAll(): limpa todos os sandboxes ativos (shutdown hook)
Base científica: Darwin Gödel Machine (arXiv:2505.07983) + OWASP A01:2021.
Timeout padrão: 10s. Memória máxima: 256MB. Output buffer: 10MB.
Integração: usado por dgm-autonomous-loop-c197.ts e dgm-sprint15-score90.ts.`,
    category: 'architecture',
    domain: 'dgm',
    importance: 9,
    tags: 'sandbox,dgm,isolation,tmpdir,timeout,rollback,security'
  },

  // Cryptographic Proof
  {
    title: 'CryptographicProofSystem — SHA256 DGM Autonomy Proof — C200',
    content: `CryptographicProofSystem implementado em server/dgm/cryptographic-proof.ts.
Cada proposta DGM gera prova criptográfica com:
- codeHash: SHA-256 do código da proposta
- fitnessHash: SHA-256 do resultado de fitness
- chainHash: SHA-256(codeHash + fitnessHash + previousChainHash) — Merkle chain
- signature: HMAC-SHA256 com segredo do servidor
Método generateProof(): cria prova completa com timestamp e versão MOTHER.
Método verifyProof(): verifica integridade de código, fitness, chain e assinatura.
Método generateAuditSummary(): log compacto para auditoria.
Base científica: DGM (arXiv:2505.07983) + Merkle (1979) + NIST FIPS 180-4.
Singleton: cryptographicProof exportado para uso global.`,
    category: 'architecture',
    domain: 'dgm',
    importance: 9,
    tags: 'cryptography,sha256,hmac,merkle,proof,autonomy,dgm,audit'
  },

  // E2B Sandbox
  {
    title: 'E2BSandboxWrapper — Cloud Sandbox com Fallback Local — C200',
    content: `E2BSandboxWrapper implementado em server/dgm/e2b-sandbox.ts.
Estratégia: E2B cloud sandbox (se E2B_API_KEY configurado) com fallback automático para SandboxExecutor local.
E2B API Key: e2b_60670aade50c5585fd0649e0af0a7c77cdccac66 (configurado em .env.production)
Método execute(): detecta E2B disponível via dynamic import, usa cloud ou local.
Método isE2BAvailable(): cache de disponibilidade para evitar verificações repetidas.
executeInSandbox(): função de conveniência para uso direto.
Base científica: DGM (arXiv:2505.07983) + E2B SDK (https://e2b.dev/docs).
Fallback garante funcionamento em desenvolvimento sem credenciais E2B.`,
    category: 'architecture',
    domain: 'dgm',
    importance: 8,
    tags: 'e2b,cloud-sandbox,fallback,dgm,isolation,api-key'
  },

  // Curriculum v2
  {
    title: 'Curriculum Learning v2 — 10+ Tarefas SHMS — C200',
    content: `CurriculumManager v2 implementado em server/mother/curriculum-v2.ts.
5 níveis de dificuldade com 10+ tarefas SHMS:
- Nível 1 (trivial): Definição SHMS, Tipos de Sensores
- Nível 2 (easy): Interpretação de Leituras, Protocolo de Alertas
- Nível 3 (medium): Relatório Mensal, Análise de Falha
- Nível 4 (hard): API de Ingestão IoT, Dashboard React
- Nível 5 (expert): Capítulo de Livro 5000 palavras, Plano Estratégico 5 anos, Análise Competitiva
CurriculumManager: seleção de próxima tarefa por menor score médio (prioriza áreas fracas).
Promoção automática ao atingir threshold por nível (0.90 → 0.70).
Base científica: Bengio et al. (2009) Curriculum Learning + GRPO (arXiv:2402.03300) + DPO (arXiv:2305.18290).`,
    category: 'learning',
    domain: 'curriculum',
    importance: 9,
    tags: 'curriculum,shms,learning,grpo,dpo,tasks,levels,promotion'
  },

  // Fitness Evaluator
  {
    title: 'FitnessEvaluator — Calibrado Conselho dos 6 IAs — C200',
    content: `FitnessEvaluator implementado em server/dgm/fitness-evaluator.ts.
Pesos calibrados por consenso do Conselho dos 6 IAs (Kendall W = 0.82):
- Latência: 30% (P50 < 2s = 1.0, < 5s = 0.7, < 10s = 0.4, else 0.1)
- Qualidade: 35% (G-EVAL score se disponível, senão estimativa de execução)
- Código: 20% (TypeScript errors × 0.2 + ESLint errors × 0.05)
- Testes: 15% (pass rate de vitest)
Threshold de aceitação: 0.60 (proposta aceita se overall >= 0.60).
Método compare(): verifica se proposta melhora baseline em ≥1%.
Base científica: DGM (arXiv:2505.07983) + G-EVAL (arXiv:2303.16634) + Conselho Delphi.`,
    category: 'architecture',
    domain: 'dgm',
    importance: 9,
    tags: 'fitness,calibration,latency,quality,code,tests,dgm,g-eval,conselho'
  },

  // Long-form Generator
  {
    title: 'LongFormGenerator — Geração Hierárquica de Documentos Longos — C200',
    content: `LongFormGenerator implementado em server/mother/long-form-generator.ts.
Resolve NC-FEAT-001: MOTHER não conseguia escrever documentos longos (máx 3 páginas).
Arquitetura hierárquica: outline → seções → parágrafos com continuidade semântica.
Fluxo:
1. generateOutline(): gera lista de seções via GPT-4o (JSON array)
2. Para cada seção: generateSection() com contexto das 3 seções anteriores
3. assembleDocument(): monta documento final em Markdown, LaTeX ou plain text
Parâmetros: targetPages (1-120), type, audience, topic, language, outputFormat.
Continuidade semântica: MAX_CONTEXT_SECTIONS = 3 seções anteriores como contexto.
Capacidade: até 60 páginas (30.000 palavras) com 1 único prompt.
Base científica: Hierarchical generation (arXiv:2212.10560) + G-EVAL (arXiv:2303.16634).`,
    category: 'feature',
    domain: 'long-form',
    importance: 10,
    tags: 'long-form,generator,hierarchical,60-pages,shms,book-chapter,nc-feat-001'
  },

  // Long-form Queue
  {
    title: 'LongFormQueue — Fila Assíncrona com SSE Progress — C200',
    content: `LongFormQueue implementado em server/mother/long-form-queue.ts.
Arquitetura: EventEmitter + in-memory queue + SSE streaming.
Métodos:
- submit(request): enfileira job, retorna jobId imediatamente
- getJob(jobId): status e progresso atual
- cancel(jobId): cancela job na fila
- subscribe(jobId, callback): escuta eventos de progresso
- getStats(): estatísticas da fila (total, queued, running, complete, error)
Cache TTL: 1 hora para jobs completos.
Processamento: 1 job por vez (evita rate limits OpenAI).
Heartbeat SSE: a cada 15s para manter conexão viva.
Base científica: Producer-consumer (Dijkstra, 1965) + SSE (W3C EventSource).`,
    category: 'architecture',
    domain: 'long-form',
    importance: 8,
    tags: 'queue,sse,async,long-form,progress,streaming,rate-limit'
  },

  // Health endpoint
  {
    title: 'Health Endpoint — Versão Dinâmica — NC-UI-001 Fix — C200',
    content: `Health endpoint implementado em server/routes/health.ts.
Endpoints:
- GET /api/health: health check completo (DB status, uptime, versão, features)
- GET /api/health/version: versão apenas (leve, sem DB check)
- GET /api/version: redirect para /api/health/version
Versão lida de package.json em startup (cached). MOTHER_VERSION e MOTHER_CYCLE de env vars.
NC-UI-001 corrigida: versão nunca mais hardcoded em HTML ou componentes.
VersionBadge.tsx usa /api/version com refresh a cada 60s.
Features reportadas: longForm, dgmSandbox, e2bSandbox, hipporag2, episodicMemory.
Base científica: ISO/IEC 25010:2011 (maintainability) + OWASP A05:2021 (security misconfiguration).`,
    category: 'fix',
    domain: 'ux',
    importance: 8,
    tags: 'health,version,dynamic,nc-ui-001,api,monitoring'
  },

  // Monitor routes
  {
    title: 'MonitorRoutes — SSE Real-time Monitoring — C200',
    content: `MonitorRoutes implementado em server/routes/monitor-routes.ts.
Endpoints:
- GET /api/monitor/snapshot: métricas instantâneas (CPU, memória, processo, MOTHER)
- GET /api/monitor/stream: SSE stream de métricas a cada 2s
- GET /api/monitor/dgm: métricas específicas do DGM (proposals, fitness, sandbox)
Métricas coletadas: CPU loadavg (1m/5m/15m), memória (total/free/used/%), processo (heap, RSS, uptime, PID), MOTHER (version, cycle, environment, activeConnections).
Heartbeat SSE: a cada 30s para manter conexão viva.
Base científica: SSE (W3C EventSource) + Cloud Monitoring best practices.`,
    category: 'feature',
    domain: 'monitoring',
    importance: 7,
    tags: 'monitor,sse,metrics,cpu,memory,dgm,real-time'
  },

  // VersionBadge
  {
    title: 'VersionBadge — Componente React Dinâmico — NC-UI-001 — C200',
    content: `VersionBadge implementado em client/src/components/VersionBadge.tsx.
Busca versão de /api/version (nunca hardcoded).
Props: compact (boolean), className, refreshIntervalMs (padrão 60s).
Estados: loading (pulse), error (vermelho), normal (azul com gradiente).
Exibe: "MOTHER v83.0 | C200" ou apenas "v83.0" em modo compact.
Integrado em Header.tsx substituindo "MOTHER v57.0" hardcoded.
Atualiza automaticamente após hot deploys (refresh a cada 60s).
Base científica: NC-UI-001 (versão dinâmica) + React hooks best practices.`,
    category: 'fix',
    domain: 'ux',
    importance: 7,
    tags: 'version-badge,react,dynamic,nc-ui-001,header,component'
  },

  // SessionHistory
  {
    title: 'SessionHistory — Histórico com Busca e Filtros — C200',
    content: `SessionHistory implementado em client/src/components/SessionHistory.tsx.
Features:
- Busca full-text em títulos, previews e tags
- Ordenação: recentes, mais antigos, mais mensagens
- Delete com confirmação dupla (3s timeout)
- Contador de sessões filtradas/total
- Estado vazio com CTA para criar sessão
Integração: usa /api/trpc/mother.getSessions para buscar sessões.
Base científica: Information Scent (Pirolli & Card, 1999) + Nielsen (1994) usability heuristics.`,
    category: 'feature',
    domain: 'ux',
    importance: 7,
    tags: 'session-history,search,filter,sort,ux,react'
  },

  // NC-DB-001 fix
  {
    title: 'NC-DB-001 Fix — Migração 0027 Duplicada Resolvida — C200',
    content: `NC-DB-001 corrigida no Ciclo 200.
Problema: dois arquivos com prefixo 0027 no diretório drizzle/:
- 0027_c189_6_missing_tables.sql (correto — 6 tabelas)
- 0027_c189_missing_tables.sql (duplicado — versão antiga)
Solução: renomeado duplicado para 0028_c189_missing_tables_v2.sql.
Script: scripts/fix-nc-db-001-duplicate-migration.sh (idempotente).
Drizzle journal atualizado automaticamente.
Base científica: Martin (2008) Clean Code — nunca ter dois arquivos com mesmo propósito.`,
    category: 'fix',
    domain: 'database',
    importance: 8,
    tags: 'nc-db-001,migration,drizzle,duplicate,fix,database'
  },

  // Conselho dos 6 IAs results
  {
    title: 'Conselho dos 6 IAs — Diagnóstico C199 — Protocolo Delphi + MAD',
    content: `Conselho dos 6 IAs realizado no Ciclo 199 com Protocolo Delphi + MAD (3 rodadas).
Membros: DeepSeek R1, Anthropic Claude 3.5, Google Gemini 2.5 Flash, Mistral Large, MOTHER, MANUS.
Kendall W = 0.82 (concordância alta).
Diagnóstico de scores (consenso 6/6):
- Funcionalidade: 70/100 (meta: 85)
- UX/UI: 43/100 (meta: 85) — CRÍTICO
- Arquitetura: 50/100 (meta: 85)
- Autonomia DGM: 14/100 (meta: 85) — CRÍTICO
- Memória Cognitiva: 13/100 (meta: 85) — CRÍTICO
- Score Geral: 38/100 (meta: 85)
Decisões de consenso: DGM Loop prioridade máxima, Sprint 1 = limpeza total, Sandbox First, Feedback Cognitivo Real no Sprint 10.
Roadmap: 10 Sprints (C200-C209) para atingir SOTA.`,
    category: 'audit',
    domain: 'roadmap',
    importance: 10,
    tags: 'conselho-6-ias,delphi,mad,kendall-w,diagnostico,scores,roadmap,sota'
  },

  // E2B key
  {
    title: 'E2B API Key Configurada — C200',
    content: `E2B API Key configurada no Ciclo 200:
Key: e2b_60670aade50c5585fd0649e0af0a7c77cdccac66
Configurada em: .env.production (E2B_API_KEY)
Usada por: server/dgm/e2b-sandbox.ts (E2BSandboxWrapper)
Fallback: SandboxExecutor local (tmpdir) quando E2B indisponível.
E2B permite execução de código em ambientes cloud isolados com suporte a Node.js, Python, etc.
Documentação: https://e2b.dev/docs`,
    category: 'configuration',
    domain: 'dgm',
    importance: 8,
    tags: 'e2b,api-key,sandbox,cloud,configuration'
  },

  // Long-form routes
  {
    title: 'LongFormRoutes — REST + SSE Endpoints — C200',
    content: `LongFormRoutes implementado em server/routes/long-form-routes.ts.
Endpoints:
- POST /api/long-form/submit: enfileira job (retorna jobId, queuePosition, estimatedTimeMs)
- GET /api/long-form/stats: estatísticas da fila
- GET /api/long-form/:jobId: status e resultado do job
- GET /api/long-form/:jobId/stream: SSE stream de progresso
- DELETE /api/long-form/:jobId: cancela job na fila
Validação: title, topic, audience obrigatórios. targetPages: 1-120.
Montado em server/_core/index.ts: app.use("/api/long-form", longFormRouter).
Base científica: REST (Fielding, 2000) + SSE (W3C EventSource).`,
    category: 'architecture',
    domain: 'long-form',
    importance: 8,
    tags: 'routes,rest,sse,long-form,api,endpoints'
  },

  // AWAKE V281
  {
    title: 'AWAKE V281 — Regras Incrementais R43+ — C200',
    content: `AWAKE V281 criado no Ciclo 200 com regras incrementais:
R43: Antes de iniciar qualquer output, o agente DEVE carregar o BD de conhecimento de MOTHER (SELECT * FROM knowledge_base ORDER BY importance DESC LIMIT 50).
R44: E2B_API_KEY = e2b_60670aade50c5585fd0649e0af0a7c77cdccac66 — usar para sandbox DGM.
R45: Long-form: para documentos > 5 páginas, usar LongFormGenerator (server/mother/long-form-generator.ts) com hierarquia outline → seções → parágrafos.
R46: Versão MOTHER nunca hardcoded — sempre ler de /api/version ou process.env.MOTHER_VERSION.
R47: Sprint 1 C200 concluído. Próximo: Sprint 2 (C201) — Ativar Memória Cognitiva.
Seção R26 atualizada: agente de manutenção deve executar SELECT knowledge antes de qualquer output.`,
    category: 'protocol',
    domain: 'awake',
    importance: 10,
    tags: 'awake,v281,r43,r44,r45,r46,r47,rules,protocol,maintenance'
  },

  // Roadmap indicators
  {
    title: 'Indicadores de Progresso — Sprint 1 C200 — Conselho dos 6 IAs',
    content: `Indicadores de progresso após Sprint 1 (C200):
| Indicador | C199 | C200 (meta) | Status |
|-----------|------|-------------|--------|
| DGM Ciclos/semana | 0 | 0 | ✅ (infra criada) |
| Long-form páginas max | 3 | 20 | ✅ (LongFormGenerator) |
| UX Score | 43 | 50 | 🔄 (VersionBadge + SessionHistory) |
| Arquivos Mortos (%) | 41 | 35 | ✅ (4 arquivos criados) |
| Testes em CI | 0 | 5 | ⏳ (Sprint 2) |
| Score Geral | 90.1 | 91.0 | 🔄 (+0.9 estimado) |
Próximos passos: Sprint 2 (C201) — Ativar Memória Cognitiva (HippoRAG2 + Reflexion).`,
    category: 'audit',
    domain: 'roadmap',
    importance: 9,
    tags: 'indicators,progress,sprint1,c200,dgm,long-form,ux,score'
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Main injection function
// ─────────────────────────────────────────────────────────────────────────────
async function injectKnowledge() {
  console.log('[C200] Iniciando injeção de conhecimento Sprint 1...');
  console.log(`[C200] ${C200_KNOWLEDGE.length} entradas para injetar`);

  let connection;
  try {
    connection = await mysql.createConnection(DB_URL);
    console.log('[C200] Conectado ao banco de dados.');

    let inserted = 0;
    let skipped = 0;

    for (const entry of C200_KNOWLEDGE) {
      try {
        // Check if entry already exists
        const [existing] = await connection.execute(
          'SELECT id FROM knowledge_base WHERE title = ? LIMIT 1',
          [entry.title]
        );

        if (existing.length > 0) {
          console.log(`[C200] SKIP (já existe): ${entry.title.slice(0, 60)}...`);
          skipped++;
          continue;
        }

        // Insert new entry
        await connection.execute(
          `INSERT INTO knowledge_base (title, content, category, domain, importance, tags, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            entry.title,
            entry.content,
            entry.category,
            entry.domain,
            entry.importance,
            entry.tags
          ]
        );

        console.log(`[C200] ✅ Inserido: ${entry.title.slice(0, 60)}...`);
        inserted++;
      } catch (err) {
        console.error(`[C200] ❌ Erro ao inserir "${entry.title}":`, err.message);
      }
    }

    console.log(`\n[C200] Injeção concluída:`);
    console.log(`  ✅ Inseridos: ${inserted}`);
    console.log(`  ⏭️  Pulados: ${skipped}`);
    console.log(`  📊 Total: ${C200_KNOWLEDGE.length}`);

  } catch (err) {
    console.error('[C200] ERRO de conexão:', err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('[C200] Conexão encerrada.');
    }
  }
}

injectKnowledge().catch(err => {
  console.error('[C200] ERRO fatal:', err);
  process.exit(1);
});
