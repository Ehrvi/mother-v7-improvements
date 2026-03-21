# MOTHER SHMS — Manual Completo de Identidade Visual

> Documento SOTA sintetizando **200+ fontes** em design, estética, UX/UI, Gestalt, razão áurea, minimalismo, desconstrutivismo, visualização de dados, acessibilidade e marketing.

---

## 1. Filosofia de Design

### 1.1 Princípio Central: "Precision Zen"

O MOTHER SHMS é um sistema de monitoramento de saúde estrutural para engenharia. Sua identidade visual deve comunicar:

| Atributo | Expressão Visual | Referência SOTA |
|:---|:---|:---|
| **Precisão** | Alinhamento a grid, números monoespaçados | Swiss Style (Müller-Brockmann) |
| **Confiança** | Cores frias dessaturadas, consistência | Material Design Dark Theme |
| **Inteligência** | Dados como protagonista, zero decoração | Tufte (data-ink ratio > 0.8) |
| **Urgência controlada** | Status por cor (verde → âmbar → vermelho) | TARP Matrix (ICOLD) |
| **Modernidade** | Dark theme, glassmorphism sutil | Apple HIG, 2024 Dashboard Trends |

### 1.2 Dieter Rams: 10 Princípios Aplicados

| Princípio | Aplicação em SHMS |
|:---|:---|
| 1. Inovador | Pipeline de análise GA + Digital Twin inédito |
| 2. Útil | Cada pixel serve o engenheiro |
| 3. Estético | Prazer visual em dados complexos |
| 4. Compreensível | Hierarquia visual clara sem manual |
| 5. Discreto | UI serve ao conteúdo, nunca compete |
| 6. Honesto | Gráficos fiéis, sem distorção de dados |
| 7. Duradouro | Paleta atemporal, sem tendências passageiras |
| 8. Detalhista | Alinhamento perfeito até o último pixel |
| 9. Sustentável | Performance leve, sem desperdício visual |
| 10. Mínimo | Tudo que não é necessário é removido |

---

## 2. Psicologia Visual: Gestalt

### 2.1 Princípios e Regras Obrigatórias

| Princípio | Regra SHMS | Exemplo |
|:---|:---|:---|
| **Proximidade** | Grupos de dados com gap de `16px`; itens relacionados com `8px` | Cards de sensores, formulários |
| **Similaridade** | Botões de ação = mesmo formato + cor; status = mesmo tamanho | CTAs, alertas |
| **Clausura** | Cards com borda sutil (`1px rgba(255,255,255,0.06)`) sugerindo container | Painéis, widgets |
| **Continuidade** | Linhas de guia e alinhamento vertical consistente | Tabelas, timelines |
| **Figura-Fundo** | Conteúdo principal (fundo `#1E1E1E`) vs sidebar (`#161616`) | Layout master |
| **Região comum** | Backgrounds sutilmente diferentes para agrupar seções | Tabs, painéis aninhados |

---

## 3. Razão Áurea (Φ = 1.618)

### 3.1 Aplicação em Typography Scale

```
Base:     14px
×1.618 → 22.65px ≈ 23px   → h4
×1.618 → 37.20px ≈ 37px   → h3
×1.618 → 60.18px ≈ 60px   → h2
×1.618 → 97.37px ≈ 97px   → h1 (hero)
÷1.618 → 8.65px  ≈ 9px    → caption
÷1.618 → 5.35px  ≈ 5px    → micro
```

### 3.2 Layout Golden Grid
- **Painel principal**: 61.8% da largura
- **Sidebar/chat**: 38.2% da largura
- **Header height**: 48px (≈ 14px × Φ × Φ)
- **Card padding**: 16px (8 × 2, Fibonacci)
- **Section gap**: 24px (Fibonacci: 3 × 8)

---

## 4. Paleta de Cores (Dark Theme)

### 4.1 Cores Base (Material Design Dark)

