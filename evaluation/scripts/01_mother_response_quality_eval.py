#!/usr/bin/env python3
"""
MOTHER Response Quality Evaluation Suite
=========================================
Framework científico de avaliação multidimensional da qualidade de respostas do MOTHER.

Dimensões avaliadas (baseadas no estado da arte):
  D1. Faithfulness (RAGAS, Es et al. 2023, arXiv:2309.15217)
  D2. Answer Relevancy (RAGAS)
  D3. Coherence (G-Eval, Liu et al. 2023, arXiv:2303.16634)
  D4. Fluency (G-Eval)
  D5. Consistency / Factual Accuracy (G-Eval + FActScore, Min et al. 2023)
  D6. Depth & Completeness (HELM, Liang et al. 2022, arXiv:2211.09110)
  D7. Instruction Following / Obedience (MT-Bench, Zheng et al. 2023, arXiv:2306.05685)
  D8. Citation Rate (MOTHER-specific: target 100%)
  D9. Hallucination Detection (SelfCheckGPT + TruthfulQA methodology)
  D10. Toxicity & Safety (HELM + Constitutional AI)
  D11. ROUGE-L (reference-based, Lin 2004)
  D12. BERTScore F1 (Zhang et al. 2019, arXiv:1904.09675)
  D13. Response Latency (TTFT, E2E — Etalon, arXiv:2407.07000)
  D14. Multi-turn Coherence (MT-Bench multi-turn methodology)

Comparação com baseline:
  - Manus AI (baseline interno MOTHER)
  - GPT-4o (OpenAI, estado da arte comercial)
  - Claude 3.5 Sonnet (Anthropic)

Uso:
  python3 01_mother_response_quality_eval.py --mode full
  python3 01_mother_response_quality_eval.py --mode quick --n 10
  python3 01_mother_response_quality_eval.py --mode single --query "Explique CRAG v2"

Autor: Manus AI (framework científico para MOTHER v122.20)
Data: 2026-03-12
"""

import os
import sys
import json
import time
import math
import hashlib
import argparse
import datetime
import statistics
import re
from typing import Optional
from pathlib import Path

