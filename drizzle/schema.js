import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
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
    // Metadata
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
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
