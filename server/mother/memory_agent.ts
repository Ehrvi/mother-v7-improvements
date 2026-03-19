/**
 * MOTHER v44.0: Memory Agent — A-MEM Zettelkasten Architecture
 *
 * Implements the Agentic Memory System (A-MEM) based on:
 *   arXiv:2502.12110 — "A-MEM: Agentic Memory for LLM Agents"
 *   Reference implementation: github.com/WujiangXu/A-mem-sys
 *
 * Architecture (Section 3 of the paper):
 *   1. INGESTION: LLM extracts keywords, context, tags from raw content
 *   2. INDEXING: Embedding stored for semantic similarity search
 *   3. EVOLUTION: For each new note, find k nearest neighbors via cosine similarity.
 *      LLM decides: "strengthen" (add Zettelkasten link) or "update_neighbor"
 *      (evolve context/tags of existing notes). Triggered every EVO_THRESHOLD notes.
 *   4. RETRIEVAL: Hybrid search — semantic similarity + importance score
 *      Importance = 0.4 * recency_decay + 0.4 * retrieval_frequency + 0.2 * link_density
 *
 * Key difference from vanilla RAG:
 *   - Memories are not static; they EVOLVE as new information arrives
 *   - Zettelkasten links create a knowledge graph, not just a flat vector store
 *   - Importance scoring enables temporal decay and usage-based prioritization
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { episodicMemory } from "../../drizzle/schema";
import { getEmbedding, cosineSimilarity } from "./embeddings";
import { createLogger } from '../_core/logger';
const log = createLogger('MEMORY_AGENT');


// ─── Constants ────────────────────────────────────────────────────────────────
const EVO_THRESHOLD = 10; // Trigger evolution every N new memories
const EVO_NEIGHBORS = 5;  // Number of nearest neighbors to consider for evolution
const RECALL_LIMIT_DEFAULT = 5;

// ─── Types ────────────────────────────────────────────────────────────────────
interface EvolutionEntry {
  timestamp: string;
  action: "strengthen" | "update_neighbor" | "ingested";
  targetId?: number;
  reason?: string;
}

interface EvolutionDecision {
  should_evolve: boolean;
  actions: Array<{
    type: "strengthen" | "update_neighbor";
    target_id?: number;
    new_tags?: string[];
    new_context?: string;
    reason: string;
  }>;
}

// ─── Importance Score Calculation ─────────────────────────────────────────────
/**
 * Composite importance score per A-MEM paper (Section 3.3):
 *   importance = 0.4 * recency_decay + 0.4 * retrieval_frequency + 0.2 * link_density
 */
export function computeImportanceScore(
  createdAt: Date,
  lastAccessed: Date | null,
  retrievalCount: number,
  linkCount: number
): number {
  const now = Date.now();
  const lastTime = lastAccessed ? lastAccessed.getTime() : createdAt.getTime();
  const daysSinceAccess = (now - lastTime) / (1000 * 60 * 60 * 24);
  const recencyDecay = Math.exp(-0.1 * daysSinceAccess);
  const retrievalFreq = Math.min(retrievalCount / 100, 1.0);
  const linkDensity = Math.min(linkCount / 20, 1.0);
  return 0.4 * recencyDecay + 0.4 * retrievalFreq + 0.2 * linkDensity;
}

// ─── LLM Metadata Extraction ──────────────────────────────────────────────────
export async function extractMetadata(content: string, llm: ChatOpenAI): Promise<{
  keywords: string[];
  context: string;
  category: string;
  tags: string[];
}> {
  const prompt = `Analyze this memory content and extract structured metadata.

Content: "${content.slice(0, 500)}"

Return a JSON object with:
- keywords: array of 3-7 key semantic terms
- context: single sentence describing the domain/situation (max 100 chars)
- category: one of [DGM_Evolution, Agent_Behavior, Error_Debug, Knowledge_Acquisition, System_State, User_Interaction, Scientific_Finding]
- tags: array of 2-5 fine-grained classification tags

Respond ONLY with valid JSON, no markdown.`;

  try {
    const response = await llm.invoke(prompt);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const words = content.split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    return { keywords: words, context: content.slice(0, 100), category: "System_State", tags: ["auto-extracted"] };
  }
}

