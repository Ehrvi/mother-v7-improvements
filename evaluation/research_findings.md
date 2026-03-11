# Research Findings: State of the Art — LLM & UI/UX Evaluation

## 1. LLM QUALITY EVALUATION FRAMEWORKS

### 1.1 HELM (Holistic Evaluation of Language Models)
- **Source:** Liang et al., arXiv:2211.09110, TMLR 2023
- **7 Core Metrics:** accuracy, calibration, robustness, fairness, bias, toxicity, efficiency
- **16 Core Scenarios** + 26 targeted scenarios = 42 total
- **Multi-metric approach:** ensures metrics beyond accuracy are measured
- **Key finding:** Prior to HELM, models evaluated on avg 17.9% of scenarios; HELM achieves 96%

### 1.2 MT-Bench (Multi-Turn Benchmark)
- **Source:** Zheng et al., arXiv:2306.05685, NeurIPS 2023
- **8 Categories:** Writing, Roleplay, Reasoning, Math, Coding, Extraction, STEM, Humanities
- **80 high-quality multi-turn questions** (10 per category)
- **LLM-as-Judge:** GPT-4 achieves >80% agreement with human preferences
- **Biases identified:** position bias, verbosity bias, self-enhancement bias
- **Scoring:** 1-10 scale per turn, averaged across turns

### 1.3 G-Eval (NLG Evaluation)
- **Source:** Liu et al., arXiv:2303.16634, EMNLP 2023
- **Method:** LLM + Chain-of-Thought + form-filling paradigm
- **Dimensions:** Coherence, Consistency, Fluency, Relevance (for summarization/dialogue)
- **Spearman correlation:** 0.514 with human on summarization (outperforms all previous)
- **Bias:** LLM-based evaluators may favor LLM-generated texts

### 1.4 RAGAS (RAG Assessment)
- **Source:** Es et al., arXiv:2309.15217, EACL 2024
- **RAG-specific metrics (reference-free):**
  - Faithfulness: % of claims in answer supported by context
  - Answer Relevancy: how well answer addresses the question
  - Context Precision: % of relevant context retrieved
  - Context Recall: % of ground truth covered by context
  - Context Relevancy: relevance of retrieved context to query

### 1.5 FActScore (Factual Precision)
- **Source:** Min et al., arXiv:2305.14251, EMNLP 2023
- **Method:** Breaks generation into atomic facts, computes % supported by knowledge source
- **Finding:** ChatGPT achieves only 58% factual precision on biographies
- **Automated version:** <2% error rate vs human evaluation

### 1.6 AlpacaEval
- **Source:** tatsu-lab/alpaca_eval (GitHub)
- **Method:** LLM-based auto-annotator compares model vs reference (GPT-4-turbo)
- **Metric:** Win Rate (WR) + Length-Controlled Win Rate (LC-WR) to reduce verbosity bias
- **Validated:** Against 20K human annotations

### 1.7 WildBench
- **Source:** Lin et al., arXiv:2406.04770, ICLR 2025
- **Method:** Real-world user queries from wild, chain of evaluation questions
- **Advantage:** Challenging tasks, not cherry-picked

### 1.8 DeepEval Metrics (Comprehensive)
- **Source:** confident-ai.com/deepeval
- **Categories:**
  - RAG: Faithfulness, Answer Relevancy, Contextual Precision/Recall/Relevancy
  - Agent: Task Completion, Tool Correctness, Plan Quality, Plan Adherence, Step Efficiency
  - Multi-Turn: Turn Faithfulness, Turn Relevancy, Turn Contextual Precision/Recall
  - Foundational: Hallucination, Toxicity, Bias
  - Use-case: Helpfulness, Prompt Alignment, Summarization

### 1.9 BERTScore
- **Source:** Zhang et al., arXiv:1904.09675, ICLR 2020
- **Method:** Token-level similarity using contextual BERT embeddings
- **Metrics:** Precision, Recall, F1 (token-level)
- **Advantage:** Correlates better with human judgment than BLEU/ROUGE

### 1.10 ROUGE (Reference-based)
- **Source:** Lin, 2004
- **Variants:** ROUGE-1 (unigram), ROUGE-2 (bigram), ROUGE-L (LCS)
- **Limitation:** Low correlation with human judgment for creative/diverse tasks

---

## 2. UI/UX EVALUATION INSTRUMENTS

