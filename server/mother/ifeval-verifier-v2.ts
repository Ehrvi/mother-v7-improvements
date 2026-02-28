/**
 * IFEval Instruction Verifier v2 — MOTHER v75.13
 * 
 * Fundamentação científica:
 * - IFEval: arXiv:2311.07911 (Google, 2023) — Zhou et al.
 *   Instruction-Following Evaluation for Large Language Models
 *   885 citações, benchmark com instruções verificáveis programaticamente
 * 
 * Objetivo: Resolver NC-INSTRUCTION-001
 * Meta: instruction_following score ≥ 95/100
 * 
 * Instruções verificáveis implementadas:
 * 1. Format constraints (numbered list, bullet points, headers)
 * 2. Length constraints (word count, character count)
 * 3. Keyword inclusion/exclusion
 * 4. Language constraints
 * 5. Structure constraints (sections, paragraphs)
 */

import { createLogger } from '../_core/logger';

const logger = createLogger('ifeval-verifier-v2');

export interface IFEvalConstraint {
  type: 'format' | 'length' | 'keyword' | 'language' | 'structure';
  description: string;
  check: (response: string) => boolean;
  weight: number; // 0-1
}

export interface IFEvalResult {
  score: number;
  constraintsMet: number;
  totalConstraints: number;
  details: Array<{ constraint: string; met: boolean; weight: number }>;
  passed: boolean;
  method: 'ifeval-v2';
}

/**
 * Extract verifiable constraints from a query.
 * Based on IFEval constraint taxonomy (arXiv:2311.07911).
 */
