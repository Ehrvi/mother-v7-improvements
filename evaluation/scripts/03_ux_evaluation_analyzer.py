#!/usr/bin/env python3
"""
MOTHER UI/UX Evaluation Analyzer
===================================
Processa respostas dos questionários de usabilidade e gera relatório científico.

Instrumentos suportados:
  - SUS (System Usability Scale) — Brooke 1996
  - BUS-15 (BOT Usability Scale) — Borsci et al. 2022
  - NASA-TLX (Task Load Index) — Hart & Staveland 1988
  - TAM (Technology Acceptance Model) — Davis 1989
  - UMUX-Lite — Finstad 2010
  - MOTHER-Specific (dimensões específicas)

Uso:
  # Modo demo (dados simulados para validação do framework):
  python3 03_ux_evaluation_analyzer.py --demo

  # Com dados reais (CSV):
  python3 03_ux_evaluation_analyzer.py --input data/ux_responses.csv

Formato CSV esperado:
  participant_id, instrument, item_id, score
  P01, SUS, SUS01, 4
  P01, SUS, SUS02, 2
  ...

Autor: Manus AI
Data: 2026-03-12
"""

import sys
import json
import statistics
import datetime
import argparse
import random
from pathlib import Path

def install_if_missing(package, import_name=None):
    import importlib, subprocess
    try: importlib.import_module(import_name or package)
    except ImportError: subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

install_if_missing("tabulate")
install_if_missing("colorama")

from tabulate import tabulate
from colorama import Fore, Style, init as colorama_init
colorama_init(autoreset=True)

RESULTS_DIR = Path(__file__).parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)
QUESTIONNAIRES_DIR = Path(__file__).parent.parent / "questionnaires"


# ─── Cálculo de Scores ────────────────────────────────────────────────────────

def calculate_sus_score(responses: dict) -> float:
    """
    SUS Score = (soma_impares - 5 + 25 - soma_pares) * 2.5
    Itens positivos (ímpares): SUS01, SUS03, SUS05, SUS07, SUS09 → score - 1
    Itens negativos (pares): SUS02, SUS04, SUS06, SUS08, SUS10 → 5 - score
    Range: 0-100
    Fonte: Brooke (1996)
    """
    positive_items = ["SUS01", "SUS03", "SUS05", "SUS07", "SUS09"]
    negative_items = ["SUS02", "SUS04", "SUS06", "SUS08", "SUS10"]
    pos_sum = sum(responses.get(item, 3) - 1 for item in positive_items)
    neg_sum = sum(5 - responses.get(item, 3) for item in negative_items)
    return (pos_sum + neg_sum) * 2.5


def calculate_bus15_scores(responses: dict) -> dict:
    """
    BUS-15: Score por fator (média dos itens do fator) e score total.
    Fonte: Borsci et al. (2022)
    """
    factors = {
        "Efficiency": ["BUS01", "BUS02", "BUS03"],
        "Effectiveness": ["BUS04", "BUS05", "BUS06"],
        "Satisfaction": ["BUS07", "BUS08", "BUS09"],
        "Learnability": ["BUS10", "BUS11", "BUS12"],
        "Accessibility": ["BUS13", "BUS14", "BUS15"],
    }
    scores = {}
    all_scores = []
    for factor, items in factors.items():
        factor_scores = [responses.get(item, 3) for item in items]
        scores[factor] = round(statistics.mean(factor_scores), 2)
        all_scores.extend(factor_scores)
    scores["Overall"] = round(statistics.mean(all_scores), 2)
    return scores


