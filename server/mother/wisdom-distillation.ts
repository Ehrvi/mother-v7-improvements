/**
 * MOTHER v82.0 — Wisdom Distillation Pipeline
 * Subsystem #2: Periodically synthesizes high-level insights from accumulated knowledge.
 *
 * Scientific basis:
 * - Park et al. (2023, arXiv:2304.03442) "Generative Agents": Periodic reflection
 *   synthesizes insights from accumulated facts, enabling higher-order reasoning
 * - SleepGate (Xie, 2026, arXiv:2603.14517): Sleep-inspired memory consolidation
 *   reduces proactive interference from O(n) to O(log n)
 * - SimpleMem (2026): Semantic lossless compression + recursive consolidation
 *   improves accuracy while reducing token consumption
 * - Selective Reflection Distillation (Li et al., 2025): Leveraging reflections
 *   from student models to refine training data
 *
 * Architecture:
 * 1. Load recent knowledge entries grouped by domain
 * 2. LLM synthesizes 2-3 high-level insights per domain
 * 3. Store insights in `knowledge_wisdom` table with source IDs and confidence
 * 4. Optional: flag superseded low-level facts for archival (SleepGate phase)
 *
 * Storage: `knowledge_wisdom` table (previously empty — this module populates it)
 * Schedule: Every 24 hours via startup-scheduler
 */

import { createLogger } from '../_core/logger';
import { invokeLLM } from '../_core/llm';
import { getDb } from '../db';
import { sql, desc, eq } from 'drizzle-orm';
import { knowledge, knowledgeWisdom } from '../../drizzle/schema';

const log = createLogger('WisdomDistillation');

// ============================================================
// TYPES
// ============================================================

export interface WisdomInsight {
  insight: string;
  sourceIds: number[];
  confidence: number;
  domain: string;
}

export interface DistillationResult {
  insightsCreated: number;
  domainsProcessed: number;
  factsAnalyzed: number;
  staleFactsFlagged: number;
  elapsedMs: number;
}

// ============================================================
// MAIN DISTILLATION PIPELINE
// ============================================================

/**
 * Main wisdom distillation pipeline.
 * Analyzes accumulated knowledge by domain and synthesizes high-level insights.
 *
 * Scientific basis: Park et al. (2023) — "Reflection is the process of synthesizing
 * memories into higher-level inferences that can be used to guide future behavior."
 */
export async function distillWisdom(): Promise<DistillationResult> {
  const startTime = Date.now();
  let insightsCreated = 0;
  let domainsProcessed = 0;
  let factsAnalyzed = 0;
  let staleFactsFlagged = 0;

  try {
    const db = await getDb();
    if (!db) {
      log.warn('[WisdomDistillation] DB not available');
      return { insightsCreated: 0, domainsProcessed: 0, factsAnalyzed: 0, staleFactsFlagged: 0, elapsedMs: 0 };
    }

    // 1. Fetch recent knowledge entries (last 300)
    const facts = await db.select({
      id: knowledge.id,
      title: knowledge.title,
      content: knowledge.content,
      domain: knowledge.domain,
      category: knowledge.category,
      accessCount: knowledge.accessCount,
      createdAt: knowledge.createdAt,
    }).from(knowledge)
      .orderBy(desc(knowledge.createdAt))
      .limit(300);

    if (facts.length < 10) {
      log.info('[WisdomDistillation] Not enough facts (<10) for distillation');
      return { insightsCreated: 0, domainsProcessed: 0, factsAnalyzed: facts.length, staleFactsFlagged: 0, elapsedMs: Date.now() - startTime };
    }

    factsAnalyzed = facts.length;

    // 2. Group by domain
    const byDomain = new Map<string, typeof facts>();
    for (const fact of facts) {
      const domain = fact.domain || 'Conhecimento Geral';
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain)!.push(fact);
    }

    // 3. For each domain with enough facts, synthesize insights
    for (const [domain, domainFacts] of byDomain) {
      if (domainFacts.length < 5) continue; // Need minimum for meaningful synthesis
      domainsProcessed++;

      // Check if we already have recent wisdom for this domain (skip if <7 days old)
      const existingWisdom = await db.select({ id: knowledgeWisdom.id, createdAt: knowledgeWisdom.createdAt })
        .from(knowledgeWisdom)
        .where(eq(knowledgeWisdom.domain, domain))
        .orderBy(desc(knowledgeWisdom.createdAt))
        .limit(1);

      if (existingWisdom.length > 0 && existingWisdom[0].createdAt) {
        const daysSince = (Date.now() - existingWisdom[0].createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) continue; // Skip — wisdom is fresh
      }

      // Prepare fact summaries for LLM (limit to top 20 per domain)
      const factSummaries = domainFacts.slice(0, 20).map(f =>
        `[ID:${f.id}] ${f.title}: ${String(f.content || '').slice(0, 150)}`
      ).join('\n');

      const prompt = `You are a knowledge synthesis expert. Analyze these ${domainFacts.length} facts from the domain "${domain}" and synthesize 2-3 HIGH-LEVEL INSIGHTS.

Each insight must be an observation that is NOT directly stated in any single fact — it should CONNECT multiple facts into a higher-order understanding.

Facts:
${factSummaries}

Return a JSON array (only the array, no markdown):
[
  {
    "insight": "The high-level insight text (1-2 sentences)",
    "sourceIds": [list of fact IDs that support this insight],
    "confidence": 0.0-1.0
  }
]

Be conservative. Only output insights you are confident about. Return ONLY the JSON array.`;

      try {
        const result = await invokeLLM({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 600,
        });

        const content = typeof result === 'string' ? result :
          (typeof result?.choices?.[0]?.message?.content === 'string'
            ? result.choices[0].message.content : '');
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const insights: WisdomInsight[] = JSON.parse(jsonMatch[0]);
          for (const insight of insights) {
            if (!insight.insight || insight.confidence < 0.5) continue;

            await db.insert(knowledgeWisdom).values({
              insight: insight.insight,
              sourceIds: JSON.stringify(insight.sourceIds || []),
              confidenceScore: insight.confidence,
              domain,
            });
            insightsCreated++;
          }
        }
      } catch (llmErr) {
        log.warn(`[WisdomDistillation] LLM synthesis failed for domain "${domain}"`, { error: String(llmErr) });
      }
    }

    // 4. SLEEP PHASE — Flag stale facts (SleepGate-inspired)
    // Facts with accessCount=0 and age > 90 days → flag for review
    const staleResult = await db.execute(sql`
      UPDATE knowledge
      SET tags = CONCAT(COALESCE(tags, '[]'), ',"stale_review"')
      WHERE accessCount = 0
      AND createdAt < NOW() - INTERVAL 90 DAY
      AND (tags IS NULL OR tags NOT LIKE '%stale_review%')
      LIMIT 50
    `);
    staleFactsFlagged = (staleResult as any)?.affectedRows || 0;

    const elapsed = Date.now() - startTime;
    log.info(`[WisdomDistillation] Complete: ${insightsCreated} insights, ${domainsProcessed} domains, ${staleFactsFlagged} stale flagged (${elapsed}ms)`);

    return { insightsCreated, domainsProcessed, factsAnalyzed, staleFactsFlagged, elapsedMs: elapsed };
  } catch (err) {
    log.error('[WisdomDistillation] Pipeline error:', { error: String(err) });
    return { insightsCreated: 0, domainsProcessed: 0, factsAnalyzed: 0, staleFactsFlagged: 0, elapsedMs: Date.now() - startTime };
  }
}

