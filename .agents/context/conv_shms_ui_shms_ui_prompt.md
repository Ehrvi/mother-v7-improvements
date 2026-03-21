# 🧠 PROMPT: Pesquisa SOTA + Implementação de Nova UI para MOTHER SHMS

---

## CONTEXTO DO SISTEMA

Você é um agente de IA com acesso a ferramentas de terminal, browser, e edição de código. Sua missão tem duas fases:

**FASE 1 — PESQUISA CIENTÍFICA** (buscar estado da arte em UI/UX para sistemas de monitoramento de saúde estrutural)
**FASE 2 — IMPLEMENTAÇÃO** (deletar a UI atual e criar nova UI SOTA que exponha todos os 36 endpoints do backend)

O projeto está em: `c:\Users\elgar\OneDrive\Documentos\GitHub\mother-v7-improvements`
Stack: React + TypeScript + Vite (frontend), Express (backend)
A UI atual está em: `client/src/pages/SHMSPage.tsx` (1258 linhas, consome apenas 1 dos 36 endpoints disponíveis)

---

## FASE 1 — PESQUISA CIENTÍFICA

### Metodologia
Utilize metodologia de revisão sistemática da literatura (Kitchenham & Charters, 2007) com as seguintes etapas:
1. Definir questões de pesquisa
2. Buscar em fontes primárias e secundárias
3. Extrair dados relevantes
4. Sintetizar em recomendações de design

### Questões de Pesquisa
- **RQ1:** Quais são os padrões de UI/UX mais eficazes para dashboards de monitoramento geotécnico em tempo real?
- **RQ2:** Como sistemas SCADA/SHM modernos organizam a visualização de dados multi-sensor com alertas ICOLD?
- **RQ3:** Quais frameworks de design (design systems) são utilizados em aplicações de engenharia crítica?
- **RQ4:** Qual é o estado da arte em visualização de dados geoespaciais e séries temporais para monitoramento de barragens?
- **RQ5:** Quais padrões de interação são recomendados para sistemas de alerta e resposta a emergências?

### Fontes e Métodos de Busca

#### a. ArXiv (via API REST)
Execute as seguintes queries via curl na API do arXiv:

```bash
# RQ1: Dashboard design para SHM
curl -s "http://export.arxiv.org/api/query?search_query=all:%22structural+health+monitoring%22+AND+all:%22dashboard%22+AND+all:%22user+interface%22&max_results=15&sortBy=submittedDate&sortOrder=descending"

# RQ2: Visualização de dados de sensores em tempo real
curl -s "http://export.arxiv.org/api/query?search_query=all:%22real+time+monitoring%22+AND+all:%22sensor+data+visualization%22+AND+all:%22dam%22&max_results=15&sortBy=submittedDate&sortOrder=descending"

# RQ3: UI para sistemas SCADA modernos
curl -s "http://export.arxiv.org/api/query?search_query=all:%22SCADA%22+AND+all:%22user+interface%22+AND+all:%22design%22&max_results=10&sortBy=submittedDate&sortOrder=descending"

# RQ4: Visualização geoespacial + séries temporais
curl -s "http://export.arxiv.org/api/query?search_query=all:%22geospatial+visualization%22+AND+all:%22time+series%22+AND+all:%22monitoring%22&max_results=10&sortBy=submittedDate&sortOrder=descending"

# RQ5: Digital Twin UI
curl -s "http://export.arxiv.org/api/query?search_query=all:%22digital+twin%22+AND+all:%22visualization%22+AND+all:%22infrastructure%22&max_results=15&sortBy=submittedDate&sortOrder=descending"

# Design systems para engenharia
curl -s "http://export.arxiv.org/api/query?search_query=all:%22design+system%22+AND+all:%22web+application%22+AND+all:%22engineering%22&max_results=10&sortBy=submittedDate&sortOrder=descending"

# HCI para sistemas críticos
curl -s "http://export.arxiv.org/api/query?search_query=all:%22human+computer+interaction%22+AND+all:%22critical+infrastructure%22+AND+all:%22monitoring%22&max_results=10&sortBy=submittedDate&sortOrder=descending"

# State of the art em web dashboards
curl -s "http://export.arxiv.org/api/query?search_query=all:%22web+dashboard%22+AND+all:%22real+time%22+AND+all:%22analytics%22&max_results=10&sortBy=submittedDate&sortOrder=descending"
```

