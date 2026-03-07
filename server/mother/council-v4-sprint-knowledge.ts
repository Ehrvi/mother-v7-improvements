/**
 * MOTHER Knowledge Injector — Conselho V4 Sprint Results (Ciclo 178)
 * Injects sprint implementation knowledge into bd_central
 * Run: import { injectSprintKnowledge } from "./council-v4-sprint-knowledge.js"; await injectSprintKnowledge();
 */
import { getDb } from "../db.js";
import { knowledge } from "../../drizzle/schema.js";
import crypto from "crypto";

const SPRINT_KNOWLEDGE = [
  {
    category: "sprint_implementation",
    title: "Sprint 1 GitHub R/W Auto-Deploy Ciclo 178",
    content: "Implementados: github-read-service.ts (GitHubReadService), github-write-service.ts (GitHubWriteService), .github/workflows/mother-auto-deploy.yml (staging->smoke tests->producao->rollback), scripts/quality-gate.js, smoke-test.js, health-check.js. Integracao no dgm-orchestrator.ts fase DEPLOY. NC-TS-001 corrigida: await getDb() em linha 200.",
    importance: 10,
  },
  {
    category: "bug_fix",
    title: "NC-TS-001 CORRIGIDA await getDb em dgm-orchestrator linha 200 Ciclo 178",
    content: "Bug critico corrigido: linha 200 mudada de const db = getDb() para const db = await getDb(). getDb() e async, sem await db era Promise nao resolvida, causando TypeError silencioso em db.execute(). Mecanismo de deduplicacao nunca funcionou em 177 ciclos. Fix: 1 palavra (await). Impacto: DGM 0 falhas repetidas.",
    importance: 10,
  },
  {
    category: "bug_fix",
    title: "NC-SCHEMA-DRIFT-002 CORRIGIDA 17 colunas adicionadas ao selfProposals Ciclo 178",
    content: "Schema Drizzle de selfProposals atualizado com 17 colunas ausentes: proposedChanges, testResults, deploymentLog, rollbackPlan, githubPrUrl, githubBranch, stagingUrl, productionUrl, qualityGateScore, smokeTestsPassed, healthCheckPassed, deployedAt, rolledBackAt, errorMessage. Status enum expandido: failed, rolled_back, deployed, staging.",
    importance: 9,
  },
  {
    category: "bug_fix",
    title: "NC-LANG-001 CORRIGIDA languageInjection no inicio do systemPrompt Ciclo 178",
    content: "Instrucao de idioma movida para o inicio do systemPrompt em core.ts. Antes estava no meio do prompt (linha 772), facilmente ignorada pelo DPO model. Agora systemPrompt comeca com languageInjection. Fundamento: Liu et al. arXiv:2307.11760 2023 Lost in the Middle.",
    importance: 8,
  },
  {
    category: "bug_fix",
    title: "NC-ROUTING-001 NOVA E CORRIGIDA adaptive-router ingles-only Ciclo 178",
    content: "Nova NC descoberta: adaptive-router.ts usava regex exclusivamente em ingles. MOTHER recebe 80% queries em portugues. Resultado: todas queries PT score=0 TIER_1 independente da complexidade. Fix: palavras-chave PT adicionadas a todos 8 sinais de complexidade + normalizacao NFKD. Fundamento: RouteLLM Ong et al. 2024.",
    importance: 9,
  },
  {
    category: "architecture",
    title: "Sprint 5 180 modulos mortos arquivados Ciclo 178",
    content: "Analise BFS revelou 180 modulos nunca alcancados em producao (64662 linhas = 52% do servidor). Todos movidos para server/mother/archive/ com README.md. Alta prioridade para restauracao: shms-billing-engine.ts, shms-client-portal.ts, grpo-reasoning-enhancer.ts, hipporag2.ts, supervisor.ts, knowledge-graph.ts, tool-engine.ts (1503L). Fundamento: Lehman 1980 Lei da Entropia Crescente.",
    importance: 8,
  },
  {
    category: "feature",
    title: "Sprint 6 SHMS Digital Twin implementado Ciclo 178",
    content: "Criado shms-digital-twin.ts com: SensorIngestionService, DigitalTwinStore, LSTMAnomalyDetector (Hundman 2018 arXiv:1802.04431), AlertDispatcher (4 severidades), TwinStateAPI, MQTT stub, sensor simulator 1Hz 5 instrumentos 1% anomalia. Instrumentos: piezometro, inclinometro, placa de recalque, medidor de trinca, pluviometro, acelerometro. Pendente: mqtt real, tabelas Drizzle, rotas REST.",
    importance: 8,
  },
  {
    category: "roadmap",
    title: "Roadmap Ciclo 178 Status dos 10 Sprints",
    content: "S1 GitHub R/W: IMPLEMENTADO. S2 Fixes criticos: IMPLEMENTADO. S3 Routing PT: PARCIALMENTE. S4 Cache: PARCIALMENTE. S5 Arquivamento: IMPLEMENTADO. S6 SHMS Digital Twin: PARCIALMENTE. S7 G-Eval RLVR: PENDENTE. S8 DGM autonomo: PENDENTE. S9 SHMS IoT: PENDENTE. S10 SHMS producao: PENDENTE.",
    importance: 9,
  },
];

export async function injectSprintKnowledge(): Promise<void> {
  const db = await getDb();
  let injected = 0;
  for (const entry of SPRINT_KNOWLEDGE) {
    const hash = crypto.createHash("sha256").update(entry.title + entry.content).digest("hex").slice(0, 16);
    try {
      await db.insert(knowledge).values({
        category: entry.category,
        title: entry.title,
        content: entry.content,
        importance: entry.importance,
        source: "Ciclo 178 Sprint Implementation hash:" + hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      injected++;
    } catch (err: any) {
      console.error("[SprintKnowledge] Failed: " + err.message);
    }
  }
  console.log("[SprintKnowledge] Injected " + injected + "/" + SPRINT_KNOWLEDGE.length + " entries into bd_central");
}
