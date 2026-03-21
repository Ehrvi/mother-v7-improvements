# 3 Conceitos de Interface SHMS — A Estrutura Conta Sua História

> **Briefing para decisão** — Escolha 1 conceito para desenvolvimento completo.
> Cada conceito usa todos os módulos existentes (45 server-side + 10 client-side).

---

## Inventário de Módulos Disponíveis

| Camada | Módulos |
|--------|---------|
| **Aquisição** | `mqtt-connector`, `sensor-validator`, `mqtt-timescale-bridge`, `shms-protocol-adapters` |
| **Armazenamento** | `timescale-connector`, `timescale-pg-client`, `redis-shms-cache`, `file-drive` |
| **Análise ML** | `lstm-predictor` (BiLSTM+Attention), `anomaly-detector`, `anomaly-ml`, `signal-processor`, `rul-predictor` |
| **Física** | `fem-engine` (FEM stress + FDM seepage + thermal), `stability-analysis`, `cross-section`, `boreholes` |
| **Digital Twin** | `digital-twin-engine-c205`, `digital-twin-dashboard`, `digital-twin-routes-c206` |
| **Alarmes** | `alert-engine`, `shms-alert-engine-v3`, `notification-dispatcher`, `sirens` |
| **3D/Visão** | `environment-3d`, `SHMS3DEnvironment.tsx`, `SHMS2DEnvironment.tsx` |
| **Inteligência** | `big-data-analysis`, `bi-integration`, `fault-tree`, `risk-maps`, `events-module` |
| **Chat/Voz** | `MotherContext` (chat API), `CognitiveTimeSeries` (blender) |
| **Compliance** | `document-management`, `office-connector`, `tarp`, `shms-multitenant` |
| **Infra** | `federated-learning`, `curriculum-learning-shms`, `bank-reconciliation` |

---

## Conceito A: "Sala de Controle Narrativa"

### Filosofia
> *"A barragem é o paciente em uma UTI digital. Cada instrumento é um sinal vital.
> O engenheiro é o médico que lê a narrativa da saúde."*

**Metáfora central:** UTI / Control Room de usina nuclear — **status radiates, problems demand attention**.

### Base Científica
- Shneiderman (1996) — "Overview first, zoom and filter, details on demand"
- Endsley (1995) — "Situational Awareness" Level 1→2→3 (percepção → compreensão → projeção)
- ICOLD Bulletin 158 — dam safety management operational protocols
- Dam360 (ADASA 2024) — single integrated dashboard for dam monitoring
- Few (2013) — "Information Dashboard Design" — cognitive load minimization

### Layout (1920×1080)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────── HEADER ──────────────────────────┐ │
│ │ 🏗️ BARRAGEM CENTRAL - UHE RIO VERDE    ❤️ 94.2%   🟢 NORMAL  │ │
│ │ Última leitura: 14:32:01   │ Clima: 28°C ☀️  │ Nível: 72.3m │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌──── SINAIS VITAIS (sparklines) ────────────────────────────────┐ │
│ │ ▃▅▆▇ Deslocamento   │ ▂▃▃▃ Poro-pressão  │ ▅▆▅▄ Temperatura │ │
│ │ 2.3mm  → 2.4mm ↑   │ 145kPa → 143kPa ↓  │ 22°C → 23°C ↑   │ │
│ │━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━ │ │
│ │ ▂▂▃▂ Vibração       │ ▃▃▃▃ Percolação     │ ▅▅▅▆ LSTM 24h    │ │
│ │ 0.8mm/s (OK)        │ 0.4L/min (OK)       │ +0.3mm ±0.1      │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─── NARRATIVA CENTRAL (60%) ──────┐ ┌── CONTEXTO (40%) ────────┐ │
│ │                                   │ │ 📖 HISTÓRIA DO DIA       │ │
│ │      [3D DIGITAL TWIN]           │ │                           │ │
│ │      Malha FEM com heatmap       │ │ 06:00 — Nível subiu 0.2m │ │
│ │      de Von Mises overlay        │ │ → Deslocamento respondeu  │ │
│ │                                   │ │   +0.15mm (HST: esperado)│ │
│ │   Click instrumento →            │ │ 10:30 — Temp ambiente ↑   │ │
│ │   zoom + timeline + LSTM         │ │ → Expansão térmica 0.04mm │ │
│ │                                   │ │ 14:00 — LSTM prevê       │ │
│ │   [Seepage flow lines overlay]   │ │   estabilização às 18h    │ │
│ │   [Thermal gradient overlay]     │ │                           │ │
│ │                                   │ │ 💬 MOTHER: "Comportamento│ │
│ │                                   │ │  dentro da envoltória HST.│ │
│ │                                   │ │  Nenhuma ação requerida." │ │
│ └───────────────────────────────────┘ └───────────────────────────┘ │
│                                                                     │
│ ┌─── TIMELINE (full width) ─────────────────────────────────────┐ │
│ │ Jan ──── Fev ──── Mar ──── [●AGORA] ──── Abr ──── Mai ──── │ │
│ │ ▲alarm  ▲maint  ▲reading        ▲LSTM prediction ──→        │ │
│ └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Narrativa
1. **Overview** — Header mostra health index + sinais vitais (sparklines de 7 dias)
2. **Zoom** — Click em qualquer instrumento no 3D → abre timeline dedicada
3. **Contexto** — Painel direito auto-gera "História do Dia" via MOTHER chat
4. **Projeção** — LSTM mostra previsão 24-48h com bandas de confiança
5. **Ação** — Alertas empurram notificações + auto-geram relatórios ICOLD

