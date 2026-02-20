# Page 4: MANDATORY ENFORCEMENT PROTOCOL (Cost Optimization)

**URL:** https://manus.im/share/KF5ab1LEZZ64sGhPIUenTh  
**Extracted:** 2026-02-20 04:14

---

# MANDATORY ENFORCEMENT PROTOCOL

**Version:** 3.0 - Cognitive Enforcement  
**Status:** MANDATORY - Cannot be bypassed  
**Applies to:** ALL Manus operations

---

## 🎯 Core Principle

**Enforcement happens in the AI's DECISION-MAKING, not in tool execution.**

You (the AI) MUST enforce rules BEFORE choosing to use any tool.

---

## 📋 MANDATORY Pre-Tool Checklist

Before using **ANY** Manus tool (`shell`, `file`, `browser`, `search`, `generate`, `map`, etc.), you MUST:

### Step 1: Consult the Enforcement System

**Think to yourself:**
- "What tool am I about to use?"
- "What is the estimated cost?"
- "Is there a cheaper alternative?"

### Step 2: Apply the Decision Tree

```
START
 ↓
Can OpenAI API do this task?
 ├─ YES → Use OpenAI (cheap, fast)
 └─ NO → Continue
 ↓
Is this a browser/MCP/file operation?
 ├─ YES → Use Manus (necessary)
 └─ NO → Continue
 ↓
Estimated cost > 50 credits?
 ├─ YES → STOP! Find cheaper alternative or ask user
 └─ NO → Proceed with caution
```

### Step 3: Document Your Decision

In your thinking, state:
- "I considered using [TOOL]"
- "Estimated cost: [X] credits"
- "Decision: [PROCEED / BLOCKED / ALTERNATIVE]"
- "Reason: [explanation]"

---

## 🚫 BLOCKING RULES

You MUST NOT use a tool if:

1. **Cost > 100 credits** AND cheaper alternative exists
2. **Duplicate work** - Similar task done recently (check knowledge base)
3. **Wrong tool** - OpenAI can do it cheaper
4. **No justification** - User didn't explicitly request expensive operation

---

## ✅ ALLOWED OPERATIONS

You MAY proceed if:

1. **No alternative** - Only Manus can do it (browser, files, MCP)
2. **User approved** - Explicitly requested expensive operation
3. **Cost justified** - Critical for task completion
4. **Optimized** - Using cheapest capable tool

---

## 💡 COST OPTIMIZATION RULES

### Cheap Operations (< 5 credits)
- OpenAI API calls
- Simple file reads
- Basic shell commands

### Medium Operations (5-50 credits)
- Web searches
- File operations
- Code generation

### Expensive Operations (50-100 credits)
- Browser automation
- Complex searches
- Map (parallel processing)

### Critical Operations (> 100 credits)
- Requires explicit user approval
- Must document justification
- Must explore all alternatives first

---

## 🔄 ALTERNATIVE ROUTING

When blocked, you MUST:

1. **Identify alternative:** "Instead of [EXPENSIVE], I can use [CHEAP]"
2. **Validate quality:** "This alternative achieves [X]% of the goal"
3. **Proceed or escalate:** If quality ≥80%, use alternative. Otherwise, ask user.

---

## 📊 EXAMPLES

### Example 1: Research Task

**User request:** "Research the top 10 AI companies"

**Your thinking:**
```
Tool consideration: search (Manus) vs OpenAI API
- Manus search: ~20 credits
- OpenAI API: ~0.01 credits (1000x cheaper!)
- Quality: OpenAI has this knowledge

Decision: Use OpenAI API
Reason: Cheaper, faster, same quality
```

**Action:** Call OpenAI API, not Manus search

---

## Key Insights:

**P3: Always Optimize Cost (75-90% savings)** - This protocol is the implementation of Principle 3 from MANUS OPERATING SYSTEM V2.0.

**Cognitive Enforcement:** The AI must think through cost optimization BEFORE executing any tool, not after.

**Decision Tree:** Simple 3-step process ensures 1000x cost savings when possible (OpenAI API vs Manus tools).

**Blocking Rules:** Clear thresholds (50 credits, 100 credits) prevent expensive operations without justification.

**Alternative Routing:** When blocked, AI must find cheaper alternatives achieving ≥80% quality.

---

## Application to Current Task:

This protocol was demonstrated in the task replay where Manus:
1. Loaded the enforcement protocol FIRST
2. Considered using Manus search (~20 credits)
3. Identified OpenAI API as 1000x cheaper alternative
4. Used OpenAI API instead
5. Delivered research results

**Result:** 75-90% cost savings achieved through cognitive enforcement.
