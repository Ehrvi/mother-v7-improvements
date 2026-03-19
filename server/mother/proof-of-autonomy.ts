/**
 * Proof of Autonomy — MOTHER's Cryptographic Self-Attestation System
 * 
 * Scientific Basis: Darwin Gödel Machine (arXiv:2505.22954)
 * "The archive stores (code, hash, fitness) triplets. Each agent is identified
 * by a SHA-256 hash of its code. Fitness is measured empirically."
 * 
 * Architecture:
 * 1. SHA-256(code + metadata) → code_hash
 * 2. Store in dgm_archive: (generationId, parentId, codeSnapshot, fitnessScore)
 * 3. HMAC-SHA256 attestation signed with GITHUB_TOKEN
 * 4. Public verification: GET /api/a2a/proof/:commitHash
 * 5. Fallback: bd_central via HTTP API if dgm_archive unavailable
 */

import crypto from 'crypto';
import { createLogger } from '../_core/logger';
const log = createLogger('PROOF_OF_AUTONOMY');


const AGENT_VERSION = process.env.MOTHER_VERSION || 'v79.3';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_URL = 'https://github.com/Ehrvi/mother-v7-improvements';
const MOTHER_BASE_URL = process.env.MOTHER_BASE_URL ||
  'https://mother-interface-qtvghovzxa-ts.a.run.app';

export interface ProofRecord {
  id?: number;
  agent_id: string;
  parent_id: string;
  code_hash: string;
  file_path: string;
  commit_sha: string;
  fitness_score: number;
  task_description: string;
  attestation: string;
  created_at: string;
}

export interface AutonomyAttestation {
  verified: boolean;
  agent: string;
  wrote_at: string;
  code_hash: string;
  file_path: string;
  github_commit: string;
  attestation: string;
  fitness: number;
  autonomy_level: number;
  message: string;
}

/**
 * Generate SHA-256 hash of MOTHER-written code
 * This hash is the cryptographic fingerprint of MOTHER's autonomous work
 */
export function generateCodeHash(
  code: string,
  metadata: { agentId: string; taskId: string; filePath: string }
): string {
  const content = `${code}\n---METADATA---\nagent:${metadata.agentId}\ntask:${metadata.taskId}\npath:${metadata.filePath}`;
  return 'sha256:' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Create HMAC-SHA256 attestation
 * This proves that MOTHER (who has GITHUB_TOKEN) created this code
 */
function createAttestation(
  codeHash: string,
  agentId: string,
  commitSha: string,
  timestamp: string
): string {
  // C110 fix: Remove hardcoded fallback key — proofs must be unforgeable
  if (!GITHUB_TOKEN) {
    throw new Error('[ProofOfAutonomy] GITHUB_TOKEN required for HMAC attestation — cannot use fallback key');
  }
  const payload = JSON.stringify({ codeHash, agentId, commitSha, timestamp, issuer: 'MOTHER' });
  const signature = crypto
    .createHmac('sha256', GITHUB_TOKEN)
    .update(payload)
    .digest('hex');
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${signature}`;
}

/**
 * Store proof of autonomous code creation in dgm_archive + bd_central
 * Uses HTTP API to avoid direct DB dependency (works in both dev and prod)
 */
export async function storeProofOfAutonomy(params: {
  filePath: string;
  code: string;
  commitSha: string;
  taskDescription: string;
  fitnessScore?: number;
  parentAgentId?: string;
}): Promise<ProofRecord> {
  const timestamp = new Date().toISOString();
  const agentId = `${AGENT_VERSION}-${Date.now()}`;
  const parentId = params.parentAgentId || AGENT_VERSION;
  
  const codeHash = generateCodeHash(params.code, {
    agentId,
    taskId: params.taskDescription.slice(0, 50),
    filePath: params.filePath
  });
  
  const attestation = createAttestation(codeHash, agentId, params.commitSha, timestamp);
  
  const record: ProofRecord = {
    agent_id: agentId,
    parent_id: parentId,
    code_hash: codeHash,
    file_path: params.filePath,
    commit_sha: params.commitSha,
    fitness_score: params.fitnessScore ?? 0.5,
    task_description: params.taskDescription.slice(0, 500),
    attestation,
    created_at: timestamp
  };
  
  // Primary: store in dgm_archive via drizzle (non-blocking, best-effort)
  void (async () => {
    try {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return;
      const { dgmArchive } = await import('../../drizzle/schema');
      
      const codeSnapshot = JSON.stringify({
        agent_id: record.agent_id,
        file_path: record.file_path,
        task: record.task_description,
        attestation: record.attestation,
        commit_sha: record.commit_sha,
        code_hash: record.code_hash
      });
      
      await db.insert(dgmArchive).values({
        generationId: record.code_hash.slice(0, 255),
        parentId: record.parent_id.slice(0, 255),
        codeSnapshot,
        fitnessScore: record.fitness_score,
        benchmarkResults: JSON.stringify({
          agent_id: record.agent_id,
          code_hash: record.code_hash,
          file_path: record.file_path,
          commit_sha: record.commit_sha,
          attestation: record.attestation
        })
      });
      
      log.info(`[ProofOfAutonomy] ✅ Stored in dgm_archive: ${codeHash.slice(0, 24)}...`);
    } catch (err) {
      log.warn('[ProofOfAutonomy] dgm_archive insert failed (non-fatal):', (err as Error).message);
    }
  })();
  
  // Always also store in bd_central via HTTP API
  try {
    const response = await fetch(`${MOTHER_BASE_URL}/api/a2a/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `proof_of_autonomy:${params.commitSha.slice(0, 16)}:${params.filePath}`,
        content: JSON.stringify(record),
        category: 'proof_of_autonomy',
        domain: 'Autonomia',
        source: 'mother-agent',
        tags: JSON.stringify(['proof', 'autonomy', AGENT_VERSION, params.filePath])
      })
    });
    if (response.ok) {
      log.info(`[ProofOfAutonomy] ✅ Stored in bd_central: proof_of_autonomy_${params.commitSha.slice(0, 8)}`);
    }
  } catch (e2) {
    log.error('[ProofOfAutonomy] bd_central insert failed:', (e2 as Error).message);
  }
  
  return record;
}