def calculate_nasa_tlx(responses: dict) -> dict:
    """
    NASA-TLX Raw (sem pesos): média das 6 subescalas.
    Nota: TLX04 (Performance) é invertida: 0=perfeito, 100=fracasso.
    Para análise, invertemos: score_ajustado = 100 - TLX04
    Fonte: Hart & Staveland (1988)
    """
    items = ["TLX01", "TLX02", "TLX03", "TLX04", "TLX05", "TLX06"]
    names = ["Mental Demand", "Physical Demand", "Temporal Demand", "Performance (inv.)", "Effort", "Frustration"]
    scores = {}
    raw_scores = []
    for item, name in zip(items, names):
        score = responses.get(item, 50)
        if item == "TLX04":
            score = 100 - score  # Inverte performance
        scores[name] = score
        raw_scores.append(score)
    scores["Overall"] = round(statistics.mean(raw_scores), 1)
    return scores


def calculate_tam_scores(responses: dict) -> dict:
    """
    TAM: Score por constructo (média dos itens).
    Escala 1-7, normalizada para 0-100.
    Fonte: Davis (1989)
    """
    constructs = {
        "Perceived Usefulness": ["TAM_PU01", "TAM_PU02", "TAM_PU03"],
        "Perceived Ease of Use": ["TAM_PEOU01", "TAM_PEOU02", "TAM_PEOU03"],
        "Behavioral Intention": ["TAM_BI01", "TAM_BI02"],
        "Trust": ["TAM_TRUST01", "TAM_TRUST02"],
    }
    scores = {}
    for construct, items in constructs.items():
        raw = [responses.get(item, 4) for item in items]
        # Normaliza 1-7 para 0-100
        normalized = [(s - 1) / 6 * 100 for s in raw]
        scores[construct] = round(statistics.mean(normalized), 1)
    scores["Overall"] = round(statistics.mean(scores.values()), 1)
    return scores


def calculate_umux_lite(responses: dict) -> float:
    """
    UMUX-Lite Score = ((item1 - 1) + (7 - item2)) / 12 * 100
    Fonte: Finstad (2010)
    """
    item1 = responses.get("UMUX01", 4)
    item2 = responses.get("UMUX02", 4)
    return round(((item1 - 1) + (7 - item2)) / 12 * 100, 1)


def calculate_mother_specific(responses: dict) -> dict:
    """
    MOTHER-Specific: Score por dimensão e overall.
    Escala 1-5, normalizada para 0-100.
    """
    items = [f"MS{str(i).zfill(2)}" for i in range(1, 11)]
    dimension_names = [
        "Citation Quality", "Domain Expertise", "Multi-turn Coherence",
        "Hallucination Perception", "Response Depth", "Language Quality",
        "Response Time Perception", "Formatting & Readability",
        "Overall Satisfaction", "Comparison with Alternatives"
    ]
    scores = {}
    all_scores = []
    for item, name in zip(items, dimension_names):
        raw = responses.get(item, 3)
        normalized = (raw - 1) / 4 * 100
        scores[name] = round(normalized, 1)
        all_scores.append(normalized)
    scores["Overall"] = round(statistics.mean(all_scores), 1)
    return scores


# ─── Dados Demo (simulados para validação do framework) ──────────────────────

