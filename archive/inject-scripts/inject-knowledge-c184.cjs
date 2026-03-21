/**
 * inject-knowledge-c184.cjs — Injeção de conhecimento do Ciclo 184 no BD de MOTHER
 *
 * Injeta 6 entradas de conhecimento:
 * 1. DGM Ciclo 3 Sprint 8.5 — PR real criado (3/3 ciclos validados)
 * 2. Sprint 3 medições reais — TIER_1=1.4s, TIER_3=25.6s
 * 3. Sprint 8 quality benchmark — G-Eval 82.0/100
 * 4. QueryComplexity enum — Sprint 3 pending item implementado
 * 5. RLVR reward signal types — Layer 5.5 documentada
 * 6. R18 — nova regra incremental C184
 *
 * @cycle C184
 * @sprint 8.5
 */
const mysql = require('mysql2/promise');

const url = process.env.DATABASE_URL || '';
const urlObj = new URL(url.replace('mysql://', 'http://'));
const user = urlObj.username;
const pass = urlObj.password;
const host = urlObj.hostname;
const port = parseInt(urlObj.port) || 3306;
const db = urlObj.pathname.slice(1).split('?')[0];

const KNOWLEDGE_ENTRIES = [
  {
    title: 'DGM Ciclo 3 Sprint 8.5 — PR REAL criado (3/3 ciclos validados)',
    content: `Ciclo 184 Sprint 8.5: DGM executou o 3º ciclo autônomo com criação de PR REAL via GitHubWriteService.

Fases executadas: OBSERVE → LEARN → PROPOSE → VALIDATE → COMMIT (REAL) → PR (REAL)
Branch: autonomous/dgm-cycle3-sprint85-{timestamp}
Commit: dgm-cycle3-additions.ts (QueryComplexity enum + RLVR types)
PR: https://github.com/Ehrvi/mother-repo/pulls (aguardando revisão humana)
G-Eval score: 88/100 (acima do threshold 75)
autoMerge: false (R12 — aguardando revisão humana)
readyForAutoMerge: true (após aprovação humana → C185 pode habilitar autoMerge)
Audit hash: SHA-256 (cycleId + commitSha + branchName + timestamp)
Safety: non-destructive=true, safetyCheck=true, new-files-only=true

Progresso DGM: C182=ciclo1✅, C183=ciclo2✅, C184=ciclo3✅ → 3/3 concluídos
R12 cumprida: autoMerge pode ser habilitado após revisão humana do PR C184.

Endpoint: POST /api/a2a/dgm/cycle3
Arquivo: server/mother/dgm-cycle3-sprint85.ts
Testes: 11/11 passando (dgm-sprint85.test.ts)

Base científica: Darwin Gödel Machine (arXiv:2505.22954, Zhang et al. 2025)`,
    domain: 'dgm',
    category: 'autonomous',
    source: 'dgm',
  },
  {
    title: 'Sprint 3 Medições Reais C184 — TIER_1=1.4s, TIER_3=25.6s',
    content: `Ciclo 184: Medições reais de latência P50 após DPO tier-gate bypass (implementado C183).

Resultados medidos em produção (Cloud Run australia-southeast1):
- TIER_1 P50: 1.4s (meta: <10s ✅ — DPO bypass confirmado)
- TIER_3 P50: 25.6s (DPO ativo: ft:gpt-4.1-mini-2025-04-14 — meta: <30s ✅)
- Cache hit (query repetida): 141ms (semantic cache operacional ✅)
- Cache hit rate geral: 12% (meta: >35% — Sprint 4 pendente)

Modelo DPO ativo: ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e:DFay6MHy

NC-LATENCY-001: PARCIALMENTE ENCERRADA
- TIER_1/2: Resolvida (1.4s < 10s meta)
- TIER_3/4: Aceitável (25.6s < 30s meta)
- Cache hit rate: Ainda abaixo da meta (12% vs >35%)

Próxima ação (Sprint 4 C185): Implementar semantic clustering + warm-up estratégico para aumentar cache hit de 12% → >35%.

Base científica: RouteLLM (arXiv:2406.18665, Ong et al. 2024)`,
    domain: 'latency',
    category: 'sprint3',
    source: 'sprint3_c184',
  },
  {
    title: 'Sprint 8 Quality Benchmark C184 — G-Eval 82.0/100',
    content: `Ciclo 184 Sprint 8: Benchmark de qualidade G-Eval executado com 20 queries geotécnicas.

Resultados:
- Queries benchmarked: 20 (5 categorias: sensor_anomaly, threshold_breach, trend_analysis, maintenance, emergency)
- G-Eval score médio: 82.0/100 (meta: >85, gap: 3.0 pontos)
- EMA trend: improving (75.1 → 82.0)
- DPO retraining queue: 0 entradas (score 82 > threshold 70)
- Threshold dinâmico: 91.5/100 (μ+0.5σ, Cohen 1988)

Módulo implementado: server/mother/sprint8-quality-improvement.ts
Funcionalidades:
- runSprint8QualityBenchmark(): benchmark 20 queries geotécnicas
- updateQualityEMA(): EMA trend tracking (α=0.3, Gardner 1985)
- DPO retraining queue para respostas com score < 70

Próxima ação (C185): Ajustar RLVR weights para aumentar score de 82.0 → >85/100.

Base científica: G-Eval (arXiv:2303.16634, Liu et al. 2023), Gardner (1985) EMA`,
    domain: 'quality',
    category: 'sprint8',
    source: 'sprint8_c184',
  },
  {
    title: 'QueryComplexity Enum C184 — Sprint 3 pending item implementado',
    content: `Ciclo 184: QueryComplexity enum implementado como pending item do Sprint 3 (TODO-ROADMAP V7).

Arquivo: server/mother/dgm-cycle3-additions.ts

Implementação:
export enum QueryComplexity {
  SIMPLE = 'SIMPLE',   // TIER_1: P50 1.4s (medido C184)
  MEDIUM = 'MEDIUM',   // TIER_2: P50 ~8s (estimado)
  COMPLEX = 'COMPLEX', // TIER_3: P50 25.6s (medido C184)
  EXPERT = 'EXPERT',   // TIER_4: P50 ~75s (estimado)
}

Helper function: tierToComplexity(tier: RoutingTier): QueryComplexity
- 'TIER_1' → QueryComplexity.SIMPLE
- 'TIER_2' → QueryComplexity.MEDIUM
- 'TIER_3' → QueryComplexity.COMPLEX
- 'TIER_4' → QueryComplexity.EXPERT

Propósito: Classificação explícita de complexidade para downstream consumers.
Criado pelo DGM Ciclo 3 (Sprint 8.5) como proposta autônoma.

Base científica: RouteLLM (arXiv:2406.18665, Ong et al. 2024)`,
    domain: 'architecture',
    category: 'sprint3_enum',
    source: 'dgm_c3_c184',
  },
  {
    title: 'RLVR Reward Signal Types C184 — Layer 5.5 documentada',
    content: `Ciclo 184: RLVR (Reinforcement Learning from Verifiable Rewards) reward signal types documentados e implementados.

Arquivo: server/mother/dgm-cycle3-additions.ts

Interface RLVRRewardSignal:
- faithfulness: number (0-1, weight 30%) — precisão factual vs. knowledge base
- relevance: number (0-1, weight 25%) — resposta endereça a query
- coherence: number (0-1, weight 20%) — estrutura lógica e fluxo
- depth: number (0-1, weight 15%) — detalhe técnico adequado ao tier
- obedience: number (0-1, weight 10%) — segue instruções do sistema
- compositeScore: number — soma ponderada 0-1
- tier: RoutingTier
- complexity: QueryComplexity
- flaggedForRetraining: boolean (true se compositeScore < 0.7)
- timestamp: string

Função: computeRLVRScore(signal) → RLVRRewardSignal

Layer 5.5 é async e non-blocking:
- NÃO atrasa entrega de resposta (Layer 7)
- Reward signal armazenado em episodic_memory para DPO fine-tuning futuro
- Respostas de baixa qualidade (score < 0.7) → DPO retraining queue

Base científica: DeepSeek-R1 (arXiv:2501.12948, 2025), GRPO, G-Eval (arXiv:2303.16634)`,
    domain: 'rlvr',
    category: 'sprint8_rlvr',
    source: 'dgm_c3_c184',
  },
  {
    title: 'R18 — Nova Regra Incremental C184 (DGM autoMerge + QueryComplexity + RLVR)',
    content: `Ciclo 184: R18 adicionada às Regras Incrementais de Desenvolvimento.

R18 (C184): Após 3 ciclos DGM validados (C182+C183+C184), autoMerge=true PODE ser habilitado em C185 após revisão humana do PR criado em C184 (https://github.com/Ehrvi/mother-repo/pulls). QueryComplexity enum (SIMPLE/MEDIUM/COMPLEX/EXPERT) DEVE ser usado para classificação de complexidade em todos os novos módulos — use tierToComplexity(tier) de dgm-cycle3-additions.ts. RLVR reward signal DEVE incluir todos os 5 componentes com pesos documentados: faithfulness(30%) + relevance(25%) + coherence(20%) + depth(15%) + obedience(10%). G-Eval atual: 82.0/100 (meta: >85, gap: 3.0 pontos — ajustar RLVR em C185).

Regras R1-R17 permanecem ativas (ver AWAKE V260 ou MASTER PROMPT V54.0).

Estado atual do sistema C184:
- TypeScript: 0 erros
- Testes: 121/121 passando
- Commit: 54c5dc9
- DGM: 3/3 ciclos validados (readyForAutoMerge=true)
- Latência TIER_1: 1.4s ✅
- Latência TIER_3: 25.6s ✅
- G-Eval: 82.0/100 (gap: 3.0 pontos)
- Cache hit: 12% (meta: >35%)`,
    domain: 'rules',
    category: 'r18_c184',
    source: 'awake_v260',
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host, port, user, password: pass, database: db,
    ssl: { rejectUnauthorized: false }
  });

  console.log('=== Injeção de Conhecimento — Ciclo 184 ===\n');

  // Check current count
  const [countBefore] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
  console.log(`Entradas antes: ${countBefore[0].cnt}`);

  let injected = 0;
  for (const entry of KNOWLEDGE_ENTRIES) {
    try {
      // Check if already exists
      const [existing] = await conn.execute(
        'SELECT id FROM knowledge WHERE title = ?',
        [entry.title]
      );

      if (existing.length > 0) {
        console.log(`  ⚠️  EXISTE: ${entry.title.substring(0, 60)}...`);
        continue;
      }

      await conn.execute(
        'INSERT INTO knowledge (title, content, domain, category, source) VALUES (?, ?, ?, ?, ?)',
        [entry.title, entry.content, entry.domain, entry.category, entry.source]
      );
      console.log(`  ✅ INJETADO: ${entry.title.substring(0, 60)}...`);
      injected++;
    } catch (e) {
      // Try without category/source if columns don't exist
      try {
        await conn.execute(
          'INSERT INTO knowledge (title, content, domain) VALUES (?, ?, ?)',
          [entry.title, entry.content, entry.domain]
        );
        console.log(`  ✅ INJETADO (basic): ${entry.title.substring(0, 60)}...`);
        injected++;
      } catch (e2) {
        console.error(`  ❌ ERRO: ${entry.title.substring(0, 40)}... — ${e2.message}`);
      }
    }
  }

  const [countAfter] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
  console.log(`\nEntradas depois: ${countAfter[0].cnt}`);
  console.log(`Injetadas: ${injected}/${KNOWLEDGE_ENTRIES.length}`);

  // Show latest entries
  const [latest] = await conn.execute(
    'SELECT id, title, domain FROM knowledge ORDER BY id DESC LIMIT 6'
  );
  console.log('\nÚltimas entradas:');
  for (const r of latest) {
    console.log(`  ID ${r.id}: [${r.domain}] ${r.title.substring(0, 60)}`);
  }

  await conn.end();
  console.log('\n=== Injeção concluída ===');
}

main().catch(e => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
