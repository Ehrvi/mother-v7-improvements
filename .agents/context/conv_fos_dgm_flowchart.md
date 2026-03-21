# DGM Pipeline — Fluxograma Completo

## Visão Macro (7 Fases)

```mermaid
graph TD
    classDef phase fill:#1a1a2e,stroke:#e94560,color:#fff,stroke-width:2px
    classDef sub fill:#16213e,stroke:#0f3460,color:#eee
    classDef learn fill:#0a3d62,stroke:#38ada9,color:#fff
    classDef fail fill:#2c2c54,stroke:#ff6348,color:#fff

    O["🔍 PHASE 1: OBSERVE<br/>core-orchestrator.ts"]:::phase
    E["📊 PHASE 2: EVALUATE FITNESS<br/>dgm-agent.ts"]:::phase
    C["🏛️ PHASE 3: AI COUNCIL<br/>dgm-council.ts"]:::phase
    V["🛡️ PHASE 4: VALIDATE<br/>dgm-agent.ts"]:::phase
    X["⚡ PHASE 5: EXECUTE<br/>autonomous-update-job.ts"]:::phase
    T["🧪 PHASE 6: TEST & VERIFY<br/>autonomous-update-job.ts"]:::phase
    L["🧠 PHASE 7: LEARN<br/>learning + episodic-memory"]:::phase

    O --> E --> C --> V --> X --> T --> L
    L -.->|"feedback loop"| O
```

## Fluxograma Detalhado com Sub-Níveis

