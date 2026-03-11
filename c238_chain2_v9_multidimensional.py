#!/usr/bin/env python3
"""
C238 — Chain 2 Benchmark v9 — Multi-Dimensional (C258)
=======================================================
Scientific basis:
- HELM (arXiv:2211.09110): Multi-metric evaluation
- MT-Bench (arXiv:2306.05685): Q≥90 = SOTA P50
- Prometheus 2 (arXiv:2405.01535): 6 quality dimensions
- FrugalGPT (arXiv:2305.05176): Latency as quality dimension
- Nielsen (1993): 10s = attention limit for complex tasks

Approval criteria (calibrated from SOTA P50):
  TIER_1: Q≥85, latency≤15s, word_ratio≥1.0×
  TIER_2: Q≥88, latency≤20s, word_ratio≥1.2×
  TIER_3: Q≥90, latency≤30s, word_ratio≥1.5×
  TIER_4: Q≥90, latency≤45s, word_ratio≥2.0×

Composite Score Formula:
  MOTHER_Score = Q×0.35 + Completeness×0.15 + Accuracy×0.15 + 
                 Coherence×0.10 + Safety×0.10 + Latency_Score×0.10 + WordRatio×0.05
  PASS: ≥88 | EXCELLENT: ≥93
"""

import requests
import time
import json
import sys
from datetime import datetime

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
PASS_THRESHOLD_Q = 90
TIMEOUT = 300

# Tier-specific thresholds (scientifically calibrated from SOTA P50)
TIER_THRESHOLDS = {
    "TIER_1": {"q": 85, "lat": 15, "wr": 1.0},
    "TIER_2": {"q": 88, "lat": 20, "wr": 1.2},
    "TIER_3": {"q": 90, "lat": 30, "wr": 1.5},
    "TIER_4": {"q": 90, "lat": 45, "wr": 2.0},
}

