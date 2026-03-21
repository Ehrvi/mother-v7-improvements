# Pesquisa Científica — Dados, Datasets e Instrumentação para SHMS de Barragens

> **Metodologia**: Revisão sistemática (Kitchenham & Charters, 2007) com busca em arXiv, web, fóruns especializados, normas ISO/ICOLD, e legislação brasileira (PNSB/ANA).  
> **Fontes**: 40+ referências. 8 buscas web + 1 API arXiv. **Data**: 2026-03-18.

---

## RQ1: Todos os Dados Necessários para Alimentar o SHMS

Baseado em ICOLD Bulletins 60/68/87/118/138/158, ISO 13374-1:2003, e PNSB (Lei 12.334/2010).

### 1.1 Dados Geotécnicos

| Parâmetro | Unidade | Instrumento | Frequência |
|---|---|---|---|
| Pressão piezométrica | kPa, mca | Piezômetro | 1min–1h |
| Nível freático | m | Piezômetro Casagrande | 1h |
| Percolação/vazão | L/min | Medidor de vazão V-notch | 15min |
| Deslocamento horizontal | mm | Inclinômetro, Pêndulo direto | 1h |
| Deslocamento vertical (recalque) | mm | Extensômetro, Placa recalque | 6h |
| Pressão total de terra | kPa | Célula de pressão | 1h |
| Tensão interna | MPa | Stressmeter | 1h |
| Deformação (strain) | µε | Strain gauge (corda vibrante) | 1min |
| Abertura de trincas | mm | Crackmeter | 15min |
| Movimento de juntas | mm | Jointmeter | 15min |

### 1.2 Dados Estruturais

| Parâmetro | Unidade | Instrumento | Frequência |
|---|---|---|---|
| Deflexão do coroamento | mm | Pêndulo direto/invertido | 1h |
| Inclinação | ° (graus) | Tiltmeter | 15min |
| Vibração / aceleração | g, m/s² | Acelerômetro triaxial | 100–200 Hz |
| Frequência natural | Hz | Acelerômetro + FFT | Contínuo |
| Temperatura do concreto | °C | Termistor embarcado | 30min |
| Deformação fibra óptica | µε, °C | FBG (Fiber Bragg Grating) | Contínuo |
| Deslocamento GNSS | mm | Receptor GNSS RTK | 1s–1min |

### 1.3 Dados Hidráulicos

| Parâmetro | Unidade | Instrumento | Frequência |
|---|---|---|---|
| Nível do reservatório | m | Régua limnimétrica / radar | 1min |
| Nível de jusante | m | Sensor ultrassônico | 15min |
| Vazão efluente | m³/s | Vertedouro + sensor | 15min |
| Turbidez da água | NTU | Turbidímetro | 30min |

### 1.4 Dados Ambientais

| Parâmetro | Unidade | Instrumento | Frequência |
|---|---|---|---|
| Precipitação | mm/h | Pluviômetro | 5min |
| Temperatura do ar | °C | Estação meteorológica | 15min |
| Umidade relativa | % | Higrômetro | 15min |
| Pressão barométrica | hPa | Barômetro | 1h |
| Velocidade do vento | m/s | Anemômetro | 15min |
| Radiação solar | W/m² | Piranômetro | 1h |
| Sismicidade | PGA (g) | Sismógrafo / acelerógrafo | Contínuo |

### 1.5 Dados de Inspeção Visual

| Parâmetro | Método | Frequência |
|---|---|---|
| Surgências / olhos d'água | Inspeção visual | Semanal |
| Vegetação no talude | Fotografia / drone | Mensal |
| Erosão superficial | LiDAR / InSAR | Trimestral |
| Trincas visíveis | Inspeção + crackmeter | Semanal |
| Obstruções em drenos | Inspeção visual | Semanal |
| Recalques/abatimentos | Topografia | Mensal |

### 1.6 Dados de Operação

| Parâmetro | Unidade | Fonte |
|---|---|---|
| Abertura de comportas | % | SCADA |
| Vazão turbinada | m³/s | SCADA |
| Geração de energia | MW | SCADA |
| Alarmes emitidos | contagem | Sistema de alarmes |
| Histórico de manutenção | registro | CMMS |

---

## RQ2: Datasets Confiáveis para SHMS

### 2.1 Datasets Abertos (Disponibilidade Limitada)

> ⚠️ **Conclusão da pesquisa**: Datasets abertos de monitoramento de barragens são **extremamente escassos** por razões de segurança nacional e propriedade intelectual.

