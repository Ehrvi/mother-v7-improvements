/**
 * Response Normalizer — Ensures consistent output format regardless of LLM provider
 * Scientific basis: Provider-agnostic output normalization for consistent UX
 * Problem: Gemini uses excessive **bold**, DeepSeek is too terse, GPT-4o adds filler phrases
 */

import { createLogger } from '../_core/logger';

const log = createLogger('NORMALIZER');

export interface NormalizationResult {
  normalized: string;
  changes: string[];
  provider: string;
}

/**
 * Normalize LLM response to consistent format.
 * Applied BEFORE quality checks (Layer 4.8).
 */
export function normalizeResponse(response: string, provider?: string): NormalizationResult {
  const changes: string[] = [];
  let text = response;

  // 1. Remove provider-specific filler phrases
  const fillerPatterns = [
    /^(Certainly!|Sure!|Of course!|Absolutely!|Great question!|I'd be happy to help!)\s*/i,
    /^(Claro!|Com certeza!|Sem dúvida!|Ótima pergunta!|Vou te ajudar!)\s*/i,
    /^(Here'?s? (?:is |are )?(?:the |a |an |my )?(?:answer|response|explanation|breakdown|summary|overview)[.:!]?\s*)/i,
    /^(Aqui está (?:a |o )?(?:resposta|explicação|resumo|análise)[.:!]?\s*)/i,
    /^(Let me (?:explain|break down|help you|walk you through|provide)[.:!]?\s*)/i,
    /^(Vou (?:explicar|te ajudar|apresentar)[.:!]?\s*)/i,
    // Remove "Revised Response" prefixes (Self-Refine artifacts)
    /^(Revised Response:|Resposta Revisada:|Here is the revised version:)\s*/i,
  ];

  for (const pattern of fillerPatterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      changes.push('removed_filler');
    }
  }

  // 2. Normalize excessive bold (Gemini tends to bold too much)
  // Count bold segments — if >10 in a short response, reduce
  const boldCount = (text.match(/\*\*[^*]+\*\*/g) || []).length;
  const wordCount = text.split(/\s+/).length;
  if (boldCount > 10 && boldCount / wordCount > 0.15) {
    // Remove bold from common words that shouldn't be bold
    text = text.replace(/\*\*((?:a|o|e|de|da|do|em|para|com|por|que|the|a|an|is|are|in|to|of|and|for|with|this|that)\s)/gi, '$1');
    changes.push('reduced_excessive_bold');
  }

  // 3. Normalize heading levels (ensure consistent hierarchy)
  // If response starts with # (h1), downgrade all headings by 1
  if (/^# [^#]/m.test(text) && /^## /m.test(text)) {
    // Has both h1 and h2 — this is fine, leave as is
  } else if (/^# [^#]/m.test(text)) {
    // Only h1 — downgrade to h2
    text = text.replace(/^# ([^#])/gm, '## $1');
    changes.push('downgraded_h1_to_h2');
  }

  // 4. Normalize code blocks — ensure language tag
  text = text.replace(/```\n/g, '```text\n');
  // But don't double-tag
  text = text.replace(/```text\ntext\n/g, '```text\n');

  // 5. Remove trailing meta-commentary
  const metaPatterns = [
    /\n---\n(?:Note|Nota|Observação|Disclaimer|Aviso)[:\s].{0,500}$/is,
    /\n\*(?:This response|Esta resposta|I hope|Espero).{0,300}$/is,
  ];
  for (const pattern of metaPatterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      changes.push('removed_trailing_meta');
    }
  }

  // 6. Ensure response doesn't start with whitespace
  text = text.trimStart();

  // 7. Normalize list formatting (ensure consistent bullet style)
  // Convert - bullets to consistent format (don't mix - and *)
  if (/^\* /m.test(text) && /^- /m.test(text)) {
    text = text.replace(/^\* /gm, '- ');
    changes.push('unified_bullet_style');
  }

  if (changes.length > 0) {
    log.info(`[Normalizer] Applied ${changes.length} normalizations: ${changes.join(', ')}`);
  }

  return { normalized: text, changes, provider: provider || 'unknown' };
}
