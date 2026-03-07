/**
 * council-v4-cycle182-knowledge.ts — MOTHER v81.8 — Ciclo 182
 *
 * Knowledge injection script for Cycle 182 learnings:
 * - Sprint 7: G-Eval geotechnical calibration (50 examples)
 * - Sprint 7: SHMS analyze endpoint (/api/shms/analyze)
 * - Sprint 8.3: DGM first autonomous cycle test
 * - BK-001: GITHUB_TOKEN resolved
 * - R16: Dynamic G-Eval threshold + DGM audit hash
 *
 * Run: npx tsx server/mother/council-v4-cycle182-knowledge.ts
 *
 * @module council-v4-cycle182-knowledge
 * @cycle C182
 */

import { addKnowledge } from './knowledge.js';

const C182_KNOWLEDGE = [
  {
    title: 'Sprint 7 C182: G-Eval Geotécnico — 50 Exemplos Anotados',
    content:
      'Calibração G-Eval para domínio geotécnico com 50 exemplos anotados por especialistas. ' +
      'Categorias: sensor_anomaly(12), threshold_breach(10), trend_analysis(10), maintenance(10), emergency(8). ' +
      'Matriz de pesos: technicalAccuracy(30%), safetyCriticality(25%), quantitativePrecision(20%), ' +
      'actionability(15%), scientificGrounding(10%). ' +
      'Threshold dinâmico: μ+0.5σ = 91.5/100 (Cohen 1988 — Statistical Power Analysis). ' +
      'Normas aplicadas: ABNT NBR 13028:2017, ICOLD Bulletin 158 (2014), Resolução ANA 236/2017. ' +
      'Base científica: G-Eval arXiv:2303.16634 (Liu et al. 2023), RAGAS arXiv:2309.15217 (Es et al. 2023). ' +
      'Arquivo: server/mother/shms-geval-geotechnical.ts v1.0.0. Testes: 7/7 passando.',
    category: 'sprint7_geval',
    source: 'council-v4-cycle182-knowledge',
    domain: 'shms_geotechnical',
  },
  {
    title: 'Sprint 7 C182: Endpoint POST /api/shms/analyze Implementado',
    content:
      'Endpoint REST para análise MOTHER de dados de sensores SHMS implementado em C182. ' +
      'POST /api/shms/analyze: recebe { sensorId?, query, clientId?, includeAlerts?, category? }, ' +
      'retorna { analysis, alertLevel, gevalScore, passesThreshold, twinState, activeAlerts, sensorContext, processingTimeMs }. ' +
      'GET /api/shms/calibration: retorna estado da calibração G-Eval geotécnica. ' +
      'Integra: Digital Twin (getTwinState) + G-Eval (evaluateGeotechnicalResponse) + Alert dispatch (triggerAlert). ' +
      'Análise estruturada em PT-BR com recomendações por nível (info/warning/critical/emergency). ' +
      'Arquivo: server/mother/shms-analyze-endpoint.ts v1.0.1. Testes: 8/8 passando. ' +
      'Base científica: Sun et al. (2025) DOI:10.1145/3777730.3777858, GeoMCP arXiv:2603.01022.',
    category: 'sprint7_endpoint',
    source: 'council-v4-cycle182-knowledge',
    domain: 'shms_api',
  },
  {
    title: 'Sprint 8.3 C182: DGM Primeiro Ciclo Autônomo (Modo Teste)',
    content:
      'Primeiro ciclo autônomo do DGM implementado e testado em C182. ' +
      '6 fases: OBSERVE → LEARN → PROPOSE → VALIDATE → COMMIT (test) → PR (test). ' +
      'Resultado: 3/3 propostas aprovadas (G-Eval ≥75), SHA-256 audit hash por ciclo, autoMerge=false. ' +
      'GITHUB_TOKEN válido (ghu_*, admin: True, push: True) — BK-001 resolvido em C181. ' +
      'Endpoints: GET /api/a2a/dgm/autonomous-status, POST /api/a2a/dgm/autonomous-cycle-test. ' +
      'Arquivo: server/mother/dgm-autonomous-cycle-test.ts v1.0.0. Testes: 8/8 passando. ' +
      'Base científica: Darwin Gödel Machine arXiv:2505.22954 (Zhang et al. 2025), ' +
      'Constitutional AI arXiv:2212.08073 (Anthropic 2022). ' +
      'Próximo passo (Sprint 8.4): habilitar PR real após 2 ciclos adicionais de validação humana.',
    category: 'sprint83_dgm',
    source: 'council-v4-cycle182-knowledge',
    domain: 'dgm_autonomy',
  },
  {
    title: 'R16 C182: G-Eval Threshold Dinâmico + DGM Audit Hash',
    content:
      'Nova regra incremental R16 adicionada em C182. ' +
      'G-Eval geotécnico DEVE usar threshold dinâmico μ+0.5σ (Cohen 1988) — threshold fixo é proibido. ' +
      'Calibrar com conjunto de referência a cada sprint para adaptar ao domínio. ' +
      'DGM autônomo DEVE incluir SHA-256 audit hash em cada ciclo para rastreabilidade completa. ' +
      'Hash calculado sobre: cycleId + propostas aprovadas + timestamp. ' +
      'Isso garante auditabilidade total das modificações autônomas conforme ' +
      'Tang et al. (2025) DOI:10.1038/s41467-025-63913-1 (riscos de IA autônoma).',
    category: 'regra_r16',
    source: 'council-v4-cycle182-knowledge',
    domain: 'governance',
  },
  {
    title: 'C182: Métricas e Estado de Produção',
    content:
      'Estado de produção após Ciclo 182: ' +
      'Commit: 4b2e86b (Sprint 7 + Sprint 8.3). ' +
      'Cloud Run revision: build 8d296418 disparado automaticamente. ' +
      'Testes: 69/69 passando (Sprint 7×29 + Sprint 6×29 + GitHub×11). ' +
      'TypeScript: 0 erros. ' +
      'Latência P50: ~75s (Sprint 3 pendente para reduzir para <10s). ' +
      'Cache hit rate: ~12% (Sprint 4 pendente para >35%). ' +
      'Qualidade G-Eval geral: 75.1/100 (threshold geotécnico: 91.5/100). ' +
      'SHMS: Fase 2 completa (analyze endpoint + G-Eval calibrado). ' +
      'DGM: Modo teste (1/3 ciclos validados — faltam 2 para habilitar PR real). ' +
      'BK-001: RESOLVIDO. BK-002: MQTT broker real pendente (HiveMQ Cloud).',
    category: 'metricas_c182',
    source: 'council-v4-cycle182-knowledge',
    domain: 'production',
  },
  {
    title: 'C182: Lição Aprendida — SensorReading tem campos planos (não arrays)',
    content:
      'Lição técnica C182: A interface SensorReading em shms-digital-twin.ts tem campos PLANOS ' +
      '(value, unit, timestamp, isAnomaly, anomalyScore, lstmPredicted, lstmError), ' +
      'NÃO arrays aninhados como readings[] ou predictions[]. ' +
      'Erro cometido: shms-analyze-endpoint.ts v1.0.0 usava sensor.readings[].value — INCORRETO. ' +
      'Correção: usar sensor.value, sensor.unit, sensor.timestamp diretamente. ' +
      'Impacto: 2 testes falharam inicialmente, corrigidos em v1.0.1. ' +
      'Prevenção: sempre ler a interface exportada antes de usar campos de um tipo externo.',
    category: 'licao_tecnica_c182',
    source: 'council-v4-cycle182-knowledge',
    domain: 'typescript_patterns',
  },
  {
    title: 'C182: Lição Aprendida — addKnowledge() assinatura correta',
    content:
      'Lição técnica C182: A função addKnowledge() em server/mother/knowledge.ts tem assinatura: ' +
      'addKnowledge(title: string, content: string, category?: string, source?: string, domain?: string). ' +
      'Erro cometido: chamadas com 3 argumentos (title+content+tags_array) — INCORRETO. ' +
      'Não existe parâmetro tags[] na assinatura pública. ' +
      'Correção: separar title e content, usar source e domain como strings simples. ' +
      'Prevenção: sempre verificar a assinatura exportada com grep antes de chamar funções de módulos externos.',
    category: 'licao_tecnica_c182',
    source: 'council-v4-cycle182-knowledge',
    domain: 'typescript_patterns',
  },
  {
    title: 'C182: Lição Aprendida — FitnessMetrics usa fitnessScore (não overallScore)',
    content:
      'Lição técnica C182: A interface FitnessMetrics em server/mother/dgm-agent.ts usa ' +
      'o campo fitnessScore (não overallScore). ' +
      'Campos: avgQualityScore, p95LatencyMs, errorRate, cacheHitRate, userSatisfactionProxy, fitnessScore, timestamp, sampleSize. ' +
      'Erro cometido: dgm-autonomous-cycle-test.ts v1.0.0 usava fitness.overallScore — INCORRETO. ' +
      'Correção: usar fitness.fitnessScore. ' +
      'Prevenção: grep na interface antes de acessar campos de tipos importados.',
    category: 'licao_tecnica_c182',
    source: 'council-v4-cycle182-knowledge',
    domain: 'typescript_patterns',
  },
  {
    title: 'C182: Commits e Deploy',
    content:
      'Commits do Ciclo 182: ' +
      '4b2e86b — Sprint 7 + Sprint 8.3: G-Eval 50 exemplos, /api/shms/analyze, DGM autonomous cycle test. ' +
      'Cloud Build 8d296418 disparado automaticamente pelo push para main. ' +
      'Pipeline: TypeScript check → Docker build → push Artifact Registry → Cloud Run deploy → traffic 100%. ' +
      'URL de produção: https://mother-interface-233196174701.australia-southeast1.run.app. ' +
      'Versão em produção: v81.8 | Modelo DPO: ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e:DFay6MHy.',
    category: 'deploy_c182',
    source: 'council-v4-cycle182-knowledge',
    domain: 'production',
  },
];

async function injectCycle182Knowledge(): Promise<void> {
  console.log('[C182] Iniciando injeção de conhecimento do Ciclo 182...');
  let injected = 0;
  let failed = 0;

  for (const entry of C182_KNOWLEDGE) {
    try {
      const id = await addKnowledge(
        entry.title,
        entry.content,
        entry.category,
        entry.source,
        entry.domain,
      );
      console.log(`[C182] ✅ Injetado: "${entry.title.slice(0, 60)}..." (id: ${id})`);
      injected++;
    } catch (err) {
      console.error(`[C182] ❌ Falhou: "${entry.title.slice(0, 60)}..." — ${String(err)}`);
      failed++;
    }
  }

  console.log(`\n[C182] Injeção concluída: ${injected}/${C182_KNOWLEDGE.length} entradas injetadas, ${failed} falhas.`);
}

injectCycle182Knowledge().catch(console.error);
