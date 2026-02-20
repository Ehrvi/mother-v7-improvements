# MOTHER v14.0 Iteration 2-4 Implementation Plan

**Date:** 2026-02-20  
**Status:** In Progress  
**Goal:** Complete Critical Thinking A/B testing, SQLite persistence, and analytics dashboard

---

## Phase 1: Enable Critical Thinking Central A/B Testing

### 1.1 Feature Flag Toggle (Admin Panel)

**Objective:** Add UI toggle to enable/disable Critical Thinking Central dynamically

**Implementation:**
```typescript
// server/routers/system.ts
adminOnlyProcedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async ({ input }) => {
    // Store in database: system_config table
    await db.insert(systemConfig).values({
      key: 'critical_thinking_enabled',
      value: input.enabled.toString()
    });
    return { success: true };
  });
```

**Frontend (Admin Panel):**
```tsx
// client/src/pages/Admin.tsx
const { mutate: toggleCT } = trpc.system.toggleCriticalThinking.useMutation();

<Switch
  checked={ctEnabled}
  onCheckedChange={(enabled) => toggleCT({ enabled })}
/>
```

### 1.2 A/B Testing Logic (10% Traffic Routing)

**Objective:** Route 10% of production traffic to Critical Thinking Central

**Implementation:**
```typescript
// server/mother/core.ts
const shouldUseCriticalThinking = (query: string): boolean => {
  // Check feature flag
  const ctEnabled = await getSystemConfig('critical_thinking_enabled');
  if (!ctEnabled) return false;

  // A/B test: 10% of traffic
  const hash = hashString(query);
  return (hash % 100) < 10;
};
```

### 1.3 Metrics Collection

**Objective:** Collect quality, latency, and cost metrics for A/B comparison

**Schema:**
```sql
CREATE TABLE ab_test_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  query_id VARCHAR(255),
  variant VARCHAR(50), -- 'control' or 'critical_thinking'
  quality_score INT,
  latency_ms INT,
  cost_usd DECIMAL(10, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Collection Logic:**
```typescript
// After query processing
await db.insert(abTestMetrics).values({
  queryId: query.id,
  variant: usedCT ? 'critical_thinking' : 'control',
  qualityScore: result.quality,
  latencyMs: Date.now() - startTime,
  costUsd: result.cost
});
```

### 1.4 Validation (1000+ Queries)

**Objective:** Collect sufficient data to validate 15-25% improvement hypothesis

**Analysis Query:**
```sql
SELECT 
  variant,
  AVG(quality_score) as avg_quality,
  AVG(latency_ms) as avg_latency,
  AVG(cost_usd) as avg_cost,
  COUNT(*) as sample_size
FROM ab_test_metrics
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY variant;
```

**Statistical Validation:**
- **Hypothesis:** Critical Thinking improves quality by 15-25%
- **Test:** Two-sample t-test (p < 0.05)
- **Sample Size:** 1000+ queries per variant
- **Expected:** control=90, CT=103-113 (15-25% improvement)

---

## Phase 2: SQLite Local Persistence (Iteration 2)

### 2.1 SQLite Schema

**Objective:** Mirror TiDB knowledge schema in SQLite for local persistence

**Schema:**
```sql
CREATE TABLE knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB, -- Store as binary
  source TEXT DEFAULT 'learned',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_knowledge_created ON knowledge(created_at);
CREATE INDEX idx_knowledge_source ON knowledge(source);
```

### 2.2 Dual-Write Capability

**Objective:** Write to both TiDB (primary) and SQLite (local cache)

**Implementation:**
```typescript
// server/learning/god-level.ts
async function saveKnowledge(entry: KnowledgeEntry) {
  // Write to TiDB (primary)
  const tidbResult = await db.insert(knowledge).values(entry);
  
  // Write to SQLite (cache) - fire-and-forget
  sqlite.insert(knowledge).values(entry).catch(err => {
    console.error('[SQLite] Dual-write failed:', err);
  });
  
  return tidbResult;
}
```

### 2.3 Read Fallback Logic

**Objective:** Read from SQLite first (fast), fallback to TiDB if miss

**Implementation:**
```typescript
// server/learning/god-level.ts
async function retrieveKnowledge(query: string, limit: number = 5) {
  // Try SQLite first (local, fast)
  let results = await sqlite.select().from(knowledge)
    .where(/* semantic search */)
    .limit(limit);
  
  // Fallback to TiDB if SQLite miss
  if (results.length === 0) {
    results = await db.select().from(knowledge)
      .where(/* semantic search */)
      .limit(limit);
  }
  
  return results;
}
```

### 2.4 Latency Benchmark

**Objective:** Validate 50% latency reduction target

**Benchmark Script:**
```typescript
// benchmark-sqlite.ts
const iterations = 1000;