### Mapeamento de Módulos

| Área da UI | Módulos |
|------------|---------|
| Header (sinais vitais) | `digital-twin-engine-c205`, `sensor-validator`, `redis-shms-cache` |
| 3D Twin | `environment-3d`, `SHMS3DEnvironment.tsx`, `cross-section` |
| Heatmap overlays | `fem-engine` (stress/seepage/thermal) |
| LSTM previsão | `lstm-predictor` (BiLSTM+Attention+HST) |
| História do Dia | `MotherContext` (chat), `big-data-analysis`, `anomaly-detector` |
| Timeline | `timescale-connector`, `events-module`, `signal-processor` |
| Alertas | `alert-engine`, `shms-alert-engine-v3`, `notification-dispatcher`, `sirens` |
| Relatórios | `document-management`, `office-connector`, `tarp` |
| RUL | `rul-predictor`, `fault-tree` |
| Risk | `risk-maps`, `stability-analysis` |

---

## Conceito B: "A Estrutura Viva"

### Filosofia
> *"A barragem respira, pulsa, envelhece. Cada sensor é um nervo.
> O sistema não mostra dados — mostra emoções da estrutura."*

**Metáfora central:** Organismo vivo — a estrutura tem "sentimentos" (stress, fadiga, conforto) que são comunicados visualmente através de cores, pulsações e animações biomórficas.

### Base Científica
- Norman (2004) — "Emotional Design" — visceral, behavioral, reflective levels
- Tufte (2001) — "The Visual Display of Quantitative Information" — data-ink ratio
- Healey & Enns (2012) — "Attention and Visual Memory in Visualization" — preattentive processing
- Gibson (1979) — "Ecological Approach to Visual Perception" — affordances
- GISTM 2020 — tailings dam safety thresholds as "vital signs"