def generate_demo_data(n_participants: int = 8) -> list:
    """
    Gera dados simulados realistas para demonstração do framework.
    Baseado em distribuições típicas de usabilidade de chatbots (Borsci et al. 2022).
    """
    random.seed(42)  # Reprodutibilidade
    participants = []

    # Perfis simulados: engenheiros geotécnicos (usuários-alvo)
    profiles = [
        {"id": f"P{str(i).zfill(2)}", "role": "Engenheiro Geotécnico", "experience": "Médio"}
        for i in range(1, n_participants + 1)
    ]

    for profile in profiles:
        # SUS: distribuição típica para chatbots especializados (μ≈72, σ≈10)
        sus_responses = {
            "SUS01": random.choices([3, 4, 4, 5, 5], k=1)[0],
            "SUS02": random.choices([1, 2, 2, 3, 3], k=1)[0],
            "SUS03": random.choices([3, 4, 4, 5, 5], k=1)[0],
            "SUS04": random.choices([1, 1, 2, 2, 3], k=1)[0],
            "SUS05": random.choices([3, 4, 4, 4, 5], k=1)[0],
            "SUS06": random.choices([1, 2, 2, 3, 3], k=1)[0],
            "SUS07": random.choices([3, 4, 4, 5, 5], k=1)[0],
            "SUS08": random.choices([1, 2, 2, 2, 3], k=1)[0],
            "SUS09": random.choices([3, 4, 4, 4, 5], k=1)[0],
            "SUS10": random.choices([1, 1, 2, 2, 3], k=1)[0],
        }

        # BUS-15: distribuição típica (μ≈3.7, σ≈0.6)
        bus_responses = {f"BUS{str(i).zfill(2)}": random.choices([3, 3, 4, 4, 5], k=1)[0] for i in range(1, 16)}

        # NASA-TLX: carga moderada (μ≈35, σ≈12)
        tlx_responses = {
            "TLX01": random.randint(20, 60),  # Mental Demand
            "TLX02": random.randint(5, 20),   # Physical Demand (baixa)
            "TLX03": random.randint(10, 40),  # Temporal Demand
            "TLX04": random.randint(60, 90),  # Performance (invertida: 70-90 = bom desempenho)
            "TLX05": random.randint(20, 50),  # Effort
            "TLX06": random.randint(10, 40),  # Frustration
        }

        # TAM: alta aceitação (μ≈5.5/7)
        tam_responses = {
            "TAM_PU01": random.choices([4, 5, 5, 6, 7], k=1)[0],
            "TAM_PU02": random.choices([4, 5, 5, 6, 6], k=1)[0],
            "TAM_PU03": random.choices([5, 5, 6, 6, 7], k=1)[0],
            "TAM_PEOU01": random.choices([4, 4, 5, 5, 6], k=1)[0],
            "TAM_PEOU02": random.choices([4, 5, 5, 5, 6], k=1)[0],
            "TAM_PEOU03": random.choices([3, 4, 4, 5, 5], k=1)[0],
            "TAM_BI01": random.choices([4, 5, 5, 6, 7], k=1)[0],
            "TAM_BI02": random.choices([4, 5, 5, 5, 6], k=1)[0],
            "TAM_TRUST01": random.choices([3, 4, 4, 5, 5], k=1)[0],
            "TAM_TRUST02": random.choices([3, 4, 4, 4, 5], k=1)[0],
        }

        # UMUX-Lite
        umux_responses = {
            "UMUX01": random.choices([4, 5, 5, 6, 6], k=1)[0],
            "UMUX02": random.choices([2, 2, 3, 3, 4], k=1)[0],
        }

        # MOTHER-Specific
        ms_responses = {
            "MS01": random.choices([3, 4, 4, 4, 5], k=1)[0],  # Citation Quality
            "MS02": random.choices([4, 4, 5, 5, 5], k=1)[0],  # Domain Expertise
            "MS03": random.choices([3, 3, 4, 4, 5], k=1)[0],  # Multi-turn
            "MS04": random.choices([3, 4, 4, 4, 5], k=1)[0],  # Hallucination
            "MS05": random.choices([4, 4, 4, 5, 5], k=1)[0],  # Depth
            "MS06": random.choices([4, 4, 5, 5, 5], k=1)[0],  # Language
            "MS07": random.choices([2, 3, 3, 4, 4], k=1)[0],  # Response Time (pior)
            "MS08": random.choices([4, 4, 4, 5, 5], k=1)[0],  # Formatting
            "MS09": random.choices([3, 4, 4, 4, 5], k=1)[0],  # Overall
            "MS10": random.choices([3, 4, 4, 4, 5], k=1)[0],  # vs Alternatives
        }

        participants.append({
            "profile": profile,
            "SUS": sus_responses,
            "BUS15": bus_responses,
            "NASA_TLX": tlx_responses,
            "TAM": tam_responses,
            "UMUX_LITE": umux_responses,
            "MOTHER_SPECIFIC": ms_responses,
        })

    return participants


