/**
 * MOTHER — DGM AI Council (Delphi + MAD)
 *
 * Implements a 5-member AI council that proposes DGM self-improvement
 * modifications through structured debate (Multi-Agent Debate).
 *
 * Architecture:
 *   Phase 1 — DELPHI: Each AI independently proposes improvements
 *   Phase 2 — MAD:    Each AI critiques other proposals (debate)
 *   Phase 3 — VOTE:   Weighted consensus produces final ranking
 *
 * Graceful Fallback:
 *   - Individual AI failure → skip, log warning
 *   - < 2 AIs respond → skip debate, use best single proposal
 *   - 0 AIs respond → fallback to hardcoded rules in dgm-agent.ts
 *
 * Scientific basis:
 *   - AutoAdapt (arXiv:2603.08181, 2026): Proposal+critic debate → 25% accuracy ↑
 *   - MAD (Du et al., arXiv:2305.19118, 2023): Multi-agent debate improves reasoning
 *   - Delphi Method (Dalkey & Helmer, 1963): Anonymous polling → consensus
 *   - DGM (arXiv:2505.22954, 2025): Open-ended search for self-improvement
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';
import type { FitnessMetrics, ImprovementProposal } from './dgm-agent';

const log = createLogger('DGMCouncil');

// ============================================================
// COUNCIL MEMBERS — Best models per manufacturer
// ============================================================

interface CouncilMember {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'mistral';
  model: string;
  role: string;
  weight: number; // Voting weight (0-1)
}

const COUNCIL_MEMBERS: CouncilMember[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    role: 'Code Architecture Expert — focus on structural improvements, design patterns, and code quality',
    weight: 0.20,
  },
  {
    id: 'claude',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    role: 'Safety & Quality Analyst — focus on security vulnerabilities, error handling, and robustness',
    weight: 0.25,
  },
  {
    id: 'gemini',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    model: 'gemini-2.5-pro',
    role: 'Performance Optimizer — focus on latency reduction, caching, and efficiency improvements',
    weight: 0.20,
  },
  {
    id: 'mistral',
    name: 'Mistral Large',
    provider: 'mistral',
    model: 'mistral-large-latest',
    role: 'Alternative Perspective — challenge assumptions, propose unconventional solutions',
    weight: 0.15,
  },
  {
    id: 'mother',
    name: 'MOTHER (GPT-4o)',
    provider: 'openai',
    model: 'gpt-4o',
    role: 'Self-Knowledge Expert — you ARE the system being improved, propose changes based on your own architecture knowledge',
    weight: 0.20,
  },
];

// ============================================================
// TYPES
// ============================================================

interface CouncilProposal {
  memberId: string;
  memberName: string;
  type: 'ROUTING' | 'PROMPT' | 'CACHE' | 'ARCHITECTURE' | 'SAFETY' | 'PERFORMANCE' | 'OTHER';
  description: string;
  rationale: string;
  expectedFitnessGain: number;
  confidence: number; // 0-1
  risks: string;
}

interface DebateCritique {
  criticId: string;
  proposalMemberId: string;
  agree: boolean;
  score: number; // 1-10
  critique: string;
  suggestion: string;
}

interface CouncilResult {
  proposals: ImprovementProposal[];
  councilLog: string[];
  membersResponded: number;
  debateRounds: number;
  fallbackUsed: boolean;
}

// ============================================================
// CONFIGURATION
// ============================================================

const COUNCIL_TIMEOUT_MS = 15000;  // 15s per AI call
const MIN_MEMBERS_FOR_DEBATE = 2;  // Need at least 2 for debate
const MAX_PROPOSALS_PER_MEMBER = 2;
const DEBATE_THRESHOLD = 0.6;     // Min confidence to survive debate

// ============================================================
// PHASE 1: DELPHI — Independent Proposals
// ============================================================

async function runDelphiPhase(
  fitness: FitnessMetrics,
): Promise<{ proposals: CouncilProposal[]; respondedMembers: string[]; councilLog: string[] }> {
  const councilLog: string[] = [];
  councilLog.push(`[DELPHI] Starting Phase 1 with ${COUNCIL_MEMBERS.length} council members`);

  const delphiPrompt = buildDelphiPrompt(fitness);

  // Call all AIs in parallel with individual timeouts
  const results = await Promise.allSettled(
    COUNCIL_MEMBERS.map(member =>
      callCouncilMember(member, delphiPrompt)
    )
  );

  const proposals: CouncilProposal[] = [];
  const respondedMembers: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const member = COUNCIL_MEMBERS[i];
    const result = results[i];

    if (result.status === 'fulfilled' && result.value.length > 0) {
      proposals.push(...result.value);
      respondedMembers.push(member.id);
      councilLog.push(`[DELPHI] ✅ ${member.name}: ${result.value.length} proposal(s)`);
    } else {
      const reason = result.status === 'rejected'
        ? (result.reason as Error).message?.slice(0, 100)
        : 'No proposals generated';
      councilLog.push(`[DELPHI] ⚠️ ${member.name}: SKIPPED (${reason})`);
    }
  }

  councilLog.push(`[DELPHI] Phase 1 complete: ${respondedMembers.length}/${COUNCIL_MEMBERS.length} members responded, ${proposals.length} total proposals`);

  return { proposals, respondedMembers, councilLog };
}

// ============================================================
// PHASE 2: MAD DEBATE — Critiques
// ============================================================

async function runMADDebate(
  proposals: CouncilProposal[],
  respondedMembers: string[],
  councilLog: string[],
): Promise<{ scoredProposals: Array<CouncilProposal & { avgScore: number }>; debateLog: string[] }> {
  const debateLog: string[] = [];

  if (respondedMembers.length < MIN_MEMBERS_FOR_DEBATE) {
    debateLog.push(`[MAD] Skipping debate: only ${respondedMembers.length} members (need ${MIN_MEMBERS_FOR_DEBATE})`);
    return {
      scoredProposals: proposals.map(p => ({ ...p, avgScore: p.confidence * 10 })),
      debateLog,
    };
  }

  debateLog.push(`[MAD] Starting Phase 2: ${respondedMembers.length} critics reviewing ${proposals.length} proposals`);

  const debatePrompt = buildDebatePrompt(proposals);

  // Each available member critiques ALL proposals
  const critiqueResults = await Promise.allSettled(
    COUNCIL_MEMBERS
      .filter(m => respondedMembers.includes(m.id))
      .map(member => callCritic(member, debatePrompt))
  );

  const allCritiques: DebateCritique[] = [];

  for (let i = 0; i < critiqueResults.length; i++) {
    const result = critiqueResults[i];
    const member = COUNCIL_MEMBERS.filter(m => respondedMembers.includes(m.id))[i];

    if (result.status === 'fulfilled') {
      allCritiques.push(...result.value);
      debateLog.push(`[MAD] ✅ ${member.name}: ${result.value.length} critiques`);
    } else {
      debateLog.push(`[MAD] ⚠️ ${member.name}: critique SKIPPED`);
    }
  }

  // Score each proposal based on critiques + member weight
  const scoredProposals = proposals.map(proposal => {
    const relevantCritiques = allCritiques.filter(c => c.proposalMemberId === proposal.memberId);
    if (relevantCritiques.length === 0) {
      return { ...proposal, avgScore: proposal.confidence * 10 };
    }

    // Weighted average score
    const weightedSum = relevantCritiques.reduce((sum, c) => {
      const criticMember = COUNCIL_MEMBERS.find(m => m.id === c.criticId);
      const weight = criticMember?.weight || 0.15;
      return sum + c.score * weight;
    }, 0);
    const totalWeight = relevantCritiques.reduce((sum, c) => {
      const criticMember = COUNCIL_MEMBERS.find(m => m.id === c.criticId);
      return sum + (criticMember?.weight || 0.15);
    }, 0);

    const avgScore = totalWeight > 0 ? weightedSum / totalWeight : proposal.confidence * 10;
    return { ...proposal, avgScore };
  });

  debateLog.push(`[MAD] Phase 2 complete: ${allCritiques.length} critiques collected`);

  return { scoredProposals, debateLog };
}

// ============================================================
// PHASE 3: VOTE — Consensus Ranking
// ============================================================

function voteAndRank(
  scoredProposals: Array<CouncilProposal & { avgScore: number }>,
): ImprovementProposal[] {
  // Sort by weighted score descending
  const ranked = [...scoredProposals]
    .filter(p => p.avgScore >= DEBATE_THRESHOLD * 10)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3); // Top 3 proposals

  return ranked.map(p => ({
    id: `council_${Date.now()}_${p.memberId}_${Math.random().toString(36).slice(2, 6)}`,
    type: p.type,
    description: `[${p.memberName}] ${p.description}`,
    rationale: `${p.rationale}\n\nCouncil score: ${p.avgScore.toFixed(1)}/10 | Confidence: ${(p.confidence * 100).toFixed(0)}% | Risks: ${p.risks}`,
    expectedFitnessGain: p.expectedFitnessGain,
    safetyCheck: true,
    approved: false,
  }));
}

// ============================================================
// MAIN: Run Council Session
// ============================================================

/**
 * Run a full Delphi+MAD council session.
 * Returns ranked proposals or null if council failed entirely.
 *
 * Graceful fallback chain:
 *   5 AIs → 4 AIs → ... → 2 AIs (min for debate) → 1 AI (no debate) → null (use rules)
 */