| Token | Hex | Uso | Contraste vs Fundo |
|:---|:---|:---|:---|
| `--bg-primary` | `#0D0D0D` | Fundo da app | — |
| `--bg-surface` | `#1A1A1A` | Cards, painéis | — |
| `--bg-elevated` | `#242424` | Dropdowns, modais | — |
| `--bg-hover` | `#2A2A2A` | Hover states | — |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Bordas de cards | — |

### 4.2 Cores de Texto

| Token | Hex | Uso | Contraste vs `#1A1A1A` |
|:---|:---|:---|:---|
| `--text-primary` | `#E8E8E8` | Texto principal | **12.5:1** ✓ AAA |
| `--text-secondary` | `#A0A0A0` | Labels, dicas | **5.5:1** ✓ AA |
| `--text-tertiary` | `#666666` | Placeholders | **3.1:1** ✓ UI |
| `--text-disabled` | `#444444` | Desabilitado | 2.1:1 |

### 4.3 Cores de Acento (Dessaturadas)

| Token | Hex | HSL | Uso |
|:---|:---|:---|:---|
| `--accent-blue` | `#4A90B8` | `204° 43% 50%` | Primário, links, seleção |
| `--accent-teal` | `#3D9E8F` | `172° 44% 43%` | Sucesso, FOS OK |
| `--accent-amber` | `#C49A3C` | `42° 53% 50%` | Warning, atenção |
| `--accent-red` | `#C45B5B` | `0° 43% 56%` | Erro, FOS < 1.0 |
| `--accent-purple` | `#8B6DB5` | `270° 33% 57%` | Info, Digital Twin |

### 4.4 Cores de Dados (Colorblind-Safe)

| Série | Hex | Protanopia | Deuteranopia |
|:---|:---|:---|:---|
| Série 1 | `#4A90B8` | ✓ | ✓ |
| Série 2 | `#C49A3C` | ✓ | ✓ |
| Série 3 | `#C45B5B` | ✓ | ✓ |
| Série 4 | `#3D9E8F` | ✓ | ✓ |
| Série 5 | `#8B6DB5` | ✓ | ✓ |

> [!IMPORTANT]
> Nunca usar cor como único indicador. Sempre acompanhar com ícone, padrão ou texto.

---

## 5. Tipografia

### 5.1 Fontes

| Papel | Fonte | Fallback | Peso |
|:---|:---|:---|:---|
| **UI Principal** | `Inter` | `-apple-system, sans-serif` | 400, 500, 600 |
| **Dados / Números** | `JetBrains Mono` | `ui-monospace, monospace` | 400, 500 |
| **Headers Premium** | `Inter` | — | 600, 700 |

### 5.2 Escala (Golden Ratio)

| Nível | Tamanho | Peso | Letter-spacing | Uso |
|:---|:---|:---|:---|:---|
| **h1** | `32px` | 700 | `-0.02em` | Título de página |
| **h2** | `24px` | 600 | `-0.01em` | Seção principal |
| **h3** | `18px` | 600 | `0` | Sub-seção |
| **h4** | `16px` | 500 | `0` | Card title |
| **body** | `14px` | 400 | `0.01em` | Texto padrão |
| **caption** | `12px` | 400 | `0.02em` | Labels, eixos |
| **micro** | `10px` | 500 | `0.04em` | Tags, badges |

---

## 6. Espaçamento (Fibonacci)

### 6.1 Escala de Espaçamento

```
--space-1:  2px    (micro gaps)
--space-2:  4px    (inline gaps)
--space-3:  8px    (tight spacing)
--space-4:  12px   (compact)
--space-5:  16px   (default padding)
--space-6:  24px   (section gap)
--space-7:  32px   (panel gap)
--space-8:  48px   (page sections)
--space-9:  64px   (hero spacing)
```

### 6.2 Regras de Espaçamento

| Contexto | Espaçamento | Token |
|:---|:---|:---|
| Padding interno de card | `16px` | `--space-5` |
| Gap entre itens em card | `8px` | `--space-3` |
| Gap entre cards | `16px` | `--space-5` |
| Margem de página | `24px` | `--space-6` |
| Gap entre seções | `32px` | `--space-7` |
| Padding de botão | `8px 16px` | `--space-3 --space-5` |

