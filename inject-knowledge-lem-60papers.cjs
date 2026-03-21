/**
 * Knowledge injection — 60 LEM Papers Research
 * Source: sci-hub.ren + annas-archive.gl (2026-03-21)
 * Injects indexed LEM research into MOTHER's knowledge database
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load .env
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const envMatch = envContent.match(/DATABASE_URL=(.+)/);
const url = envMatch ? envMatch[1].trim() : '';
const urlObj = new URL(url.replace('mysql://', 'http://'));

const entries = [
  // ===== 1. FOUNDATIONAL LEM METHODS =====
  {
    title: 'LEM-001: Fellenius (1927) — Método das Fatias Original (OMS)',
    content: 'Fellenius (1927). Primeiro método de fatias para estabilidade de taludes. FOS = Σ[c\'l + (Wcosα − ul)tanφ\'] / Σ[Wsinα]. NÃO satisfaz equilíbrio horizontal nem vertical. Ignora forças entre fatias. Sempre conservativo (FOS 10-15% menor que Bishop). Aplicável apenas a superfícies circulares. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-002: Taylor (1937) — Ábacos de Estabilidade φ-Circle',
    content: 'Taylor (1937). Stability of earth slopes. J. Boston Soc. CE. Desenvolveu ábacos de estabilidade (stability charts) para estimativa rápida de FOS. φ-circle method. Precursor dos métodos de fatias modernos. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-003: Bishop Simplificado (1955) — Equilíbrio de Momento Iterativo',
    content: 'Bishop, A.W. (1955). The use of the slip circle in the stability analysis of slopes. Géotechnique 5(1), 7-17. DOI: 10.1680/geot.1955.5.1.7. Formulação: FOS = Σ[c\'b + (W - ub)tanφ\'] × (1/mα) / Σ[Wsinα], onde mα = cosα(1 + tanα·tanφ\'/F). Satisfaz equilíbrio de momento + vertical. NÃO satisfaz equilíbrio horizontal. Iterativo (4-6 iter). Apenas circular. Validação ACADS 1(a): B=0.987. Fonte: sci-hub.ren DOI 10.1680/geot.1955.5.1.7',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-004: Janbu GPS (1954) — Generalized Procedure of Slices',
    content: 'Janbu, N. (1954). Application of composite slip surfaces for stability analysis. European Conf. Stability. GPS — Generalized Procedure of Slices. Base para Janbu Simplificado (1968). Satisfaz equilíbrio de forças, aplica fator de correção f₀. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-005: Morgenstern-Price (1965) — Método Rigoroso com f(x)',
    content: 'Morgenstern, N.R. & Price, V.E. (1965). The analysis of the stability of general slip surfaces. Géotechnique 15(1), 79-93. DOI: 10.1680/geot.1965.15.1.79. Relação entre forças: S = λ·f(x)·N. f(x) pode ser constante (=Spencer), half-sine, trapezoidal, ou arbitrária. Satisfaz TODOS os equilíbrios. Aplicável a QUALQUER superfície. Referência Rocscience SLIDE2. Fonte: sci-hub.ren DOI 10.1680/geot.1965.15.1.79',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-006: Spencer (1967) — Forças Paralelas entre Fatias',
    content: 'Spencer, E. (1967). A method of analysis of the stability of embankments. Géotechnique 17(1), 11-26. DOI: 10.1680/geot.1967.17.1.11. Forças entre fatias paralelas (S/N = tanθ constante). Satisfaz TODOS os equilíbrios. Caso particular de M-P com f(x)=1. Iterativamente encontra θ tal que Fm=Ff=F. Fonte: sci-hub.ren DOI 10.1680/geot.1967.17.1.11',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-007: Janbu Simplificado (1968) — Equilíbrio de Forças + f₀',
    content: 'Janbu, N. (1968). Slope stability computations. Soil Mech. Found. Eng. Report. FOS₀ = Σ[c\'b + (W-ub)tanφ\']sec²α/(1+tanα·tanφ\'/F) / Σ[Wtanα]. FOScorr = f₀·FOS₀. f₀ = 1 + b₁(d/L - 1.4(d/L)²), b₁=0.31 (φ=0) ou 0.50 (c=0). Satisfaz equilíbrio de forças. NÃO satisfaz momento. Aplica-se a circular E não-circular. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-008: Fredlund & Krahn (1977) — Comparação Definitiva de Métodos LEM',
    content: 'Fredlund, D.G. & Krahn, J. (1977). Comparison of slope stability methods of analysis. CGJ 14(3), 429-439. DOI: 10.1139/t77-025. Resultado fundamental: Bishop ≈ Spencer ≈ M-P (±5%). Janbu Simpl. subestima ~7%. Benchmark F-K: Bishop=1.372, Spencer=1.373, M-P=1.373, Janbu=1.281. 3 camadas, ru=0.25, hard stratum. Referência mais citada (>2500 citações). Fonte: sci-hub.ren DOI 10.1139/t77-025',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-009: Sarma (1973) — Aceleração Horizontal Crítica',
    content: 'Sarma, S.K. (1973). Stability analysis of embankments and slopes. Géotechnique 23(3), 423-433. Calcula aceleração horizontal crítica (kc) para ruptura. FOS obtido reduzindo c\' e tanφ\' até kc=0. Sarma FOS ≈ Spencer FOS. Útil para análise sísmica pseudo-estática. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-010: Lowe-Karafiath (1960) — Inclinação Média das Forças',
    content: 'Lowe, J. & Karafiath, L. (1960). Stability of earth dams upon drawdown. 1st Pan-Am SMFE. Forças entre fatias inclinadas a θᵢ = (αᵢ + β_surface)/2. Base para Corps of Engineers (1970). Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  // ===== 2. EXTENSIONS AND RIGOROUS FORMULATIONS =====
  {
    title: 'LEM-011: Fredlund GLE (1981) — General Limit Equilibrium Unificado',
    content: 'Fredlund, D.G. (1981). GLE formulation for unsaturated soils. CGJ 18(3). Generalização: FOS = g(λ). Fm(λ) e Ff(λ) plotados — interseção = FOS rigoroso. λ=0 → Bishop (Fm) ou Janbu (Ff). Fm=Ff → Spencer/M-P. Unifica todos os LEM. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-012: Duncan (1996) — State of the Art: Parâmetros > Método',
    content: 'Duncan, J.M. (1996). State of the art: LEM and FEM. ASCE J. Geotech. Eng. 122(7), 577-596. Conclusão fundamental: a incerteza nos parâmetros do solo (c\', φ\', ru) é muito mais significativa que a escolha do método LEM. Bishop é suficiente para a maioria das análises práticas. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-013: Zhu et al. (2003) — LEM vs SSR-FEM Discrepâncias',
    content: 'Zhu, D.Y. et al. (2003). Comparison of FOS by LEM and SRM. CGJ 40(1), 169-187. DOI: 10.1139/t03-030. LEM vs SSR-FEM: acordo ±5% para taludes homogêneos. Discrepância até 15% para multi-layer com camadas fracas. SSR-FEM encontra superfície crítica automaticamente. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-014: Cheng (2003) — Superfície Crítica e Forças entre Fatias',
    content: 'Cheng, Y.M. (2003). Location of critical failure surface and interslice forces. Comp. & Geotech. 30, 45-60. Distribuição de forças entre fatias afeta convergência mas NÃO o FOS final (±2%). Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-015: Cheng & Lau (2008) — Livro Slope Stability Analysis and Stabilization',
    content: 'Cheng, Y.M. & Lau, C.K. (2008). Slope stability analysis and stabilization. Taylor & Francis. Livro-texto de referência completo cobrindo todos os métodos LEM + FEM + GA. Inclui exemplos resolvidos e verificações cruzadas. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-016: Krahn (2003) — R.M. Hardy Lecture: GLE no SLOPE/W',
    content: 'Krahn, J. (2003). The 2001 R.M. Hardy lecture. CGJ 40(2), 286-306. Implementação moderna do GLE no software SLOPE/W. Detalha como SLOPE/W resolve as equações GLE iterativamente. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-017: Chen & Morgenstern (1983) — Extensões GLE para Anisotropia',
    content: 'Chen, Z. & Morgenstern, N.R. (1983). Extensions to the GLE. CGJ 20(1), 104-119. Extensões para solos com resistência anisotrópica (φ varia com direção). Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-018: Zhu et al. (2005) — Algoritmo O(n) para Bishop',
    content: 'Zhu, D.Y. et al. (2005). A concise algorithm for computing the FOS. CGJ 42(1), 272-278. Algoritmo simplificado O(n) para cálculo de Bishop sem iteração explícita. Ideal para implementação em Web Workers. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-019: Ching & Fredlund (1984) — Instabilidade Numérica do GLE',
    content: 'Ching, R.K.H. & Fredlund, D.G. (1984). Some difficulties with the GLE. CGJ 21(3), 544-550. Problemas de convergência: forças entre fatias negativas, Ff(λ) não-monótona. Soluções: damping, step-size control. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-020: Baker (1980) — Abordagem Variacional para Superfície Crítica',
    content: 'Baker, R. (1980). Determination of the critical slip surface. Comp. & Geotech. 1, 199-220. Usa cálculo variacional (Euler-Lagrange) para encontrar a superfície crítica analiticamente. Prova que a superfície log-spiral é ótima para solos c-φ homogêneos. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_methods', source: 'lem_60papers_scihub_annas'
  },
  // ===== 3. NON-CIRCULAR AND OPTIMIZATION =====
  {
    title: 'LEM-021: Malkawi et al. (2001) — GA + Monte Carlo Para Superfície Não-Circular',
    content: 'Malkawi, A.I.H. et al. (2001). Global search method using MC and GAs. Int. J. Num. Anal. 25, 301-323. GA gera pontos de controle (splines) para superfície não-circular. GA é método autônomo: a superfície é PRODUTO do GA. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-022: Cheng (2007) — Extensão LEM para 2D/3D com Colunas',
    content: 'Cheng, Y.M. (2007). 2D/3D slope stability analysis using LEM. Engineering Geology 92, 75-86. DOI: 10.1016/j.enggeo.2006.10.003. Extensão do método de fatias para colunas 3D. Grid search + optimization para superfície 3D. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-023: Li et al. (2010) — PSO para Superfície Crítica (Rocscience)',
    content: 'Li, L. et al. (2010). PSO for critical slip surface. Comp. & Geotech. 37(2), 215-228. PSO converge 3x mais rápido que GA para busca de superfície crítica. Implementado no Rocscience Slide3. PSO não requer derivadas. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-024: Kahatadeniya et al. (2009) — PSO Aplicado a LEM',
    content: 'Kahatadeniya, K.S. et al. (2009). Determination of critical failure surface using PSO. Geotech. Eng. 40, 163-170. PSO com 30 partículas, 100 iterações = 3000 avaliações LEM. Convergência comparável a GA com 5000 avaliações. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-025: Greco (1996) — Monte Carlo para Superfície Crítica',
    content: 'Greco, V.R. (1996). Efficient MC technique for locating critical slip surface. ASCE J. Geotech. Eng. 122(7), 517-525. MC random search: amostra aleatória de centros e raios. Simples e eficaz para superfícies circulares. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-026: Nguyen (1985) — Programação Dinâmica para Superfície Ótima',
    content: 'Nguyen, V.U. (1985). Determination of critical slope failure surface. ASCE J. Geotech. Eng. 111, 238-250. Programação dinâmica para encontrar superfície não-circular ótima em tempo polinomial. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-027: Celestino & Duncan (1981) — Alternating Variable Method',
    content: 'Celestino, T.B. & Duncan, J.M. (1981). Simplified search for noncircular slip surface. 10th ICSMFE. Método de busca por variáveis alternantes: otimiza uma coordenada por vez. Eficiente para superfícies suaves. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-028: Bolton et al. (2003) — Random Programming Search',
    content: 'Bolton, H.P.J. et al. (2003). Collapse of armoured slopes by RPSA. Géotechnique 53(5), 485-489. Random Programming Search Algorithm (RPSA) para superfícies não-circulares. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-029: Yamagami & Ueta (1988) — FEM+LEM Híbrido',
    content: 'Yamagami, T. & Ueta, Y. (1988). Search for critical slip lines in FE. Soils & Found. 28(4), 85-96. Usa campo de tensões FEM para guiar busca LEM da superfície crítica. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-030: Baker & Leshchinsky (2001) — Distribuição Espacial de FOS',
    content: 'Baker, R. & Leshchinsky, D. (2001). Spatial distribution of safety factors. ASCE J. Geotech. 127(2), 135-145. Mapeia FOS em todo o domínio (não apenas a superfície crítica). Útil para identificar zonas de risco. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_optimization', source: 'lem_60papers_scihub_annas'
  },
  // ===== 4. PORE PRESSURE AND UNSATURATED SOILS =====
  {
    title: 'LEM-031: Bishop & Morgenstern (1960) — Ábacos com ru',
    content: 'Bishop, A.W. & Morgenstern, N.R. (1960). Stability coefficients for earth slopes. Géotechnique 10(4), 129-153. Ábacos de estabilidade com coeficiente ru. FOS = m - n·ru. Simples para projeto preliminar. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-032: Fredlund & Rahardjo (1993) — Livro Unsaturated Soil Mechanics',
    content: 'Fredlund, D.G. & Rahardjo, H. (1993). Soil mechanics for unsaturated soils. Wiley. Livro definitivo sobre mecânica de solos não-saturados. Introduz sucção matricial (ua-uw) em LEM. τf = c\' + (σn-ua)tanφ\' + (ua-uw)tanφᵇ. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-033: Vanapalli et al. (1996) — FOS em Taludes Não-Saturados',
    content: 'Vanapalli, S.K. et al. (1996). FOS in unsaturated slopes. CGJ 33(5), 710-718. Estende Bishop para solos não-saturados. φᵇ (ângulo de resistência por sucção). Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-034: Lu & Godt (2008) — Infinite Slope com Infiltração',
    content: 'Lu, N. & Godt, J. (2008). Infinite slope stability under unsaturated seepage. WRR 44. Modelo acoplado infiltração-estabilidade. Solução analítica. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-035: Bishop (1954) — Coeficientes de Poro-Pressão A e B',
    content: 'Bishop, A.W. (1954). The use of pore pressure coefficients. Géotechnique 4(4), 148-152. Δu = B[Δσ₃ + A(Δσ₁-Δσ₃)]. Fundamental para análise não-drenada. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-036: Skempton (1954) — Fundação Teórica A e B',
    content: 'Skempton, A.W. (1954). The pore pressure coefficients A and B. Géotechnique 4(4), 143-147. Base teórica dos coeficientes de poro-pressão. A varia com OCR. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-037: Morgenstern (1963) — Rebaixamento Rápido',
    content: 'Morgenstern, N.R. (1963). Stability charts for earth slopes during rapid drawdown. Géotechnique 13(2), 121-131. Caso crítico para barragens: rebaixamento do reservatório. Poro-pressão transitória. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-038: Hight et al. (2004) — Efeito da Estrutura do Solo',
    content: 'Hight, D.W. et al. (2004). The effect of structure on stability. Géotechnique 54(10), 627-640. Solos estruturados podem perder resistência ao deformar → análise com parâmetros residuais. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_pore_pressure', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-039: Potts & Zdravkovic (1999) — FEA in Geotechnical Engineering',
    content: 'Potts, D.M. & Zdravkovic, L. (1999). FEA in geotechnical engineering. Thomas Telford. Livro referência para análise por elementos finitos em geotecnia. SSR método. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_numerical', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-040: Terzaghi (1943) — Theoretical Soil Mechanics',
    content: 'Terzaghi, K. (1943). Theoretical soil mechanics. Wiley. Fundamentos clássicos: tensão efetiva, consolidação, capacidade de carga, estabilidade. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_fundamentals', source: 'lem_60papers_scihub_annas'
  },
  // ===== 5. SSR-FEM =====
  {
    title: 'LEM-041: Griffiths & Lane (1999) — SSR-FEM Referência',
    content: 'Griffiths, D.V. & Lane, P.A. (1999). Slope stability analysis by FE. Géotechnique 49(3), 387-403. DOI: 10.1680/geot.1999.49.3.387. SSR: reduz c\' e tanφ\' por SRF até não-convergência. FOS_SSR ≈ FOS_LEM ±5% para homogêneo. Superfície emerge naturalmente. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_numerical', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-042: Dawson et al. (1999) — SSR em FLAC',
    content: 'Dawson, E.M. et al. (1999). Slope stability by SRM. Géotechnique 49(6), 835-840. Implementação de SSR em FLAC (FDM). Formulação explícita. Fonte: sci-hub.ren',
    domain: 'geotechnical', category: 'lem_numerical', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-043: Matsui & San (1992) — SSR-FEM Pioneiro',
    content: 'Matsui, T. & San, K.C. (1992). FE slope stability by SRF. Soils & Found. 32(1), 59-70. Primeiro uso sistemático de SSR-FEM para estabilidade de taludes. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_numerical', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-044: Hammah et al. (2005) — SSR-FEM vs LEM Comparação',
    content: 'Hammah, R.E. et al. (2005). Comparison of SSR-FEM and LEM. 40th US Rock Mech. Symp. SSR-FEM vs LEM: acordo ±8% para casos simples. SSR não precisa assumir forma da superfície. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_numerical', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-045: Naylor (1982) — Finite Elements and Slope Stability',
    content: 'Naylor, D.J. (1982). Finite elements and slope stability. NATO ASI Series. Pioneiro FEM para estabilidade. Discussão teórica de convergência. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_numerical', source: 'lem_60papers_scihub_annas'
  },
  // ===== 6. 3D METHODS =====
  {
    title: 'LEM-046: Hungr (1987) — Bishop Simplificado 3D',
    content: 'Hungr, O. (1987). Extension of Bishop simplified to 3D. CGJ 24(3), 396-405. Bishop 3D: fatias → colunas. Superfície esférica ou elipsoidal. FOS_3D > FOS_2D (efeito de arco). Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_3d', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-047: Lam & Fredlund (1993) — GLE 3D Completo',
    content: 'Lam, L. & Fredlund, D.G. (1993). A general limit equilibrium model for 3D. CGJ 30(6), 905-919. GLE estendido para 3D com colunas. Satisfaz todos os equilíbrios em 3D. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_3d', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-048: Chen & Chameau (1983) — Spencer 3D',
    content: 'Chen, R.H. & Chameau, J.L. (1983). 3D limit equilibrium analysis. Soils & Found. 23(3), 44-57. Spencer estendido para 3D. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_3d', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-049: Kalatehjari & Ali (2013) — Review de Métodos 3D',
    content: 'Kalatehjari, R. & Ali, N. (2013). Review of 3D slope stability methods. Int. J. Geotech. Eng. 7, 57-62. Review comparativo de todos os métodos 3D: Bishop 3D, Spencer 3D, M-P 3D, GLE 3D. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_3d', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-050: Xing (1988) — Taludes Côncavos 3D',
    content: 'Xing, Z. (1988). Three-dimensional stability of concave slopes. Géotechnique 38(4), 623-627. Correção 3D para geometria côncava: FOS_3D/FOS_2D = 1 + κ·R/L. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'lem_3d', source: 'lem_60papers_scihub_annas'
  },
  // ===== 7. DIGITAL TWIN AND IOT =====
  {
    title: 'LEM-051: NGI/Piciullo (2024) — IoT Digital Twin for Real-Time Slope Stability',
    content: 'Piciullo, L. et al. (2024). IoT-based real-time slope stability forecast. NGI Report. Pipeline: IoT sensors → data processing → ML prediction → FOS forecast (3-day horizon). Sensor types: piezometers (pore pressure), inclinometers (displacement), rain gauges. MQTT protocol. Web Worker for computation. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'digital_twin', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-052: Intrieri et al. (2019) — InSAR Real-Time Monitoring',
    content: 'Intrieri, E. et al. (2019). Real-time slope monitoring by InSAR. Landslides 16, 2033-2046. InSAR + IVM (Inverse Velocity Method) para early warning. Precisão de predição ±3-5 dias. Sentinel-1 com 6 dias de revisita. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'digital_twin', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-053: Chae et al. (2017) — Framework Integrado de Monitoramento',
    content: 'Chae, B.G. et al. (2017). Landslide prediction, monitoring, early warning. Landslides 14, 1445-1463. Framework: detecção → monitoramento → alerta → resposta. Integra sensores, modelo numérico, ML. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'digital_twin', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-054: Casagli et al. (2023) — Satellite InSAR for Landslides',
    content: 'Casagli, N. et al. (2023). Satellite InSAR for landslide monitoring. Remote Sensing 15. SBAS/PSI para monitoramento regional. Aplicações em minas e barragens. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'digital_twin', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-055: Mazzanti et al. (2020) — Advances in InSAR Monitoring',
    content: 'Mazzanti, P. et al. (2020). Advances in landslide monitoring using InSAR. Earth-Science Reviews 202. Review completo de técnicas InSAR para estabilidade. DS-InSAR para áreas de baixa coerência. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'digital_twin', source: 'lem_60papers_scihub_annas'
  },
  // ===== 8. ML SURROGATES =====
  {
    title: 'LEM-056: Qi & Tang (2018) — Random Forest para FOS (Accuracy 97%)',
    content: 'Qi, C. & Tang, X. (2018). Slope stability prediction using RF, SVM, GBM. Applied Soft Computing 95. Random Forest: accuracy ~97% para classificação estável/instável. Features: H, β, c, φ, γ, ru. Pode ser surrogate para LEM em tempo real. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'ml_surrogate', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-057: Zhang et al. (2022) — XGBoost Ensemble para Slope Stability',
    content: 'Zhang, W. et al. (2022). Slope stability prediction using ensemble ML. Engineering Geology 292. XGBoost + GBDT ensemble: MSE < 0.01 para FOS prediction. Training data: 500 LEM runs variando parâmetros. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'ml_surrogate', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-058: Samui (2008) — Primeiro SVM para Estabilidade de Taludes',
    content: 'Samui, P. (2008). Slope stability analysis using SVM. Geomech. & Geoeng. 3. Primeiro uso de Support Vector Machine (SVM) para predição de FOS. Kernel RBF. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'ml_surrogate', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-059: Ray et al. (2020) — Deep Learning para FOS',
    content: 'Ray, A. et al. (2020). Deep learning for slope stability. Comp. & Geotech. 126. Deep neural network (5 camadas, 128 neurônios) para FOS prediction. Training: 50000 LEM cases. Inference <5ms. Pode substituir LEM determinístico para screening. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'ml_surrogate', source: 'lem_60papers_scihub_annas'
  },
  {
    title: 'LEM-060: Pham et al. (2021) — CNN-LSTM Híbrido para Monitoramento',
    content: 'Pham, B.T. et al. (2021). Hybrid deep learning for landslide susceptibility. Catena 196. CNN para features espaciais + LSTM para temporal. Aplicável a pipeline Digital Twin. Fonte: annas-archive.gl',
    domain: 'geotechnical', category: 'ml_surrogate', source: 'lem_60papers_scihub_annas'
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 3306,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1).split('?')[0],
    ssl: { rejectUnauthorized: false }
  });

  console.log('=== Injeção de conhecimento: 60 Papers LEM (sci-hub.ren + annas-archive.gl) ===');
  console.log(`Total de entradas: ${entries.length}\n`);
  
  let inserted = 0, skipped = 0;
  
  for (const e of entries) {
    const [existing] = await conn.execute('SELECT id FROM knowledge WHERE title = ?', [e.title]);
    if (existing.length > 0) {
      console.log('  SKIP (já existe):', e.title.substring(0, 70));
      skipped++;
      continue;
    }
    await conn.execute(
      'INSERT INTO knowledge (title, content, domain, category, source) VALUES (?, ?, ?, ?, ?)',
      [e.title, e.content, e.domain, e.category, e.source]
    );
    console.log('  OK:', e.title.substring(0, 70));
    inserted++;
  }

  console.log(`\n=== Resultado: ${inserted} inseridos, ${skipped} já existiam ===`);

  const [all] = await conn.execute(
    "SELECT id, title, domain, category FROM knowledge WHERE source = 'lem_60papers_scihub_annas' ORDER BY id"
  );
  console.log(`\n=== Papers LEM no BD (${all.length} entradas) ===`);
  for (const r of all) {
    console.log(`  ID ${r.id} [${r.domain}/${r.category}] ${r.title.substring(0, 70)}`);
  }

  await conn.end();
}

main().catch(e => {
  console.error('Erro:', e.message);
  process.exit(1);
});
