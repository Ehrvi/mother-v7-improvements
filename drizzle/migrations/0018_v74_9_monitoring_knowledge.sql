-- Migration 0018: v74.9 Monitoring & Observability Knowledge
-- Ingests scientific knowledge acquired during MOTHER v74.9 development
-- Sources: Google SRE Book, AgentOps, LumiMAS, SSE spec, ISO/IEC 25010:2023

-- 1. Google SRE Book — Four Golden Signals (Beyer et al., 2016)
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-sre-golden-signals-2016',
  'Google SRE: Four Golden Signals for Monitoring Distributed Systems',
  'The Four Golden Signals (Beyer et al., Google SRE Book, 2016) are the most critical metrics for monitoring any distributed system: (1) Latency — time to service a request; distinguish successful vs failed requests; track p50/p95/p99, never just average; (2) Traffic — demand on the system (requests/second, queries/minute); (3) Errors — rate of failed requests, both explicit (HTTP 5xx) and implicit (wrong content, policy violations); alert threshold: error rate > 1% = SLO violation; (4) Saturation — fullness of service (CPU, memory, queue depth). For LLM agents: saturation maps to quality score degradation and regeneration rate. Dashboard design principle: keep it simple, avoid magic thresholds, alert only on symptoms or imminent real problems. Tail latency: if 1% of requests are 50x the average, the average is misleading — always track p95 and p99 separately. SLO targets for MOTHER: p95 latency < 5000ms, error rate < 1%, availability > 99.5%, avg quality score > 70.',
  'https://sre.google/sre-book/monitoring-distributed-systems/',
  'observability',
  '["monitoring","sre","golden-signals","latency","traffic","errors","saturation","dashboard","slo","alerting"]',
  95,
  NOW()
);

-- 2. AgentOps — LLM Agent Observability (Dong et al., 2024)
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-agentops-observability-2024',
  'AgentOps: LLM Agent Observability Framework (Dong et al., 2024, arXiv:2411.05285)',
  'AgentOps (Dong et al., 2024, arXiv:2411.05285) provides a framework for monitoring LLM agents in production. Key LLM-specific metrics beyond the Four Golden Signals: (1) Token usage per query (input + output tokens) — critical for cost monitoring; (2) Model latency (time to first token, total generation time); (3) Tool call success rate (% of tool calls that succeeded); (4) Quality score distribution (histogram of qualityScore values — should be > 70 for MOTHER); (5) Hallucination rate (% of responses with uncertainty patterns detected); (6) Retry/regeneration rate (% of queries that triggered Guardian regeneration). Dashboard components: real-time log stream (SSE or WebSocket), metric cards with color coding (green/yellow/red), time series chart for latency over 24h, alert badges. Implementation: use Server-Sent Events (SSE) for one-directional log streaming — simpler than WebSocket, auto-reconnects, supported natively by browsers via EventSource API.',
  'https://arxiv.org/abs/2411.05285',
  'observability',
  '["agentops","llm-monitoring","token-usage","quality-score","hallucination-rate","tool-success-rate","sse","dashboard"]',
  90,
  NOW()
);

-- 3. LumiMAS — Multi-Agent System Monitoring (Solomon et al., 2025)
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-lumimas-multiagent-2025',
  'LumiMAS: Real-Time Anomaly Detection for Multi-Agent Systems (Solomon et al., 2025, arXiv:2508.12412)',
  'LumiMAS (Solomon et al., 2025, arXiv:2508.12412) provides a framework for real-time anomaly detection in multi-agent systems with low inference overhead. Key insight: monitor INTER-AGENT communication, not just individual agent outputs. For MOTHER specifically: monitor the Guardian → Core → Tool Engine pipeline. Anomaly patterns to detect: (1) Guardian consistently overriding responses (quality score < 55 repeatedly) — indicates systematic model degradation; (2) CRAG retrieval failures (context precision < 0.5) — indicates knowledge base corruption; (3) Tool engine permission denials clustering — indicates authorization system issues; (4) Episodic memory null returns — indicates database connectivity issues. LumiMAS uses lightweight statistical models (z-score, IQR) rather than heavy ML for anomaly detection, making it suitable for production. Implementation for MOTHER: track rolling window of 5 minutes, flag anomalies when metric deviates > 2 standard deviations from baseline.',
  'https://arxiv.org/abs/2508.12412',
  'observability',
  '["lumimas","multi-agent","anomaly-detection","pipeline-monitoring","guardian","crag","tool-engine"]',
  85,
  NOW()
);

-- 4. Server-Sent Events (SSE) — W3C Specification
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-sse-w3c-spec',
  'Server-Sent Events (SSE): W3C Specification for Real-Time Log Streaming',
  'Server-Sent Events (SSE) is a W3C standard for server-to-client streaming over HTTP. Key properties: (1) One-directional (server → client only) — ideal for log streaming; (2) Auto-reconnection: browser EventSource automatically reconnects with configurable retry interval (default 3s); (3) Text-based: each event is "data: <json>\\n\\n"; (4) No WebSocket overhead: uses standard HTTP, works through proxies and load balancers; (5) Keepalive: send ": keepalive\\n\\n" every 30s to prevent proxy timeout. Implementation for MOTHER: GET /api/reliability-stream returns text/event-stream; server maintains Set<Response> of active clients; broadcasts to all clients on each log entry or metric update; sends initial state (last 50 logs + current signals) on connection. Express headers required: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive, X-Accel-Buffering: no (disables nginx buffering). Client: new EventSource("/api/reliability-stream"); es.onmessage = (e) => parse(e.data).',
  'https://html.spec.whatwg.org/multipage/server-sent-events.html',
  'web-technology',
  '["sse","server-sent-events","streaming","real-time","log-streaming","express","eventsource"]',
  80,
  NOW()
);