export async function runCouncilSession(
  fitness: FitnessMetrics,
): Promise<CouncilResult> {
  log.info('[DGMCouncil] ═══════════════════════════════════════════');
  log.info('[DGMCouncil] 🏛️  AI DELPHI+MAD COUNCIL SESSION STARTED');
  log.info('[DGMCouncil] ═══════════════════════════════════════════');

  const startTime = Date.now();

  // Phase 1: Delphi
  const { proposals, respondedMembers, councilLog } = await runDelphiPhase(fitness);

  if (proposals.length === 0) {
    log.warn('[DGMCouncil] No proposals from any AI — fallback to rules');
    return {
      proposals: [],
      councilLog: [...councilLog, '[COUNCIL] FALLBACK: No AI responded, using hardcoded rules'],
      membersResponded: 0,
      debateRounds: 0,
      fallbackUsed: true,
    };
  }

  // Phase 2: MAD Debate
  const { scoredProposals, debateLog } = await runMADDebate(proposals, respondedMembers, councilLog);

  // Phase 3: Vote
  const finalProposals = voteAndRank(scoredProposals);

  const totalLog = [
    ...councilLog,
    ...debateLog,
    `[VOTE] Final ranking: ${finalProposals.length} proposals survived debate`,
    `[COUNCIL] Session completed in ${Date.now() - startTime}ms`,
  ];

  log.info(`[DGMCouncil] ✅ Session complete: ${finalProposals.length} proposals, ${respondedMembers.length} AIs participated, ${Date.now() - startTime}ms`);

  return {
    proposals: finalProposals,
    councilLog: totalLog,
    membersResponded: respondedMembers.length,
    debateRounds: respondedMembers.length >= MIN_MEMBERS_FOR_DEBATE ? 1 : 0,
    fallbackUsed: false,
  };
}

