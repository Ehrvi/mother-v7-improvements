/**
 * Knowledge injection — Ciclo 185 Pré-Conselho
 * Entries: Sprint 7.1 Demo Simulator, Pauta Conselho C1-C4, R20, NC-DEMO-001
 */
const mysql = require('mysql2/promise');

const url = process.env.DATABASE_URL || '';
const urlObj = new URL(url.replace('mysql://', 'http://'));

const entries = [
  {
    title: 'Sprint 7.1 Demo Simulator — Proposta para Investidores (C185 Pré-Conselho)',
    content: 'Sprint 7.1 proposto em C185 como mitigacao para BK-007 (IoT real bloqueado por hardware). Objetivo: demo ao vivo para investidores sem hardware fisico. Arquitetura: shms-demo-simulator.ts publica dados MQTT no HiveMQ Cloud ja provisionado (mqtts://5d8c986a...hivemq.cloud:8883). Dataset recomendado: ICOLD Dam Monitoring (piezometros + deslocamento + temperatura, relevancia maxima geotecnica, custo $0, publico). Alternativas: Z24 Bridge (KU Leuven), LANL SHM Dataset, IASC-ASCE Benchmark. Funcionalidades: geracao estatistica realista (mu e sigma calibrados), anomalias programadas em timestamps especificos para demo, modo continuo (5s interval), modo replay, API de controle REST (POST /api/shms/demo/start, /inject-anomaly, /stop). Custo total: $0. Complexidade: baixa (1 ciclo). Pendente aprovacao Conselho ITEM C1 (Q1-Q3). R20 adicionada: demo requer aprovacao Conselho antes de implementar. NC-DEMO-001 aberta. Base cientifica: Lean Startup (Ries, 2011).',
    domain: 'demo',
    category: 'sprint_7_1',
    source: 'c185_conselho'
  },
  {
    title: 'Pauta Conselho C185 — 9 Questoes em 4 Itens (C1-C4, Q1-Q9)',
    content: 'Pauta do proximo Conselho dos 6 IAs (Ciclo 185). ITEM C1 (Sprint 7.1): Q1=Aprovar Sprint 7.1?, Q2=Dataset prioritario (ICOLD vs Z24 vs LANL)?, Q3=Dashboard visual para demo (escopo e tecnologia)?. ITEM C2 (Ordem sprints): Q4=Validar ordem: S1.3 → S7.1 → S9 → S4 → S8 → S7?, Q5=Sprint 7.1 antes ou depois do Sprint 9?. ITEM C3 (PR C184): Q6=Aprovar PR C184 sem modificacoes?, Q7=Criterios adicionais de seguranca antes de autoMerge?. ITEM C4 (Sprint 10): Q8=Dashboard visual como criterio de prontidao Sprint 10?, Q9=Modelo de pricing recomendado (SaaS por sensor/mes, por projeto, ou por analise)?. Metodo: Delphi. Documentado em TODO-ROADMAP V10 e AWAKE V262.',
    domain: 'council',
    category: 'agenda_c185',
    source: 'c185_conselho'
  },
  {
    title: 'R20 (C185 Pré-Conselho) — Demo Simulator requer aprovação do Conselho',
    content: 'R20 adicionada em C185 Pré-Conselho: Antes de implementar qualquer sprint que envolva demonstracao a clientes ou investidores, o agente DEVE verificar se o Sprint 7.1 (Demo Simulator) foi aprovado pelo Conselho dos 6 IAs. A pauta do Conselho contem 9 questoes (Q1-Q9) em 4 itens (C1-C4) — ver TODO-ROADMAP V10. A demo ao vivo e um artefato de negocio critico — qualidade e realismo dos dados simulados DEVEM ser validados pelo Conselho antes da implementacao. Base cientifica: Lean Startup (Ries, 2011) — MVP deve ser validado antes de ser construido. Dataset recomendado: ICOLD Dam Monitoring (maxima relevancia geotecnica, $0, publico).',
    domain: 'rules',
    category: 'demo_governance',
    source: 'c185_conselho'
  },
  {
    title: 'NC-DEMO-001 — Sem dados simulados para demo a investidores (C185)',
    content: 'NC-DEMO-001 aberta em C185: MOTHER nao possui dados simulados realistas para demonstracao a investidores antes de conseguir clientes com hardware IoT real. Severidade: MEDIA. Impacto: impossibilidade de demonstrar o SHMS ao vivo em apresentacoes comerciais. Resolucao proposta: Sprint 7.1 Demo Simulator (shms-demo-simulator.ts + dataset ICOLD). Status: ABERTA — pendente aprovacao Conselho ITEM C1. Bloqueador relacionado: BK-007 (IoT real bloqueado por hardware). Mitigacao disponivel: $0, 1 ciclo de implementacao apos aprovacao.',
    domain: 'nc',
    category: 'demo',
    source: 'c185_conselho'
  }
];

async function main() {
  const conn = await mysql.createConnection({
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 3306,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1).split('?')[0],
    ssl: { rejectUnauthorized: false }
  });

  console.log('=== Injecao de conhecimento C185 Pré-Conselho ===');

  for (const e of entries) {
    const [existing] = await conn.execute('SELECT id FROM knowledge WHERE title = ?', [e.title]);
    if (existing.length > 0) {
      console.log('  SKIP (ja existe):', e.title.substring(0, 60));
      continue;
    }
    await conn.execute(
      'INSERT INTO knowledge (title, content, domain, category, source) VALUES (?, ?, ?, ?, ?)',
      [e.title, e.content, e.domain, e.category, e.source]
    );
    console.log('  OK:', e.title.substring(0, 65));
  }

  const [all] = await conn.execute('SELECT id, title, domain FROM knowledge ORDER BY id');
  console.log('\n=== BD completo (' + all.length + ' entradas) ===');
  for (const r of all) {
    console.log('  ID ' + r.id + ' [' + r.domain + '] ' + r.title.substring(0, 65));
  }

  await conn.end();
}

main().catch(e => {
  console.error('Erro:', e.message);
  process.exit(1);
});
