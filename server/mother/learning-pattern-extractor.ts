/**
 * MOTHER v82.0 — Learning Pattern Extractor
 * Subsystem #1: Extracts, stores, and queries behavioural patterns from user interactions.
 *
 * Scientific basis:
 * - Online Learning (Shalev-Shwartz, 2012): "Online Learning and Online Convex Optimization"
 *   Real-time pattern extraction from sequential query streams
 * - FrugalGPT (Chen et al., 2023, arXiv:2305.05176): Pattern-based routing
 *   reduces cost by 40-98% while maintaining quality
 * - Self-Refine (Madaan et al., 2023, arXiv:2303.17651): LLM critiques own outputs
 *   for iterative improvement — patterns inform future routing
 * - RLHF signal (Christiano et al., 2017, arXiv:1706.03741):
 *   user_feedback field drives pattern confidence
 *
 * Architecture:
 * 1. Periodic extraction (every 30 min) from recent queries with feedback
 * 2. Patterns stored in `learning_patterns` table (patternType, pattern JSON, metrics)
 * 3. Routing hints queried before tier assignment for adaptive routing
 * 4. Patterns decay if unused (lastApplied not updated for 30+ days → deactivate)
 *
 * Integration: Called from startup-scheduler; routing hints consumed by intelligence.ts
 */

import { createLogger } from '../_core/logger';
import { getDb } from '../db';
import { sql, eq, desc, and, gte } from 'drizzle-orm';
import { learningPatterns, queries } from '../../drizzle/schema';

const log = createLogger('LearningPatternExtractor');

// ============================================================
// TYPES
// ============================================================

export interface ExtractedPattern {
  patternType: 'query_routing' | 'quality_predictor' | 'cost_optimizer' | 'topic_gap';
  pattern: Record<string, unknown>;
  occurrences: number;
  successRate: number;
  avgQuality: number;
  avgCost: number;
  confidence: number;
}

export interface RoutingHint {
  suggestedTier: string;
  confidence: number;
  basedOnOccurrences: number;
  patternId: number;
}

export interface PatternExtractionResult {
  patternsExtracted: number;
  patternsUpdated: number;
  topicGapsFound: number;
  elapsedMs: number;
}

// ============================================================
// PATTERN EXTRACTION
// ============================================================

/**
 * Main pattern extraction pipeline.
 * Analyzes recent queries with user feedback to identify patterns.
 *
 * Scientific basis: Online Learning — extract patterns from sequential data streams
 * (Shalev-Shwartz, 2012). Patterns are updated incrementally, not retrained from scratch.
 */
