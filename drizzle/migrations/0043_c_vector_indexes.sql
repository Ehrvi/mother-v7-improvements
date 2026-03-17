-- Migration 0043: C2 — vector search performance indexes
-- MySQL B-tree index on created_at: O(log n) vs O(n) full table scan
-- Index on domain: reduces knowledge lookup scan from ~500 rows to ~50

ALTER TABLE semantic_cache
  ADD INDEX idx_semantic_cache_created_at (created_at DESC);

ALTER TABLE knowledge
  ADD INDEX idx_knowledge_domain (domain);
