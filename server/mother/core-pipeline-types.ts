/**
 * Core Pipeline Types — MOTHER v78.0
 * 
 * Shared types for SRP refactoring of core.ts (Fowler 1999, Extract Method).
 * This file is the foundation for the Ciclo 75 refactoring that will split
 * core.ts (2002 lines) into focused modules:
 * 
 * - core-context-builder.ts  → buildContext() [~300 lines]
 * - core-quality-runner.ts   → runQualityPipeline() [~280 lines]
 * - core-learning-loop.ts    → runLearningLoop() [~150 lines]
 * - core.ts                  → orchestrate() entry point [~500 lines]
 * 
 * Scientific basis:
 * - Fowler (1999): "Refactoring: Improving the Design of Existing Code"
 *   Extract Method: "Turn the fragment into a method whose name explains the purpose of the method"
 * - Martin (2008): "Clean Code" — SRP: "A class should have only one reason to change"
 * - SOLID Principles (2025): "extract till you scream" — pull secondary responsibility into own class
 */

import type { RoutingDecision } from './intelligence';

/**
 * Context built from all retrieval sources (CRAG, bd_central, episodic memory, user memory, research).
 * This is the output of the context building phase (Ciclo 75: core-context-builder.ts).
 */
export interface PipelineContext {
  knowledgeContext: string | null;
  cragDocuments: string[];
  episodicContext: string | null;
  userMemoryContext: string | null;
  researchContext: string | null;
  omniscientContext: string | null;
  proactiveContext: string | null;
  metacognitiveStatus: string | null;
  autoKnowledgeContext: string | null;
}

/**
 * Input to the quality pipeline (Ciclo 75: core-quality-runner.ts).
 * All the data needed to run the 12 quality checkers.
 */
export interface QualityPipelineInput {
  query: string;
  response: string;
  routingDecision: RoutingDecision;
  context: PipelineContext;
  onChunk?: ((chunk: string) => void) | null;
  userId?: number;
  userEmail?: string;
}

/**
 * Output of the quality pipeline.
 * The (possibly improved) response after all quality checkers.
 */
export interface QualityPipelineOutput {
  response: string;
  qualityScore: number;
  appliedCheckers: string[];
  skippedCheckers: string[];
  totalLatencyMs: number;
}

/**
 * Full MOTHER request (input to core.ts processQuery).
 */
export interface MotherRequest {
  query: string;
  userId?: number;
  userEmail?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  useCache?: boolean;
  onChunk?: ((chunk: string) => void) | null;
  sessionId?: string;
}

/**
 * Full MOTHER response (output of core.ts processQuery).
 */
export interface MotherResponse {
  response: string;
  metadata?: {
    fromCache?: boolean;
    cacheType?: string;
    tier?: string;
    model?: string;
    provider?: string;
    latencyMs?: number;
    qualityScore?: number;
    abTest?: string;
    version?: string;
    [key: string]: unknown;
  };
}
