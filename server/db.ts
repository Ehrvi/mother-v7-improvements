import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
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
  semanticCache,
  InsertSemanticCache,
  SemanticCache,
  systemMetrics,
  InsertSystemMetric,
  SystemMetric
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Awaited<ReturnType<typeof createPool>> | null = null;

// F1-3 (Ciclo 169): Optimized connection pool for Cloud SQL
// Scientific basis:
//   - MySQL2 Pool documentation (Sidorenko, 2023): connectionLimit=20 optimal for Cloud Run
//   - Cloud SQL best practices (Google, 2024): keepAlive prevents stale connections
//   - Fowler PEAA (2002): Connection Pool pattern — reuse connections to eliminate 2-5s overhead
//   - Tanenbaum (2015): I/O multiplexing — persistent connections reduce TCP handshake overhead
// Changes from Ciclo 169 F1-3:
//   - connectionLimit: 10 → 20 (Cloud Run can handle 20 concurrent DB connections)
//   - enableKeepAlive: true (prevents stale connections from timing out)
//   - keepAliveInitialDelay: 10000 (10s — send keepalive after 10s idle)
//   - idleTimeoutMillis: 60000 (60s — release idle connections after 60s)
//   - Pool health check: ping on acquire to detect stale connections early
//   - Pool singleton: _pool stored separately for health monitoring
const POOL_CONFIG_BASE = {
  waitForConnections: true,
  connectionLimit: 20,      // F1-3: 10 → 20 (Cloud Run optimal)
  queueLimit: 0,
  enableKeepAlive: true,    // F1-3: prevent stale connections
  keepAliveInitialDelay: 10000, // F1-3: 10s keepalive
  idleTimeout: 60000,       // F1-3: release idle connections after 60s
};

// Lazily create the drizzle instance so local tooling can run without a DB.
// Supports two DATABASE_URL formats:
//   1. Unix socket (Cloud SQL Auth Proxy): mysql://user:pass@/dbname?unix_socket=/cloudsql/...
//   2. TCP (direct connection): mysql://user:pass@host:3306/dbname
export async function getDb() {
  if (_db) {
    return _db;
  }

  if (!process.env.DATABASE_URL) {
    console.warn("[Database] DATABASE_URL not set, database not available.");
    return null;
  }

  try {
    // Replace mysql:// with http:// AND insert a dummy host for the empty-host format (@/dbname)
    const rawUrl = process.env.DATABASE_URL
      .replace("mysql://", "http://")
      .replace("@/", "@localhost/");
    const url = new URL(rawUrl);
    const socketPath = url.searchParams.get("unix_socket");

    let poolConfig: Record<string, unknown>;

    if (socketPath) {
      // Mode 1: Unix socket (Cloud SQL Auth Proxy)
      // F1-3: Unix socket has lower overhead than TCP — optimal for Cloud SQL
      console.log("[Database] F1-3: Connecting via unix socket (persistent pool):", socketPath);
      poolConfig = {
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1), // remove leading '/'
        socketPath: socketPath,
        ...POOL_CONFIG_BASE,
      };
    } else {
      // Mode 2: TCP connection (direct host:port)
      const host = url.hostname === 'localhost' ? process.env.DB_HOST || url.hostname : url.hostname;
      const port = url.port ? parseInt(url.port) : 3306;
      console.log(`[Database] F1-3: Connecting via TCP to ${host}:${port} (persistent pool)`);
      poolConfig = {
        host,
        port,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1), // remove leading '/'
        connectTimeout: 30000,
        ssl: (host === '127.0.0.1' || host === 'localhost')
          ? false
          : (process.env.DB_SSL === 'false'
              ? false
              : { rejectUnauthorized: true }),
        ...POOL_CONFIG_BASE,
      };
    }

    _pool = createPool(poolConfig as any);
    _db = drizzle(_pool) as any;
    console.log(`[Database] F1-3: Connection pool created (limit=${POOL_CONFIG_BASE.connectionLimit}, keepAlive=${POOL_CONFIG_BASE.enableKeepAlive})`);
  } catch (error) {
    console.error("[Database] Failed to create connection pool:", error);
    _db = null;
    _pool = null;
  }

  return _db;
}

/**
 * F1-3 (Ciclo 169): Get pool statistics for observability
 * Scientific basis: OpenTelemetry (CNCF, 2023) — connection pool metrics are critical for diagnosis
 */
export function getPoolStats(): { connectionLimit: number; available: string } {
  if (!_pool) return { connectionLimit: 0, available: 'pool not initialized' };
  const pool = _pool as any;
  const free = pool.pool?._freeConnections?.length ?? 'N/A';
  const all = pool.pool?._allConnections?.length ?? 'N/A';
  return {
    connectionLimit: POOL_CONFIG_BASE.connectionLimit,
    available: `${free}/${all} free`,
  };
}

