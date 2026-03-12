#!/usr/bin/env python3
"""
MOTHER v122.22 G-Eval Final — uses requests for all HTTP calls
Scientific methodology: G-Eval (Liu et al., 2023, arXiv:2303.16634)
"""
import os, json, time, sys, re, statistics
import requests

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

QUERIES = [
    ("Q01","factual","Explique o que é o Transformer e como o mecanismo de atenção funciona, incluindo a fórmula matemática."),
    ("Q02","factual","Quais são as diferenças entre BERT, GPT e T5? Compare arquitetura, pré-treinamento e casos de uso."),
    ("Q03","factual","Como funciona o RLHF (Reinforcement Learning from Human Feedback) no treinamento de LLMs?"),
    ("Q04","reasoning","Se um modelo tem 70B parâmetros e usa FP16, quanto de VRAM é necessário? Mostre o cálculo."),
    ("Q05","reasoning","Analise as vantagens e desvantagens de RAG vs fine-tuning para um sistema de QA corporativo."),
    ("Q06","scientific","Utilizando literatura do arXiv, analise as causas raiz da diferença de qualidade entre LLMs. Inclua referências."),
    ("Q07","scientific","Qual é o estado da arte em avaliação automática de LLMs? Compare G-Eval, RAGAS e BERTScore com referências."),
    ("Q08","coding","Escreva um script Python completo para calcular a perplexidade de um modelo de linguagem dado um corpus."),
    ("Q09","shms","O que é monitoramento geotécnico e quais sensores são usados em sistemas SHMS modernos?"),
    ("Q10","analysis","Analise o impacto do tamanho do contexto (context window) na qualidade de respostas de LLMs."),
    ("Q11","complex","Crie um framework completo de avaliação de LLMs com métricas automáticas e humanas, roadmap e tabelas."),
    ("Q12","creative","Escreva um plano de estudos de 3 meses para aprender Machine Learning do zero, com recursos e cronograma."),
    ("Q13","multilingual","Explain the concept of emergent abilities in large language models and why they are scientifically significant."),
    ("Q14","simple","Qual é a capital do Brasil?"),
    ("Q15","simple","Quanto é 2 + 2?"),
]

JUDGE_SYS = """You are a G-Eval evaluator (Liu et al. 2023, arXiv:2303.16634).
Score the AI response on 5 dimensions (1=very poor, 5=excellent):
- relevance: Does the response directly address the query?
- coherence: Is the response logically structured and internally consistent?
- groundedness: Are factual claims accurate and well-supported?
- completeness: Does the response cover all aspects of the query?
- hallucination_free: Is the response free from fabricated information?

Return ONLY a valid JSON object with these exact keys: {"r":N,"c":N,"g":N,"co":N,"h":N}
where N is an integer 1-5."""

def query_mother(q: str, timeout: int = 70) -> tuple:
    """Query MOTHER SSE endpoint. Returns (text, latency_s, timed_out)."""
    start = time.time()
    try:
        resp = requests.post(
            f"{MOTHER_URL}/api/mother/stream",
            json={"query": q, "useCache": False},
            timeout=timeout, stream=True,
            headers={"Content-Type": "application/json"})
        if resp.status_code != 200:
            return None, time.time()-start, False
        
        text = ""
        current_event = None
        raw_bytes = b""
        
        for raw_line in resp.iter_lines():
            if raw_line is None:
                continue
            # Decode with UTF-8 explicitly
            try:
                line = raw_line.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    line = raw_line.decode('latin-1').encode('latin-1').decode('utf-8')
                except:
                    line = raw_line.decode('latin-1')
            
            if line.startswith("event: "):
                current_event = line[7:].strip()
                if current_event in ("done", "error"):
                    break
            elif line.startswith("data: ") and current_event == "token":
                try:
                    d = json.loads(line[6:])
                    chunk = d.get("text", d.get("content", ""))
                    text += chunk
                except:
                    pass
        
        return text if text else None, time.time()-start, False
    except requests.Timeout:
        return None, time.time()-start, True
    except Exception as e:
        return None, time.time()-start, False

