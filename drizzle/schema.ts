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
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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
  
  // Episodic Memory (v30.0: Active Memory)
  embedding: text("embedding"), // JSON array of 1536 floats (text-embedding-3-small)
  
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
// ===== DGM Architecture Tables (v38.0) =====
export const episodicMemory = mysqlTable("episodic_memory", {
  id: int("id").autoincrement().primaryKey(),
  content: text("content").notNull(),
  embedding: text("embedding"), // JSON array of floats
  metadata: text("metadata"), // JSON: source, tags, importance, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  knowledgeAreaId: int("knowledgeAreaId").references(() => knowledgeAreas.id, { onDelete: "cascade" }),
  arxivId: varchar("arxivId", { length: 50 }),
  doi: varchar("doi", { length: 100 }),
  title: text("title").notNull(),
  authors: text("authors"),
  abstract: text("abstract"),
  publishedDate: timestamp("publishedDate"),
  pdfUrl: varchar("pdfUrl", { length: 500 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  citationCount: int("citationCount").default(0),
  qualityScore: varchar("qualityScore", { length: 20 }),
  chunksCount: int("chunksCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Paper = typeof papers.$inferSelect;
export type InsertPaper = typeof papers.$inferInsert;

/**
 * MOTHER v36.0: Paper Chunks
 * Stores text chunks from papers with vector embeddings for semantic search
 */
export const paperChunks = mysqlTable("paper_chunks", {
  id: int("id").autoincrement().primaryKey(),
  paperId: int("paperId").references(() => papers.id, { onDelete: "cascade" }).notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  text: text("text").notNull(),
  embedding: text("embedding").notNull(), // JSON array of 1536 floats
  tokenCount: int("tokenCount"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  queryText: text("queryText").notNull(),
  queryEmbedding: text("queryEmbedding").notNull(), // JSON array of 1536 floats
  response: text("response").notNull(),
  responseMetadata: text("responseMetadata"), // JSON
  hitCount: int("hitCount").default(0),
  lastHitAt: timestamp("lastHitAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
