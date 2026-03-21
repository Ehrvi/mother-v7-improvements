# 🔬 Digital Twins para SHMS — Pesquisa Estado da Arte

> **Metodologia**: Busca sistemática em arXiv, Kaggle, Zenodo, GitHub, forums especializados
> **Data**: 2026-03-18 | **Total de recursos encontrados**: 50+
> **Estruturas cobertas**: Pontes, Edifícios, Turbinas Eólicas, Barragens, Pipelines, Ferrovias

---

## 📊 1. DATASETS PRONTOS PARA USO

### 🌉 Pontes

| Dataset | Fonte | Sensores | Tipo |
|---------|-------|----------|------|
| **Z24 Bridge** (Suíça) | [GitHub: Elios-Lab](https://github.com/Elios-Lab/Z24-Bridge-SHM) | Temperatura, strain, deslocamento | Real (demolida) |
| **Smart Bridge Digital Twin** | [Kaggle](https://www.kaggle.com/datasets/sadafkasim/bridge-structural-health-monitoring) | Vibração, strain, corrosão, temp, umidade, tráfego, atividade sísmica | IoT + simulado |
| **Aging Bridge SHM** | [Kaggle](https://www.kaggle.com/datasets/) | Degradação, previsão, umidade, velocidade do vento | Time-series |
| **Vänersborg Bridge** (Suécia) | [Zenodo](https://zenodo.org/) | Aceleração, strain, inclinação, clima | Real (pré/pós fratura) |
| **Interpretable ML Bridge SHM** | [GitHub](https://github.com/) | Resposta estrutural, temperatura, carga veicular (21 meses) | Real |
| **Nibelungen Bridge** (Alemanha) | [DPI Proceedings](https://dpi-proceedings.com/) | Dados históricos e real-time SHM | Colaborativo, aberto |

### 🏢 Edifícios

| Dataset | Fonte | Sensores | Tipo |
|---------|-------|----------|------|
| **Building Structural Health Sensor** | [Kaggle](https://www.kaggle.com/) | Acelerômetros (X,Y,Z), strain gauges, temperatura | Simulado (healthy/minor/severe damage) |
| **PAMELA Impedance SHM** | [GitHub](https://github.com/) | SHM por impedância com flutuação de temperatura | Experimental |

### 🌬️ Turbinas Eólicas

| Dataset | Fonte | Sensores | Tipo |
|---------|-------|----------|------|
| **OpenWindSCADA** | [GitHub](https://github.com/) | Curated list de 10+ datasets SCADA abertos | Agregador |
| **Turkey Wind Turbine SCADA** | [GitHub: awesome-industrial-datasets](https://github.com/) | Velocidade/direção do vento, potência (10min intervals, 2018) | Real |
| **Wind Turbine ROS Digital Twin** | [GitHub: RyanSeidel](https://github.com/RyanSeidel/) | IoT sensors, detecção de dano, avaliação de risco | IoT + ROS |
| **Wind Turbine Blade Damage** | [GitHub: ertis-research](https://github.com/ertis-research/) | Imagens de superfície, deep learning para danos | Computer vision |

---

## 🛠️ 2. FRAMEWORKS OPEN-SOURCE

### Simulação Numérica (FEM)

| Framework | URL | Uso para SHMS |
|-----------|-----|---------------|
| **OpenSees** | [opensees.berkeley.edu](https://opensees.berkeley.edu) | FEM não-linear para análise sísmica, modelos de dano, pontes/edifícios |
| **FEniCS** | [fenicsproject.org](https://fenicsproject.org) | FEM generalizado (Python/C++), PDEs, interação fluido-estrutura |
| **Splipy** | [GitHub](https://github.com/sintefmath/Splipy) | Geometria digital-twin-compatible (NURBS/splines) |

### Plataformas de Digital Twin

| Plataforma | URL | Tipo | Destaques |
|------------|-----|------|-----------|
| **Xeokit SDK** | [xeokit.io](https://xeokit.io) | Open-source WebGL | Visualização 3D de BIM em browser, grande escala |
| **Snap4City** | [snap4city.org](https://snap4city.org) | Open-source | Ecossistema smart city: IoT, 3D viz, analytics, simulação |
| **mtezzele/DT** | [GitHub](https://github.com/mtezzele/) | Open-source Python | Digital twin para vigas e pontes (dados, modelos, código) |
| **MIDAS** | [GitHub](https://github.com/) | Open-source | Detecção automatizada de dano near-real-time |
| **ML-SHM** | [GitHub](https://github.com/) | Open-source Python | ML para eliminar variabilidade de temperatura em SHM |

### Plataformas Comerciais (com APIs)

| Plataforma | API | Uso para SHMS |
|------------|-----|---------------|
| **Azure Digital Twins** | REST API + SDKs | Modelagem DTDL, IoT Hub, real-time analytics |
| **Autodesk Tandem** | REST API | BIM + performance data, edifícios/infraestrutura |
| **PTC ThingWorx** | REST/MQTT | IoT industrial, edge computing, analytics |

---

## 📚 3. PAPERS CHAVE (arXiv + Journals)

### Estado da Arte

| Ref | Título | Ano | Destaques |
|-----|--------|-----|-----------|
| **arXiv:2511.00099** | GAN para detecção de dano e DT — Z24 Bridge | 2025 | Conditional GAN, não precisa de info prévia do estado de saúde |
| **arXiv:2508.00029** | Hybrid Quantum-Classical para inverse FEM em DT | 2025 | QMLP para atualização rápida de DT (pontes, pipelines, plataformas offshore) |
| **arXiv:2512.13919** | Adaptive DT: Online Bayesian Learning | 2025 | Bayesian online learning para transições de estado dinâmicas |
| **arXiv:2601.15098** | 3D Micro-CT para SHM com DT | 2026 | Deep learning para reconstrução 3D real-time de defeitos internos |
| **MDPI Review** | Digital Twin Approaches in SHM: Status & Prospects | 2025 | Review completa: detecção de dano, resposta dinâmica, manutenção |
| **U. Florida** | DT Framework for Real-Time Bridge SHM | 2024 | AI + weigh-in-motion, predição de estado da ponte |
| **U. Melbourne** | DT Platform for Heritage Bridge SHM | 2024-25 | IoT + BIM + FEM, pontes históricas da Austrália |
| **SAE-Transformer** | ML for Full-Field Temperature in Bridges | 2025 | Transformer surrogate model para análise térmica real-time |

### Domínios Específicos

| Domínio | Papers/Projetos | Técnicas |
|---------|-----------------|----------|
| **Turbinas Eólicas** | NorthWind Project, MDPI Reviews | ROM + IoT cloud, fatigue life prediction |
| **Ferrovias** | rail4future.com, BIMON | BIM + DT para infraestrutura ferroviária |
| **Barragens** | Middlesex University | Low-cost DT para detecção precoce de dano |
| **Pipelines** | arXiv:2508.00029 | Inverse FEM com quantum computing |

---

## 🎯 4. RECOMENDAÇÕES PARA INTEGRAÇÃO NO SHMS

### Ação Imediata (pode usar agora)

1. **Kaggle Smart Bridge DT** → Importar CSV, popular sensores simulados para demonstração
2. **Kaggle Building SHM** → Dados de acelerômetro/strain para edifícios (healthy/damaged states)
3. **Z24 Bridge Dataset** → Benchmark clássico para validar algoritmos de detecção de dano
4. **OpenWindSCADA** → 10+ datasets SCADA de turbinas já com data loaders

### Integração de Médio Prazo

5. **OpenSees** → Modelos FEM para análise sísmica (Python bindings: `openseespy`)
6. **Xeokit SDK** → Visualização 3D de BIM no browser (WebGL), integrável com o SHMS
7. **MIDAS Framework** → Near-real-time damage detection automática
8. **Azure Digital Twins** → API REST para modelagem DTDL de qualquer estrutura

### Pesquisa Avançada

9. **GAN para DT (arXiv:2511.00099)** → Detecção de dano sem dados prévios do estado saudável
10. **Quantum-Classical MLP (arXiv:2508.00029)** → Inverse FEM ultra-rápido para updates de DT
11. **SAE-Transformer** → Modelo surrogate para análise térmica em tempo real

---

## 🗂️ 5. REPOSITÓRIOS CURADOS

| Repo | Descrição |
|------|-----------|
| [SHM-with-Computers/amazing-shm-resources](https://github.com/SHM-with-Computers/amazing-shm-resources) | Coleção curada de papers, repos e recursos de SHM |
| [edt-community/awesome-digital-twins](https://github.com/edt-community/awesome-digital-twins) | Lista curada de recursos de digital twin (multi-domínio) |

---

> **Próximo passo**: Escolher quais datasets/frameworks integrar primeiro no SHMS. Recomendo começar pelo **Kaggle Smart Bridge DT** (dados prontos, IoT) + **Xeokit SDK** (visualização 3D).