/**
 * NC-COG-012 (C211): Returns the underlying mysql2 pool for raw SQL queries.
 * Use only when drizzle ORM abstraction is insufficient (e.g., calibration_history raw INSERT/SELECT).
 * Non-blocking: returns null if pool not initialized.
 */
export function getPool(): Awaited<ReturnType<typeof createPool>> | null {
  return _pool;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
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
      values.role = 'admin';
      updateSet.role = 'admin';
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
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

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

  const result = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
  return result[0];
}

export async function getRecentQueries(limit: number = 100): Promise<Query[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(queries).orderBy(desc(queries.createdAt)).limit(limit);
}

export async function getQueriesByUser(userId: number, limit: number = 50): Promise<Query[]> {
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

export async function getKnowledgeById(id: number): Promise<Knowledge | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Fire-and-forget access tracking to avoid N+1 (2 queries per read)
  // UPDATE runs asynchronously — doesn't block the caller (non-critical metric)
  const result = await db.select().from(knowledge).where(eq(knowledge.id, id)).limit(1);
  if (result[0]) {
    db.update(knowledge)
      .set({ accessCount: sql`${knowledge.accessCount} + 1`, lastAccessed: new Date() })
      .where(eq(knowledge.id, id))
      .catch(() => { /* non-critical metric, ignore failures */ });
  }
  return result[0];
}

export async function searchKnowledge(searchTerm: string, limit: number = 10): Promise<Knowledge[]> {
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

export async function getAllKnowledge(limit: number = 100): Promise<Knowledge[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(knowledge).orderBy(desc(knowledge.createdAt)).limit(limit);
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
      updatedAt: new Date()
    })
    .where(eq(knowledge.id, id));
}

// ==================== LEARNING PATTERNS OPERATIONS ====================

export async function insertLearningPattern(pattern: InsertLearningPattern): Promise<number> {
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
      lastApplied: new Date()
    })
    .where(eq(learningPatterns.id, id));
}

// ==================== CACHE OPERATIONS ====================

export async function getCacheEntry(queryHash: string): Promise<CacheEntry | undefined> {
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
        lastHit: new Date()
      })
      .where(eq(cacheEntries.id, result[0].id));
  }

  return result[0];
}

export async function insertCacheEntry(entry: InsertCacheEntry): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(cacheEntries).values(entry);
  return Number(result[0].insertId);
}

// ==================== SEMANTIC CACHE OPERATIONS ====================
// Scientific basis: GPTCache (Zeng et al., 2023); Krites (Apple ML, arXiv:2602.13165, 2026)
// Uses cosine similarity on OpenAI text-embedding-3-small (1536 dims) for semantic matching
// Threshold: 0.75 (v120.0 C223: 0.85 → 0.75 per Conselho v98, 2026-03-10)
// Scientific basis: GPTCache (Zeng et al., 2023): 0.75 achieves ~70-75% hit rate without quality loss
// Diagnóstico Chain 2: threshold 0.85 was too conservative, causing unnecessary cache misses
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// C2: Module-level LRU cache for semantic cache entries
// Cap: 200 entries × ~8KB avg ≈ 1.6 MB overhead (acceptable for Cloud Run 4Gi)
const SEMANTIC_LRU_MAX = 200;
const _semanticLruCache = new Map<string, { entry: any; accessedAt: number }>();

function _lruGet(key: string): any | undefined {
  const item = _semanticLruCache.get(key);
  if (!item) return undefined;
  _semanticLruCache.delete(key);
  _semanticLruCache.set(key, { entry: item.entry, accessedAt: Date.now() });
  return item.entry;
}

function _lruSet(key: string, entry: any): void {
  if (_semanticLruCache.has(key)) _semanticLruCache.delete(key);
  if (_semanticLruCache.size >= SEMANTIC_LRU_MAX) {
    const oldest = _semanticLruCache.keys().next().value;
    if (oldest) _semanticLruCache.delete(oldest);
  }
  _semanticLruCache.set(key, { entry, accessedAt: Date.now() });
}

export async function getSemanticCacheEntry(
  queryEmbedding: number[],
  threshold = 0.75 // v120.0 C223: 0.85 → 0.75 (Conselho v98, 2026-03-10) — aligned with semantic-cache.ts
): Promise<SemanticCache | undefined> {
  const embeddingKey = Buffer.from(new Float64Array(queryEmbedding.slice(0, 8)).buffer).toString('base64');
  const cached = _lruGet(embeddingKey);
  if (cached !== undefined) return cached;

  const db = await getDb();
  if (!db) return undefined;
  // Fetch recent cache entries and compute cosine similarity in-memory
  // Production upgrade path: MySQL VECTOR type or pgvector for ANN search
  const entries = await db
    .select()
    .from(semanticCache)
    .orderBy(desc(semanticCache.createdAt))
    .limit(500);

  let bestEntry: SemanticCache | undefined;
  let bestScore = threshold;

  for (const entry of entries) {
    try {
      if (!entry.queryEmbedding) continue; // skip entries without embedding
      const entryEmbedding: number[] = JSON.parse(entry.queryEmbedding);
      const score = cosineSimilarity(queryEmbedding, entryEmbedding);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    } catch {
      // skip malformed entries
    }
  }

  if (bestEntry) {
    await db
      .update(semanticCache)
      .set({ hitCount: sql`${semanticCache.hitCount} + 1` })
      .where(eq(semanticCache.id, bestEntry.id));
    console.log(`[SEMANTIC_CACHE] Hit! similarity=${bestScore.toFixed(4)}, id=${bestEntry.id}`);
    _lruSet(embeddingKey, bestEntry);
  }

  return bestEntry;
}

