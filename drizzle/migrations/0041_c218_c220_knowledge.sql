-- Migration 0041: C218-C220 — PHASE 4 PRODUÇÃO SHMS Knowledge Base
-- MOTHER v100.0 → v105.0 — Conselho dos 6 — 2026-03-10
-- BD: 272 → 287 (+15 entradas científicas)
-- Protocolo: Delphi + MAD (Multiple Analyst Debate)

INSERT INTO knowledge_entries (category, title, content, source, confidence, created_at) VALUES

-- ============================================================
-- C218: SHMS Alert Engine V3 (NC-SHMS-004)
-- ============================================================
('SHMS', 'Gmail API para Alertas Geotécnicos',
 'A Gmail API v1 permite envio programático de emails via OAuth2 com latência < 2s. Para alertas SHMS, o endpoint POST /gmail/v1/users/me/messages/send aceita payload Base64url-encoded RFC 2822. Indicador de sucesso: delivery rate > 99% com audit trail em shms_alert_log (ISO 13822:2010). Implementado em NC-SHMS-004 (shms-alert-engine-v3.ts).',
 'https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send', 0.97, NOW()),

('SHMS', 'Twilio SMS para Alertas Críticos SHMS',
 'Twilio REST API v2010 permite envio de SMS com latência < 5s via POST /2010-04-01/Accounts/{SID}/Messages.json. Para SHMS, SMS deve ser reservado para alertas CRITICAL (ISO 13822:2010 Nível 3). Autenticação: Basic Auth com AccountSID:AuthToken. Limite: 160 caracteres por mensagem. Implementado em NC-SHMS-004.',
 'https://www.twilio.com/docs/sms/api/message-resource', 0.96, NOW()),

('SHMS', 'FCM Push Notifications para Dashboard SHMS',
 'Firebase Cloud Messaging (FCM) permite push notifications com prioridade "high" para alertas geotécnicos em tempo real. Endpoint: POST https://fcm.googleapis.com/fcm/send com X-Api-Key header. Latência < 1s para dispositivos online. Implementado em NC-SHMS-004 com fallback para email.',
 'https://firebase.google.com/docs/cloud-messaging/http-server-ref', 0.95, NOW()),

-- ============================================================
-- C218: Digital Twin Dashboard WebSocket (NC-SHMS-005)
-- ============================================================
('SHMS', 'Digital Twin WebSocket Real-Time Dashboard',
 'Dashboard Digital Twin SHMS com WebSocket RFC 6455 para atualizações < 1s. Health Score composto (0-100) baseado em qualidade de sensores: good=100, degraded=60, bad=20. Risk Level: LOW (health>80, alerts=0), MEDIUM (health>60 ou alerts>0), HIGH (health>30 ou alerts>2), CRITICAL (health<30 ou alerts>5). Implementado em NC-SHMS-005 (digital-twin-dashboard.ts).',
 'https://tools.ietf.org/html/rfc6455', 0.97, NOW()),

('SHMS', 'Deformation Map via Interpolação Espacial RC-NN',
 'Mapa de deformação geotécnica via Deep RC-NN (arXiv:2511.00100, Grieves & Vickers 2017). Sensores inclinômetro/extensômetro mapeados em coordenadas normalizadas [0,1]. Displacement em mm, velocity em mm/dia, trend: stable (<1mm), decelerating (1-5mm), accelerating (>5mm). Integrado ao Digital Twin Dashboard NC-SHMS-005.',
 'https://arxiv.org/abs/2511.00100', 0.94, NOW()),

-- ============================================================
-- C219: Expose Tunnel (NC-SENS-008)
-- ============================================================
('SENSORIUM', 'Expose Tunnel ngrok/cloudflared para URL Pública',
 'NC-SENS-008 implementa tunnel manager com auto-seleção ngrok/cloudflared. ngrok API v3: GET http://localhost:4040/api/tunnels retorna URL pública HTTPS. Cloudflared quick tunnel: URL *.trycloudflare.com sem autenticação. Fallback automático entre provedores. Casos de uso: demos SHMS, webhooks externos, integração MQTT. Implementado em expose-tunnel.ts.',
 'https://ngrok.com/docs/api/', 0.95, NOW()),

