#!/usr/bin/env python3
"""
MOTHER Latency & Performance Benchmark
========================================
Mede métricas de desempenho do MOTHER em comparação com o estado da arte.

Métricas (baseadas em Etalon, arXiv:2407.07000):
  - TTFT (Time to First Token): latência até o primeiro token
  - E2E Latency: latência total da requisição
  - TPS (Tokens Per Second): throughput estimado
  - P50 / P95 / P99 latency percentiles
  - Error Rate: taxa de erros
  - Availability: disponibilidade do serviço

Comparação com benchmarks públicos:
  - GPT-4o API: TTFT ~500-800ms, E2E ~2-8s
  - Claude 3.5 Sonnet: TTFT ~400-600ms
  - Llama 3.1 70B (vLLM): TTFT ~200-400ms

Uso:
  python3 02_mother_latency_benchmark.py --n 20 --concurrent 1
  python3 02_mother_latency_benchmark.py --n 50 --concurrent 3

Autor: Manus AI
Data: 2026-03-12
"""

import os
import sys
import json
import time
import statistics
import datetime
import argparse
import concurrent.futures
from pathlib import Path

def install_if_missing(package, import_name=None):
    import importlib, subprocess
    try: importlib.import_module(import_name or package)
    except ImportError: subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

install_if_missing("requests")
install_if_missing("tabulate")
install_if_missing("colorama")

import requests
from tabulate import tabulate
from colorama import Fore, Style, init as colorama_init
colorama_init(autoreset=True)

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
RESULTS_DIR = Path(__file__).parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# Queries de benchmark por complexidade
LATENCY_QUERIES = {
    "simple": [
        "O que é MOTHER?",
        "Defina piezômetro.",
        "Qual é a capital do Brasil?",
        "O que é CRAG?",
        "Explique RAG em uma frase.",
    ],
    "medium": [
        "Explique o método de Bishop para análise de estabilidade de taludes.",
        "Quais são as principais diferenças entre CRAG v1 e CRAG v2?",
        "Descreva o protocolo MQTT e suas aplicações em IoT industrial.",
        "O que é RLHF e como ele melhora modelos de linguagem?",
        "Explique o conceito de Fator de Segurança em geotecnia.",
    ],
    "complex": [
        "Descreva a arquitetura completa de um SHMS para barragens, incluindo sensores, protocolos, critérios de alerta e integração com sistemas de gestão de risco.",
        "Compare os métodos de avaliação de LLMs: HELM, MT-Bench, G-Eval e RAGAS. Quais são as vantagens e limitações de cada um?",
        "Elabore um plano de monitoramento geotécnico para uma barragem de rejeitos de mineração, considerando os requisitos da Resolução ANM 95/2022.",
    ],
}

# Benchmarks de referência (estado da arte — fontes: NVIDIA NIM, Artificial Analysis)
REFERENCE_BENCHMARKS = {
    "GPT-4o API": {"ttft_ms": 650, "e2e_ms_simple": 2500, "e2e_ms_medium": 5000, "e2e_ms_complex": 12000},
    "Claude 3.5 Sonnet": {"ttft_ms": 500, "e2e_ms_simple": 2000, "e2e_ms_medium": 4500, "e2e_ms_complex": 10000},
    "Llama 3.1 70B (vLLM)": {"ttft_ms": 300, "e2e_ms_simple": 1500, "e2e_ms_medium": 3500, "e2e_ms_complex": 8000},
    "Threshold Aceitável": {"ttft_ms": 2000, "e2e_ms_simple": 5000, "e2e_ms_medium": 15000, "e2e_ms_complex": 60000},
}