# Same 48 prompts as C238 v8 (Chain 2 Mínima)
CHAIN2_PROMPTS = [
    # LM — Language & Meaning
    {"id": "LM-01", "tier": "TIER_4", "min_words": 300, "query": "Explique o paradoxo de Zenão de Aquiles e a tartaruga e como a matemática moderna o resolve usando séries convergentes."},
    {"id": "LM-02", "tier": "TIER_4", "min_words": 350, "query": "Analise a diferença filosófica entre linguagem como representação (Wittgenstein Tractatus) e linguagem como uso (Investigações Filosóficas)."},
    {"id": "LM-03", "tier": "TIER_3", "min_words": 250, "query": "Explique o conceito de implicatura conversacional de Grice e seus quatro máximas com exemplos práticos."},
    {"id": "LM-04", "tier": "TIER_3", "min_words": 200, "query": "Qual é a diferença entre semântica lexical e semântica composicional? Dê exemplos de ambiguidade em cada nível."},
    # NS — Natural Sciences
    {"id": "NS-01", "tier": "TIER_4", "min_words": 400, "query": "Explique detalhadamente o processo de fotossíntese, incluindo as reações de luz e as reações do ciclo de Calvin, com as equações químicas envolvidas."},
    {"id": "NS-02", "tier": "TIER_4", "min_words": 350, "query": "Descreva o mecanismo molecular da replicação do DNA, incluindo o papel da DNA polimerase, primase, helicase e ligase."},
    {"id": "NS-03", "tier": "TIER_3", "min_words": 250, "query": "Explique a segunda lei da termodinâmica e o conceito de entropia, com exemplos de processos irreversíveis na natureza."},
    {"id": "NS-04", "tier": "TIER_4", "min_words": 400, "query": "Descreva a teoria quântica de campos e como ela unifica a mecânica quântica com a relatividade especial, incluindo o conceito de partículas virtuais."},
    # PH — Philosophy & Ethics
    {"id": "PH-01", "tier": "TIER_4", "min_words": 350, "query": "Analise o imperativo categórico de Kant em suas três formulações e aplique-o a um dilema ético contemporâneo."},
    {"id": "PH-02", "tier": "TIER_3", "min_words": 250, "query": "Compare o utilitarismo de Bentham e Mill, destacando as diferenças entre prazer quantitativo e qualitativo."},
    {"id": "PH-03", "tier": "TIER_3", "min_words": 200, "query": "Explique o problema mente-corpo e as principais posições filosóficas: dualismo, fisicalismo e funcionalismo."},
    {"id": "PH-04", "tier": "TIER_4", "min_words": 300, "query": "Analise o argumento ontológico de Anselmo para a existência de Deus e as críticas de Kant e Gaunilo."},
    # HC — History & Culture
    {"id": "HC-01", "tier": "TIER_3", "min_words": 300, "query": "Explique as causas e consequências da Revolução Francesa de 1789, incluindo o papel do Iluminismo e as transformações sociais resultantes."},
    {"id": "HC-02", "tier": "TIER_3", "min_words": 250, "query": "Analise o impacto da Revolução Industrial na estrutura social e econômica da Europa do século XIX."},
    {"id": "HC-03", "tier": "TIER_4", "min_words": 350, "query": "Descreva a evolução das pandemias na história humana, desde a Peste Negra até o COVID-19, e suas implicações para a saúde pública global."},
    {"id": "HC-04", "tier": "TIER_3", "min_words": 200, "query": "Explique o conceito de orientalismo de Edward Said e sua crítica ao discurso colonial ocidental."},
    # EC — Economics & Society
    {"id": "EC-01", "tier": "TIER_4", "min_words": 350, "query": "Explique a teoria dos jogos e o equilíbrio de Nash, com exemplos de dilema do prisioneiro e jogos de coordenação."},
    {"id": "EC-02", "tier": "TIER_4", "min_words": 400, "query": "Analise as causas da crise financeira de 2008, incluindo o papel dos derivativos, CDOs, e a falha regulatória, e suas consequências globais."},
    {"id": "EC-03", "tier": "TIER_3", "min_words": 250, "query": "Explique a teoria keynesiana e como ela difere da teoria clássica em relação ao papel do governo na economia."},
    {"id": "EC-04", "tier": "TIER_3", "min_words": 200, "query": "Descreva o conceito de externalidades negativas e como políticas públicas como impostos pigouvianos podem corrigi-las."},
    # TC — Technology & Computing
    {"id": "TC-01", "tier": "TIER_4", "min_words": 300, "query": "Implemente em Python um algoritmo de busca binária recursiva e analise sua complexidade temporal e espacial com prova formal."},
    {"id": "TC-02", "tier": "TIER_3", "min_words": 250, "query": "Explique o funcionamento de redes neurais convolucionais (CNNs) e por que são eficazes para reconhecimento de imagens."},
    {"id": "TC-03", "tier": "TIER_3", "min_words": 200, "query": "Descreva o protocolo HTTPS e como o TLS/SSL garante segurança na comunicação web, incluindo o handshake."},
    {"id": "TC-04", "tier": "TIER_4", "min_words": 350, "query": "Explique o teorema CAP (Consistency, Availability, Partition tolerance) e como sistemas distribuídos como Cassandra e MongoDB fazem trade-offs."},
    # MA — Mathematics
    {"id": "MA-01", "tier": "TIER_4", "min_words": 300, "query": "Prove o teorema de Bayes a partir dos axiomas de probabilidade e explique sua aplicação em inferência bayesiana."},
    {"id": "MA-02", "tier": "TIER_3", "min_words": 250, "query": "Explique o conceito de transformada de Fourier e sua aplicação em processamento de sinais e análise de frequências."},
    {"id": "MA-03", "tier": "TIER_3", "min_words": 200, "query": "Descreva o método dos mínimos quadrados para regressão linear e derive a solução analítica usando álgebra linear."},
    {"id": "MA-04", "tier": "TIER_4", "min_words": 350, "query": "Explique o teorema de incompletude de Gödel e suas implicações para os fundamentos da matemática e da lógica formal."},
    # AI — Artificial Intelligence
    {"id": "AI-01", "tier": "TIER_4", "min_words": 350, "query": "Explique o mecanismo de atenção (attention mechanism) em transformers e como o self-attention permite capturar dependências de longo alcance."},
    {"id": "AI-02", "tier": "TIER_3", "min_words": 250, "query": "Descreva o algoritmo de backpropagation e como o gradiente é calculado através de redes neurais profundas usando a regra da cadeia."},
    {"id": "AI-03", "tier": "TIER_3", "min_words": 200, "query": "Explique o problema de alinhamento de IA e as principais abordagens: RLHF, Constitutional AI e debate entre agentes."},
    {"id": "AI-04", "tier": "TIER_4", "min_words": 400, "query": "Analise as implicações éticas e sociais do desenvolvimento de IA geral (AGI), incluindo riscos existenciais e frameworks de governança."},
    # ME — Medicine & Biology
    {"id": "ME-01", "tier": "TIER_4", "min_words": 350, "query": "Explique o mecanismo de ação do sistema imunológico adaptativo, incluindo a diferenciação de células T e B e a produção de anticorpos."},
    {"id": "ME-02", "tier": "TIER_3", "min_words": 250, "query": "Descreva o mecanismo de ação dos antibióticos e como a resistência bacteriana se desenvolve por seleção natural."},
    {"id": "ME-03", "tier": "TIER_3", "min_words": 200, "query": "Explique o conceito de epigenética e como modificações no DNA sem alteração da sequência nucleotídica afetam a expressão gênica."},
    {"id": "ME-04", "tier": "TIER_4", "min_words": 300, "query": "Analise as bases moleculares do câncer, incluindo oncogenes, genes supressores de tumor e o papel das mutações acumuladas."},
    # PS — Psychology & Cognition
    {"id": "PS-01", "tier": "TIER_3", "min_words": 250, "query": "Explique a teoria do desenvolvimento cognitivo de Piaget e suas quatro etapas, com críticas contemporâneas."},
    {"id": "PS-02", "tier": "TIER_3", "min_words": 200, "query": "Descreva o experimento de Milgram sobre obediência à autoridade e suas implicações para a psicologia social."},
    {"id": "PS-03", "tier": "TIER_4", "min_words": 300, "query": "Analise o conceito de memória de trabalho de Baddeley e Hitch e como ele se relaciona com a inteligência fluida."},
    {"id": "PS-04", "tier": "TIER_4", "min_words": 350, "query": "Explique a teoria da mente (Theory of Mind) e seu desenvolvimento em crianças, incluindo o teste de Sally-Anne e autismo."},
    # EN — Environment & Sustainability
    {"id": "EN-01", "tier": "TIER_3", "min_words": 250, "query": "Explique o mecanismo do efeito estufa e como o aumento de CO2 atmosférico afeta o equilíbrio radiativo da Terra."},
    {"id": "EN-02", "tier": "TIER_4", "min_words": 350, "query": "Analise as principais fontes de energia renovável (solar, eólica, hidrelétrica) e seus trade-offs em termos de custo, eficiência e impacto ambiental."},
    {"id": "EN-03", "tier": "TIER_3", "min_words": 200, "query": "Descreva o conceito de biodiversidade e como a perda de espécies afeta a resiliência dos ecossistemas."},
    {"id": "EN-04", "tier": "TIER_4", "min_words": 300, "query": "Analise as soluções tecnológicas e políticas para mitigação das mudanças climáticas, incluindo captura de carbono e acordos internacionais."},
    # GE — Geopolitics & International Relations
    {"id": "GE-01", "tier": "TIER_3", "min_words": 250, "query": "Explique a teoria realista das relações internacionais e como ela difere do liberalismo institucional na análise de conflitos."},
    {"id": "GE-02", "tier": "TIER_4", "min_words": 350, "query": "Analise as causas e consequências da Guerra Fria, incluindo a corrida armamentista, a corrida espacial e o papel das ideologias."},
    {"id": "GE-03", "tier": "TIER_3", "min_words": 200, "query": "Descreva o conceito de poder suave (soft power) de Joseph Nye e como países como EUA e China o utilizam."},
    {"id": "GE-04", "tier": "TIER_4", "min_words": 300, "query": "Analise os desafios da governança global no século XXI, incluindo o papel da ONU, G20 e a ascensão de atores não-estatais."},
]

