/**
 * council-v4-cycle179-knowledge.ts
 * Conhecimento adquirido no Ciclo 179 para injeção no bd_central de MOTHER
 * Ciclo 179 | 2026-03-07
 */
import { getDb } from '../db.js';
import { knowledge } from '../../drizzle/schema.js';
import { createLogger } from '../_core/logger.js';

const log = createLogger('KNOWLEDGE-C179');

const C179_ENTRIES = [
  {
    category: 'sprint_result',
    title: 'Sprint 1 Concluído — GitHub R/W + Auto-Deploy',
    content: 'github-read-service.ts (83L) e github-write-service.ts (176L) criados com Octokit REST. GitHubWriteService.autonomousSelfModification() integrado no DGM Phase 4.5. mother-auto-deploy.yml atualizado com pipeline staging→smoke→prod→rollback. scripts/quality-gate.js, smoke-test.js, health-check.js criados. PENDENTE: GITHUB_TOKEN no Cloud Run.',
    source: 'Ciclo 179 — Sprint 1',
  },
  {
    category: 'bug_fix',
    title: 'NC-TS-001 Corrigida — await getDb() em dgm-orchestrator.ts',
    content: 'Bug crítico corrigido: linha 200 de dgm-orchestrator.ts usava const db = getDb() sem await, recebendo Promise em vez de objeto DB. Causa: 8 falhas repetidas no DGM por 177 ciclos. Fix: const db = await getDb(). Validado com pnpm check (0 erros). Embasamento: TypeScript async/await, Drizzle ORM docs.',
    source: 'Ciclo 178 — Sprint 2',
  },
  {
    category: 'bug_fix',
    title: 'NC-ROUTING-001 Descoberta e Corrigida — adaptive-router só inglês',
    content: 'Descoberta crítica no Sprint 3: adaptive-router.ts usava regex exclusivamente em inglês para detectar complexidade. MOTHER recebe queries em português. Resultado: todas as queries PT classificadas como TIER_1 (score=0). Fix: palavras-chave PT adicionadas a todos 8 sinais de complexidade + normalização NFKD para diacríticos. Esta NC não estava no radar do Conselho V4.',
    source: 'Ciclo 178 — Sprint 3',
  },
  {
    category: 'architecture',
    title: 'DGM Phase 4.5 — GitHub Autonomous Self-Modification',
    content: 'Nova fase adicionada ao DGM orchestrator entre DEPLOY e VERIFY: Phase 4.5 cria branch dgm/cycle-{id}-{ts}, commita arquivo modificado, cria PR com título [DGM] + objetivo. autoMerge=false por segurança. Graceful degradation: se GITHUB_TOKEN ausente, fase é pulada sem erro. Embasamento: DGM (arXiv:2408.08435), SICA (arXiv:2504.15228).',
    source: 'Ciclo 179 — Sprint 1.3.2',
  },
  {
    category: 'sprint_result',
    title: 'Sprint 5 Concluído — 180 Módulos Arquivados',
    content: '180 módulos TypeScript (64.662 linhas = 52% do servidor) movidos para server/mother/archive/. Análise BFS de grafo de importações a partir de production-entry.ts. Categorias: SHMS SaaS (12), Infra/Deploy (8), Ferramentas (19), Agentes/UI (8), Memória/Misc (7), outros. README.md criado com inventário e política de restauração. pnpm check: 0 erros após arquivamento.',
    source: 'Ciclo 178 — Sprint 5',
  },
  {
    category: 'sprint_result',
    title: 'Sprint 6 Parcial — SHMS Digital Twin',
    content: 'shms-digital-twin.ts criado (173L) com SensorIngestionService, LSTMAnomalyDetector (z-score proxy para Hundman 2018), AlertDispatcher (4 severidades), TwinStateAPI. Rotas REST registradas em production-entry.ts: /api/shms/twin-state, /api/shms/alerts, /api/shms/sensor-history/:id. PENDENTE: MQTT real, tabelas Drizzle (sensor_readings, sensor_alerts, digital_twin_snapshots).',
    source: 'Ciclo 178-179 — Sprint 6',
  },
  {
    category: 'action_required',
    title: 'BK-001 URGENTE — Configurar GITHUB_TOKEN no Cloud Run',
    content: 'Para ativar o ciclo DGM autônomo completo (Sprint 8.3), é necessário configurar GITHUB_TOKEN como variável de ambiente no Cloud Run. Sem este token, o DGM opera em modo degradado (Phase 4.5 é pulada). Ação: gcloud run services update mother-interface --set-env-vars GITHUB_TOKEN=ghp_xxx --region us-central1. Token precisa de permissões: contents:write, pull_requests:write.',
    source: 'Ciclo 179 — Backlog',
  },
  {
    category: 'validation',
    title: 'TypeScript 0 Erros Confirmado — Ciclo 179',
    content: 'pnpm check passou com 0 erros TypeScript após todas as modificações dos Ciclos 178-179: github-read-service.ts, github-write-service.ts, shms-digital-twin.ts, dgm-orchestrator.ts (Phase 4.5 + await fix), drizzle/schema.ts (17 colunas), adaptive-router.ts (PT keywords), core.ts (languageInjection). Baseline limpa para Ciclo 180.',
    source: 'Ciclo 179 — Validação',
  },
];

export async function injectCycle179Knowledge(): Promise<void> {
  const db = await getDb();
  if (!db) {
    log.warn('[C179-Knowledge] DB not available — skipping knowledge injection');
    return;
  }
  let injected = 0;
  for (const entry of C179_ENTRIES) {
    try {
      await db.insert(knowledge).values({
        category: entry.category,
        title: entry.title,
        content: entry.content,
        source: entry.source,
        sourceType: 'learning' as const,
        tags: JSON.stringify(['ciclo179', 'sprint', entry.category]),
      });
      injected++;
    } catch (err) {
      log.warn(`[C179-Knowledge] Failed to inject: ${entry.title}`, err);
    }
  }
  log.info(`[C179-Knowledge] Injected ${injected}/${C179_ENTRIES.length} entries`);
}
