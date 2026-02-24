/**
 * MOTHER v39.0: Archive Node
 * 
 * Saves evolution data to the dgm_archive table for historical tracking.
 * Part of the Darwin Gödel Machine (DGM) evolutionary loop.
 * 
 * This node receives the state from ValidationAgent and persists:
 * - generation_id: Unique identifier for this evolution cycle
 * - parent_id: Reference to parent generation (for lineage tracking)
 * - code_snapshot: The generated code
 * - fitness_score: Calculated fitness score (0.0-1.0)
 * - benchmark_results: Detailed execution logs and metrics
 */

import { getDb } from "../db";
import { dgmArchive } from "../../drizzle/schema";
// SupervisorState type will be inferred from supervisor.ts
type SupervisorState = {
  messages: Array<{ role: string; content: string }>;
  currentNode?: string;
  threadId?: string;
  parentId?: string | null;
  [key: string]: any;
};

/**
 * Archive Node Function
 * 
 * Receives state from ValidationAgent and saves to dgm_archive table.
 * 
 * @param state - The current supervisor state
 * @returns Updated state with archive confirmation
 */
export async function archiveNode(state: SupervisorState): Promise<Partial<SupervisorState>> {
  console.log("[ArchiveNode] Archiving evolution data...");
  console.log("[ArchiveNode] Current node:", state.currentNode);
  console.log("[ArchiveNode] Messages count:", state.messages?.length || 0);

  try {
    // Extract data from state
    const generationId = state.threadId || `gen-${Date.now()}`;
    const parentId = state.parentId || null;
    
    // Extract code snapshot from messages
    let codeSnapshot = "No code generated";
    let fitnessScore = 0.0;
    let benchmarkResults = "{}";

    // Parse messages to find code and fitness score
    if (state.messages && state.messages.length > 0) {
      for (const msg of state.messages) {
        const content = typeof msg.content === "string" ? msg.content : "";
        
        // Look for code blocks
        const codeMatch = content.match(/```(?:typescript|ts)?\n([\s\S]+?)\n```/);
        if (codeMatch) {
          codeSnapshot = codeMatch[1];
        }

        // Look for fitness score
        const fitnessMatch = content.match(/Fitness score:\s*([\d.]+)/i);
        if (fitnessMatch) {
          fitnessScore = parseFloat(fitnessMatch[1]);
        }

        // Look for benchmark results
        const resultsMatch = content.match(/Results:\s*(\{[\s\S]+?\})/);
        if (resultsMatch) {
          benchmarkResults = resultsMatch[1];
        }
      }
    }

    // Connect to database and insert record
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const insertResult = await db.insert(dgmArchive).values({
      generationId,
      parentId,
      codeSnapshot,
      fitnessScore,
      benchmarkResults,
      createdAt: new Date(),
    });

    console.log("[ArchiveNode] Successfully archived evolution data");
    console.log("[ArchiveNode] Generation ID:", generationId);
    console.log("[ArchiveNode] Fitness Score:", fitnessScore);
    console.log("[ArchiveNode] Insert result:", insertResult);

    return {
      messages: [
        ...state.messages,
        {
          role: "assistant" as const,
          content: `[ArchiveNode] Evolution data archived successfully. Generation: ${generationId}, Fitness: ${fitnessScore}`,
        },
      ],
      currentNode: "archive",
    };
  } catch (error) {
    console.error("[ArchiveNode] Error archiving evolution data:", error);

    return {
      messages: [
        ...state.messages,
        {
          role: "assistant" as const,
          content: `[ArchiveNode] Error archiving data: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      currentNode: "archive",
    };
  }
}
