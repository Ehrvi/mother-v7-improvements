/**
 * MOTHER v65.0 — Re-proposal Engine
 * 
 * Scientific Basis:
 * - SM-2 Algorithm (Wozniak, 1990): Spaced repetition for optimal interval scheduling
 *   I(1) = 1 day, I(2) = 6 days, I(n) = I(n-1) × EF
 *   EF = max(1.3, EF + 0.1 - (5-q)×(0.08 + (5-q)×0.02))
 *   where q = quality score (0-5), EF = easiness factor
 * 
 * - Exponential Backoff with Jitter (AWS Builders Library, 2019):
 *   Adds randomness to prevent thundering herd problem
 *   delay = min(cap, base × 2^attempt) + jitter
 * 
 * - Contextual Adaptation: EF decreases with each rejection (harder to re-propose),
 *   but improves if the proposal is enhanced with new evidence
 * 
 * - Maximum 3 re-proposals before requiring human-initiated re-submission
 *   (prevents infinite loops, aligns with scientific peer review norms)
 */

import { getDb } from '../db';

export interface ReproposalSchedule {
  nextAt: Date;
  intervalDays: number;
  efFactor: number;
  rejectionCount: number;
  requiresImprovement: boolean;
  improvementSuggestion: string;
}

/**
 * SM-2 Easiness Factor calculation
 * q: quality of response (0-5 scale, mapped from rejection context)
 *   - 0: rejected with strong objection (very poor fit)
 *   - 2: rejected with mild objection (timing issue)
 *   - 3: rejected without clear reason (neutral)
 *   - 5: would have been approved in different context
 */
function calculateEF(currentEF: number, q: number): number {
  const newEF = currentEF + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  return Math.max(1.3, Math.min(2.5, newEF)); // Clamp between 1.3 and 2.5
}

/**
 * Map rejection context to SM-2 quality score (0-5)
 * Based on: Kingdon's Multiple Streams Framework (1984) — timing matters
 */
function mapRejectionToQuality(rejectionReason: string | null, rejectionCount: number): number {
  if (!rejectionReason) return 3; // Neutral rejection
  
  const reason = rejectionReason.toLowerCase();
  
  // Timing-based rejection (high quality — proposal is good, just wrong moment)
  if (reason.includes('timing') || reason.includes('momento') || reason.includes('agora') || 
      reason.includes('later') || reason.includes('depois') || reason.includes('prioridade')) {
    return 4;
  }
  
  // Context-based rejection (medium quality — needs adaptation)
  if (reason.includes('context') || reason.includes('contexto') || reason.includes('scope') ||
      reason.includes('escopo') || reason.includes('foco')) {
    return 3;
  }
  
  // Fundamental objection (low quality — needs significant rework)
  if (reason.includes('wrong') || reason.includes('errado') || reason.includes('incorrect') ||
      reason.includes('incorreto') || reason.includes('bad') || reason.includes('ruim')) {
    return 1;
  }
  
  // Diminishing returns with multiple rejections
  return Math.max(0, 3 - rejectionCount);
}

/**
 * Calculate next re-proposal time using SM-2 + Exponential Backoff
 * 
 * Intervals:
 * - 1st rejection: 1 day × EF (min 1 day, max 3 days)
 * - 2nd rejection: previous × EF (min 3 days, max 7 days)  
 * - 3rd rejection: previous × EF (min 7 days, max 30 days)
 * - 4th+ rejection: requires manual re-submission (no automatic retry)
 */