| Dataset | Tipo | Disponibilidade | URL |
|---|---|---|---|
| **GRanD** (Global Reservoir and Dam Database) | Características de barragens (localização, volume, tipo) | Aberto | USGS/SEDAC |
| **SNISB** (Sistema Nacional de Informações sobre Segurança de Barragens) | Cadastro de barragens brasileiras, classificação DPA | Aberto | [snisb.gov.br](https://www.snisb.gov.br) |
| **ICOLD World Register of Dams** | Registro mundial de barragens | Pago | ICOLD |
| **National Inventory of Dams (NID)** | 92.000+ barragens nos EUA | Aberto | USACE |

### 2.2 Datasets de Pesquisa Acadêmica (Via Colaboração)

| Estudo | Dados | Período | Referência |
|---|---|---|---|
| Anomaly detection em barragem de concreto | Sensores de seção crítica | 7 anos | ResearchGate (2023) |
| LSTM displacement prediction | Deslocamento radial/tangencial + vazão | 33 anos | ResearchGate (2024) |
| Bi-Stacked-LSTM deformação | Séries hidrostáticas + térmicas | Multi-ano | MDPI Water (2023) |
| Deep learning on graphs | Displacement de várias seções | Multi-ano | OUP (2023) |

### 2.3 Fontes de Dados Sintéticos / Simulados

| Ferramenta | Tipo de dados | Uso |
|---|---|---|
| **FLAC3D / PLAXIS** | Modelagem geotécnica FEM | Simulação de deformação |
| **ANSYS / ABAQUS** | Análise estrutural FEA | Tensão/deformação |
| **HEC-RAS** | Hidráulica de vertedouros | Vazão/nível |
| **MOTHER SHMS Simulator** | Geração de leituras sintéticas | Dev/teste |

### 2.4 APIs e Fontes de Dados em Tempo Real

| Fonte | Dados | Protocolo | Latência |
|---|---|---|---|
| **Campbell Scientific** (CR6 + LoggerNet) | Dataloggers de campo | TCP/IP, SDI-12 | ~1s |
| **Encardio-Rite EDAS** | Hub de sensores geotécnicos | HTTP REST | ~5s |
| **MQTT / HiveMQ** | IoT sensor streaming | MQTT v5.0 | ~100ms |
| **Sisgeo OMNIAlog** | Datalogger + web server | FTP/HTTP | ~10s |
| **GeoDAQ** | Platform SaaS monitoramento | REST API | ~1min |

---

## RQ3: Catálogo Completo de Instrumentação de Barragens

### 3.1 Instrumentação Geotécnica (19 tipos)

| # | Instrumento | O que mede | Princípio | Fabricantes |
|---|---|---|---|---|
| 1 | **Piezômetro de corda vibrante** | Pressão piezométrica | Vibrating wire | Geokon, Sisgeo, Encardio |
| 2 | **Piezômetro Casagrande** | Nível freático | Tubo aberto | Genérico |
| 3 | **Piezômetro pneumático** | Pressão piezométrica | Pressão de gás | Slope Indicator |
| 4 | **Inclinômetro** (portátil/fixo) | Deslocamento lateral | MEMS / servo-acelerômetro | Geokon, Durham Geo |
| 5 | **Extensômetro de haste** | Deslocamento axial | Potenciômetro / LVDT | Geokon, RST |
| 6 | **Extensômetro magnético** | Recalque em profundidade | Spider magnets + sonda | Slope Indicator |
| 7 | **Célula de pressão total** | Pressão de terra | Vibrating wire / hidráulica | Geokon, RST |
| 8 | **Célula de carga** | Força em ancoragem | Vibrating wire / strain gauge | Geokon, Encardio |
| 9 | **Marco superficial topográfico** | Deslocamento 3D | Levantamento topográfico | Leica, Trimble |
| 10 | **Placa de recalque** | Recalque vertical | Nivelamento | Genérico |
| 11 | **Medidor de junta** (jointmeter) | Abertura de junta | LVDT / corda vibrante | Geokon, Sisgeo |
| 12 | **Crackmeter** | Abertura de trinca | LVDT / corda vibrante | Geokon, Encardio |
| 13 | **Strain gauge** (corda vibrante) | Deformação | Vibrating wire | Geokon, Roctest |
| 14 | **Stressmeter** | Tensão in situ | Pressão hidráulica | Gloetzl |
| 15 | **Tiltmeter / Clinômetro** | Inclinação | MEMS | Sisgeo, Geokon |
| 16 | **MPS (Multi-Point Settlement)** | Recalque multi-ponto | Spider magnets | Slope Indicator |
| 17 | **GPR** (Ground Penetrating Radar) | Vazios e anomalias internas | Radar EM | GSSI, Malå |
| 18 | **Sonda de permeabilidade** | Permeabilidade in situ | Ensaio Lugeon/Lefranc | Genérico |
| 19 | **Medidor de uplift** | Subpressão | Manômetro / transdutor | Geokon |

### 3.2 Instrumentação Estrutural (12 tipos)

| # | Instrumento | O que mede | Princípio | Fabricantes |
|---|---|---|---|---|
| 20 | **Pêndulo direto** | Deslocamento horizontal do coroamento | Gravidade + óptico | Huggenberger, Telemac |
| 21 | **Pêndulo invertido** | Deslocamento absoluto da fundação | Flutuador + óptico | Huggenberger, Telemac |
| 22 | **Defletômetro** | Deflexão | Corda tensa / óptico | Genérico |
| 23 | **Strain rosette** | Deformação multidirecional | Strain gauge 0-45-90° | TML, HBM |
| 24 | **Termistor embarcado** | Temperatura do concreto | NTC / PTC | Geokon, Encardio |
| 25 | **Sensor FBG** (Fiber Bragg Grating) | Strain + temperatura distribuída | Reflexão de Bragg | FBGS, HBM |
| 26 | **Sensor de fibra óptica distribuída** (BOTDR/BOTDA) | Strain contínuo em km | Brillouin scattering | Omnisens, Luna |
| 27 | **Acelerômetro triaxial** | Vibração e sismicidade | MEMS / piezoelétrico | Kinemetrics, GeoSIG |
| 28 | **Sismógrafo / Strong Motion** | Aceleração sísmica | FBA (Force Balance) | Kinemetrics, Güralp |
| 29 | **Geofone** | Vibração de baixa frequência | Bobina + imã | GeoSpace, Sercel |
| 30 | **GNSS/GPS** | Posição 3D do coroamento | RTK / PPP | Leica, Trimble, u-blox |
| 31 | **Estação total robótica** | Distância + ângulo a prismas | Laser EDM + encoders | Leica TM60, Trimble S9 |

### 3.3 Instrumentação Hidráulica e Ambiental (11 tipos)

| # | Instrumento | O que mede | Princípio | Fabricantes |
|---|---|---|---|---|
| 32 | **Medidor de vazão V-notch** | Vazão de percolação | Vertedouro triangular | Genérico |
| 33 | **Régua limnimétrica** | Nível do reservatório | Visual / ultrassônico | Vega, Endress+Hauser |
| 34 | **Sensor de nível radar** | Nível do reservatório | Micro-ondas | Vega, Siemens |
| 35 | **Pluviômetro** | Precipitação | Tipping bucket / óptico | Davis, Campbell Sci |
| 36 | **Estação meteorológica** | Temp, umid, vento, sol | Multi-sensor | Davis, Campbell Sci |
| 37 | **Turbidímetro** | Turbidez da água | Nefelometria | Hach, YSI |
| 38 | **Sensor de condutividade** | Qualidade da água | Eletrodo | YSI, Endress+Hauser |
| 39 | **Barômetro** | Pressão atmosférica | Piezo/MEMS | Vaisala, Bosch |
| 40 | **Câmera de monitoramento** | Inspeção visual remota | CCTV / IP | Axis, Hikvision |
| 41 | **Drone + LiDAR** | Topografia, inspeção visual | Aerofotogrametria | DJI, Riegl |
| 42 | **InSAR** (Synthetic Aperture Radar) | Deslocamento superficial mm/ano | Satélite SAR | Sentinel-1, COSMO-SkyMed |

### 3.4 Instrumentação de Automação e Comunicação

| # | Componente | Função | Protocolo |
|---|---|---|---|
| 43 | **Datalogger** (ex: Campbell CR6) | Coleta e armazena leituras | SDI-12, RS-485, Modbus |
| 44 | **Multiplexer** | Conecta múltiplos sensores ao datalogger | AM16/32B |
| 45 | **Modem celular/satelital** | Transmissão remota | 4G/5G, Iridium, LoRaWAN |
| 46 | **Gateway MQTT** | Bridge IoT → cloud | MQTT v5.0 |
| 47 | **UPS / painel solar** | Alimentação em campo | 12V/24V DC |
| 48 | **Abrigo/gabinete IP66** | Proteção do datalogger | — |

---

## Normas e Regulamentações

| Norma | Escopo |
|---|---|
| **ICOLD Bulletin 60** (1988) | Dam monitoring — general considerations |
| **ICOLD Bulletin 68** (1989) | Monitoring of dams and foundations — SOTA |
| **ICOLD Bulletin 87** (1992) | Improvement of existing dam monitoring |
| **ICOLD Bulletin 118** (2000) | Automated dam monitoring systems |
| **ICOLD Bulletin 138** (2009) | General approach to dam surveillance |
| **ICOLD Bulletin 158** (2012) | Dam Surveillance Guide |
| **ISO 13374-1:2003** | Condition monitoring — Data processing |
| **Lei 12.334/2010** (PNSB) | Política Nacional de Segurança de Barragens |
| **ABNT NBR 13028** | Mineração — Elaboração do projeto de barragens de rejeitos |
| **FEMA P-93** | Federal Guidelines for Dam Safety : SEED |

## Referências Científicas (Deep Learning / LSTM)

1. **Bi-Stacked-LSTM** — MDPI Water (2023): Deformation monitoring with hydrostatic and thermal time series
2. **Deep Learning on Graphs** — OUP (2023): Long-term dam behavior prediction
3. **Automated Framework LSTM + FEM** — MDPI (2023): Health monitoring of dams
4. **LSTM Data Repair** — NIH (2024): Repair of abnormal/missing monitoring data
5. **RNN Comparative Study** — ResearchGate (2025): Daily, bi-monthly, monthly predictions for arch dams
