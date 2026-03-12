#!/usr/bin/env python3
"""
MOTHER v122.22 Post-Deploy Evaluation Suite
Ciclo C326 — G-Eval Pass Rate + Latency Benchmark + Citation Rate Check
Scientific methodology: G-Eval (Liu et al., 2023, arXiv:2303.16634)
"""

import os
import json
import time
import statistics
import requests
from datetime import datetime
from typing import Optional
from openai import OpenAI

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
TARGET_VERSION = "v122.22"

client = OpenAI(api_key=OPENAI_KEY)

# ── Test Suite ──────────────────────────────────────────────────────────────
TEST_QUERIES = [
    # Category: factual (CR1 fix validation — these failed in v87.0)
    {"id": "Q01", "cat": "factual", "query": "Explique o que é o Transformer e como o mecanismo de atenção funciona, incluindo a fórmula matemática."},
    {"id": "Q02", "cat": "factual", "query": "Quais são as diferenças entre BERT, GPT e T5? Compare arquitetura, pré-treinamento e casos de uso."},
    {"id": "Q03", "cat": "factual", "query": "Como funciona o RLHF (Reinforcement Learning from Human Feedback) no treinamento de LLMs?"},
    # Category: reasoning
    {"id": "Q04", "cat": "reasoning", "query": "Se um modelo tem 70B parâmetros e usa FP16, quanto de VRAM é necessário para inferência? Mostre o cálculo."},
    {"id": "Q05", "cat": "reasoning", "query": "Analise as vantagens e desvantagens de RAG vs fine-tuning para um sistema de QA corporativo."},
    {"id": "Q06", "cat": "reasoning", "query": "Por que o problema do desvanecimento do gradiente ocorre em RNNs e como o LSTM resolve isso?"},
    # Category: scientific (C321 validation — complex queries with arXiv refs)
    {"id": "Q07", "cat": "scientific", "query": "Utilizando literatura do arXiv, analise as causas raiz da diferença de qualidade entre LLMs. Inclua referências."},
    {"id": "Q08", "cat": "scientific", "query": "Qual é o estado da arte em avaliação automática de LLMs segundo papers recentes? Compare G-Eval, RAGAS e BERTScore."},
    {"id": "Q09", "cat": "scientific", "query": "Explique o paper 'Attention Is All You Need' (Vaswani et al., 2017) e seu impacto na área."},
    # Category: coding
    {"id": "Q10", "cat": "coding", "query": "Escreva um script Python para calcular a perplexidade de um modelo de linguagem dado um corpus de texto."},
    {"id": "Q11", "cat": "coding", "query": "Implemente um tokenizador BPE (Byte Pair Encoding) simples em Python com exemplo de uso."},
    # Category: shms (domain-specific)
    {"id": "Q12", "cat": "shms", "query": "O que é monitoramento geotécnico e quais sensores são usados em sistemas SHMS modernos?"},
    {"id": "Q13", "cat": "shms", "query": "Como um sistema SHMS integra dados de acelerômetros, inclinômetros e piezômetros para detecção de anomalias?"},
    # Category: analysis
    {"id": "Q14", "cat": "analysis", "query": "Analise o impacto do tamanho do contexto (context window) na qualidade de respostas de LLMs."},
    {"id": "Q15", "cat": "analysis", "query": "Compare os modelos GPT-4, Claude 3.5 e Gemini 1.5 Pro em termos de capacidades e limitações."},
    # Category: complex (multi-step)
    {"id": "Q16", "cat": "complex", "query": "Crie um framework completo de avaliação de LLMs com métricas automáticas e humanas, roadmap de implementação e tabelas comparativas."},
    # Category: creative
    {"id": "Q17", "cat": "creative", "query": "Escreva um plano de estudos de 3 meses para aprender Machine Learning do zero, com recursos e cronograma detalhado."},
    # Category: multilingual
    {"id": "Q18", "cat": "multilingual", "query": "Explain the concept of emergent abilities in large language models and why they are scientifically significant."},
    # Category: simple (should NOT trigger LFSA — CR1 regression test)
    {"id": "Q19", "cat": "simple", "query": "Qual é a capital do Brasil?"},
    {"id": "Q20", "cat": "simple", "query": "Quanto é 2 + 2?"},
]

GEVAL_SYSTEM = """You are an expert AI evaluator using the G-Eval methodology (Liu et al., 2023).
Evaluate the AI response on 5 dimensions, each scored 1-5:
1. Relevance: Does the response directly address the query?
2. Coherence: Is the response logically structured and internally consistent?
3. Groundedness: Are factual claims accurate and well-supported?
4. Completeness: Does the response cover all aspects of the query?
5. Hallucination-free: Is the response free from fabricated information?

Return ONLY a JSON object: {"relevance": N, "coherence": N, "groundedness": N, "completeness": N, "hallucination_free": N, "reasoning": "brief explanation"}"""

def query_mother(query: str, timeout: int = 90) -> tuple[Optional[str], float, bool]:
    """Query MOTHER and return (response_text, latency_s, timed_out)"""
    start = time.time()
    try:
        resp = requests.post(
            f"{MOTHER_URL}/api/mother/stream",
            json={"query": query, "useCache": False},
            timeout=timeout,
            stream=True,
            headers={"Content-Type": "application/json"}
        )
        
        if resp.status_code != 200:
            return None, time.time() - start, False
        
        full_text = ""
        for line in resp.iter_lines(decode_unicode=True):
            if line.startswith("data: "):
                try:
                    data = json.loads(line[6:])
                    if data.get("type") == "token":
                        full_text += data.get("content", "")
                    elif data.get("type") == "complete":
                        break
                except json.JSONDecodeError:
                    pass
        
        latency = time.time() - start
        return full_text if full_text else None, latency, False
    except requests.Timeout:
        return None, time.time() - start, True
    except Exception as e:
        return None, time.time() - start, False

