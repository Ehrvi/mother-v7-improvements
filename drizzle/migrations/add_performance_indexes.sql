-- MOTHER v14: Performance Optimization Indexes (#17)
-- Target: <100ms response time for common queries
-- Created: 2026-02-21

-- ============================================================================
-- KNOWLEDGE TABLE INDEXES
-- ============================================================================

-- Index for category-based knowledge retrieval (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);

-- Index for recent knowledge retrieval (sorted by creation date)
CREATE INDEX IF NOT EXISTS idx_knowledge_created ON knowledge(createdAt DESC);

-- Index for access tracking and popular knowledge
CREATE INDEX IF NOT EXISTS idx_knowledge_access ON knowledge(accessCount DESC);

-- Composite index for category + creation date (optimizes filtered sorts)
CREATE INDEX IF NOT EXISTS idx_knowledge_category_created ON knowledge(category, createdAt DESC);

-- ============================================================================
-- CACHE ENTRIES TABLE INDEXES
-- ============================================================================

-- Index for cache lookup by hash (PRIMARY operation)
CREATE INDEX IF NOT EXISTS idx_cache_hash ON cache_entries(queryHash);

-- Index for cache expiration cleanup (background job)
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expiresAt);

-- Index for cache hit tracking (analytics)
CREATE INDEX IF NOT EXISTS idx_cache_hits ON cache_entries(hitCount DESC);

-- Composite index for active cache entries (not expired, sorted by hits)
CREATE INDEX IF NOT EXISTS idx_cache_active ON cache_entries(expiresAt, hitCount DESC);

-- ============================================================================
-- QUERIES TABLE INDEXES
-- ============================================================================

-- Index for user query history (most common analytics query)
CREATE INDEX IF NOT EXISTS idx_queries_user_created ON queries(userId, createdAt DESC);

-- Index for tier-based analytics
CREATE INDEX IF NOT EXISTS idx_queries_tier ON queries(tier);

-- Index for quality score filtering (Guardian validation)
CREATE INDEX IF NOT EXISTS idx_queries_quality ON queries(qualityScore);

-- Index for cache hit analysis
CREATE INDEX IF NOT EXISTS idx_queries_cache ON queries(cacheHit);

-- Composite index for user + tier analytics
CREATE INDEX IF NOT EXISTS idx_queries_user_tier ON queries(userId, tier, createdAt DESC);

-- Index for response time analysis (performance monitoring)
CREATE INDEX IF NOT EXISTS idx_queries_response_time ON queries(responseTime);

-- ============================================================================
-- LEARNING PATTERNS TABLE INDEXES
-- ============================================================================

-- Index for active patterns lookup
CREATE INDEX IF NOT EXISTS idx_patterns_active ON learning_patterns(isActive, confidence DESC);

-- Index for pattern type filtering
CREATE INDEX IF NOT EXISTS idx_patterns_type ON learning_patterns(patternType);

-- Index for pattern application tracking
CREATE INDEX IF NOT EXISTS idx_patterns_applied ON learning_patterns(lastApplied DESC);

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================

-- Index for role-based queries (admin vs user)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Index for last sign-in tracking (activity monitoring)
CREATE INDEX IF NOT EXISTS idx_users_last_signin ON users(lastSignedIn DESC);

-- ============================================================================
-- SYSTEM METRICS TABLE INDEXES
-- ============================================================================

-- Index for time-based metrics retrieval
CREATE INDEX IF NOT EXISTS idx_metrics_period ON system_metrics(periodStart DESC, periodEnd DESC);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these queries after migration to verify indexes:
-- SHOW INDEX FROM knowledge;
-- SHOW INDEX FROM cache_entries;
-- SHOW INDEX FROM queries;
-- SHOW INDEX FROM learning_patterns;
-- SHOW INDEX FROM users;
-- SHOW INDEX FROM system_metrics;

-- ============================================================================
-- EXPECTED PERFORMANCE IMPROVEMENTS
-- ============================================================================

-- Knowledge retrieval: 500ms → <50ms (10x faster)
-- Cache lookup: 200ms → <10ms (20x faster)
-- User query history: 1000ms → <100ms (10x faster)
-- Analytics queries: 2000ms → <200ms (10x faster)
-- Overall target: <100ms response time for 95% of queries