# ─── Análise Agregada ─────────────────────────────────────────────────────────

def aggregate_scores(participants: list) -> dict:
    """Calcula scores agregados para todos os participantes."""
    sus_scores = [calculate_sus_score(p["SUS"]) for p in participants]
    bus_scores = [calculate_bus15_scores(p["BUS15"]) for p in participants]
    tlx_scores = [calculate_nasa_tlx(p["NASA_TLX"]) for p in participants]
    tam_scores = [calculate_tam_scores(p["TAM"]) for p in participants]
    umux_scores = [calculate_umux_lite(p["UMUX_LITE"]) for p in participants]
    ms_scores = [calculate_mother_specific(p["MOTHER_SPECIFIC"]) for p in participants]

    def mean_std(lst):
        return {"mean": round(statistics.mean(lst), 1), "std": round(statistics.stdev(lst), 1) if len(lst) > 1 else 0}

    # BUS por fator
    bus_factors = {}
    for factor in ["Efficiency", "Effectiveness", "Satisfaction", "Learnability", "Accessibility", "Overall"]:
        factor_scores = [s[factor] for s in bus_scores]
        bus_factors[factor] = mean_std(factor_scores)

    # TAM por constructo
    tam_constructs = {}
    for construct in ["Perceived Usefulness", "Perceived Ease of Use", "Behavioral Intention", "Trust", "Overall"]:
        construct_scores = [s[construct] for s in tam_scores]
        tam_constructs[construct] = mean_std(construct_scores)

    # NASA-TLX por subescala
    tlx_subscales = {}
    for subscale in ["Mental Demand", "Physical Demand", "Temporal Demand", "Performance (inv.)", "Effort", "Frustration", "Overall"]:
        subscale_scores = [s[subscale] for s in tlx_scores]
        tlx_subscales[subscale] = mean_std(subscale_scores)

    # MOTHER-Specific por dimensão
    ms_dimensions = {}
    for dim in ["Citation Quality", "Domain Expertise", "Multi-turn Coherence", "Hallucination Perception",
                "Response Depth", "Language Quality", "Response Time Perception", "Formatting & Readability",
                "Overall Satisfaction", "Comparison with Alternatives", "Overall"]:
        dim_scores = [s[dim] for s in ms_scores]
        ms_dimensions[dim] = mean_std(dim_scores)

    return {
        "n": len(participants),
        "SUS": mean_std(sus_scores),
        "SUS_scores": sus_scores,
        "BUS15": bus_factors,
        "NASA_TLX": tlx_subscales,
        "TAM": tam_constructs,
        "UMUX_LITE": mean_std(umux_scores),
        "MOTHER_SPECIFIC": ms_dimensions,
    }


def sus_grade(score: float) -> str:
    """Classifica score SUS segundo Bangor et al. (2008)."""
    if score >= 85: return "A+ (Excelente)"
    if score >= 72: return "B (Bom)"
    if score >= 68: return "C (Acima da Média)"
    if score >= 51: return "D (Abaixo da Média)"
    return "F (Inaceitável)"


def tlx_grade(score: float) -> str:
    """Classifica carga cognitiva NASA-TLX."""
    if score < 30: return "Baixa ✅"
    if score < 60: return "Moderada ⚠️"
    return "Alta ❌"


# ─── Geração de Relatório ─────────────────────────────────────────────────────

