/**
 * Injeção de conhecimento no bd_central — Ciclos C358–C362
 * Roadmap V62 | 2026-03-13
 */

import { addKnowledge } from '../server/mother/knowledge';

const ENTRIES = [
  {
    title: "C358 — Golden Dataset Completo (NC-TEST-001)",
    content: `Golden Dataset MOTHER Quality Test Suite v1.0 — C358 — 2026-03-13
Total: 156 queries carregadas (220 planejadas — TIER_1 e TIER_3 a completar em C363)
Composição: TIER_1 (22) + TIER_2 (50) + TIER_3 (14) + TIER_4 (50) + Adversarial (20)
Localização: /home/ubuntu/mother-quality-test/golden_dataset/
Arquivos: tier1_simple.yaml, tier2_medium.yaml, tier3_complex.yaml, tier4_very_long.yaml, adversarial.yaml
Categorias adversariais: negation_trap(4), hallucination_bait(4), false_premise(4), ambiguous_query(3), out_of_domain(3), prompt_injection(2)
Base científica: Cochran (1977) stratified sampling; NegEx (Joshi 2021) negation guard
Norma: NC-TEST-001 (Conselho V111)`,
    category: "quality_testing",
    source: "C358"
  },
  {
    title: "C359 — Human Eval Pipeline (NC-TEST-002)",
    content: `Human Eval Pipeline MOTHER — C359 — 2026-03-13
Arquivo: /home/ubuntu/mother-quality-test/runners/human_eval_pipeline.py
Metodologia: 10% sampling determinístico via hash MD5 (reproducível entre runs)
Protocolo: InstructGPT human eval (Ouyang et al., arXiv:2203.02155)
Dimensões avaliadas (Likert 1-5): accuracy(35%), completeness(25%), clarity(20%), citations(10%), overall(10%)
Composite score: normalizado para 0-100
Integração: Braintrust-compatible (BRAINTRUST_API_KEY opcional)
Output: /home/ubuntu/mother-quality-test/human_eval_queue/queue_YYYYMMDD_HHMMSS.json
Norma: NC-TEST-002 (Conselho V111)`,
    category: "quality_testing",
    source: "C359"
  },
  {
    title: "C360 — Quality SLO Dashboard (NC-TEST-006)",
    content: `Quality SLO Dashboard MOTHER — C360 — 2026-03-13
Arquivo: /home/ubuntu/mother-quality-test/reporters/quality_slo_dashboard.py
8 SLOs monitorados (Conselho V111):
  composite_score ≥ 82.0 | ragas_faithfulness ≥ 0.87 | citation_rate ≥ 0.70
  ttft_seconds ≤ 1.0 | hallucination_rate ≤ 0.03 | geval_composite ≥ 80.0
  error_rate ≤ 0.02 | p95_latency_seconds ≤ 8.0
Rolling window: 1000 requests | HTTP server porta 8502 | auto-refresh 60s
Endpoint: /metrics.json (JSON) + / (HTML dashboard)
Norma: NC-TEST-006 (Conselho V111)`,
    category: "quality_testing",
    source: "C360"
  },
  {
    title: "C361 — Baseline Run Oficial (NC-TEST-007)",
    content: `Baseline Run Oficial MOTHER v122.31 — C361 — 2026-03-13
Arquivo: /home/ubuntu/mother-quality-test/runners/baseline_run.py
Ensemble scoring (NC-TEST-003):
  G-Eval(40%) + CheckEval(20%) + RAGAS-Faithfulness(20%) + RAGAS-Relevancy(10%) + Hallucination-Inverse(10%)
Concorrência: MOTHER_CONCURRENCY=3, JUDGE_CONCURRENCY=5, MAX_RETRIES=3
TTFT medido via SSE streaming assíncrono (aiohttp + asyncio) — NC-TTFT-001
Output: /home/ubuntu/mother-quality-test/results/BASELINE-YYYYMMDD_aggregate.json
Threshold "Manus Level": composite_score ≥ 82.0
Base científica: Liang et al. (arXiv:2211.09110) HELM; Liu et al. (arXiv:2303.16634) G-Eval; Es et al. (arXiv:2309.15217) RAGAS; Lee et al. (arXiv:2403.18771) CheckEval
Norma: NC-TEST-007`,
    category: "quality_testing",
    source: "C361"
  },
  {
    title: "C362 — Comparação MOTHER vs. Manus (NC-TEST-008)",
    content: `Comparação Formal MOTHER vs. Manus — C362 — 2026-03-13
Arquivo: /home/ubuntu/mother-quality-test/runners/manus_comparison.py
Metodologia:
  Manus em restricted mode: gpt-4.1 sem ferramentas (NC-TEST-004)
  Pairwise LLM-as-Judge com position-bias mitigation (A vs B + B vs A, média)
  Paired t-test (Student 1908) para significância estatística (p < 0.05)
  Cohen's d (Cohen 1988) para effect size: small=0.2, medium=0.5, large=0.8
Subset: 10 queries por tier (TIER_1+TIER_2+TIER_3+ADVERSARIAL = 40 queries)
Output: /home/ubuntu/mother-quality-test/results/COMPARISON-YYYYMMDD_aggregate.json
Base científica: Zheng et al. (arXiv:2306.05685) MT-Bench; Cohen (1988); Wilcoxon (1945)
Norma: NC-TEST-008`,
    category: "quality_testing",
    source: "C362"
  },
  {
    title: "Normas NC-TEST-001 a NC-TEST-008 (Conselho V111)",
    content: `Normas de Qualidade aprovadas pelo Conselho V111 — 2026-03-13
NC-TEST-001: Golden dataset mínimo 200 queries (40% manual + 40% sintético + 20% produção)
NC-TEST-002: Human eval 10% sampling determinístico (hash MD5)
NC-TEST-003: Ensemble scoring: G-Eval(40%)+CheckEval(20%)+RAGAS-F(20%)+RAGAS-R(10%)+Hallucination-Inv(10%)
NC-TEST-004: Comparação com Manus somente em restricted mode (sem ferramentas)
NC-TEST-005: TTFT medido via SSE assíncrono (aiohttp + asyncio)
NC-TEST-006: Quality SLO Dashboard em produção (8 SLOs, rolling window 1000 requests)
NC-TEST-007: Baseline run com todos os datasets antes de qualquer comparação
NC-TEST-008: Comparação estatística com paired t-test + Cohen's d (p<0.05 para significância)
Aprovadas por 4/4 membros do Conselho V111.`,
    category: "normas",
    source: "Conselho_V111"
  },
  {
    title: "Mother Quality Test Suite — Estrutura e Localização",
    content: `MOTHER Quality Test Suite v1.0 — Estrutura Completa — 2026-03-13
Diretório raiz: /home/ubuntu/mother-quality-test/
Execução: python3 run_tests.py [--tier TIER_1] [--max 10] [--dry-run]
Arquivos principais:
  run_tests.py — orquestrador principal
  golden_dataset/ — 156 queries (5 arquivos YAML)
  runners/baseline_run.py — C361 baseline oficial
  runners/manus_comparison.py — C362 comparação MOTHER vs. Manus
  runners/human_eval_pipeline.py — C359 human eval 10%
  runners/browser_runner.py — testes via Playwright
  reporters/quality_slo_dashboard.py — C360 SLO dashboard HTTP
  reporters/dashboard.py — Streamlit dashboard
  config/thresholds.yaml — SLO targets por tier
  human_eval_queue/ — output human eval
  results/ — output baseline runs e comparações
README: /home/ubuntu/mother-quality-test/README.md`,
    category: "quality_testing",
    source: "C358-C362"
  }
];

async function main() {
  console.log('[bd_central] Iniciando injeção C358-C362...');
  let success = 0;
  let failed = 0;

  for (const entry of ENTRIES) {
    try {
      const id = await addKnowledge(entry.title, entry.content, entry.category, entry.source);
      console.log(`  ✅ [${id}] ${entry.title.slice(0, 60)}`);
      success++;
    } catch (err: any) {
      console.log(`  ❌ ${entry.title.slice(0, 60)} — ${err.message?.slice(0, 50)}`);
      failed++;
    }
  }

  console.log(`\n[bd_central] C358-C362: ${success}/${ENTRIES.length} entradas injetadas`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
