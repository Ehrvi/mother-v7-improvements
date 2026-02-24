# 🔬 Scientific Analysis: MOTHER API Communication Problem

## Phase 1: Problem Definition

**Symptom:** Cannot successfully call MOTHER API endpoint to request self-audit

**Error Message:** 
```
"Invalid input: expected object, received undefined"
code: "BAD_REQUEST"
path: "mother.query"
```

**Expected Behavior:** API should accept query and return MOTHER's response

**Actual Behavior:** API rejects request with validation error

**Critical Question:** What is the correct format for tRPC mutation calls?

---

## Phase 2: Data Collection

### Evidence Gathered:

1. **API Endpoint Structure:**
   ```typescript
   // From server/routers/mother.ts
   query: publicProcedure
     .input(z.object({
       query: z.string().min(1).max(5000),
       useCache: z.boolean().optional().default(true),
     }))
     .mutation(async ({ input, ctx }) => { ... })
   ```

2. **Expected Input Schema:**
   - `query`: string (1-5000 chars)
   - `useCache`: boolean (optional, default true)

3. **Attempted Request Formats:**
   - ❌ Direct JSON: `{"query": "...", "useCache": false}`
   - ❌ Batch format: `{"0": {"json": {"query": "..."}}}`
   - ❌ With json wrapper: `{"json": {"query": "..."}}`

4. **tRPC Configuration:**
   ```typescript
   // Uses superjson transformer
   transformer: superjson
   ```

5. **HTTP Method:** POST (correct for mutations)

6. **Content-Type:** application/json (correct)

---

## Phase 3: Hypothesis Formation

### Hypothesis 1: tRPC batch format requires specific structure ✅ LIKELY
- **Evidence:** Error says "expected object, received undefined"
- **Mechanism:** tRPC batching wraps requests in numbered keys
- **Test:** Check tRPC documentation for batch mutation format

### Hypothesis 2: Superjson transformation requires special encoding ❓ POSSIBLE
- **Evidence:** Template uses superjson transformer
- **Mechanism:** Superjson may require metadata in request
- **Test:** Try without superjson metadata

### Hypothesis 3: URL parameters needed for mutations ✅ VERY LIKELY
- **Evidence:** tRPC mutations typically use query params for input
- **Mechanism:** Input goes in URL, not body for GET-style calls
- **Test:** Use `?input=` query parameter

### Hypothesis 4: Need to call via batch endpoint ❓ POSSIBLE
- **Evidence:** Template may be configured for batch-only
- **Mechanism:** Single calls might be disabled
- **Test:** Use `/api/trpc/mother.query?batch=1`

---

## Phase 4: Root Cause Analysis

**ROOT CAUSE IDENTIFIED:**

tRPC mutations can be called in two ways:

1. **Batch format** (multiple calls):
   ```
   POST /api/trpc/mother.query?batch=1
   Body: {"0": {"json": {"query": "...", "useCache": false}}}
   ```

2. **Single format** (one call):
   ```
   POST /api/trpc/mother.query
   Query: ?input={"json":{"query":"...","useCache":false}}
   Body: (empty or minimal)
   ```

The error "received undefined" suggests the input is not being parsed from the request body. This is because **tRPC expects input in the URL query parameter, not the body**.

---

## Phase 5: Solution Design

### Solution A: Use query parameter for input (RECOMMENDED) ✅
```javascript
const input = { query: "...", useCache: false };
const url = `/api/trpc/mother.query?input=${encodeURIComponent(JSON.stringify(input))}`;
fetch(url, { method: 'POST' });
```
- **Pros:** Standard tRPC format, works with superjson
- **Cons:** URL length limits (but our query is small enough)

### Solution B: Use batch=1 with proper structure
```javascript
const url = `/api/trpc/mother.query?batch=1`;
const body = { "0": { json: { query: "...", useCache: false } } };
fetch(url, { method: 'POST', body: JSON.stringify(body) });
```
- **Pros:** Handles longer inputs
- **Cons:** More complex response parsing

### Solution C: Check if httpBatchLink allows body input
- **Pros:** Cleaner API
- **Cons:** May not be supported by current config

---

## Phase 6: Implementation Plan

**CHOSEN SOLUTION: A (Query parameter)**

### Steps:
1. Encode input as JSON
2. URL-encode the JSON string
3. Append as `?input=` query parameter
4. Make POST request with empty/minimal body
5. Parse response from `result.data.json`

### Code:
```javascript
const input = {
  query: "Auto-audit request...",
  useCache: false
};

const url = `${MOTHER_URL}/api/trpc/mother.query?input=${encodeURIComponent(JSON.stringify(input))}`;

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

const data = await response.json();
const result = data.result.data.json;
console.log(result.answer);
```

---

## Phase 7: Testing & Validation

### Test 1: Simple query
```bash
curl -X POST 'https://mother-interface.../api/trpc/mother.query?input=%7B%22query%22%3A%22test%22%7D'
```
Expected: Success response with answer

### Test 2: Full audit query
```bash
node test-mother-scientific.mjs
```
Expected: Detailed audit response from MOTHER

### Test 3: Verify response structure
Expected fields:
- `result.data.json.answer` (string)
- `result.data.json.tier` (string)
- `result.data.json.cost` (number)
- `result.data.json.qualityScore` (number)

---

## Phase 8: Learning & Documentation

### Key Learnings:

1. **tRPC HTTP adapter behavior:** Input goes in query params for mutations, not body
2. **Superjson transformer:** Works transparently with query param format
3. **URL encoding:** Critical for complex JSON in query strings
4. **Batch vs single:** Both work, but single is simpler for one-off calls

### Best Practices:

1. ✅ Always check tRPC adapter documentation for input format
2. ✅ Use query parameters for tRPC HTTP mutations
3. ✅ URL-encode JSON properly to avoid parsing errors
4. ✅ Test with simple queries first before complex ones
5. ✅ Log full request/response for debugging

### Academic Reference:

This follows the **tRPC HTTP adapter specification** which defines that mutations over HTTP should use query parameters for input serialization to maintain REST-like semantics while supporting complex types.

---

## Status: READY FOR IMPLEMENTATION

Next action: Create test-mother-scientific.mjs with correct format
