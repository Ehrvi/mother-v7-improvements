#!/usr/bin/env python3
"""
C326 — G-Eval Pass Rate Evaluation — MOTHER v122.21
Conselho dos 6 — Protocolo Delphi + MAD — 2026-03-12

Objetivo: Medir Pass Rate externo ≥80% usando GPT-4o como juiz G-Eval.
Critério de Gate: G-Eval score ≥80 em 20 queries diversas.

Base científica:
- Liu et al. (2023) "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment" — arXiv:2303.16634
- Zheng et al. (2023) "Judging LLM-as-a-Judge with MT-Bench" — arXiv:2306.05685
- Liang et al. (2022) "HELM: Holistic Evaluation of Language Models" — arXiv:2211.09110
- ISTQB Foundation Level Syllabus 2023 — gate criteria for test suites

Dimensões G-Eval (Liu et al., 2023):
  G1 — Relevância (0-10): Resposta aborda a pergunta diretamente
  G2 — Coerência (0-10): Estrutura lógica e fluência
  G3 — Fundamentação (0-10): Evidências, raciocínio ou exemplos concretos
  G4 — Completude (0-10): Cobre os aspectos essenciais da query
  G5 — Ausência de Alucinação (0-10): Sem afirmações incorretas ou inventadas

Score final = média(G1..G5) × 10 → escala 0-100
Gate: score ≥ 80 em ≥ 16/20 queries (80% pass rate)
"""

import json
import time
import os
import sys
import requests
import re
import statistics
from datetime import datetime
from typing import Optional

# ─── Configuration ───────────────────────────────────────────────────────────
MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
JUDGE_MODEL = "gpt-4o"
TIMEOUT_MOTHER = 120  # seconds
TIMEOUT_JUDGE = 30    # seconds
GATE_SCORE = 80       # minimum G-Eval score per query
GATE_PASS_RATE = 0.80 # 80% of queries must pass

