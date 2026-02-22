# MOTHER v19.0-v22.0 Scientific Roadmap TODO

**Tese Central**: Evolução de orquestrador eficiente para Agente Científico autônomo através de 4 versões estruturais.

**Princípio**: Cada versão = fase experimental com hipótese clara + validação objetiva.

---

## MOTHER v19.0: A Arquiteta Resiliente

**Hipótese**: Migração para Cloud Tasks resolverá timeout do Omniscient.

### Phase 1: Setup GitHub Repository
- [ ] Clone repository from https://github.com/Ehrvi/mother-v7-improvements.git
- [ ] Create feature branch: `feature/sota-evolution-v19-v22`
- [ ] Push current v18.0 state to branch
- [ ] Verify GitHub integration working

### Phase 2: Implement Google Cloud Tasks
- [ ] Add @google-cloud/tasks dependency
- [ ] Create omniscient-study-queue in Google Cloud Tasks
- [ ] Create worker endpoint: `/api/tasks/omniscient-worker`
- [ ] Implement single-paper processing logic in worker
- [ ] Refactor orchestrator to enqueue tasks instead of sync processing
- [ ] Return jobId immediately to user

### Phase 3: Validation (5 papers)
- [ ] Start study with 5 papers
- [ ] Monitor Cloud Tasks dashboard
- [ ] Verify 5 tasks created and executed
- [ ] Check database for 5 papers + chunks

### Phase 4: Validation (100 papers)
- [ ] Start study with 100 papers
- [ ] Monitor progress every 10 minutes
- [ ] Verify 100 tasks enqueued
- [ ] Check final status: papersCount >= 90

### Phase 5: Documentation
- [ ] Generate README-V19.0.md with async architecture diagram
- [ ] Generate AWAKE-V9.md with real scale test metrics
- [ ] Save checkpoint: v19.0
- [ ] Deploy to production

**Success Criteria**: 100 papers processed, status='completed', papersCount >= 90

---

## MOTHER v20.0: A Guardiã da Qualidade

**Hipótese**: Cobertura >95% = maior estabilidade em produção.

### Phase 1: Root Cause Analysis
- [ ] Group 55 failing tests by module (Auth, Guardian, Mother, Queue)
- [ ] Diagnose root cause per group (mocks, state, logic errors)
- [ ] Create fix priority list (Auth > Guardian > Mother > Queue)

### Phase 2: Fix Auth Tests (12 failures)
- [ ] Fix bcrypt hashing tests
- [ ] Fix session cookie management tests
- [ ] Fix password validation tests
- [ ] Fix rate limiting tests

### Phase 3: Fix Guardian Tests (8 failures)
- [ ] Fix empty query edge cases
- [ ] Fix quality score calculation tests
- [ ] Fix completeness validation tests
- [ ] Fix relevance assessment tests

### Phase 4: Fix Mother Router Tests (15 failures)
- [ ] Fix query processing pipeline tests
- [ ] Fix response validation tests
- [ ] Fix cost calculation tests
- [ ] Fix tier routing edge case tests

### Phase 5: Fix Queue Tests (6 failures)
- [ ] Fix job status update tests
- [ ] Fix progress tracking tests
- [ ] Fix error handling tests
- [ ] Fix job cleanup tests

### Phase 6: Fix Omniscient Tests (3 failures)
- [ ] Fix arXiv search integration tests
- [ ] Fix PDF parsing edge case tests
- [ ] Fix embedding generation error tests

### Phase 7: Fix Remaining Tests (11 failures)
- [ ] Identify and fix miscellaneous test failures

### Phase 8: Increase Coverage
- [ ] Write new tests for uncovered code paths
- [ ] Target: >95% overall coverage

### Phase 9: Validation & Documentation
- [ ] Run `pnpm test` - verify >290 tests passing
- [ ] Generate README-V20.0.md with test metrics
- [ ] Generate AWAKE-V10.md with certification upgrade
- [ ] Save checkpoint: v20.0

