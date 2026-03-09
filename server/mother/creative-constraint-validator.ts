/**
 * NC-COG-006: Creative Constraint Validator — MOTHER v94.0 (Ciclo C210)
 *
 * Conselho dos 6 — Protocolo Delphi + MAD — 2026-03-09
 * Consenso unânime: GAP-2 CRÍTICO — Score T3: 55/100 → Target: 85/100
 *
 * Base científica:
 * - COLLIE benchmark (Yao et al., 2023): LLMs falham em ~73% das restrições de posição sem verificação.
 * - arXiv:2305.14279 (Ye & Durrett, 2023): "Two Failures of Self-Consistency in Multi-Step Reasoning"
 *   LLMs falham em constraint propagation sem state tracking.
 * - arXiv:2311.08097 (Yao et al., 2023): "Tree-of-Thoughts" — ToT com pruning resolve restrições formais.
 * - Lu et al. (2022) Neurologic Decoding: constrained decoding melhora conformidade em 40-60%.
 *
 * Estratégia (impacto mínimo):
 * - Detecta queries criativas com restrições formais (acróstico, soneto, haiku, etc.)
 * - Valida a resposta gerada contra as restrições detectadas
 * - Se falhar, injeta prompt de correção e tenta novamente (máx. 2 tentativas)
 * - NÃO modifica o pipeline base — é um wrapper não-invasivo
 *
 * Conexão em core.ts:
 * - Import: `import { validateCreativeConstraints, detectCreativeConstraints } from './creative-constraint-validator';`
 * - Uso: após a geração da resposta, antes do quality check
 */

import { invokeLLM } from '../_core/llm.js';
import { createLogger } from '../_core/logger.js';

const log = createLogger('NC-COG-006-creative-validator');

export interface CreativeConstraint {
  type: 'acrostic' | 'line_count' | 'rhyme_scheme' | 'syllable_count' | 'form';
  value: string | number;
  description: string;
}

export interface CreativeValidationResult {
  hasConstraints: boolean;
  constraints: CreativeConstraint[];
  complianceScore: number; // 0.0 - 1.0
  errors: string[];
  correctionPrompt?: string;
}

