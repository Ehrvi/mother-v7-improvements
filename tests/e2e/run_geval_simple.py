#!/usr/bin/env python3
"""
Simplified MOTHER v122.22 G-Eval — one query at a time, immediate output
"""
import os, json, time, sys, re, statistics
import requests
from openai import OpenAI

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

QUERIES = [
    ("Q01","factual","Explique o que é o Transformer e como o mecanismo de atenção funciona."),
    ("Q02","factual","Quais são as diferenças entre BERT, GPT e T5?"),
    ("Q03","factual","Como funciona o RLHF no treinamento de LLMs?"),
    ("Q04","reasoning","Se um modelo tem 70B parâmetros e usa FP16, quanto de VRAM é necessário?"),
    ("Q05","reasoning","Analise vantagens e desvantagens de RAG vs fine-tuning para QA corporativo."),
    ("Q06","scientific","Utilizando literatura do arXiv, analise causas raiz da diferença de qualidade entre LLMs."),
    ("Q07","scientific","Qual é o estado da arte em avaliação automática de LLMs? Compare G-Eval, RAGAS e BERTScore."),
    ("Q08","coding","Escreva um script Python para calcular a perplexidade de um modelo de linguagem."),
    ("Q09","shms","O que é monitoramento geotécnico e quais sensores são usados em sistemas SHMS modernos?"),
    ("Q10","analysis","Analise o impacto do tamanho do contexto (context window) na qualidade de respostas de LLMs."),
    ("Q11","complex","Crie um framework de avaliação de LLMs com métricas automáticas e humanas e roadmap."),
    ("Q12","creative","Escreva um plano de estudos de 3 meses para aprender Machine Learning do zero."),
    ("Q13","multilingual","Explain emergent abilities in large language models and their scientific significance."),
    ("Q14","simple","Qual é a capital do Brasil?"),
    ("Q15","simple","Quanto é 2 + 2?"),
]

JUDGE = """You are a G-Eval judge (Liu et al. 2023). Score the AI response 1-5 on:
relevance, coherence, groundedness, completeness, hallucination_free.
Return ONLY JSON: {"r":N,"c":N,"g":N,"co":N,"h":N}"""

def query_mother(q, timeout=60):
    start = time.time()
    try:
        resp = requests.post(f"{MOTHER_URL}/api/mother/stream",
            json={"query": q, "useCache": False},
            timeout=timeout, stream=True,
            headers={"Content-Type": "application/json; charset=utf-8"})
        resp.encoding = 'utf-8'
        if resp.status_code != 200:
            return None, time.time()-start, False
        text = ""
        current_event = None
        for line in resp.iter_lines(decode_unicode=True):
            if line.startswith("event: "):
                current_event = line[7:].strip()
                if current_event in ("done", "response", "error"):
                    break
            elif line.startswith("data: ") and current_event:
                try:
                    d = json.loads(line[6:])
                    if current_event == "token":
                        text += d.get("text", d.get("content", ""))
                    elif current_event == "phase":
                        if d.get("phase") == "complete":
                            # Don't break yet — tokens come after phase:complete
                            pass
                except: pass
        return text or None, time.time()-start, False
    except requests.Timeout:
        return None, time.time()-start, True
    except Exception as e:
        return None, time.time()-start, False

def judge(q, r):
    try:
        res = client.chat.completions.create(model="gpt-4o",
            messages=[{"role":"system","content":JUDGE},
                      {"role":"user","content":f"Q: {q}\nA: {r[:2000]}"}],
            temperature=0, max_tokens=100,
            response_format={"type":"json_object"})
        d = json.loads(res.choices[0].message.content)
        avg = (d.get("r",1)+d.get("c",1)+d.get("g",1)+d.get("co",1)+d.get("h",1))/5
        return avg, avg >= 3.5
    except: return 0, False

def has_citation(text):
    return bool(re.search(r'arXiv:\d{4}|et al\.|doi\.org|\[\d+\]|\(\w+.*\d{4}\)', text or ""))

print("=== MOTHER v122.22 G-Eval ===", flush=True)
print(f"URL: {MOTHER_URL}", flush=True)

# Check version
try:
    v = requests.get(f"{MOTHER_URL}/api/health/version", timeout=10).json()
    print(f"Version: {v.get('motherVersion')} / C{v.get('cycle')}", flush=True)
except: pass

results = []
for qid, cat, q in QUERIES:
    print(f"\n[{qid}] {cat}: {q[:55]}...", flush=True)
    sys.stdout.flush()
    
    resp, lat, to = query_mother(q)
    
    if to:
        print(f"  TIMEOUT {lat:.0f}s", flush=True)
        results.append({"id":qid,"cat":cat,"status":"timeout","lat":lat,"pass":False,"score":0,"cite":False})
        continue
    if not resp:
        print(f"  ERROR {lat:.1f}s", flush=True)
        results.append({"id":qid,"cat":cat,"status":"error","lat":lat,"pass":False,"score":0,"cite":False})
        continue
    
    avg, passed = judge(q, resp)
    cite = has_citation(resp)
    status = "PASS" if passed else "FAIL"
    print(f"  {status} | score={avg:.2f} | lat={lat:.1f}s | len={len(resp)} | cite={'Y' if cite else 'N'}", flush=True)
    results.append({"id":qid,"cat":cat,"status":status.lower(),"lat":lat,"pass":passed,"score":avg*20,"cite":cite,"len":len(resp)})

# Summary
passed_n = sum(1 for r in results if r["pass"])
total = len(results)
lats = [r["lat"] for r in results]
scores = [r["score"] for r in results if r["score"]>0]
cites = sum(1 for r in results if r["cite"])

print(f"\n{'='*50}", flush=True)
print(f"Pass Rate:  {passed_n}/{total} = {passed_n/total*100:.1f}% {'✅' if passed_n/total>=0.8 else '❌'}", flush=True)
print(f"Avg Score:  {statistics.mean(scores) if scores else 0:.1f}/100", flush=True)
print(f"Avg Lat:    {statistics.mean(lats):.1f}s", flush=True)
print(f"P95 Lat:    {sorted(lats)[int(len(lats)*0.95)]:.1f}s", flush=True)
print(f"Cite Rate:  {cites}/{total} = {cites/total*100:.1f}%", flush=True)

# By category
cats = {}
for r in results:
    c = r["cat"]
    if c not in cats: cats[c] = {"p":0,"t":0}
    cats[c]["t"] += 1
    if r["pass"]: cats[c]["p"] += 1
print("\nBy Category:", flush=True)
for c,v in sorted(cats.items()):
    print(f"  {c:12}: {v['p']}/{v['t']} = {v['p']/v['t']*100:.0f}%", flush=True)

# Save
out = {
    "version": "v122.22",
    "pass_rate": round(passed_n/total*100,1),
    "avg_score": round(statistics.mean(scores) if scores else 0,1),
    "avg_latency": round(statistics.mean(lats),1),
    "citation_rate": round(cites/total*100,1),
    "by_category": {c: round(v["p"]/v["t"]*100,0) for c,v in cats.items()},
    "results": results
}
with open("/home/ubuntu/upload/c326_geval_v122_22_results.json","w") as f:
    json.dump(out, f, indent=2)
print("\nSaved to /home/ubuntu/upload/c326_geval_v122_22_results.json", flush=True)
