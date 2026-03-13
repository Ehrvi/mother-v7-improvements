/**
 * Adaptive Depth Controller — Ensures appropriate response depth for each query type
 * Problem: MANUS always gives deep responses. MOTHER varies with tier (TIER_1 = shallow).
 * Solution: Determine target depth BEFORE generation and enforce it.
 */

import { createLogger } from '../_core/logger';

const log = createLogger('DEPTH_CTRL');

export type DepthLevel = 'concise' | 'standard' | 'deep' | 'comprehensive';

export interface DepthTarget {
  level: DepthLevel;
  minWords: number;
  maxWords: number;
  requiresSections: boolean;
  requiresCitations: boolean;
  requiresExamples: boolean;
  structureTemplate?: string;
}

/**
 * Determine the target depth for a response based on query characteristics.
 */
export function determineDepth(
  query: string,
  category: string,
  complexityScore: number,
  conversationLength: number,
): DepthTarget {
  // Quick factual questions → concise
  if (isSimpleFactual(query)) {
    return {
      level: 'concise',
      minWords: 20,
      maxWords: 150,
      requiresSections: false,
      requiresCitations: false,
      requiresExamples: false,
    };
  }

  // Conversational follow-ups in long conversations → standard (don't over-explain)
  if (conversationLength > 5 && isFollowUp(query)) {
    return {
      level: 'standard',
      minWords: 50,
      maxWords: 400,
      requiresSections: false,
      requiresCitations: false,
      requiresExamples: false,
    };
  }

  // Code generation → deep with examples
  if (category === 'coding' || /\b(implement|code|function|class|component|api|endpoint)\b/i.test(query)) {
    return {
      level: 'deep',
      minWords: 150,
      maxWords: 2000,
      requiresSections: true,
      requiresCitations: false,
      requiresExamples: true,
      structureTemplate: '## Solution\n[code]\n## Explanation\n## Edge Cases',
    };
  }

  // Research/analysis → comprehensive
  if (['research', 'complex_reasoning', 'stem'].includes(category) || complexityScore > 0.7) {
    return {
      level: 'comprehensive',
      minWords: 400,
      maxWords: 3000,
      requiresSections: true,
      requiresCitations: true,
      requiresExamples: true,
      structureTemplate: '## Overview\n## Analysis\n## Evidence\n## Conclusion\n## References',
    };
  }

  // Default → standard
  return {
    level: 'standard',
    minWords: 100,
    maxWords: 800,
    requiresSections: complexityScore > 0.5,
    requiresCitations: ['research', 'complex_reasoning'].includes(category),
    requiresExamples: complexityScore > 0.5,
  };
}

/**
 * Format depth target as instructions for the LLM system prompt.
 */
export function formatDepthInstructions(target: DepthTarget): string {
  const parts: string[] = [];

  parts.push(`Response depth: ${target.level.toUpperCase()}`);
  parts.push(`Target length: ${target.minWords}-${target.maxWords} words`);

  if (target.requiresSections) {
    parts.push('Use markdown sections (## headings)');
  }
  if (target.requiresCitations) {
    parts.push('Include inline citations [1], [2] and a ## References section');
  }
  if (target.requiresExamples) {
    parts.push('Include concrete examples or code snippets');
  }
  if (target.structureTemplate) {
    parts.push(`Suggested structure:\n${target.structureTemplate}`);
  }

  // Anti-patterns for each depth level
  if (target.level === 'concise') {
    parts.push('DO NOT: use lengthy introductions, add unnecessary context, or over-explain');
  } else if (target.level === 'comprehensive') {
    parts.push('DO NOT: give superficial answers, skip analysis, or omit evidence');
  }

  return parts.join('\n');
}

/**
 * Validate that a response meets its depth target.
 */
export function validateDepth(
  response: string,
  target: DepthTarget,
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  const wordCount = response.split(/\s+/).length;

  if (wordCount < target.minWords) {
    issues.push(`Response too short: ${wordCount} words (min: ${target.minWords})`);
  }

  if (target.requiresSections && !/^##\s/m.test(response)) {
    issues.push('Missing markdown sections (## headings required)');
  }

  if (target.requiresCitations && !/\[\d+\]/m.test(response)) {
    issues.push('Missing inline citations ([1], [2] required)');
  }

  if (target.requiresExamples && !/```/.test(response) && !/(?:example|exemplo|e\.g\.|por exemplo)/i.test(response)) {
    issues.push('Missing concrete examples or code snippets');
  }

  const passed = issues.length === 0;
  if (!passed) {
    log.info(`[DepthCtrl] Validation failed: ${issues.join('; ')}`);
  }

  return { passed, issues };
}

function isSimpleFactual(query: string): boolean {
  const patterns = [
    /^(?:what|who|when|where|how\s+(?:many|much|old|long|far))\b/i,
    /^(?:o\s+que|quem|quando|onde|quanto|qual)\b/i,
    /^(?:define|defina|what\s+is|o\s+que\s+(?:é|e|significa))\b/i,
  ];
  // Short query + matches factual pattern
  return query.split(/\s+/).length <= 10 && patterns.some(p => p.test(query));
}

function isFollowUp(query: string): boolean {
  const patterns = [
    /^(?:e\s+|and\s+|but\s+|mas\s+|ok\s+|sim\s+|yes\s+)/i,
    /^(?:continue|continua|go\s+on|prossiga|mais\s+)/i,
    /\b(?:about\s+that|sobre\s+isso|you\s+(?:said|mentioned)|você\s+(?:disse|mencionou))\b/i,
    /^(?:why|por\s*qu[eê])\s*\??\s*$/i,
  ];
  return patterns.some(p => p.test(query));
}