export async function extractPatterns(): Promise<PatternExtractionResult> {
  const startTime = Date.now();
  let patternsExtracted = 0;
  let patternsUpdated = 0;
  let topicGapsFound = 0;

  try {
    const db = await getDb();
    if (!db) {
      log.warn('[PatternExtractor] DB not available');
      return { patternsExtracted: 0, patternsUpdated: 0, topicGapsFound: 0, elapsedMs: 0 };
    }

    // 1. Fetch recent queries with feedback (last 200)
    const recentQueries = await db.select({
      tier: queries.tier,
      queryCategory: queries.queryCategory,
      qualityScore: queries.qualityScore,
      cost: queries.cost,
      responseTime: queries.responseTime,
      userFeedback: queries.userFeedback,
      provider: queries.provider,
      modelName: queries.modelName,
    }).from(queries)
      .where(sql`user_feedback IS NOT NULL`)
      .orderBy(desc(queries.createdAt))
      .limit(200);

    if (recentQueries.length < 5) {
      log.info('[PatternExtractor] Not enough feedback data (<5 queries with feedback)');
      return { patternsExtracted: 0, patternsUpdated: 0, topicGapsFound: 0, elapsedMs: Date.now() - startTime };
    }

    // 2. Extract ROUTING patterns — group by tier+category, calculate success rates
    const routingGroups = new Map<string, typeof recentQueries>();
    for (const q of recentQueries) {
      const key = `${q.tier}::${q.queryCategory || 'general'}`;
      if (!routingGroups.has(key)) routingGroups.set(key, []);
      routingGroups.get(key)!.push(q);
    }

    for (const [key, group] of routingGroups) {
      if (group.length < 3) continue; // Need minimum sample size

      const [tier, category] = key.split('::');
      const successRate = group.filter(q => q.userFeedback === 1).length / group.length;
      const avgQuality = mean(group.map(q => parseFloat(q.qualityScore || '0')));
      const avgCost = mean(group.map(q => parseFloat(q.cost || '0')));
      const avgResponseTime = mean(group.map(q => q.responseTime || 0));
      const confidence = group.length >= 20 ? 0.9 : group.length >= 10 ? 0.7 : 0.5;

      const patternData: ExtractedPattern = {
        patternType: 'query_routing',
        pattern: { tier, category, avgResponseTime, provider: group[0]?.provider },
        occurrences: group.length,
        successRate,
        avgQuality,
        avgCost,
        confidence,
      };

      // Upsert pattern — check if similar pattern exists
      const existing = await db.select().from(learningPatterns)
        .where(and(
          eq(learningPatterns.patternType, 'query_routing'),
          sql`JSON_EXTRACT(pattern, '$.tier') = ${tier}`,
          sql`JSON_EXTRACT(pattern, '$.category') = ${category}`,
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(learningPatterns)
          .set({
            pattern: JSON.stringify(patternData.pattern),
            occurrences: patternData.occurrences,
            successRate: String(patternData.successRate),
            avgQuality: String(patternData.avgQuality),
            avgCost: String(patternData.avgCost),
            confidence: String(patternData.confidence),
          })
          .where(eq(learningPatterns.id, existing[0].id));
        patternsUpdated++;
      } else {
        await db.insert(learningPatterns).values({
          patternType: patternData.patternType,
          pattern: JSON.stringify(patternData.pattern),
          occurrences: patternData.occurrences,
          successRate: String(patternData.successRate),
          avgQuality: String(patternData.avgQuality),
          avgCost: String(patternData.avgCost),
          confidence: String(patternData.confidence),
          isActive: 1,
        });
        patternsExtracted++;
      }
    }

    // 3. Extract TOPIC GAP patterns — categories with consistently low quality
    const lowQualityCategories = new Map<string, number>();
    for (const q of recentQueries) {
      const quality = parseFloat(q.qualityScore || '100');
      if (quality < 60) {
        const cat = q.queryCategory || 'general';
        lowQualityCategories.set(cat, (lowQualityCategories.get(cat) || 0) + 1);
      }
    }

    for (const [category, count] of lowQualityCategories) {
      if (count < 3) continue; // Need recurring low quality

      const existing = await db.select().from(learningPatterns)
        .where(and(
          eq(learningPatterns.patternType, 'topic_gap'),
          sql`JSON_EXTRACT(pattern, '$.category') = ${category}`,
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(learningPatterns).values({
          patternType: 'topic_gap',
          pattern: JSON.stringify({ category, lowQualityCount: count, suggestion: 'needs_more_knowledge' }),
          occurrences: count,
          successRate: '0',
          avgQuality: '0',
          confidence: String(count >= 5 ? 0.8 : 0.5),
          isActive: 1,
        });
        topicGapsFound++;
      }
    }

    // 4. Decay inactive patterns — deactivate if not applied in 30 days
    await db.update(learningPatterns)
      .set({ isActive: 0 })
      .where(and(
        eq(learningPatterns.isActive, 1),
        sql`lastApplied IS NOT NULL AND lastApplied < NOW() - INTERVAL 30 DAY`,
      ));

    const elapsed = Date.now() - startTime;
    log.info(`[PatternExtractor] Extracted: ${patternsExtracted} new, ${patternsUpdated} updated, ${topicGapsFound} gaps (${elapsed}ms)`);

    return { patternsExtracted, patternsUpdated, topicGapsFound, elapsedMs: elapsed };
  } catch (err) {
    log.error('[PatternExtractor] Error:', { error: String(err) });
    return { patternsExtracted: 0, patternsUpdated: 0, topicGapsFound: 0, elapsedMs: Date.now() - startTime };
  }
}

// ============================================================
// ROUTING HINTS (query before tier assignment)
// ============================================================

/**
 * Get a routing hint based on learned patterns.
 * Returns the tier with the best success rate for the given query category.
 *
 * Scientific basis: FrugalGPT — learned routing reduces cost while maintaining quality.
 */
export async function getRoutingHint(queryCategory: string): Promise<RoutingHint | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const patterns = await db.select().from(learningPatterns)
      .where(and(
        eq(learningPatterns.patternType, 'query_routing'),
        eq(learningPatterns.isActive, 1),
        sql`JSON_EXTRACT(pattern, '$.category') = ${queryCategory}`,
        gte(learningPatterns.confidence, '0.7'),
      ))
      .orderBy(desc(learningPatterns.successRate))
      .limit(1);

    if (patterns.length === 0) return null;

    const p = patterns[0];
    const patternData = JSON.parse(p.pattern || '{}');

    // Mark as applied
    await db.update(learningPatterns)
      .set({ lastApplied: new Date() })
      .where(eq(learningPatterns.id, p.id));

    return {
      suggestedTier: patternData.tier,
      confidence: parseFloat(p.confidence || '0'),
      basedOnOccurrences: p.occurrences || 0,
      patternId: p.id,
    };
  } catch (err) {
    log.warn('[PatternExtractor] Routing hint query failed:', { error: String(err) });
    return null;
  }
}

