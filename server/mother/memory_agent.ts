/**
 * MOTHER v35.0: Memory Agent
 * 
 * Manages episodic memory using the A-MEM (Associative Memory) pattern.
 * Stores and retrieves memories with embeddings for semantic search.
 * 
 * Based on:
 * - Mem0 (https://github.com/mem0ai/mem0)
 * - A-MEM pattern from cognitive architecture literature
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { getDb } from "../db";
import { episodicMemory } from "../../drizzle/schema";
import { getEmbedding, cosineSimilarity } from "./embeddings";

/**
 * Placeholder tool: Store Memory
 * 
 * In production, this would:
 * 1. Generate embedding for the content using OpenAI text-embedding-3-small
 * 2. Store in episodic_memory table with metadata
 * 3. Return the memory ID
 */
const storeMemoryTool = tool(
  async ({ content, tags }) => {
    console.log("[MemoryAgent] Storing memory:", content);
    console.log("[MemoryAgent] Tags:", tags);

    try {
      // Generate embedding for the content
      const embedding = await getEmbedding(content);

      // Store in database
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(episodicMemory).values({
        content,
        embedding: JSON.stringify(embedding),
        metadata: JSON.stringify({ tags }),
      });

      return `Memory stored successfully. Content: "${content}", Tags: ${tags.join(", ")}`;
    } catch (error) {
      console.error("[MemoryAgent] Error storing memory:", error);
      return `Failed to store memory: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "store_memory",
    description: "Store a memory with tags for later retrieval",
    schema: z.object({
      content: z.string().describe("The memory content to store"),
      tags: z.array(z.string()).describe("Tags for categorizing the memory"),
    }),
  }
);

/**
 * Real tool: Recall Memory
 * 
 * Implements:
 * 1. Generate embedding for the query
 * 2. Search episodic_memory table using cosine similarity
 * 3. Return top-k most relevant memories
 */
const recallMemoryTool = tool(
  async ({ query, limit }) => {
    console.log("[MemoryAgent] Recalling memories for query:", query);
    console.log("[MemoryAgent] Limit:", limit);

    try {
      // Generate embedding for the query
      const queryEmbedding = await getEmbedding(query);

      // Search database
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all memories (simplified - in production, use vector search)
      const memories = await db.select().from(episodicMemory).limit(100);

      // Calculate cosine similarity for each memory
      const memoriesWithSimilarity = memories.map((memory) => {
        const memoryEmbedding = JSON.parse(memory.embedding || "[]");
        const similarity = cosineSimilarity(queryEmbedding, memoryEmbedding);
        return { ...memory, similarity };
      });

      // Sort by similarity and take top-k
      const topMemories = memoriesWithSimilarity
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      if (topMemories.length === 0) {
        return `No relevant memories found for query: "${query}"`;
      }

      // Format results
      const results = topMemories
        .map(
          (m, i) =>
            `${i + 1}. [Similarity: ${m.similarity.toFixed(3)}] ${m.content}`
        )
        .join("\n");

      return `Found ${topMemories.length} relevant memories:\n${results}`;
    } catch (error) {
      console.error("[MemoryAgent] Error recalling memories:", error);
      return `Failed to recall memories: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "recall_memory",
    description: "Recall memories related to a query using semantic search",
    schema: z.object({
      query: z.string().describe("The query to search for"),
      limit: z.number().describe("Maximum number of memories to return").default(5),
    }),
  }
);

/**
 * Create the Memory Agent using createReactAgent
 */
export async function createMemoryAgent() {
  const model = new ChatOpenAI({ model: "gpt-4o-mini" });
  const tools = [storeMemoryTool, recallMemoryTool];

  const agent = createReactAgent({
    llm: model,
    tools,
  });

  return agent;
}
