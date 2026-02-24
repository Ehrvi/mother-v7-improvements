# 🔬 Scientific Analysis: LLM API Compatibility Problem

## Phase 1: Problem Definition

**Current Error:**
```
"Unrecognized request argument supplied: thinking"
type: "invalid_request_error"
```

**Root Cause:** Code sends Gemini-specific parameter `thinking` to OpenAI API which doesn't support it.

**Critical Question:** How to make the LLM invocation layer work universally with any provider (OpenAI, Gemini, Anthropic, etc.)?

---

## Phase 2: Data Collection

### Evidence Gathered:

1. **Current Code (llm.ts:300-303):**
```typescript
payload.max_tokens = 32768
payload.thinking = {
  "budget_tokens": 128
}
```

2. **API Provider Support Matrix:**

| Parameter | OpenAI | Gemini | Anthropic | Notes |
|-----------|--------|--------|-----------|-------|
| `model` | ✅ | ✅ | ✅ | Universal |
| `messages` | ✅ | ✅ | ✅ | Universal |
| `max_tokens` | ✅ | ✅ | ✅ | Universal |
| `thinking` | ❌ | ✅ | ❌ | Gemini-only |
| `temperature` | ✅ | ✅ | ✅ | Universal |
| `tools` | ✅ | ✅ | ✅ | Universal |

3. **Current Configuration:**
- `BUILT_IN_FORGE_API_URL`: https://api.openai.com
- `BUILT_IN_FORGE_API_KEY`: OpenAI key
- Default model: gpt-4o (OpenAI)

4. **Architecture Context:**
- MOTHER uses 3-tier routing (gpt-4o-mini, gpt-4o, gpt-4)
- All tiers use OpenAI models
- No Gemini models in use

---

## Phase 3: Hypothesis Formation

### Hypothesis 1: Simply remove `thinking` parameter ✅ SIMPLE BUT FRAGILE
- **Evidence:** Only Gemini needs it, we're using OpenAI
- **Mechanism:** Delete lines 301-303
- **Risk:** Code was written for Gemini, might break if switched back
- **Test:** Remove and redeploy

### Hypothesis 2: Provider-aware parameter filtering ✅ ROBUST
- **Evidence:** Different providers support different parameters
- **Mechanism:** Detect provider from URL/model, filter params accordingly
- **Risk:** More complex, but future-proof
- **Test:** Create provider detection + whitelist system

### Hypothesis 3: Use only universal parameters ✅ SAFEST
- **Evidence:** Core parameters work everywhere
- **Mechanism:** Remove all provider-specific params
- **Risk:** Lose advanced features
- **Test:** Strip to minimal payload

### Hypothesis 4: Conditional parameter injection ✅ FLEXIBLE
- **Evidence:** Can detect provider at runtime
- **Mechanism:** Add params only if provider supports them
- **Risk:** Need accurate provider detection
- **Test:** URL-based provider detection

---

## Phase 4: Root Cause Analysis

**PRIMARY ROOT CAUSE:**
The code was originally written for Gemini API but is now being used with OpenAI API without proper parameter adaptation.

**SECONDARY ISSUES:**
1. Hardcoded provider-specific parameters
2. No provider detection mechanism
3. No parameter validation before API call
4. Mixed provider assumptions in codebase

**SYSTEMIC PROBLEM:**
The LLM abstraction layer (`llm.ts`) doesn't abstract away provider differences, making it fragile when switching providers.

---

## Phase 5: Solution Design

### Solution A: Quick Fix - Remove Gemini-specific params ⚡ IMMEDIATE
```typescript
// Remove lines 301-303
payload.max_tokens = 32768
// DELETE: payload.thinking = { "budget_tokens": 128 }
```
**Pros:** Works immediately, simple
**Cons:** Not future-proof, breaks if we add Gemini later

### Solution B: Provider Detection System 🛡️ ROBUST (RECOMMENDED)
```typescript
// Detect provider from API URL
function detectProvider(apiUrl: string): 'openai' | 'gemini' | 'anthropic' | 'unknown' {
  if (apiUrl.includes('openai.com') || apiUrl.includes('forge.manus.im')) return 'openai';
  if (apiUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (apiUrl.includes('anthropic.com')) return 'anthropic';
  return 'unknown';
}

// Provider-specific parameter whitelists
const PROVIDER_PARAMS = {
  openai: ['model', 'messages', 'max_tokens', 'temperature', 'tools', 'tool_choice', 'response_format'],
  gemini: ['model', 'messages', 'max_tokens', 'temperature', 'tools', 'thinking'],
  anthropic: ['model', 'messages', 'max_tokens', 'temperature', 'tools'],
  unknown: ['model', 'messages', 'max_tokens', 'temperature'] // Safe defaults
};

// Filter payload to only include supported params
function filterPayload(payload: any, provider: string): any {
  const allowedParams = PROVIDER_PARAMS[provider] || PROVIDER_PARAMS.unknown;
  return Object.keys(payload)
    .filter(key => allowedParams.includes(key))
    .reduce((obj, key) => ({ ...obj, [key]: payload[key] }), {});
}
```
**Pros:** Works with any provider, future-proof, maintainable
**Cons:** More code, needs testing