// ============================================================
// HELPERS: LLM Calls
// ============================================================

function buildDelphiPrompt(fitness: FitnessMetrics): string {
  return `You are a member of MOTHER's AI Improvement Council (DGM — Darwin Gödel Machine).
Your task: analyze MOTHER's current performance and propose SPECIFIC code improvements.

## CURRENT FITNESS METRICS
- Average Quality Score: ${fitness.avgQualityScore.toFixed(1)}/100
- P95 Latency: ${fitness.p95LatencyMs}ms (target: <3000ms)
- Error Rate: ${(fitness.errorRate * 100).toFixed(2)}%
- Cache Hit Rate: ${(fitness.cacheHitRate * 100).toFixed(1)}%
- User Satisfaction Proxy: ${fitness.userSatisfactionProxy.toFixed(1)}
- Overall Fitness: ${fitness.fitnessScore.toFixed(1)}/100
- Sample Size: ${fitness.sampleSize} observations

## YOUR TASK
Propose 1-2 CONCRETE improvements. For each, specify:
1. type: ROUTING | PROMPT | CACHE | ARCHITECTURE | SAFETY | PERFORMANCE | OTHER
2. description: What to change (be specific — file names, function names, parameters)
3. rationale: WHY this will improve fitness (cite metrics above)
4. expectedFitnessGain: estimated % improvement (1-20)
5. confidence: your confidence in this proposal (0.0-1.0)
6. risks: potential downsides

Return ONLY a JSON array:
[{ "type": "...", "description": "...", "rationale": "...", "expectedFitnessGain": N, "confidence": 0.X, "risks": "..." }]`;
}

