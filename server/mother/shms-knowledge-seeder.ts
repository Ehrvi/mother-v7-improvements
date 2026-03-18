/**
 * shms-knowledge-seeder.ts — Seeds ICOLD/ISO/PNSB norms into RAG knowledge
 *
 * Scientific basis:
 *   - ICOLD Bulletins 60/68/87/118/138/158 — Dam monitoring guidelines
 *   - ISO 13374-1:2003 — Condition monitoring data processing
 *   - PNSB Lei 12.334/2010 — Política Nacional de Segurança de Barragens
 *   - GISTM 2020 — Global Industry Standard on Tailings Management
 *   - FEMA P-93 — Federal Guidelines for Dam Safety
 *   - ABNT NBR 13028 — Elaboração do projeto de barragens de rejeitos
 *
 * Usage: Called once on server startup (non-blocking).
 * Stores 15 domain-specific knowledge entries for SHMS RAG queries.
 */

import { createLogger } from '../_core/logger.js';

const log = createLogger('SHMS_KNOWLEDGE');

interface KnowledgeEntry {
  title: string;
  content: string;
  category: string;
}

const SHMS_KNOWLEDGE: KnowledgeEntry[] = [
  // ── ICOLD Bulletins ──
  {
    title: 'ICOLD Bulletin 158 (2014) — Dam Surveillance Guide',
    category: 'SHMS-ICOLD',
    content: `ICOLD Bulletin 158 "Dam Surveillance Guide" (2014) é o principal guia internacional para monitoramento de barragens.

SISTEMA DE ALARME 3 NÍVEIS:
- GREEN (Normal): Todos os parâmetros dentro dos limites operacionais normais
- YELLOW (Atenção): Um ou mais parâmetros ultrapassaram limiares de alerta — requer investigação
- RED (Emergência): Parâmetros em níveis críticos — ação imediata necessária

PARÂMETROS MONITORADOS:
1. Geotécnicos: pressão piezométrica, deslocamento, recalque, percolação, tensão
2. Estruturais: deflexão do coroamento (pêndulos), vibração, deformação, temperatura
3. Hidráulicos: nível do reservatório, vazão de percolação, turbidez
4. Ambientais: precipitação, temperatura do ar, sismicidade

FREQUÊNCIA DE INSPEÇÕES:
- Inspeção visual: semanal (estruturas de alto risco) / mensal (baixo risco)
- Leitura de instrumentos: contínua (automática) ou diária/semanal (manual)
- Inspeção formal: anual (equipe multidisciplinar)
- Revisão de segurança: a cada 5 anos

PRINCÍPIO FUNDAMENTAL: O pior nível de alarme entre todos os sensores define o status geral da estrutura.`,
  },
  {
    title: 'ICOLD Bulletin 118 (2000) — Automated Dam Monitoring Systems',
    category: 'SHMS-ICOLD',
    content: `ICOLD Bulletin 118 "Automated Dam Monitoring Systems" (2000) estabelece diretrizes para automação de monitoramento.

COMPONENTES DO SISTEMA AUTOMATIZADO:
1. Sensores de campo (piezômetros, inclinômetros, strain gauges, etc.)
2. Dataloggers (Campbell Scientific CR6, etc.) — coleta SDI-12/RS-485/Modbus
3. Sistema de comunicação (4G/5G, LoRaWAN, satélite Iridium)
4. Software de gestão (SCADA, dashboards web, alarmes automáticos)

REQUISITOS DE REDUNDÂNCIA:
- Sensores críticos devem ter backup (pelo menos 2 por parâmetro crítico)
- Dataloggers com UPS e painel solar para operação contínua
- Comunicação dual-path (celular + satelital)

FREQUÊNCIA DE AQUISIÇÃO RECOMENDADA:
- Piezômetros: 1 leitura/minuto a 1/hora
- Acelerômetros: 100-200 Hz (contínuo)
- GNSS: 1 Hz a 1/minuto
- Temperatura: 1/30 minutos
- Extensômetros: 1/hora a 1/6 horas`,
  },
  {
    title: 'ICOLD Bulletin 138 (2009) — General Approach to Dam Surveillance',
    category: 'SHMS-ICOLD',
    content: `ICOLD Bulletin 138 "General Approach to Dam Surveillance" (2009) define a abordagem holística para vigilância.

PILARES DA VIGILÂNCIA:
1. Monitoramento de instrumentação (quantitativo)
2. Inspeção visual (qualitativo — surgências, trincas, erosão, vegetação)
3. Análise de dados e modelagem (LSTM, FEM, estatística)
4. Revisão periódica de segurança

CLASSIFICAÇÃO DE INSTRUMENTAÇÃO POR TIPO DE BARRAGEM:
- Barragem de concreto: pêndulos, termistores, extensômetros, piezômetros
- Barragem de terra: piezômetros, inclinômetros, marcos topográficos, medidores de vazão
- Barragem de rejeitos: todos os acima + GPR, InSAR, drone LiDAR, sondas de permeabilidade

CRITÉRIOS DE SELEÇÃO DE INSTRUMENTOS:
- Confiabilidade a longo prazo (vida útil > 20 anos para sensores em concreto)
- Precisão compatível com os limiares de alarme
- Facilidade de manutenção e calibração
- Resistência a condições ambientais adversas (umidade, temperatura extrema)`,
  },
  // ── ISO 13374 ──
  {
    title: 'ISO 13374-1:2003 — Condition Monitoring Data Processing',
    category: 'SHMS-ISO',
    content: `ISO 13374-1:2003 "Condition Monitoring and Diagnostics — Data Processing, Communication and Presentation" define a arquitetura modular para sistemas de monitoramento.

BLOCOS FUNCIONAIS (OPEN OSA-CBM):
1. DA (Data Acquisition): Aquisição de dados dos sensores
2. DM (Data Manipulation): Processamento de sinal (FFT, filtragem, normalização)
3. SD (State Detection): Detecção de estado (normal, alerta, alarme)
4. HA (Health Assessment): Avaliação de saúde (degradação, severidade)
5. PA (Prognostics Assessment): Prognóstico (RUL — Remaining Useful Life)
6. AG (Advisory Generation): Geração de recomendações (manutenção, ação)

TIPOS DE DADOS:
- Scientific floating point (IEEE 754)
- Integer (contadores, estados)
- Character string (identificadores, metadata)
- Timestamp (ISO 8601)
- Enum (estados finitos)

COMUNICAÇÃO:
- XML para intercâmbio de dados entre blocos
- Esquema relacional para armazenamento
- Protocolos abertos (HTTP, MQTT) para interoperabilidade

APLICAÇÃO EM SHMS DE BARRAGENS:
- DA: Dataloggers coletando leituras de piezômetros, inclinômetros
- DM: Filtragem de ruído, correção de temperatura, normalização
- SD: Classificação ICOLD Green/Yellow/Red
- HA: Índice de saúde estrutural (combinação ponderada de sensores)
- PA: LSTM para previsão de deslocamento e RUL
- AG: Alertas automáticos e recomendações de inspeção`,
  },
  // ── PNSB / ANA ──
  {
    title: 'PNSB — Lei 12.334/2010 — Política Nacional de Segurança de Barragens',
    category: 'SHMS-PNSB',
    content: `PNSB — Política Nacional de Segurança de Barragens (Lei 12.334/2010, atualizada pela Lei 14.066/2020).

APLICABILIDADE:
- Barragens de acumulação de água (≥15m altura OU ≥3.000.000 m³ volume OU DPA médio/alto)
- Barragens de rejeitos de mineração (QUALQUER porte — Lei 14.066/2020)
- Barragens de resíduos industriais

CLASSIFICAÇÃO:
- CRI (Categoria de Risco): Alta, Média, Baixa
- DPA (Dano Potencial Associado): Alto, Médio, Baixo
- Matriz CRI × DPA determina nível de monitoramento exigido

INSTRUMENTOS DA PNSB:
1. Plano de Segurança de Barragens (PSB)
2. Revisão Periódica de Segurança (a cada 5 anos para DPA Alto)
3. Plano de Ação de Emergência (PAE) — obrigatório para DPA Alto
4. Sistema de monitoramento contínuo (instrumentação automatizada)

ÓRGÃOS FISCALIZADORES:
- ANA: barragens de usos múltiplos da água
- ANM: barragens de rejeitos de mineração
- ANEEL: barragens de usinas hidrelétricas
- Órgãos estaduais: demais barragens

SNISB (Sistema Nacional de Informações sobre Segurança de Barragens):
- Cadastro de todas as barragens regulamentadas
- Registro de inspeções, instrumentação e incidentes
- Portal: snisb.gov.br`,
  },
  // ── GISTM 2020 ──
  {
    title: 'GISTM 2020 — Global Industry Standard on Tailings Management',
    category: 'SHMS-GISTM',
    content: `GISTM 2020 — Global Industry Standard on Tailings Management (ICMM/UNEP/PRI).
Criado após as tragédias de Mariana (2015) e Brumadinho (2019).

REQUISITOS DE MONITORAMENTO (Seção 7):
1. Monitoramento contínuo 24/7 com telemetria automática
2. Sistema de alarme com escalonamento automático
3. Inspeções visuais semanais por engenheiro qualificado
4. Revisão de dados por Engineer of Record (EoR) mensal

INSTRUMENTAÇÃO MÍNIMA OBRIGATÓRIA:
- Piezômetros (mínimo 3 seções ao longo do eixo)
- Inclinômetros (1 por seção crítica)
- Marcos topográficos / GNSS (coroamento e bermas)
- Medidores de vazão (percolação)
- Pluviômetro (precipitação local)
- Câmeras de monitoramento (áreas críticas)

CLASSIFICAÇÃO DE CONSEQUÊNCIAS:
- Classe I: Extrema (>100 fatalidades potenciais)
- Classe II: Muito Alta (>10 fatalidades)
- Classe III: Alta (>1 fatalidade)
- Classe IV: Significativa (impacto ambiental significativo)
- Classe V: Baixa (impacto limitado)

KNOWLEDGE BASE UPDATE:
- Independente de ICOLD, mas complementar
- Exige "Accountable Executive" com responsabilidade pessoal
- Transparência pública de dados de monitoramento`,
  },
  // ── Sensor Specifications ──
  {
    title: 'Especificações de Piezômetros — Geokon, Sisgeo, Encardio-Rite',
    category: 'SHMS-Sensors',
    content: `PIEZÔMETROS — Instrumentos mais críticos em monitoramento de barragens.

TIPOS:
1. Corda Vibrante (VW): Precisão ±0.025% FS, vida útil >25 anos, frequência 400-1200 Hz
   - Fabricantes: Geokon 4500, Sisgeo P234, Encardio-Rite EPWP-30V
   - Faixa: 0-1000 kPa (típico), até 10 MPa para alta pressão
   - Saída: frequência (Hz) → conversão para kPa via calibração

2. Casagrande (Tubo Aberto): Leitura manual ou automática com sensor de nível
   - Simples e confiável, mas lento para responder a mudanças rápidas
   - Melhor para monitoramento de longo prazo em solos de baixa permeabilidade

3. Pneumático: Precisão ±0.1% FS, sem efeito de coluna d'água
   - Ideal para instalação profunda (>50m)
   - Requer sistema de suprimento de gás

LIMIARES ICOLD (piezômetro VW típico em barragem de terra):
- GREEN: <350 kPa (ru < 0.35 — estável)
- YELLOW: 350-500 kPa (ru 0.35-0.50 — atenção, verificar drenos)
- RED: >500 kPa (ru >0.50 — risco de instabilidade, ação imediata)

POSICIONAMENTO (ICOLD Bulletin 138):
- Mínimo 3 seções instrumentadas (montante, crista, jusante)
- Profundidades múltiplas por seção (fundação, base, meio, topo)
- Redundância: pelo menos 2 piezômetros por ponto crítico`,
  },
  {
    title: 'Especificações de Inclinômetros — Geokon, Durham Geo, Slope Indicator',
    category: 'SHMS-Sensors',
    content: `INCLINÔMETROS — Monitoramento de deslocamento lateral em barragens e taludes.

TIPOS:
1. Portátil (Torpedo): Inserido em tubo-guia, leitura periódica
   - Precisão: ±2mm/25m, resolução 0.02mm
   - Intervalo: semanal a mensal
   - Fabricantes: Geokon 6000, RST GK-604D

2. In-Place (IPI): Instalação permanente, leitura contínua
   - Precisão: ±0.5mm, resolução 0.01mm, leitura a cada 1min
   - Ideal para monitoramento em tempo real
   - Fabricantes: Geokon 6150, Sisgeo MEMS, Slope Indicator DIGI-TILT

3. MEMS Digital: Microeletromecânico, custo reduzido, alta densidade
   - Precisão: ±1mm/m, temperatura compensada
   - Comunicação SDI-12 / RS-485

LIMIARES ICOLD (deslocamento acumulado):
- GREEN: <25mm (deformação normal de consolidação)
- YELLOW: 25-50mm (investigar causa, aumentar frequência de leitura)
- RED: >50mm (risco de ruptura, ação imediata)

INSTALAÇÃO TÍPICA EM BARRAGEM:
- 3 tubos por seção transversal (montante, eixo, jusante)
- Profundidade até rocha sã ou estrato estável
- Leitura de referência (baseline) antes do enchimento do reservatório`,
  },
  {
    title: 'Especificações de Acelerômetros e Sismógrafos — Kinemetrics, GeoSIG',
    category: 'SHMS-Sensors',
    content: `ACELERÔMETROS E SISMÓGRAFOS — Monitoramento sísmico de barragens.

ACELERÔMETROS TRIAXIAIS:
- Fabricantes: Kinemetrics EpiSensor ES-T, GeoSIG AC-73, PCB 393B12
- Faixa: ±0.25g a ±4g (selecionar conforme sismicidade regional)
- Frequência: DC a 200 Hz, amostragem 200-1000 SPS
- Resolução: 18-24 bits ADC
- Saída: analog ±10V OU digital Ethernet/RS-232

SISMÓGRAFOS STRONG MOTION:
- Fabricantes: Kinemetrics Basalt, Güralp CMG-5T
- PGA trigger: tipicamente 0.005g (início de registro)
- Memória: registra pre-trigger + evento + pós-trigger
- Sincronismo: GPS (precisão <1µs)

LIMIARES (ICOLD Dam Seismics):
- GREEN: PGA <0.05g (microsismicidade normal)
- YELLOW: PGA 0.05-0.15g (terremoto moderado, inspeção obrigatória)
- RED: PGA >0.15g (terremoto forte, evacuação a jusante)

POSICIONAMENTO:
- Base da barragem (rocha de fundação)
- Topo do coroamento (amplificação máxima)
- Campo livre (referência sem influência da estrutura)
- Mínimo 3 estações por barragem (ICOLD Bulletin 158)`,
  },
  {
    title: 'Especificações de GNSS/GPS — Leica, Trimble, u-blox',
    category: 'SHMS-Sensors',
    content: `GNSS/GPS — Monitoramento de deslocamento superficial 3D do coroamento.

RECEPTORES GEODÉSICOS:
- Fabricantes: Leica GR50, Trimble NetR9, u-blox ZED-F9P
- Precisão RTK: ±(5mm + 0.5ppm) horizontal, ±(10mm + 1ppm) vertical
- Precisão PPP: ±10-20mm após convergência (>30min)
- Frequências: GPS L1/L2, GLONASS G1/G2, Galileo E1/E5a, BeiDou B1/B2

LIMIARES ICOLD:
- GREEN: <10mm de deslocamento acumulado (variação sazonal normal)
- YELLOW: 10-25mm (investigar, correlacionar com nível do reservatório e temperatura)
- RED: >25mm (deformação anômala, ação imediata)

CONFIGURAÇÃO TÍPICA:
- 2-4 receptores no coroamento (espaçamento 50-100m)
- 1 receptor de referência (base fixa em rocha estável)
- Comunicação: 4G/LoRaWAN para dados NMEA/RTCM
- Amostragem: 1 Hz para RTK, pós-processamento diário para PPP

VANTAGENS vs TOPOGRAFIA CONVENCIONAL:
- Operação 24/7 automatizada
- Sem necessidade de visada direta
- Funciona em condições climáticas adversas
- Detecção de movimentos sub-centimétricos em 3D`,
  },
  // ── Data Processing & ML ──
  {
    title: 'Deep Learning para SHMS — LSTM, Bi-LSTM, Transformer',
    category: 'SHMS-ML',
    content: `DEEP LEARNING APLICADO A SHMS DE BARRAGENS — Estado da Arte (2023-2025).

MODELOS PRINCIPAIS:
1. LSTM (Long Short-Term Memory):
   - Predição de deslocamento de barragens (RMSE típico: 0.03-0.05mm)
   - Detecção de anomalias em séries de piezometria
   - Ref: Bi-Stacked-LSTM (MDPI Water 2023) — séries hidrostáticas e térmicas

2. Bi-LSTM (Bidirecional):
   - Captura dependências temporais em ambas as direções
   - Superior ao LSTM unidirecional para séries com padrões sazonais
   - Ref: Deformation monitoring of hydraulic structures (MDPI 2023)

3. GNN (Graph Neural Networks):
   - Captura correlações espaciais entre sensores
   - Ref: Deep learning on graphs for dam behavior (OUP 2023)

4. Transformers / Attention:
   - Self-attention para séries temporais longas (>1 ano)
   - Ref: SHM of arch dams — RNN comparative study (2025)

DATASETS UTILIZADOS EM PESQUISA:
- 7 anos de sensores de seção crítica (anomaly detection)
- 33 anos de deslocamento de barragem em arco (LSTM displacement)
- Dados simulados via FEM (FLAC3D, PLAXIS, ANSYS)

PIPELINE ISO 13374 + ML:
DA → DM (normalização) → SD (ICOLD threshold) → HA (LSTM health index) → PA (RUL) → AG (alertas)`,
  },
  {
    title: 'Modelos HST e HTT — Análise estatística de barragens de concreto',
    category: 'SHMS-ML',
    content: `MODELOS HST/HTT — Análise estatística clássica para barragens de concreto.

MODELO HST (Hydrostatic-Season-Time):
- H: Efeito hidrostático (nível do reservatório → polinômio grau 4)
- S: Efeito sazonal (temperatura → seno/cosseno)
- T: Efeito irreversível (tempo → logarítmico)
- Fórmula: δ = f(H) + f(S) + f(T) + ε
- Aplicação: previsão de deslocamento radial de barragens em arco

MODELO HTT (Hydrostatic-Thermal-Temporal):
- Similar ao HST mas usa temperatura medida (termistores) ao invés de sazonalidade
- Mais preciso quando há instrumentação térmica adequada

DETECÇÃO DE ANOMALIAS:
- Resíduo = Medido − Previsto
- |Resíduo| > 2σ → YELLOW (investigar)
- |Resíduo| > 3σ → RED (ação imediata)
- Controle estatístico de processo (SPC) com CUSUM e EWMA

COMPLEMENTARIDADE COM DEEP LEARNING:
- HST/HTT: modelo interpretável, base de comparação (benchmark)
- LSTM/Transformer: maior precisão, captura não-linearidades
- Ensemble: combina ambos para robustez (ML confirma HST e vice-versa)`,
  },
  // ── FEMA / ABNT ──
  {
    title: 'FEMA P-93 — Federal Guidelines for Dam Safety',
    category: 'SHMS-FEMA',
    content: `FEMA P-93 "Federal Guidelines for Dam Safety" — diretrizes dos EUA para segurança de barragens.

CATEGORIAS DE RISCO:
- High Hazard: perda provável de vidas humanas
- Significant Hazard: perda econômica/ambiental significativa
- Low Hazard: perda econômica limitada

MONITORAMENTO OBRIGATÓRIO (High Hazard):
1. Piezômetros em fundação e corpo da barragem
2. Medidores de vazão para percolação
3. Marcos topográficos para deformação
4. Sismógrafos (em zonas sísmicas)
5. Inspeção visual trimestral por engenheiro registrado

PLANO DE INSTRUMENTAÇÃO:
- Deve ser projetado considerando os modos de falha potenciais
- Cada sensor deve monitorar pelo menos um indicador de performance
- Redundância para sensores em locais inacessíveis
- Plano de contingência para falha de instrumentação`,
  },
  {
    title: 'ABNT NBR 13028 — Elaboração de Projeto de Barragens de Rejeitos',
    category: 'SHMS-ABNT',
    content: `NBR 13028 — Mineração — Elaboração e Apresentação de Projeto de Barragens de Rejeitos.

INSTRUMENTAÇÃO MÍNIMA (Anexo A):
- Piezômetros: mínimo 2 seções por 100m de crista
- Marcos topográficos: espaçamento máximo 50m no coroamento
- Medidores de vazão: em cada saída de dreno
- Inclinômetros: em seções onde há risco de instabilidade
- Pluviômetro: 1 por sítio, leitura diária mínima

FREQUÊNCIA DE LEITURAS (Tabela B.1):
- Durante construção: diária a semanal
- Primeiro enchimento: diária
- Operação normal: semanal a mensal
- Após evento excepcional (chuva intensa, sismo): imediata

RELATÓRIO DE MONITORAMENTO:
- Gráficos de tendência (mínimo 1 ano de dados)
- Comparação com valores de projeto
- Análise de correlação (nível × piezometria × deslocamento)
- Recomendações de ação para cada parâmetro fora do normal

INTEGRAÇÃO COM PNSB:
- O PSB (Plano de Segurança da Barragem) deve incluir programa de instrumentação
- Dados de monitoramento devem ser reportados ao órgão fiscalizador (ANA/ANM)`,
  },
  {
    title: 'Catálogo de 48 Instrumentos para SHMS — Pesquisa Completa',
    category: 'SHMS-Catalog',
    content: `CATÁLOGO COMPLETO DE INSTRUMENTAÇÃO PARA SHMS DE BARRAGENS — 48 tipos identificados.

GEOTÉCNICOS (19):
PIZ — Piezômetro de corda vibrante (kPa)
PCA — Piezômetro Casagrande (m)
PPN — Piezômetro pneumático (kPa)
INC — Inclinômetro (mm)
EXT — Extensômetro de haste (mm)
EXM — Extensômetro magnético (mm)
EPC — Célula de pressão total (kPa)
LC — Célula de carga (kN)
SM — Marco superficial topográfico (mm)
SP — Placa de recalque (mm)
JM — Medidor de junta (mm)
CRK — Crackmeter (mm)
SG — Strain gauge corda vibrante (µε)
STR — Stressmeter (MPa)
TLT — Tiltmeter (°)
MPS — Multi-Point Settlement (mm)
GPR — Ground Penetrating Radar (dB)
PRM — Sonda de permeabilidade (Lu)
UPL — Medidor de uplift (kPa)

ESTRUTURAIS (12):
PDD — Pêndulo direto (mm)
PDI — Pêndulo invertido (mm)
DEF — Defletômetro (mm)
SRO — Strain rosette (µε)
THR — Termistor embarcado (°C)
FBG — Sensor Fiber Bragg Grating (µε)
BOT — Fibra óptica distribuída BOTDR (µε)
ACC — Acelerômetro triaxial (g)
SIS — Sismógrafo Strong Motion (g)
GEO — Geofone (mm/s)
GNSS — GNSS RTK (mm)
TST — Estação total robótica (mm)

HIDRÁULICOS E AMBIENTAIS (11):
SEP — Medidor de vazão V-notch (L/min)
WL — Sensor de nível (%)
WLR — Sensor de nível radar (m)
RG — Pluviômetro (mm/h)
WS — Estação meteorológica (°C)
TUR — Turbidímetro (NTU)
CON — Sensor de condutividade (µS/cm)
BAR — Barômetro (hPa)
CAM — Câmera CCTV (fps)
DRN — Drone + LiDAR (pts/m²)
SAR — InSAR (mm/yr)

AUTOMAÇÃO (6):
DLG — Datalogger (canais)
MUX — Multiplexer (canais)
MDM — Modem celular (dBm)
GW — Gateway MQTT (msg/s)
UPS — UPS / Painel solar (V)
ENC — Abrigo IP66 (°C)`,
  },
];

/**
 * Seeds SHMS knowledge into the RAG system (non-blocking, idempotent).
 * Called once on server startup.
 */
export async function seedShmsKnowledge(): Promise<void> {
  try {
    const { addKnowledge } = await import('./knowledge.js');
    const { searchKnowledge } = await import('../db/index.js');

    let seeded = 0;
    let skipped = 0;

    for (const entry of SHMS_KNOWLEDGE) {
      // Check if already exists (idempotent)
      try {
        const existing = await searchKnowledge(entry.title, 1);
        if (existing.length > 0 && existing[0].title === entry.title) {
          skipped++;
          continue;
        }
      } catch {
        // searchKnowledge not available — seed anyway
      }

      await addKnowledge(
        entry.title,
        entry.content,
        entry.category,
        'SHMS-Research-2026',
        'Engenharia'
      );
      seeded++;
    }

    log.info(`[SHMS_KNOWLEDGE] Seeded ${seeded} entries, skipped ${skipped} existing (total: ${SHMS_KNOWLEDGE.length})`);
  } catch (err) {
    log.warn('[SHMS_KNOWLEDGE] Failed to seed knowledge (non-blocking):', err);
  }
}
