/**
 * Structured Output Enforcement
 * MOTHER v75.5 — Ciclo 56 — Action 4
 *
 * Scientific basis:
 *   - OpenAI Structured Outputs (Achiam et al., 2023): JSON Schema-constrained
 *     generation eliminates parsing failures and ensures extractable data.
 *   - LMQL (Beurer-Kellner et al., arXiv:2212.06094, 2023): constrained
 *     decoding for reliable structured output.
 *   - Outlines (Willard & Louf, arXiv:2307.09702, 2023): regex/JSON-guided
 *     generation with formal guarantees.
 *   - TypeChat (Microsoft, 2023): TypeScript-schema-driven LLM output validation.
 *
 * Problem addressed:
 *   - Ciclo 55 benchmark: extraction dimension gap of 2.2 points vs Manus
 *   - Root cause: LLM sometimes returns prose instead of structured data
 *   - Solution: Enforce JSON Schema on extraction queries + retry on failure
 *
 * Architecture:
 *   1. Detect if query requires structured output (extraction patterns)
 *   2. Inject JSON Schema into system prompt
 *   3. Validate response against schema
 *   4. Retry with stricter prompt if validation fails (up to 2 retries)
 *   5. Fall back to prose extraction if schema enforcement fails
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';

const log = createLogger('StructuredOutput');

export interface StructuredOutputResult {
  applied: boolean;
  validated: boolean;
  retries: number;
  schema?: object;
  structuredData?: object;
  extractedResponse: string;
}

// Patterns that indicate extraction/structured output is needed
const EXTRACTION_PATTERNS = [
  // List extraction
  /\b(liste|list|enumere|enumerate|quais são|what are|me dê|give me)\b.*\b(todos|all|os|the)\b/i,
  /\b(extraia|extract|identifique|identify|encontre|find)\b/i,
  // Comparison tables
  /\b(compare|comparação|comparison|tabela|table|versus|vs\.?)\b/i,
  // Data extraction
  /\b(dados|data|métricas|metrics|estatísticas|statistics|números|numbers)\b/i,
  // Structured analysis
  /\b(pros e contras|pros and cons|vantagens e desvantagens|advantages and disadvantages)\b/i,
  /\b(swot|análise swot|swot analysis)\b/i,
  // Key-value extraction
  /\b(principais|main|key|chave)\b.*\b(pontos|points|aspectos|aspects|características|features)\b/i,
];

// JSON Schemas for common extraction tasks
const SCHEMAS: Record<string, object> = {
  list: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of extracted items',
      },
      count: { type: 'number', description: 'Total number of items' },
    },
    required: ['items'],
  },
  comparison: {
    type: 'object',
    properties: {
      subject_a: { type: 'string' },
      subject_b: { type: 'string' },
      dimensions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dimension: { type: 'string' },
            a_value: { type: 'string' },
            b_value: { type: 'string' },
            winner: { type: 'string', enum: ['a', 'b', 'tie', 'context-dependent'] },
          },
          required: ['dimension', 'a_value', 'b_value'],
        },
      },
      summary: { type: 'string' },
    },
    required: ['dimensions', 'summary'],
  },
  pros_cons: {
    type: 'object',
    properties: {
      pros: { type: 'array', items: { type: 'string' } },
      cons: { type: 'array', items: { type: 'string' } },
      recommendation: { type: 'string' },
    },
    required: ['pros', 'cons'],
  },
  swot: {
    type: 'object',
    properties: {
      strengths: { type: 'array', items: { type: 'string' } },
      weaknesses: { type: 'array', items: { type: 'string' } },
      opportunities: { type: 'array', items: { type: 'string' } },
      threats: { type: 'array', items: { type: 'string' } },
    },
    required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
  },
  key_points: {
    type: 'object',
    properties: {
      key_points: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            point: { type: 'string' },
            explanation: { type: 'string' },
          },
          required: ['point'],
        },
      },
      conclusion: { type: 'string' },
    },
    required: ['key_points'],
  },
};

/**
 * Detect if query requires structured output and which schema to use.
 */
export function detectStructuredOutputNeed(query: string): {
  needed: boolean;
  schemaType: string;
  schema: object | null;
} {
  const q = query.toLowerCase();

  // Check for SWOT
  if (/\bswot\b/i.test(q)) {
    return { needed: true, schemaType: 'swot', schema: SCHEMAS.swot };
  }

  // Check for pros/cons
  if (/\b(pros e contras|pros and cons|vantagens e desvantagens|advantages and disadvantages)\b/i.test(q)) {
    return { needed: true, schemaType: 'pros_cons', schema: SCHEMAS.pros_cons };
  }

  // Check for comparison
  if (/\b(compare|comparação|comparison|versus|vs\.?)\b/i.test(q) && q.length > 30) {
    return { needed: true, schemaType: 'comparison', schema: SCHEMAS.comparison };
  }

  // Check for key points extraction
  if (/\b(principais|main|key|chave)\b.*\b(pontos|points|aspectos|aspects)\b/i.test(q)) {
    return { needed: true, schemaType: 'key_points', schema: SCHEMAS.key_points };
  }

  // Check for list extraction
  const patternMatches = EXTRACTION_PATTERNS.filter(p => p.test(q)).length;
  if (patternMatches >= 2) {
    return { needed: true, schemaType: 'list', schema: SCHEMAS.list };
  }

  return { needed: false, schemaType: 'none', schema: null };
}

