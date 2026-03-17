-- MOTHER v74.8 — Migration 0017
-- Scientific knowledge acquired during sequential research for v74.8 NC fixes
-- Executed: 2026-02-28
-- Papers: 10 | Total bd_central entries after: ~1071

-- ─── NC-GUARD-001/002: G-Eval + Uncertainty Calibration ──────────────────────

INSERT INTO knowledge (title, content, category, tags, source) VALUES
(
  'G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment',
  'G-Eval (Liu et al., 2023) is a framework using LLMs with chain-of-thoughts (CoT) and a form-filling paradigm to assess NLG output quality. It achieves Spearman correlation 0.514 with humans on summarization, outperforming all previous methods. Key dimensions: Coherence (1-5), Consistency (1-5), Fluency (1-5), Relevance (1-5). Uses token weight summation via log-probabilities for final score. Known limitation: Verbosity Bias — longer responses score higher regardless of quality. Mitigation: add explicit completeness rules for short responses (< 50 chars → cap at 55). Application to MOTHER: use G-Eval dimensions to validate guardian.ts qualityScore computation. NC-GUARD-001 fix: if response.length < 50 AND query.length > 20, force qualityScore ≤ 55.',
  'test_engineering',
  'g-eval,nlg-evaluation,quality-scoring,guardian,NC-GUARD-001',
  'arXiv:2303.16634 | EMNLP 2023 | Liu et al. | Cited by 2278'
),
(
  'Rank-Calibration: Uncertainty Quantification for Language Models',
  'Rank-Calibration (Shuoli et al., 2024, ACL EMNLP) provides a principled framework for assessing uncertainty/confidence measures of LLMs. Key finding: linguistic uncertainty markers (e.g., "I think", "maybe", "not sure") correlate significantly with Expected Calibration Error (ECE). High ECE = unreliable response. Practical implication for MOTHER guardian.ts (NC-GUARD-002): detect uncertainty patterns in PT+EN before computing final qualityScore. Penalty: -10 points per matched pattern, capped at 3 matches (-30 max). EN patterns: "I''m not sure", "maybe", "possibly", "I think", "I believe", "it seems", "I cannot confirm". PT patterns: "não tenho certeza", "acho que", "talvez", "possivelmente", "acredito que", "parece que", "não posso confirmar".',
  'test_engineering',
  'uncertainty-calibration,rank-calibration,guardian,NC-GUARD-002,quality-scoring',
  'ACL EMNLP 2024 | Shuoli et al. | github.com/shuoli90/Rank-Calibration'
),
(
  'RAGAS: Automated Evaluation of Retrieval Augmented Generation',
  'RAGAS (Es et al., 2023, arXiv:2309.15217) provides reference-free evaluation metrics for RAG systems. Context Precision@K = Σ(Precision@k × v_k) / K_relevant, where v_k ∈ {0,1} is relevance indicator at rank k. Context Recall = |relevant_terms_covered| / |total_query_terms|. F1 = 2PR/(P+R). Non-LLM implementation for real-time evaluation: use TF-IDF-inspired term overlap (query terms with length > 3, stop-word filtered). Application to MOTHER crag.ts (NC-RAGAS-001): add contextPrecision and contextRecall fields to CRAG evaluation result. Target: CP > 0.7, CR > 0.7 for high-quality retrieval.',
  'test_engineering',
  'ragas,context-precision,context-recall,rag-evaluation,crag,NC-RAGAS-001',
  'arXiv:2309.15217 | Es et al., 2023 | github.com/explodinggradients/ragas'
),
(
  'AWS Builders Library: Timeouts, Retries, and Backoff with Jitter',
  'AWS recommended pattern for resilient distributed systems (Brooker, 2019). Exponential backoff formula: delay = min(baseDelay × 2^attempt + jitter, maxDelay). Full jitter variant: jitter = random(0, 500ms) — prevents thundering herd by spreading retry arrival rate. Recommended parameters for research APIs (arXiv, Semantic Scholar): maxAttempts=3, baseDelay=1000ms, maxDelay=8000ms, timeout=10000ms per attempt. Circuit breaker: after 3 consecutive failures, mark service as degraded for 60s. Retry only on: HTTP 429 (rate limited), HTTP 5xx (server errors). Do NOT retry on: HTTP 4xx (client errors, except 429). Application to MOTHER omniscient.ts (NC-OMNI-001): replace bare fetch() with fetchWithRetry() from fetch-with-retry.ts.',
  'reliability',
  'exponential-backoff,retry,jitter,circuit-breaker,NC-OMNI-001,resilience',
  'AWS Builders Library | Brooker, 2019 | aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter'
),
(
  'ISO/IEC 25010:2023 — Software Quality Model: Reliability Sub-characteristics',
  'ISO/IEC 25010:2023 (SQuaRE) defines 9 quality characteristics for software products. Reliability sub-characteristics: (1) Maturity — frequency of failures under normal operation; (2) Availability — proportion of time system is operational; (3) Fault Tolerance — ability to operate despite hardware/software faults; (4) Recoverability — ability to recover data and re-establish state after failure. Measurable targets for AI systems: Error Rate < 1%, p95 Latency < 5000ms, Availability > 99.5%, MTBF > 720h, MTTR < 30min. Application to MOTHER fitness_scorer.ts (NC-PERF-001): add ReliabilityMetrics class with sliding window (5min, 1000 samples) tracking errorRate, p50/p95/p99 latency, availabilityPercent.',
  'reliability',
  'iso-25010,reliability-metrics,availability,latency,NC-PERF-001,slo',
  'ISO/IEC 25010:2023 | iso.org/obp/ui/en/#!iso:std:78176:en'
),
(
  'fast-check: Property-Based Testing for JavaScript and TypeScript',
  'fast-check (Dubien, 2018) is a property-based testing framework for JS/TS. 37M downloads/month, 4.8k GitHub stars. Works natively with vitest: fc.assert(fc.property(fc.string(), (s) => invariant(s))). Key arbitraries: fc.string(), fc.integer(), fc.float(), fc.array(), fc.anything(). Shrinking: when a counterexample is found, fast-check automatically shrinks it to the minimal failing case. Application to MOTHER (NC-TEST-001): 6 property invariants for guardian.ts, crag-metrics.ts, fetch-with-retry.ts, and autonomy.ts. P1: qualityScore ∈ [0,100]. P2: completeness rule never increases score. P3: CP/CR ∈ [0,1]. P4: backoff delay ∈ [baseDelay, maxDelay+500]. P5: null-safe functions never throw. P6: hasApprovalFor = false after revokeAllApprovals.',
  'test_engineering',
  'fast-check,property-based-testing,vitest,invariants,NC-TEST-001',
  'fast-check.dev | npm:fast-check v4.5.3 | Dubien, 2018'
),
(
  'better-sqlite3: Synchronous SQLite for Node.js In-Memory Testing',
  'better-sqlite3 (WiseLibs) is the fastest and simplest SQLite library for Node.js. Key feature: synchronous API (no callbacks/promises) — ideal for tests. In-memory mode: new Database(":memory:") creates an ephemeral database that is destroyed when the connection closes. Advantages over MySQL mock: 10x faster test execution, no network overhead, deterministic behavior, schema validation. HN consensus (2024): "replacing the database with in-memory SQLite for tests is a sweet spot — almost as fast as a mock, catches a lot of database bugs." Application to MOTHER (NC-DB-001): use better-sqlite3 :memory: in vitest setup to test knowledge table CRUD operations with property-based tests (fc.string() for title/content).',
  'test_engineering',
  'better-sqlite3,sqlite,in-memory,testing,NC-DB-001,vitest',
  'github.com/WiseLibs/better-sqlite3 | HN thread: news.ycombinator.com/item?id=42552976'
),
(
  'TypeScript Optional Chaining and Defensive Programming for Null Safety',
  'TypeScript Optional Chaining (TC39 Proposal, 2020, ECMAScript 2020) provides ?. operator for safe property access. Null safety patterns for MOTHER: (1) NC-CACHE-001 — cache item loading: use if (!item?.id) continue; to skip null/undefined items in cache load loop; (2) NC-EPISODIC-001 — episodic memory: use if (!result || result === null) return []; before Object.keys()/Object.entries() calls. McConnell "Code Complete 2" Chapter 8 (Defensive Programming): "Barricade your program to contain the damage caused by errors. Designate certain interfaces as boundaries to outside data." Null safety functions: safeGetId(item), safeObjectEntries(obj), safeObjectKeys(obj) — never throw for any input (verified by property-based tests with fc.anything()).',
  'reliability',
  'null-safety,optional-chaining,defensive-programming,NC-CACHE-001,NC-EPISODIC-001',
  'TC39 Optional Chaining Proposal (2020) | McConnell, Code Complete 2, Chapter 8'
),
(
  'Rethinking HTTP API Rate Limiting: A Client-Side Approach',
  'arXiv:2510.04516 (2025) proposes adaptive retry timing that infers congestion rather than relying solely on time-based exponential backoff. Key insight: standard exponential backoff with jitter works well for transient failures but can be improved with congestion-aware retry scheduling for rate-limited APIs. For MOTHER omniscient.ts arXiv API calls: (1) detect HTTP 429 Retry-After header and use server-specified delay; (2) fall back to exponential backoff when header absent; (3) implement circuit breaker after 3 consecutive 429s to avoid API ban. Practical parameters validated by paper: baseDelay=1s, maxDelay=8s, maxAttempts=3, jitter=full (random 0-500ms).',
  'reliability',
  'rate-limiting,http-api,exponential-backoff,arxiv-api,NC-OMNI-001',
  'arXiv:2510.04516 | 2025 | Rethinking HTTP API Rate Limiting'
),
(
  'Google SRE Book: Service Level Objectives and Error Budgets',
  'Beyer et al. (2016), "Site Reliability Engineering: How Google Runs Production Systems". SLO framework: define measurable targets for reliability. For AI inference services: p50 < 2000ms, p95 < 5000ms, p99 < 10000ms, error rate < 1%, availability > 99.5%. Error budget = 1 - SLO target (e.g., 0.5% downtime budget per month = 3.65h). When error budget is exhausted, freeze feature deployments and focus on reliability. Application to MOTHER fitness_scorer.ts (NC-PERF-001): ReliabilityMetrics.meetsTargets() checks all SLO targets and returns violations array. If violations exist, fitness score is penalized. Sliding window: 5 minutes, 1000 samples max.',
  'reliability',
  'sre,slo,error-budget,latency,availability,NC-PERF-001,google',
  'Beyer et al. (2016), Site Reliability Engineering, O''Reilly'
);