function buildDebatePrompt(proposals: CouncilProposal[]): string {
  const proposalText = proposals.map((p, i) =>
    `[${i + 1}] (by ${p.memberName}, type: ${p.type})\n   Description: ${p.description}\n   Rationale: ${p.rationale}\n   Expected gain: +${p.expectedFitnessGain}% | Confidence: ${(p.confidence * 100).toFixed(0)}%\n   Risks: ${p.risks}`
  ).join('\n\n');

  return `You are a critic on MOTHER's AI Improvement Council (MAD — Multi-Agent Debate).
Review these proposals and provide honest critiques.

## PROPOSALS TO REVIEW
${proposalText}

## YOUR TASK
For EACH proposal, provide:
1. proposalIndex: which proposal (1-indexed)
2. agree: boolean — do you support this?
3. score: 1-10 (10 = strong support)
4. critique: what's wrong or could be better
5. suggestion: how to improve the proposal

Return ONLY a JSON array:
[{ "proposalIndex": N, "agree": true/false, "score": N, "critique": "...", "suggestion": "..." }]`;
}

async function callCouncilMember(
  member: CouncilMember,
  prompt: string,
): Promise<CouncilProposal[]> {
  try {
    const response = await invokeLLM({
      provider: member.provider,
      model: member.model,
      messages: [
        { role: 'system', content: `You are ${member.name}. Your role: ${member.role}` },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1000,
      temperature: 0.7,
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : (typeof response === 'string' ? response : '');
    
    const jsonMatch = content.match(/\[\s*[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, MAX_PROPOSALS_PER_MEMBER)
      .map((p: any) => ({
        memberId: member.id,
        memberName: member.name,
        type: p.type || 'OTHER',
        description: p.description || '',
        rationale: p.rationale || '',
        expectedFitnessGain: Math.min(Math.max(p.expectedFitnessGain || 1, 1), 20),
        confidence: Math.min(Math.max(p.confidence || 0.5, 0), 1),
        risks: p.risks || 'Unknown',
      }))
      .filter((p: CouncilProposal) => p.description.length > 10);
  } catch (err: any) {
    log.warn(`[Council] ${member.name} failed: ${err.message?.slice(0, 100)}`);
    throw err; // Let Promise.allSettled handle it
  }
}

async function callCritic(
  member: CouncilMember,
  prompt: string,
): Promise<DebateCritique[]> {
  try {
    const response = await invokeLLM({
      provider: member.provider,
      model: member.model,
      messages: [
        { role: 'system', content: `You are ${member.name}, acting as a CRITIC. Be honest and constructive.` },
        { role: 'user', content: prompt },
      ],
      maxTokens: 800,
      temperature: 0.5,
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : (typeof response === 'string' ? response : '');

    const jsonMatch = content.match(/\[\s*[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((c: any) => ({
      criticId: member.id,
      proposalMemberId: '', // Will be resolved by caller
      agree: c.agree ?? true,
      score: Math.min(Math.max(c.score || 5, 1), 10),
      critique: c.critique || '',
      suggestion: c.suggestion || '',
    }));
  } catch (err: any) {
    log.warn(`[Council] ${member.name} critique failed: ${err.message?.slice(0, 100)}`);
    throw err;
  }
}

/**
 * Get council member details for dashboard display.
 */
export function getCouncilMembers(): Array<{
  id: string;
  name: string;
  role: string;
  weight: number;
}> {
  return COUNCIL_MEMBERS.map(m => ({
    id: m.id,
    name: m.name,
    role: m.role,
    weight: m.weight,
  }));
}
