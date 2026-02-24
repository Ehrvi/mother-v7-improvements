# State-of-the-Art: Quality Assessment & Semantic Similarity

## Overview

LLM evaluation methods fall into two main categories:
1. **Reference-based:** Compare outputs to ground truth
2. **Reference-free:** Evaluate outputs directly

## Reference-Based Evaluation Methods

### 1. Exact Matching
- **Use case:** Single correct answer (code generation, structured data)
- **Pros:** Simple, deterministic, fast
- **Cons:** Fails with paraphrasing, synonyms
- **Example:** String comparison, JSON key validation

### 2. Word Overlap Metrics

**BLEU (Bilingual Evaluation Understudy):**
- Measures n-gram overlap between candidate and reference
- Originally for machine translation
- **Problem:** Ignores semantics, only lexical matching

**ROUGE (Recall-Oriented Understudy for Gisting Evaluation):**
- Focuses on recall (how much of reference appears in candidate)
- Common for summarization
- **Variants:** ROUGE-N (n-grams), ROUGE-L (longest common subsequence)

### 3. Semantic Similarity (State-of-the-Art)

**Sentence-BERT (SBERT) - 22,855 citations (2019):**
- **Breakthrough:** Siamese network architecture for sentence embeddings
- **Method:** Mean pooling of BERT token embeddings
- **Similarity:** Cosine similarity between sentence vectors
- **Performance:** 10x faster than BERT cross-encoder
- **Use case:** Semantic textual similarity, clustering, information retrieval

**Key Innovation:**
```python
# Traditional BERT (slow)
similarity = bert_model([sentence1, sentence2])  # Cross-encoder

# Sentence-BERT (fast)
emb1 = sbert_model(sentence1)
emb2 = sbert_model(sentence2)
similarity = cosine_similarity(emb1, emb2)  # Independent encoding
```

**BERTScore (2019):**
- Token-level semantic similarity using BERT embeddings
- Computes precision, recall, F1 between tokens
- **Advantage:** Captures semantic meaning, not just lexical overlap
- **Use case:** Machine translation, text generation evaluation

**SemScore (2024):**
- Evaluates LLMs by semantic meaning of answers
- Uses sentence transformers for embeddings
- **Method:** Cosine similarity with threshold-based scoring
- **Advantage:** Handles paraphrasing, synonyms

### 4. Cosine Similarity Thresholds

**Industry Standards:**
- **< 0.5:** Low similarity (different topics)
- **0.5-0.7:** Moderate similarity (related but different)
- **0.7-0.85:** High similarity (same meaning, different wording)
- **> 0.85:** Very high similarity (near-identical meaning)

**MOTHER's Thresholds:**
- < 0.5: 60/100 score
- 0.5-0.7: 80/100
- 0.7-0.85: 90/100
- > 0.85: 100/100

**Comparison:** MOTHER's thresholds align with industry standards ✅

---

## Reference-Free Evaluation Methods

### 1. Proxy Metrics
- **Text statistics:** Length, readability scores, keyword presence
- **Regular expressions:** Pattern matching for specific formats
- **Programmatic validation:** Code execution, JSON parsing

### 2. LLM-as-a-Judge (Most Popular)

**Method:**
- Prompt an LLM to evaluate outputs based on criteria
- Can assess: helpfulness, relevance, tone, safety, coherence

**Advantages:**
- Flexible, handles open-ended tasks
- Can evaluate conversation-level quality
- Scales well

**Challenges:**
- Requires careful prompt engineering
- Judge model bias
- Cost (using LLM for evaluation)

**Best Practices:**
- Use stronger model as judge (e.g., GPT-4 judging GPT-3.5)
- Provide clear evaluation criteria
- Use scoring rubrics (1-5 scale)
- Aggregate multiple judge evaluations

### 3. ML-Based Scoring
- **Learned metrics:** Train models to predict quality scores
- **Reward models:** Used in RLHF (Reinforcement Learning from Human Feedback)
- **Advantage:** Can capture nuanced quality aspects

---

## Task-Specific Metrics

### Classification Tasks
- **Accuracy:** Correct predictions / Total predictions
- **Precision:** True positives / (True positives + False positives)
- **Recall:** True positives / (True positives + False negatives)
- **F1-Score:** Harmonic mean of precision and recall