def _smart_sample(text: str, max_chars: int = 6000) -> str:
    """Smart sampling for long responses: beginning + middle + end.
    Scientific basis: G-Eval (Liu et al., 2023) requires representative sampling
    for long-form responses to avoid truncation bias.
    """
    if len(text) <= max_chars:
        return text
    # For LFSA responses (>6000 chars), sample beginning + middle + end
    chunk = max_chars // 3
    beginning = text[:chunk]
    mid_start = len(text) // 2 - chunk // 2
    middle = text[mid_start:mid_start + chunk]
    end = text[-chunk:]
    return f"{beginning}\n\n[...{len(text) - max_chars} chars omitted for brevity...]\n\n{middle}\n\n[...continued...]\n\n{end}"

def judge_response(q: str, r: str) -> tuple:
    """Score response using GPT-4o-mini as G-Eval judge via requests."""
    try:
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": JUDGE_SYS},
                {"role": "user", "content": f"Query: {q}\n\nResponse: {_smart_sample(r, 6000)}"}
            ],
            "temperature": 0,
            "max_tokens": 80,
            "response_format": {"type": "json_object"}
        }
        resp = requests.post(OPENAI_URL,
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            json=payload, timeout=25)
        
        if resp.status_code != 200:
            return 0.0, False, f"HTTP {resp.status_code}"
        
        content = resp.json()["choices"][0]["message"]["content"]
        d = json.loads(content)
        avg = (d.get("r",1) + d.get("c",1) + d.get("g",1) + d.get("co",1) + d.get("h",1)) / 5
        return avg, avg >= 3.5, None
    except Exception as e:
        return 0.0, False, str(e)[:100]

def has_citation(text: str) -> bool:
    """Check if response contains academic citation patterns."""
    if not text:
        return False
    patterns = [
        r'arXiv:\d{4}\.\d{4,5}',
        r'\[\d+\]',
        r'et al\.',
        r'doi\.org',
        r'\(\w[^)]*\d{4}[^)]*\)',
    ]
    return any(re.search(p, text) for p in patterns)

def check_lfsa_activated(text: str, query: str) -> bool:
    """Check if LFSA was activated (long-form response for complex queries)."""
    complex_keywords = ["analise", "framework", "roadmap", "compare", "crie", "escreva", "arxiv"]
    is_complex = any(kw in query.lower() for kw in complex_keywords)
    if is_complex:
        return len(text) > 3000  # LFSA should produce >3000 chars
    else:
        return len(text) < 2000  # Simple queries should be concise

# ── Main ────────────────────────────────────────────────────────────────────
print("=" * 60, flush=True)
print("MOTHER v122.22 G-Eval Post-Deploy Evaluation", flush=True)
print(f"Started: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}", flush=True)
print(f"Target: {MOTHER_URL}", flush=True)
print("=" * 60, flush=True)

# Version check
try:
    v = requests.get(f"{MOTHER_URL}/api/health/version", timeout=10).json()
    print(f"Production: {v.get('motherVersion')} / Cycle C{v.get('cycle')}", flush=True)
except Exception as e:
    print(f"Version check failed: {e}", flush=True)

results = []

for qid, cat, q in QUERIES:
    print(f"\n[{qid}] {cat}: {q[:60]}...", flush=True)
    
    resp_text, latency, timed_out = query_mother(q)
    
    if timed_out:
        print(f"  TIMEOUT after {latency:.0f}s", flush=True)
        results.append({"id":qid,"cat":cat,"status":"timeout","lat":latency,"pass":False,"score":0,"cite":False,"len":0,"lfsa":False})
        continue
    
    if not resp_text:
        print(f"  ERROR (no response) {latency:.1f}s", flush=True)
        results.append({"id":qid,"cat":cat,"status":"error","lat":latency,"pass":False,"score":0,"cite":False,"len":0,"lfsa":False})
        continue
    
    cite = has_citation(resp_text)
    lfsa = check_lfsa_activated(resp_text, q)
    avg_score, passed, err = judge_response(q, resp_text)
    
    status = "PASS" if passed else "FAIL"
    score_100 = round(avg_score * 20, 1)
    
    print(f"  {status} | score={score_100:.0f}/100 | lat={latency:.1f}s | len={len(resp_text)} | cite={'Y' if cite else 'N'} | lfsa={'Y' if lfsa else 'N'}{' | err='+err if err else ''}", flush=True)
    
    results.append({
        "id": qid, "cat": cat, "status": status.lower(),
        "lat": round(latency, 1), "pass": passed,
        "score": score_100, "cite": cite, "lfsa": lfsa,
        "len": len(resp_text), "err": err
    })