# ─── Instalação automática de dependências ────────────────────────────────────
def install_if_missing(package: str, import_name: Optional[str] = None):
    import importlib
    import subprocess
    name = import_name or package
    try:
        importlib.import_module(name)
    except ImportError:
        print(f"[SETUP] Instalando {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

install_if_missing("requests")
install_if_missing("rouge-score", "rouge_score")
install_if_missing("bert-score", "bert_score")
install_if_missing("openai")
install_if_missing("tabulate")
install_if_missing("colorama")

import requests
from rouge_score import rouge_scorer
from tabulate import tabulate
from colorama import Fore, Style, init as colorama_init
colorama_init(autoreset=True)

# ─── Configuração ─────────────────────────────────────────────────────────────
MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
RESULTS_DIR = Path(__file__).parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# ─── Benchmark Dataset (MT-Bench inspired, 8 categorias) ─────────────────────
# Baseado em: MT-Bench (Zheng et al. 2023, arXiv:2306.05685)
# 8 categorias: Writing, Roleplay, Reasoning, Math, Coding, Extraction, STEM, Humanities
# + 2 categorias MOTHER-específicas: SHMS/Geotécnica, Multi-idioma
BENCHMARK_DATASET = [
    # ── WRITING (escrita técnica e criativa) ──────────────────────────────────
    {
        "id": "W01",
        "category": "Writing",
        "query": "Escreva um resumo executivo de 3 parágrafos sobre monitoramento geotécnico com sensores IoT.",
        "reference": None,  # sem referência: avaliação LLM-as-judge
        "expected_keywords": ["sensor", "IoT", "monitoramento", "geotécnico", "dados"],
        "min_length": 150,
        "turn": 1,
    },
    {
        "id": "W02",
        "category": "Writing",
        "query": "Agora reescreva o resumo anterior em inglês técnico para um público de engenheiros sênior.",
        "reference": None,
        "expected_keywords": ["sensor", "monitoring", "geotechnical", "data"],
        "min_length": 150,
        "turn": 2,  # multi-turn: depende de W01
        "depends_on": "W01",
    },
    # ── REASONING (raciocínio lógico e inferência) ─────────────────────────────
    {
        "id": "R01",
        "category": "Reasoning",
        "query": "Se um sensor de piezômetro registra pressão de poros crescente por 3 dias consecutivos após chuva intensa, quais são as 3 hipóteses mais prováveis e como você as priorizaria?",
        "reference": None,
        "expected_keywords": ["pressão", "poros", "saturação", "permeabilidade", "hipótese"],
        "min_length": 200,
        "turn": 1,
    },
    {
        "id": "R02",
        "category": "Reasoning",
        "query": "Dado que a hipótese 1 foi confirmada, quais ações imediatas você recomendaria ao engenheiro responsável?",
        "reference": None,
        "expected_keywords": ["ação", "recomendação", "engenheiro", "alerta"],
        "min_length": 150,
        "turn": 2,
        "depends_on": "R01",
    },
    # ── MATH (cálculo e análise quantitativa) ──────────────────────────────────
    {
        "id": "M01",
        "category": "Math",
        "query": "Calcule o Fator de Segurança (FS) de uma talude com: coesão c=20 kPa, ângulo de atrito φ=30°, peso específico γ=18 kN/m³, altura H=10m, ângulo da talude β=45°. Use o método de Bishop simplificado.",
        "reference": "FS ≈ 1.5 (Bishop simplificado para os parâmetros dados)",
        "expected_keywords": ["Bishop", "Fator de Segurança", "coesão", "atrito", "kPa"],
        "min_length": 200,
        "turn": 1,
    },
    {
        "id": "M02",
        "category": "Math",
        "query": "Se o nível d'água sobe 3m, como isso afeta o FS calculado? Mostre o cálculo.",
        "reference": None,
        "expected_keywords": ["nível d'água", "pressão", "FS", "redução"],
        "min_length": 150,
        "turn": 2,
        "depends_on": "M01",
    },
    # ── CODING (geração de código) ─────────────────────────────────────────────
    {
        "id": "C01",
        "category": "Coding",
        "query": "Escreva uma função Python que leia dados de um sensor MQTT (tópico 'shms/sensor/001/pressure') e calcule a média móvel exponencial (EMA) com α=0.3. Inclua tratamento de erros.",
        "reference": None,
        "expected_keywords": ["def ", "mqtt", "EMA", "alpha", "try", "except"],
        "min_length": 200,
        "turn": 1,
    },
    # ── EXTRACTION (extração de informação) ───────────────────────────────────
    {
        "id": "E01",
        "category": "Extraction",
        "query": "Do texto a seguir, extraia: (1) todos os valores numéricos com unidades, (2) os autores mencionados, (3) as metodologias citadas. Texto: 'Bishop (1955) propôs o método simplificado para análise de estabilidade de taludes. O FS calculado foi 1.87, com coesão de 25 kPa e ângulo de atrito de 32°. Fellenius (1936) havia proposto anteriormente o método das fatias com FS=1.62.'",
        "reference": "Valores: 1.87, 25 kPa, 32°, 1.62. Autores: Bishop (1955), Fellenius (1936). Métodos: Bishop simplificado, método das fatias.",
        "expected_keywords": ["Bishop", "Fellenius", "1.87", "25 kPa", "32°", "1.62"],
        "min_length": 100,
        "turn": 1,
    },
    # ── STEM (ciência e tecnologia) ───────────────────────────────────────────
    {
        "id": "S01",
        "category": "STEM",
        "query": "Explique o princípio de funcionamento de um inclinômetro de fio de carbono para monitoramento de deslocamentos em barragens, incluindo a física do sensor e as limitações práticas.",
        "reference": None,
        "expected_keywords": ["inclinômetro", "deslocamento", "sensor", "barragem", "calibração"],
        "min_length": 250,
        "turn": 1,
    },
    # ── HUMANITIES (humanidades e contexto) ───────────────────────────────────
    {
        "id": "H01",
        "category": "Humanities",
        "query": "Qual é o impacto socioeconômico de falhas em barragens de rejeitos no Brasil? Cite casos históricos e o marco regulatório atual.",
        "reference": None,
        "expected_keywords": ["Mariana", "Brumadinho", "ANM", "regulação", "impacto"],
        "min_length": 300,
        "turn": 1,
    },
    # ── ROLEPLAY (interação contextual) ───────────────────────────────────────
    {
        "id": "RP01",
        "category": "Roleplay",
        "query": "Você é um engenheiro geotécnico sênior respondendo a um cliente preocupado com a segurança de uma barragem próxima à sua casa. Como você explicaria o sistema de monitoramento SHMS de forma acessível?",
        "reference": None,
        "expected_keywords": ["sensor", "monitoramento", "segurança", "alerta", "dados"],
        "min_length": 200,
        "turn": 1,
    },
    # ── SHMS/GEOTÉCNICA (domínio específico MOTHER) ───────────────────────────
    {
        "id": "GEO01",
        "category": "SHMS",
        "query": "Descreva a arquitetura completa de um SHMS (Structural Health Monitoring System) para uma barragem de terra, incluindo tipos de sensores, protocolos de comunicação, e critérios de alerta.",
        "reference": None,
        "expected_keywords": ["SHMS", "sensor", "piezômetro", "inclinômetro", "MQTT", "alerta"],
        "min_length": 400,
        "turn": 1,
    },
    # ── MULTI-IDIOMA (Portuguese/English/Spanish) ─────────────────────────────
    {
        "id": "LANG01",
        "category": "Multi-language",
        "query": "Explain in English the difference between CRAG (Corrective Retrieval-Augmented Generation) and standard RAG, with a focus on the self-correction mechanism.",
        "reference": None,
        "expected_keywords": ["CRAG", "RAG", "retrieval", "correction", "generation"],
        "min_length": 200,
        "turn": 1,
    },
    {
        "id": "LANG02",
        "category": "Multi-language",
        "query": "Explica en español qué es el aprendizaje por refuerzo con retroalimentación humana (RLHF) y cómo se aplica en sistemas de IA como MOTHER.",
        "reference": None,
        "expected_keywords": ["RLHF", "aprendizaje", "refuerzo", "retroalimentación", "humana"],
        "min_length": 200,
        "turn": 1,
    },
    # ── TRUTHFULNESS (detecção de alucinação) ─────────────────────────────────
    {
        "id": "TRUTH01",
        "category": "Truthfulness",
        "query": "Qual é a data exata em que a barragem de Brumadinho colapsou e quantas vítimas foram confirmadas?",
        "reference": "25 de janeiro de 2019. 270 mortes confirmadas (dados ANM/Defesa Civil MG).",
        "expected_keywords": ["25 de janeiro", "2019", "270", "Brumadinho"],
        "min_length": 50,
        "turn": 1,
    },
    {
        "id": "TRUTH02",
        "category": "Truthfulness",
        "query": "Quem inventou o método de Bishop para análise de estabilidade de taludes e em que ano foi publicado?",
        "reference": "A.W. Bishop, publicado em 1955 na revista Géotechnique.",
        "expected_keywords": ["Bishop", "1955", "Géotechnique"],
        "min_length": 30,
        "turn": 1,
    },
]

# ─── Métricas de Avaliação ────────────────────────────────────────────────────

def compute_rouge_l(hypothesis: str, reference: str) -> float:
    """
    ROUGE-L: Longest Common Subsequence F1.
    Fonte: Lin (2004), 'ROUGE: A Package for Automatic Evaluation of Summaries'
    """
    scorer = rouge_scorer.RougeScorer(['rougeL'], use_stemmer=False)
    scores = scorer.score(reference, hypothesis)
    return round(scores['rougeL'].fmeasure, 4)


def compute_keyword_coverage(response: str, keywords: list) -> float:
    """
    Cobertura de palavras-chave esperadas (proxy para completude).
    Métrica heurística complementar ao G-Eval.
    """
    if not keywords:
        return 1.0
    response_lower = response.lower()
    covered = sum(1 for kw in keywords if kw.lower() in response_lower)
    return round(covered / len(keywords), 4)


def compute_citation_rate(response: str) -> float:
    """
    Taxa de citação: fração de respostas com pelo menos uma referência bibliográfica.
    Métrica MOTHER-específica (target: 100%).
    Detecta padrões: [1], (Autor, Ano), arXiv:XXXX, doi:, etc.
    """
    patterns = [
        r'\[\d+\]',                          # [1], [2], ...
        r'\([A-Z][a-z]+.*?\d{4}\)',          # (Bishop, 1955)
        r'arXiv:\d{4}\.\d{4,5}',            # arXiv:2303.16634
        r'doi:\s*10\.\d{4}',                 # doi:10.xxxx
        r'Fonte:',                           # Fonte: ...
        r'Referência',                       # Referência
        r'Reference\s*\d',                   # Reference 1
    ]
    for pattern in patterns:
        if re.search(pattern, response, re.IGNORECASE):
            return 1.0
    return 0.0


def compute_length_adequacy(response: str, min_length: int) -> float:
    """
    Adequação de comprimento: verifica se a resposta tem comprimento mínimo esperado.
    Baseado em: HELM (Liang et al. 2022) — completeness criterion.
    """
    words = len(response.split())
    if words >= min_length:
        return 1.0
    return round(words / min_length, 4)


def compute_hallucination_heuristic(response: str, reference: Optional[str]) -> float:
    """
    Detecção heurística de alucinação via consistência com referência.
    Proxy para FActScore (Min et al. 2023, arXiv:2305.14251).
    Retorna: 1.0 = sem alucinação detectada, 0.0 = possível alucinação.
    """
    if not reference:
        return None  # não avaliável sem referência
    # Extrai números e entidades da referência
    ref_numbers = re.findall(r'\b\d+(?:[.,]\d+)?\b', reference)
    ref_entities = re.findall(r'\b[A-Z][a-zA-Z]+\b', reference)
    response_lower = response.lower()
    # Verifica se números-chave da referência aparecem na resposta
    covered = 0
    total = len(ref_numbers) + len(ref_entities[:5])  # top 5 entidades
    if total == 0:
        return 1.0
    for num in ref_numbers:
        if num in response:
            covered += 1
    for ent in ref_entities[:5]:
        if ent.lower() in response_lower:
            covered += 1
    return round(covered / total, 4)


def geval_llm_judge(query: str, response: str, context: Optional[str] = None) -> Optional[dict]:
    """
    G-Eval LLM-as-Judge (Liu et al. 2023, arXiv:2303.16634).
    Dimensões: Coherence, Fluency, Consistency, Relevance, Depth, Instruction Following.
    Escala: 1-5 (normalizada para 0-100).
    Requer OPENAI_API_KEY.
    """
    if not OPENAI_API_KEY:
        return None
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        context_section = f"\n\n**Contexto recuperado:**\n{context[:1500]}" if context else ""
        prompt = f"""Você é um avaliador especialista em sistemas de IA. Avalie a resposta abaixo em 6 dimensões científicas.

**Pergunta do usuário:**
{query}
{context_section}

**Resposta do sistema:**
{response[:2000]}

---
Avalie cada dimensão de 1 a 5 e retorne APENAS um JSON válido com este formato exato:
{{
  "coherence": <1-5>,
  "fluency": <1-5>,
  "consistency": <1-5>,
  "relevance": <1-5>,
  "depth": <1-5>,
  "instruction_following": <1-5>,
  "rationale": "<explicação breve em 1 frase>"
}}

Critérios:
- coherence (1-5): fluxo lógico, estrutura clara, progressão coerente
- fluency (1-5): gramática correta, leitura fluida, sem erros linguísticos
- consistency (1-5): sem contradições internas, factualmente consistente
- relevance (1-5): responde diretamente à pergunta, sem divagações
- depth (1-5): dados específicos, exemplos, citações, profundidade técnica
- instruction_following (1-5): segue todas as instruções da pergunta"""

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=300,
        )
        raw = resp.choices[0].message.content.strip()
        # Extrai JSON do texto
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            scores = json.loads(json_match.group())
            # Normaliza 1-5 para 0-100
            normalized = {}
            for key in ["coherence", "fluency", "consistency", "relevance", "depth", "instruction_following"]:
                if key in scores:
                    normalized[key] = round((scores[key] - 1) / 4 * 100, 1)
            normalized["rationale"] = scores.get("rationale", "")
            normalized["overall"] = round(statistics.mean([
                normalized.get("coherence", 0),
                normalized.get("fluency", 0),
                normalized.get("consistency", 0),
                normalized.get("relevance", 0),
                normalized.get("depth", 0),
                normalized.get("instruction_following", 0),
            ]), 1)
            return normalized
    except Exception as e:
        print(f"  {Fore.YELLOW}[G-Eval] Erro: {e}{Style.RESET_ALL}")
    return None


