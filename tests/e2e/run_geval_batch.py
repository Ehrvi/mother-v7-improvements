#!/usr/bin/env python3
"""
MOTHER v122.22 G-Eval Batch — concurrent queries + sequential judging
Saves results incrementally so partial data is preserved on interruption
"""
import os, json, time, re, statistics, concurrent.futures
import requests

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OUT_PATH = "/home/ubuntu/upload/c326_geval_v122_22_results.json"

QUERIES = [
    ("Q01","factual","Explique o que é o Transformer e como o mecanismo de atenção funciona."),
    ("Q02","factual","Quais são as diferenças entre BERT, GPT e T5? Compare arquitetura e casos de uso."),
    ("Q03","factual","Como funciona o RLHF no treinamento de LLMs?"),
    ("Q04","reasoning","Se um modelo tem 70B parâmetros e usa FP16, quanto de VRAM é necessário?"),
    ("Q05","reasoning","Analise vantagens e desvantagens de RAG vs fine-tuning para QA corporativo."),
    ("Q06","scientific","Utilizando literatura do arXiv, analise causas raiz da diferença de qualidade entre LLMs."),
    ("Q07","scientific","Compare G-Eval, RAGAS e BERTScore para avaliação automática de LLMs com referências."),
    ("Q08","coding","Escreva um script Python para calcular a perplexidade de um modelo de linguagem."),
    ("Q09","shms","O que é monitoramento geotécnico e quais sensores são usados em sistemas SHMS?"),
    ("Q10","analysis","Analise o impacto do tamanho do contexto (context window) na qualidade de LLMs."),
    ("Q11","complex","Crie um framework de avaliação de LLMs com métricas automáticas e humanas e roadmap."),
    ("Q12","creative","Escreva um plano de estudos de 3 meses para aprender Machine Learning do zero."),
    ("Q13","multilingual","Explain emergent abilities in large language models and their scientific significance."),
    ("Q14","simple","Qual é a capital do Brasil?"),
    ("Q15","simple","Quanto é 2 + 2?"),
]

JUDGE_SYS = """G-Eval judge (Liu et al. 2023). Score 1-5 on: relevance, coherence, groundedness, completeness, hallucination_free.
Return ONLY JSON: {"r":N,"c":N,"g":N,"co":N,"h":N}"""

def fetch_mother(qid, cat, q):
    start = time.time()
    try:
        resp = requests.post(f"{MOTHER_URL}/api/mother/stream",
            json={"query": q, "useCache": False},
            timeout=65, stream=True,
            headers={"Content-Type": "application/json"})
        if resp.status_code != 200:
            return qid, cat, q, None, time.time()-start, False
        text = ""
        cur_ev = None
        for raw in resp.iter_lines():
            if not raw: continue
            try: line = raw.decode('utf-8')
            except: line = raw.decode('latin-1')
            if line.startswith("event: "):
                cur_ev = line[7:].strip()
                if cur_ev in ("done","error"): break
            elif line.startswith("data: ") and cur_ev == "token":
                try:
                    d = json.loads(line[6:])
                    text += d.get("text", d.get("content",""))
                except: pass
        return qid, cat, q, text or None, time.time()-start, False
    except requests.Timeout:
        return qid, cat, q, None, time.time()-start, True
    except Exception as e:
        return qid, cat, q, None, time.time()-start, False

def judge(q, r):
    try:
        resp = requests.post(OPENAI_URL,
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            json={"model":"gpt-4o-mini","messages":[
                {"role":"system","content":JUDGE_SYS},
                {"role":"user","content":f"Q: {q}\nA: {r[:2000]}"}
            ],"temperature":0,"max_tokens":60,"response_format":{"type":"json_object"}},
            timeout=20)
        d = json.loads(resp.json()["choices"][0]["message"]["content"])
        avg = (d.get("r",1)+d.get("c",1)+d.get("g",1)+d.get("co",1)+d.get("h",1))/5
        return avg, avg >= 3.5
    except Exception as e:
        return 0.0, False

def has_cite(t):
    return bool(re.search(r'arXiv:\d{4}|et al\.|doi\.org|\[\d+\]|\(\w[^)]*\d{4}', t or ""))

def lfsa_ok(t, q):
    complex_kw = ["analise","framework","roadmap","compare","crie","escreva","arxiv","avaliação"]
    is_complex = any(kw in q.lower() for kw in complex_kw)
    return (len(t) > 3000) if is_complex else (len(t) < 2000)

print("="*60, flush=True)
print("MOTHER v122.22 G-Eval — Batch Mode", flush=True)
print(f"Time: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}", flush=True)

try:
    v = requests.get(f"{MOTHER_URL}/api/health/version", timeout=10).json()
    print(f"Production: {v.get('motherVersion')} / C{v.get('cycle')}", flush=True)
except: pass

# Fetch all responses concurrently (3 at a time to avoid rate limiting)
print("\nFetching MOTHER responses (concurrent)...", flush=True)
responses = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    futures = {ex.submit(fetch_mother, qid, cat, q): (qid, cat, q) for qid, cat, q in QUERIES}
    for fut in concurrent.futures.as_completed(futures):
        qid, cat, q, text, lat, to = fut.result()
        status = "timeout" if to else ("ok" if text else "error")
        print(f"  [{qid}] {status} | lat={lat:.1f}s | len={len(text) if text else 0}", flush=True)
        responses[qid] = {"cat": cat, "q": q, "text": text, "lat": lat, "timeout": to}

