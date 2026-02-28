/**
 * Structured Output Enforcement with SCOPE Reflection Loop
 * MOTHER v75.8 — Ciclo 58 — Enhanced
 *
 * Scientific basis:
 *   - PARSE / SCOPE (Shrimal et al., arXiv:2510.08623, EMNLP 2025):
 *     Schema-guided extraction with reflection loop. SCOPE reduces extraction
 *     errors by 92% within first retry via error-specific feedback. Key insight:
 *     generic retry prompts fail; error-specific feedback enables self-correction.
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
 *   - Solution: SCOPE reflection loop — retry with specific error feedback
 *
 * Architecture (SCOPE):
 *   1. Detect if query requires structured output (extraction patterns)
 *   2. Inject JSON Schema into system prompt
 *   3. Validate response against schema
 *   4. On failure: identify SPECIFIC error (missing field, wrong type, etc.)
 *   5. Retry with error-specific feedback (not generic retry)
 *   6. Fall back to prose extraction if SCOPE fails
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
 * SCOPE: Diagnose specific extraction error for reflection feedback.
 * Scientific basis: PARSE (Shrimal et al., arXiv:2510.08623, EMNLP 2025) — Table 3
 *
 * Error categories:
 *   - MISSING_FIELD: Required field absent from output
 *   - WRONG_TYPE: Field present but wrong type (e.g., string instead of array)
 *   - INVALID_JSON: Response is not valid JSON at all
 *   - EMPTY_ARRAY: Required array field is empty
 */
function diagnoseSCOPEError(
  content: string,
  schema: Record<string, unknown>,
  parseError?: string
): string {
  if (parseError) {
    // JSON parse error — most common failure mode
    const snippet = content.slice(0, 200).replace(/\n/g, ' ');
    return `INVALID_JSON: The response is not valid JSON. Parse error: ${parseError}. ` +
           `Your response started with: "${snippet}...". ` +
           `Return ONLY a raw JSON object, no markdown code blocks, no explanation text.`;
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const required = (schema.required as string[]) || [];

    for (const field of required) {
      if (!(field in parsed)) {
        return `MISSING_FIELD: Required field "${field}" is missing from your JSON response. ` +
               `You returned: ${JSON.stringify(Object.keys(parsed))}. ` +
               `Add the "${field}" field to your response.`;
      }

      const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
      if (props && props[field]) {
        const expectedType = props[field].type as string;
        const actualValue = parsed[field];
        const actualType = Array.isArray(actualValue) ? 'array' : typeof actualValue;

        if (expectedType === 'array' && !Array.isArray(actualValue)) {
          return `WRONG_TYPE: Field "${field}" must be an array but you returned ${actualType}. ` +
                 `Wrap the value in square brackets: ["item1", "item2"]`;
        }

        if (expectedType === 'array' && Array.isArray(actualValue) && actualValue.length === 0) {
          return `EMPTY_ARRAY: Field "${field}" is an empty array. ` +
                 `Provide at least one item based on the query content.`;
        }
      }
    }
  } catch (e) {
    return `INVALID_JSON: Could not parse response as JSON. Error: ${(e as Error).message}`;
  }

  return 'UNKNOWN_ERROR: Response did not match schema. Review all required fields and types.';
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

  // SCOPE Reflection Loop: retry with error-specific feedback (arXiv:2510.08623)
  let retries = 0;
  const maxRetries = 2;
  let scopeErrorFeedback = '';

  while (retries < maxRetries) {
    retries++;

    const schemaStr = JSON.stringify(detection.schema, null, 2);
    // SCOPE: Include specific error diagnosis on retry 2 (reflection)
    const scopeSection = scopeErrorFeedback
      ? `\n\nSCOPE REFLECTION — Your previous attempt had this specific error:\n${scopeErrorFeedback}\nFix ONLY this issue.`
      : '';
    const retryPrompt = `${systemPrompt}\n\nIMPORTANT: Your response MUST be valid JSON conforming to this schema:\n${schemaStr}${scopeSection}\n\nReturn ONLY the JSON object, no markdown, no explanation.`;

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
          log.info(`[StructuredOutput] SCOPE validated after ${retries} retries`);
          return {
            applied: true,
            validated: true,
            retries,
            schema: detection.schema,
            structuredData: parsed,
            extractedResponse: proseResponse || response,
          };
        } else {
          // SCOPE: diagnose specific validation error for next retry
          scopeErrorFeedback = diagnoseSCOPEError(jsonStr.trim(), detection.schema as Record<string, unknown>);
          log.warn(`[StructuredOutput] SCOPE error on retry ${retries}: ${scopeErrorFeedback.slice(0, 100)}`);
        }
      } catch (parseErr) {
        // SCOPE: diagnose JSON parse error for next retry
        scopeErrorFeedback = diagnoseSCOPEError(content, detection.schema as Record<string, unknown>, (parseErr as Error).message);
        log.warn(`[StructuredOutput] SCOPE JSON parse error on retry ${retries}: ${scopeErrorFeedback.slice(0, 100)}`);
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
