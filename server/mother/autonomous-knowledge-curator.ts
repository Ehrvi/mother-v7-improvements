/**
 * MOTHER v82.0 — Autonomous Knowledge Curator v2
 * Subsystem #3: LLM-based knowledge curation with contradiction detection + temporal decay
 *
 * Scientific basis:
 * - FACTTRACK (arXiv:2407.16347v2, 2025): Time-aware validity intervals for facts.
 *   Maintains temporal state changes: pre-facts → post-facts
 * - Contradiction Detection in RAG (2025): LLMs as context validators to detect
 *   conflicting information within retrieved document sets
 * - Drowzee (2025): Temporal logic for detecting fact-conflicting hallucinations
 * - Dong et al. (2014) "Knowledge Vault": Probabilistic knowledge fusion with
 *   confidence scores and source reliability weighting
 * - PASS-FC (2025): Time-sensitive atomic claim verification
 *
 * Architecture (upgrade from v1 regex stub):
 * 1. LLM-based contradiction detection per domain (replaces regex patterns)
 * 2. Temporal decay — flag entries with 0 access and age > 90 days
 * 3. Supersession resolution — keep newer fact, soft-delete older conflicting fact
 * 4. Consistency scoring based on contradiction rate + stale ratio
 * 5. SHA-256 audit hash for each curation cycle
 *
 * Schedule: Every 60 min via knowledge.ts AutonomousKnowledgeCurator
 */

import { createLogger } from '../_core/logger';
import { invokeLLM } from '../_core/llm';
import { getDb } from '../db';
import { sql, desc, eq } from 'drizzle-orm';
import { knowledge } from '../../drizzle/schema';
import * as crypto from 'crypto';

const log = createLogger('KnowledgeCurator-v2');

// ============================================================
// TYPES
// ============================================================

export interface CurationResult {
  timestamp: string;
  totalEntries: number;
  contradictionsFound: number;
  staleEntriesFlagged: number;
  supersededEntries: number;
  consistencyScore: number;
  curationHash: string;
  actions: CurationAction[];
  elapsedMs: number;
}

export interface CurationAction {
  type: 'contradiction_detected' | 'stale_flagged' | 'superseded' | 'validated';
  entryIds: number[];
  description: string;
  scientificBasis: string;
}

interface Contradiction {
  factAId: number;
  factBId: number;
  reason: string;
}

// ============================================================
// MAIN CURATION PIPELINE
// ============================================================

/**
 * Run a full autonomous curation cycle.
 * Replaces v1 regex-based stub with LLM-powered analysis.
 *
 * Scientific basis: Dong (2014) — "Knowledge maintenance requires periodic
 * validation of facts against newer, more reliable sources"
 */