### Layout (1920×1080)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       S K Y L I N E   V I E W                      │
│                                                                     │
│                          ╱╲    ╱╲                                  │
│                         ╱  ╲  ╱  ╲                                 │
│                        ╱ ●  ╲╱ ●  ╲       ← sensores pulsam       │
│                       ╱  ●      ●  ╲         com amplitude do      │
│               ~~~~~~~╱   ●  ██  ●   ╲         desvio vs esperado  │
│               ~water~╱    ● ██   ●    ╲                            │
│               ~~~~~~~╲████████████████╱──── foundation              │
│                                                                     │
│        Cores da superfície = Von Mises (azul=safe → vermelho=stress)│
│        Linhas de fluxo animadas = seepage velocity (Darcy)          │
│        Gradiente de fundo = temperatura (Fourier)                   │
│                                                                     │
│ ┌─── PULSO ──────┐ ┌── SENTIMENTO ───────┐ ┌── MEMÓRIA ─────────┐ │
│ │ ❤️ 72 BPM      │ │ 😊 "Estou confortável│ │ 📅 5,247 dias de   │ │
│ │ (freq dominante│ │  hoje. A temperatura  │ │    operação         │ │
│ │  da vibração)  │ │  subiu mas meu corpo  │ │ 📊 3 eventos       │ │
│ │                │ │  expandiu como        │ │    significativos   │ │
│ │ ▂▃▅▇▅▃▂▃▅▇   │ │  esperado pelo modelo │ │ ⚠️ Última anomalia: │ │
│ │ (seismograma)  │ │  HST. RUL: 47 anos." │ │    há 89 dias       │ │
│ └────────────────┘ └──────────────────────┘ └────────────────────┘ │
│                                                                     │
│ ┌─── EXPLORAR (cards deslizáveis) ──────────────────────────────┐ │
│ │ [Raio-X]  [Percolação]  [Térmica]  [Previsão]  [Histórico]   │ │
│ │  FEM         Darcy        Fourier     LSTM         Timeline   │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│                    🎙️ "Como está a ombreira esquerda?"              │
│                    ____________________________________________      │
└─────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Narrativa
1. **Empatia** — A estrutura "fala" em primeira pessoa (MOTHER gera narrativas antropomórficas)
2. **Vital Signs** — Frequência dominante de vibração = "batimento cardíaco"
3. **Raio-X** — Click "Raio-X" revela seção transversal com FEM stress overlay
4. **Memória** — Timeline mostra "memórias" (eventos passados vs comportamento atual)
5. **Conversa** — Input de voz/texto no bottom: "Como está a junta 3?" → MOTHER responde com contexto

### Mapeamento de Módulos

| Área da UI | Módulos |
|------------|---------|
| Skyline (silhueta animada) | `environment-3d`, `cross-section`, `fem-engine` |
| Cores Von Mises | `fem-engine.solveStress()` |
| Linhas de fluxo | `fem-engine.solveSeepage()` |
| Gradiente térmico | `fem-engine.solveThermal()` |
| Pulso (batimento) | `signal-processor` (FFT → freq dominante), `anomaly-detector` |
| Sentimento (texto AI) | `MotherContext`, `big-data-analysis`, `lstm-predictor`, `rul-predictor` |
| Memória (timeline) | `timescale-connector`, `events-module`, `stability-analysis` |
| Cards explorar | FEM/LSTM/timeline reutilizados |
| Voz/Chat | `MotherContext` (já suporta chat + context injection) |
| Alertas cinéticos | `alert-engine`, `sirens`, `notification-dispatcher` |

### Design Psychology
- **Visceral** (Norman): pulsações, cores organicas, animações fluidas → emoção imediata
- **Behavioral**: affordances claras — click anywhere → detail, drag → timeline scrub
- **Reflective**: "memória" da estrutura gera reflexão sobre decisões passadas

---

## Conceito C: "Copilot do Engenheiro"

### Filosofia
> *"O engenheiro e a IA investigam a estrutura juntos.
> Cada pergunta revela uma camada. Cada resposta vem com evidência."*

**Metáfora central:** Detetive + Assistente AI — investigação guiada com evidências visuais. O chat é o centro, os gráficos são as "provas".

### Base Científica
- Microsoft Copilot UX pattern (2024) — AI-first interface, chat drives visualization
- Shneiderman (2022) — "Human-Centered AI" — keep human in control, AI as augmentation
- Klein (1998) — "Recognition-Primed Decision" model — experts use pattern recognition
- Gartner (2025) — 75% of data stories auto-generated by augmented intelligence
- Few (2004) — "Show Me the Numbers" — always evidence-based decisions