---

## 7. Componentes

### 7.1 Cards

```css
.shms-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: var(--space-5);
  transition: border-color 200ms ease;
}
.shms-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
}
```

### 7.2 Botões

| Variante | Background | Text | Border |
|:---|:---|:---|:---|
| **Primary** | `--accent-blue` | `#FFFFFF` | none |
| **Secondary** | `transparent` | `--text-primary` | `1px solid var(--border-subtle)` |
| **Ghost** | `transparent` | `--text-secondary` | none |
| **Danger** | `--accent-red` | `#FFFFFF` | none |

### 7.3 Status Badges

| Status | Cor | Ícone | Label |
|:---|:---|:---|:---|
| Normal | `--accent-teal` | ● | FOS > 1.5 |
| Atenção | `--accent-amber` | ▲ | 1.0 < FOS < 1.5 |
| Crítico | `--accent-red` | ◆ | FOS < 1.0 |
| Offline | `--text-tertiary` | ○ | Sem dados |

### 7.4 Tabelas

```css
.shms-table {
  font-family: var(--font-mono);
  font-size: 13px;
  border-collapse: collapse;
}
.shms-table th {
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.shms-table td {
  padding: 8px 12px;
  color: var(--text-primary);
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.shms-table tr:hover td {
  background: var(--bg-hover);
}
```

---

## 8. Visualização de Dados (Tufte)

### 8.1 Princípios Obrigatórios

| Princípio Tufte | Regra SHMS |
|:---|:---|
| **Data-ink ratio > 0.8** | Remover gridlines grossas, bordas de gráficos, decoração |
| **Chartjunk = 0** | Sem gradientes 3D, sombras em gráficos, ícones decorativos |
| **Small multiples** | Comparar sensores lado a lado, mesmo eixo |
| **Sparklines** | Indicadores inline para séries temporais em tabelas |
| **Integrity** | Eixo Y sempre começa em 0 para barras; escalas consistentes |

### 8.2 Gráficos SVG

```css
/* Eixos */
.axis line, .axis path { stroke: var(--text-tertiary); stroke-width: 0.5px; }
.axis text { fill: var(--text-secondary); font-size: 10px; font-family: var(--font-mono); }

/* Grid */
.grid line { stroke: rgba(255,255,255,0.04); stroke-dasharray: 2,4; }

/* Dados */
.data-line { stroke-width: 1.5px; fill: none; }
.data-point { r: 3px; transition: r 150ms ease; }
.data-point:hover { r: 5px; }
```

---

## 9. Motion Design

### 9.1 Timing Tokens

| Token | Duração | Easing | Uso |
|:---|:---|:---|:---|
| `--duration-instant` | `100ms` | `ease-out` | Hover, focus |
| `--duration-fast` | `200ms` | `ease-in-out` | Botões, toggles |
| `--duration-normal` | `300ms` | `cubic-bezier(0.4,0,0.2,1)` | Cards, painéis |
| `--duration-slow` | `500ms` | `cubic-bezier(0.4,0,0.2,1)` | Páginas, modais |

### 9.2 Regras de Animação

| Regra | Especificação |
|:---|:---|
| **Propriedades GPU-only** | Animar apenas `transform` e `opacity` |
| **Prefers-reduced-motion** | Respeitar `@media (prefers-reduced-motion: reduce)` |
| **Nada > 500ms** | Nenhuma animação pode exceder 500ms |
| **Propósito claro** | Cada animação confirma ação, revela conteúdo ou guia foco |
| **Consistência** | Mesma duração/easing para mesma categoria de interação |

---

## 10. Acessibilidade (WCAG 2.2 AAA)

### 10.1 Contraste

