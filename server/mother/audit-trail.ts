/**
 * audit-trail.ts — MOTHER v80.0 — Ciclo 117 — Fase 4: Public API + SaaS
 *
 * PURPOSE: Immutable audit trail for all MOTHER API calls and autonomous actions.
 * Every entry is cryptographically linked to the previous one (hash chain),
 * making tampering detectable.
 *
 * Scientific Basis:
 * - Nakamoto, S. (2008). "Bitcoin: A Peer-to-Peer Electronic Cash System."
 *   Hash chain: each block references previous block's hash — tamper-evident
 * - OWASP API Security Top 10 (2023) — API7: Insufficient Logging & Monitoring
 *   "Lack of logging and monitoring, combined with missing/ineffective integration
 *   with incident response, allows attackers to further attack systems"
 * - ISO/IEC 27001:2022 — Annex A.8.15: Logging
 *   "Event logs that record user activities, exceptions, faults and information
 *   security events shall be produced, stored, protected and analysed"
 * - Darwin Gödel Machine (arXiv:2505.22954): "Archive stores (code_hash,
 *   agent_id, fitness) triplets" — persistent proof of all autonomous actions
 *
 * Architecture:
 *   Action occurs → AuditEntry created → SHA-256(entry + prev_hash) → chain grows
 *   Chain is verifiable: any entry can be independently validated
 *   Stored in: in-memory ring buffer + db (audit_log table via db.ts)
 *
 * Autonomy Level: 9/10 (Fase 4 milestone)
 * Author: Everton Garcia (Wizards Down Under)
 * Cycle: 117 | Date: 2026-03-05
 */

import { createHash } from 'crypto';

// ============================================================
// TYPES
// ============================================================

export type AuditActionType =
  | 'api_call'           // External API call via /api/v1
  | 'agent_task'         // MOTHER executed an agent task
  | 'code_write'         // MOTHER wrote code to a file
  | 'code_commit'        // MOTHER committed code to GitHub
  | 'knowledge_insert'   // Entry added to bd_central
  | 'knowledge_query'    // bd_central queried
  | 'proof_generated'    // Cryptographic proof generated
  | 'benchmark_run'      // Benchmark executed
  | 'deploy_triggered'   // Cloud Build deploy triggered
  | 'roadmap_executed'   // Roadmap phase executed
  | 'shms_sensor_read'   // SHMS sensor reading ingested
  | 'shms_prediction'    // LSTM prediction generated
  | 'system_startup'     // MOTHER started/restarted
  | 'api_key_created'    // New API key issued
  | 'api_key_revoked'    // API key revoked
  | 'rate_limit_hit'     // Rate limit exceeded
  | 'auth_failure';      // Authentication failed

export interface AuditEntry {
  id: string;                    // UUID-like: sha256(content).slice(0,16)
  sequence: number;              // Monotonically increasing
  action: AuditActionType;
  actor: string;                 // 'MOTHER-v80.0', 'api-key:xxx', 'system'
  actorType: 'agent' | 'external_client' | 'system';
  target: string;                // What was acted upon
  details: Record<string, unknown>; // Action-specific details
  outcome: 'success' | 'failure' | 'partial';
  durationMs?: number;
  timestamp: string;             // ISO 8601
  entryHash: string;             // SHA-256(sequence + action + actor + target + timestamp + details)
  chainHash: string;             // SHA-256(entryHash + prevChainHash) — Nakamoto chain
  prevChainHash: string;         // Previous entry's chainHash
}

export interface ChainIntegrityReport {
  valid: boolean;
  total_entries: number;
  chain_intact: boolean;
  first_entry_id: string;
  latest_entry_id: string;
  latest_chain_hash: string;
  broken_at_sequence?: number;
  verification_timestamp: string;
  scientific_basis: string;
}

// ============================================================
// AUDIT TRAIL STATE
// ============================================================