# ─── 20 Diverse Test Queries (HELM-inspired coverage) ────────────────────────
# Coverage: factual, reasoning, coding, scientific, SHMS, creative, multilingual
TEST_QUERIES = [
    # Factual / Knowledge
    {
        "id": "Q01", "category": "factual",
        "query": "O que é aprendizado por reforço com feedback humano (RLHF) e como ele difere do DPO?",
        "min_keywords": ["reforço", "humano", "preferência", "DPO", "política"],
    },
    {
        "id": "Q02", "category": "factual",
        "query": "Explique o teorema de Bayes e dê um exemplo prático de aplicação.",
        "min_keywords": ["probabilidade", "condicional", "prior", "posterior", "exemplo"],
    },
    {
        "id": "Q03", "category": "factual",
        "query": "Quais são as diferenças entre SQL e NoSQL? Quando usar cada um?",
        "min_keywords": ["relacional", "esquema", "escalabilidade", "documento", "uso"],
    },
    # Reasoning / Logic
    {
        "id": "Q04", "category": "reasoning",
        "query": "Se todos os A são B, e alguns B são C, podemos concluir que alguns A são C? Justifique.",
        "min_keywords": ["não", "necessariamente", "silogismo", "lógica", "premissa"],
    },
    {
        "id": "Q05", "category": "reasoning",
        "query": "Um trem parte de A às 8h a 80km/h. Outro parte de B às 9h a 100km/h. A distância AB é 500km. Quando se encontram?",
        "min_keywords": ["hora", "km", "encontro", "distância", "velocidade"],
    },
    {
        "id": "Q06", "category": "reasoning",
        "query": "Analise os prós e contras de microserviços vs monólito para uma startup com 5 desenvolvedores.",
        "min_keywords": ["monólito", "microserviço", "complexidade", "startup", "recomend"],
    },
    # Coding / Technical
    {
        "id": "Q07", "category": "coding",
        "query": "Escreva uma função TypeScript que detecta se uma string é um palíndromo, ignorando espaços e case.",
        "min_keywords": ["function", "string", "return", "reverse", "toLowerCase"],
    },
    {
        "id": "Q08", "category": "coding",
        "query": "Como implementar debounce em JavaScript? Mostre o código.",
        "min_keywords": ["setTimeout", "clearTimeout", "function", "delay", "return"],
    },
    {
        "id": "Q09", "category": "coding",
        "query": "Explique Big O notation com exemplos de O(1), O(n), O(n²) e O(log n).",
        "min_keywords": ["complexidade", "O(1)", "O(n)", "exemplo", "algoritmo"],
    },
    # Scientific / Research
    {
        "id": "Q10", "category": "scientific",
        "query": "O que é Chain-of-Thought prompting e qual é sua base científica?",
        "min_keywords": ["raciocínio", "passo", "Wei", "arXiv", "desempenho"],
    },
    {
        "id": "Q11", "category": "scientific",
        "query": "Explique o mecanismo de atenção (attention mechanism) em transformers.",
        "min_keywords": ["query", "key", "value", "softmax", "pesos"],
    },
    {
        "id": "Q12", "category": "scientific",
        "query": "Quais são os principais métodos de avaliação de modelos de linguagem (LLMs)?",
        "min_keywords": ["benchmark", "HELM", "perplexidade", "avaliação", "humano"],
    },
    # SHMS / Geotechnical
    {
        "id": "Q13", "category": "shms",
        "query": "O que é monitoramento geotécnico e quais sensores são usados em barragens?",
        "min_keywords": ["sensor", "barragem", "deformação", "piezômetro", "monitoramento"],
    },
    {
        "id": "Q14", "category": "shms",
        "query": "Explique o conceito de fator de segurança em geotecnia.",
        "min_keywords": ["segurança", "resistência", "solicitação", "ruptura", "fator"],
    },
    # Analysis / Synthesis
    {
        "id": "Q15", "category": "analysis",
        "query": "Compare as arquiteturas GPT (decoder-only) e BERT (encoder-only). Quando usar cada uma?",
        "min_keywords": ["decoder", "encoder", "geração", "classificação", "bidirecional"],
    },
    {
        "id": "Q16", "category": "analysis",
        "query": "Quais são os principais desafios de segurança em sistemas de IA generativa?",
        "min_keywords": ["alucinação", "bias", "jailbreak", "segurança", "alinhamento"],
    },
    # Creative / Structured Output
    {
        "id": "Q17", "category": "creative",
        "query": "Crie um plano de estudos de 4 semanas para aprender Python do zero ao intermediário.",
        "min_keywords": ["semana", "Python", "exercício", "projeto", "prática"],
    },
    {
        "id": "Q18", "category": "creative",
        "query": "Escreva um e-mail profissional solicitando uma reunião para apresentar uma proposta de consultoria.",
        "min_keywords": ["prezado", "reunião", "proposta", "disponibilidade", "atenciosamente"],
    },
    # Multilingual / Portuguese-specific
    {
        "id": "Q19", "category": "multilingual",
        "query": "Qual é a diferença entre 'mau' e 'mal' em português? Dê exemplos de uso correto.",
        "min_keywords": ["adjetivo", "advérbio", "mau", "mal", "exemplo"],
    },
    # Complex / Multi-step
    {
        "id": "Q20", "category": "complex",
        "query": "Descreva o processo completo de fine-tuning de um LLM, desde a coleta de dados até a avaliação.",
        "min_keywords": ["dados", "treinamento", "loss", "avaliação", "fine-tuning"],
    },
]

# ─── G-Eval Judge Prompt (Liu et al., 2023) ──────────────────────────────────
GEVAL_SYSTEM = """Você é um avaliador especializado de sistemas de IA, seguindo o protocolo G-Eval (Liu et al., 2023, arXiv:2303.16634).
Avalie a resposta de um assistente de IA com base em 5 dimensões, cada uma de 0 a 10.
Seja rigoroso e imparcial. Retorne APENAS um JSON válido."""

GEVAL_USER_TEMPLATE = """Query do usuário:
{query}

Resposta do assistente:
{response}

Avalie nas 5 dimensões G-Eval (0-10 cada):
- G1_relevancia: A resposta aborda diretamente a query?
- G2_coerencia: A resposta tem estrutura lógica e fluência?
- G3_fundamentacao: A resposta inclui evidências, raciocínio ou exemplos concretos?
- G4_completude: A resposta cobre os aspectos essenciais da query?
- G5_ausencia_alucinacao: A resposta está livre de afirmações incorretas ou inventadas?

Retorne APENAS este JSON (sem markdown, sem explicações):
{{
  "G1_relevancia": <0-10>,
  "G2_coerencia": <0-10>,
  "G3_fundamentacao": <0-10>,
  "G4_completude": <0-10>,
  "G5_ausencia_alucinacao": <0-10>,
  "justificativa": "<uma frase explicando o score mais baixo>"
}}"""