Para cada paper encontrado, extraia: título, autores, ano, abstract, e recomendações de UI/UX aplicáveis.

#### b. Sci-Hub (https://sci-hub.ren/)
Busque os DOIs dos papers mais relevantes encontrados no arXiv para acessar o texto completo. Foco em:
- Seções de "System Architecture", "User Interface Design", "Dashboard Layout"
- Figuras e screenshots de interfaces reais de SHM
- Tabelas comparativas de features de diferentes sistemas

#### c. Anna's Archive (https://annas-archive.gl/)
Busque os seguintes livros/manuais:
```
- "Structural Health Monitoring: A Machine Learning Perspective" (Farrar & Worden, 2012)
- "Dashboard Design: The Effective Visual Communication of Data" (Few, 2006)
- "Information Dashboard Design" (Stephen Few, 2013)
- "Designing Data-Intensive Applications" (Kleppmann, 2017)
- "Refactoring UI" (Wathan & Schoger, 2018)
- "Don't Make Me Think" (Krug, 2014)
- "The Design of Everyday Things" (Norman, 2013)
```
Extraia princípios de design aplicáveis a dashboards de monitoramento.

#### d. Manuais de Software SHM Comerciais
Busque via browser ou scraping a documentação pública de:
```
- Bentley Systems — PLAXIS/gINT (geotechnical monitoring)
- Rocscience — RS2/Slide (slope stability visualization)
- GeoStudio/SEEP — dashboard patterns
- Siemens MindSphere — industrial IoT dashboard
- OSIsoft PI Vision — process data visualization
- Grafana — time-series dashboard patterns
- Tableau — data visualization best practices
- ThingsBoard — IoT dashboard framework
- Catman DAQ — HBM data acquisition visualization
- Campbell Scientific LoggerNet — data logger interface patterns
```
Documente: layout principal, navigation patterns, como organizam sensores, alertas, e séries temporais.

#### e. Fóruns Especializados
Busque via scraping ou browser em:
```
- https://news.ycombinator.com/ — threads sobre "dashboard design", "monitoring UI", "SCADA"
- https://www.reddit.com/r/userexperience/ — threads sobre "industrial dashboard"
- https://www.reddit.com/r/dataisbeautiful/ — visualização de dados geoespaciais
- https://www.reddit.com/r/webdev/ — "real-time dashboard" frameworks
- https://stackoverflow.com/ — "react dashboard real-time" architectural patterns
- https://discourse.threejs.org/ — 3D visualization para engenharia
- https://community.plotly.com/ — time-series visualization
- https://www.geotech-fr.org/ — fórum geotécnico francês
- https://damsafety.org/ — ASDSO fórum de segurança de barragens
```

#### f. APIs e Web Scraping adicionais
```bash
# Google Scholar (top cited papers em SHM UI)
curl -s "https://scholar.google.com/scholar?q=%22structural+health+monitoring%22+%22user+interface%22+%22dashboard%22&as_ylo=2020"

# GitHub — projetos open-source de dashboard para SHM/IoT
curl -s "https://api.github.com/search/repositories?q=structural+health+monitoring+dashboard&sort=stars&order=desc&per_page=20"

# npm — pacotes React para dashboards
curl -s "https://registry.npmjs.org/-/v1/search?text=react+dashboard+real-time+monitoring&size=20"

# Dribbble/Behance — design inspiration
# Buscar via browser: "SCADA dashboard UI", "IoT monitoring dashboard", "geotechnical dashboard"
```

#### g. Estado da Arte — Áreas de Conhecimento
Pesquise o estado da arte nestas áreas específicas para informar o design:

| Área | Foco para UI |
|---|---|
| **Visualização de Séries Temporais** | Gráficos interativos com zoom, pan, brush selection, multi-eixo |
| **Visualização Geoespacial** | Mapas interativos, heatmaps, risk overlays, cross-sections |
| **3D Industrial** | WebGL/Three.js para digital twins, point clouds, BIM |
| **Design de Alertas** | IEC 62682:2014 — alarm management, priorização visual |
| **Acessibilidade** | WCAG 2.1 AA, contraste em ambientes industriais |
| **Performance Web** | Virtualização de listas, Web Workers, streaming SSE |
| **Data Tables** | AG Grid / TanStack Table — sorting, filtering, export |
| **Charts/Graphs** | D3.js, Recharts, Apache ECharts, Plotly.js |
| **State Management** | React Query / SWR para cache + real-time |
| **Responsive Design** | Mobile-first para operadores em campo |