def geval_score(query: str, response: str) -> dict:
    """Score a response using GPT-4o as G-Eval judge"""
    try:
        result = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": GEVAL_SYSTEM},
                {"role": "user", "content": f"Query: {query}\n\nResponse: {response[:3000]}"}
            ],
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"}
        )
        scores = json.loads(result.choices[0].message.content)
        avg = (scores["relevance"] + scores["coherence"] + scores["groundedness"] + 
               scores["completeness"] + scores["hallucination_free"]) / 5
        return {**scores, "avg": avg, "pass": avg >= 3.5}
    except Exception as e:
        return {"avg": 0, "pass": False, "error": str(e)}

def check_citations(response: str) -> bool:
    """Check if response contains citation patterns"""
    import re
    patterns = [
        r'arXiv:\d{4}\.\d{4,5}',
        r'\[\d+\]',
        r'\(.*\d{4}\)',
        r'doi\.org',
        r'et al\.',
    ]
    return any(re.search(p, response) for p in patterns)

def main():
    print(f"=== MOTHER v122.22 Post-Deploy Evaluation ===")
    print(f"Started: {datetime.utcnow().isoformat()}Z")
    print(f"Target: {MOTHER_URL}")
    
    # Version check
    try:
        health = requests.get(f"{MOTHER_URL}/api/health/version", timeout=15).json()
        print(f"Production version: {health.get('motherVersion')} / Cycle {health.get('cycle')}")
    except:
        print("Warning: Could not check production version")
    
    results = []
    latencies = []
    citation_count = 0
    
    for test in TEST_QUERIES:
        print(f"\n[{test['id']}] {test['cat']}: {test['query'][:60]}...")
        
        response, latency, timed_out = query_mother(test['query'])
        latencies.append(latency)
        
        if timed_out:
            print(f"  TIMEOUT after {latency:.1f}s")
            results.append({**test, "status": "timeout", "latency": latency, "pass": False, "score": 0})
            continue
        
        if not response:
            print(f"  ERROR: No response ({latency:.1f}s)")
            results.append({**test, "status": "error", "latency": latency, "pass": False, "score": 0})
            continue
        
        has_citation = check_citations(response)
        if has_citation:
            citation_count += 1
        
        scores = geval_score(test['query'], response)
        status = "pass" if scores.get("pass") else "fail"
        
        print(f"  {status.upper()} | Score: {scores.get('avg', 0):.1f}/5 | Latency: {latency:.1f}s | "
              f"Len: {len(response)} chars | Citations: {'YES' if has_citation else 'NO'}")
        
        results.append({
            **test,
            "status": status,
            "latency": latency,
            "response_len": len(response),
            "has_citation": has_citation,
            "pass": scores.get("pass", False),
            "score": scores.get("avg", 0) * 20,  # Convert to 0-100
            "scores": scores,
        })
    
    # Aggregate results
    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    pass_rate = passed / total * 100
    
    avg_latency = statistics.mean(latencies)
    p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
    citation_rate = citation_count / total * 100
    scored_results = [r["score"] for r in results if r["score"] > 0]
    avg_score = statistics.mean(scored_results) if scored_results else 0
    
    # By category
    cats = {}
    for r in results:
        c = r["cat"]
        if c not in cats:
            cats[c] = {"pass": 0, "total": 0, "scores": []}
        cats[c]["total"] += 1
        if r["pass"]:
            cats[c]["pass"] += 1
        if r["score"] > 0:
            cats[c]["scores"].append(r["score"])
    
    summary = {
        "version": TARGET_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
        "total_queries": total,
        "passed": passed,
        "pass_rate_pct": round(pass_rate, 1),
        "avg_score_100": round(avg_score, 1),
        "avg_latency_s": round(avg_latency, 1),
        "p95_latency_s": round(p95_latency, 1),
        "citation_rate_pct": round(citation_rate, 1),
        "gate_pass_rate": pass_rate >= 80,
        "gate_latency": avg_latency <= 30,
        "gate_citation": citation_rate >= 50,
        "by_category": {c: {
            "pass_rate": round(v["pass"]/v["total"]*100, 0),
            "avg_score": round(statistics.mean(v["scores"]) if v["scores"] else 0, 1)
        } for c, v in cats.items()},
        "results": results
    }
    
    print(f"\n{'='*60}")
    print(f"SUMMARY — MOTHER {TARGET_VERSION}")
    print(f"{'='*60}")
    print(f"Pass Rate:      {pass_rate:.1f}% ({passed}/{total}) {'✅ GATE PASS' if pass_rate >= 80 else '❌ GATE FAIL'}")
    print(f"Avg Score:      {avg_score:.1f}/100")
    print(f"Avg Latency:    {avg_latency:.1f}s {'✅' if avg_latency <= 30 else '❌'}")
    print(f"P95 Latency:    {p95_latency:.1f}s")
    print(f"Citation Rate:  {citation_rate:.1f}% {'✅' if citation_rate >= 50 else '❌'}")
    print(f"\nBy Category:")
    for c, v in sorted(cats.items()):
        pr = v["pass"]/v["total"]*100
        print(f"  {c:15s}: {pr:.0f}% ({v['pass']}/{v['total']})")
    
    # Save results
    out_path = "/home/ubuntu/upload/c326_geval_v122_22_results.json"
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\nResults saved to: {out_path}")
    
    return summary

if __name__ == "__main__":
    main()