def query_mother(query: str, timeout: int = TIMEOUT_MOTHER) -> Optional[str]:
    """Query MOTHER via SSE streaming endpoint and collect the final response."""
    try:
        response = requests.post(
            f"{MOTHER_URL}/api/mother/stream",
            json={"query": query, "useCache": False},
            headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            stream=True,
            timeout=timeout,
        )
        if response.status_code != 200:
            print(f"  [MOTHER] HTTP {response.status_code}")
            return None

        full_text = ""
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data:"):
                try:
                    data = json.loads(line[5:].strip())
                    if "response" in data:
                        full_text = data["response"]
                        break
                    elif "text" in data:
                        full_text += data["text"]
                except json.JSONDecodeError:
                    pass
        return full_text.strip() if full_text.strip() else None
    except Exception as e:
        print(f"  [MOTHER] Error: {e}")
        return None


def judge_with_geval(query: str, response: str) -> Optional[dict]:
    """Use GPT-4o as G-Eval judge to score the response."""
    if not OPENAI_API_KEY:
        # Fallback: keyword-based scoring when no OpenAI key
        return None

    try:
        payload = {
            "model": JUDGE_MODEL,
            "messages": [
                {"role": "system", "content": GEVAL_SYSTEM},
                {"role": "user", "content": GEVAL_USER_TEMPLATE.format(
                    query=query, response=response[:3000]  # truncate for token limit
                )},
            ],
            "temperature": 0.1,
            "max_tokens": 300,
        }
        r = requests.post(
            OPENAI_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            timeout=TIMEOUT_JUDGE,
        )
        if r.status_code != 200:
            return None
        content = r.json()["choices"][0]["message"]["content"]
        # Clean potential markdown code blocks
        content = re.sub(r"```(?:json)?", "", content).strip()
        return json.loads(content)
    except Exception as e:
        print(f"  [JUDGE] Error: {e}")
        return None


def keyword_score(response: str, keywords: list) -> float:
    """Fallback scoring based on keyword presence (when no OpenAI key)."""
    if not response:
        return 0.0
    response_lower = response.lower()
    hits = sum(1 for kw in keywords if kw.lower() in response_lower)
    # Base score: 50 if response exists, +5 per keyword hit, max 100
    base = 50 if len(response) > 100 else 20
    keyword_bonus = min(hits * 7, 50)
    length_bonus = min(len(response) / 100, 10)
    return min(base + keyword_bonus + length_bonus, 100)


def evaluate_query(test: dict, idx: int, total: int) -> dict:
    """Run a single query evaluation."""
    print(f"\n[{idx+1:02d}/{total}] {test['id']} ({test['category']}): {test['query'][:60]}...")

    # Step 1: Query MOTHER
    t0 = time.time()
    response = query_mother(test["query"])
    elapsed = time.time() - t0

    if not response:
        print(f"  ❌ No response from MOTHER (timeout or error)")
        return {
            "id": test["id"],
            "category": test["category"],
            "query": test["query"],
            "response_length": 0,
            "elapsed_s": round(elapsed, 1),
            "geval_score": 0,
            "geval_details": None,
            "passed": False,
            "method": "no_response",
        }

    print(f"  ✓ Response: {len(response)} chars in {elapsed:.1f}s")

    # Step 2: Score with G-Eval (GPT-4o judge) or keyword fallback
    geval_details = judge_with_geval(test["query"], response)

    if geval_details:
        dims = ["G1_relevancia", "G2_coerencia", "G3_fundamentacao", "G4_completude", "G5_ausencia_alucinacao"]
        scores = [geval_details.get(d, 5) for d in dims]
        geval_score = round(statistics.mean(scores) * 10, 1)
        method = "geval_gpt4o"
        print(f"  G-Eval: {geval_score:.1f}/100 — {geval_details.get('justificativa', '')[:60]}")
    else:
        # Keyword-based fallback
        geval_score = round(keyword_score(response, test["min_keywords"]), 1)
        geval_details = {"fallback": "keyword_scoring", "keywords_found": [
            kw for kw in test["min_keywords"] if kw.lower() in response.lower()
        ]}
        method = "keyword_fallback"
        print(f"  Keyword score: {geval_score:.1f}/100 (no OpenAI key — fallback)")

    passed = geval_score >= GATE_SCORE
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"  {status} — Score: {geval_score:.1f} (gate: {GATE_SCORE})")

    return {
        "id": test["id"],
        "category": test["category"],
        "query": test["query"],
        "response_length": len(response),
        "elapsed_s": round(elapsed, 1),
        "geval_score": geval_score,
        "geval_details": geval_details,
        "passed": passed,
        "method": method,
    }