def generate_ux_report(aggregated: dict, run_id: str, is_demo: bool = False) -> str:
    """Gera relatório científico de UI/UX em Markdown."""
    n = aggregated["n"]
    sus = aggregated["SUS"]
    sus_grade_str = sus_grade(sus["mean"])
    umux = aggregated["UMUX_LITE"]
    tlx = aggregated["NASA_TLX"]
    bus = aggregated["BUS15"]
    tam = aggregated["TAM"]
    ms = aggregated["MOTHER_SPECIFIC"]

    demo_note = "\n> **⚠️ DADOS SIMULADOS (DEMO):** Este relatório usa dados gerados aleatoriamente para validação do framework. Substitua por dados reais de participantes.\n" if is_demo else ""

    report = f"""# MOTHER v122.20 — Relatório de Avaliação UI/UX
**Run ID:** `{run_id}`
**Data:** {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
**N participantes:** {n}
**Instrumentos:** SUS · BUS-15 · NASA-TLX · TAM · UMUX-Lite · MOTHER-Specific
{demo_note}

---

## 1. Sumário Executivo

| Instrumento | Score MOTHER | Referência / Benchmark | Grau | Status |
|-------------|-------------|----------------------|------|--------|
| **SUS** | {sus['mean']} ± {sus['std']} / 100 | ChatGPT: 75.34 · Threshold: 68 | {sus_grade_str} | {'✅' if sus['mean'] >= 68 else '⚠️'} |
| **UMUX-Lite** | {umux['mean']} ± {umux['std']} / 100 | Correlação SUS r=0.96 | — | {'✅' if umux['mean'] >= 68 else '⚠️'} |
| **NASA-TLX** | {tlx['Overall']['mean']} ± {tlx['Overall']['std']} / 100 | Target: <40 (baixa carga) | {tlx_grade(tlx['Overall']['mean'])} | {'✅' if tlx['Overall']['mean'] < 40 else '⚠️'} |
| **TAM Overall** | {tam['Overall']['mean']} ± {tam['Overall']['std']} / 100 | Target: >70 (alta aceitação) | — | {'✅' if tam['Overall']['mean'] >= 70 else '⚠️'} |
| **BUS-15 Overall** | {bus['Overall']['mean']} ± {bus['Overall']['std']} / 5 | Target: >3.5/5 | — | {'✅' if bus['Overall']['mean'] >= 3.5 else '⚠️'} |
| **MOTHER-Specific** | {ms['Overall']['mean']} ± {ms['Overall']['std']} / 100 | Target: >70/100 | — | {'✅' if ms['Overall']['mean'] >= 70 else '⚠️'} |

---

## 2. SUS — System Usability Scale (Brooke, 1996)

**Score:** {sus['mean']} / 100 (σ={sus['std']}) — **{sus_grade_str}**

| Referência | Score | Fonte |
|-----------|-------|-------|
| MOTHER v122.20 | **{sus['mean']}** | Este estudo (n={n}) |
| ChatGPT (GPT-3.5) | 75.34 | Thunström et al. (2024) |
| Threshold "Bom" | 72 | Bangor et al. (2008) |
| Threshold "Aceitável" | 68 | Brooke (1996) |
| Threshold "Excelente" | 85 | Sauro & Lewis (2012) |

> **Interpretação:** Score SUS de {sus['mean']} indica usabilidade {sus_grade_str.split('(')[1].rstrip(')') if '(' in sus_grade_str else sus_grade_str}.
> {'Acima do benchmark ChatGPT (75.34).' if sus['mean'] > 75.34 else 'Abaixo do benchmark ChatGPT (75.34) — área de melhoria.'}

---

## 3. BUS-15 — BOT Usability Scale (Borsci et al., 2022)

| Fator | Score (1-5) | Std | Status | Prioridade de Melhoria |
|-------|------------|-----|--------|----------------------|
| Efficiency | {bus['Efficiency']['mean']} | {bus['Efficiency']['std']} | {'✅' if bus['Efficiency']['mean'] >= 3.5 else '⚠️'} | {'Alta' if bus['Efficiency']['mean'] < 3.5 else 'Baixa'} |
| Effectiveness | {bus['Effectiveness']['mean']} | {bus['Effectiveness']['std']} | {'✅' if bus['Effectiveness']['mean'] >= 3.5 else '⚠️'} | {'Alta' if bus['Effectiveness']['mean'] < 3.5 else 'Baixa'} |
| Satisfaction | {bus['Satisfaction']['mean']} | {bus['Satisfaction']['std']} | {'✅' if bus['Satisfaction']['mean'] >= 3.5 else '⚠️'} | {'Alta' if bus['Satisfaction']['mean'] < 3.5 else 'Baixa'} |
| Learnability | {bus['Learnability']['mean']} | {bus['Learnability']['std']} | {'✅' if bus['Learnability']['mean'] >= 3.5 else '⚠️'} | {'Alta' if bus['Learnability']['mean'] < 3.5 else 'Baixa'} |
| Accessibility | {bus['Accessibility']['mean']} | {bus['Accessibility']['std']} | {'✅' if bus['Accessibility']['mean'] >= 3.5 else '⚠️'} | {'Alta' if bus['Accessibility']['mean'] < 3.5 else 'Baixa'} |
| **Overall** | **{bus['Overall']['mean']}** | {bus['Overall']['std']} | {'✅' if bus['Overall']['mean'] >= 3.5 else '⚠️'} | — |

---

## 4. NASA-TLX — Carga Cognitiva (Hart & Staveland, 1988)

| Subescala | Score (0-100) | Std | Interpretação |
|-----------|--------------|-----|--------------|
| Mental Demand | {tlx['Mental Demand']['mean']} | {tlx['Mental Demand']['std']} | {'Baixa ✅' if tlx['Mental Demand']['mean'] < 40 else 'Moderada ⚠️'} |
| Physical Demand | {tlx['Physical Demand']['mean']} | {tlx['Physical Demand']['std']} | {'Baixa ✅' if tlx['Physical Demand']['mean'] < 30 else 'Moderada ⚠️'} |
| Temporal Demand | {tlx['Temporal Demand']['mean']} | {tlx['Temporal Demand']['std']} | {'Baixa ✅' if tlx['Temporal Demand']['mean'] < 40 else 'Moderada ⚠️'} |
| Performance (inv.) | {tlx['Performance (inv.)']['mean']} | {tlx['Performance (inv.)']['std']} | {'Bom ✅' if tlx['Performance (inv.)']['mean'] > 60 else 'Regular ⚠️'} |
| Effort | {tlx['Effort']['mean']} | {tlx['Effort']['std']} | {'Baixo ✅' if tlx['Effort']['mean'] < 40 else 'Moderado ⚠️'} |
| Frustration | {tlx['Frustration']['mean']} | {tlx['Frustration']['std']} | {'Baixa ✅' if tlx['Frustration']['mean'] < 30 else 'Moderada ⚠️'} |
| **Overall** | **{tlx['Overall']['mean']}** | {tlx['Overall']['std']} | **{tlx_grade(tlx['Overall']['mean'])}** |

> **Interpretação:** Carga cognitiva {tlx_grade(tlx['Overall']['mean']).split()[0].lower()}.
> Target: <40 (baixa carga). {'✅ Dentro do target.' if tlx['Overall']['mean'] < 40 else '⚠️ Acima do target — investigar subescalas com maior score.'}

---

## 5. TAM — Aceitação Tecnológica (Davis, 1989)

| Constructo | Score (0-100) | Std | Interpretação |
|-----------|--------------|-----|--------------|
| Perceived Usefulness | {tam['Perceived Usefulness']['mean']} | {tam['Perceived Usefulness']['std']} | {'Alta ✅' if tam['Perceived Usefulness']['mean'] >= 70 else 'Moderada ⚠️'} |
| Perceived Ease of Use | {tam['Perceived Ease of Use']['mean']} | {tam['Perceived Ease of Use']['std']} | {'Alta ✅' if tam['Perceived Ease of Use']['mean'] >= 70 else 'Moderada ⚠️'} |
| Behavioral Intention | {tam['Behavioral Intention']['mean']} | {tam['Behavioral Intention']['std']} | {'Alta ✅' if tam['Behavioral Intention']['mean'] >= 70 else 'Moderada ⚠️'} |
| Trust | {tam['Trust']['mean']} | {tam['Trust']['std']} | {'Alta ✅' if tam['Trust']['mean'] >= 70 else 'Moderada ⚠️'} |
| **Overall** | **{tam['Overall']['mean']}** | {tam['Overall']['std']} | {'Alta ✅' if tam['Overall']['mean'] >= 70 else 'Moderada ⚠️'} |

---

## 6. MOTHER-Specific — Dimensões Específicas

| Dimensão | Score (0-100) | Std | Status |
|----------|--------------|-----|--------|
| Citation Quality | {ms['Citation Quality']['mean']} | {ms['Citation Quality']['std']} | {'✅' if ms['Citation Quality']['mean'] >= 70 else '⚠️'} |
| Domain Expertise | {ms['Domain Expertise']['mean']} | {ms['Domain Expertise']['std']} | {'✅' if ms['Domain Expertise']['mean'] >= 70 else '⚠️'} |
| Multi-turn Coherence | {ms['Multi-turn Coherence']['mean']} | {ms['Multi-turn Coherence']['std']} | {'✅' if ms['Multi-turn Coherence']['mean'] >= 70 else '⚠️'} |
| Hallucination Perception | {ms['Hallucination Perception']['mean']} | {ms['Hallucination Perception']['std']} | {'✅' if ms['Hallucination Perception']['mean'] >= 70 else '⚠️'} |
| Response Depth | {ms['Response Depth']['mean']} | {ms['Response Depth']['std']} | {'✅' if ms['Response Depth']['mean'] >= 70 else '⚠️'} |
| Language Quality | {ms['Language Quality']['mean']} | {ms['Language Quality']['std']} | {'✅' if ms['Language Quality']['mean'] >= 70 else '⚠️'} |
| Response Time Perception | {ms['Response Time Perception']['mean']} | {ms['Response Time Perception']['std']} | {'✅' if ms['Response Time Perception']['mean'] >= 60 else '⚠️'} |
| Formatting & Readability | {ms['Formatting & Readability']['mean']} | {ms['Formatting & Readability']['std']} | {'✅' if ms['Formatting & Readability']['mean'] >= 70 else '⚠️'} |
| Overall Satisfaction | {ms['Overall Satisfaction']['mean']} | {ms['Overall Satisfaction']['std']} | {'✅' if ms['Overall Satisfaction']['mean'] >= 70 else '⚠️'} |
| vs Alternatives | {ms['Comparison with Alternatives']['mean']} | {ms['Comparison with Alternatives']['std']} | {'✅' if ms['Comparison with Alternatives']['mean'] >= 50 else '⚠️'} |
| **Overall** | **{ms['Overall']['mean']}** | {ms['Overall']['std']} | {'✅' if ms['Overall']['mean'] >= 70 else '⚠️'} |

---

## 7. Análise de Gaps e Recomendações

| Dimensão | Score | Gap para Target | Prioridade | Ação Recomendada |
|----------|-------|----------------|-----------|-----------------|
| Response Time | {ms['Response Time Perception']['mean']:.0f}/100 | {max(0, 60 - ms['Response Time Perception']['mean']):.0f} pts | {'Alta' if ms['Response Time Perception']['mean'] < 60 else 'Baixa'} | Implementar streaming + indicador de progresso |
| Citation Quality | {ms['Citation Quality']['mean']:.0f}/100 | {max(0, 80 - ms['Citation Quality']['mean']):.0f} pts | {'Alta' if ms['Citation Quality']['mean'] < 80 else 'Baixa'} | Garantir 100% citation rate (C321) |
| Multi-turn Coherence | {ms['Multi-turn Coherence']['mean']:.0f}/100 | {max(0, 75 - ms['Multi-turn Coherence']['mean']):.0f} pts | {'Alta' if ms['Multi-turn Coherence']['mean'] < 75 else 'Baixa'} | Melhorar context window management |
| Trust | {tam['Trust']['mean']:.0f}/100 | {max(0, 75 - tam['Trust']['mean']):.0f} pts | {'Alta' if tam['Trust']['mean'] < 75 else 'Baixa'} | Aumentar transparência das fontes |

---

## 8. Referências Científicas

| # | Instrumento | Autores | Ano | DOI/Fonte |
|---|------------|---------|-----|-----------|
| [1] | SUS | Brooke, J. | 1996 | Usability Evaluation in Industry |
| [2] | BUS-15 | Borsci et al. | 2022 | doi:10.1007/s00779-021-01582-9 |
| [3] | NASA-TLX | Hart & Staveland | 1988 | Advances in Psychology, 52 |
| [4] | TAM | Davis, F.D. | 1989 | MIS Quarterly, 13(3) |
| [5] | UMUX-Lite | Finstad, K. | 2010 | Interacting with Computers, 22(5) |
| [6] | SUS Grading | Bangor et al. | 2008 | International Journal of HCI |
| [7] | ChatGPT SUS | Thunström et al. | 2024 | — |
| [8] | Response Time | Wang & Lo | 2025 | BMC Psychology |

---
*Gerado automaticamente pelo MOTHER UX Evaluation Framework v1.0 — {datetime.datetime.utcnow().strftime('%Y-%m-%d')}*
"""
    return report


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MOTHER UX Evaluation Analyzer")
    parser.add_argument("--demo", action="store_true", help="Usar dados simulados para demonstração")
    parser.add_argument("--input", type=str, help="Arquivo CSV com respostas reais")
    parser.add_argument("--n", type=int, default=8, help="Número de participantes simulados (modo demo)")
    args = parser.parse_args()

    run_id = datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    print(f"\n{Fore.CYAN}{'='*60}")
    print(f"  MOTHER UX Evaluation Analyzer")
    print(f"  Run ID: {run_id}")
    print(f"{'='*60}{Style.RESET_ALL}")

    is_demo = args.demo or not args.input
    if is_demo:
        print(f"\n{Fore.YELLOW}[DEMO] Gerando {args.n} participantes simulados...{Style.RESET_ALL}")
        participants = generate_demo_data(args.n)
    else:
        print(f"\n[INFO] Carregando dados de {args.input}...")
        # TODO: implementar leitura de CSV real
        print(f"{Fore.RED}[ERRO] Leitura de CSV não implementada ainda. Use --demo.{Style.RESET_ALL}")
        sys.exit(1)

    print(f"Calculando scores para {len(participants)} participantes...")
    aggregated = aggregate_scores(participants)

    # Imprime sumário
    sus = aggregated["SUS"]
    tlx = aggregated["NASA_TLX"]
    tam = aggregated["TAM"]
    ms = aggregated["MOTHER_SPECIFIC"]

    print(f"\n{Fore.CYAN}{'='*60}")
    print(f"  SUMÁRIO UI/UX")
    print(f"{'='*60}{Style.RESET_ALL}")
    print(f"  SUS Score: {sus['mean']} ± {sus['std']} — {sus_grade(sus['mean'])}")
    print(f"  NASA-TLX: {tlx['Overall']['mean']} — {tlx_grade(tlx['Overall']['mean'])}")
    print(f"  TAM Overall: {tam['Overall']['mean']}/100")
    print(f"  MOTHER-Specific: {ms['Overall']['mean']}/100")
    print(f"  Response Time Perception: {ms['Response Time Perception']['mean']}/100 {'⚠️' if ms['Response Time Perception']['mean'] < 60 else '✅'}")

    # Gera relatório
    report = generate_ux_report(aggregated, run_id, is_demo)
    report_file = RESULTS_DIR / f"ux_report_{run_id}.md"
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(report)

    # Salva dados JSON
    data_file = RESULTS_DIR / f"ux_data_{run_id}.json"
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump({"aggregated": aggregated, "n": len(participants)}, f, indent=2, default=str)

    print(f"\n  Relatório: {report_file}")
    print(f"  Dados: {data_file}\n")


if __name__ == "__main__":
    main()