### Entregável da Fase 1
Produza um documento `shms-ui-research.md` com:
1. Resumo de cada paper/fonte relevante encontrada
2. Screenshots ou descrições de UIs de referência
3. Princípios de design consolidados
4. Recomendações específicas para cada módulo do SHMS
5. Wireframes textuais das telas principais

---

## FASE 2 — IMPLEMENTAÇÃO

### Backend Disponível (36 endpoints — todos já implementados e funcionais)

```typescript
// ═══ DASHBOARD ═══
GET  /api/shms/v2/health                              // Health check
GET  /api/shms/v2/dashboard                            // Dashboard 1 estrutura
GET  /api/shms/v2/dashboard/all                        // Dashboard multi-estrutura
GET  /api/shms/v2/dashboard/:structureId               // Dashboard específico
GET  /api/shms/v2/status                               // Status SHMS v2

// ═══ ANALYSIS & AI ═══
POST /api/shms/v2/analyze                              // AI analysis pipeline (G-Eval + Digital Twin)

// ═══ TIME-SERIES & HISTORY ═══
GET  /api/shms/v2/history/:structureId                 // Histórico TimescaleDB
GET  /api/shms/v2/bridge/stats                         // MQTT→TimescaleDB pipeline stats

// ═══ SIGNAL PROCESSING & PREDICTION ═══
GET  /api/shms/v2/signal-analysis/:structureId         // FFT, PSD, DWT, damage indices
GET  /api/shms/v2/rul/:structureId                     // Remaining Useful Life (P10/P50/P90)

// ═══ GEOTECHNICAL ANALYSIS ═══
GET  /api/shms/v2/stability/:structureId               // Bishop FOS + Monte Carlo Pf
GET  /api/shms/v2/fault-tree/:structureId              // Fault tree (AND/OR gates)
GET  /api/shms/v2/risk-map/:structureId                // Risk polygons ICOLD colors
GET  /api/shms/v2/cross-section/:structureId           // Geological cross-section SVG
GET  /api/shms/v2/boreholes/:structureId               // Lithologic profiles
GET  /api/shms/v2/boreholes/:sid/:bid/svg              // Borehole SVG render

// ═══ INSTRUMENTATION ═══
GET  /api/shms/v2/instrumentation/:structureId         // Virtual tags, alarm levels

// ═══ ALERTS & EVENTS ═══
POST /api/shms/v2/alerts/:alertId/notify               // Multi-channel dispatch
GET  /api/shms/v2/events/:structureId                  // Event timeline
GET  /api/shms/v2/sirens/:structureId                  // Emergency siren status
POST /api/shms/v2/sirens/:structureId/activate         // Activate emergency alert
GET  /api/shms/v2/tarp/:structureId                    // TARP matrix compliance

// ═══ BIG DATA & ANALYTICS ═══
GET  /api/shms/v2/big-data/:structureId                // Behavior classification

// ═══ 3D VISUALIZATION ═══
GET  /api/shms/v2/3d/:structureId                      // 3D scene data (glTF mesh + DEM)

// ═══ DOCUMENTS & FILES ═══
GET  /api/shms/v2/files/:structureId                   // File listing
POST /api/shms/v2/files                                // File registration
GET  /api/shms/v2/documents/:structureId               // Document listing

// ═══ EXPORT & BI ═══
POST /api/shms/v2/export                               // CSV/JSON/Excel/Word export
POST /api/shms/v2/bi/push                              // Power BI / Tableau / Grafana push

// ═══ FINANCE ═══
GET  /api/shms/v2/bank/:structureId                    // Budget & reconciliation

// ═══ MULTI-PROTOCOL INGESTION ═══
GET  /api/shms/v2/ingest/status                        // All 8 connector statuses
POST /api/shms/v2/ingest/modbus                        // Modbus RTU/TCP (IEC 61158)
POST /api/shms/v2/ingest/opcua                         // OPC-UA (IEC 62541)
POST /api/shms/v2/ingest/lorawan                       // LoRaWAN (TS001-1.0.4)
POST /api/shms/v2/ingest/csv                           // CSV/Excel batch
POST /api/shms/v2/ingest/scada                         // SCADA (IEC 62351)
POST /api/shms/v2/ingest/serial                        // Serial RS-232/485
POST /api/shms/v2/ingest/http                          // HTTP REST genérico
POST /api/shms/v2/ingest                               // Universal dispatcher
```