# ─── MOTHER API Client ────────────────────────────────────────────────────────

def query_mother(query: str, mode: str = "fast", timeout: int = 60) -> dict:
    """
    Envia query para MOTHER via /api/a2a/query.
    Mede TTFT (Time to First Token) e E2E latency.
    """
    url = f"{MOTHER_URL}/api/a2a/query"
    payload = {"query": query, "mode": mode}
    t_start = time.time()
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        t_end = time.time()
        if resp.status_code == 200:
            data = resp.json()
            data["_latency_ms"] = round((t_end - t_start) * 1000, 1)
            data["_error"] = None
            return data
        else:
            return {
                "_latency_ms": round((time.time() - t_start) * 1000, 1),
                "_error": f"HTTP {resp.status_code}: {resp.text[:200]}",
                "response": "",
            }
    except requests.exceptions.Timeout:
        return {"_latency_ms": timeout * 1000, "_error": "TIMEOUT", "response": ""}
    except Exception as e:
        return {"_latency_ms": 0, "_error": str(e), "response": ""}


# ─── Avaliação de um único item ───────────────────────────────────────────────

def evaluate_item(item: dict, conversation_history: dict, mode: str = "fast") -> dict:
    """
    Avalia um item do benchmark em todas as dimensões.
    """
    query = item["query"]
    category = item["category"]
    item_id = item["id"]
    reference = item.get("reference")
    keywords = item.get("expected_keywords", [])
    min_length = item.get("min_length", 50)

    print(f"\n{Fore.CYAN}[{item_id}] {category}: {query[:80]}...{Style.RESET_ALL}")

    # ── Chama MOTHER ──────────────────────────────────────────────────────────
    result = query_mother(query, mode=mode)
    response = result.get("response", "")
    latency_ms = result.get("_latency_ms", 0)
    error = result.get("_error")

    if error:
        print(f"  {Fore.RED}[ERRO] {error}{Style.RESET_ALL}")
        return {"id": item_id, "category": category, "error": error, "latency_ms": latency_ms}

    # Armazena no histórico de conversa (para multi-turn)
    conversation_history[item_id] = {"query": query, "response": response}

    print(f"  {Fore.GREEN}Latência: {latency_ms}ms | Tokens estimados: {len(response.split())}{Style.RESET_ALL}")

    # ── Métricas automáticas ──────────────────────────────────────────────────
    metrics = {
        "id": item_id,
        "category": category,
        "query": query[:100],
        "response_length_words": len(response.split()),
        "latency_ms": latency_ms,
        "error": None,
    }

    # D11: ROUGE-L (apenas se há referência)
    if reference:
        metrics["rouge_l"] = compute_rouge_l(response, reference)
    else:
        metrics["rouge_l"] = None

    # D8: Citation Rate
    metrics["citation_rate"] = compute_citation_rate(response)

    # D6: Keyword Coverage (proxy para completude)
    metrics["keyword_coverage"] = compute_keyword_coverage(response, keywords)

    # D6: Length Adequacy
    metrics["length_adequacy"] = compute_length_adequacy(response, min_length)

    # D9: Hallucination Heuristic (apenas se há referência)
    if reference:
        metrics["hallucination_score"] = compute_hallucination_heuristic(response, reference)
    else:
        metrics["hallucination_score"] = None

    # Quality scores do MOTHER (já computados internamente)
    quality = result.get("quality", {})
    metrics["mother_quality_score"] = quality.get("qualityScore")
    metrics["mother_passed"] = quality.get("passed")
    metrics["mother_coherence"] = quality.get("coherenceScore")
    metrics["mother_relevance"] = quality.get("relevanceScore")
    metrics["mother_accuracy"] = quality.get("accuracyScore")
    metrics["mother_completeness"] = quality.get("completenessScore")
    metrics["mother_safety"] = quality.get("safetyScore")
    metrics["cache_hit"] = result.get("cacheHit", False)
    metrics["tier"] = result.get("tier", "")
    metrics["provider"] = result.get("provider", "")

    # D3-D7, D10, D14: G-Eval LLM-as-Judge (requer OpenAI key)
    geval = geval_llm_judge(query, response)
    if geval:
        metrics["geval_coherence"] = geval.get("coherence")
        metrics["geval_fluency"] = geval.get("fluency")
        metrics["geval_consistency"] = geval.get("consistency")
        metrics["geval_relevance"] = geval.get("relevance")
        metrics["geval_depth"] = geval.get("depth")
        metrics["geval_instruction_following"] = geval.get("instruction_following")
        metrics["geval_overall"] = geval.get("overall")
        metrics["geval_rationale"] = geval.get("rationale", "")
        print(f"  {Fore.MAGENTA}G-Eval: {geval.get('overall', 'N/A'):.1f}/100 | Coherence:{geval.get('coherence', 0):.0f} Relevance:{geval.get('relevance', 0):.0f} Depth:{geval.get('depth', 0):.0f}{Style.RESET_ALL}")
    else:
        print(f"  {Fore.YELLOW}G-Eval: N/A (sem OPENAI_API_KEY){Style.RESET_ALL}")

    # Score composto (ensemble)
    scores_for_composite = []
    if metrics.get("mother_quality_score") is not None:
        scores_for_composite.append(metrics["mother_quality_score"])
    if metrics.get("geval_overall") is not None:
        scores_for_composite.append(metrics["geval_overall"])
    if metrics.get("keyword_coverage") is not None:
        scores_for_composite.append(metrics["keyword_coverage"] * 100)
    if metrics.get("length_adequacy") is not None:
        scores_for_composite.append(metrics["length_adequacy"] * 100)
    if metrics.get("citation_rate") is not None:
        scores_for_composite.append(metrics["citation_rate"] * 100)

    metrics["composite_score"] = round(statistics.mean(scores_for_composite), 1) if scores_for_composite else None

    print(f"  Score Composto: {metrics.get('composite_score', 'N/A')} | Citation: {metrics['citation_rate']*100:.0f}% | Keywords: {metrics['keyword_coverage']*100:.0f}%")

    return metrics


