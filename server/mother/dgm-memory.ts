/**
 * dgm-memory.ts — Ciclo 124 — MOTHER v80.4
 *
 * Memória episódica e semântica para o loop DGM de auto-evolução.
 * Implementa Reflexion (arXiv:2303.11366) e MemGPT (arXiv:2310.08560).
 *
 * Embasamento Científico:
 * - Reflexion (arXiv:2303.11366): verbal reinforcement learning with episodic memory
 * - MemGPT (arXiv:2310.08560): LLMs as operating systems with tiered memory
 * - Generative Agents (arXiv:2304.03442): memory stream, retrieval, reflection
 * - SICA (arXiv:2504.15228): self-improving coding agents with memory
 * - DGM (arXiv:2505.22954): Darwin Gödel Machine — archive of past improvements
 *
 * @module dgm-memory
 * @version 1.0.0
 * @cycle C124
 */

import * as crypto from "crypto";
import { recordAuditEntry } from "./audit-trail";

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemoryTier = "working" | "episodic" | "semantic" | "archival";

export interface MemoryEntry {
  id: string;
  tier: MemoryTier;
  cycleId: string;
  timestamp: string;
  content: string;
  embedding?: number[];   // Simplified cosine similarity vector
  importance: number;     // 0-10 (Generative Agents recency × relevance × importance)
  accessCount: number;
  lastAccessedAt: string;
  tags: string[];
  proofHash: string;
}

export interface ReflexionEntry {
  id: string;
  cycleId: string;
  timestamp: string;
  /** What happened in this cycle */
  observation: string;
  /** What went wrong or right */
  evaluation: string;
  /** Verbal reflection for next attempt (arXiv:2303.11366) */
  reflection: string;
  /** Fitness score at time of reflection */
  fitnessScore: number;
  /** Whether this reflection led to improvement */
  improved: boolean;
  proofHash: string;
}

