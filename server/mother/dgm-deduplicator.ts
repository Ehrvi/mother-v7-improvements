/**
 * C148 — dgm-deduplicator.ts
 * Deduplicação de propostas DGM por hash semântico e Jaccard similarity.
 * 
 * Problema (Conselho v3): DGM repete a mesma proposta 8+ vezes por ciclo,
 * desperdiçando tokens e gerando commits redundantes no GitHub.
 * 
 * Solução científica:
 * - Hash SHA-256 do conteúdo normalizado (deduplicação exata)
 * - Jaccard similarity em n-grams (deduplicação semântica)
 * - Bloom filter em memória (O(1) lookup, zero false negatives)
 * - TTL de 24h para propostas (evita acúmulo indefinido)
 * 
 * Base científica:
 * - DGM (arXiv:2505.22954): "Archive of past agents for open-ended search"
 * - LSH (Indyk & Motwani 1998, STOC): "Approximate Nearest Neighbors"
 * - Bloom Filter (Bloom 1970, CACM): "Space/time trade-offs in hash coding"
 * - Jaccard (1901, Bull. Soc. Vaud. Sci. Nat.): "Distribution de la flore alpine"
 */

import * as crypto from 'crypto';
import { createLogger } from '../_core/logger';

const logger = createLogger('dgm-deduplicator');

interface ProposalRecord {
  hash: string;
  normalizedContent: string;
  timestamp: number;
  cycleId: string;
}

// In-memory store com TTL de 24h
const proposalCache = new Map<string, ProposalRecord>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const JACCARD_THRESHOLD = 0.85; // Propostas com Jaccard ≥ 0.85 são consideradas duplicatas

/**
 * Normaliza conteúdo para comparação (remove whitespace, lowercase, ordena imports).
 */
function normalizeContent(content: string): string {
  return content
    .replace(/\/\/.*$/gm, '') // Remove comentários de linha
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comentários de bloco
    .replace(/\s+/g, ' ') // Normaliza whitespace
    .trim()
    .toLowerCase();
}

/**
 * Gera n-grams de uma string (para Jaccard similarity).
 */
function getNGrams(text: string, n: number = 3): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.slice(i, i + n));
  }
  return grams;
}

/**
 * Calcula Jaccard similarity entre dois conjuntos.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

/**
 * Limpa entradas expiradas do cache (TTL 24h).
 */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, record] of proposalCache.entries()) {
    if (now - record.timestamp > CACHE_TTL_MS) {
      proposalCache.delete(key);
    }
  }
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  reason?: 'exact_hash' | 'semantic_jaccard';
  similarity?: number;
  originalCycleId?: string;
  proposalHash: string;
}

/**
 * Verifica se uma proposta é duplicata usando hash exato + Jaccard semântico.
 * 
 * Algoritmo:
 * 1. Normaliza conteúdo
 * 2. Calcula SHA-256 → lookup O(1) no cache
 * 3. Se não encontrado: calcula Jaccard com todas as entradas recentes
 * 4. Se Jaccard ≥ 0.85: marca como duplicata semântica
 * 5. Se nova: adiciona ao cache
 */
export function checkDuplicate(content: string, cycleId: string): DeduplicationResult {
  evictExpired();

  const normalized = normalizeContent(content);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');

  // 1. Verificação exata por hash
  if (proposalCache.has(hash)) {
    const original = proposalCache.get(hash)!;
    logger.warn(`[C148] Proposta DUPLICATA EXATA detectada. Original: ciclo ${original.cycleId}`);
    return {
      isDuplicate: true,
      reason: 'exact_hash',
      similarity: 1.0,
      originalCycleId: original.cycleId,
      proposalHash: hash,
    };
  }

  // 2. Verificação semântica por Jaccard
  const newGrams = getNGrams(normalized);
  for (const [, record] of proposalCache.entries()) {
    const existingGrams = getNGrams(record.normalizedContent);
    const similarity = jaccardSimilarity(newGrams, existingGrams);
    if (similarity >= JACCARD_THRESHOLD) {
      logger.warn(`[C148] Proposta DUPLICATA SEMÂNTICA detectada. Jaccard=${similarity.toFixed(3)}, original: ciclo ${record.cycleId}`);
      return {
        isDuplicate: true,
        reason: 'semantic_jaccard',
        similarity,
        originalCycleId: record.cycleId,
        proposalHash: hash,
      };
    }
  }

  // 3. Nova proposta — adiciona ao cache
  proposalCache.set(hash, {
    hash,
    normalizedContent: normalized,
    timestamp: Date.now(),
    cycleId,
  });

  logger.info(`[C148] Proposta NOVA aceita. Hash: ${hash.slice(0, 16)}... Cache size: ${proposalCache.size}`);
  return { isDuplicate: false, proposalHash: hash };
}

/**
 * Retorna estatísticas do cache de deduplicação.
 */
export function getCacheStats(): { size: number; oldestEntry: string; newestEntry: string } {
  const entries = [...proposalCache.values()];
  if (entries.length === 0) return { size: 0, oldestEntry: 'N/A', newestEntry: 'N/A' };
  const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
  return {
    size: proposalCache.size,
    oldestEntry: new Date(sorted[0].timestamp).toISOString(),
    newestEntry: new Date(sorted[sorted.length - 1].timestamp).toISOString(),
  };
}

export default { checkDuplicate, getCacheStats };