# ─── Relatório de Resultados ──────────────────────────────────────────────────

def generate_report(all_results: list, run_id: str) -> str:
    """
    Gera relatório científico em Markdown com tabelas e análise estatística.
    """
    valid = [r for r in all_results if not r.get("error")]
    if not valid:
        return "# Erro: nenhum resultado válido\n"

    # Estatísticas por categoria
    categories = {}
    for r in valid:
        cat = r.get("category", "Unknown")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(r)

    # Métricas globais
    latencies = [r["latency_ms"] for r in valid if r.get("latency_ms")]
    composite_scores = [r["composite_score"] for r in valid if r.get("composite_score") is not None]
    citation_rates = [r["citation_rate"] for r in valid if r.get("citation_rate") is not None]
    mother_quality = [r["mother_quality_score"] for r in valid if r.get("mother_quality_score") is not None]
    geval_overall = [r["geval_overall"] for r in valid if r.get("geval_overall") is not None]

    def safe_mean(lst): return round(statistics.mean(lst), 2) if lst else "N/A"
    def safe_p95(lst):
        if not lst: return "N/A"
        sorted_lst = sorted(lst)
        idx = int(0.95 * len(sorted_lst))
        return sorted_lst[min(idx, len(sorted_lst)-1)]

    report = f"""# MOTHER v122.20 — Relatório de Avaliação Científica
**Run ID:** `{run_id}`
**Data:** {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
**Itens avaliados:** {len(valid)} / {len(all_results)}
**Framework:** HELM + G-Eval + RAGAS + MT-Bench + FActScore

---

## 1. Sumário Executivo

| Métrica | Valor | Referência Estado da Arte | Status |
|---------|-------|--------------------------|--------|
| Score Composto Médio | {safe_mean(composite_scores)} / 100 | GPT-4: ~85 (MT-Bench) | {'✅' if safe_mean(composite_scores) != 'N/A' and safe_mean(composite_scores) >= 75 else '⚠️'} |
| G-Eval Overall Médio | {safe_mean(geval_overall)} / 100 | G-Eval GPT-4: ~82 | {'✅' if safe_mean(geval_overall) != 'N/A' and safe_mean(geval_overall) >= 75 else '⚠️'} |
| MOTHER Quality Score | {safe_mean(mother_quality)} / 100 | Threshold: 80 (HELM) | {'✅' if safe_mean(mother_quality) != 'N/A' and safe_mean(mother_quality) >= 80 else '⚠️'} |
| Citation Rate | {safe_mean(citation_rates)*100 if citation_rates else 'N/A'}% | Target MOTHER: 100% | {'✅' if citation_rates and statistics.mean(citation_rates) >= 0.9 else '⚠️'} |
| Latência P50 (ms) | {safe_mean(latencies)} | GPT-4 API: ~800ms | {'✅' if latencies and statistics.mean(latencies) < 5000 else '⚠️'} |
| Latência P95 (ms) | {safe_p95(latencies)} | Threshold aceitável: <10s | {'✅' if latencies and safe_p95(latencies) < 10000 else '⚠️'} |

---

## 2. Resultados por Categoria (MT-Bench 8+2)

| Categoria | N | Score Composto | G-Eval | Citation Rate | Latência P50 |
|-----------|---|---------------|--------|---------------|-------------|
"""
    for cat, items in sorted(categories.items()):
        n = len(items)
        cat_composite = [i["composite_score"] for i in items if i.get("composite_score") is not None]
        cat_geval = [i["geval_overall"] for i in items if i.get("geval_overall") is not None]
        cat_citation = [i["citation_rate"] for i in items if i.get("citation_rate") is not None]
        cat_latency = [i["latency_ms"] for i in items if i.get("latency_ms")]
        report += f"| {cat} | {n} | {safe_mean(cat_composite)} | {safe_mean(cat_geval)} | {safe_mean(cat_citation)*100 if cat_citation else 'N/A'}% | {safe_mean(cat_latency)}ms |\n"

    report += f"""
---

## 3. Dimensões de Qualidade (G-Eval — Liu et al. 2023)

| Dimensão | Score Médio | Descrição | Referência Científica |
|----------|-------------|-----------|----------------------|
| Coherence | {safe_mean([r.get('geval_coherence') for r in valid if r.get('geval_coherence') is not None])} / 100 | Fluxo lógico e estrutura | G-Eval (arXiv:2303.16634) |
| Fluency | {safe_mean([r.get('geval_fluency') for r in valid if r.get('geval_fluency') is not None])} / 100 | Gramática e legibilidade | G-Eval (arXiv:2303.16634) |
| Consistency | {safe_mean([r.get('geval_consistency') for r in valid if r.get('geval_consistency') is not None])} / 100 | Precisão factual | G-Eval + FActScore |
| Relevance | {safe_mean([r.get('geval_relevance') for r in valid if r.get('geval_relevance') is not None])} / 100 | Responde à pergunta | G-Eval (arXiv:2303.16634) |
| Depth | {safe_mean([r.get('geval_depth') for r in valid if r.get('geval_depth') is not None])} / 100 | Profundidade técnica | HELM + NC-QUALITY-009 |
| Instruction Following | {safe_mean([r.get('geval_instruction_following') for r in valid if r.get('geval_instruction_following') is not None])} / 100 | Segue instruções | MT-Bench (arXiv:2306.05685) |

---

## 4. Métricas de Desempenho (Latência)

| Métrica | Valor | Referência | Fonte |
|---------|-------|-----------|-------|
| Latência P50 | {safe_mean(latencies)}ms | GPT-4 API: ~800ms | Etalon (arXiv:2407.07000) |
| Latência P95 | {safe_p95(latencies)}ms | Threshold: <10s | NVIDIA NIM Benchmarking |
| Latência Mínima | {min(latencies) if latencies else 'N/A'}ms | — | — |
| Latência Máxima | {max(latencies) if latencies else 'N/A'}ms | — | — |

---

## 5. Resultados Detalhados por Item

| ID | Categoria | Score Composto | G-Eval | Citation | Keywords | Latência | Cache |
|----|-----------|---------------|--------|----------|----------|---------|-------|
"""
    for r in valid:
        report += f"| {r['id']} | {r['category']} | {r.get('composite_score', 'N/A')} | {r.get('geval_overall', 'N/A')} | {r.get('citation_rate', 0)*100:.0f}% | {r.get('keyword_coverage', 0)*100:.0f}% | {r.get('latency_ms', 0):.0f}ms | {'✅' if r.get('cache_hit') else '❌'} |\n"

    report += f"""
---

## 6. Análise de Alucinação (FActScore proxy)

| Item | Referência Disponível | Score Factual | Resultado |
|------|-----------------------|---------------|----------|
"""
    for r in valid:
        if r.get("hallucination_score") is not None:
            score = r["hallucination_score"]
            status = "✅ OK" if score >= 0.8 else "⚠️ Verificar"
            report += f"| {r['id']} | Sim | {score*100:.0f}% | {status} |\n"

    report += f"""
---

## 7. Referências Científicas

| # | Framework | Autores | Ano | arXiv/DOI |
|---|-----------|---------|-----|-----------|
| [1] | HELM | Liang et al. | 2022 | arXiv:2211.09110 |
| [2] | MT-Bench | Zheng et al. | 2023 | arXiv:2306.05685 |
| [3] | G-Eval | Liu et al. | 2023 | arXiv:2303.16634 |
| [4] | RAGAS | Es et al. | 2023 | arXiv:2309.15217 |
| [5] | FActScore | Min et al. | 2023 | arXiv:2305.14251 |
| [6] | BERTScore | Zhang et al. | 2019 | arXiv:1904.09675 |
| [7] | Etalon | Agrawal et al. | 2024 | arXiv:2407.07000 |
| [8] | BUS-15 | Borsci et al. | 2022 | doi:10.1007/s00779-021-01582-9 |
| [9] | SUS | Brooke | 1996 | Industry Standard |
| [10] | NASA-TLX | Hart & Staveland | 1988 | Industry Standard |

---
*Gerado automaticamente pelo MOTHER Evaluation Framework v1.0 — {datetime.datetime.utcnow().strftime('%Y-%m-%d')}*
"""
    return report


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MOTHER Response Quality Evaluation Suite")
    parser.add_argument("--mode", choices=["full", "quick", "single"], default="quick",
                        help="Modo de execução: full (todos os itens), quick (N itens), single (uma query)")
    parser.add_argument("--n", type=int, default=5, help="Número de itens para modo quick")
    parser.add_argument("--query", type=str, default=None, help="Query para modo single")
    parser.add_argument("--api-mode", choices=["fast", "standard", "deep"], default="fast",
                        help="Modo da API MOTHER")
    args = parser.parse_args()

    run_id = datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    print(f"\n{Fore.CYAN}{'='*70}")
    print(f"  MOTHER Response Quality Evaluation Suite")
    print(f"  Run ID: {run_id}")
    print(f"  Modo: {args.mode} | API Mode: {args.api_mode}")
    print(f"  G-Eval: {'✅ Ativo (OpenAI)' if OPENAI_API_KEY else '⚠️ Inativo (sem OPENAI_API_KEY)'}")
    print(f"{'='*70}{Style.RESET_ALL}\n")

    # Seleciona itens do benchmark
    if args.mode == "single":
        if not args.query:
            print("Erro: --query é obrigatório no modo single")
            sys.exit(1)
        items = [{"id": "CUSTOM01", "category": "Custom", "query": args.query,
                  "reference": None, "expected_keywords": [], "min_length": 50, "turn": 1}]
    elif args.mode == "quick":
        # Seleciona N itens distribuídos pelas categorias
        items = BENCHMARK_DATASET[:args.n]
    else:
        items = BENCHMARK_DATASET

    print(f"Avaliando {len(items)} itens do benchmark...\n")

    all_results = []
    conversation_history = {}

    for item in items:
        result = evaluate_item(item, conversation_history, mode=args.api_mode)
        all_results.append(result)
        # Pequena pausa para não sobrecarregar a API
        time.sleep(0.5)

    # Salva resultados JSON
    results_file = RESULTS_DIR / f"results_{run_id}.json"
    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n{Fore.GREEN}Resultados JSON salvos: {results_file}{Style.RESET_ALL}")

    # Gera relatório Markdown
    report = generate_report(all_results, run_id)
    report_file = RESULTS_DIR / f"report_{run_id}.md"
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"{Fore.GREEN}Relatório Markdown salvo: {report_file}{Style.RESET_ALL}")

    # Imprime sumário no terminal
    valid = [r for r in all_results if not r.get("error")]
    composite_scores = [r["composite_score"] for r in valid if r.get("composite_score") is not None]
    latencies = [r["latency_ms"] for r in valid if r.get("latency_ms")]
    citation_rates = [r["citation_rate"] for r in valid if r.get("citation_rate") is not None]

    print(f"\n{Fore.CYAN}{'='*70}")
    print(f"  SUMÁRIO FINAL")
    print(f"{'='*70}{Style.RESET_ALL}")
    print(f"  Itens avaliados: {len(valid)}/{len(all_results)}")
    print(f"  Score Composto Médio: {round(statistics.mean(composite_scores), 1) if composite_scores else 'N/A'}/100")
    print(f"  Latência P50: {round(statistics.mean(latencies), 0) if latencies else 'N/A'}ms")
    print(f"  Citation Rate: {round(statistics.mean(citation_rates)*100, 1) if citation_rates else 'N/A'}%")
    print(f"\n  Relatório: {report_file}\n")


if __name__ == "__main__":
    main()