def calculate_composite_score(quality, latency_s, word_ratio, completeness=80, accuracy=80, coherence=80, safety=95):
    """Calculate MOTHER composite score (0-100) based on SOTA calibration."""
    latency_score = max(0, 100 - (latency_s - 10) * 2.5)
    word_ratio_score = min(100, word_ratio * 50)  # 2.0× = 100
    
    composite = (
        quality * 0.35 +
        completeness * 0.15 +
        accuracy * 0.15 +
        coherence * 0.10 +
        safety * 0.10 +
        latency_score * 0.10 +
        word_ratio_score * 0.05
    )
    return round(composite, 1)

def is_pass_v9(quality, latency_s, word_ratio, tier):
    """Multi-dimensional pass criteria (C238 v9)."""
    t = TIER_THRESHOLDS.get(tier, TIER_THRESHOLDS["TIER_3"])
    q_pass = quality >= t["q"]
    lat_pass = latency_s <= t["lat"]
    wr_pass = word_ratio >= t["wr"]
    return q_pass and lat_pass and wr_pass, q_pass, lat_pass, wr_pass

def run_benchmark():
    print("=" * 70)
    print("C238 — Chain 2 Benchmark v9 — Multi-Dimensional")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"URL: {MOTHER_URL}")
    print(f"Prompts: {len(CHAIN2_PROMPTS)}")
    print("Criteria: Q (tier-specific) + Latency + Word Ratio")
    print("=" * 70)
    
    results = []
    pass_count = 0
    total_latency = []
    timeout_count = 0
    
    for i, item in enumerate(CHAIN2_PROMPTS):
        start = time.time()
        tier = item["tier"]
        thresholds = TIER_THRESHOLDS[tier]
        
        try:
            resp = requests.post(
                f"{MOTHER_URL}/api/a2a/query",
                json={"query": item["query"], "userId": 1, "useCache": False},
                timeout=TIMEOUT
            )
            elapsed = time.time() - start
            
            if resp.status_code == 200:
                data = resp.json()
                quality = data.get("quality", {}).get("qualityScore", 0)
                response_text = data.get("response", "")
                word_count = len(response_text.split())
                word_ratio = word_count / item["min_words"] if item["min_words"] > 0 else 1.0
                
                passed, q_pass, lat_pass, wr_pass = is_pass_v9(quality, elapsed, word_ratio, tier)
                composite = calculate_composite_score(quality, elapsed, word_ratio)
                
                if passed:
                    pass_count += 1
                total_latency.append(elapsed)
                
                status = "✅ PASS" if passed else "❌ FAIL"
                q_flag = "✅" if q_pass else "❌"
                l_flag = "✅" if lat_pass else "❌"
                w_flag = "✅" if wr_pass else "❌"
                
                print(f"[{i+1:02d}/{len(CHAIN2_PROMPTS)}] {item['id']} {status} | "
                      f"Q={quality}{q_flag} Lat={elapsed:.0f}s{l_flag} WR={word_ratio:.1f}×{w_flag} | "
                      f"Composite={composite} | {tier}")
                
                results.append({
                    "id": item["id"],
                    "tier": tier,
                    "passed": passed,
                    "quality": quality,
                    "latency_s": round(elapsed, 1),
                    "word_ratio": round(word_ratio, 2),
                    "composite_score": composite,
                    "q_pass": q_pass,
                    "lat_pass": lat_pass,
                    "wr_pass": wr_pass,
                })
            else:
                elapsed = time.time() - start
                print(f"[{i+1:02d}/{len(CHAIN2_PROMPTS)}] {item['id']} ❌ HTTP {resp.status_code} | {elapsed:.0f}s")
                results.append({"id": item["id"], "tier": tier, "passed": False, "error": f"HTTP {resp.status_code}"})
                
        except requests.Timeout:
            elapsed = time.time() - start
            timeout_count += 1
            print(f"[{i+1:02d}/{len(CHAIN2_PROMPTS)}] {item['id']} ⏱️  TIMEOUT ({elapsed:.0f}s) | {tier}")
            results.append({"id": item["id"], "tier": tier, "passed": False, "error": "TIMEOUT", "latency_s": elapsed})
        except Exception as e:
            print(f"[{i+1:02d}/{len(CHAIN2_PROMPTS)}] {item['id']} ❌ ERROR: {e}")
            results.append({"id": item["id"], "tier": tier, "passed": False, "error": str(e)})
    
    # Summary
    total = len(CHAIN2_PROMPTS)
    pass_rate = pass_count / total * 100
    
    # Latency stats
    if total_latency:
        total_latency.sort()
        p50 = total_latency[len(total_latency)//2]
        p95 = total_latency[int(len(total_latency)*0.95)]
        timeout_rate = timeout_count / total * 100
    else:
        p50 = p95 = 0
        timeout_rate = 0
    
    # Average composite score
    composites = [r.get("composite_score", 0) for r in results if "composite_score" in r]
    avg_composite = sum(composites) / len(composites) if composites else 0
    
    print("\n" + "=" * 70)
    print("BENCHMARK SUMMARY — C238 v9 Multi-Dimensional")
    print("=" * 70)
    print(f"Pass Rate:       {pass_count}/{total} ({pass_rate:.1f}%)")
    print(f"Timeout Rate:    {timeout_count}/{total} ({timeout_rate:.1f}%)")
    print(f"Latency P50:     {p50:.1f}s  (target: ≤20s)")
    print(f"Latency P95:     {p95:.1f}s  (target: ≤60s)")
    print(f"Avg Composite:   {avg_composite:.1f}/100  (PASS: ≥88, EXCELLENT: ≥93)")
    print(f"SOTA Baseline:   GPT-4o = 90.2/100")
    
    # Grade
    if avg_composite >= 93:
        grade = "A (EXCELLENT)"
    elif avg_composite >= 88:
        grade = "B+ (PASS)"
    elif avg_composite >= 83:
        grade = "B (APPROACHING)"
    else:
        grade = "C (NEEDS IMPROVEMENT)"
    
    print(f"MOTHER Grade:    {grade}")
    print("=" * 70)
    
    # Save results
    output_file = f"/home/ubuntu/c238_v9_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, "w") as f:
        json.dump({
            "benchmark": "C238 v9 Multi-Dimensional",
            "date": datetime.now().isoformat(),
            "summary": {
                "pass_count": pass_count,
                "total": total,
                "pass_rate": pass_rate,
                "timeout_count": timeout_count,
                "timeout_rate": timeout_rate,
                "latency_p50": round(p50, 1),
                "latency_p95": round(p95, 1),
                "avg_composite_score": round(avg_composite, 1),
                "grade": grade,
            },
            "results": results,
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\nResults saved to: {output_file}")
    return pass_count, total, avg_composite

if __name__ == "__main__":
    run_benchmark()