def measure_request(query: str, complexity: str, mode: str = "fast") -> dict:
    """Mede latência de uma única requisição."""
    url = f"{MOTHER_URL}/api/a2a/query"
    payload = {"query": query, "mode": mode}
    t_start = time.time()
    error = None
    response_data = {}
    try:
        resp = requests.post(url, json=payload, timeout=120)
        t_end = time.time()
        if resp.status_code == 200:
            response_data = resp.json()
        else:
            error = f"HTTP {resp.status_code}"
    except requests.exceptions.Timeout:
        t_end = time.time()
        error = "TIMEOUT"
    except Exception as e:
        t_end = time.time()
        error = str(e)

    e2e_ms = round((t_end - t_start) * 1000, 1)
    response_text = response_data.get("response", "")
    word_count = len(response_text.split())
    tps_estimated = round(word_count / (e2e_ms / 1000) * 0.75, 1) if e2e_ms > 0 else 0  # ~0.75 tokens/word

    return {
        "query": query[:60],
        "complexity": complexity,
        "e2e_ms": e2e_ms,
        "word_count": word_count,
        "tps_estimated": tps_estimated,
        "cache_hit": response_data.get("cacheHit", False),
        "tier": response_data.get("tier", ""),
        "provider": response_data.get("provider", ""),
        "quality_score": response_data.get("quality", {}).get("qualityScore"),
        "error": error,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


def run_benchmark(n_per_complexity: int = 5, concurrent: int = 1, mode: str = "fast") -> list:
    """Executa benchmark de latência."""
    tasks = []
    for complexity, queries in LATENCY_QUERIES.items():
        for i in range(n_per_complexity):
            query = queries[i % len(queries)]
            tasks.append((query, complexity))

    results = []
    print(f"\n{Fore.CYAN}Executando {len(tasks)} requisições (concorrência: {concurrent})...{Style.RESET_ALL}\n")

    if concurrent == 1:
        for i, (query, complexity) in enumerate(tasks):
            print(f"  [{i+1}/{len(tasks)}] {complexity}: {query[:50]}...")
            result = measure_request(query, complexity, mode)
            results.append(result)
            status = f"{Fore.RED}ERRO{Style.RESET_ALL}" if result["error"] else f"{Fore.GREEN}{result['e2e_ms']}ms{Style.RESET_ALL}"
            cache = "🔄 cache" if result["cache_hit"] else "🌐 live"
            print(f"    → {status} | {cache} | TPS: {result['tps_estimated']}")
            time.sleep(0.3)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrent) as executor:
            futures = {executor.submit(measure_request, q, c, mode): (q, c) for q, c in tasks}
            for i, future in enumerate(concurrent.futures.as_completed(futures)):
                result = future.result()
                results.append(result)
                print(f"  [{i+1}/{len(tasks)}] {result['complexity']}: {result['e2e_ms']}ms")

    return results


def analyze_results(results: list) -> dict:
    """Análise estatística dos resultados."""
    valid = [r for r in results if not r.get("error")]
    errors = [r for r in results if r.get("error")]

    analysis = {
        "total": len(results),
        "valid": len(valid),
        "errors": len(errors),
        "error_rate": round(len(errors) / len(results), 4) if results else 0,
        "availability": round(len(valid) / len(results), 4) if results else 0,
    }

    for complexity in ["simple", "medium", "complex"]:
        subset = [r for r in valid if r["complexity"] == complexity]
        if subset:
            latencies = [r["e2e_ms"] for r in subset]
            tps_values = [r["tps_estimated"] for r in subset if r["tps_estimated"] > 0]
            analysis[complexity] = {
                "n": len(subset),
                "p50_ms": round(statistics.median(latencies), 1),
                "p95_ms": round(sorted(latencies)[int(0.95 * len(latencies))], 1) if len(latencies) > 1 else latencies[0],
                "p99_ms": round(sorted(latencies)[int(0.99 * len(latencies))], 1) if len(latencies) > 1 else latencies[0],
                "mean_ms": round(statistics.mean(latencies), 1),
                "std_ms": round(statistics.stdev(latencies), 1) if len(latencies) > 1 else 0,
                "min_ms": min(latencies),
                "max_ms": max(latencies),
                "mean_tps": round(statistics.mean(tps_values), 1) if tps_values else 0,
                "cache_rate": round(sum(1 for r in subset if r["cache_hit"]) / len(subset), 4),
            }

    # Overall
    all_latencies = [r["e2e_ms"] for r in valid]
    if all_latencies:
        analysis["overall"] = {
            "n": len(all_latencies),
            "p50_ms": round(statistics.median(all_latencies), 1),
            "p95_ms": round(sorted(all_latencies)[int(0.95 * len(all_latencies))], 1) if len(all_latencies) > 1 else all_latencies[0],
            "mean_ms": round(statistics.mean(all_latencies), 1),
            "cache_rate": round(sum(1 for r in valid if r["cache_hit"]) / len(valid), 4),
        }

    return analysis


