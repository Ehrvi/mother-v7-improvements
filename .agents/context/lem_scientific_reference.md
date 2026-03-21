# LEM Algorithm Scientific Reference

> Context document for MOTHER's slope stability engine.
> Last updated: 2026-03-21.

## Verified Formulas (from original papers)

### Fellenius / Ordinary Method of Slices
**Fellenius, W. (1936).** "Calculation of the stability of earth dams." 2nd ICOLD, Vol.4, 445-462.
```
F = Σ[c'·l + (W·cosα − u·l)·tanφ'] / Σ[W·sinα]
```
- Ignores all interslice forces → conservative (lowest FOS)
- No iteration needed — direct calculation

### Bishop Simplified
**Bishop, A.W. (1955).** "The use of the slip circle in the stability analysis of slopes." Géotechnique, 5(1), 7-17.
```
F = Σ[c'·b + (W − u·b)·tanφ'] / mα  /  Σ[W·sinα]
mα = cosα + sinα·tanφ'/F   (equivalent: cosα·(1 + tanα·tanφ'/F))
```
- Satisfies vertical + moment equilibrium
- Ignores interslice shear forces
- Iterative: converges in 5-10 iterations

### Janbu Simplified
**Janbu, N. (1954).** "Application of composite slip surfaces for stability analysis." European Conf. on Stability of Earth Slopes, Stockholm, Vol.3, 43-49.
```
F = Σ[c'·b + (W − u·b)·tanφ'] / nα  /  Σ[W·tanα]
nα = cos²α · (1 + tanα·tanφ'/F)
```
- Force equilibrium only (horizontal)
- Iterative

### Janbu Corrected
**Janbu, N. (1973).** "Slope Stability Computations." In Embankment Dam Engineering — Casagrande Volume (eds. Hirschfeld & Poulos), Wiley, 47-86.
```
Fc = F_janbu_simplified × f₀
f₀ = 1 + b₁ · (d/L)                [LINEAR — Fig. 9]
```
- **b₁ = 0.69** for c-only (φ=0, undrained clay)
- **b₁ = 0.50** for c-φ soils (effective stress)
- **b₁ = 0.31** for φ-only (c=0, granular)
- d = max vertical depth of slip surface below ground
- L = horizontal distance between entry and exit points

> ⚠️ COMMON ERRORS: (1) Using quadratic formula f₀=1+b₁·(d/L−1.4·(d/L)²) — WRONG.
> (2) Inverting b₁ values. (3) Using profile.layers[0] instead of base layer properties.

### Spencer
**Spencer, E. (1967).** "A method of analysis of the stability of embankments assuming parallel inter-slice forces." Géotechnique, 17(1), 11-26.
```
Rigorous: satisfies BOTH moment and force equilibrium
Constant interslice force inclination θ
Fm(F,θ) and Ff(F,θ) solved simultaneously
```

### Morgenstern-Price
**Morgenstern, N.R. & Price, V.E. (1965).** "The analysis of the stability of general slip surfaces." Géotechnique, 15(1), 79-93.
```
GLE formulation with f(x) interslice force function
λ·f(x) relates shear to normal interslice forces
```

### Corps of Engineers / Lowe-Karafiath
**USACE (2003).** "Slope Stability." Engineer Manual EM 1110-2-1902, Appendix C, §C-5.
**Lowe, J. & Karafiath, L. (1960).** Proc. 1st Pan-Am. CSMFE, Mexico City, Vol.2, 537-552.
```
nα = cos(α−θ) + sin(α−θ)·tanφ'/F
CoE variant: θ = (slope_entry + slope_exit) / 2
L-K variant: θᵢ = (αᵢ + βᵢ) / 2
```

## Benchmark Results (Engine-Verified)

| Method | ACADS 1a | ACADS 1c | F&K 1977 |
|:-------|:---------|:---------|:---------|
| Fellenius | 0.9494 | 1.1072 | 1.3653 |
| Bishop | 0.9865 | 1.1568 | 1.3714 |
| Janbu Simp | 0.9443 | 1.1184 | 1.3646 |
| Janbu Corr | 1.0167 | 1.3351 | 1.4934 |
| CoE | 0.9945 | 1.1548 | 1.3386 |
| Spencer | 0.9864 | 1.1568 | 1.3713 |
| M-Price | 0.9865 | 1.1569 | 1.3715 |
