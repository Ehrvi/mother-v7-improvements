import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  queries,
  InsertQuery,
  Query,
  knowledge,
  InsertKnowledge,
  Knowledge,
  learningPatterns,
  InsertLearningPattern,
  LearningPattern,
  cacheEntries,
  InsertCacheEntry,
  CacheEntry,
  systemMetrics,
  InsertSystemMetric,
  SystemMetric,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { logger } from "./lib/logger";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      logger.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    logger.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    logger.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    logger.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== QUERY LOG OPERATIONS ====================

export async function insertQuery(query: InsertQuery): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(queries).values(query);
  return Number(result[0].insertId);
}

export async function getQueryById(id: number): Promise<Query | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(queries)
    .where(eq(queries.id, id))
    .limit(1);
  return result[0];
}

export async function getRecentQueries(limit: number = 100): Promise<Query[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(queries)
    .orderBy(desc(queries.createdAt))
    .limit(limit);
}

export async function getQueriesByUser(
  userId: number,
  limit: number = 50
): Promise<Query[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(queries)
    .where(eq(queries.userId, userId))
    .orderBy(desc(queries.createdAt))
    .limit(limit);
}

// ==================== KNOWLEDGE BASE OPERATIONS ====================

export async function insertKnowledge(item: InsertKnowledge): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(knowledge).values(item);
  return Number(result[0].insertId);
}

export async function getKnowledgeById(
  id: number
): Promise<Knowledge | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(knowledge)
    .where(eq(knowledge.id, id))
    .limit(1);

  if (result[0]) {
    // Update access count
    await db
      .update(knowledge)
      .set({
        accessCount: sql`${knowledge.accessCount} + 1`,
        lastAccessed: new Date(),
      })
      .where(eq(knowledge.id, id));
  }

  return result[0];
}

export async function searchKnowledge(
  searchTerm: string,
  limit: number = 10
): Promise<Knowledge[]> {
  const db = await getDb();
  if (!db) return [];

  // Simple text search - in production, use vector similarity
  return await db
    .select()
    .from(knowledge)
    .where(
      sql`${knowledge.title} LIKE ${`%${searchTerm}%`} OR ${knowledge.content} LIKE ${`%${searchTerm}%`}`
    )
    .limit(limit);
}

export async function getAllKnowledge(
  limit: number = 100
): Promise<Knowledge[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(knowledge)
    .orderBy(desc(knowledge.createdAt))
    .limit(limit);
}

export async function updateKnowledgeEmbedding(
  id: number,
  embedding: string,
  model: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(knowledge)
    .set({
      embedding,
      embeddingModel: model,
      updatedAt: new Date(),
    })
    .where(eq(knowledge.id, id));
}

// ==================== LEARNING PATTERNS OPERATIONS ====================

export async function insertLearningPattern(
  pattern: InsertLearningPattern
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(learningPatterns).values(pattern);
  return Number(result[0].insertId);
}

export async function getActiveLearningPatterns(): Promise<LearningPattern[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(learningPatterns)
    .where(eq(learningPatterns.isActive, 1))
    .orderBy(desc(learningPatterns.occurrences));
}

export async function updatePatternOccurrence(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(learningPatterns)
    .set({
      occurrences: sql`${learningPatterns.occurrences} + 1`,
      lastApplied: new Date(),
    })
    .where(eq(learningPatterns.id, id));
}

// ==================== CACHE OPERATIONS ====================

export async function getCacheEntry(
  queryHash: string
): Promise<CacheEntry | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(cacheEntries)
    .where(
      and(
        eq(cacheEntries.queryHash, queryHash),
        gte(cacheEntries.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result[0]) {
    // Update hit count
    await db
      .update(cacheEntries)
      .set({
        hitCount: sql`${cacheEntries.hitCount} + 1`,
        lastHit: new Date(),
      })
      .where(eq(cacheEntries.id, result[0].id));
  }

  return result[0];
}

export async function insertCacheEntry(
  entry: InsertCacheEntry
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(cacheEntries).values(entry);
  return Number(result[0].insertId);
}

export async function cleanExpiredCache(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .delete(cacheEntries)
    .where(lte(cacheEntries.expiresAt, new Date()));

  return result[0].affectedRows;
}

// ==================== SYSTEM METRICS OPERATIONS ====================

export async function insertSystemMetric(
  metric: InsertSystemMetric
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(systemMetrics).values(metric);
  return Number(result[0].insertId);
}

export async function getRecentMetrics(
  limit: number = 30
): Promise<SystemMetric[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(systemMetrics)
    .orderBy(desc(systemMetrics.periodEnd))
    .limit(limit);
}

export async function getMetricsInRange(
  start: Date,
  end: Date
): Promise<SystemMetric[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(systemMetrics)
    .where(
      and(
        gte(systemMetrics.periodStart, start),
        lte(systemMetrics.periodEnd, end)
      )
    )
    .orderBy(desc(systemMetrics.periodEnd));
}

// ==================== ANALYTICS HELPERS ====================

export async function getQueryStats(periodHours: number = 24): Promise<{
  totalQueries: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  avgQuality: number;
  avgResponseTime: number;
  avgCostReduction: number;
  cacheHitRate: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalQueries: 0,
      tier1Count: 0,
      tier2Count: 0,
      tier3Count: 0,
      avgQuality: 0,
      avgResponseTime: 0,
      avgCostReduction: 0,
      cacheHitRate: 0,
    };
  }

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

  const result = await db
    .select({
      totalQueries: sql<number>`COUNT(*)`,
      tier1Count: sql<number>`SUM(CASE WHEN tier = 'gpt-4o-mini' THEN 1 ELSE 0 END)`,
      tier2Count: sql<number>`SUM(CASE WHEN tier = 'gpt-4o' THEN 1 ELSE 0 END)`,
      tier3Count: sql<number>`SUM(CASE WHEN tier = 'gpt-4' THEN 1 ELSE 0 END)`,
      avgQuality: sql<number>`AVG(CAST(qualityScore AS DECIMAL(10,2)))`,
      avgResponseTime: sql<number>`AVG(responseTime)`,
      avgCostReduction: sql<number>`AVG(CAST(costReduction AS DECIMAL(10,2)))`,
      cacheHitCount: sql<number>`SUM(cacheHit)`,
    })
    .from(queries)
    .where(gte(queries.createdAt, since));

  const stats = result[0];
  const cacheHitRate =
    stats.totalQueries > 0
      ? (stats.cacheHitCount / stats.totalQueries) * 100
      : 0;

  return {
    totalQueries: stats.totalQueries || 0,
    tier1Count: stats.tier1Count || 0,
    tier2Count: stats.tier2Count || 0,
    tier3Count: stats.tier3Count || 0,
    avgQuality: stats.avgQuality || 0,
    avgResponseTime: stats.avgResponseTime || 0,
    avgCostReduction: stats.avgCostReduction || 0,
    cacheHitRate,
  };
}