### Ranking Tasks (RAG)
- **MRR (Mean Reciprocal Rank):** Average of 1/rank of first relevant result
- **NDCG (Normalized Discounted Cumulative Gain):** Measures ranking quality
- **MAP (Mean Average Precision):** Average precision across queries

### Summarization
- **ROUGE:** Recall-oriented overlap
- **BERTScore:** Semantic similarity
- **Factuality:** Verify facts against source

### Code Generation
- **Pass@k:** Percentage of problems solved in k attempts
- **Execution success:** Does code run without errors?
- **Test coverage:** Does code pass unit tests?

---

## Composite Quality Metrics

**Multi-Dimensional Assessment:**
1. **Completeness:** Does response address all parts of query?
2. **Accuracy:** Is information factually correct?
3. **Relevance:** Is response on-topic and useful?
4. **Coherence:** Is response well-structured and logical?
5. **Safety:** Does response avoid harmful content?

**Weighted Scoring:**
```
Quality = w1*Completeness + w2*Accuracy + w3*Relevance + w4*Coherence + w5*Safety
```

**MOTHER's Approach:**
- Completeness: 25%
- Accuracy: 30%
- Relevance: 45%
- **Total:** 100%

**Observation:** MOTHER heavily weights relevance (45%), which is appropriate for conversational AI.

---

## State-of-the-Art Embeddings

### OpenAI Embeddings
- **text-embedding-3-small:** 1536 dimensions, $0.02/1M tokens
- **text-embedding-3-large:** 3072 dimensions, $0.13/1M tokens
- **Use case:** General-purpose semantic similarity

### Sentence Transformers
- **all-MiniLM-L6-v2:** 384 dimensions, fast, good quality
- **all-mpnet-base-v2:** 768 dimensions, best quality
- **multi-qa-mpnet-base-dot-v1:** Optimized for Q&A similarity

### Specialized Models
- **E5-large:** 1024 dimensions, state-of-the-art on MTEB benchmark
- **BGE-large:** 1024 dimensions, Chinese + English
- **Instructor:** Task-specific instructions for embeddings

---

## MOTHER Quality System Analysis

### Strengths:
✅ **Multi-dimensional:** Completeness, Accuracy, Relevance
✅ **Semantic similarity:** Uses embeddings (state-of-the-art)
✅ **Weighted scoring:** Prioritizes relevance (45%)
✅ **Threshold-based:** Clear quality tiers

### Gaps:
❌ **No coherence check:** Missing logical flow assessment
❌ **No safety check:** No harmful content detection
❌ **No factuality verification:** No fact-checking against sources
❌ **Single judge:** No ensemble evaluation
❌ **No confidence intervals:** No uncertainty quantification

### Opportunities:
1. **Add coherence metric:** Check logical flow, structure
2. **Add safety filter:** Detect harmful, biased content
3. **Implement fact-checking:** Verify claims against knowledge base
4. **Ensemble judges:** Multiple LLMs vote on quality
5. **Confidence scores:** Quantify uncertainty in quality assessment

---

## Implementation Recommendations

### Immediate (Phase 1):
1. **Add coherence check:** Assess logical flow and structure
2. **Add safety filter:** Detect harmful content
3. **Track confidence:** Add uncertainty to quality scores

### Medium-term (Phase 2):
1. **Implement ensemble judges:** Multiple models evaluate quality
2. **Add factuality check:** Verify claims against knowledge base
3. **A/B test thresholds:** Optimize semantic similarity cutoffs

### Long-term (Phase 3):
1. **Learn quality model:** Train ML model to predict quality
2. **Multi-lingual support:** Extend to non-English languages
3. **Domain-specific metrics:** Customize for medical, legal, etc.

---

## References

1. Sentence-BERT: https://aclanthology.org/D19-1410/
2. BERTScore: https://zhanghaolin66.medium.com/bertscore-explained-embeddings-and-semantic-evaluation-b0d80b9de8d5
3. SemScore: https://huggingface.co/blog/g-ronimo/semscore
4. Evidently AI Guide: https://www.evidentlyai.com/llm-guide/llm-evaluation-metrics
5. LaQual Framework: https://arxiv.org/abs/2508.18636
6. Sentence Transformers: https://sbert.net/