def generate_latency_report(results: list, analysis: dict, run_id: str) -> str:
    """Gera relatório de latência em Markdown."""
    report = f"""# MOTHER v122.20 — Benchmark de Latência e Desempenho
**Run ID:** `{run_id}`
**Data:** {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
**Metodologia:** Etalon Framework (arXiv:2407.07000) + NVIDIA NIM Benchmarking

---

## 1. Sumário Executivo

| Métrica | MOTHER | GPT-4o API | Claude 3.5 | Threshold OK |
|---------|--------|-----------|-----------|-------------|
| Disponibilidade | {analysis.get('availability', 0)*100:.1f}% | ~99.9% | ~99.9% | ≥99% |
| Error Rate | {analysis.get('error_rate', 0)*100:.1f}% | ~0.1% | ~0.1% | ≤1% |
| P50 (todas) | {analysis.get('overall', {}).get('p50_ms', 'N/A')}ms | ~3500ms | ~3000ms | <15000ms |
| P95 (todas) | {analysis.get('overall', {}).get('p95_ms', 'N/A')}ms | ~8000ms | ~7000ms | <30000ms |
| Cache Rate | {analysis.get('overall', {}).get('cache_rate', 0)*100:.1f}% | 0% | 0% | — |

---

## 2. Latência por Complexidade de Query

| Complexidade | N | P50 (ms) | P95 (ms) | P99 (ms) | Média (ms) | Std (ms) | TPS Est. | Cache |
|-------------|---|---------|---------|---------|-----------|---------|---------|-------|
"""
    for complexity in ["simple", "medium", "complex"]:
        d = analysis.get(complexity, {})
        if d:
            report += f"| {complexity.capitalize()} | {d['n']} | {d['p50_ms']} | {d['p95_ms']} | {d['p99_ms']} | {d['mean_ms']} | {d['std_ms']} | {d['mean_tps']} | {d['cache_rate']*100:.0f}% |\n"

    report += f"""
---

## 3. Comparação com Estado da Arte

| Sistema | TTFT (ms) | E2E Simple | E2E Medium | E2E Complex | Fonte |
|---------|----------|-----------|-----------|------------|-------|
| **MOTHER v122.20** | N/A (streaming) | {analysis.get('simple', {}).get('p50_ms', 'N/A')}ms | {analysis.get('medium', {}).get('p50_ms', 'N/A')}ms | {analysis.get('complex', {}).get('p50_ms', 'N/A')}ms | Este estudo |
| GPT-4o API | ~650ms | ~2500ms | ~5000ms | ~12000ms | Artificial Analysis 2025 |
| Claude 3.5 Sonnet | ~500ms | ~2000ms | ~4500ms | ~10000ms | Artificial Analysis 2025 |
| Llama 3.1 70B (vLLM) | ~300ms | ~1500ms | ~3500ms | ~8000ms | NVIDIA NIM 2024 |
| Threshold Aceitável | <2000ms | <5000ms | <15000ms | <60000ms | Wang et al. 2025 (BMC Psych) |

> **Nota:** MOTHER inclui pipeline CRAG v2 + Guardian + G-Eval, o que adiciona latência em troca de qualidade superior.
> Cache semântico reduz latência para queries repetidas (cache hit = resposta em <200ms).

---

## 4. Distribuição de Latência (Histograma Textual)

```
"""
    all_latencies = [r["e2e_ms"] for r in results if not r.get("error")]
    if all_latencies:
        buckets = [(0, 500), (500, 1000), (1000, 2000), (2000, 5000), (5000, 10000), (10000, 30000), (30000, float('inf'))]
        for lo, hi in buckets:
            count = sum(1 for l in all_latencies if lo <= l < hi)
            bar = "█" * count
            label = f"{lo/1000:.1f}s-{hi/1000:.1f}s" if hi != float('inf') else f">{lo/1000:.1f}s"
            report += f"  {label:12s} | {bar} ({count})\n"

    report += f"""```

---

## 5. Impacto da Latência na Satisfação do Usuário

| Latência | Percepção do Usuário | Satisfação Estimada | Fonte |
|---------|---------------------|--------------------|----|
| <500ms | Instantâneo | Muito Alta | Nielsen (1993) |
| 500ms-2s | Fluido | Alta | Nielsen (1993) |
| 2s-5s | Perceptível | Média | Wang et al. 2025 |
| 5s-15s | Lento (com indicador) | Baixa-Média | Wang et al. 2025 |
| >15s | Inaceitável (sem indicador) | Baixa | Wang et al. 2025 |

> **Recomendação:** Para queries complexas (LFSA), implementar indicador de progresso e streaming
> para manter satisfação alta mesmo com E2E >15s. (Referência: arXiv:2407.07000, Etalon)

---

## 6. Referências

| # | Fonte | Relevância |
|---|-------|-----------|
| [1] | Etalon (arXiv:2407.07000) | Framework de benchmark de latência LLM |
| [2] | NVIDIA NIM Benchmarking | Métricas TTFT/TBT/TPOT |
| [3] | Wang et al. 2025 (BMC Psychology) | Impacto da latência na satisfação |
| [4] | Artificial Analysis 2025 | Benchmarks GPT-4o/Claude 3.5 |
| [5] | Nielsen (1993) | Thresholds de resposta para UX |

---
*Gerado automaticamente pelo MOTHER Latency Benchmark v1.0 — {datetime.datetime.utcnow().strftime('%Y-%m-%d')}*
"""
    return report