### Arquivos a Deletar
```
client/src/pages/SHMSPage.tsx                          // UI atual (1258 linhas, 1 endpoint)
```

### Estrutura da Nova UI

Crie os seguintes arquivos/componentes baseado nos achados da pesquisa:

```
client/src/pages/
├── SHMSPage.tsx                    // Layout principal com sidebar + router
├── SHMS2DEnvironment.tsx           // Manter existente
├── SHMS3DEnvironment.tsx           // Manter existente

client/src/components/shms/
├── SHMSLayout.tsx                  // Shell: sidebar + topbar + content area
├── SHMSSidebar.tsx                 // Navegação por módulo
├── SHMSTopbar.tsx                  // Health status, MQTT, refresh, user
│
├── dashboard/
│   ├── OverviewDashboard.tsx       // KPIs, health rings, structure cards (endpoint: dashboard/all)
│   ├── StructureDetail.tsx         // Detalhe de 1 estrutura (endpoint: dashboard/:id)
│   └── HealthScoreWidget.tsx       // Componente de health ring reutilizável
│
├── sensors/
│   ├── SensorTimeSeries.tsx        // Gráfico interativo de séries temporais (endpoint: history/:id)
│   ├── SensorTable.tsx             // Tabela de sensores com filtros (endpoint: instrumentation/:id)
│   └── SensorDetail.tsx            // Detalhe de 1 sensor com anomalias
│
├── analysis/
│   ├── SignalAnalysisPanel.tsx     // FFT, PSD, DWT, damage (endpoint: signal-analysis/:id)
│   ├── RULPredictionPanel.tsx      // RUL com P10/P50/P90 chart (endpoint: rul/:id)
│   ├── StabilityPanel.tsx          // Bishop FOS + Monte Carlo (endpoint: stability/:id)
│   ├── FaultTreeViewer.tsx         // Árvore de falhas visual (endpoint: fault-tree/:id)
│   └── BigDataPanel.tsx            // Behavior classification (endpoint: big-data/:id)
│
├── geo/
│   ├── RiskMapViewer.tsx           // Mapa de risco com polygons (endpoint: risk-map/:id)
│   ├── CrossSectionViewer.tsx      // Cross-section SVG (endpoint: cross-section/:id)
│   ├── BoreholeViewer.tsx          // Perfis litológicos SVG (endpoint: boreholes/:id)
│   └── DigitalTwinViewer.tsx       // 3D scene (endpoint: 3d/:id)
│
├── alerts/
│   ├── AlertsPanel.tsx             // Lista de alertas ICOLD L1/L2/L3 + acknowledge
│   ├── EventTimeline.tsx           // Timeline de eventos (endpoint: events/:id)
│   ├── TARPMatrix.tsx              // TARP compliance grid (endpoint: tarp/:id)
│   ├── SirenControl.tsx            // Emergency siren management (endpoint: sirens/:id)
│   └── NotificationConfig.tsx      // Canal notifications config
│
├── ingestion/
│   ├── IngestionStatus.tsx         // Status dos 8 conectores (endpoint: ingest/status)
│   ├── ProtocolConfig.tsx          // Config por protocolo (Modbus, OPC-UA, etc.)
│   └── DataImport.tsx              // CSV/Excel upload UI (endpoint: ingest/csv)
│
├── documents/
│   ├── FileManager.tsx             // File drive (endpoint: files/:id)
│   ├── DocumentLibrary.tsx         // Document management (endpoint: documents/:id)
│   └── ExportPanel.tsx             // Export CSV/Excel/Word (endpoint: export)
│
├── admin/
│   ├── BIIntegration.tsx           // BI push config (endpoint: bi/push)
│   ├── BudgetOverview.tsx          // Financial view (endpoint: bank/:id)
│   └── SystemHealth.tsx            // Health + bridge stats
│
├── ai/
│   ├── AIAnalysisChat.tsx          // Chat com análise AI (endpoint: analyze)
│   └── CognitiveInsights.tsx       // Insights do Cognitive Bridge
│
└── shared/
    ├── TimeSeriesChart.tsx         // Chart reutilizável (D3/Recharts/ECharts)
    ├── StatusBadge.tsx             // Badge ICOLD GREEN/YELLOW/RED
    ├── DataTable.tsx               // Tabela genérica com sort/filter/export
    ├── LoadingSkeleton.tsx         // Skeleton loader
    ├── ErrorBoundary.tsx           // Error boundary com retry
    └── useShmsApi.ts              // Hook React Query para todos os endpoints
```