**Success Criteria**: pnpm test shows >95% passing (290+/307 tests)

---

## MOTHER v21.0: A Engenheira Semântica

**Hipótese**: Semantic Cache reduz custo/latência; Factual Grounding elimina alucinações.

### Phase 1: Integrate Semantic Cache
- [ ] Refactor core.ts to add semantic cache layer
- [ ] After L1 (Redis) + L2 (DB) miss, call semanticCacheService.findSimilar()
- [ ] On cache hit (>0.95 similarity): return cached response + log to Langfuse
- [ ] On cache miss: proceed to LLM + save response with embedding to cache
- [ ] Add cache hit/miss metrics to Langfuse

### Phase 2: Implement Factual Grounding
- [ ] Modify prompts to return JSON: {response_text, citations: [{claim, source}]}
- [ ] Create post-processing verification step
- [ ] Use fast LLM to verify each citation supports the claim
- [ ] Mark unverified claims as [unverified] or remove them
- [ ] Add grounding metrics to Langfuse

### Phase 3: Validation (Semantic Cache)
- [ ] Execute 100 queries with semantic variations
- [ ] Measure cache hit rate via Langfuse
- [ ] Target: >20% hit rate

### Phase 4: Validation (Factual Grounding)
- [ ] Execute 20 factual queries
- [ ] Manually verify citation accuracy
- [ ] Measure hallucination reduction
- [ ] Target: >90% reduction in hallucinations

### Phase 5: Documentation
- [ ] Generate README-V21.0.md with cache + grounding architecture
- [ ] Generate AWAKE-V11.md with cache hit rate + hallucination metrics
- [ ] Save checkpoint: v21.0

**Success Criteria**: Cache hit rate >20%; Hallucination reduction >90%

---

## MOTHER v22.0: A Agente Autônoma

**Hipótese**: ReAct + Episodic Memory = agente proativo e contextual.

### Phase 1: Implement ReAct Loop
- [ ] Refactor core.ts to implement ReAct loop
- [ ] LLM returns JSON: {thought, action: {type: 'call_tool'|'final_answer', ...}}
- [ ] Implement action dispatcher (call_tool vs final_answer)
- [ ] Add max_iterations limit (10) to prevent infinite loops

### Phase 2: Implement Tool Kit
- [ ] Create tool interface: {name, description, parameters, execute()}
- [ ] Implement search_web tool (using search API)
- [ ] Implement get_stock_price tool (using finance API)
- [ ] Implement execute_python_code tool (sandboxed execution)
- [ ] Register tools in ReAct loop

### Phase 3: Implement Episodic Memory
- [ ] Create sessions table: {id, userId, createdAt, lastActiveAt}
- [ ] Create session_messages table: {id, sessionId, role, content, timestamp}
- [ ] On new query: retrieve session history (last 10 messages)
- [ ] Use LLM to summarize older messages (>10)
- [ ] Inject summary + recent messages into prompt

### Phase 4: Validation (Agency Test)
- [ ] Test: "Search Google stock price, calculate YTD % change, summarize recent news"
- [ ] Verify MOTHER uses search_web + get_stock_price tools
- [ ] Verify final answer contains all requested information
- [ ] Verify reasoning steps logged to Langfuse

### Phase 5: Validation (Memory Test)
- [ ] Session 1: "My favorite color is blue"
- [ ] Session 1: "What's my favorite color?" → Verify "blue"
- [ ] Session 2 (same user): "Do you remember my favorite color?" → Verify "blue"

### Phase 6: Documentation
- [ ] Generate README-V22.0.md with full agent architecture
- [ ] Generate AWAKE-V12.md (FINAL) with agency + memory test results
- [ ] Save checkpoint: v22.0
- [ ] Deploy to production

**Success Criteria**: MOTHER completes agency test + memory test successfully

---

## Final Delivery
- [ ] Push all changes to GitHub feature branch
- [ ] Create pull request with comprehensive description
- [ ] Generate final summary document
- [ ] Deliver to user with all checkpoints