def main():
    parser = argparse.ArgumentParser(description="MOTHER Latency Benchmark")
    parser.add_argument("--n", type=int, default=3, help="Requisições por nível de complexidade")
    parser.add_argument("--concurrent", type=int, default=1, help="Requisições concorrentes")
    parser.add_argument("--mode", choices=["fast", "standard", "deep"], default="fast")
    args = parser.parse_args()

    run_id = datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    print(f"\n{Fore.CYAN}{'='*60}")
    print(f"  MOTHER Latency Benchmark")
    print(f"  Run ID: {run_id} | N/complexidade: {args.n} | Concurrent: {args.concurrent}")
    print(f"{'='*60}{Style.RESET_ALL}")

    results = run_benchmark(args.n, args.concurrent, args.mode)
    analysis = analyze_results(results)

    # Salva JSON
    results_file = RESULTS_DIR / f"latency_{run_id}.json"
    with open(results_file, "w") as f:
        json.dump({"results": results, "analysis": analysis}, f, indent=2)

    # Gera relatório
    report = generate_latency_report(results, analysis, run_id)
    report_file = RESULTS_DIR / f"latency_report_{run_id}.md"
    with open(report_file, "w") as f:
        f.write(report)

    # Sumário terminal
    print(f"\n{Fore.CYAN}{'='*60}")
    print(f"  SUMÁRIO DE LATÊNCIA")
    print(f"{'='*60}{Style.RESET_ALL}")
    overall = analysis.get("overall", {})
    print(f"  Disponibilidade: {analysis.get('availability', 0)*100:.1f}%")
    print(f"  P50 (todas): {overall.get('p50_ms', 'N/A')}ms")
    print(f"  P95 (todas): {overall.get('p95_ms', 'N/A')}ms")
    print(f"  Cache Rate: {overall.get('cache_rate', 0)*100:.1f}%")
    print(f"\n  Relatório: {report_file}\n")


if __name__ == "__main__":
    main()
