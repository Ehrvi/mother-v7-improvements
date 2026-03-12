/**
 * Inline Verifier — Closed-loop verification during streaming
 * Instead of verifying AFTER full response, verify DURING generation.
 * Detects hallucination patterns, contradictions, and quality issues in real-time.
 * Scientific basis: MANUS closed-loop + FLARE active retrieval (arXiv:2305.06983)
 */

import { createLogger } from '../_core/logger';

const log = createLogger('INLINE_VERIFIER');

export interface VerificationIssue {
  type: 'hallucination' | 'contradiction' | 'self_reference' | 'low_quality' | 'filler';
  position: number;
  text: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface ChunkVerificationResult {
  passed: boolean;
  issues: VerificationIssue[];
  shouldInterrupt: boolean;
}

// Patterns that indicate hallucination or quality issues
const HALLUCINATION_PATTERNS = [
  // Fabricated citations
  /\((?:Smith|Johnson|Williams|Brown|Jones|Garcia|Miller|Davis|Rodriguez|Martinez)\s+et\s+al\.\s*,\s*\d{4}\)/i,
  // Vague unsubstantiated claims
  /(?:studies\s+(?:have\s+)?show(?:n|s)?|research\s+(?:has\s+)?(?:shown|indicates?|suggests?|demonstrates?))(?!\s*[\[(])/i,
];

const SELF_REFERENCE_PATTERNS = [
  /\b(?:as\s+(?:an?\s+)?(?:AI|language\s+model|assistant|LLM))\b/i,
  /\b(?:I'?m\s+(?:just\s+)?(?:an?\s+)?(?:AI|language\s+model|assistant))\b/i,
  /\b(?:como\s+(?:uma?\s+)?(?:IA|inteligência\s+artificial|assistente|modelo\s+de\s+linguagem))\b/i,
  /\b(?:As\s+MOTHER|Como\s+MOTHER|I\s+am\s+MOTHER|Eu\s+sou\s+(?:a\s+)?MOTHER)\b/i,
];

const FILLER_PATTERNS = [
  /^(?:Certainly|Sure|Of course|Absolutely|Great question|I'd be happy to)/i,
  /^(?:Claro|Com certeza|Sem dúvida|Ótima pergunta|Vou te ajudar)/i,
  /\b(?:It'?s?\s+(?:worth\s+)?(?:noting|mentioning|important\s+to\s+note))\b/i,
  /\b(?:(?:Vale|É\s+importante)\s+(?:a\s+pena\s+)?(?:notar|mencionar|observar|ressaltar))\b/i,
];

/**
 * Verify a streaming chunk in real-time.
 * Called for each chunk during LLM generation.
 */
export function verifyChunk(
  chunk: string,
  accumulatedResponse: string,
  contextSnippets: string[],
): ChunkVerificationResult {
  const issues: VerificationIssue[] = [];
  const fullText = accumulatedResponse + chunk;

  // Check for hallucination patterns
  for (const pattern of HALLUCINATION_PATTERNS) {
    const match = chunk.match(pattern);
    if (match) {
      // Verify against context
      const cited = match[0];
      const inContext = contextSnippets.some(ctx =>
        ctx.toLowerCase().includes(cited.toLowerCase().replace(/\(|\)/g, ''))
      );
      if (!inContext) {
        issues.push({
          type: 'hallucination',
          position: accumulatedResponse.length,
          text: match[0],
          severity: 'high',
          suggestion: 'Citation not found in provided context',
        });
      }
    }
  }

  // Check for self-reference
  for (const pattern of SELF_REFERENCE_PATTERNS) {
    const match = chunk.match(pattern);
    if (match) {
      issues.push({
        type: 'self_reference',
        position: accumulatedResponse.length,
        text: match[0],
        severity: 'medium',
        suggestion: 'Remove AI self-reference',
      });
    }
  }

  // Check for filler (only at the start of response)
  if (accumulatedResponse.length < 50) {
    for (const pattern of FILLER_PATTERNS) {
      const match = chunk.match(pattern);
      if (match) {
        issues.push({
          type: 'filler',
          position: 0,
          text: match[0],
          severity: 'low',
          suggestion: 'Remove filler phrase',
        });
      }
    }
  }

  // Check for contradiction with context
  if (contextSnippets.length > 0 && fullText.length > 200) {
    const contradictionCheck = detectContradiction(fullText, contextSnippets);
    if (contradictionCheck) {
      issues.push(contradictionCheck);
    }
  }

  const highSeverityCount = issues.filter(i => i.severity === 'high').length;

  return {
    passed: highSeverityCount === 0,
    issues,
    shouldInterrupt: highSeverityCount >= 2, // Interrupt only on multiple high-severity issues
  };
}

/**
 * Post-process response to fix detected issues.
 */
export function fixVerificationIssues(
  response: string,
  issues: VerificationIssue[],
): string {
  let fixed = response;

  // Remove filler at the start
  const fillerIssues = issues.filter(i => i.type === 'filler' && i.position === 0);
  for (const issue of fillerIssues) {
    for (const pattern of FILLER_PATTERNS) {
      fixed = fixed.replace(pattern, '').trimStart();
    }
  }

  // Remove self-references
  const selfRefIssues = issues.filter(i => i.type === 'self_reference');
  for (const issue of selfRefIssues) {
    // Replace common self-reference patterns
    fixed = fixed.replace(/\bAs (?:an? )?AI(?:\s+(?:language\s+)?model)?\b/gi, '');
    fixed = fixed.replace(/\bComo (?:uma? )?IA\b/gi, '');
    fixed = fixed.replace(/\bAs MOTHER\b/gi, '');
    fixed = fixed.replace(/\bComo MOTHER\b/gi, '');
  }

  if (issues.length > 0) {
    log.info(`[InlineVerifier] Fixed ${issues.length} issues: ${issues.map(i => i.type).join(', ')}`);
  }

  return fixed.trim();
}

function detectContradiction(
  response: string,
  contextSnippets: string[],
): VerificationIssue | null {
  // Simple heuristic: check for negation of context claims
  const negationPatterns = [
    /\b(?:não|no|never|nunca|incorrect|incorreto|wrong|errado)\b/i,
  ];

  for (const pattern of negationPatterns) {
    const match = response.match(pattern);
    if (match) {
      // Check if the surrounding text contradicts a context snippet
      const surroundingText = response.slice(
        Math.max(0, (match.index || 0) - 100),
        (match.index || 0) + 100
      ).toLowerCase();

      for (const ctx of contextSnippets) {
        const ctxLower = ctx.toLowerCase();
        // If context makes a claim and response negates it, flag
        const ctxWords = ctxLower.split(/\s+/).filter(w => w.length > 4);
        const matchingWords = ctxWords.filter(w => surroundingText.includes(w));
        if (matchingWords.length >= 3) {
          return {
            type: 'contradiction',
            position: match.index || 0,
            text: surroundingText.trim(),
            severity: 'medium',
            suggestion: `May contradict context: "${ctx.slice(0, 100)}..."`,
          };
        }
      }
    }
  }

  return null;
}
