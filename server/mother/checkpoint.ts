/**
 * MySqlCheckpointer - Custom checkpointer for TiDB/MySQL
 * 
 * Based on langgraph-checkpoint-mysql reference implementation:
 * https://github.com/tjni/langgraph-checkpoint-mysql
 * 
 * This checkpointer stores LangGraph state in the existing TiDB/MySQL database,
 * enabling persistent, resumable workflows for the MOTHER v34.0 DGM architecture.
 */

import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { getDb } from "../db";
import { langgraphCheckpoints } from "../../drizzle/schema";
import { eq, and, desc, lt } from "drizzle-orm";

/**
 * Custom MySQL/TiDB checkpointer for LangGraph state persistence
 * 
 * Implements the BaseCheckpointSaver interface to store and retrieve
 * graph execution state in the existing database.
 */
export class MySqlCheckpointer extends BaseCheckpointSaver {
  /**
   * Retrieve a checkpoint by thread_id and checkpoint_id
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;

    if (!threadId) {
      throw new Error("thread_id is required in config.configurable");
    }

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Query the database for the checkpoint
      const results = checkpointId
        ? await db
            .select()
            .from(langgraphCheckpoints)
            .where(
              and(
                eq(langgraphCheckpoints.threadId, threadId),
                eq(langgraphCheckpoints.checkpointId, checkpointId)
              )
            )
            .limit(1)
        : await db
            .select()
            .from(langgraphCheckpoints)
            .where(eq(langgraphCheckpoints.threadId, threadId))
            .orderBy(desc(langgraphCheckpoints.createdAt))
            .limit(1);

      if (results.length === 0) {
        return undefined;
      }

      const row = results[0];

      // Parse the stored checkpoint data
      const checkpoint: Checkpoint = JSON.parse(row.checkpointData);
      const metadata: CheckpointMetadata = JSON.parse(row.metadata || "{}");

      return {
        config,
        checkpoint,
        metadata,
        parentConfig: row.parentCheckpointId
          ? {
              configurable: {
                thread_id: threadId,
                checkpoint_id: row.parentCheckpointId,
              },
            }
          : undefined,
      };
    } catch (error) {
      console.error("[MySqlCheckpointer] Error in getTuple:", error);
      return undefined;
    }
  }

  /**
   * List checkpoints for a thread
   */
  async *list(
    config: RunnableConfig,
    options?: { limit?: number; before?: RunnableConfig }
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string;

    if (!threadId) {
      throw new Error("thread_id is required in config.configurable");
    }

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const limit = options?.limit || 10;
      const beforeCheckpointId = options?.before?.configurable?.checkpoint_id as string | undefined;

      const results = beforeCheckpointId
        ? await db
            .select()
            .from(langgraphCheckpoints)
            .where(
              and(
                eq(langgraphCheckpoints.threadId, threadId),
                lt(langgraphCheckpoints.checkpointId, beforeCheckpointId)
              )
            )
            .orderBy(desc(langgraphCheckpoints.createdAt))
            .limit(limit)
        : await db
            .select()
            .from(langgraphCheckpoints)
            .where(eq(langgraphCheckpoints.threadId, threadId))
            .orderBy(desc(langgraphCheckpoints.createdAt))
            .limit(limit);

      for (const row of results) {
        const checkpoint: Checkpoint = JSON.parse(row.checkpointData);
        const metadata: CheckpointMetadata = JSON.parse(row.metadata || "{}");

        yield {
          config: {
            configurable: {
              thread_id: threadId,
              checkpoint_id: row.checkpointId,
            },
          },
          checkpoint,
          metadata,
          parentConfig: row.parentCheckpointId
            ? {
                configurable: {
                  thread_id: threadId,
                  checkpoint_id: row.parentCheckpointId,
                },
              }
            : undefined,
        };
      }
    } catch (error) {
      console.error("[MySqlCheckpointer] Error in list:", error);
    }
  }

  /**
   * Store a checkpoint
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointId = checkpoint.id;
    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined;

    if (!threadId) {
      throw new Error("thread_id is required in config.configurable");
    }

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Serialize checkpoint and metadata
      const checkpointData = JSON.stringify(checkpoint);
      const metadataData = JSON.stringify(metadata);

      // Insert into database
      await db.insert(langgraphCheckpoints).values({
        threadId,
        checkpointId,
        parentCheckpointId: parentCheckpointId || null,
        checkpointData,
        metadata: metadataData,
      });

      return {
        configurable: {
          thread_id: threadId,
          checkpoint_id: checkpointId,
        },
      };
    } catch (error) {
      console.error("[MySqlCheckpointer] Error in put:", error);
      throw error;
    }
  }

  /**
   * Store pending writes for a checkpoint
   * 
   * Note: This is a simplified implementation. In a production system,
   * you would store pending writes in a separate table.
   */
  async putWrites(
    config: RunnableConfig,
    writes: [string, unknown][],
    taskId: string
  ): Promise<void> {
    // For now, we'll store pending writes as part of the checkpoint metadata
    // In a production system, you would create a separate table for pending writes
    console.log("[MySqlCheckpointer] putWrites called with", writes.length, "writes for task", taskId);
    
    // This is a no-op for now, as pending writes are typically handled
    // by the graph execution logic, not the checkpointer
  }

  /**
   * Delete all checkpoints for a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(langgraphCheckpoints)
        .where(eq(langgraphCheckpoints.threadId, threadId));

      console.log(`[MySqlCheckpointer] Deleted all checkpoints for thread ${threadId}`);
    } catch (error) {
      console.error("[MySqlCheckpointer] Error in deleteThread:", error);
      throw error;
    }
  }
}
