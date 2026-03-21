# LEM Algorithm Debug Guide — MOTHER Knowledge Base

> **Tipo**: Conhecimento Técnico Geotécnico  
> **Tags**: LEM, slope-stability, Bishop, Spencer, Janbu, Morgenstern-Price, benchmark, ACADS, Fredlund-Krahn  
> **Fontes**: Rocscience SLIDE2, USACE EM 1110-2-1902, Fredlund & Krahn (1977), Bishop (1955)  

## 1. Métodos de Equilíbrio Limite (LEM)

### 1.1 Classificação por Equilíbrio

| Método | Momento | Força | Interslice | Referência |
|:-------|:--------|:------|:-----------|:-----------|
| Fellenius (OMS) | ✓ | — | Ignora | Fellenius (1927) |
| Bishop Simplificado | ✓ | ✓ (vertical) | N=0, X=0 | Bishop (1955) |
| Janbu Simplificado | — | ✓ | X=0 | Janbu (1954) |
| Janbu Corrigido | — | ✓ + f₀ | X=0 | Janbu (1973) |
| Spencer | ✓ | ✓ | θ=constante | Spencer (1967) |
| Morgenstern-Price | ✓ | ✓ | X=λ·f(x)·E | Morgenstern & Price (1965) |
| Corps of Engineers | — | ✓ | θ dado | USACE EM 1110-2-1902 |

### 1.2 Fórmula Bishop Simplificado

```
FOS = Σ [ (c'·b + (W - u·b)·tanφ') / mα ] / Σ [ W·sinα ]

mα = cosα · (1 + tanα·tanφ'/FOS)
```

### 1.3 Ângulo da Base (α)

Para superfícies circulares:
```
α = arctan(dx / sqrt(R² - dx²))   onde dx = x_meio - x_centro
```

Quando a base é clamped no estrato duro:
```
α = arctan((baseL - baseR) / largura_fatia)
```

## 2. Valores de Referência Publicados

### 2.1 ACADS 1a (VP#1) — Total Stress, Homogênea

| Método | FOS | Fonte |
|:-------|:----|:------|
| Bishop | 0.987 | Rocscience SLIDE2 |
| Spencer | 0.986 | Rocscience SLIDE2 |
| Janbu Corr | 0.990 | Rocscience SLIDE2 |
| GLE | 0.986 | Rocscience SLIDE2 |

### 2.2 ACADS 1c (VP#3) — 3 Camadas

| Método | FOS | Fonte |
|:-------|:----|:------|
| Bishop | 1.157 | Rocscience SLIDE2 |
| Spencer | 1.158 | Rocscience SLIDE2 |
| Janbu Corr | 1.144 | Rocscience SLIDE2 |

### 2.3 Fredlund & Krahn (1977) — Multi-Camada com ru

| Método | FOS | Fonte |
|:-------|:----|:------|
| Bishop | 1.372 | Publicação original |
| Spencer | 1.373 | Publicação original |
| M-Price | 1.373 | Publicação original |
| Janbu Simp | 1.281 | Publicação original |

**Círculo prescrito**: centro=(23, 57), R=38m  
**Geometria**: Aterro 12.2m, talude 2:1, fundação c'=0 φ'=10°, estrato duro c'=300 φ'=40°

## 3. Bugs Comuns em Implementações LEM

### 3.1 Ângulo Base Incorreto
- **Sintoma**: FOS completamente errado (negativo ou >>10)
- **Causa**: Usar `atan2(baseL-baseR, b)` para superfícies circulares ao invés de `atan2(dx, sqrt(R²-dx²))`
- **Fix**: Usar geometria do círculo quando base não está clamped

### 3.2 ProfileBottom Clamping
- **Sintoma**: FOS alto para geometrias multi-camada
- **Causa**: `profileBottom` usa apenas pontos da superfície, não polígonos das camadas
- **Fix**: Incluir min(y) de TODOS os polígonos de camadas

### 3.3 Peso Retangular vs Trapezoidal
- **Sintoma**: Erro ~2-5% no FOS
- **Causa**: W = γ·h·b (retangular) ao invés de W = γ·b·(hL+hR)/2
- **Fix**: Usar fórmula trapezoidal per USACE EM 1110-2-1902

### 3.4 Grid Search Muito Estreito
- **Sintoma**: FOS correto para ACADS 1a, errado para F&K
- **Causa**: Grid não inclui centros abaixo da crista
- **Fix**: cyMin = yMid (não yMax), rMax = 4.5H, incluir margem lateral

## 4. Rotina de Debug

### 4.1 Executar Validação Automatizada
```bash
npx tsx tests/benchmark_validation.ts
```

### 4.2 Checklist de Debug Manual
1. Verificar `generateSlices` produz ≥10 fatias válidas
2. Verificar Σ W·sin(α) > 0 (denominador Bishop)
3. Verificar camada correta em cada fatia via `findLayerAt`
4. Verificar poro-pressão: ru·γ·h quando sem lençol, γw·hw quando com lençol
5. Verificar convergência mα ≠ 0 para todas as fatias
6. Comparar contra valores publicados com tolerância ±5%

### 4.3 Tolerâncias Aceitáveis (ISO 13374)
- ±2%: Excelente (grau A)
- ±5%: Aceitável (grau B)
- ±10%: Marginal (grau C)
- >10%: Falha — investigar código

## 5. Referências Bibliográficas

1. Bishop, A.W. (1955). "The use of the slip circle in the stability analysis of slopes." *Géotechnique*, 5(1), 7-17.
2. Fredlund, D.G. & Krahn, J. (1977). "Comparison of slope stability methods of analysis." *Canadian Geotechnical Journal*, 14(3), 429-439. DOI: 10.1139/t77-045
3. Fredlund, D.G., Krahn, J. & Pufahl, D.E. (1981). "The relationship between limit equilibrium slope stability methods." *Proc. 10th ICSMFE*, Stockholm, Vol. 3, 409-416.
4. Spencer, E. (1967). "A method of analysis of the stability of embankments assuming parallel inter-slice forces." *Géotechnique*, 17(1), 11-26.
5. Morgenstern, N.R. & Price, V.E. (1965). "The analysis of the stability of general slip surfaces." *Géotechnique*, 15(1), 79-93.
6. U.S. Army Corps of Engineers (2003). *Engineering Manual EM 1110-2-1902: Slope Stability*.
7. Donald, I.B. & Giam, S.K. (1988). "Application of the nodal displacement method to slope stability analysis." *Proc. 5th Australia-New Zealand Conf. on Geomechanics*, pp. 456-460.