// Baseline: TiDB only
const tidbStart = Date.now();
for (let i = 0; i < iterations; i++) {
  await retrieveKnowledgeTiDB(testQuery);
}
const tidbLatency = (Date.now() - tidbStart) / iterations;

// With SQLite cache
const sqliteStart = Date.now();
for (let i = 0; i < iterations; i++) {
  await retrieveKnowledgeWithSQLite(testQuery);
}
const sqliteLatency = (Date.now() - sqliteStart) / iterations;

console.log(`TiDB: ${tidbLatency}ms, SQLite: ${sqliteLatency}ms, Improvement: ${((tidbLatency - sqliteLatency) / tidbLatency * 100).toFixed(1)}%`);
```

**Expected:**
- TiDB: ~200ms (network latency)
- SQLite: ~100ms (local disk)
- Improvement: 50%+

### 2.5 Unit Tests

**Test Coverage:**
- Dual-write success (both databases updated)
- Dual-write TiDB failure (SQLite still succeeds)
- Dual-write SQLite failure (TiDB still succeeds)
- Read fallback (SQLite miss → TiDB hit)
- Read performance (SQLite faster than TiDB)

---

## Phase 3: Knowledge Analytics Dashboard

### 3.1 Dashboard UI Design

**Objective:** Visualize knowledge growth, categories, quality trends

**Components:**
1. **Knowledge Growth Chart** (line chart, entries over time)
2. **Category Distribution** (pie chart, % per category)
3. **Quality Trends** (line chart, avg quality over time)
4. **Usage Patterns** (bar chart, queries per day)
5. **Cost Analysis** (line chart, cost over time)

### 3.2 Backend Analytics Endpoints

**Endpoint 1: Knowledge Growth**
```typescript
// server/routers/analytics.ts
publicProcedure
  .input(z.object({ days: z.number().default(30) }))
  .query(async ({ input }) => {
    const results = await db.select({
      date: sql`DATE(created_at)`,
      count: sql`COUNT(*)`
    })
    .from(knowledge)
    .where(sql`created_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)`)
    .groupBy(sql`DATE(created_at)`);
    
    return results;
  });
```

**Endpoint 2: Category Distribution**
```typescript
publicProcedure
  .query(async () => {
    const results = await db.select({
      category: knowledge.category,
      count: sql`COUNT(*)`
    })
    .from(knowledge)
    .groupBy(knowledge.category);
    
    return results;
  });
```

**Endpoint 3: Quality Trends**
```typescript
publicProcedure
  .input(z.object({ days: z.number().default(30) }))
  .query(async ({ input }) => {
    const results = await db.select({
      date: sql`DATE(created_at)`,
      avgQuality: sql`AVG(quality_score)`
    })
    .from(queryLogs)
    .where(sql`created_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)`)
    .groupBy(sql`DATE(created_at)`);
    
    return results;
  });
```

### 3.3 Visualization Components

**Using Recharts (already in dependencies):**

```tsx
// client/src/pages/Analytics.tsx
import { LineChart, Line, PieChart, Pie, BarChart, Bar } from 'recharts';

function KnowledgeGrowthChart() {
  const { data } = trpc.analytics.knowledgeGrowth.useQuery({ days: 30 });
  
  return (
    <LineChart width={600} height={300} data={data}>
      <Line type="monotone" dataKey="count" stroke="#8884d8" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
    </LineChart>
  );
}
```

### 3.4 Filtering & Date Range Selection

**UI Controls:**
```tsx
<Select value={dateRange} onValueChange={setDateRange}>
  <SelectItem value="7">Last 7 days</SelectItem>
  <SelectItem value="30">Last 30 days</SelectItem>
  <SelectItem value="90">Last 90 days</SelectItem>
</Select>

<Select value={category} onValueChange={setCategory}>
  <SelectItem value="all">All Categories</SelectItem>
  <SelectItem value="technical">Technical</SelectItem>
  <SelectItem value="business">Business</SelectItem>
  {/* ... */}