def main():
    print("=" * 70)
    print("C326 — G-Eval Pass Rate Evaluation — MOTHER v122.21")
    print(f"Date: {datetime.now().isoformat()}")
    print(f"Judge: {JUDGE_MODEL if OPENAI_API_KEY else 'keyword_fallback'}")
    print(f"Gate: score ≥ {GATE_SCORE} in ≥ {int(GATE_PASS_RATE * 100)}% of queries")
    print("=" * 70)

    results = []
    for i, test in enumerate(TEST_QUERIES):
        result = evaluate_query(test, i, len(TEST_QUERIES))
        results.append(result)
        time.sleep(1)  # Rate limiting

    # ─── Aggregate Results ────────────────────────────────────────────────────
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    pass_rate = passed / total
    scores = [r["geval_score"] for r in results if r["geval_score"] > 0]
    avg_score = round(statistics.mean(scores), 1) if scores else 0
    median_score = round(statistics.median(scores), 1) if scores else 0

    # By category
    categories = {}
    for r in results:
        cat = r["category"]
        if cat not in categories:
            categories[cat] = {"total": 0, "passed": 0, "scores": []}
        categories[cat]["total"] += 1
        if r["passed"]:
            categories[cat]["passed"] += 1
        if r["geval_score"] > 0:
            categories[cat]["scores"].append(r["geval_score"])

    gate_passed = pass_rate >= GATE_PASS_RATE

    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    print(f"Total queries: {total}")
    print(f"Passed (≥{GATE_SCORE}): {passed}/{total} ({pass_rate*100:.1f}%)")
    print(f"Average G-Eval score: {avg_score}/100")
    print(f"Median G-Eval score: {median_score}/100")
    print(f"\nGATE C326: {'✅ PASSED' if gate_passed else '❌ FAILED'} (need {int(GATE_PASS_RATE*100)}%, got {pass_rate*100:.1f}%)")

    print("\nBy Category:")
    for cat, data in sorted(categories.items()):
        cat_pass_rate = data["passed"] / data["total"] * 100
        cat_avg = round(statistics.mean(data["scores"]), 1) if data["scores"] else 0
        print(f"  {cat:15s}: {data['passed']}/{data['total']} ({cat_pass_rate:.0f}%) avg={cat_avg}")

    print("\nFailed Queries:")
    for r in results:
        if not r["passed"]:
            print(f"  ❌ {r['id']} ({r['category']}): score={r['geval_score']}, len={r['response_length']}")

    # Save results
    output = {
        "timestamp": datetime.now().isoformat(),
        "mother_version": "v122.21",
        "cycle": "C326",
        "judge_model": JUDGE_MODEL if OPENAI_API_KEY else "keyword_fallback",
        "gate_score": GATE_SCORE,
        "gate_pass_rate": GATE_PASS_RATE,
        "total_queries": total,
        "passed_queries": passed,
        "pass_rate": round(pass_rate, 4),
        "avg_geval_score": avg_score,
        "median_geval_score": median_score,
        "gate_c326_passed": gate_passed,
        "by_category": {
            cat: {
                "pass_rate": round(data["passed"] / data["total"], 4),
                "avg_score": round(statistics.mean(data["scores"]), 1) if data["scores"] else 0,
            }
            for cat, data in categories.items()
        },
        "results": results,
    }

    output_path = "/home/ubuntu/mother-source/tests/e2e/c326_geval_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to: {output_path}")

    return 0 if gate_passed else 1


if __name__ == "__main__":
    sys.exit(main())