### Solution C: Environment-based configuration 🔧 EXPLICIT
```typescript
// Add to env.ts
forgeProvider: process.env.LLM_PROVIDER ?? 'openai'

// Use in llm.ts
if (ENV.forgeProvider === 'gemini') {
  payload.thinking = { budget_tokens: 128 };
}
```
**Pros:** Explicit control, easy to understand
**Cons:** Requires env var management

---

## Phase 6: Implementation Plan

**CHOSEN SOLUTION: Hybrid A + B**

### Step 1: Immediate Fix (Solution A)
Remove `thinking` parameter to unblock current deployment

### Step 2: Robust Fix (Solution B)
Implement provider detection and parameter filtering for long-term stability

### Implementation:

```typescript
// 1. Add provider detection
const detectProvider = (apiUrl: string): 'openai' | 'gemini' | 'unknown' => {
  if (apiUrl.includes('openai.com') || apiUrl.includes('forge.manus.im')) return 'openai';
  if (apiUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  return 'unknown';
};

// 2. Define parameter compatibility
const SUPPORTED_PARAMS = {
  openai: new Set(['model', 'messages', 'max_tokens', 'temperature', 'tools', 'tool_choice', 'response_format']),
  gemini: new Set(['model', 'messages', 'max_tokens', 'temperature', 'tools', 'thinking']),
  unknown: new Set(['model', 'messages', 'max_tokens', 'temperature'])
};

// 3. Filter payload before sending
const provider = detectProvider(resolveApiUrl());
const allowedParams = SUPPORTED_PARAMS[provider];

// Build payload with only supported params
const payload: Record<string, unknown> = {
  model: params.model || "gpt-4o",
  messages: messages.map(normalizeMessage),
};

// Only add max_tokens if supported
if (allowedParams.has('max_tokens')) {
  payload.max_tokens = 32768;
}

// Only add thinking if supported (Gemini only)
if (allowedParams.has('thinking')) {
  payload.thinking = { budget_tokens: 128 };
}

// ... rest of parameters with same pattern
```

---

## Phase 7: Testing & Validation

### Test 1: OpenAI API (current setup)
```bash
node test-mother-trpc-format.mjs
```
Expected: Success, no "thinking" parameter error

### Test 2: Verify payload structure
```bash
# Add logging to llm.ts before fetch
console.log('Provider:', provider);
console.log('Payload:', JSON.stringify(payload, null, 2));
```
Expected: Only OpenAI-compatible parameters

### Test 3: MOTHER self-audit
```bash
node test-mother-trpc-format.mjs
```
Expected: Full audit response from MOTHER

### Test 4: Different query complexities
- Simple: "What is 2+2?"
- Medium: "Explain how neural networks work"
- Complex: "Design a distributed system architecture"

Expected: Correct tier routing, all succeed

---

## Phase 8: Learning & Documentation

### Key Learnings:

1. **Provider abstraction is critical:** Never hardcode provider-specific parameters
2. **Runtime detection > compile-time assumptions:** Detect provider from actual API URL
3. **Whitelist approach > blacklist:** Explicitly allow known params, reject unknown
4. **Fail-safe defaults:** Unknown providers get minimal safe parameter set

### Best Practices:

1. ✅ Always detect provider from runtime configuration (URL/env)
2. ✅ Use parameter whitelists, not hardcoded params
3. ✅ Log provider detection and filtered params for debugging
4. ✅ Test with multiple providers if possible
5. ✅ Document which parameters are provider-specific

### Academic Reference:

This follows the **Adapter Pattern** (Gang of Four) and **Strategy Pattern** for runtime provider selection, ensuring the system remains flexible and maintainable as new LLM providers emerge.

---

## Status: READY FOR IMPLEMENTATION

**Action Items:**
1. ✅ Remove `thinking` parameter (immediate fix)
2. ✅ Implement provider detection function
3. ✅ Create parameter whitelist system
4. ✅ Refactor payload building to use whitelist
5. ✅ Add logging for debugging
6. ✅ Test with OpenAI
7. ✅ Deploy and verify MOTHER self-audit works

**Expected Outcome:**
- ✅ No more "unrecognized parameter" errors
- ✅ Works with OpenAI, Gemini, or any future provider
- ✅ Easy to add new providers
- ✅ Self-documenting code
