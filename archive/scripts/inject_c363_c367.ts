/**
 * C363-C367 bd_central injection script
 * Injects knowledge from cycles C363-C367 into MOTHER's knowledge base
 */
import { addKnowledge } from '../server/mother/knowledge';

const entries = [
  {
    key: 'C363_GOLDEN_DATASETS_COMPLETE',
    value: JSON.stringify({
      cycle: 'C363',
      date: '2026-03-13',
      description: 'Golden datasets completados: TIER_1 (46q), TIER_2 (50q), TIER_3 (50q), TIER_4 (50q), Adversarial (20q) = 216 queries totais',
      nc: 'NC-TEST-001',
      status: 'COMPLETO',
      files: [
        'mother-quality-test/golden_dataset/tier1_simple.yaml (46 queries)',
        'mother-quality-test/golden_dataset/tier2_medium.yaml (50 queries)',
        'mother-quality-test/golden_dataset/tier3_complex.yaml (50 queries)',
        'mother-quality-test/golden_dataset/tier4_very_long.yaml (50 queries)',
        'mother-quality-test/golden_dataset/adversarial.yaml (20 queries)'
      ],
      categories: ['factual', 'math', 'geotécnica', 'SHMS', 'barragens', 'instrumentação', 'segurança', 'memória', 'adversarial', 'ambíguo', 'multi-step', 'LFSA'],
      scientificBasis: 'HELM (arXiv:2211.09110) — benchmark dataset design principles'
    }),
    domain: 'quality_testing',
    importance: 0.85
  },
  {
    key: 'C364_BASELINE_RUN_RESULTS',
    value: JSON.stringify({
      cycle: 'C364',
      date: '2026-03-13',
      description: 'Baseline Run Real — MOTHER v122.24 em produção',
      version: 'v122.24',
      metrics: {
        ttft_mean_ms: 3720,
        ttft_slo_compliance_pct: 5.9,
        composite_score_mean: 74.0,
        queries_tested: 17,
        timeouts: 3,
        slo_target_ttft_ms: 1000,
        slo_target_score: 82
      },
      gaps: [
        'TTFT 3.7× acima do SLO (3720ms vs 1000ms alvo)',
        'Composite Score 74.0 abaixo do threshold 82',
        'Módulos C352-C356 ainda não deployados na v122.24'
      ],
      scientificBasis: 'HELM (arXiv:2211.09110) — automated evaluation pipeline'
    }),
    domain: 'quality_testing',
    importance: 0.95
  },
  {
    key: 'C365_MANUS_COMPARISON_RESULTS',
    value: JSON.stringify({
      cycle: 'C365',
      date: '2026-03-13',
      description: 'Comparação formal MOTHER v122.24 vs. Manus (restricted mode)',
      methodology: 'paired t-test + Cohen\'s d + Wilcoxon signed-rank',
      results: {
        mother_score_mean: 77.0,
        manus_score_mean: 85.5,
        delta: -8.6,
        t_statistic: -1.832,
        cohens_d: -0.616,
        effect_size: 'médio',
        wilcoxon: { mother_wins: 1, manus_wins: 5, ties: 4 },
        verdict: 'GAP CONFIRMADO — Manus supera MOTHER em restricted mode'
      },
      rootCauses: [
        'Módulos C352-C356 não deployados (Stealth Planner, Citation Engine, PRM, VERTE-RAG)',
        'TTFT alto (3720ms) prejudica queries que precisam de resposta rápida',
        'Citation Rate 40% vs Manus ~70% em queries factuais'
      ],
      expectedImprovementPostDeploy: '+8-15 pontos composite score após C352-C356 em produção',
      scientificBasis: 'InstructGPT (Ouyang et al. 2022) — human preference comparison methodology'
    }),
    domain: 'quality_testing',
    importance: 0.95
  },
  {
    key: 'C366_SLO_DASHBOARD_DEPLOYED',
    value: JSON.stringify({
      cycle: 'C366',
      date: '2026-03-13',
      description: 'Quality SLO Dashboard implementado — monitoramento em tempo real',
      nc: 'NC-TEST-006',
      file: 'mother-quality-test/reporters/quality_slo_dashboard.py',
      slos: [
        'composite_score >= 82 (Qualidade Nível Manus)',
        'ttft_ms <= 1000 (NC-TTFT-001)',
        'citation_rate >= 0.70 (NC-CITATION-001)',
        'hallucination_rate < 0.03',
        'faithfulness >= 0.87 (RAGAS)',
        'relevancy >= 0.85 (RAGAS)',
        'tier1_pass_rate >= 0.90',
        'tier3_pass_rate >= 0.75'
      ],
      features: ['HTTP server porta 8502', 'auto-refresh 60s', 'endpoint /metrics.json', 'alertas de violação de SLO'],
      scientificBasis: 'RAGAS (Es et al. arXiv:2309.15217) + HELM (arXiv:2211.09110)'
    }),
    domain: 'quality_testing',
    importance: 0.80
  },
  {
    key: 'C367_CICD_QUALITY_GATE',
    value: JSON.stringify({
      cycle: 'C367',
      date: '2026-03-13',
      description: 'Pre-deploy quality gate integrado no cloudbuild.yaml',
      nc: 'NC-TEST-007',
      rule: 'Antes de migrar tráfego para nova revisão, executar 3 smoke queries TIER_1. Mínimo 2/3 devem retornar HTTP 200.',
      implementation: 'cloudbuild.yaml step id: pre-deploy-quality-gate (após gcloud run deploy, antes de update-traffic)',
      variables: 'Usa lowercase vars (pass, fail, http_code, q) para evitar conflito com Cloud Build substitutions',
      scientificBasis: 'HELM (arXiv:2211.09110) — automated evaluation as CI/CD gate',
      buildId: '70c691e6-8cbb-4532-ae40-d9bef36de98d'
    }),
    domain: 'quality_testing',
    importance: 0.85
  },
  {
    key: 'NC_TEST_007_PREDEPLOYGATECICD',
    value: JSON.stringify({
      norm: 'NC-TEST-007',
      cycle: 'C367',
      date: '2026-03-13',
      description: 'Pre-deploy quality gate obrigatório no CI/CD',
      rule: 'Todo deploy de MOTHER DEVE executar >=2/3 smoke queries TIER_1 com HTTP 200 antes de migrar tráfego',
      implementation: 'cloudbuild.yaml step id: pre-deploy-quality-gate',
      scientificBasis: 'HELM (arXiv:2211.09110)',
      approvedBy: 'Conselho V111'
    }),
    domain: 'norms',
    importance: 0.90
  },
  {
    key: 'DEPLOY_V122_31_CLOUD_BUILD',
    value: JSON.stringify({
      buildId: '70c691e6-8cbb-4532-ae40-d9bef36de98d',
      date: '2026-03-13',
      version: 'v122.31',
      cycle: 'C367',
      modules: ['Stealth Planner (C352)', 'Citation Engine (C353)', 'PRM Budget-Allocator (C354)', 'VERTE-RAG (C355)', 'Adaptive Thresholding (C356)'],
      envVars: ['MOTHER_VERSION=v122.31', 'MOTHER_CYCLE=367', 'MOTHER_STEALTH_PLANNER=true', 'MOTHER_PRM_ENABLED=true', 'MOTHER_CITATION_ENGINE=true', 'MOTHER_VERTE_RAG=true', 'MOTHER_ADAPTIVE_THRESHOLD=true'],
      region: 'australia-southeast1',
      status: 'QUEUED',
      logsUrl: 'https://console.cloud.google.com/cloud-build/builds/70c691e6-8cbb-4532-ae40-d9bef36de98d?project=233196174701'
    }),
    domain: 'deployment',
    importance: 0.95
  }
];

async function main() {
  console.log('Injecting C363-C367 knowledge into bd_central...');
  for (const entry of entries) {
    try {
      // addKnowledge(title, content, category?, source?, domain?)
      await addKnowledge(
        entry.key,
        entry.value,
        entry.domain,
        'manus-agent-c363-c367',
        entry.domain
      );
      console.log(`✅ Injected: ${entry.key}`);
    } catch (err) {
      console.error(`❌ Failed: ${entry.key}`, err);
    }
  }
  console.log('Done.');
  process.exit(0);
}

main();
