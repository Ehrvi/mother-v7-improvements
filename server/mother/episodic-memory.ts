/**
 * MOTHER v79.0: Episodic Memory — NC-MEMORY-001
 *
 * Implements episodic memory for MOTHER's agent loop.
 * Stores action-result pairs so MOTHER can learn from past successes and failures.
 *
 * Scientific basis:
 * - Reflexion (Shinn et al., arXiv:2303.11366, 2023): Language agents with verbal
 *   reinforcement learning. Agents reflect on failures and store reflections in
 *   episodic memory for future use. No gradient updates needed.
 * - A-MEM (Xu et al., arXiv:2502.12110, 2025): Agentic memory for LLM agents.
 *   Dynamic memory organization with contextual links between memories.
 * - Self-Evolving AI Agents Survey (arXiv:2508.07407, 2025): Three paradigms —
 *   experience accumulation, self-refinement, behavior optimization.
 *   Episodic memory is the foundation of experience accumulation.
 *
 * Storage: bd_central via /api/a2a/knowledge with category='episodic_memory'
 * Namespace: 'episodic:' prefix in title for easy filtering
 *
 * Ciclo 107 — Fase 1: Episodic memory for Milestone Zero tracking
 */

import { createLogger } from '../_core/logger';
const log = createLogger('EpisodicMemory');

// ============================================================
// TYPES
// ============================================================

export interface EpisodicEntry {
  taskId: string;
  task: string;
  action: string;
  filePath?: string;
  result: 'success' | 'failure' | 'partial';
  reflection?: string;
  commitHash?: string;
  sandboxPassed?: boolean;
  iterationCount: number;
  durationMs: number;
  timestamp: string;
  tags?: string[];
}

export interface EpisodicSearchResult {
  entries: EpisodicEntry[];
  relevantReflections: string[];
}

// ============================================================
// STORAGE FUNCTIONS
// ============================================================

const MOTHER_BASE_URL = process.env.MOTHER_BASE_URL ||
  'https://mother-interface-qtvghovzxa-ts.a.run.app';

/**
 * Store an episodic memory entry in bd_central.
 * Uses the knowledge API with category='episodic_memory'.
 */
export async function storeEpisodicMemory(entry: EpisodicEntry): Promise<number | null> {
  try {
    const response = await fetch(`${MOTHER_BASE_URL}/api/a2a/knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.MANUS_A2A_TOKEN
          ? { Authorization: `Bearer ${process.env.MANUS_A2A_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        title: `episodic:${entry.taskId}:${entry.action}:${entry.result}`,
        content: JSON.stringify(entry),
        category: 'episodic_memory',
        tags: [
          'episodic',
          entry.result,
          entry.action,
          ...(entry.tags || []),
        ],
      }),
    });

    if (!response.ok) {
      log.warn('EpisodicMemory: Failed to store entry', {
        taskId: entry.taskId,
        status: response.status,
      });
      return null;
    }

    const data = await response.json() as { id?: number };
    log.info('EpisodicMemory: Stored', { taskId: entry.taskId, id: data.id });
    return data.id || null;
  } catch (err) {
    log.error('EpisodicMemory: Storage error', { error: String(err) });
    return null;
  }
}

/**
 * Retrieve recent episodic memories for context.
 * Used by supervisor to avoid repeating failed approaches.
 */
export async function getRecentEpisodicMemories(
  limit = 10
): Promise<EpisodicEntry[]> {
  try {
    const response = await fetch(
      `${MOTHER_BASE_URL}/api/a2a/knowledge?category=episodic_memory&limit=${limit}`,
      {
        headers: process.env.MANUS_A2A_TOKEN
          ? { Authorization: `Bearer ${process.env.MANUS_A2A_TOKEN}` }
          : {},
      }
    );

    if (!response.ok) return [];

    const data = await response.json() as { items?: Array<{ content?: string }> };
    const items = data.items || [];

    return items
      .map(item => {
        try {
          return JSON.parse(item.content || '{}') as EpisodicEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as EpisodicEntry[];
  } catch (err) {
    log.error('EpisodicMemory: Retrieval error', { error: String(err) });
    return [];
  }
}

/**
 * Generate a Reflexion-style reflection for a failed task.
 * Returns a natural language reflection that can be prepended to the next attempt.
 *
 * Based on Reflexion (Shinn et al., 2023): "The agent reflects on its failure
 * and stores the reflection in episodic memory for future use."
 */
export function generateReflection(entry: EpisodicEntry): string {
  if (entry.result === 'success') {
    return `Previous attempt succeeded: ${entry.task} → ${entry.action} (commit: ${entry.commitHash || 'N/A'})`;
  }

  const parts = [
    `Previous attempt FAILED: ${entry.task}`,
    `Action taken: ${entry.action}`,
    entry.filePath ? `File: ${entry.filePath}` : '',
    entry.sandboxPassed === false ? 'Sandbox test failed — code had errors' : '',
    `Duration: ${entry.durationMs}ms`,
    entry.reflection ? `Reflection: ${entry.reflection}` : '',
    'Avoid repeating the same approach. Try a different strategy.',
  ].filter(Boolean);

  return parts.join('. ');
}
