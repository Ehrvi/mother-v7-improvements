# State-of-the-Art: Advanced Prompt Engineering

## Overview

Prompt engineering is the art and science of designing inputs to guide LLM behavior and improve output quality.

**Key principle:** The way you ask determines the quality of the answer.

---

## Core Techniques

### 1. Zero-Shot Prompting

**Definition:** Ask the model to perform a task without any examples.

**Example:**
```
Classify the sentiment of this text: "I love this product!"
```

**When to use:**
- Simple tasks
- Model has strong pre-training
- No examples available

**Limitations:**
- May fail on complex tasks
- Inconsistent outputs
- No guidance on format

---

### 2. Few-Shot Prompting

**Definition:** Provide a few examples before the actual task.

**Example:**
```
Classify sentiment:

Text: "This is amazing!" → Positive
Text: "I hate this." → Negative
Text: "It's okay." → Neutral

Text: "Best purchase ever!" → ?
```

**Output:** Positive

**Benefits:**
- Dramatically improves accuracy
- Easy to implement
- Guides output format

**Best practices:**
- 1-5 examples (more isn't always better)
- Diverse examples
- Clear formatting
- Relevant to target task

**Research:** Few-shot prompting is one of the most effective techniques (Reddit consensus, 2025)

---

### 3. Chain-of-Thought (CoT) Prompting

**Breakthrough paper:** Wei et al. (2022), 13,000+ citations

**Definition:** Prompt the model to show intermediate reasoning steps.

**Example:**

**Without CoT:**
```
Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls. 
   Each can has 3 tennis balls. How many tennis balls does he have now?
A: 11
```
(Incorrect!)

**With CoT:**
```
Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls. 
   Each can has 3 tennis balls. How many tennis balls does he have now?

A: Let's think step by step.
   Roger started with 5 balls.
   2 cans × 3 balls per can = 6 balls.
   5 + 6 = 11 balls.
   The answer is 11.
```
(Correct!)

**Key insight:** Showing reasoning steps improves accuracy on complex tasks.

**When to use:**
- Math problems
- Logic puzzles
- Multi-step reasoning
- Complex decision-making

---

### 4. Zero-Shot CoT

**Breakthrough:** Kojima et al. (2022)

**Discovery:** Just add "Let's think step by step" to any prompt!

**Example:**
```
Q: If John has 3 apples and gives 2 to Mary, how many does he have?

Let's think step by step.
```

**Result:** Model automatically generates reasoning steps.

**Impact:** Emergent ability in large models (>100B parameters)

**Why it works:**
- "Let's think step by step" appears in training data
- Associated with correct reasoning patterns
- Triggers systematic thinking

---

### 5. Auto-CoT (Automatic Chain-of-Thought)

**Paper:** Zhang et al. (2022)

**Problem:** Manually creating CoT examples is tedious.

**Solution:** Automatically generate reasoning chains.

**Process:**
1. **Cluster questions** by similarity
2. **Sample representative** from each cluster
3. **Generate reasoning** with Zero-Shot CoT
4. **Use as few-shot examples**

**Benefits:**
- No manual effort
- Diverse demonstrations
- Scalable

---

### 6. Self-Consistency

**Paper:** Wang et al. (2022)

**Idea:** Generate multiple reasoning paths, pick most consistent answer.

**Process:**
1. Sample multiple CoT responses (e.g., 5-10)
2. Extract final answers
3. Return majority vote

**Example:**
```
Q: What is 15% of 80?

Response 1: 15/100 × 80 = 12
Response 2: 0.15 × 80 = 12
Response 3: 80 × 0.15 = 12
Response 4: 15% = 0.15, 0.15 × 80 = 12
Response 5: 80/100 × 15 = 12

Majority: 12 (5/5) → Answer: 12
```

**Impact:** Significantly improves accuracy on reasoning tasks.

**Trade-off:** Higher cost (multiple generations)

---

### 7. ReAct (Reasoning + Acting)

**Paper:** Yao et al. (2022)

**Concept:** Interleave reasoning and actions.

**Format:**
```
Thought: I need to find the capital of France.
Action: Search[capital of France]
Observation: Paris is the capital of France.
Thought: Now I have the answer.
Answer: Paris
```

**Use cases:**
- Tool use (search, calculator, API calls)
- Multi-step tasks
- Interactive environments

**Benefits:**
- Combines thinking and doing
- Transparent decision-making
- Error recovery

---

### 8. Meta Prompting

**Definition:** Prompt about prompting.

**Example:**
```
You are an expert prompt engineer. Generate a prompt that will make an LLM 
write a professional email to a client about a project delay.
```

**Use cases:**
- Prompt optimization
- Automatic prompt generation
- Prompt refinement

---

### 9. Step-Back Prompting

**Paper:** Zheng et al. (2023)

**Idea:** Ask a high-level question first, then answer the specific question.

**Example:**

**Direct:**
```
Q: What is the boiling point of water at 2000m elevation?
A: [struggles]
```

**Step-Back:**
```
Q: What are the principles that determine boiling point?
A: Boiling point decreases with lower atmospheric pressure...

Q: What is the boiling point of water at 2000m elevation?
A: Approximately 93°C (based on pressure at 2000m)
```

**Benefit:** Retrieves relevant background knowledge first.

---

### 10. Self-Ask Decomposition

**Idea:** Break complex questions into sub-questions.

**Example:**
```
Q: Who was president when the iPhone was released?

Sub-Q1: When was the iPhone released?
A1: 2007

Sub-Q2: Who was president in 2007?
A2: George W. Bush

Final Answer: George W. Bush
```

**Use case:** Complex factual questions requiring multiple pieces of information.

---

### 11. Contextual Priming

**Definition:** Provide context before the task.

**Example:**
```
You are a medical expert with 20 years of experience in cardiology.
You always provide evidence-based answers and cite sources.

Q: What are the symptoms of a heart attack?
```

**Benefits:**
- Sets tone and style
- Defines expertise level
- Guides response format

---

## Advanced Techniques (2025+)

### 12. Tree of Thoughts (ToT)

**Paper:** Yao et al. (2023)

**Concept:** Explore multiple reasoning paths in a tree structure.

**Process:**
1. Generate multiple thoughts at each step
2. Evaluate each thought
3. Explore most promising branches
4. Backtrack if needed

**Use case:** Complex problem-solving (game playing, creative writing)

---

### 13. Graph of Thoughts (GoT)

**Extension of ToT:** Thoughts can merge and split (graph vs tree)

**Benefit:** More flexible reasoning structure

---

### 14. Skeleton-of-Thought

**Idea:** Generate outline first, then fill in details.

**Process:**
1. Create high-level structure
2. Expand each section
3. Combine into final response

**Benefit:** Better organization, coherence

---

### 15. Contrastive Prompting

**Technique:** Show what TO do and what NOT to do.

**Example:**
```
Good: "The experiment yielded significant results (p < 0.05)."
Bad: "The experiment was amazing and proved everything!"

Now write: [task]
```

**Benefit:** Clarifies expectations through contrast.

---

## Prompt Engineering Best Practices

### Structure

**1. Role/Persona:**
```
You are [role] with [expertise].
```

**2. Context:**
```
Given [background information]...
```

**3. Task:**
```
Your task is to [specific action].
```

**4. Format:**
```
Respond in [format] with [structure].
```

**5. Constraints:**
```
Do not [restrictions]. Always [requirements].
```

**6. Examples (if few-shot):**
```
Example 1: ...
Example 2: ...
```

**7. Query:**
```
[Actual question/task]
```

---

### Clarity

- **Be specific:** "Write 3 paragraphs" vs "Write a short text"
- **Use delimiters:** ```triple backticks```, ###, ---
- **Define terms:** Clarify ambiguous words
- **Provide examples:** Show desired output

---

### Iteration

1. Start simple
2. Test output
3. Identify issues
4. Refine prompt
5. Repeat

**Tip:** Keep a prompt library of what works.

---

## MOTHER System Prompt Analysis

### Current Prompt (from code):
```typescript
const systemPrompt = `You are MOTHER v7.0 (Multi-Operational Tiered Hierarchical Execution & Routing) - 
an advanced AI system with 7-layer architecture and 83% cost reduction.

Your capabilities:
- Multi-tier LLM routing (gpt-4o-mini, gpt-4o, gpt-4)
- Guardian quality system (90+ quality threshold)
- Continuous learning from interactions

Response protocol:
1. Analyze query complexity
2. Select appropriate tier
3. Generate response
4. Validate quality
5. Learn from feedback

Always:
- Be helpful and accurate
- Cite sources when possible
- Admit limitations
- Prioritize user safety`;
```

### Strengths:
✅ **Clear identity:** MOTHER v7.0 with specific capabilities
✅ **Response protocol:** Step-by-step process
✅ **Guidelines:** "Always" section

### Gaps:
❌ **No examples:** Missing few-shot demonstrations
❌ **No CoT trigger:** Doesn't encourage reasoning
❌ **Vague "helpful":** Not specific enough
❌ **No format guidance:** Doesn't specify structure
❌ **No domain context:** Generic, not specialized

### Improved Prompt:

```typescript
const systemPrompt = `You are MOTHER v7.0 (Multi-Operational Tiered Hierarchical Execution & Routing) - 
an advanced AI assistant with 7-layer architecture optimized for quality and cost efficiency.

## Core Identity
- Helpful, accurate, and transparent
- Evidence-based responses with sources
- Admits limitations and uncertainties
- Prioritizes user safety and well-being

## Response Protocol
For every query, follow these steps:

1. **Understand:** Clarify the user's intent and requirements
2. **Analyze:** Assess complexity and required expertise
3. **Reason:** Think through the problem step-by-step (show your work for complex queries)
4. **Respond:** Provide clear, structured answer
5. **Validate:** Ensure accuracy and relevance
6. **Learn:** Store patterns for future improvement

## Response Format
- **Direct answers** for simple questions
- **Step-by-step reasoning** for complex problems
- **Structured lists** for multiple items
- **Sources/citations** for factual claims
- **Disclaimers** when uncertain or outside expertise

## Examples

Example 1 - Simple Query:
User: "What is 2+2?"
MOTHER: "2+2 = 4"

Example 2 - Complex Query:
User: "How do I calculate compound interest?"
MOTHER: "Let me break this down step by step:

1. **Formula:** A = P(1 + r/n)^(nt)
   - A = final amount
   - P = principal
   - r = annual rate
   - n = compounds per year
   - t = years

2. **Example:** $1000 at 5% annual, compounded monthly for 2 years
   - A = 1000(1 + 0.05/12)^(12×2)
   - A = 1000(1.00417)^24
   - A = $1,104.94

3. **Result:** You earn $104.94 in interest.

Source: Standard financial mathematics"

Example 3 - Limitation:
User: "Diagnose my symptoms"
MOTHER: "I cannot provide medical diagnoses. I'm an AI assistant, not a licensed healthcare professional.

However, I can:
- Provide general health information
- Suggest when to seek medical care
- Help you prepare questions for your doctor

For your symptoms, please consult a qualified healthcare provider who can properly examine you and provide an accurate diagnosis."

## Constraints
- **Never** provide medical, legal, or financial advice requiring professional licensure
- **Never** generate harmful, illegal, or unethical content
- **Always** cite sources for factual claims
- **Always** show reasoning for complex problems
- **Always** maintain user privacy and confidentiality

## Learning Mode
After each interaction:
- Identify patterns in user queries
- Note successful response strategies
- Flag areas for improvement
- Update knowledge base with new information

You are designed for continuous improvement through interaction.`;
```

### Improvements:
✅ **Few-shot examples:** 3 diverse scenarios
✅ **CoT guidance:** "show your work for complex queries"
✅ **Clear format:** Specific structure for different query types
✅ **Explicit constraints:** What NOT to do
✅ **Reasoning protocol:** Step-by-step thinking
✅ **Source attribution:** Always cite
✅ **Limitations:** Clear boundaries

---

## Implementation Recommendations

### Immediate (Phase 1):
1. **Update system prompt** with improved version
2. **Add few-shot examples** for common query types
3. **Enable CoT** for complexity > 0.3

### Medium-term (Phase 2):
1. **Implement self-consistency** for critical queries
2. **Add ReAct** for tool use (search, calculator)
3. **Dynamic examples** based on query type

### Long-term (Phase 3):
1. **Auto-CoT** for generating demonstrations
2. **Tree of Thoughts** for complex problem-solving
3. **Meta-prompting** for prompt optimization

---

## References

1. Chain-of-Thought: https://arxiv.org/abs/2201.11903
2. Zero-Shot CoT: https://arxiv.org/abs/2205.11916
3. Auto-CoT: https://arxiv.org/abs/2210.03493
4. Self-Consistency: https://arxiv.org/abs/2203.11171
5. ReAct: https://arxiv.org/abs/2210.03629
6. Tree of Thoughts: https://arxiv.org/abs/2305.10601
7. Prompting Guide: https://www.promptingguide.ai/
8. Advanced Techniques 2025: https://www.reddit.com/r/PromptEngineering/comments/1k7jrt7/