### 2.1 SUS (System Usability Scale)
- **Source:** Brooke, 1996 (industry standard)
- **Format:** 10 items, 5-point Likert scale
- **Score range:** 0-100 (>68 = above average; >80 = excellent)
- **Validated for chatbots:** ChatGPT SUS score ~75.34 (Thunström et al., 2024)
- **Adaptation:** Items adapted for conversational AI context

### 2.2 UMUX / UMUX-Lite
- **Source:** Finstad, 2010 (dl.acm.org/doi/10.1016/j.intcom.2010.04.004)
- **Format:** 4 items (UMUX) or 2 items (UMUX-Lite), 7-point Likert scale
- **Advantage:** Shorter than SUS, ISO 9241-11 aligned
- **Correlation with SUS:** r=0.96

### 2.3 BUS-15 (BOT Usability Scale)
- **Source:** Borsci et al., 2022 (Springer, doi:10.1007/s00779-021-01582-9)
- **Format:** 15 items, 5 factors (reliability α=0.76-0.87)
- **Factors:** Efficiency, Effectiveness, Satisfaction, Learnability, Accessibility
- **Specific to:** AI-based conversational agents

### 2.4 NASA-TLX (Task Load Index)
- **Source:** Hart & Staveland, 1988
- **6 Subscales:** Mental Demand, Physical Demand, Temporal Demand, Performance, Effort, Frustration
- **Application:** Cognitive load during chatbot interaction
- **Finding:** Chatbot users experience less cognitive load than software-only users (arXiv:2111.01400)

### 2.5 TAM (Technology Acceptance Model)
- **Source:** Davis, 1989
- **Constructs:** Perceived Usefulness (PU), Perceived Ease of Use (PEOU)
- **Application:** User acceptance of AI assistants

---

## 3. PERFORMANCE/LATENCY METRICS

### 3.1 TTFT (Time to First Token)
- **Definition:** Time from request submission to first token received
- **Threshold:** <2s considered acceptable for interactive use (MOTHER target: <2s ✅)
- **Benchmark:** GPT-4 TTFT ~0.5-0.6s; MOTHER ~15-30s P50 latency
- **Source:** NVIDIA NIM Benchmarking, arXiv:2407.07000 (Etalon)

### 3.2 TBT (Time Between Tokens) / TPOT (Time Per Output Token)
- **Definition:** Latency between consecutive generated tokens
- **Relevance:** Streaming experience quality

### 3.3 E2E Latency (P50, P95, P99)
- **Definition:** Total time from request to complete response
- **MOTHER current:** P50 ~15-30s (LFSA can take 180-300s for long-form)

### 3.4 Response Time Impact on Satisfaction
- **Finding:** Longer latency diminishes satisfaction; typing indicators mitigate negative effects
- **Source:** ResearchGate 2026 (Differential Effects of Chatbot Response Latency)
- **Threshold:** Users tolerate longer waits when task complexity is communicated

---

## 4. MOTHER-SPECIFIC EVALUATION DIMENSIONS

Based on MOTHER's architecture (v122.20):
- CRAG v2 (retrieval quality) → Context Precision/Recall
- RLVR + DPO (reasoning quality) → Correctness, Coherence
- LFSA (long-form generation) → Faithfulness, Completeness, Citation Rate
- Guardian (quality gate) → Pass Rate (G-Eval ≥80%)
- DGM (self-improvement) → DGM Success Rate
- SHMS (geotechnical monitoring) → Domain-specific accuracy
- Multi-language support → Language matching accuracy
- Citation Engine → Citation Rate (target: 100%)

---

## 5. KEY SCIENTIFIC REFERENCES

| Framework | Paper | Year | Citations |
|-----------|-------|------|-----------|
| HELM | Liang et al., arXiv:2211.09110 | 2022 | 2464+ |
| MT-Bench | Zheng et al., arXiv:2306.05685 | 2023 | NeurIPS |
| G-Eval | Liu et al., arXiv:2303.16634 | 2023 | 2332+ |
| RAGAS | Es et al., arXiv:2309.15217 | 2023 | 1160+ |
| FActScore | Min et al., arXiv:2305.14251 | 2023 | 1150+ |
| BERTScore | Zhang et al., arXiv:1904.09675 | 2019 | 10106+ |
| SUS | Brooke, 1996 | 1996 | Industry std |
| BUS-15 | Borsci et al., 2022 | 2022 | 301+ |
| NASA-TLX | Hart & Staveland, 1988 | 1988 | Industry std |
| Etalon | arXiv:2407.07000 | 2024 | - |