// ============================================================
// WISDOM RETRIEVAL
// ============================================================

/**
 * Retrieve wisdom insights for a given domain.
 * Used by knowledge.ts to augment context with higher-order understanding.
 */
export async function getWisdomForDomain(domain: string, limit = 3): Promise<WisdomInsight[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select().from(knowledgeWisdom)
      .where(eq(knowledgeWisdom.domain, domain))
      .orderBy(desc(knowledgeWisdom.createdAt))
      .limit(limit);

    return rows.map(r => ({
      insight: r.insight,
      sourceIds: JSON.parse(r.sourceIds || '[]'),
      confidence: r.confidenceScore || 0.5,
      domain: r.domain || domain,
    }));
  } catch {
    return [];
  }
}

/**
 * Get wisdom statistics for diagnostics.
 */
export async function getWisdomStats(): Promise<{
  totalInsights: number;
  domains: string[];
  avgConfidence: number;
}> {
  try {
    const db = await getDb();
    if (!db) return { totalInsights: 0, domains: [], avgConfidence: 0 };

    const all = await db.select({
      domain: knowledgeWisdom.domain,
      confidence: knowledgeWisdom.confidenceScore,
    }).from(knowledgeWisdom);

    const domains = [...new Set(all.map(r => r.domain).filter(Boolean) as string[])];
    const avgConfidence = all.length > 0
      ? all.reduce((sum, r) => sum + (r.confidence || 0), 0) / all.length
      : 0;

    return { totalInsights: all.length, domains, avgConfidence };
  } catch {
    return { totalInsights: 0, domains: [], avgConfidence: 0 };
  }
}

// ============================================================
// SCHEDULING
// ============================================================

/**
 * Schedule wisdom distillation (every 24 hours).
 * Scientific basis: Park et al. (2023) — periodic reflection windows.
 */
export function scheduleWisdomDistillation(): void {
  // First run after 30 min (allow system to warm up)
  setTimeout(() => {
    distillWisdom().catch(err => log.warn('[WisdomDistillation] Scheduled distillation failed', { error: String(err) }));
  }, 30 * 60 * 1000);

  // Then every 24 hours
  setInterval(() => {
    distillWisdom().catch(err => log.warn('[WisdomDistillation] Periodic distillation failed', { error: String(err) }));
  }, 24 * 60 * 60 * 1000);

  log.info('[WisdomDistillation] Scheduled (first run in 30min, then every 24h)');
}