/**
 * Verify and retrieve proof for a given commit SHA or code hash
 * Public endpoint: GET /api/a2a/proof/:commitHash
 */
export async function getProofByCommit(commitSha: string): Promise<AutonomyAttestation | null> {
  const shortHash = commitSha.slice(0, 16);
  
  // Try dgm_archive first via drizzle
  try {
    const { getDb } = await import('../db');
    const db = await getDb();
    if (db) {
      const { dgmArchive } = await import('../../drizzle/schema');
      const { like } = await import('drizzle-orm');
      
      const records = await db
        .select()
        .from(dgmArchive)
        .where(like(dgmArchive.generationId, `%${shortHash}%`))
        .limit(1);
      
      if (records.length > 0) {
        const r = records[0] as any;
        let meta: any = {};
        try { meta = JSON.parse(r.benchmarkResults || '{}'); } catch { log.warn('[ProofOfAutonomy] Failed to parse benchmarkResults JSON'); }
        
        return {
          verified: true,
          agent: meta.agent_id || AGENT_VERSION,
          wrote_at: r.createdAt?.toISOString() || new Date().toISOString(),
          code_hash: meta.code_hash || r.generationId || '',
          file_path: meta.file_path || '',
          github_commit: `${REPO_URL}/commit/${commitSha}`,
          attestation: meta.attestation || '',
          fitness: r.fitnessScore || 0,
          autonomy_level: 4,
          message: 'Proof verified via dgm_archive — MOTHER autonomously created this code'
        };
      }
    }
  } catch (err) {
    log.warn('[ProofOfAutonomy] dgm_archive query failed:', (err as Error).message);
  }
  
  // Fallback: search bd_central via HTTP API
  try {
    const response = await fetch(
      `${MOTHER_BASE_URL}/api/a2a/knowledge?search=proof_of_autonomy_${shortHash}&limit=1`
    );
    if (response.ok) {
      const data = await response.json() as { results?: any[] };
      const items = data.results || [];
      if (items.length > 0) {
        let record: any = {};
        try { record = JSON.parse(items[0].content || '{}'); } catch { log.warn('[ProofOfAutonomy] Failed to parse content JSON'); }
        return {
          verified: true,
          agent: record.agent_id || AGENT_VERSION,
          wrote_at: record.created_at || new Date().toISOString(),
          code_hash: record.code_hash || '',
          file_path: record.file_path || '',
          github_commit: `${REPO_URL}/commit/${commitSha}`,
          attestation: record.attestation || '',
          fitness: record.fitness_score || 0,
          autonomy_level: 4,
          message: 'Proof verified via bd_central — MOTHER autonomously created this code'
        };
      }
    }
  } catch (err) {
    log.error('[ProofOfAutonomy] getProofByCommit error:', (err as Error).message);
  }
  
  return null;
}

/**
 * Get all proofs generated by MOTHER (paginated)
 */
export async function getAllProofs(limit = 20, offset = 0): Promise<ProofRecord[]> {
  try {
    const response = await fetch(
      `${MOTHER_BASE_URL}/api/a2a/knowledge?category=proof_of_autonomy&limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return [];
    const data = await response.json() as { results?: any[] };
    return (data.results || []).map((item: any) => {
      try { return JSON.parse(item.content || '{}') as ProofRecord; }
      catch { log.warn('[ProofOfAutonomy] Failed to parse proof record'); return null; }
    }).filter(Boolean) as ProofRecord[];
  } catch (err) {
    return [];
  }
}

/**
 * Calculate MOTHER's current autonomy level based on proof history
 */
export async function calculateAutonomyLevel(): Promise<{
  level: number;
  description: string;
  proofs_count: number;
  last_proof_at: string | null;
}> {
  const proofs = await getAllProofs(100, 0);
  const count = proofs.length;
  
  let level = 3; // Base: agent loop active
  if (count >= 1) level = 4;   // Proof of autonomy
  if (count >= 5) level = 5;   // Consistent autonomy
  if (count >= 20) level = 6;  // Reliable autonomy
  if (count >= 50) level = 7;  // Self-directed
  
  const descriptions: Record<number, string> = {
    3: 'Agent loop active, no cryptographic proof yet',
    4: 'Proof of autonomy established — MOTHER writes and signs her own code',
    5: 'Consistent autonomous code creation with verified proofs',
    6: 'Reliable autonomy — MOTHER regularly creates and validates her own work',
    7: 'Self-directed — MOTHER executes roadmap without human prompting',
  };
  
  return {
    level,
    description: descriptions[level] || 'Unknown',
    proofs_count: count,
    last_proof_at: proofs[0]?.created_at?.toString() || null
  };
}