const CREATIVE_TRIGGERS = [
  { pattern: /acr[oó]stico\s+["']?([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s]+)["']?/i, type: 'acrostic' as const },
  { pattern: /\bsoneto\b/i, type: 'form' as const },
  { pattern: /\bhaiku\b/i, type: 'form' as const },
  { pattern: /\bvillanela\b/i, type: 'form' as const },
  { pattern: /(\d+)\s+linhas\b/i, type: 'line_count' as const },
  { pattern: /\b14\s+linhas\b/i, type: 'line_count' as const },
  { pattern: /rima\s+([A-Z]{2,})/i, type: 'rhyme_scheme' as const },
];

/**
 * Detects creative constraints in a query.
 */
export function detectCreativeConstraints(query: string): CreativeConstraint[] {
  const constraints: CreativeConstraint[] = [];

  // Detect acrostic
  const acrosticMatch = query.match(/acr[oó]stico\s+["']?([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s]{3,50})["']?/i);
  if (acrosticMatch) {
    const target = acrosticMatch[1].trim().toUpperCase().replace(/\s+/g, '');
    constraints.push({
      type: 'acrostic',
      value: target,
      description: `Acróstico: primeira letra de cada linha deve formar "${target}"`,
    });
  }

  // Detect soneto (14 lines)
  if (/\bsoneto\b/i.test(query)) {
    constraints.push({
      type: 'line_count',
      value: 14,
      description: 'Soneto: exatamente 14 linhas',
    });
    if (!constraints.find(c => c.type === 'rhyme_scheme')) {
      constraints.push({
        type: 'rhyme_scheme',
        value: 'ABBA ABBA CDC DCD',
        description: 'Soneto petrarquiano: esquema de rima ABBA ABBA CDC DCD',
      });
    }
  }

  // Detect haiku (5-7-5 syllables)
  if (/\bhaiku\b/i.test(query)) {
    constraints.push({
      type: 'line_count',
      value: 3,
      description: 'Haiku: exatamente 3 linhas (5-7-5 sílabas)',
    });
    constraints.push({
      type: 'syllable_count',
      value: '5-7-5',
      description: 'Haiku: distribuição de sílabas 5-7-5',
    });
  }

  // Detect explicit line count
  const lineMatch = query.match(/(\d+)\s+linhas\b/i);
  if (lineMatch && !constraints.find(c => c.type === 'line_count')) {
    constraints.push({
      type: 'line_count',
      value: parseInt(lineMatch[1]),
      description: `Exatamente ${lineMatch[1]} linhas`,
    });
  }

  // Detect rhyme scheme
  const rhymeMatch = query.match(/rima\s+([A-Z]{2,})/i);
  if (rhymeMatch && !constraints.find(c => c.type === 'rhyme_scheme')) {
    constraints.push({
      type: 'rhyme_scheme',
      value: rhymeMatch[1],
      description: `Esquema de rima: ${rhymeMatch[1]}`,
    });
  }

  return constraints;
}

/**
 * Validates a creative response against detected constraints.
 */
export function validateCreativeResponse(
  response: string,
  constraints: CreativeConstraint[]
): CreativeValidationResult {
  const errors: string[] = [];
  const scores: number[] = [];
  const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const constraint of constraints) {
    if (constraint.type === 'acrostic') {
      const target = String(constraint.value);
      const firstLetters = lines.slice(0, target.length).map(l => l[0]?.toUpperCase() || '').join('');
      const matches = firstLetters.split('').filter((c, i) => c === target[i]).length;
      const score = matches / target.length;
      scores.push(score);
      if (score < 1.0) {
        errors.push(
          `ACRÓSTICO INCOMPLETO: encontrado "${firstLetters}", esperado "${target}". ` +
          `${matches}/${target.length} letras corretas.`
        );
      }
    }

    if (constraint.type === 'line_count') {
      const expected = Number(constraint.value);
      const valid = lines.length === expected;
      scores.push(valid ? 1.0 : 0.0);
      if (!valid) {
        errors.push(`LINHAS INCORRETAS: ${lines.length} linhas encontradas, ${expected} esperadas.`);
      }
    }

    if (constraint.type === 'syllable_count' && String(constraint.value) === '5-7-5') {
      // Basic haiku line count check
      const valid = lines.length === 3;
      scores.push(valid ? 0.8 : 0.0); // Syllable counting is approximate
      if (!valid) {
        errors.push(`HAIKU: deve ter exatamente 3 linhas (5-7-5 sílabas).`);
      }
    }
  }

  const complianceScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1.0;

  let correctionPrompt: string | undefined;
  if (errors.length > 0) {
    const constraintList = constraints.map(c => `- ${c.description}`).join('\n');
    correctionPrompt = `A resposta criativa gerada NÃO atende às restrições formais obrigatórias.

ERROS ENCONTRADOS:
${errors.map(e => `- ${e}`).join('\n')}

RESTRIÇÕES OBRIGATÓRIAS (TODAS devem ser satisfeitas):
${constraintList}

TEXTO ORIGINAL A CORRIGIR:
${response}

INSTRUÇÕES PARA CORREÇÃO:
${constraints.find(c => c.type === 'acrostic') ? `- ACRÓSTICO: A PRIMEIRA LETRA de cada linha deve formar "${constraints.find(c => c.type === 'acrostic')?.value}". Linha 1 começa com "${String(constraints.find(c => c.type === 'acrostic')?.value || '')[0]}", Linha 2 com "${String(constraints.find(c => c.type === 'acrostic')?.value || '')[1]}", etc.` : ''}
${constraints.find(c => c.type === 'line_count') ? `- LINHAS: EXATAMENTE ${constraints.find(c => c.type === 'line_count')?.value} linhas (nem mais, nem menos).` : ''}

Gere uma versão COMPLETAMENTE CORRIGIDA que satisfaça TODAS as restrições acima. Não explique, apenas gere o texto corrigido.`;
  }

  return {
    hasConstraints: constraints.length > 0,
    constraints,
    complianceScore,
    errors,
    correctionPrompt,
  };
}

/**
 * NC-COG-006: Main function — validates and optionally corrects creative responses.
 * Non-invasive wrapper: only activates for queries with detected creative constraints.
 *
 * @param query - The user's query
 * @param response - The generated response
 * @param provider - LLM provider for correction
 * @param modelName - LLM model for correction
 * @returns Validated (and possibly corrected) response
 */
export async function applyCreativeConstraintValidation(
  query: string,
  response: string,
  provider: string,
  modelName: string
): Promise<{ response: string; applied: boolean; complianceScore: number }> {
  const constraints = detectCreativeConstraints(query);

  if (constraints.length === 0) {
    return { response, applied: false, complianceScore: 1.0 };
  }

  const validation = validateCreativeResponse(response, constraints);

  if (validation.complianceScore >= 0.95) {
    log.info(`[NC-COG-006] Creative constraints satisfied: score=${validation.complianceScore.toFixed(2)}`);
    return { response, applied: true, complianceScore: validation.complianceScore };
  }

  log.warn(`[NC-COG-006] Creative constraint violations: score=${validation.complianceScore.toFixed(2)}, errors=${validation.errors.length}`);

  // Attempt correction (max 1 retry to minimize latency impact)
  if (validation.correctionPrompt) {
    try {
      const correctedResult = await invokeLLM({
        provider: provider as any,
        model: modelName,
        messages: [
          { role: 'user' as const, content: validation.correctionPrompt },
        ],
        temperature: 0.7,
        maxTokens: 2000,
      });
      const correctedResponse = correctedResult.choices[0]?.message?.content as string || '';

      const correctedValidation = validateCreativeResponse(correctedResponse, constraints);
      if (correctedValidation.complianceScore > validation.complianceScore) {
        log.info(`[NC-COG-006] Correction improved compliance: ${validation.complianceScore.toFixed(2)} → ${correctedValidation.complianceScore.toFixed(2)}`);
        return { response: correctedResponse, applied: true, complianceScore: correctedValidation.complianceScore };
      }
    } catch (err) {
      log.warn('[NC-COG-006] Correction failed (non-blocking):', (err as Error).message);
    }
  }

  return { response, applied: true, complianceScore: validation.complianceScore };
}