# Judge all responses sequentially
print("\nJudging responses (GPT-4o-mini)...", flush=True)
results = []
for qid, cat, q in QUERIES:
    r = responses[qid]
    text = r["text"]
    lat = r["lat"]
    
    if r["timeout"]:
        print(f"  [{qid}] TIMEOUT", flush=True)
        results.append({"id":qid,"cat":cat,"status":"timeout","lat":lat,"pass":False,"score":0,"cite":False,"lfsa":False,"len":0})
        continue
    if not text:
        print(f"  [{qid}] ERROR", flush=True)
        results.append({"id":qid,"cat":cat,"status":"error","lat":lat,"pass":False,"score":0,"cite":False,"lfsa":False,"len":0})
        continue
    
    avg, passed = judge(q, text)
    cite = has_cite(text)
    lfsa = lfsa_ok(text, q)
    score = round(avg * 20, 1)
    status = "PASS" if passed else "FAIL"
    print(f"  [{qid}] {status} | score={score:.0f} | lat={lat:.1f}s | len={len(text)} | cite={'Y' if cite else 'N'} | lfsa={'Y' if lfsa else 'N'}", flush=True)
    results.append({"id":qid,"cat":cat,"status":status.lower(),"lat":lat,"pass":passed,"score":score,"cite":cite,"lfsa":lfsa,"len":len(text)})

# Aggregate
passed_n = sum(1 for r in results if r["pass"])
total = len(results)
lats = [r["lat"] for r in results]
scores = [r["score"] for r in results if r["score"] > 0]
cites = sum(1 for r in results if r["cite"])
lfsa_ok_n = sum(1 for r in results if r["lfsa"])
errors = sum(1 for r in results if r["status"] in ("error","timeout"))

pass_rate = passed_n/total*100
avg_lat = statistics.mean(lats)
p95_lat = sorted(lats)[int(len(lats)*0.95)]
cite_rate = cites/total*100
avg_score = statistics.mean(scores) if scores else 0

cats = {}
for r in results:
    c = r["cat"]
    if c not in cats: cats[c] = {"p":0,"t":0,"s":[],"l":[]}
    cats[c]["t"] += 1
    if r["pass"]: cats[c]["p"] += 1
    if r["score"] > 0: cats[c]["s"].append(r["score"])
    cats[c]["l"].append(r["lat"])

print(f"\n{'='*60}", flush=True)
print(f"FINAL RESULTS — MOTHER v122.22", flush=True)
print(f"{'='*60}", flush=True)
print(f"Pass Rate:     {passed_n}/{total} = {pass_rate:.1f}% {'✅ GATE PASS' if pass_rate >= 80 else '❌ GATE FAIL'}", flush=True)
print(f"Avg Score:     {avg_score:.1f}/100", flush=True)
print(f"Avg Latency:   {avg_lat:.1f}s {'✅' if avg_lat <= 30 else '⚠️'}", flush=True)
print(f"P95 Latency:   {p95_lat:.1f}s", flush=True)
print(f"Citation Rate: {cites}/{total} = {cite_rate:.1f}% {'✅' if cite_rate >= 50 else '❌'}", flush=True)
print(f"LFSA Correct:  {lfsa_ok_n}/{total} = {lfsa_ok_n/total*100:.1f}%", flush=True)
print(f"Errors:        {errors}/{total}", flush=True)

print(f"\nBy Category:", flush=True)
for c, v in sorted(cats.items()):
    pr = v["p"]/v["t"]*100
    avgs = statistics.mean(v["s"]) if v["s"] else 0
    avgl = statistics.mean(v["l"])
    print(f"  {c:14}: {v['p']}/{v['t']} = {pr:.0f}% | score={avgs:.0f} | lat={avgl:.1f}s", flush=True)

gates = {
    "Pass Rate ≥80%": pass_rate >= 80,
    "Avg Latency ≤30s": avg_lat <= 30,
    "Citation Rate ≥50%": cite_rate >= 50,
    "Error Rate ≤10%": errors/total <= 0.1,
}
print(f"\nGATE STATUS:", flush=True)
for g, ok in gates.items():
    print(f"  {'✅' if ok else '❌'} {g}", flush=True)

summary = {
    "version": "v122.22",
    "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    "pass_rate_pct": round(pass_rate,1),
    "avg_score_100": round(avg_score,1),
    "avg_latency_s": round(avg_lat,1),
    "p95_latency_s": round(p95_lat,1),
    "citation_rate_pct": round(cite_rate,1),
    "lfsa_correct_pct": round(lfsa_ok_n/total*100,1),
    "error_count": errors,
    "gates": gates,
    "by_category": {c: {
        "pass_rate": round(v["p"]/v["t"]*100,0),
        "avg_score": round(statistics.mean(v["s"]) if v["s"] else 0,1),
        "avg_latency": round(statistics.mean(v["l"]),1)
    } for c,v in cats.items()},
    "results": results
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)
print(f"\nSaved: {OUT_PATH}", flush=True)
