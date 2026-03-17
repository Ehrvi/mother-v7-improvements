import { decimal, float, int, mediumtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. Nullable for native auth users. */
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  /** Display username for native auth users */
  username: varchar("username", { length: 64 }),
  email: varchar("email", { length: 320 }).unique(),
  /** bcrypt hash of password for native auth users (cost factor 12, OWASP recommended) */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** User role hierarchy: creator > admin > user (NIST RBAC SP 800-162, 2014; Anthropic Principal Hierarchy, 2026) */
  role: mysqlEnum("role", ["user", "admin", "creator"]).default("user").notNull(),
  /** Account status: active (approved), pending (awaiting admin approval), rejected */
  status: mysqlEnum("status", ["active", "pending", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * MOTHER v7.0: Query Log
 * Stores all queries processed by the system for learning and analysis
 */
export const queries = mysqlTable("queries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  query: text("query").notNull(),
  response: text("response").notNull(),
  
  // Intelligence Layer (Routing)
  tier: mysqlEnum("tier", ["gpt-4o-mini", "gpt-4o", "gpt-4"]).notNull(),
  complexityScore: varchar("complexityScore", { length: 20 }).notNull(), // stored as string to avoid float issues
  confidenceScore: varchar("confidenceScore", { length: 20 }).notNull(),
  
  // Quality Layer (Guardian)
  qualityScore: varchar("qualityScore", { length: 20 }), // 0-100 score
  completenessScore: varchar("completenessScore", { length: 20 }),
  accuracyScore: varchar("accuracyScore", { length: 20 }),
  relevanceScore: varchar("relevanceScore", { length: 20 }),
  coherenceScore: varchar("coherenceScore", { length: 20 }),
  safetyScore: varchar("safetyScore", { length: 20 }),
  
  // Performance Metrics
  responseTime: int("responseTime"), // milliseconds
  tokensUsed: int("tokensUsed"),
  cost: varchar("cost", { length: 20 }), // USD stored as string
  cacheHit: int("cacheHit").default(0), // 0 or 1 (boolean)
  costReduction: decimal("costReduction", { precision: 8, scale: 4 }), // % reduction vs GPT-4 baseline
  
  // Multi-Provider Cascade Router (v68.8: Ciclo 12 — Scientific basis: FrugalGPT, RouteLLM, LLMRouterBench)
  provider: varchar("provider", { length: 64 }).default('openai'), // openai | anthropic | google | deepseek | mistral
  modelName: varchar("modelName", { length: 128 }).default('gpt-4o'), // actual model used
  queryCategory: varchar("queryCategory", { length: 64 }).default('general'), // simple | general | coding | complex_reasoning

  // RAGAS Metrics (v68.3: Sprint 3 — Scientific basis: Es et al., EACL 2024, arXiv:2309.15217)
  ragasFaithfulness: decimal("ragasFaithfulness", { precision: 5, scale: 4 }), // 0-1: response grounded in context
  ragasAnswerRelevancy: decimal("ragasAnswerRelevancy", { precision: 5, scale: 4 }), // 0-1: response addresses query
  ragasContextPrecision: decimal("ragasContextPrecision", { precision: 5, scale: 4 }), // 0-1: relevant context fraction
  
  // Episodic Memory (v30.0: Active Memory)
  embedding: text("embedding"), // JSON array of 1536 floats (text-embedding-3-small)

  // RLHF signal (B5, C7): user satisfaction feedback
  // Scientific basis: Christiano et al. (2017) arXiv:1706.03741
  userFeedback: int("user_feedback"), // 1=positive, 0=negative, NULL=no feedback

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Query = typeof queries.$inferSelect;
export type InsertQuery = typeof queries.$inferInsert;

/**
 * MOTHER v7.0: Knowledge Base
 * Stores persistent knowledge (Source 1: SQLite/Replay mechanism)
 */
export const knowledge = mysqlTable("knowledge", {
  id: int("id").autoincrement().primaryKey(),
  
  // Content
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }),
  tags: text("tags"), // JSON array stored as text
  
  // Source tracking
  source: varchar("source", { length: 200 }),
  sourceType: mysqlEnum("sourceType", ["user", "api", "learning", "external"]).default("user"),
  
  // Vector embedding (for Source 2: Vector search)
  embedding: text("embedding"), // JSON array stored as text
  embeddingModel: varchar("embeddingModel", { length: 100 }),
  
  // Usage tracking
  accessCount: int("accessCount").default(0),
  lastAccessed: timestamp("lastAccessed"),

  // Domain classification (maps to Knowledge Map panel — CRITICAL: must be set on every insert)
  domain: varchar("domain", { length: 100 }).default("Conhecimento Geral"),

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Knowledge = typeof knowledge.$inferSelect;
export type InsertKnowledge = typeof knowledge.$inferInsert;

/**
 * MOTHER v7.0: Learning Patterns
 * Stores recognized patterns for continuous learning
 */
export const learningPatterns = mysqlTable("learning_patterns", {
  id: int("id").autoincrement().primaryKey(),
  
  // Pattern identification
  patternType: varchar("patternType", { length: 100 }).notNull(),
  pattern: text("pattern").notNull(), // JSON data
  
  // Pattern metrics
  occurrences: int("occurrences").default(1),
  successRate: varchar("successRate", { length: 20 }),
  avgQuality: varchar("avgQuality", { length: 20 }),
  avgCost: varchar("avgCost", { length: 20 }),
  
  // Pattern application
  isActive: int("isActive").default(1), // 0 or 1
  confidence: varchar("confidence", { length: 20 }),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastApplied: timestamp("lastApplied"),
});

export type LearningPattern = typeof learningPatterns.$inferSelect;
export type InsertLearningPattern = typeof learningPatterns.$inferInsert;

/**
 * MOTHER v7.0: Cache Entries
 * Stores cached query-response pairs for 35% hit rate target
 */
export const cacheEntries = mysqlTable("cache_entries", {
  id: int("id").autoincrement().primaryKey(),
  
  // Query identification
  queryHash: varchar("queryHash", { length: 64 }).notNull().unique(),
  query: text("query").notNull(),
  response: text("response").notNull(),
  
  // Embedding for semantic similarity
  embedding: text("embedding"), // JSON array
  
  // Cache metrics
  hitCount: int("hitCount").default(0),
  lastHit: timestamp("lastHit"),
  
  // TTL and expiration
  ttl: int("ttl").default(86400), // seconds (default 24 hours)
  expiresAt: timestamp("expiresAt").notNull(),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CacheEntry = typeof cacheEntries.$inferSelect;
export type InsertCacheEntry = typeof cacheEntries.$inferInsert;

/**
 * MOTHER v7.0: System Metrics
 * Stores system-wide performance and cost metrics
 */
export const systemMetrics = mysqlTable("system_metrics", {
  id: int("id").autoincrement().primaryKey(),
  
  // Time period
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  
  // Query metrics
  totalQueries: int("totalQueries").default(0),
  tier1Queries: int("tier1Queries").default(0), // GPT-4o-mini
  tier2Queries: int("tier2Queries").default(0), // GPT-4o
  tier3Queries: int("tier3Queries").default(0), // GPT-4
  
  // Quality metrics
  avgQualityScore: varchar("avgQualityScore", { length: 20 }),
  qualityScoreAbove90: int("qualityScoreAbove90").default(0),
  
  // Performance metrics
  avgResponseTime: varchar("avgResponseTime", { length: 20 }), // milliseconds
  p95ResponseTime: varchar("p95ResponseTime", { length: 20 }), // 95th percentile
  uptime: varchar("uptime", { length: 20 }), // percentage
  
  // Cost metrics
  totalCost: varchar("totalCost", { length: 20 }), // USD
  costReduction: varchar("costReduction", { length: 20 }), // percentage vs baseline
  
  // Cache metrics
  cacheHitRate: varchar("cacheHitRate", { length: 20 }), // percentage
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemMetric = typeof systemMetrics.$inferSelect;
export type InsertSystemMetric = typeof systemMetrics.$inferInsert;
// ===== DGM Architecture Tables (v38.0+) =====

/**
 * MOTHER v44.0: Episodic Memory (A-MEM Zettelkasten)
 * Extended with Zettelkasten-style associative memory fields.
 * Based on: arXiv:2502.12110 (A-MEM: Agentic Memory for LLM Agents)
 *
 * Architecture:
 *   - Each memory is a MemoryNote with semantic metadata
 *   - LLM extracts keywords, context, tags on ingestion
 *   - Semantic similarity search finds nearest neighbors
 *   - Evolution: strengthen (add link) or update_neighbor (evolve context/tags)
 *   - Importance score = f(recency, retrieval_count, link_density)
 */
export const episodicMemory = mysqlTable("episodic_memory", {
  id: int("id").autoincrement().primaryKey(),
  content: text("content").notNull(),
  embedding: text("embedding"), // JSON array of floats (text-embedding-3-small)
  metadata: text("metadata"), // JSON: source, run_id, agent, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // A-MEM Zettelkasten fields (arXiv:2502.12110, Section 3)
  keywords: text("keywords"), // JSON array: LLM-extracted semantic keywords
  links: text("links"), // JSON array: linked memory IDs (Zettelkasten connections)
  context: varchar("context", { length: 500 }).default("General"), // Domain/category
  category: varchar("category", { length: 255 }).default("Uncategorized"), // High-level classification
  tags: text("tags"), // JSON array: fine-grained classification tags
  retrievalCount: int("retrieval_count").default(0).notNull(), // Usage statistics
  evolutionHistory: text("evolution_history"), // JSON array: evolution log entries
  lastAccessed: timestamp("last_accessed"), // Temporal decay tracking
  importanceScore: float("importance_score").default(0.5), // Composite importance
});

export type EpisodicMemory = typeof episodicMemory.$inferSelect;
export type InsertEpisodicMemory = typeof episodicMemory.$inferInsert;

/**
 * MOTHER v40.0: DGM Archive
 * Stores the evolutionary lineage of agent versions (Darwin Gödel Machine)
 *
 * IMPORTANT: This schema reflects the ACTUAL table structure in production (mother_v7_prod).
 * The table was created manually/by an older version of the code, NOT by migration 0002.
 * Verified via: mysql DESCRIBE dgm_archive (2026-02-24)
 */
export const dgmArchive = mysqlTable("dgm_archive", {
  id: int("id").autoincrement().primaryKey(),
  generationId: varchar("generation_id", { length: 255 }).notNull(),
  parentId: varchar("parent_id", { length: 255 }),
  codeSnapshot: mediumtext("code_snapshot").notNull(),
  fitnessScore: float("fitness_score"),
  benchmarkResults: text("benchmark_results"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DgmArchive = typeof dgmArchive.$inferSelect;
export type InsertDgmArchive = typeof dgmArchive.$inferInsert;

/**
 * MOTHER v34.0: LangGraph Checkpoints
 * Stores persistent state for the Supervisor graph (MySqlCheckpointer)
 */
export const langgraphCheckpoints = mysqlTable("langgraph_checkpoints", {
  threadId: varchar("thread_id", { length: 255 }).notNull(),
  checkpointId: varchar("checkpoint_id", { length: 255 }).notNull(),
  parentCheckpointId: varchar("parent_checkpoint_id", { length: 255 }),
  checkpointData: text("checkpoint_data").notNull(), // JSON serialized Checkpoint
  metadata: text("metadata"), // JSON serialized CheckpointMetadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.threadId, table.checkpointId] }),
}));

export type LanggraphCheckpoint = typeof langgraphCheckpoints.$inferSelect;
export type InsertLanggraphCheckpoint = typeof langgraphCheckpoints.$inferInsert;

// ===== Omniscient / Knowledge Acquisition Tables (v36.0+) =====

/**
 * MOTHER v36.0: Knowledge Areas
 * Defines areas of knowledge for autonomous acquisition via the Omniscient module
 */
export const knowledgeAreas = mysqlTable("knowledge_areas", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed"]).default("pending").notNull(),
  papersCount: int("papersCount").default(0),
  chunksCount: int("chunksCount").default(0),
  qualityScore: varchar("qualityScore", { length: 20 }),
  cost: decimal("cost", { precision: 15, scale: 8 }).notNull().default("0.00000000"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type KnowledgeArea = typeof knowledgeAreas.$inferSelect;
export type InsertKnowledgeArea = typeof knowledgeAreas.$inferInsert;

/**
 * MOTHER v36.0: Papers
 * Stores academic papers acquired by the Omniscient module
 */
export const papers = mysqlTable("papers", {
  id: int("id").autoincrement().primaryKey(),
  knowledgeAreaId: int("knowledge_area_id").references(() => knowledgeAreas.id, { onDelete: "cascade" }),
  arxivId: varchar("arxiv_id", { length: 50 }),
  doi: varchar("doi", { length: 100 }),
  title: text("title").notNull(),
  authors: text("authors"),
  abstract: text("abstract"),
  publishedDate: timestamp("published_date"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  citationCount: int("citation_count").default(0),
  qualityScore: varchar("quality_score", { length: 20 }),
  chunksCount: int("chunks_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Paper = typeof papers.$inferSelect;
export type InsertPaper = typeof papers.$inferInsert;

/**
 * MOTHER v36.0: Paper Chunks
 * Stores text chunks from papers with vector embeddings for semantic search
 */
export const paperChunks = mysqlTable("paper_chunks", {
  id: int("id").autoincrement().primaryKey(),
  paperId: int("paper_id").references(() => papers.id, { onDelete: "cascade" }).notNull(),
  chunkIndex: int("chunk_index").notNull(),
  text: text("content").notNull(),
  embedding: text("embedding").notNull(), // JSON array of 1536 floats
  tokenCount: int("token_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PaperChunk = typeof paperChunks.$inferSelect;
export type InsertPaperChunk = typeof paperChunks.$inferInsert;

/**
 * MOTHER v36.0: Study Jobs
 * Tracks async knowledge acquisition jobs
 */
export const studyJobs = mysqlTable("study_jobs", {
  id: int("id").autoincrement().primaryKey(),
  knowledgeAreaId: int("knowledgeAreaId").references(() => knowledgeAreas.id, { onDelete: "cascade" }).notNull(),
  status: mysqlEnum("status", ["pending", "discovering", "retrieving", "processing", "indexing", "validating", "completed", "failed"]).default("pending").notNull(),
  progress: int("progress").default(0),
  total: int("total").default(0),
  currentStep: varchar("currentStep", { length: 255 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type StudyJob = typeof studyJobs.$inferSelect;
export type InsertStudyJob = typeof studyJobs.$inferInsert;

/**
 * MOTHER v36.0: Semantic Cache
 * Stores query-response pairs with embeddings for semantic similarity search
 */
export const semanticCache = mysqlTable("semantic_cache", {
  id: int("id").autoincrement().primaryKey(),
  queryHash: varchar("query_hash", { length: 64 }).notNull().unique(),
  queryText: text("query_text").notNull(),
  queryEmbedding: mediumtext("embedding"), // JSON array of 1536 floats (nullable for exact-match entries)
  response: mediumtext("response_text").notNull(),
  hitCount: int("hit_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export type SemanticCache = typeof semanticCache.$inferSelect;
export type InsertSemanticCache = typeof semanticCache.$inferInsert;

/**
 * MOTHER v36.0: System Config
 * Key-value store for dynamic system configuration
 */
export const systemConfig = mysqlTable("system_config", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

/**
 * MOTHER v36.0: Webhooks
 * Stores webhook subscriptions for event-driven integrations
 */
export const webhooks = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  events: text("events").notNull(), // JSON array
  secret: varchar("secret", { length: 64 }).notNull(),
  isActive: int("isActive").default(1).notNull(),
  totalDeliveries: int("totalDeliveries").default(0),
  successfulDeliveries: int("successfulDeliveries").default(0),
  failedDeliveries: int("failedDeliveries").default(0),
  lastDeliveryAt: timestamp("lastDeliveryAt"),
  lastDeliveryStatus: mysqlEnum("lastDeliveryStatus", ["success", "failed", "pending"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

/**
 * MOTHER v36.0: Webhook Deliveries
 * Tracks individual webhook delivery attempts
 */
export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  webhookId: int("webhookId").references(() => webhooks.id).notNull(),
  event: varchar("event", { length: 100 }).notNull(),
  payload: text("payload").notNull(), // JSON
  statusCode: int("statusCode"),
  responseBody: text("responseBody"),
  success: int("success").default(0).notNull(),
  attemptCount: int("attemptCount").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

/**
 * MOTHER v36.0: A/B Test Metrics
 * Tracks A/B test results for continuous improvement
 */
export const abTestMetrics = mysqlTable("ab_test_metrics", {
  id: int("id").autoincrement().primaryKey(),
  testName: varchar("testName", { length: 255 }).notNull(),
  variant: varchar("variant", { length: 100 }).notNull(),
  metric: varchar("metric", { length: 100 }).notNull(),
  value: varchar("value", { length: 50 }).notNull(),
  sampleSize: int("sampleSize").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AbTestMetric = typeof abTestMetrics.$inferSelect;
export type InsertAbTestMetric = typeof abTestMetrics.$inferInsert;

// ===== Ghost Tables: exist in DB but were missing from ORM schema =====
// Added in v67.7 — Ciclo 1 Schema Alignment Audit
// Scientific basis: "Evolutionary Database Design" (Fowler & Sadalage, 2003)

/**
 * MOTHER v56.0: Update Proposals
 * Stores DGM self-improvement proposals (Prometheus pipeline)
 * Previously existed only in DB — now registered in ORM for type safety
 */
export const updateProposals = mysqlTable("update_proposals", {
  id: int("id").autoincrement().primaryKey(),
  proposedBy: varchar("proposed_by", { length: 255 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  rationale: text("rationale"),
  affectedModules: text("affected_modules"), // JSON array
  estimatedImpact: varchar("estimated_impact", { length: 100 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "implemented"]).default("pending").notNull(),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  implementedAt: timestamp("implemented_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type UpdateProposal = typeof updateProposals.$inferSelect;
export type InsertUpdateProposal = typeof updateProposals.$inferInsert;

/**
 * MOTHER v56.0: User Memory
 * Per-user personalized memory (A-MEM style)
 * Previously existed only in DB — now registered in ORM for type safety
 */
export const userMemory = mysqlTable("user_memory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  content: text("content").notNull(),
  embedding: text("embedding"), // JSON array of 1536 floats
  keywords: text("keywords"), // JSON array
  context: varchar("context", { length: 500 }),
  importance: float("importance").default(0.5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastAccessed: timestamp("last_accessed"),
});

export type UserMemory = typeof userMemory.$inferSelect;
export type InsertUserMemory = typeof userMemory.$inferInsert;

/**
 * MOTHER v56.0: Self Proposals
 * Autonomous self-improvement proposals generated by the DGM analysis engine
 * Previously existed only in DB — now registered in ORM for type safety
 */
export const selfProposals = mysqlTable("self_proposals", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  hypothesis: text("hypothesis"),
  metricTrigger: varchar("metric_trigger", { length: 255 }),
  metricValue: varchar("metric_value", { length: 50 }),
  // Sprint 2 (C181): NC-SCHEMA-DRIFT-002 — 12 missing columns added to match raw SQL usage
  // Scientific basis: schema drift detection (Lehman 1980 — software evolution laws)
  metricTarget: float("metric_target"),
  proposedChanges: text("proposed_changes"),         // JSON: { files, changes[] }
  fitnessFunction: text("fitness_function"),
  versionTag: varchar("version_tag", { length: 50 }),
  scientificBasis: text("scientific_basis"),
  rejectionCount: int("rejection_count").default(0),
  efFactor: float("ef_factor").default(2.5),          // SuperMemo EF factor (Wozniak 1987)
  parentProposalId: int("parent_proposal_id"),
  improvementNotes: text("improvement_notes"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 100 }),
  nextReproposalAt: timestamp("next_reproposal_at"),
  rejectionReason: text("rejection_reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "implemented", "failed", "in_progress"]).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SelfProposal = typeof selfProposals.$inferSelect;
export type InsertSelfProposal = typeof selfProposals.$inferInsert;

/**
 * MOTHER v56.0: Audit Log
 * System-wide audit trail for all significant actions
 * Previously existed only in DB — now registered in ORM for type safety
 */
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 255 }).notNull(),
  actorEmail: varchar("actor_email", { length: 320 }),
  actorType: varchar("actor_type", { length: 50 }), // 'user', 'system', 'dgm'
  targetType: varchar("target_type", { length: 100 }),
  targetId: varchar("target_id", { length: 255 }),
  details: text("details"), // JSON
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ============================================================
// C176 AUDIT FIX: NC-SCHEMA-DRIFT-001
// Tables used in raw SQL but missing from Drizzle schema
// Scientific basis: Database schema drift (Qiu et al., 2023, VLDB)
// ============================================================

/**
 * GEA Agent Pool — Group-Evolving Agents (C136)
 * Scientific basis: GEA (arXiv:2502.04728, 2025)
 */
export const geaAgentPool = mysqlTable("gea_agent_pool", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agent_id", { length: 100 }).notNull(),
  systemPrompt: text("system_prompt"),
  performanceNoveltyScore: float("performance_novelty_score").default(0),
  generationNumber: int("generation_number").default(0),
  parentIds: text("parent_ids"),
  mutationType: varchar("mutation_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type GeaAgentPool = typeof geaAgentPool.$inferSelect;
export type InsertGeaAgentPool = typeof geaAgentPool.$inferInsert;

/**
 * GEA Shared Experience — cross-generation strategy pool
 * Scientific basis: GEA (arXiv:2502.04728, 2025)
 */
export const geaSharedExperience = mysqlTable("gea_shared_experience", {
  id: int("id").autoincrement().primaryKey(),
  strategy: text("strategy").notNull(),
  performanceGain: float("performance_gain").default(0),
  usageCount: int("usage_count").default(0),
  sourceAgentId: varchar("source_agent_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type GeaSharedExperience = typeof geaSharedExperience.$inferSelect;
export type InsertGeaSharedExperience = typeof geaSharedExperience.$inferInsert;

/**
 * Fitness History — cross-generation fitness tracking for DGM/GEA
 * Scientific basis: Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025)
 */
export const fitnessHistory = mysqlTable("fitness_history", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agent_id", { length: 100 }),
  fitnessScore: float("fitness_score").notNull(),
  qualityScore: float("quality_score"),
  cacheHitRate: float("cache_hit_rate"),
  avgResponseTimeMs: int("avg_response_time_ms"),
  generationNumber: int("generation_number").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type FitnessHistory = typeof fitnessHistory.$inferSelect;
export type InsertFitnessHistory = typeof fitnessHistory.$inferInsert;

/**
 * DGM Task Queue — async task queue for Cloud Run Jobs
 * Scientific basis: Cloud Run Jobs (Google Cloud, 2024)
 */
export const dgmTaskQueue = mysqlTable("dgm_task_queue", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 255 }).notNull(),
  taskType: varchar("task_type", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  payload: text("payload"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type DgmTaskQueue = typeof dgmTaskQueue.$inferSelect;
export type InsertDgmTaskQueue = typeof dgmTaskQueue.$inferInsert;

/**
 * Knowledge Wisdom — distilled insights from knowledge base
 * Used by knowledge-graph.ts for higher-order reasoning
 */
export const knowledgeWisdom = mysqlTable("knowledge_wisdom", {
  id: int("id").autoincrement().primaryKey(),
  insight: text("insight").notNull(),
  sourceIds: text("source_ids"),
  confidenceScore: float("confidence_score").default(0.5),
  domain: varchar("domain", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type KnowledgeWisdom = typeof knowledgeWisdom.$inferSelect;
export type InsertKnowledgeWisdom = typeof knowledgeWisdom.$inferInsert;

/**
 * C231 — HybridQualityEvaluator: Quality Evaluations Cache
 * Stores evaluation results for caching and DGM learning.
 * Scientific basis:
 * - G-Eval (Liu et al., 2023, arXiv:2303.16634): LLM-as-judge evaluation
 * - FrugalGPT (Chen et al., 2023, arXiv:2305.05176): cache evaluations to reduce cost
 * - Darwin Gödel Machine (arXiv:2505.22954, 2025): fitness tracking for self-improvement
 */
export const qualityEvaluations = mysqlTable("quality_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  responseHash: varchar("response_hash", { length: 64 }).notNull(),
  queryHash: varchar("query_hash", { length: 64 }).notNull(),
  tier: varchar("tier", { length: 20 }).notNull(),
  model: varchar("model", { length: 128 }),
  provider: varchar("provider", { length: 64 }),
  qualityScore: float("quality_score").notNull(),
  passed: int("passed").default(0).notNull(),
  evaluationMethod: varchar("evaluation_method", { length: 20 }),
  completenessScore: float("completeness_score"),
  relevanceScore: float("relevance_score"),
  coherenceScore: float("coherence_score"),
  accuracyScore: float("accuracy_score"),
  safetyScore: float("safety_score"),
  gEvalCoherence: float("geval_coherence"),
  gEvalConsistency: float("geval_consistency"),
  gEvalFluency: float("geval_fluency"),
  gEvalRelevance: float("geval_relevance"),
  gEvalDepth: float("geval_depth"),
  gEvalObedience: float("geval_obedience"),
  issues: text("issues"),
  evaluationDurationMs: int("evaluation_duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type QualityEvaluation = typeof qualityEvaluations.$inferSelect;
export type InsertQualityEvaluation = typeof qualityEvaluations.$inferInsert;