</Select>
```

---

## Phase 4: Documentation & Milestone Protocol

### 4.1 Update todo.md
- Mark completed tasks as [x]
- Add new tasks discovered during implementation
- Update progress percentages

### 4.2 Update Lessons Learned

**Lição #42: A/B Testing Implementation**
- Context: Implemented Critical Thinking A/B testing
- What we did: Feature flag, 10% traffic routing, metrics collection
- Key insights: Statistical validation requires 1000+ samples, t-test p<0.05
- Metrics: Implementation time, sample size, improvement %

**Lição #43: SQLite Dual-Write Pattern**
- Context: Implemented SQLite local persistence
- What we did: Dual-write, read fallback, latency benchmark
- Key insights: 50% latency reduction, fire-and-forget for cache writes
- Metrics: TiDB vs SQLite latency, cache hit rate

**Lição #44: Analytics Dashboard Design**
- Context: Created knowledge analytics dashboard
- What we did: 5 visualizations, 3 backend endpoints, filtering
- Key insights: Recharts library, real-time updates, responsive design
- Metrics: Dashboard load time, query performance

### 4.3 Backup (4.2.1.1.1)
```bash
cd /home/ubuntu && mkdir -p backups && cp -r mother-interface "backups/mother-interface-iteration-2-4-$(date +%Y%m%d-%H%M%S)"
```

### 4.4 Commit + Push (4.2.1.1.2)
```bash
cd /home/ubuntu/mother-interface
git add .
git commit -m "MOTHER v14.0 Iteration 2-4: A/B testing, SQLite persistence, analytics dashboard"
git push origin main
```

### 4.5 Sync Production Knowledge (4.2.1.1.4)
- Automatic via Cloud Build trigger on push

### 4.6 Deploy Production (4.2.1.1.5)
- Automatic via Cloud Build (australia-southeast1)

### 4.7 Test Deployment (4.2.1.1.6)
```bash
curl -s -X POST "https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/mother.query?batch=1" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"query":"Test Iteration 2-4 deployment","useCache":false}}}' \
  | jq -r '.[0].result.data.json | "Quality: \(.quality)/100 | Tier: \(.tier) | Cost: $\(.cost)"'
```

**Success Criteria:**
- Quality: 90+/100
- No errors
- Response time: <2s
- Critical Thinking enabled (if flag=true)

---

## Timeline & Effort Estimate

| Phase | Task | Estimated Time | Priority |
|-------|------|----------------|----------|
| 1.1 | Feature flag toggle | 1 hour | HIGH |
| 1.2 | A/B testing logic | 2 hours | HIGH |
| 1.3 | Metrics collection | 1 hour | HIGH |
| 1.4 | Validation (1000+ queries) | 3-7 days | MEDIUM |
| 2.1 | SQLite schema | 30 min | MEDIUM |
| 2.2 | Dual-write capability | 1 hour | MEDIUM |
| 2.3 | Read fallback logic | 1 hour | MEDIUM |
| 2.4 | Latency benchmark | 30 min | LOW |
| 2.5 | Unit tests | 1 hour | MEDIUM |
| 3.1 | Dashboard UI design | 2 hours | LOW |
| 3.2 | Backend endpoints | 1 hour | LOW |
| 3.3 | Visualization components | 2 hours | LOW |
| 3.4 | Filtering & date range | 1 hour | LOW |
| 4.1-4.7 | Documentation & milestone | 1 hour | HIGH |

**Total:** 14-15 hours (excluding 1.4 validation wait time)

---

## Success Metrics

### Phase 1: A/B Testing
- ✅ Feature flag toggle working
- ✅ 10% traffic routed to Critical Thinking
- ✅ 1000+ queries collected
- ✅ Statistical significance (p < 0.05)
- ✅ 15-25% quality improvement validated

### Phase 2: SQLite Persistence
- ✅ Dual-write success rate: 99%+
- ✅ Read fallback working correctly
- ✅ Latency reduction: 50%+
- ✅ Unit tests passing: 100%

### Phase 3: Analytics Dashboard
- ✅ All 5 visualizations working
- ✅ Real-time data updates
- ✅ Filtering and date range selection working
- ✅ Dashboard load time: <2s

### Phase 4: Deployment
- ✅ Production deployment successful
- ✅ Quality: 90+/100
- ✅ No errors
- ✅ All features working in production

---

## Risk Management

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| A/B test insufficient sample size | MEDIUM | HIGH | Extend collection period to 7-14 days |
| SQLite write failures | LOW | MEDIUM | Fire-and-forget pattern, TiDB as primary |
| Dashboard performance issues | LOW | LOW | Pagination, caching, lazy loading |
| Production deployment failures | LOW | HIGH | Rollback plan, feature flags, canary deployment |

---

## Next Steps After Completion

1. **Iteration 3:** Implement remaining v13 features (if any)
2. **Iteration 4:** Performance optimization (caching, query optimization)
3. **Production Monitoring:** Set up alerts, dashboards, SLOs
4. **User Feedback:** Collect feedback from Everton, iterate based on insights

---

**Status:** READY TO EXECUTE  
**Last Updated:** 2026-02-20 11:10 AM