### Requisitos de Design (baseados em normas)

| Norma | Requisito para UI |
|---|---|
| **IEC 60073** | Cores de alarme: verde=normal, amarelo=atenção, vermelho=perigo |
| **IEC 62682:2014** | Prioridade de alarmes P1-P4, shelving, acknowledgment |
| **ISO 9241-11:2018** | Usabilidade: eficácia + eficiência + satisfação |
| **ISO 9241-110:2020** | Princípios de interação: adequação, autodescritibilidade |
| **Nielsen (1994)** | 10 heurísticas de usabilidade (especialmente H1: visibilidade do status do sistema) |
| **WCAG 2.1 AA** | Acessibilidade: contraste ≥4.5:1, keyboard navigation, screen readers |
| **ICOLD Bulletin 158** | Sistema de alarmes 3 níveis (L1/L2/L3) com cores padronizadas |
| **GISTM 2020 §8.2** | Visualização de status de instrumentação |

### Requisitos Técnicos

1. **Framework**: React + TypeScript, componentes funcionais com hooks
2. **Styling**: CSS vanilla com design tokens (oklch color system), dark mode padrão
3. **Data fetching**: React Query (TanStack Query) para cache, polling, e real-time
4. **Charts**: Escolha entre Recharts, Apache ECharts, ou D3.js baseado na pesquisa
5. **Tables**: TanStack Table ou AG Grid para tabelas de dados
6. **3D**: Three.js / React Three Fiber para digital twin
7. **Maps**: Leaflet ou Mapbox GL para visualização geoespacial
8. **Routing**: React Router v6 com nested routes por módulo
9. **State**: React Query + URL state (searchParams), sem Redux
10. **Performance**: Virtualização de listas longas, lazy loading de módulos, Web Workers para FFT
11. **Responsividade**: Layout que funcione em desktop (1920px) e tablet (768px)
12. **Internacionalização**: Português brasileiro como idioma padrão, preparado para inglês

### Qualidade Visual Obrigatória

- Design **premium**, não "MVP básico"
- Paleta de cores oklch harmoniosa com dark mode
- Micro-animações suaves (transitions 200-300ms)
- Tipografia moderna (Inter ou Outfit via Google Fonts)
- Glassmorphism sutil para cards sobre backgrounds
- Gradientes em KPI highlights
- Hover effects em todos os elementos interativos
- Loading skeletons (não spinners)
- Empty states com ilustrações
- Toast notifications para feedback

---

## ENTREGÁVEIS FINAIS

1. `shms-ui-research.md` — Documento de pesquisa com fontes, achados, e recomendações
2. Nova `SHMSPage.tsx` e todos os componentes listados acima
3. `useShmsApi.ts` — Hook centralizado para todos os 36 endpoints
4. Todos os componentes consumindo seus respectivos endpoints
5. Verificação que TypeScript compila sem erros
6. Screenshots/recording da nova UI funcionando

---

## RESTRIÇÕES

- NÃO use TailwindCSS (use CSS vanilla com design tokens)
- NÃO use bibliotecas de componentes prontas (Material UI, Ant Design, Chakra) — crie tudo do zero para garantir design único
- NÃO crie stubs vazios — cada componente DEVE chamar seu endpoint real e renderizar dados
- NÃO ignore endpoints — TODOS os 36 devem ser acessíveis pela UI
- MANTENHA os arquivos existentes SHMS2DEnvironment.tsx e SHMS3DEnvironment.tsx
- EMBASE cada decisão de design em referência científica ou norma técnica