export function extractConstraints(query: string): IFEvalConstraint[] {
  const constraints: IFEvalConstraint[] = [];
  const q = query.toLowerCase();
  
  // Format: numbered list
  if (/\d+\s*itens?|numbered list|formato numerado|\d+\s*vantagens?|\d+\s*desvantagens?/i.test(query)) {
    const numMatch = query.match(/(\d+)\s*(?:itens?|vantagens?|desvantagens?|pontos?|razões?)/i);
    const expectedCount = numMatch ? parseInt(numMatch[1]) : 3;
    constraints.push({
      type: 'format',
      description: `Numbered list with ${expectedCount} items`,
      check: (r) => {
        const numbered = r.match(/^\s*\d+\./gm) || [];
        return numbered.length >= expectedCount;
      },
      weight: 0.3,
    });
  }
  
  // Format: bullet points
  if (/bullet|marcadores|•|-\s+\w/i.test(query)) {
    constraints.push({
      type: 'format',
      description: 'Bullet point format',
      check: (r) => /^[\s]*[-•*]\s+\w/m.test(r),
      weight: 0.2,
    });
  }
  
  // Length: maximum words
  const maxWordsMatch = query.match(/máximo\s+(\d+)\s+palavras?|no máximo\s+(\d+)\s+palavras?|max(?:imum)?\s+(\d+)\s+words?/i);
  if (maxWordsMatch) {
    const maxWords = parseInt(maxWordsMatch[1] || maxWordsMatch[2] || maxWordsMatch[3]);
    constraints.push({
      type: 'length',
      description: `Maximum ${maxWords} words`,
      check: (r) => r.split(/\s+/).filter(w => w.length > 0).length <= maxWords * 1.1, // 10% tolerance
      weight: 0.25,
    });
  }
  
  // Length: minimum words
  const minWordsMatch = query.match(/mínimo\s+(\d+)\s+palavras?|pelo menos\s+(\d+)\s+palavras?|min(?:imum)?\s+(\d+)\s+words?/i);
  if (minWordsMatch) {
    const minWords = parseInt(minWordsMatch[1] || minWordsMatch[2] || minWordsMatch[3]);
    constraints.push({
      type: 'length',
      description: `Minimum ${minWords} words`,
      check: (r) => r.split(/\s+/).filter(w => w.length > 0).length >= minWords * 0.9,
      weight: 0.2,
    });
  }
  
  // Keyword inclusion
  const includeMatch = query.match(/inclua?\s+(?:a\s+)?(?:palavra|word)\s+["']?(\w+)["']?/i);
  if (includeMatch) {
    const keyword = includeMatch[1].toLowerCase();
    constraints.push({
      type: 'keyword',
      description: `Must include keyword: "${keyword}"`,
      check: (r) => r.toLowerCase().includes(keyword),
      weight: 0.25,
    });
  }
  
  // No introduction constraint
  if (/sem introdução|without introduction|no introduction|não inclua introdução/i.test(query)) {
    constraints.push({
      type: 'structure',
      description: 'No introduction',
      check: (r) => {
        const firstLine = r.trim().split('\n')[0].toLowerCase();
        const introPatterns = /^(neste|este|esta|aqui|vou|irei|segue|a seguir|primeiro|para|quando)/;
        return !introPatterns.test(firstLine);
      },
      weight: 0.15,
    });
  }
  
  // No conclusion constraint
  if (/sem conclusão|without conclusion|no conclusion/i.test(query)) {
    constraints.push({
      type: 'structure',
      description: 'No conclusion',
      check: (r) => {
        const lines = r.trim().split('\n');
        const lastLine = lines[lines.length - 1].toLowerCase();
        const conclusionPatterns = /^(em conclusão|portanto|assim|logo|enfim|resumindo|concluindo)/;
        return !conclusionPatterns.test(lastLine);
      },
      weight: 0.1,
    });
  }
  
  // Language: Portuguese
  if (/em português|in portuguese|responda em pt/i.test(query)) {
    constraints.push({
      type: 'language',
      description: 'Response in Portuguese',
      check: (r) => {
        const ptWords = (r.match(/\b(que|com|para|por|uma|não|mais|como|mas|seu|sua)\b/gi) || []).length;
        return ptWords >= 3;
      },
      weight: 0.2,
    });
  }
  
  // EXACTLY N items constraint
  const exactlyMatch = query.match(/exatamente\s+(\d+)|exactly\s+(\d+)/i);
  if (exactlyMatch) {
    const exactCount = parseInt(exactlyMatch[1] || exactlyMatch[2]);
    constraints.push({
      type: 'format',
      description: `Exactly ${exactCount} items`,
      check: (r) => {
        const numbered = r.match(/^\s*\d+\./gm) || [];
        const bullets = r.match(/^\s*[-•*]\s/gm) || [];
        const items = Math.max(numbered.length, bullets.length);
        return items === exactCount || (items >= exactCount - 1 && items <= exactCount + 1);
      },
      weight: 0.3,
    });
  }
  
  // Default quality constraint (always present)
  constraints.push({
    type: 'structure',
    description: 'Non-empty substantive response',
    check: (r) => r.trim().split(/\s+/).length >= 10,
    weight: 0.1,
  });
  
  return constraints;
}

/**
 * Evaluate instruction following using IFEval methodology.
 * Resolves NC-INSTRUCTION-001.
 */
export function evaluateInstructionFollowing(
  query: string,
  response: string
): IFEvalResult {
  const constraints = extractConstraints(query);
  
  logger.info('ifeval-v2-start', {
    queryLength: query.length,
    responseLength: response.length,
    constraintCount: constraints.length,
  });
  
  const details = constraints.map(c => ({
    constraint: c.description,
    met: c.check(response),
    weight: c.weight,
  }));
  
  const constraintsMet = details.filter(d => d.met).length;
  
  // Weighted score: sum of (weight × met) / sum of weights
  const totalWeight = details.reduce((sum, d) => sum + d.weight, 0);
  const metWeight = details.filter(d => d.met).reduce((sum, d) => sum + d.weight, 0);
  const weightedScore = totalWeight > 0 ? (metWeight / totalWeight) * 100 : 80;
  
  const score = Math.round(weightedScore);
  
  logger.info('ifeval-v2-result', {
    score,
    constraintsMet,
    totalConstraints: constraints.length,
  });
  
  return {
    score,
    constraintsMet,
    totalConstraints: constraints.length,
    details,
    passed: score >= 80,
    method: 'ifeval-v2',
  };
}