# ── Aggregate ────────────────────────────────────────────────────────────────
passed_n = sum(1 for r in results if r["pass"])
total = len(results)
lats = [r["lat"] for r in results]
scores = [r["score"] for r in results if r["score"] > 0]
cites = sum(1 for r in results if r["cite"])
lfsa_correct = sum(1 for r in results if r["lfsa"])
errors = sum(1 for r in results if r["status"] in ("error", "timeout"))

pass_rate = passed_n / total * 100
avg_lat = statistics.mean(lats)
p95_lat = sorted(lats)[int(len(lats) * 0.95)]
cite_rate = cites / total * 100
avg_score = statistics.mean(scores) if scores else 0

# By category
cats = {}
for r in results:
    c = r["cat"]
    if c not in cats:
        cats[c] = {"pass": 0, "total": 0, "scores": [], "lats": []}
    cats[c]["total"] += 1
    if r["pass"]:
        cats[c]["pass"] += 1
    if r["score"] > 0:
        cats[c]["scores"].append(r["score"])
    cats[c]["lats"].append(r["lat"])

print(f"\n{'='*60}", flush=True)
print(f"RESULTS — MOTHER v122.22 Post-Deploy", flush=True)
print(f"{'='*60}", flush=True)
print(f"Pass Rate:     {passed_n}/{total} = {pass_rate:.1f}% {'✅ GATE PASS' if pass_rate >= 80 else '❌ GATE FAIL (target: 80%)'}", flush=True)
print(f"Avg Score:     {avg_score:.1f}/100", flush=True)
print(f"Avg Latency:   {avg_lat:.1f}s {'✅' if avg_lat <= 30 else '❌ (target: ≤30s)'}", flush=True)
print(f"P95 Latency:   {p95_lat:.1f}s", flush=True)
print(f"Citation Rate: {cites}/{total} = {cite_rate:.1f}% {'✅' if cite_rate >= 50 else '❌ (target: ≥50%)'}", flush=True)
print(f"LFSA Correct:  {lfsa_correct}/{total} = {lfsa_correct/total*100:.1f}%", flush=True)
print(f"Errors:        {errors}/{total}", flush=True)

print(f"\nBy Category:", flush=True)
for c, v in sorted(cats.items()):
    pr = v["pass"] / v["total"] * 100
    avg_s = statistics.mean(v["scores"]) if v["scores"] else 0
    avg_l = statistics.mean(v["lats"])
    print(f"  {c:14}: {v['pass']}/{v['total']} = {pr:.0f}% | avg_score={avg_s:.0f} | avg_lat={avg_l:.1f}s", flush=True)

# Gate summary
print(f"\nGATE STATUS:", flush=True)
gates = {
    "Pass Rate ≥80%": pass_rate >= 80,
    "Avg Latency ≤30s": avg_lat <= 30,
    "Citation Rate ≥50%": cite_rate >= 50,
    "Error Rate ≤10%": errors/total <= 0.1,
}
for gate, ok in gates.items():
    print(f"  {'✅' if ok else '❌'} {gate}", flush=True)

# Save results
summary = {
    "version": "v122.22",
    "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    "pass_rate_pct": round(pass_rate, 1),
    "avg_score_100": round(avg_score, 1),
    "avg_latency_s": round(avg_lat, 1),
    "p95_latency_s": round(p95_lat, 1),
    "citation_rate_pct": round(cite_rate, 1),
    "lfsa_correct_pct": round(lfsa_correct/total*100, 1),
    "error_count": errors,
    "gates": {k: v for k, v in gates.items()},
    "by_category": {c: {
        "pass_rate": round(v["pass"]/v["total"]*100, 0),
        "avg_score": round(statistics.mean(v["scores"]) if v["scores"] else 0, 1),
        "avg_latency": round(statistics.mean(v["lats"]), 1)
    } for c, v in cats.items()},
    "results": results
}

out_path = "/home/ubuntu/upload/c326_geval_v122_22_results.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)
print(f"\nResults saved: {out_path}", flush=True)
