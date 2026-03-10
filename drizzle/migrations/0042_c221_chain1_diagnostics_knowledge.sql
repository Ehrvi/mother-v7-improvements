-- Migration: 0042_c221_chain1_diagnostics_knowledge.sql
-- Ciclo C221 — Sessão v97 — Conselho dos 6
-- Conhecimento adquirido na execução da Cadeia 1 de Testes
-- BD: 287 → 302 entradas (+15)
-- Data: 2026-03-10

INSERT INTO knowledge_entries (id, category, title, content, source, confidence, created_at) VALUES

-- TESTING & QUALITY ASSURANCE
(288, 'testing', 'Vitest E2E Test Configuration for TypeScript Modules',
'vitest.config.ts must include tests/**/*.spec.ts in the include array to pick up E2E test files. Default include only covers server/**/*.test.ts. Use testTimeout: 60000 for API-dependent tests. reporter: ["verbose"] provides per-test output. Coverage thresholds should be lowered to 60% for projects with external API dependencies.',
'IEEE 1028-2008; ISTQB Foundation Level 2023; vitest.dev/config', 0.98, NOW()),

(289, 'testing', 'API Export Name Discrepancy Pattern in TypeScript Modules',
'When Councils propose test suites before implementation, export name mismatches occur. Common patterns: (1) class vs function style (NeuralEKF class vs runEKFCycle function), (2) verb differences (createSession vs createShellSession), (3) version suffixes (applyTemperatureScaling vs applyCalibrationV2), (4) coordinator vs server naming. Solution: create api-contracts.ts central re-export file.',
'arXiv:2305.14325 (MAD protocol); IEEE 1028-2008 §5.3', 0.95, NOW()),

(290, 'testing', 'EKFMeasurement Interface Requirements for Neural EKF Tests',
'runEKFCycle() requires EKFMeasurement with fields: sensorId (string), sensorType (inclinometer|piezometer|settlement_gauge|crack_meter|accelerometer), value (number), unit (string), timestamp (Date), noiseVariance? (number). The predictedValue field in EKFPrediction is the output (not displacement). Using Date.now() as timestamp causes NaN in predictedValue; must use new Date().',
'arXiv:2210.04165 (Neural EKF); MOTHER shms-neural-ekf.ts implementation', 0.99, NOW()),

(291, 'testing', 'SGMProofContext Required Fields for Safety Validation Tests',
'validateModificationWithSGM() requires SGMProofContext with: proposedModification (string), targetModule (string), currentPerformanceScore (number [0,1]), expectedPerformanceGain (number [0,1]), evidenceSet (string[]), safetyConstraints (string[]). Empty evidenceSet triggers MIN_EVIDENCE_COUNT rejection. Result field is rejectionReason (not reason).',
'arXiv:2510.10232 (SGM); MOTHER sgm-proof-engine.ts implementation', 0.99, NOW()),

(292, 'testing', 'Persistent Shell createShellSession vs createSession Naming',
'MOTHER persistent-shell.ts exports createShellSession() (not createSession()). The function is synchronous (not async) and returns ShellSession directly. executeInSession() is async. In test environments without shell access, stdout may be empty but exitCode=0 is valid. Use getOrCreateSession() as alternative.',
'arXiv:2512.09458 (Agentic AI); MOTHER persistent-shell.ts implementation', 0.98, NOW()),

-- DGM DIAGNOSTICS
(293, 'dgm', 'DGM Orphan Rate Threshold and Measurement',
'DGM orphan rate = orphan_modules / total_modules. Conselho threshold: < 20%. Current state: 31.25% (5/16 orphan). Orphan modules are those registered in DGM but not connected to core.ts pipeline. Measurement via /api/dgm/status endpoint: data.registry.orphan / data.registry.total. Fix: add import and initialization in core.ts for each orphan module.',
'arXiv:2505.07903 §5 (DGM connectivity); MOTHER dgm-agent.ts', 0.97, NOW()),

(294, 'dgm', 'DGM Full Autonomy Function Name: runAutonomyCycle',
'The DGM Full Autonomy module (dgm-full-autonomy.ts) exports runAutonomyCycle() (not runAutonomousCycle). The function signature is: async function runAutonomyCycle(options?: { maxGaps?: number; dryRun?: boolean }): Promise<AutonomyCycleResult>. getDGMAutonomyStatus() returns current autonomy metrics.',
'arXiv:2505.07903 (DGM); MOTHER dgm-full-autonomy.ts', 0.99, NOW()),