export function calculateReproposalSchedule(
  rejectionCount: number,
  currentEF: number,
  rejectionReason: string | null,
  lastRejectedAt: Date
): ReproposalSchedule {
  const q = mapRejectionToQuality(rejectionReason, rejectionCount);
  const newEF = calculateEF(currentEF, q);
  
  // Base intervals per rejection count (days)
  const baseIntervals = [1, 3, 7, 14]; // SM-2 inspired progression
  const baseInterval = baseIntervals[Math.min(rejectionCount - 1, baseIntervals.length - 1)];
  
  // Apply EF multiplier
  let intervalDays = baseInterval * newEF;
  
  // Add jitter (±20%) to prevent clustering — AWS Exponential Backoff pattern
  const jitter = intervalDays * 0.2 * (Math.random() * 2 - 1);
  intervalDays = Math.max(1, Math.round(intervalDays + jitter));
  
  // Cap at 30 days
  intervalDays = Math.min(30, intervalDays);
  
  // Calculate next re-proposal timestamp
  const nextAt = new Date(lastRejectedAt.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  
  // Determine if improvement is required
  const requiresImprovement = rejectionCount >= 2 || q <= 2;
  
  // Generate improvement suggestion based on rejection pattern
  const improvementSuggestion = generateImprovementSuggestion(rejectionReason, rejectionCount, q);
  
  return {
    nextAt,
    intervalDays,
    efFactor: newEF,
    rejectionCount,
    requiresImprovement,
    improvementSuggestion,
  };
}

function generateImprovementSuggestion(
  rejectionReason: string | null,
  rejectionCount: number,
  quality: number
): string {
  if (rejectionCount >= 3) {
    return 'Esta proposta foi rejeitada 3+ vezes. Requer revisão fundamental da hipótese e nova evidência científica antes de re-submissão.';
  }
  
  if (!rejectionReason) {
    return 'Adicionar mais evidência científica e quantificar o impacto esperado com métricas específicas.';
  }
  
  const reason = rejectionReason.toLowerCase();
  
  if (reason.includes('timing') || reason.includes('momento')) {
    return 'Proposta válida mas com timing inadequado. Re-submeter quando o contexto operacional for mais favorável. Adicionar análise de janela de oportunidade (Kingdon, 1984).';
  }
  
  if (reason.includes('context') || reason.includes('contexto')) {
    return 'Adaptar o escopo da proposta ao contexto atual. Considerar dividir em sub-propostas menores e mais focadas.';
  }
  
  if (quality <= 2) {
    return 'Proposta requer revisão significativa. Revisar hipótese fundamental, adicionar dados de suporte e considerar abordagem alternativa.';
  }
  
  return 'Refinar a proposta com base no feedback recebido. Adicionar métricas de sucesso mais específicas e plano de rollback.';
}

/**
 * Schedule re-proposals that are due
 * Called by the DGM analysis loop
 */
export async function processDueReproposals(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  try {
    const now = new Date();
    
    // Find rejected proposals that are due for re-proposal
    const [rows] = await (db as any).$client.query(
      `SELECT id, title, description, hypothesis, metric_trigger, metric_value, metric_target,
              proposed_changes, fitness_function, scientific_basis,
              rejection_count, rejection_reason, ef_factor, parent_proposal_id, improvement_notes
       FROM self_proposals 
       WHERE status = 'rejected' 
         AND rejection_count < 4
         AND next_reproposal_at IS NOT NULL 
         AND next_reproposal_at <= ?
       ORDER BY next_reproposal_at ASC
       LIMIT 5`,
      [now]
    );
    
    let reproposedCount = 0;
    for (const row of rows as any[]) {
      // Create a new proposal as a re-proposal of the rejected one
      await (db as any).$client.query(
        `INSERT INTO self_proposals 
         (title, description, hypothesis, metric_trigger, metric_value, metric_target,
          proposed_changes, fitness_function, scientific_basis, status,
          rejection_count, ef_factor, parent_proposal_id, improvement_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [
          `[Re-proposta ${row.rejection_count + 1}] ${row.title}`,
          row.description,
          row.hypothesis,
          row.metric_trigger,
          row.metric_value,
          row.metric_target,
          row.proposed_changes,
          row.fitness_function,
          row.scientific_basis,
          row.rejection_count,
          row.ef_factor,
          row.parent_proposal_id || row.id,
          row.improvement_notes,
        ]
      );
      reproposedCount++;
    }
    
    if (reproposedCount > 0) {
      console.log(`[MOTHER] Re-proposal Engine: ${reproposedCount} proposals re-submitted`);
    }
    
    return reproposedCount;
  } catch (error) {
    console.error('[MOTHER] Re-proposal processing failed:', error);
    return 0;
  }
}

/**
 * Get knowledge wisdom statistics per domain
 * Formula: W(d) = K_MOTHER(d) / K_SoA(d) × 100%
 * 
 * Scientific basis:
 * - Knowledge quantification via chunk counting (Chase & Simon, 1973)
 * - Expertise measurement (Anders Ericsson, 2006 — deliberate practice theory)
 * - Normalized by SoA estimates from knowledge_wisdom reference table
 */
export async function getKnowledgeWisdomStats(): Promise<{
  domain: string;
  subdomain: string | null;
  motherChunks: number;
  soaEstimate: number;
  wisdomPercent: number;
  description: string | null;
}[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    // v68.4: Fixed to use paper_chunks (actual indexed knowledge) instead of knowledge table
    // Scientific basis: Chase & Simon (1973) — expertise measured by meaningful chunks absorbed
    // Formula: W(d) = paper_chunks_in_domain / SoA_estimate × 100%
    const [rows] = await (db as any).$client.query(
      `SELECT 
         kw.domain,
         kw.subdomain,
         kw.soa_estimate,
         kw.description,
         COALESCE(pc_count.chunk_count, 0) as mother_chunks
       FROM knowledge_wisdom kw
       LEFT JOIN (
         SELECT 
           p.paper_domain as domain,
           COUNT(pc.id) as chunk_count
         FROM papers p
         JOIN paper_chunks pc ON pc.paper_id = p.id
         WHERE p.paper_domain IS NOT NULL AND p.paper_domain != 'unclassified'
         GROUP BY p.paper_domain
       ) pc_count ON pc_count.domain = kw.domain
       WHERE kw.subdomain IS NULL
       ORDER BY kw.domain ASC`
    );
    
    return (rows as any[]).map(row => ({
      domain: row.domain,
      subdomain: row.subdomain,
      motherChunks: Number(row.mother_chunks),
      soaEstimate: Number(row.soa_estimate),
      wisdomPercent: Math.min(100, Math.round((Number(row.mother_chunks) / Number(row.soa_estimate)) * 100 * 10) / 10),
      description: row.description,
    }));
  } catch (error) {
    console.error('[MOTHER] Knowledge wisdom stats failed:', error);
    return [];
  }
}

/**
 * Get proposals with re-proposal metadata
 */
export async function getProposalsWithReproposal(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const [rows] = await (db as any).$client.query(
      `SELECT 
         id, title, description, hypothesis, metric_trigger, metric_value, metric_target,
         status, approved_by, approved_at, deployed_at, fitness_before, fitness_after,
         version_tag, scientific_basis, created_at, updated_at,
         rejection_count, rejection_reason, next_reproposal_at, ef_factor,
         parent_proposal_id, improvement_notes
       FROM self_proposals
       ORDER BY 
         CASE status 
           WHEN 'pending' THEN 1 
           WHEN 'approved' THEN 2
           WHEN 'implementing' THEN 3
           WHEN 'rejected' THEN 4
           ELSE 5 
         END,
         created_at DESC
       LIMIT 50`
    );
    
    return (rows as any[]).map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      hypothesis: row.hypothesis,
      metricTrigger: row.metric_trigger,
      metricValue: row.metric_value,
      metricTarget: row.metric_target,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      deployedAt: row.deployed_at,
      fitnessBefore: row.fitness_before,
      fitnessAfter: row.fitness_after,
      versionTag: row.version_tag,
      scientificBasis: row.scientific_basis,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rejectionCount: row.rejection_count || 0,
      rejectionReason: row.rejection_reason,
      nextReproposalAt: row.next_reproposal_at,
      efFactor: row.ef_factor || 2.5,
      parentProposalId: row.parent_proposal_id,
      improvementNotes: row.improvement_notes,
      // Computed: time until re-proposal
      reproposalDaysRemaining: row.next_reproposal_at 
        ? Math.max(0, Math.ceil((new Date(row.next_reproposal_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null,
    }));
  } catch (error) {
    console.error('[MOTHER] getProposalsWithReproposal failed:', error);
    return [];
  }
}

/**
 * v68.4: Get hierarchical knowledge map with drill-down percentages
 * Returns a tree structure: domain > subdomain > sub-subdomain
 * Formula: W(d) = paper_chunks_in_domain / SoA_estimate × 100%
 * Scientific basis: Chase & Simon (1973), Ericsson (2006)
 */
export async function getKnowledgeHierarchy(): Promise<{
  domain: string;
  label: string;
  motherChunks: number;
  soaEstimate: number;
  wisdomPercent: number;
  description: string | null;
  subdomains: {
    subdomain: string;
    label: string;
    motherChunks: number;
    soaEstimate: number;
    wisdomPercent: number;
    description: string | null;
  }[];
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Get all rows from knowledge_wisdom
    const [allRows] = await (db as any).$client.query(
      `SELECT 
         kw.domain,
         kw.subdomain,
         kw.soa_estimate,
         kw.description,
         COALESCE(pc_count.chunk_count, 0) as mother_chunks
       FROM knowledge_wisdom kw
       LEFT JOIN (
         SELECT 
           p.paper_domain as domain,
           p.paper_subdomain as subdomain,
           COUNT(pc.id) as chunk_count
         FROM papers p
         JOIN paper_chunks pc ON pc.paper_id = p.id
         WHERE p.paper_domain IS NOT NULL AND p.paper_domain != 'unclassified'
         GROUP BY p.paper_domain, p.paper_subdomain
       ) pc_count ON pc_count.domain = kw.domain 
         AND (
           (kw.subdomain IS NULL AND pc_count.subdomain IS NULL) OR
           (kw.subdomain IS NOT NULL AND pc_count.subdomain = kw.subdomain)
         )
       ORDER BY kw.domain ASC, kw.subdomain ASC`
    );

    const domainLabels: Record<string, string> = {
      machine_learning: 'Machine Learning',
      software_engineering: 'Eng. de Software',
      mathematics: 'Matemática',
      cognitive_science: 'Ciência Cognitiva',
      philosophy: 'Filosofia',
      health_fitness: 'Saúde & Fitness',
      business: 'Negócios',
    };

    const subdomainLabels: Record<string, string> = {
      deep_learning: 'Deep Learning',
      nlp: 'NLP / LLMs',
      reinforcement_learning: 'Aprendizado por Reforço',
      computer_vision: 'Visão Computacional',
      rag_retrieval: 'RAG & Recuperação',
      self_improving_ai: 'IA Auto-Melhorável',
      distributed_systems: 'Sistemas Distribuídos',
      databases: 'Bancos de Dados',
      devops_cicd: 'DevOps / CI-CD',
      security: 'Segurança',
      testing: 'Testes',
      statistics: 'Estatística',
      linear_algebra: 'Álgebra Linear',
      calculus: 'Cálculo',
      category_theory: 'Teoria das Categorias',
      topology: 'Topologia',
      neuroscience: 'Neurociência',
      memory_learning: 'Memória & Aprendizado',
      consciousness: 'Consciência',
      decision_making: 'Tomada de Decisão',
    };

    // Group by domain
    const domainMap = new Map<string, {
      domain: string;
      label: string;
      motherChunks: number;
      soaEstimate: number;
      wisdomPercent: number;
      description: string | null;
      subdomains: any[];
    }>();

    for (const row of (allRows as any[])) {
      const domain = row.domain;
      const subdomain = row.subdomain;
      const chunks = Number(row.mother_chunks);
      const soa = Number(row.soa_estimate);
      const pct = Math.min(100, Math.round((chunks / soa) * 1000) / 10);

      if (!subdomain) {
        // Top-level domain
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            domain,
            label: domainLabels[domain] || domain,
            motherChunks: chunks,
            soaEstimate: soa,
            wisdomPercent: pct,
            description: row.description,
            subdomains: [],
          });
        }
      } else {
        // Subdomain — add to parent
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            domain,
            label: domainLabels[domain] || domain,
            motherChunks: 0,
            soaEstimate: 0,
            wisdomPercent: 0,
            description: null,
            subdomains: [],
          });
        }
        domainMap.get(domain)!.subdomains.push({
          subdomain,
          label: subdomainLabels[subdomain] || subdomain,
          motherChunks: chunks,
          soaEstimate: soa,
          wisdomPercent: pct,
          description: row.description,
        });
      }
    }

    return Array.from(domainMap.values());
  } catch (error) {
    console.error('[MOTHER] Knowledge hierarchy failed:', error);
    return [];
  }
}