-- 5. ISO/IEC 25010:2023 — Reliability Sub-characteristics
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-iso-25010-reliability-2023',
  'ISO/IEC 25010:2023 — Reliability Sub-characteristics for AI Systems',
  'ISO/IEC 25010:2023 defines reliability as a quality characteristic with four sub-characteristics relevant to MOTHER: (1) Maturity — frequency of failures from faults; measured as MTBF (Mean Time Between Failures); target for MOTHER: < 1 failure per 1000 queries; (2) Availability — proportion of time system is operational; measured as uptime %; target: > 99.5%; (3) Fault Tolerance — ability to operate despite faults; measured as % of queries completed despite partial failures; (4) Recoverability — ability to recover after failure; measured as MTTR (Mean Time To Recovery); target: < 30 seconds. For LLM-specific reliability: add (5) Response Quality Consistency — standard deviation of quality scores should be < 15 points; (6) Latency Consistency — p99/p50 ratio should be < 10x. SLO targets for MOTHER v74.9: p95 latency < 5000ms, error rate < 1%, availability > 99.5%, avg quality score > 70, quality score std dev < 15.',
  'https://www.iso.org/standard/78176.html',
  'quality-standards',
  '["iso-25010","reliability","availability","fault-tolerance","recoverability","slo","mtbf","mttr"]',
  88,
  NOW()
);

-- 6. fast-check — Property-Based Testing for TypeScript (Dubien, 2018)
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-fast-check-property-testing-2018',
  'fast-check: Property-Based Testing for TypeScript (Dubien, 2018)',
  'fast-check (Dubien, 2018, fast-check.dev) is a property-based testing library for TypeScript/JavaScript. Unlike example-based tests, property-based tests define invariants that must hold for ALL inputs, then automatically generate thousands of test cases. Key API: fc.assert(fc.property(fc.string(), (s) => invariant(s))) — runs 100 cases by default. Arbitraries for MOTHER: fc.string() for query inputs, fc.integer({min:0,max:100}) for quality scores, fc.array(fc.string()) for knowledge chunks, fc.record({query:fc.string(),response:fc.string()}) for message pairs. Key invariants for MOTHER: (1) qualityScore always in [0,100]; (2) sanitizeExtractedContent(s).length <= 100000; (3) sanitizeExtractedContent(s) never contains injection patterns; (4) fetchWithRetry never throws on 429/503 (retries instead); (5) safeGetId(null) === null (never throws); (6) calculateContextPrecision always in [0,1]. Integration with vitest: import {fc} from "fast-check"; it("property: ...", () => fc.assert(fc.property(...))). Shrinking: on failure, fast-check automatically finds the minimal failing case.',
  'https://fast-check.dev/',
  'testing',
  '["fast-check","property-based-testing","typescript","vitest","invariants","shrinking","arbitraries"]',
  82,
  NOW()
);

-- 7. better-sqlite3 — In-Memory SQLite for Tests
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-better-sqlite3-inmemory-2024',
  'better-sqlite3: Synchronous SQLite with In-Memory Mode for Testing (NC-DB-001)',
  'better-sqlite3 (github.com/WiseLibs/better-sqlite3) provides synchronous SQLite access for Node.js. For testing (NC-DB-001): const db = new Database(":memory:") creates a fully in-memory database that is destroyed when the connection closes — no files, no cleanup needed. Key advantages over mysql2 mocks: (1) Real SQL execution — tests actual query logic, not mocked responses; (2) Synchronous API — no async/await needed in tests; (3) Zero setup — no database server required; (4) Isolated — each test gets a fresh database. Pattern for MOTHER tests: beforeEach(() => { db = new Database(":memory:"); db.exec(schema); }); afterEach(() => db.close()). Drizzle ORM supports better-sqlite3 via drizzle-orm/better-sqlite3 adapter. Note: MySQL-specific syntax (AUTO_INCREMENT, TINYINT(1)) must be replaced with SQLite syntax (INTEGER PRIMARY KEY AUTOINCREMENT, INTEGER) in test schemas.',
  'https://github.com/WiseLibs/better-sqlite3',
  'testing',
  '["better-sqlite3","sqlite","in-memory","testing","nc-db-001","drizzle","database-testing"]',
  78,
  NOW()
);

-- 8. Patch Integration Pattern — Module Augmentation (v74.9)
INSERT IGNORE INTO knowledge_base (
  id, title, content, source, category, tags, importance_score, created_at
) VALUES (
  'kb-patch-integration-pattern-v749',
  'MOTHER v74.9: Patch Integration Pattern for Distributed Module Fixes',
  'When the main modules (guardian.ts, crag.ts, etc.) are not accessible in the local sandbox but exist in production (Cloud Run), the correct pattern is: (1) Create patch modules with the fix logic (guardian-patches.ts, fetch-with-retry.ts, crag-metrics.ts); (2) Create a patch-integration.ts re-export hub that documents HOW each module should import the patches; (3) Create a setup script (scripts/setup-v74-9.sh) that installs dependencies and runs tests; (4) Commit all patch files — Cloud Build applies them on next deploy; (5) The AWAKE maintenance protocol (Passo 0-C) instructs the maintenance agent to integrate patches into main modules when they are accessible. This pattern avoids the need for direct access to production modules while still shipping the fix logic. The patch-integration.ts file serves as both documentation and a re-export hub, making integration trivial for any developer or AI agent with access to the main modules.',
  'internal://mother-v74.9/patch-integration-pattern',
  'architecture',
  '["patch-integration","cloud-run","module-augmentation","maintenance-protocol","awake","deployment-pattern"]',
  85,
  NOW()
);
