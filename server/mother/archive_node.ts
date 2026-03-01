/**
 * MOTHER v40.0: Archive Node
 *
 * Saves evolution data to the dgm_archive table for historical tracking.
 * Part of the Darwin Gödel Machine (DGM) evolutionary loop.
 *
 * SCHEMA (verified against production DB mother_v7_prod on 2026-02-24):
 *   id             INT AUTO_INCREMENT PRIMARY KEY
 *   generation_id  VARCHAR(255) NOT NULL
 *   parent_id      VARCHAR(255) NULL
 *   code_snapshot  MEDIUMTEXT NOT NULL
 *   fitness_score  FLOAT NULL
 *   benchmark_results TEXT NULL
 *   created_at     TIMESTAMP NOT NULL DEFAULT now()
 *
 * Scientific basis: Darwin Gödel Machine (Zhang et al., arXiv:2505.22954)
 */

import { getDb } from "../db";
import { dgmArchive } from "../../drizzle/schema";

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
 * Uses the ACTUAL production schema (snake_case, generation_id, code_snapshot, etc.)
 */
export async function archiveNode(state: SupervisorState): Promise<Partial<SupervisorState>> {
  console.log("[ArchiveNode] Archiving evolution data...");
  console.log("[ArchiveNode] Current node:", state.currentNode);
  console.log("[ArchiveNode] Messages count:", state.messages?.length || 0);

  try {
    // Extract data from state
    const generationId = state.threadId || `gen-${Date.now()}`;
    const parentId = state.parentId || null;

    // Extract code snapshot and fitness score from messages
    let codeSnapshot = "No code generated";
    let fitnessScore: number | null = null;
    let benchmarkResults: Record<string, unknown> = {};

    if (state.messages && state.messages.length > 0) {
      for (const msg of state.messages) {
        const content = typeof msg.content === "string" ? msg.content : "";

        // Extract code blocks
        const codeMatch = content.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]+?)\n```/);
        if (codeMatch) {
          codeSnapshot = codeMatch[1];
        }

        // Extract fitness score (e.g. "Fitness score: 0.47" or "fitness_score: 0.85")
        const fitnessMatch = content.match(/[Ff]itness\s*[Ss]core[:\s]+([\d.]+)/i);
        if (fitnessMatch) {
          fitnessScore = parseFloat(fitnessMatch[1]);
        }

        // Extract benchmark results JSON
        const resultsMatch = content.match(/[Bb]enchmark\s*[Rr]esults?[:\s]+(\{[\s\S]+?\})/);
        if (resultsMatch) {
          try {
            benchmarkResults = JSON.parse(resultsMatch[1]);
          } catch {
            benchmarkResults = { raw: resultsMatch[1] };
          }
        }
      }
    }

    // Connect to database
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Insert into dgm_archive using the REAL production schema
    const insertResult = await db.insert(dgmArchive).values({
      generationId,
      parentId,
      codeSnapshot: codeSnapshot.substring(0, 65000), // mediumtext limit safety
      fitnessScore,
      benchmarkResults: Object.keys(benchmarkResults).length > 0
        ? JSON.stringify(benchmarkResults)
        : null,
    });

    console.log("[ArchiveNode] Successfully archived evolution data");
    console.log("[ArchiveNode] Generation ID:", generationId);
    console.log("[ArchiveNode] Fitness Score:", fitnessScore);
    console.log("[ArchiveNode] Insert result:", JSON.stringify(insertResult).substring(0, 100));

    return {
      messages: [
        ...state.messages,
        {
          role: "assistant" as const,
          content: `[ArchiveNode] Evolution data archived successfully. Generation: ${generationId}, Fitness: ${fitnessScore ?? "N/A"}`,
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