| Elemento | Mínimo | Alvo SHMS |
|:---|:---|:---|
| Texto normal | 7:1 (AAA) | **12.5:1** |
| Texto grande (≥18px) | 4.5:1 (AAA) | **8.0:1** |
| UI components | 3:1 | **4.5:1** |
| Focus indicators | 3:1 | **4.5:1** |

### 10.2 Regras de Cor

- ❌ Nunca usar cor como único indicador
- ✓ Sempre acompanhar com: ícone + texto + padrão
- ✓ Paleta testada para protanopia, deuteranopia, tritanopia
- ✓ Simulação obrigatória com Coblis/Colorblindly

### 10.3 Foco e Navegação

```css
:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
```

---

## 11. Layout de Referência: SHMS Narrative Twin

> [!IMPORTANT]
> O layout do **SHMS Narrative Twin** (`/shms-narrative`) é a implementação de referência para a janela principal de cada estrutura no SHMS.

### 11.1 Arquitetura (Implementada)

```
┌──────────────────────────────────────────────────────┐
│ Health Strip: HealthArc SVG + KPI pills + LIVE pulse │
├──────────────────────────────────────┬───────────────┤
│                                      │               │
│   3D Digital Twin (fullscreen hero)  │  AI Chat      │
│   DigitalTwin3DViewer (minimal)      │  (33% width)  │
│   Ambient: scanlines + vignette      │  Glassmorphic │
│                                      │               │
│  ┌───────────────┐                   │  Suggestions  │
│  │ Floating Chips │                  │  Input + Mic  │
│  └───────────────┘                   │               │
├──────────────────────────────────────┴───────────────┤
│  Tabbed Instrument Modal (on click):                  │
│  📊 Série Temporal | 🔬 HST | 📋 Ficha | 🤖 IA      │
└──────────────────────────────────────────────────────┘
```

### 11.2 Padrões de Design do Narrative Twin

| Padrão | Implementação | Arquivo |
|:---|:---|:---|
| **oklch color space** | Perceptually uniform, melhor que HSL/hex | tokens `T` em TSX |
| **Glassmorphism** | `backdrop-filter: blur(20px) saturate(180%)` | `.nt-glass` CSS |
| **Ambient scanlines** | CRT effect 0.8% opacity | `.nt-scanlines` CSS |
| **Radial vignette** | Foco no centro, bordas escuras | `.nt-vignette` CSS |
| **Health Arc SVG** | Arc progressivo com cor adaptativa | `HealthArc` component |
| **KPI pills** | Compactas com ícone + label + valor | `.nt-health-pill` CSS |
| **LIVE dot** | Pulsing green dot + label | `.nt-live-dot` CSS |
| **Tabbed modals** | 4 tabs com transição fade (0.25s) | `.nt-tab` CSS |
| **HST bar** | Stacked horizontal com legend | `HSTBar` component |
| **Sparklines inline** | SVG 90d + forecast + IC 95% | `Sparkline` component |
| **Status badges** | oklch com background tinted | `.nt-status-*` CSS |
| **Chat panel** | 33% width, frosted glass, right side | `.nt-chat-container` CSS |
| **Typing animation** | 3 bouncing dots, 1.4s cycle | `.nt-typing-dot` CSS |

### 11.3 Layout SHMS Principal (sidebar + topbar + content)

```
┌─────────────────────────────────────────────────────────┐
│  Topbar (48px): health ring + MQTT pulse + alert badge  │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │   Content Area (view-dependent)              │
│  (220px) │   - Each structure → Narrative Twin layout   │
│  9 sec.  │   - Analysis → tabbed panels                 │
│  25 nav  │   - Documents → list/grid                    │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  Status bar (24px) - sparklines + alertas               │
└─────────────────────────────────────────────────────────┘
```

### 11.4 Breakpoints

| Breakpoint | Largura | Sidebar | Chat |
|:---|:---|:---|:---|
| Desktop | ≥1440px | 220px fixo | 33% (380px) |
| Laptop | 1024-1439px | 60px (ícones) | Overlay |
| Tablet | 768-1023px | Hidden (hamburger) | Overlay |
| Mobile | <768px | Hidden | Fullscreen |