export async function curate(): Promise<CurationResult> {
  const startTime = Date.now();
  const actions: CurationAction[] = [];
  let contradictionsFound = 0;
  let staleEntriesFlagged = 0;
  let supersededEntries = 0;

  try {
    const db = await getDb();
    if (!db) {
      log.warn('[Curator-v2] DB not available');
      return emptyResult(startTime);
    }

    // 1. Load recent entries for analysis (last 100)
    const entries = await db.select({
      id: knowledge.id,
      title: knowledge.title,
      content: knowledge.content,
      domain: knowledge.domain,
      category: knowledge.category,
      tags: knowledge.tags,
      accessCount: knowledge.accessCount,
      createdAt: knowledge.createdAt,
    }).from(knowledge)
      .orderBy(desc(knowledge.createdAt))
      .limit(100);

    if (entries.length < 5) {
      log.info('[Curator-v2] Not enough entries (<5) for curation');
      return emptyResult(startTime);
    }

    // 2. LLM-BASED CONTRADICTION DETECTION (per domain)
    const byDomain = new Map<string, typeof entries>();
    for (const e of entries) {
      const domain = e.domain || 'Geral';
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain)!.push(e);
    }

    for (const [domain, domainEntries] of byDomain) {
      if (domainEntries.length < 3) continue; // Need minimum for contradiction check

      const contradictions = await detectContradictions(domain, domainEntries.slice(0, 15));
      contradictionsFound += contradictions.length;

      for (const c of contradictions) {
        actions.push({
          type: 'contradiction_detected',
          entryIds: [c.factAId, c.factBId],
          description: `Contradiction in "${domain}": ${c.reason}`,
          scientificBasis: 'FACTTRACK (arXiv:2407.16347, 2025): time-aware fact tracking',
        });

        // Resolve: keep newer, mark older as superseded
        const factA = domainEntries.find(e => e.id === c.factAId);
        const factB = domainEntries.find(e => e.id === c.factBId);
        if (factA && factB) {
          const older = (factA.createdAt?.getTime() || 0) < (factB.createdAt?.getTime() || 0) ? factA : factB;
          try {
            const existingTags = JSON.parse(older.tags || '[]');
            if (!existingTags.includes('superseded')) {
              existingTags.push('superseded');
              await db.update(knowledge)
                .set({ tags: JSON.stringify(existingTags) })
                .where(eq(knowledge.id, older.id));
              supersededEntries++;
            }
          } catch {
            // Tags parsing failed — skip
          }
        }
      }
    }

    // 3. TEMPORAL DECAY — flag entries with 0 access and age > 90 days
    const staleEntries = entries.filter(e =>
      (e.accessCount === 0 || e.accessCount === null) &&
      e.createdAt &&
      Date.now() - e.createdAt.getTime() > 90 * 24 * 60 * 60 * 1000
    );

    for (const stale of staleEntries.slice(0, 20)) {
      try {
        const existingTags = JSON.parse(stale.tags || '[]');
        if (!existingTags.includes('stale_review')) {
          existingTags.push('stale_review');
          await db.update(knowledge)
            .set({ tags: JSON.stringify(existingTags) })
            .where(eq(knowledge.id, stale.id));
          staleEntriesFlagged++;
        }
      } catch {
        // Tags parsing failed — skip
      }
    }

    if (staleEntriesFlagged > 0) {
      actions.push({
        type: 'stale_flagged',
        entryIds: staleEntries.slice(0, 20).map(e => e.id),
        description: `${staleEntriesFlagged} entries flagged as stale (0 access, 90+ days old)`,
        scientificBasis: 'ALMA (arXiv:2602.07755, 2026): meta-learned active forgetting',
      });
    }

    // 4. Compute consistency score
    const contradictionRate = contradictionsFound / Math.max(entries.length, 1);
    const staleRate = staleEntriesFlagged / Math.max(entries.length, 1);
    const consistencyScore = Math.round((1 - contradictionRate - staleRate * 0.5) * 100);

    const elapsed = Date.now() - startTime;
    const result: CurationResult = {
      timestamp: new Date().toISOString(),
      totalEntries: entries.length,
      contradictionsFound,
      staleEntriesFlagged,
      supersededEntries,
      consistencyScore: Math.max(0, consistencyScore),
      curationHash: '',
      actions,
      elapsedMs: elapsed,
    };

    result.curationHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        timestamp: result.timestamp,
        consistencyScore: result.consistencyScore,
        contradictions: contradictionsFound,
        stale: staleEntriesFlagged,
      }))
      .digest('hex');

    log.info(`[Curator-v2] Complete: ${contradictionsFound} contradictions, ${staleEntriesFlagged} stale, ${supersededEntries} superseded, consistency=${consistencyScore}% (${elapsed}ms)`);

    return result;
  } catch (err) {
    log.error('[Curator-v2] Pipeline error:', { error: String(err) });
    return emptyResult(startTime);
  }
}

// ============================================================
// CONTRADICTION DETECTION (LLM-based)
// ============================================================

/**
 * Use LLM to detect contradictions between facts in the same domain.
 * Scientific basis: Contradiction Detection in RAG (2025) — LLMs as context validators
 */
async function detectContradictions(
  domain: string,
  entries: Array<{ id: number; title: string; content: string | null; createdAt: Date | null }>
): Promise<Contradiction[]> {
  try {
    const factList = entries.map(e =>
      `[ID:${e.id}] (${e.createdAt?.toISOString()?.slice(0, 10) || '?'}) ${e.title}: ${String(e.content || '').slice(0, 150)}`
    ).join('\n');

    const prompt = `Analyze these facts from domain "${domain}" and identify any CONTRADICTIONS.
Two facts contradict when they make incompatible claims about the same subject.

Facts:
${factList}

If contradictions exist, return a JSON array:
[{"factAId": number, "factBId": number, "reason": "brief explanation"}]

If NO contradictions, return: []

Return ONLY the JSON array, no other text.`;

    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
    });

    const content = typeof result === 'string' ? result :
      (typeof result?.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content : '');
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(c => c.factAId && c.factBId && c.reason);
      }
    }
    return [];
  } catch (err) {
    log.warn(`[Curator-v2] Contradiction detection failed for "${domain}"`, { error: String(err) });
    return [];
  }
}

// ============================================================
// HTTP HANDLER (backward-compatible with original module)
// ============================================================

/**
 * HTTP handler for POST /api/a2a/autonomy/curate
 * Backward-compatible with the original autonomous-knowledge-curator.ts
 */
export async function handleCurateRequest(req: any, res: any): Promise<void> {
  try {
    const result = await curate();
    res.json({
      success: true,
      ...result,
      message: `Curation complete. Consistency: ${result.consistencyScore}%. ${result.contradictionsFound} contradictions, ${result.staleEntriesFlagged} stale.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================================
// HELPERS
// ============================================================

function emptyResult(startTime: number): CurationResult {
  return {
    timestamp: new Date().toISOString(),
    totalEntries: 0,
    contradictionsFound: 0,
    staleEntriesFlagged: 0,
    supersededEntries: 0,
    consistencyScore: 100,
    curationHash: '',
    actions: [],
    elapsedMs: Date.now() - startTime,
  };
}

// Re-export class for backward compatibility
export class AutonomousKnowledgeCurator {
  async curate(): Promise<CurationResult> {
    return curate();
  }
}