const AUDIT_CHAIN: AuditEntry[] = [];
const MAX_ENTRIES = 50000; // Ring buffer size
let sequence = 0;
let prevChainHash = '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis hash

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Compute SHA-256 hash of an audit entry's content
 * Scientific basis: Nakamoto (2008) — deterministic hash of block content
 */
function computeEntryHash(params: {
  sequence: number;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  details: Record<string, unknown>;
}): string {
  const content = JSON.stringify({
    sequence: params.sequence,
    action: params.action,
    actor: params.actor,
    target: params.target,
    timestamp: params.timestamp,
    details: params.details,
  });
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Record an audit entry — the primary function of this module
 * Returns the created AuditEntry with its cryptographic hashes
 *
 * @example
 * const entry = recordAuditEntry({
 *   action: 'api_call',
 *   actor: 'api-key:abc123',
 *   actorType: 'external_client',
 *   target: '/api/v1/execute-agent',
 *   details: { endpoint: '/api/v1/execute-agent', status: 200 },
 *   outcome: 'success',
 *   durationMs: 145,
 * });
 */
export function recordAuditEntry(params: {
  action: AuditActionType;
  actor: string;
  actorType: AuditEntry['actorType'];
  target: string;
  details: Record<string, unknown>;
  outcome: AuditEntry['outcome'];
  durationMs?: number;
}): AuditEntry {
  const timestamp = new Date().toISOString();
  const seq = ++sequence;

  const entryHash = computeEntryHash({
    sequence: seq,
    action: params.action,
    actor: params.actor,
    target: params.target,
    timestamp,
    details: params.details,
  });

  // Chain hash: SHA-256(entryHash + prevChainHash)
  // Scientific basis: Nakamoto (2008) — each block references previous
  const chainHash = createHash('sha256')
    .update(entryHash + prevChainHash)
    .digest('hex');

  const id = entryHash.slice(0, 16);

  const entry: AuditEntry = {
    id,
    sequence: seq,
    action: params.action,
    actor: params.actor,
    actorType: params.actorType,
    target: params.target,
    details: params.details,
    outcome: params.outcome,
    durationMs: params.durationMs,
    timestamp,
    entryHash,
    chainHash,
    prevChainHash,
  };

  // Update chain state
  prevChainHash = chainHash;

  // Ring buffer
  if (AUDIT_CHAIN.length >= MAX_ENTRIES) {
    AUDIT_CHAIN.shift();
  }
  AUDIT_CHAIN.push(entry);

  // B-FIX: Persist to DB (fire-and-forget, non-blocking)
  // Scientific basis: ISO/IEC 27001:2022 A.8.15 — persistent audit logs survive process restarts
  // Uses existing auditLog table from Drizzle schema
  (async () => {
    try {
      const { getDb } = await import('../db');
      const { auditLog } = await import('../../drizzle/schema');
      const db = await getDb();
      if (db) {
        await db.insert(auditLog).values({
          action: entry.action,
          actorEmail: entry.actor,
          actorType: entry.actorType,
          targetType: entry.target,
          targetId: entry.id,
          details: JSON.stringify({
            ...entry.details,
            entryHash: entry.entryHash,
            chainHash: entry.chainHash,
            prevChainHash: entry.prevChainHash,
            sequence: entry.sequence,
            outcome: entry.outcome,
            durationMs: entry.durationMs,
          }),
        });
      }
    } catch {
      // Non-critical: in-memory chain is the primary store.
      // DB persistence is best-effort for cross-restart durability.
    }
  })();

  return entry;
}

/**
 * Verify the integrity of the entire audit chain
 * Scientific basis: Nakamoto (2008) — chain validation by recomputing hashes
 */
export function verifyChainIntegrity(): ChainIntegrityReport {
  if (AUDIT_CHAIN.length === 0) {
    return {
      valid: true,
      total_entries: 0,
      chain_intact: true,
      first_entry_id: 'none',
      latest_entry_id: 'none',
      latest_chain_hash: prevChainHash,
      verification_timestamp: new Date().toISOString(),
      scientific_basis: 'Nakamoto (2008) — hash chain integrity verification',
    };
  }

  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
  let brokenAt: number | undefined;

  for (const entry of AUDIT_CHAIN) {
    // Recompute entry hash
    const expectedEntryHash = computeEntryHash({
      sequence: entry.sequence,
      action: entry.action,
      actor: entry.actor,
      target: entry.target,
      timestamp: entry.timestamp,
      details: entry.details,
    });

    // Recompute chain hash
    const expectedChainHash = createHash('sha256')
      .update(expectedEntryHash + prevHash)
      .digest('hex');

    if (entry.entryHash !== expectedEntryHash || entry.chainHash !== expectedChainHash) {
      brokenAt = entry.sequence;
      break;
    }

    prevHash = entry.chainHash;
  }

  const latest = AUDIT_CHAIN[AUDIT_CHAIN.length - 1];
  const chainIntact = brokenAt === undefined;

  return {
    valid: chainIntact,
    total_entries: AUDIT_CHAIN.length,
    chain_intact: chainIntact,
    first_entry_id: AUDIT_CHAIN[0].id,
    latest_entry_id: latest.id,
    latest_chain_hash: latest.chainHash,
    broken_at_sequence: brokenAt,
    verification_timestamp: new Date().toISOString(),
    scientific_basis: 'Nakamoto (2008) — hash chain integrity verification',
  };
}

/**
 * Get recent audit entries (newest first)
 */
export function getRecentEntries(limit = 100, action?: AuditActionType): AuditEntry[] {
  let entries = [...AUDIT_CHAIN].reverse();
  if (action) {
    entries = entries.filter(e => e.action === action);
  }
  return entries.slice(0, limit);
}

/**
 * Get audit statistics
 */
export function getAuditStats(): {
  total_entries: number;
  entries_today: number;
  by_action: Record<string, number>;
  by_outcome: Record<string, number>;
  by_actor_type: Record<string, number>;
  chain_hash: string;
  autonomy_proof: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = AUDIT_CHAIN.filter(e => e.timestamp.startsWith(today));

  const byAction: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byActorType: Record<string, number> = {};

  for (const entry of AUDIT_CHAIN) {
    byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    byOutcome[entry.outcome] = (byOutcome[entry.outcome] || 0) + 1;
    byActorType[entry.actorType] = (byActorType[entry.actorType] || 0) + 1;
  }

  // Autonomy proof: SHA-256 of all agent actions
  const agentActions = AUDIT_CHAIN.filter(e => e.actorType === 'agent');
  const autonomyProof = createHash('sha256')
    .update(agentActions.map(e => e.entryHash).join(''))
    .digest('hex');

  return {
    total_entries: AUDIT_CHAIN.length,
    entries_today: todayEntries.length,
    by_action: byAction,
    by_outcome: byOutcome,
    by_actor_type: byActorType,
    chain_hash: prevChainHash,
    autonomy_proof: autonomyProof,
  };
}

/**
 * Get a specific entry by ID
 */
export function getEntryById(id: string): AuditEntry | null {
  return AUDIT_CHAIN.find(e => e.id === id) || null;
}

/**
 * Get entries by actor
 */
export function getEntriesByActor(actor: string, limit = 50): AuditEntry[] {
  return AUDIT_CHAIN
    .filter(e => e.actor === actor)
    .slice(-limit)
    .reverse();
}

// ============================================================
// STARTUP ENTRY
// ============================================================

// Record system startup as first audit entry
recordAuditEntry({
  action: 'system_startup',
  actor: 'MOTHER-v80.0',
  actorType: 'system',
  target: 'audit-trail',
  details: {
    version: 'v80.0',
    cycle: 117,
    timestamp: new Date().toISOString(),
    scientific_basis: 'ISO/IEC 27001:2022 Annex A.8.15 — Logging',
  },
  outcome: 'success',
});
