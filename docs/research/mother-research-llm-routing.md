# State-of-the-Art: LLM Routing & Multi-Tier Optimization

## Key Papers & Systems

### 1. OmniRouter (2025) - Arxiv 2502.20576
**Breakthrough:** First globally-optimal routing framework

**Problem with existing routers:**
- Make per-query greedy choices
- Ignore global budget constraints
- Result in ineffective resource allocation

**OmniRouter Solution:**
- Models routing as **constrained optimization problem**
- Minimizes total cost while ensuring required performance
- Uses **Lagrangian dual decomposition** with adaptive multipliers
- Iteratively converges to globally optimal query-model allocation

**Components:**
1. **Hybrid Retrieval-Augmented Predictor:** Predicts LLM capabilities and costs
2. **Constrained Optimizer:** Cost-optimal assignments
3. **Adaptive Multipliers:** Dynamic balancing of latency vs quality

**Results:**
- **6.30% improvement** in response accuracy
- **10.15% reduction** in computational costs
- Adheres to heterogeneous capacity constraints

**URL:** https://arxiv.org/abs/2502.20576
**Code:** https://github.com/dongyuanjushi/OmniRouter

---

### 2. Cascade AI (Domino, 2024)
**Claim:** 60% cost savings without accuracy loss

**Approach:** Mixture of Agents (MoA)
- Route simple queries to smaller models
- Complex queries to larger models
- Automatic difficulty assessment

---

### 3. Google Speculative Cascades (2025)
**Innovation:** Hybrid approach combining:
- Speculative execution
- Model cascading
- Better cost-quality trade-offs
- Higher speed-ups

---

### 4. AdaptiveLLM (Arxiv 2506.10525, June 2025)
**Focus:** Coding tasks
- Dynamically selects optimal LLMs
- Automatically assesses task difficulty
- Task-specific optimization

---

## Key Concepts

### Static vs Dynamic Routing

**Static Routing:**
- Pre-defined rules
- Fixed model selection
- Simple but inflexible

**Dynamic Routing:**
- Real-time decision making
- Adapts to query characteristics
- More complex but optimal

### Multi-Tier Architecture

**Typical Tiers:**
1. **Tier 1:** Small, fast models (e.g., gpt-4o-mini, llama-3-8b)
2. **Tier 2:** Medium models (e.g., gpt-4o, claude-3.5-sonnet)
3. **Tier 3:** Large, powerful models (e.g., gpt-4, claude-opus)

**Trade-offs:**
- **Cost:** Tier 1 << Tier 2 < Tier 3
- **Quality:** Tier 1 < Tier 2 < Tier 3
- **Latency:** Tier 1 < Tier 2 < Tier 3

### Routing Strategies

1. **Complexity-Based:**
   - Assess query complexity
   - Route to appropriate tier
   - MOTHER uses this approach

2. **Confidence-Based:**
   - Small model attempts first
   - If confidence low, escalate
   - Cascade pattern

3. **Budget-Constrained:**
   - Global budget limit
   - Optimize allocation
   - OmniRouter approach

4. **Reinforcement Learning:**
   - Learn from outcomes
   - Adaptive strategy
   - Continuous improvement

---

## State-of-the-Art Metrics

### Cost Reduction
- **Best-in-class:** 60-83% (Cascade AI, MOTHER)
- **OmniRouter:** 10.15% over baselines
- **Typical:** 30-50%

### Quality Maintenance
- **Target:** 90+ quality score
- **OmniRouter:** +6.30% accuracy improvement
- **Challenge:** Maintaining quality while reducing cost

### Routing Accuracy
- **Critical metric:** Correct tier selection rate
- **Target:** 85%+ correct routing
- **Impact:** Wrong routing = wasted cost or poor quality

---

## MOTHER vs State-of-the-Art

### MOTHER Strengths:
✅ Multi-tier routing (3 tiers)
✅ Complexity assessment
✅ Quality scoring (Guardian)
✅ 83% cost reduction claimed

### MOTHER Gaps:
❌ **No global budget optimization** (like OmniRouter)
❌ **Greedy per-query routing** (not globally optimal)
❌ **No reinforcement learning** (static complexity algorithm)
❌ **No confidence-based escalation** (no cascade fallback)

### Opportunities:
1. **Implement OmniRouter-style constrained optimization**
2. **Add RL-based routing strategy learning**
3. **Implement cascade with confidence thresholds**
4. **Add A/B testing framework for routing strategies**

---

## Implementation Recommendations

### Immediate (Phase 1):
1. Add **confidence scores** to tier selection
2. Implement **cascade fallback** (if quality < threshold, escalate)
3. Track **routing accuracy** metric

### Medium-term (Phase 2):
1. Implement **global budget constraints**
2. Add **Lagrangian optimization** (OmniRouter approach)
3. Build **routing strategy A/B testing**

### Long-term (Phase 3):
1. **Reinforcement learning** for adaptive routing
2. **Multi-objective optimization** (cost, quality, latency)
3. **Contextual bandits** for exploration-exploitation

---

## References

1. OmniRouter: https://arxiv.org/abs/2502.20576
2. AWS Multi-LLM Routing: https://aws.amazon.com/blogs/machine-learning/multi-llm-routing-strategies-for-generative-ai-applications-on-aws/
3. Cascade AI: https://domino.ai/blog/full-llm-power-60-percent-cheaper
4. Google Speculative Cascades: https://research.google/blog/speculative-cascades-a-hybrid-approach-for-smarter-faster-llm-inference/
5. AdaptiveLLM: https://arxiv.org/abs/2506.10525