```mermaid
flowchart TD
    classDef phase fill:#1a1a2e,stroke:#e94560,color:#fff,stroke-width:2px
    classDef sub fill:#16213e,stroke:#0f3460,color:#eee,stroke-width:1px
    classDef learn fill:#0a3d62,stroke:#38ada9,color:#fff,stroke-width:1px
    classDef fail fill:#2c2c54,stroke:#ff6348,color:#fff,stroke-width:1px
    classDef gate fill:#2d132c,stroke:#ee5a24,color:#fff,stroke-width:2px

    %% PHASE 1: OBSERVE
    O["🔍 PHASE 1: OBSERVE"]:::phase
    O1["1.1 Intercept response<br/>layer7_dgmMetaObservation"]:::sub
    O2["1.2 Record observation<br/>quality, latency, tier, provider"]:::sub
    O3["1.3 observeAndLearn<br/>dgm-agent.ts"]:::sub
    O --> O1 --> O2 --> O3

    %% PHASE 2: EVALUATE
    E["📊 PHASE 2: EVALUATE"]:::phase
    O3 --> E
    E1["2.1 Compute composite fitness<br/>quality 40% + latency 30%<br/>+ reliability 20% + cache 10%"]:::sub
    E2["2.2 Compare to baseline<br/>fitnessScore vs baselineFitness"]:::sub
    E3["2.3 Persist to bd_central<br/>persistFitnessMetrics"]:::sub
    E4["2.4 Feed learning system<br/>Gap 2: learnFromEvolutionRun"]:::learn
    E --> E1 --> E2 --> E3 --> E4

    %% PHASE 3: AI COUNCIL (Delphi+MAD)
    C["🏛️ PHASE 3: AI COUNCIL"]:::phase
    E4 --> C

    subgraph DELPHI ["Phase 3A: DELPHI — Independent Proposals"]
        D1["DeepSeek R1<br/>deepseek-reasoner<br/>Architecture Expert"]:::sub
        D2["Claude Sonnet 4<br/>claude-sonnet-4-20250514<br/>Safety Analyst"]:::sub
        D3["Gemini 2.5 Pro<br/>gemini-2.5-pro<br/>Performance Optimizer"]:::sub
        D4["Mistral Large<br/>mistral-large-latest<br/>Alternative Perspective"]:::sub
        D5["MOTHER GPT-4o<br/>gpt-4o<br/>Self-Knowledge"]:::sub
    end

    subgraph MAD ["Phase 3B: MAD DEBATE — Cross-Critique"]
        M1["Each AI critiques<br/>all other proposals"]:::sub
        M2["Weighted scoring<br/>by member weight"]:::sub
    end

    subgraph VOTE ["Phase 3C: VOTE — Consensus"]
        V1["Rank by weighted score"]:::sub
        V2["Filter threshold ≥ 6/10"]:::sub
        V3["Top 3 proposals"]:::sub
    end

    C --> DELPHI --> MAD --> VOTE

    %% Graceful Fallback
    GF["⚠️ Graceful Fallback"]:::fail
    GF1["AI timeout/error → skip"]:::fail
    GF2["< 2 AIs → no debate"]:::fail
    GF3["0 AIs → hardcoded rules"]:::fail
    DELPHI -.-> GF
    GF --> GF1 & GF2 & GF3

    %% PHASE 4: VALIDATE (Safety Gate)
    SG["🛡️ PHASE 4: SAFETY GATE"]:::gate
    VOTE --> SG
    SG1["4.1 Check forbidden patterns<br/>rm -rf, DROP TABLE, eval, etc."]:::sub
    SG2["4.2 Check expectedFitnessGain ≥ 1%"]:::sub
    SG3["4.3 Human Approval Required<br/>status must be 'approved'"]:::sub
    SG --> SG1 --> SG2 --> SG3

    REJECT["❌ REJECTED<br/>addAuditEntry REJECT"]:::fail
    SG1 -->|"forbidden"| REJECT
    SG2 -->|"gain too low"| REJECT

    %% PHASE 5: EXECUTE (Autonomous Update)
    X["⚡ PHASE 5: EXECUTE"]:::phase
    SG3 -->|"approved"| X

    subgraph EXEC ["Autonomous Update Job"]
        X1["5.1 Fetch proposal from DB<br/>self_proposals table"]:::sub
        X2["5.2 Clone GitHub repo<br/>git clone + new branch"]:::sub
        X3["5.3 Recall past experiences<br/>Gap 3: getRecentEpisodicMemories"]:::learn
        X4["5.4 Parse or generate changes<br/>generateExecutableChanges + pastExperience"]:::sub
        X5["5.5 Apply changes<br/>applyChange: replace/append/create/insert"]:::sub
    end
    X --> EXEC

    %% PHASE 6: TEST & VERIFY
    T["🧪 PHASE 6: TEST"]:::phase
    EXEC --> T

    subgraph VERIFY ["Verification Pipeline"]
        T1["6.1 TypeScript compilation<br/>tsc --noEmit"]:::sub
        T2["6.2 SICA retry loop<br/>LLM fixes errors, up to 3 attempts"]:::sub
        T3["6.3 Regression test suite<br/>vitest run"]:::sub
        T4["6.4 Commit + push<br/>git commit + git push"]:::sub
        T5["6.5 Audit log entry<br/>AUTONOMOUS_UPDATE_EXECUTED"]:::sub
    end
    T --> VERIFY

    TSC_FAIL["❌ TSC Failed after 3 retries"]:::fail
    T1 -->|"errors"| T2
    T2 -->|"still errors"| TSC_FAIL

    %% PHASE 7: LEARN
    L["🧠 PHASE 7: LEARN"]:::phase
    VERIFY --> L

    subgraph LEARNING ["Learning Integration (4 Gaps)"]
        L1["7.1 Gap 1: storeEpisodicMemory<br/>SUCCESS or FAILURE<br/>Reflexion arXiv:2303.11366"]:::learn
        L2["7.2 Gap 2: learnFromEvolutionRun<br/>Fitness → Knowledge Base<br/>ClinicalReTrial arXiv:2601.00290"]:::learn
        L3["7.3 Gap 3: recallMemoryTool<br/>Past DGM experiences → LLM prompt<br/>A-MEM arXiv:2502.12110"]:::learn
        L4["7.4 Gap 4: storeAMemEntry<br/>Audit → Zettelkasten cross-linking<br/>Nested Learning NeurIPS 2025"]:::learn
    end
    L --> LEARNING

    TSC_FAIL --> L1
    REJECT -.->|"Gap 4"| L4

    %% Feedback Loop
    LEARNING -.->|"cumulativo"| O
```

## Tabela de Componentes

| Fase | Arquivo | Função Principal | Módulos de Learning |
|------|---------|-----------------|---------------------|
| 1. Observe | `core-orchestrator.ts` | `layer7_dgmMetaObservation` | — |
| 2. Evaluate | `dgm-agent.ts` | `evaluateFitness` | Gap 2: `learnFromEvolutionRun` |
| 3. Council | `dgm-council.ts` | `runCouncilSession` | — |
| 4. Validate | `dgm-agent.ts` | `validateProposal` | Gap 4: `storeAMemEntry` |
| 5. Execute | `autonomous-update-job.ts` | `executeAutonomousUpdate` | Gap 3: `getRecentEpisodicMemories` |
| 6. Test | `autonomous-update-job.ts` | tsc + vitest + SICA | — |
| 7. Learn | `episodic-memory.ts` / `learning.ts` | `storeEpisodicMemory` | Gap 1: Reflexion |