### Layout (1920×1080)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─ NAV ─────────────────────────────────────────────────────────┐ │
│ │ 🏗️ UHE Rio Verde │ ❤️94% │ 🔔 2 │ 📋 │ 👤 Eng. Silva     │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌──── EVIDÊNCIAS (65%) ─────────────┐ ┌── COPILOT (35%) ────────┐ │
│ │                                    │ │                          │ │
│ │  ┌─────────────────────────────┐  │ │ 🤖 MOTHER Copilot        │ │
│ │  │   [Visualização dinâmica]   │  │ │                          │ │
│ │  │                             │  │ │ Bom dia, Eng. Silva.     │ │
│ │  │   Muda conforme a conversa: │  │ │ Sua barragem está bem.   │ │
│ │  │                             │  │ │                          │ │
│ │  │   "mostra stress" → FEM     │  │ │ 3 insights de hoje:      │ │
│ │  │   "previsão" → LSTM chart   │  │ │ 1. Desl. crista +0.2mm  │ │
│ │  │   "percolação" → flow map   │  │ │    (HST: 85% hidrostát.) │ │
│ │  │   "compare" → small mult.   │  │ │ 2. Temp subiu 3°C       │ │
│ │  │   "relatório" → PDF preview │  │ │    (sazonal, esperado)   │ │
│ │  │                             │  │ │ 3. RUL: 47.2 anos       │ │
│ │  └─────────────────────────────┘  │ │                          │ │
│ │                                    │ │ ──────────────────────── │ │
│ │  ┌─────── Mini-cards ──────────┐  │ │ Sugestões:               │ │
│ │  │ [FEM] [LSTM] [Seepage] [3D] │  │ │ ▸ "Analise a junta 3"   │ │
│ │  │ [Risk] [RUL] [Alerts] [Docs]│  │ │ ▸ "Compare com 2024"    │ │
│ │  └─────────────────────────────┘  │ │ ▸ "Gere relatório ICOLD"│ │
│ │                                    │ │                          │ │
│ │  ┌── Quick Evidence Strip ─────┐  │ │ ╭─────────────────────╮ │ │
│ │  │ σ_VM: 4.2MPa │ SF: 7.1     │  │ │ │ Pergunte qualquer   │ │ │
│ │  │ Seep: 0.4L/m │ LSTM: ±0.1  │  │ │ │ coisa...        🎙️  │ │ │
│ │  └─────────────────────────────┘  │ │ ╰─────────────────────╯ │ │
│ └────────────────────────────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Narrativa
1. **Briefing matinal** — Copilot abre com resumo auto-gerado (3 insights + RUL)
2. **Investigação** — Engenheiro pergunta → visualização muda em tempo real
3. **Evidências** — Cada resposta do AI vem com gráficos/números linkados
4. **Relatório** — "Gere relatório ICOLD" → PDF com gráficos, HST, alertas
5. **Decisão** — Copilot sugere ações, engenheiro aprova → log assinado (hash)

### Mapeamento de Módulos

| Área da UI | Módulos |
|------------|---------|
| Chat/Copilot | `MotherContext`, `CognitiveTimeSeries` |
| Visualização dinâmica | `environment-3d`, `fem-engine`, `lstm-predictor`, `cross-section` |
| Mini-cards | Todos os 8 módulos core como quick-access |
| Evidence Strip | `fem-engine.summary`, `lstm-predictor.predict()`, `anomaly-detector` |
| Insights auto | `big-data-analysis`, `anomaly-ml`, `signal-processor` |
| Relatório ICOLD | `document-management`, `office-connector`, `tarp` |
| Voz | Browser Speech API → `MotherContext` |
| Hash/Crypto | `tarp` (timestamp + hash de auditoria) |
| Risk/Fault | `risk-maps`, `fault-tree`, `stability-analysis` |
| RUL | `rul-predictor` (Paris-Erdogan) |
| Alertas | `alert-engine`, `shms-alert-engine-v3`, `sirens` |
| Multi-tenant | `shms-multitenant`, `federated-learning` |

---

## Comparação Rápida

| Critério | A: Sala de Controle | B: Estrutura Viva | C: Copilot |
|----------|---------------------|-------------------|-------------|
| **Foco principal** | Monitoramento contínuo | Empatia/storytelling | Investigação AI |
| **Perfil do usuário** | Operador 24/7 | Gestor/decisor | Engenheiro de campo |
| **Carga cognitiva** | Baixa (familiar) | Média (emocional) | Baixa (guiado) |
| **Uso dos módulos** | 100% | 100% | 100% |
| **Inovação** | ★★★☆ | ★★★★★ | ★★★★☆ |
| **Praticidade** | ★★★★★ | ★★★☆☆ | ★★★★☆ |
| **WOW factor** | ★★★☆☆ | ★★★★★ | ★★★★☆ |
| **Tempo impl.** | ~3 sessões | ~5 sessões | ~4 sessões |
| **Base científica** | Shneiderman, Endsley | Norman, Tufte, Gibson | Shneiderman, Klein, Gartner |