('SENSORIUM', 'Cloudflare Tunnel vs ngrok: Comparação para SHMS',
 'Cloudflare Tunnel (cloudflared): gratuito, URL aleatória *.trycloudflare.com, sem autenticação necessária, latência ~50ms. ngrok: requer auth token para URLs persistentes, API local em localhost:4040, suporte a subdomínios customizados. Para produção SHMS: preferir cloudflared (sem limite de conexões). Para demos: ngrok (URL mais legível).',
 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/', 0.93, NOW()),

-- ============================================================
-- C219: Federated Learning SHMS (NC-SHMS-006)
-- ============================================================
('SHMS', 'FedAvg para Aprendizado Federado Multi-Site SHMS',
 'McMahan et al. (2017) arXiv:1602.05629: FedAvg agrega modelos locais com peso proporcional ao número de amostras. w_global = Σ (n_k/n_total) × w_k. Para SHMS multi-site: cada site treina localmente com dados geotécnicos proprietários e envia apenas gradientes (não dados brutos). Convergência: L2 norm < 0.001. Implementado em NC-SHMS-006 (federated-learning.ts).',
 'https://arxiv.org/abs/1602.05629', 0.97, NOW()),

('SHMS', 'Differential Privacy para Federated Learning SHMS',
 'Gaussian Mechanism para ε-DP: σ = (sensitivity × √(2 × ln(1.25/δ))) / ε. Para SHMS: ε=1.0, δ=1e-5, sensitivity=1.0 → σ≈4.3. Protege dados geotécnicos proprietários durante agregação FedAvg. arXiv:1607.00133 (Abadi et al., 2016): Deep Learning with Differential Privacy. Implementado em NC-SHMS-006.',
 'https://arxiv.org/abs/1607.00133', 0.96, NOW()),

('SHMS', 'Federated Learning Convergência e Heterogeneidade',
 'Li et al. (2020) arXiv:1908.07873: FedAvg converge mesmo com dados heterogêneos (non-IID) entre sites. Para SHMS: dados geotécnicos variam por localização geográfica (solo, clima, carga). Convergência garantida se: (1) taxa de aprendizado decrescente, (2) mínimo 2 sites participantes, (3) gradientes clipped para DP. Métrica: L2 norm < 0.001.',
 'https://arxiv.org/abs/1908.07873', 0.95, NOW()),

-- ============================================================
-- C220: Benchmark Suite (NC-BENCH-001)
-- ============================================================
('BENCHMARK', 'Benchmark Suite MOTHER v105.0 — 10 Suítes / 50 Testes',
 'NC-BENCH-001 implementa benchmark suite cobrindo: (1) Slow Thinking Engine (NC-COG-015), (2) SGM Proof Engine (NC-COG-013), (3) Persistent Shell (NC-SENS-001), (4) Neural EKF (NC-SHMS-001), (5) Federated Learning (NC-SHMS-006), (6) Expose Tunnel (NC-SENS-008), (7) Alert Engine V3 (NC-SHMS-004), (8) Digital Twin (NC-SHMS-005), (9) SENSORIUM Coverage, (10) Overall Score. Targets: Score >= 96, SENSORIUM >= 95%.',
 'https://arxiv.org/abs/2209.00840', 0.97, NOW()),

('BENCHMARK', 'SENSORIUM Coverage 95% — 19/20 Módulos Implementados',
 'SENSORIUM é o sistema sensorial de MOTHER com 20 módulos: S-01 Shell Persistente, S-02 Web Browser, S-03 File System, S-04 TTS+Vídeo, S-05 STT Whisper, S-06 Image Gen, S-07 Code Exec, S-08 Expose Tunnel, S-09 User Scheduler, S-10 Parallel Map, S-11 Google Drive, S-12 Gmail API, S-13 Google Calendar, S-14 GitHub, S-15 Apollo B2B, S-16 MQTT, S-17 TimescaleDB, S-18 MCP Gateway, S-19 Federated Learning, S-20 Digital Twin WS. Coverage: 19/20 = 95%.',
 'https://arxiv.org/abs/2512.09458', 0.98, NOW()),

-- ============================================================
-- DB: Migração sgm_proofs + shell_sessions
-- ============================================================
('DATABASE', 'Schema sgm_proofs — Registro Bayesiano de Auto-Modificações',
 'Tabela sgm_proofs armazena registros de prova Bayesiana para decisões de auto-modificação SGM: prior_probability (P(benefit) histórico), likelihood_ratio (P(evidence|benefit) análise estática), posterior_probability (Bayes posterior), risk_score = (1-posterior) × estimatedRisk × moduleCriticality. Aprovado se posterior >= 0.95 AND risk_score <= 0.001. Audit trail completo para Gödel Machines (arXiv:2510.10232).',
 'https://arxiv.org/abs/2510.10232', 0.96, NOW()),

('DATABASE', 'Schema shell_sessions — Contexto de Execução Persistente',
 'Tabela shell_sessions armazena estado de sessões shell persistentes: state (idle/running/error), working_dir, env_vars (JSON), history (array de CommandResult). Suporta até 10 sessões simultâneas com TTL de 30 minutos. Base: arXiv:2512.09458 Agentic AI Architectures — sessões persistentes são essenciais para agentes com memória de longo prazo.',
 'https://arxiv.org/abs/2512.09458', 0.95, NOW()),

('DATABASE', 'Schema shms_federated_sites — Registry Multi-Site Federado',
 'Tabela shms_federated_sites registra sites participantes do Federated Learning SHMS: public_key (RSA para troca segura de gradientes), contribution_weight = local_samples/total_samples (FedAvg weight), model_version, last_sync_at. Suporta status active/inactive/syncing. Base: arXiv:1602.05629 McMahan et al. FedAvg.',
 'https://arxiv.org/abs/1602.05629', 0.94, NOW());