export interface MemoryStats {
  totalEntries: number;
  byTier: Record<MemoryTier, number>;
  totalReflexions: number;
  improvementRate: number;   // % of reflexions that led to improvement
  averageImportance: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

// ─── Memory Store (in-process, persisted via bd_central) ─────────────────────

const memoryStore: Map<string, MemoryEntry> = new Map();
const reflexionStore: Map<string, ReflexionEntry> = new Map();
const WORKING_MEMORY_LIMIT = 20;   // Max entries in working memory
const EPISODIC_MEMORY_LIMIT = 200; // Max entries in episodic memory

// ─── Core Memory Operations ───────────────────────────────────────────────────

/**
 * Stores a new memory entry with importance scoring.
 * Implements MemGPT tiered memory (arXiv:2310.08560).
 *
 * @param tier - Memory tier (working → episodic → semantic → archival)
 * @param cycleId - DGM cycle that created this memory
 * @param content - Memory content (text description)
 * @param tags - Semantic tags for retrieval
 * @param importance - Importance score 0-10 (default: 5)
 * @returns Created memory entry
 */
export function storeMemory(
  tier: MemoryTier,
  cycleId: string,
  content: string,
  tags: string[],
  importance = 5
): MemoryEntry {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const proofHash = crypto
    .createHash("sha256")
    .update(`${id}:${cycleId}:${content.slice(0, 100)}`)
    .digest("hex");

  const entry: MemoryEntry = {
    id,
    tier,
    cycleId,
    timestamp,
    content,
    importance: Math.max(0, Math.min(10, importance)),
    accessCount: 0,
    lastAccessedAt: timestamp,
    tags,
    proofHash,
  };

  memoryStore.set(id, entry);

  // Enforce tier limits — promote/archive older entries
  enforceTierLimits(tier);

  return entry;
}

/**
 * Retrieves relevant memories using importance + recency scoring.
 * Implements Generative Agents retrieval (arXiv:2304.03442).
 *
 * @param query - Search query (keyword matching)
 * @param tier - Optional tier filter
 * @param limit - Maximum entries to return (default: 10)
 * @returns Sorted array of relevant memory entries
 */
export function retrieveMemories(
  query: string,
  tier?: MemoryTier,
  limit = 10
): MemoryEntry[] {
  const queryTokens = query.toLowerCase().split(/\s+/);
  const now = Date.now();

  const scored = Array.from(memoryStore.values())
    .filter(m => !tier || m.tier === tier)
    .map(m => {
      // Relevance: keyword overlap (simplified TF-IDF)
      const contentLower = m.content.toLowerCase();
      const tagLower = m.tags.join(" ").toLowerCase();
      const relevance = queryTokens.filter(t =>
        contentLower.includes(t) || tagLower.includes(t)
      ).length / queryTokens.length;

      // Recency: exponential decay (Generative Agents)
      const ageMs = now - new Date(m.timestamp).getTime();
      const recency = Math.exp(-ageMs / (7 * 24 * 60 * 60 * 1000)); // 7-day half-life

      // Composite score: importance × 0.4 + relevance × 0.4 + recency × 0.2
      const score = (m.importance / 10) * 0.4 + relevance * 0.4 + recency * 0.2;

      return { entry: m, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Update access counts
  for (const { entry } of scored) {
    const updated = memoryStore.get(entry.id);
    if (updated) {
      updated.accessCount++;
      updated.lastAccessedAt = new Date().toISOString();
    }
  }

  return scored.map(({ entry }) => entry);
}

/**
 * Stores a Reflexion entry after a DGM cycle.
 * Implements verbal reinforcement learning (arXiv:2303.11366).
 *
 * @param cycleId - DGM cycle identifier
 * @param observation - What happened in this cycle
 * @param evaluation - What went wrong or right
 * @param reflection - Verbal reflection for next attempt
 * @param fitnessScore - Fitness score achieved
 * @param improved - Whether this improved over previous cycle
 * @returns Created reflexion entry
 */
export function storeReflexion(
  cycleId: string,
  observation: string,
  evaluation: string,
  reflection: string,
  fitnessScore: number,
  improved: boolean
): ReflexionEntry {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const proofHash = crypto
    .createHash("sha256")
    .update(`${id}:${cycleId}:${fitnessScore}:${improved}`)
    .digest("hex");

  const entry: ReflexionEntry = {
    id,
    cycleId,
    timestamp,
    observation,
    evaluation,
    reflection,
    fitnessScore,
    improved,
    proofHash,
  };

  reflexionStore.set(id, entry);

  // Also store in episodic memory for retrieval
  storeMemory(
    "episodic",
    cycleId,
    `[REFLEXION] ${observation} | Fitness: ${fitnessScore} | ${improved ? "IMPROVED" : "NO IMPROVEMENT"} | ${reflection}`,
    ["reflexion", cycleId, improved ? "success" : "failure"],
    improved ? 8 : 6
  );

  // Audit trail
  recordAuditEntry({
    action: "roadmap_executed",
    actor: "dgm-memory",
    actorType: "agent",
    target: cycleId,
    details: {
      reflexionId: id,
      fitnessScore,
      improved,
      proofHash: proofHash.slice(0, 16),
    },
    outcome: improved ? "success" : "failure",
  });

  return entry;
}

/**
 * Retrieves recent reflexions for a given cycle or all cycles.
 *
 * @param cycleId - Optional cycle filter
 * @param limit - Maximum entries to return
 * @returns Array of reflexion entries sorted by timestamp (newest first)
 */
export function getReflexions(cycleId?: string, limit = 10): ReflexionEntry[] {
  return Array.from(reflexionStore.values())
    .filter(r => !cycleId || r.cycleId === cycleId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Builds a context summary from recent memories for LLM prompting.
 * Implements MemGPT context injection (arXiv:2310.08560).
 *
 * @param query - What the agent is currently working on
 * @param maxTokens - Approximate token budget (default: 1000)
 * @returns Formatted context string for LLM injection
 */
export function buildMemoryContext(query: string, maxTokens = 1000): string {
  const relevant = retrieveMemories(query, undefined, 5);
  const recentReflexions = getReflexions(undefined, 3);

  const lines: string[] = ["=== MEMORY CONTEXT ==="];

  if (recentReflexions.length > 0) {
    lines.push("\n[RECENT REFLEXIONS]");
    for (const r of recentReflexions) {
      lines.push(`- Cycle ${r.cycleId} (fitness=${r.fitnessScore}): ${r.reflection}`);
    }
  }

  if (relevant.length > 0) {
    lines.push("\n[RELEVANT MEMORIES]");
    for (const m of relevant) {
      lines.push(`- [${m.tier}] ${m.content.slice(0, 200)}`);
    }
  }

  lines.push("=== END MEMORY CONTEXT ===");

  const context = lines.join("\n");
  // Truncate to approximate token budget (1 token ≈ 4 chars)
  return context.slice(0, maxTokens * 4);
}

/**
 * Enforces memory tier size limits by promoting/archiving old entries.
 * Implements MemGPT memory management (arXiv:2310.08560).
 */
function enforceTierLimits(tier: MemoryTier): void {
  const tierEntries = Array.from(memoryStore.values())
    .filter(m => m.tier === tier)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const limit = tier === "working" ? WORKING_MEMORY_LIMIT : EPISODIC_MEMORY_LIMIT;

  if (tierEntries.length > limit) {
    const toPromote = tierEntries.slice(0, tierEntries.length - limit);
    for (const entry of toPromote) {
      // Promote to next tier or archive
      const nextTier: MemoryTier = tier === "working" ? "episodic"
        : tier === "episodic" ? "semantic"
        : "archival";

      const updated = memoryStore.get(entry.id);
      if (updated) {
        updated.tier = nextTier;
      }
    }
  }
}

/**
 * Returns memory statistics.
 */
export function getMemoryStats(): MemoryStats {
  const entries = Array.from(memoryStore.values());
  const reflexions = Array.from(reflexionStore.values());
  const improved = reflexions.filter(r => r.improved).length;

  const byTier: Record<MemoryTier, number> = {
    working: 0,
    episodic: 0,
    semantic: 0,
    archival: 0,
  };

  for (const e of entries) {
    byTier[e.tier]++;
  }

  const sorted = entries.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    totalEntries: entries.length,
    byTier,
    totalReflexions: reflexions.length,
    improvementRate: reflexions.length > 0
      ? Math.round((improved / reflexions.length) * 100)
      : 0,
    averageImportance: entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.importance, 0) / entries.length * 10) / 10
      : 0,
    oldestEntry: sorted.length > 0 ? sorted[0].timestamp : null,
    newestEntry: sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null,
  };
}

/**
 * Clears working memory (used at start of each DGM cycle).
 */
export function clearWorkingMemory(): number {
  const working = Array.from(memoryStore.values()).filter(m => m.tier === "working");
  for (const e of working) {
    memoryStore.delete(e.id);
  }
  return working.length;
}