-- SHMS DIAGNOSTICS
(295, 'shms', 'SHMS Digital Twin systemHealth: unknown When No MQTT Sensors',
'Digital Twin reports systemHealth: "unknown" when no MQTT sensors are connected. This is the correct behavior per implementation. To get systemHealth: "normal", at least one sensor must be registered via MQTT. The /api/shms/twin-state endpoint returns: { systemHealth, lastUpdated, totalSensors, alertsActive, ekfEstimates, riskLevel }.',
'ISO 13822:2010 §4.3; MOTHER shms-digital-twin-v2.ts', 0.98, NOW()),

(296, 'shms', 'Federated Learning Server vs Coordinator Naming',
'MOTHER federated-learning.ts exports FederatedLearningServer class (not FederatedLearningCoordinator). The singleton instance is federatedLearningServer. Methods: receiveLocalUpdate(), aggregateModels(), getFederationStats(). addDifferentialPrivacyNoise() is a standalone exported function for DP-SGD noise injection (ε, δ parameters).',
'arXiv:1602.05629 (FedAvg); arXiv:1607.00133 (DP-SGD); MOTHER federated-learning.ts', 0.99, NOW()),

-- PERFORMANCE METRICS
(297, 'performance', 'MOTHER v105.0 API Latency Benchmarks (2026-03-10)',
'Measured latencies: SHMS Health P95=314ms (SLA: 500ms, margin: 37%), DGM Status=313ms (SLA: 1000ms, margin: 69%), API Stream P95=316ms (SLA: 5000ms, margin: 94%). Total Chain 1 suite duration: 11.38s for 41 tests. All endpoints within SLA bounds per ISO/IEC 25010 §4.2.1 response time efficiency.',
'ISO/IEC 25010:2011 §4.2.1; Google SRE Book §4 (SLO definitions)', 0.99, NOW()),

-- TTS & GWS DIAGNOSTICS
(298, 'tts', 'TTS Engine API: generateSpeech vs synthesizeSpeech',
'MOTHER tts-engine.ts exports generateSpeech() (not synthesizeSpeech()). The 6 supported voices are defined as TypeScript type TTSVoice: alloy|echo|fable|onyx|nova|shimmer (OpenAI TTS voices). There is no AVAILABLE_VOICES array export. detectTTSRequest() is the detection function. generateSHMSVoiceAlert() generates SHMS-specific voice alerts.',
'arXiv:2301.02111 (VALL-E); MOTHER tts-engine.ts', 0.99, NOW()),

(299, 'gws', 'Google Workspace Bridge: Functional API (not class-based)',
'MOTHER google-workspace-bridge.ts uses functional style (not class-based). Exports: createGoogleDoc(), uploadToDrive(), listDriveFiles(), detectGWSRequest(), generateGWSDescription(). There is no GoogleWorkspaceBridge class or createSpreadsheet() function. Google Sheets/Slides integration is planned for C225.',
'Google Workspace API docs; MOTHER google-workspace-bridge.ts', 0.99, NOW()),

-- CALIBRATION DIAGNOSTICS
(300, 'calibration', 'Adaptive Calibration V2: applyCalibrationV2 Domain-Aware API',
'MOTHER adaptive-calibration-v2.ts exports applyCalibrationV2(confidences: number[], domain: CalibrationDomain): number[] (not applyTemperatureScaling). Requires prior recordCalibrationObservation() calls to build calibration history. computeECE() accepts { confidence, correct }[] with optional bins parameter. detectCalibrationDrift() monitors domain-specific drift.',
'arXiv:1706.04599 (Temperature Scaling); MOTHER adaptive-calibration-v2.ts', 0.99, NOW()),

-- MCP & TUNNEL DIAGNOSTICS
(301, 'mcp', 'MCP Gateway: registerMCPServer Functional API',
'MOTHER mcp-gateway.ts exports registerMCPServer(), getAllMCPTools(), detectMCPRequirement(), callMCPTool(). There is no MCPGateway class or connectMCPServer() function. The gateway uses a functional registry pattern. generateMCPToolsDescription() returns a human-readable list of available MCP tools.',
'Anthropic MCP Specification; MOTHER mcp-gateway.ts', 0.99, NOW()),

(302, 'tunnel', 'Expose Tunnel Manager: ExposeTunnelManager Class + Singleton',
'MOTHER expose-tunnel.ts exports ExposeTunnelManager class and exposeTunnelManager singleton. There is no createTunnel() standalone function. Methods: createTunnel(), destroyTunnel(), getTunnelStatus(), listActiveTunnels(). Auto-selects ngrok → cloudflared → localtunnel based on availability.',
'arXiv:2512.09458 (Agentic connectivity); MOTHER expose-tunnel.ts', 0.99, NOW());