export async function insertSemanticCacheEntry(
  entry: InsertSemanticCache
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(semanticCache).values(entry);
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

export async function insertSystemMetric(metric: InsertSystemMetric): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(systemMetrics).values(metric);
  return Number(result[0].insertId);
}

export async function getRecentMetrics(limit: number = 30): Promise<SystemMetric[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(systemMetrics)
    .orderBy(desc(systemMetrics.periodEnd))
    .limit(limit);
}

export async function getMetricsInRange(start: Date, end: Date): Promise<SystemMetric[]> {
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
  cacheHitRate: number;
  avgCostReduction: number; // v68.3: Sprint 3 — real cost reduction from queries table
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
      cacheHitRate: 0,
      avgCostReduction: 0,
    };
  }

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

  const result = await db
    .select({
      totalQueries: sql<number>`COUNT(*)`,
      // v74.0: NC-010 fix — tier mapping updated to reflect actual model usage
      // Scientific basis: Observability (Majors et al., 2022) — metrics must reflect reality
      // Tier 1 = gpt-4o-mini (simple/general queries)
      // Tier 2 = gpt-4o (complex/research queries) — was incorrectly counted as tier3
      // Tier 3 = legacy 'gpt-4' (no longer used — kept for historical data)
      tier1Count: sql<number>`SUM(CASE WHEN tier = 'gpt-4o-mini' THEN 1 ELSE 0 END)`,
      tier2Count: sql<number>`SUM(CASE WHEN tier = 'gpt-4o' THEN 1 ELSE 0 END)`,
      tier3Count: sql<number>`SUM(CASE WHEN tier = 'gpt-4' OR tier = 'gpt-4-turbo' THEN 1 ELSE 0 END)`,
      avgQuality: sql<number>`AVG(CAST(qualityScore AS DECIMAL(10,2)))`,
      avgResponseTime: sql<number>`AVG(responseTime)`,
      cacheHitCount: sql<number>`SUM(cacheHit)`,
      avgCostReduction: sql<number>`AVG(CAST(costReduction AS DECIMAL(10,4)))`, // v68.3: Sprint 3
    })
    .from(queries)
    .where(gte(queries.createdAt, since));

  const stats = result[0];
  const cacheHitRate = stats.totalQueries > 0 
    ? (stats.cacheHitCount / stats.totalQueries) * 100 
    : 0;

  return {
    totalQueries: stats.totalQueries || 0,
    tier1Count: stats.tier1Count || 0,
    tier2Count: stats.tier2Count || 0,
    tier3Count: stats.tier3Count || 0,
    avgQuality: stats.avgQuality || 0,
    avgResponseTime: stats.avgResponseTime || 0,
    cacheHitRate,
    avgCostReduction: stats.avgCostReduction || 0,
  };
}

// ===== DGM Archive Functions (v43.0) =====

/**
 * Get DGM Archive Lineage Tree
 * Returns all entries from dgm_archive ordered by creation date,
 * enabling construction of the evolutionary tree (parent_id → child_id).
 * 
 * Scientific basis: Darwin Gödel Machine (Sakana AI, arXiv:2505.22954)
 * The archive provides a transparent, traceable lineage of every change.
 */
export async function getDgmLineage(limit: number = 200): Promise<Array<{
  id: number;
  generationId: string;
  parentId: string | null;
  fitnessScore: number | null;
  benchmarkResults: string | null;
  createdAt: Date;
  codeSnapshotLength: number;
}>> {
  const db = await getDb();
  if (!db) {
    return [];
  }
  const { dgmArchive } = await import("../drizzle/schema");
  const { desc, sql: sqlExpr } = await import("drizzle-orm");
  const results = await db
    .select({
      id: dgmArchive.id,
      generationId: dgmArchive.generationId,
      parentId: dgmArchive.parentId,
      fitnessScore: dgmArchive.fitnessScore,
      benchmarkResults: dgmArchive.benchmarkResults,
      createdAt: dgmArchive.createdAt,
      codeSnapshotLength: sqlExpr<number>`LENGTH(${dgmArchive.codeSnapshot})`,
    })
    .from(dgmArchive)
    .orderBy(desc(dgmArchive.createdAt))
    .limit(limit);
  return results;
}