/**
 * Get topic gaps — categories where MOTHER consistently has low quality.
 * Used by the Agentic Learning Loop to trigger proactive study.
 */
export async function getTopicGaps(): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const gaps = await db.select().from(learningPatterns)
      .where(and(
        eq(learningPatterns.patternType, 'topic_gap'),
        eq(learningPatterns.isActive, 1),
      ))
      .orderBy(desc(learningPatterns.occurrences))
      .limit(5);

    return gaps.map(g => {
      const data = JSON.parse(g.pattern || '{}');
      return data.category || 'unknown';
    });
  } catch {
    return [];
  }
}

/**
 * Get pattern statistics for diagnostics endpoint.
 */
export async function getPatternStats(): Promise<{
  totalPatterns: number;
  activePatterns: number;
  routingPatterns: number;
  topicGaps: number;
}> {
  try {
    const db = await getDb();
    if (!db) return { totalPatterns: 0, activePatterns: 0, routingPatterns: 0, topicGaps: 0 };

    const all = await db.select({ id: learningPatterns.id, patternType: learningPatterns.patternType, isActive: learningPatterns.isActive })
      .from(learningPatterns);

    return {
      totalPatterns: all.length,
      activePatterns: all.filter(p => p.isActive === 1).length,
      routingPatterns: all.filter(p => p.patternType === 'query_routing').length,
      topicGaps: all.filter(p => p.patternType === 'topic_gap').length,
    };
  } catch {
    return { totalPatterns: 0, activePatterns: 0, routingPatterns: 0, topicGaps: 0 };
  }
}

// ============================================================
// SCHEDULING
// ============================================================

/**
 * Schedule periodic pattern extraction (every 30 min).
 * Scientific basis: Online Learning — continuous adaptation to changing query distributions.
 */
export function schedulePatternExtraction(): void {
  // First run after 10 min (allow queries to accumulate)
  setTimeout(() => {
    extractPatterns().catch(err => log.warn('[PatternExtractor] Scheduled extraction failed', { error: String(err) }));
  }, 10 * 60 * 1000);

  // Then every 30 min
  setInterval(() => {
    extractPatterns().catch(err => log.warn('[PatternExtractor] Periodic extraction failed', { error: String(err) }));
  }, 30 * 60 * 1000);

  log.info('[PatternExtractor] Scheduled (first run in 10min, then every 30min)');
}

// ============================================================
// HELPERS
// ============================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