// ─── Evolution Engine ─────────────────────────────────────────────────────────
export async function evolveMemory(
  newNote: { id: number; content: string; keywords: string[]; context: string; embedding: number[] },
  llm: ChatOpenAI
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const allMemories = await db.select({
    id: episodicMemory.id,
    content: episodicMemory.content,
    embedding: episodicMemory.embedding,
    keywords: episodicMemory.keywords,
    context: episodicMemory.context,
    tags: episodicMemory.tags,
    links: episodicMemory.links,
  }).from(episodicMemory)
    .where(sql`${episodicMemory.id} != ${newNote.id}`)
    .limit(200);

  if (allMemories.length === 0) return;

  const withSimilarity = allMemories
    .filter(m => m.embedding)
    .map(m => ({
      ...m,
      similarity: cosineSimilarity(newNote.embedding, JSON.parse(m.embedding!)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, EVO_NEIGHBORS);

  if (withSimilarity.length === 0) return;

  const neighborsText = withSimilarity.map(m =>
    `[ID:${m.id}] keywords: ${m.keywords || "[]"} | context: ${m.context || "General"} | content: "${m.content.slice(0, 100)}"`
  ).join("\n");

  const evolutionPrompt = `You are MOTHER's memory evolution agent (A-MEM Zettelkasten).

NEW MEMORY:
  content: "${newNote.content.slice(0, 200)}"
  keywords: ${JSON.stringify(newNote.keywords)}
  context: "${newNote.context}"

NEAREST NEIGHBORS:
${neighborsText}

Return JSON:
{
  "should_evolve": true/false,
  "actions": [
    { "type": "strengthen", "target_id": <id>, "new_tags": ["tag"], "reason": "why" },
    { "type": "update_neighbor", "target_id": <id>, "new_context": "...", "new_tags": ["tag"], "reason": "why" }
  ]
}

Only evolve if semantic similarity > 0.7. Max 2 actions. ONLY valid JSON.`;

  let decision: EvolutionDecision;
  try {
    const response = await llm.invoke(evolutionPrompt);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    decision = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return;
  }

  if (!decision.should_evolve || !decision.actions?.length) return;

  for (const action of decision.actions.slice(0, 2)) {
    if (!action.target_id) continue;
    const target = allMemories.find(m => m.id === action.target_id);
    if (!target) continue;

    const evolutionEntry: EvolutionEntry = {
      timestamp: new Date().toISOString(),
      action: action.type,
      targetId: action.target_id,
      reason: action.reason,
    };

    if (action.type === "strengthen") {
      const newLinks = JSON.parse(target.links || "[]");
      if (!newLinks.includes(newNote.id)) newLinks.push(newNote.id);
      const row = await db.select({ evolutionHistory: episodicMemory.evolutionHistory })
        .from(episodicMemory).where(eq(episodicMemory.id, action.target_id)).limit(1);
      const targetHistory = JSON.parse(row[0]?.evolutionHistory || "[]");
      await db.update(episodicMemory).set({
        links: JSON.stringify(newLinks),
        evolutionHistory: JSON.stringify([...targetHistory, evolutionEntry]),
        importanceScore: computeImportanceScore(new Date(), new Date(), 0, newLinks.length),
      }).where(eq(episodicMemory.id, action.target_id));
      await db.update(episodicMemory).set({ links: JSON.stringify([action.target_id]) })
        .where(eq(episodicMemory.id, newNote.id));
      log.info(`[MemoryAgent] Strengthened link: ${newNote.id} ↔ ${action.target_id}`);
    } else if (action.type === "update_neighbor") {
      const row = await db.select({ evolutionHistory: episodicMemory.evolutionHistory })
        .from(episodicMemory).where(eq(episodicMemory.id, action.target_id)).limit(1);
      const targetHistory = JSON.parse(row[0]?.evolutionHistory || "[]");
      await db.update(episodicMemory).set({
        context: action.new_context || target.context || "General",
        tags: JSON.stringify(action.new_tags || []),
        evolutionHistory: JSON.stringify([...targetHistory, evolutionEntry]),
      }).where(eq(episodicMemory.id, action.target_id));
      log.info(`[MemoryAgent] Updated neighbor ${action.target_id}: context="${action.new_context}"`);
    }
  }
}

// ─── Tools ────────────────────────────────────────────────────────────────────
const storeMemoryTool = tool(
  async ({ content, source, runId }) => {
    log.info("[MemoryAgent] Storing A-MEM note:", content.slice(0, 80));
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
      const meta = await extractMetadata(content, llm);
      const embedding = await getEmbedding(content);
      const result = await db.insert(episodicMemory).values({
        content,
        embedding: JSON.stringify(embedding),
        metadata: JSON.stringify({ source: source || "agent", runId }),
        keywords: JSON.stringify(meta.keywords),
        links: JSON.stringify([]),
        context: meta.context,
        category: meta.category,
        tags: JSON.stringify(meta.tags),
        retrievalCount: 0,
        evolutionHistory: JSON.stringify([{ timestamp: new Date().toISOString(), action: "ingested", reason: "Initial ingestion" }]),
        importanceScore: 0.5,
      });
      const newId = (result as any).insertId as number;
      const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(episodicMemory);
      const totalCount = Number(countResult[0]?.count || 0);
      if (totalCount % EVO_THRESHOLD === 0) {
        evolveMemory({ id: newId, content, keywords: meta.keywords, context: meta.context, embedding }, llm)
          .catch(e => log.error("[MemoryAgent] Evolution error:", e));
      }
      return `Memory stored (ID=${newId}). Keywords: ${meta.keywords.join(", ")}. Context: "${meta.context}". Category: ${meta.category}.`;
    } catch (error) {
      return `Failed to store memory: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "store_memory",
    description: "Store a memory note using A-MEM Zettelkasten architecture with LLM-extracted metadata",
    schema: z.object({
      content: z.string().describe("The memory content to store"),
      source: z.string().optional().describe("Source agent or system component"),
      runId: z.string().optional().describe("Associated DGM run ID"),
    }),
  }
);

const recallMemoryTool = tool(
  async ({ query, limit, contextFilter }) => {
    log.info("[MemoryAgent] Recalling:", query.slice(0, 80));
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const queryEmbedding = await getEmbedding(query);
      const memories = await db.select().from(episodicMemory).limit(200);
      if (memories.length === 0) return "No memories found.";
      const scored = memories
        .filter(m => m.embedding)
        .filter(m => !contextFilter || (m.context || "").toLowerCase().includes(contextFilter.toLowerCase()))
        .map(m => {
          const semanticSim = cosineSimilarity(queryEmbedding, JSON.parse(m.embedding!));
          const importance = m.importanceScore ?? 0.5;
          return { ...m, semanticSim, hybridScore: 0.7 * semanticSim + 0.3 * importance };
        })
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, limit ?? RECALL_LIMIT_DEFAULT);
      if (scored.length === 0) return `No relevant memories found for: "${query}"`;
      for (const m of scored.slice(0, 3)) {
        const newCount = (m.retrievalCount ?? 0) + 1;
        const linkCount = JSON.parse(m.links || "[]").length;
        await db.update(episodicMemory).set({
          retrievalCount: newCount,
          lastAccessed: new Date(),
          importanceScore: computeImportanceScore(m.createdAt, new Date(), newCount, linkCount),
        }).where(eq(episodicMemory.id, m.id));
      }
      const results = scored.map((m, i) => [
        `${i + 1}. [Score: ${m.hybridScore.toFixed(3)} | Sim: ${m.semanticSim.toFixed(3)} | Imp: ${(m.importanceScore ?? 0.5).toFixed(2)}]`,
        `   Content: ${m.content.slice(0, 150)}`,
        `   Context: ${m.context || "General"} | Category: ${m.category || "Uncategorized"}`,
        `   Keywords: ${JSON.parse(m.keywords || "[]").join(", ")} | Links: ${JSON.parse(m.links || "[]").length}`,
      ].join("\n")).join("\n\n");
      return `Found ${scored.length} memories:\n\n${results}`;
    } catch (error) {
      return `Failed to recall memories: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "recall_memory",
    description: "Recall memories using hybrid search (semantic similarity + importance score)",
    schema: z.object({
      query: z.string().describe("The query to search for"),
      limit: z.number().optional().describe("Maximum number of memories to return (default: 5)"),
      contextFilter: z.string().optional().describe("Filter by context/domain"),
    }),
  }
);

const getMemoryStatsTool = tool(
  async () => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const stats = await db.select({
        total: sql<number>`COUNT(*)`,
        avgImportance: sql<number>`AVG(importance_score)`,
        totalLinks: sql<number>`SUM(JSON_LENGTH(links))`,
        avgRetrieval: sql<number>`AVG(retrieval_count)`,
      }).from(episodicMemory);
      const topMemories = await db.select({
        id: episodicMemory.id,
        content: episodicMemory.content,
        importanceScore: episodicMemory.importanceScore,
        retrievalCount: episodicMemory.retrievalCount,
        context: episodicMemory.context,
      }).from(episodicMemory).orderBy(desc(episodicMemory.importanceScore)).limit(3);
      const s = stats[0];
      return JSON.stringify({
        total: s.total,
        avgImportance: Number(s.avgImportance).toFixed(3),
        totalZettelkastenLinks: s.totalLinks,
        avgRetrievalCount: Number(s.avgRetrieval).toFixed(1),
        topMemories: topMemories.map(m => ({
          id: m.id, importance: m.importanceScore, retrievals: m.retrievalCount,
          context: m.context, preview: m.content.slice(0, 80),
        })),
      }, null, 2);
    } catch (error) {
      return `Failed to get stats: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "get_memory_stats",
    description: "Get statistics about the A-MEM Zettelkasten memory system",
    schema: z.object({}),
  }
);

// ─── Agent Factory ────────────────────────────────────────────────────────────
export async function createMemoryAgent() {
  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  const tools = [storeMemoryTool, recallMemoryTool, getMemoryStatsTool];

  const agent = createReactAgent({
    llm: model,
    tools,
    messageModifier: `You are MOTHER's Memory Agent, implementing the A-MEM Zettelkasten architecture (arXiv:2502.12110).

Your role is to manage the cognitive memory of the MOTHER system:
- STORE memories with rich semantic metadata (keywords, context, category, tags)
- RECALL memories using hybrid search (semantic similarity + importance score)
- The system automatically EVOLVES memories by creating Zettelkasten links between related notes

When storing, always include the source agent and run_id if available.
When recalling, use contextFilter to narrow down to relevant domains.
Always prefer recall before store to avoid duplicate memories.`,
  });

  return agent;
}