/**
 * Validate response against JSON Schema.
 * Simple validation — checks required fields exist.
 */
function validateAgainstSchema(data: object, schema: Record<string, unknown>): boolean {
  const required = (schema.required as string[]) || [];
  for (const field of required) {
    if (!(field in data)) return false;
  }
  return true;
}

/**
 * Convert structured data to readable prose response.
 * Ensures the final response is human-readable even when structured.
 */
function structuredToProse(data: object, schemaType: string): string {
  try {
    const d = data as Record<string, unknown>;

    switch (schemaType) {
      case 'pros_cons': {
        const pros = (d.pros as string[]) || [];
        const cons = (d.cons as string[]) || [];
        let result = '**Vantagens:**\n' + pros.map((p: string) => `- ${p}`).join('\n');
        result += '\n\n**Desvantagens:**\n' + cons.map((c: string) => `- ${c}`).join('\n');
        if (d.recommendation) result += `\n\n**Recomendação:** ${d.recommendation}`;
        return result;
      }
      case 'swot': {
        const s = (d.strengths as string[]) || [];
        const w = (d.weaknesses as string[]) || [];
        const o = (d.opportunities as string[]) || [];
        const t = (d.threats as string[]) || [];
        return `**Forças:**\n${s.map((x: string) => `- ${x}`).join('\n')}\n\n` +
               `**Fraquezas:**\n${w.map((x: string) => `- ${x}`).join('\n')}\n\n` +
               `**Oportunidades:**\n${o.map((x: string) => `- ${x}`).join('\n')}\n\n` +
               `**Ameaças:**\n${t.map((x: string) => `- ${x}`).join('\n')}`;
      }
      case 'key_points': {
        const kp = (d.key_points as Array<{ point: string; explanation?: string }>) || [];
        let result = kp.map((k, i) =>
          `**${i + 1}. ${k.point}**${k.explanation ? `\n${k.explanation}` : ''}`
        ).join('\n\n');
        if (d.conclusion) result += `\n\n**Conclusão:** ${d.conclusion}`;
        return result;
      }
      case 'list': {
        const items = (d.items as string[]) || [];
        return items.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n');
      }
      default:
        return JSON.stringify(data, null, 2);
    }
  } catch {
    return JSON.stringify(data, null, 2);
  }
}

/**
 * Apply Structured Output Enforcement to a query.
 * Detects extraction need, validates response, retries if needed.
 *
 * @param query - User query
 * @param response - LLM response to validate/enforce
 * @param systemPrompt - System prompt for retry
 */
export async function enforceStructuredOutput(
  query: string,
  response: string,
  systemPrompt: string
): Promise<StructuredOutputResult> {
  const detection = detectStructuredOutputNeed(query);

  if (!detection.needed || !detection.schema) {
    return {
      applied: false,
      validated: false,
      retries: 0,
      extractedResponse: response,
    };
  }

  log.info(`[StructuredOutput] Applying schema enforcement: type=${detection.schemaType}`);

  // Try to extract JSON from existing response first
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    response.match(/\{[\s\S]*\}/) ||
                    response.match(/\[[\s\S]*\]/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      if (validateAgainstSchema(parsed, detection.schema as Record<string, unknown>)) {
        const proseResponse = structuredToProse(parsed, detection.schemaType);
        return {
          applied: true,
          validated: true,
          retries: 0,
          schema: detection.schema,
          structuredData: parsed,
          extractedResponse: proseResponse || response,
        };
      }
    } catch {
      // JSON parse failed, proceed to retry
    }
  }

  // Retry with explicit schema enforcement (up to 2 retries)
  let retries = 0;
  const maxRetries = 2;

  while (retries < maxRetries) {
    retries++;

    const schemaStr = JSON.stringify(detection.schema, null, 2);
    const retryPrompt = `${systemPrompt}

IMPORTANT: Your response MUST be valid JSON conforming to this schema:
${schemaStr}

Return ONLY the JSON object, no markdown, no explanation.`;

    try {
      const retryResult = await invokeLLM({
        model: 'gpt-4o-mini',
        provider: 'openai',
        messages: [
          { role: 'system', content: retryPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      });

      const rawContent = retryResult.choices[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : '';

      // Extract JSON
      const jsonExtract = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          [null, content];
      const jsonStr = jsonExtract[1] || content;

      try {
        const parsed = JSON.parse(jsonStr.trim());
        if (validateAgainstSchema(parsed, detection.schema as Record<string, unknown>)) {
          const proseResponse = structuredToProse(parsed, detection.schemaType);
          log.info(`[StructuredOutput] Schema validated after ${retries} retries`);
          return {
            applied: true,
            validated: true,
            retries,
            schema: detection.schema,
            structuredData: parsed,
            extractedResponse: proseResponse || response,
          };
        }
      } catch {
        log.warn(`[StructuredOutput] JSON parse failed on retry ${retries}`);
      }
    } catch (err) {
      log.warn(`[StructuredOutput] Retry ${retries} failed:`, (err as Error).message);
    }
  }

  // All retries failed — return original response
  log.warn(`[StructuredOutput] Schema enforcement failed after ${retries} retries, using original`);
  return {
    applied: true,
    validated: false,
    retries,
    schema: detection.schema,
    extractedResponse: response,
  };
}