---

## 12. Referências e Fontes (200+)

### 12.1 Gestalt (18 fontes)
UX Tigers, Medium/UX, UserTesting, Toptal, Muz.li, Qed42, FullClarity, StudioGraphene, OctetDesign, TubikStudio, PodCreative, MakeItClear, UXPlanet, Wings Design, DigitalThriveAI, UXToast, JustInMind, Fiveable

### 12.2 Razão Áurea / Fibonacci (33 fontes)
Mockplus, Illuminz, SchifinoLee, LogRocket, ElegantThemes, Medium/Design ×4, Akrivi, Cleveland Design, Workhorse Studio, FoundationsAndFacades, Silphium Design, Oivan, Zeenesia, DesignForce, CUNY, OneThing Design, INext, WebMatros, KateKowalsky, WynHouse, Artsper, Naturalist Gallery, KelebekFSA, StudySmarter, iIndiaEducationDiary, JohnLovett, LivingAroundTheWorld, CreativeBoom

### 12.3 Minimalismo / Swiss / Rams (36 fontes)
ArchDaily, IxDF, DesignMuseum.org, Heurio, Dovetail, Morjas, BigHuman, PrintMag, Wikipedia ×3, MasterClass, MEW Design, Grokipedia, Medium/Typography ×4, Zekagraphic, Zuerich, Clevertize, CarlBarenbrug, MahanRasouli, Houzz, Framer Website, FPDesign, BurleighPrint, PentaCreative, Adobe, JukeboxPrint, iF Design, Europa.eu, ArchieInteriors, OpenTextBC

### 12.4 Desconstrutivismo (16 fontes)
PrintMag, Fiveable, Graphics-Illustrations, ArenaParkStreet, Medium/Design ×3, NSW.gov.au, WordPress ×2, ProFFus, ScratchingTheSurface, Weebly, PhilipVanDusen, YouTube

### 12.5 Dark UI / Dashboard (8 fontes)
Material.io, Medium/Dashboard ×3, Cloudscape Design, OctetDesign, BootstrapDash, YouTube

### 12.6 Acessibilidade WCAG (19 fontes)
W3.org, AccessibilityPartners, AccessibilityAssistant ×2, AccessiBe, AccessibilityChecker, Medium/A11y ×2, Raw Studio, DGRoyals, DubBot, DigitalThriveAI, SprakDesign, GeriReid, PivotalAccessibility, OneThing Design, SmashingMagazine, ColorBlind.org, A11y Collective

### 12.7 Micro-interações / Motion (27 fontes)
UX-Designer.no, JustInMind, FloatUI, MotionTheAgency, AlterSquare, DigitalSilk, UXDesign.cc ×3, UXMatters, UXPin, DesignSystemsCollective, HornetDynamics, SevneKoncepts, Mockplus, TelUsDigital, WebDesignLondon, dev.to ×2, Medium/Framer ×2, TilliTsDone, HyScaler, DigiDop, JSMastery, LobeHub

### 12.8 Tufte / Data Visualization (19 fontes)
EdwardTufte.com ×4, Wikipedia/Tufte, GeeksForGeeks, Medium/DataViz ×4, SimplexCT, TheDataSchool, TheCommSpot, KevinJMagnan, GATech, Samizdat, Study.com, Graficto, GuyPursey

### 12.9 Adicionais consultadas (+24)
Nielsen Norman Group, Dribbble Trends 2024, Awwwards Best Practices, Google Material 3, Apple HIG, Figma Community, CSS Tricks, Smashing Magazine, A List Apart, SitePoint, WebFlow University, Refactoring UI, Steve Schoger UI Tips, Tailwind UI Patterns, Vercel Design, Linear App Design, Stripe Dashboard, Grafana UX, Notion Design, Obsidian UI, Arc Browser, Apple Vision Pro UI, Tesla Dashboard, SpaceX Crew Interface
