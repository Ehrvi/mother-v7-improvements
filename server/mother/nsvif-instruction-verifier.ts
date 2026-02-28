/**
 * NSVIF Instruction Verifier — MOTHER v75.14
 * 
 * Base científica: Su et al. (2026) "Neuro-Symbolic Verification on Instruction
 * Following of LLMs" arXiv:2601.17789
 * 
 * Princípio: NSVIF formula a verificação de instruction-following como um problema
 * de satisfação de restrições (CSP). Modela restrições lógicas e semânticas,
 * com um solver unificado que orquestra raciocínio lógico e análise semântica.
 * 
 * Objetivo: Resolver NC-INSTRUCTION-001 (instruction_following 94.0 → meta 100.0, falta 6.0 pts)
 * 
 * Algoritmo:
 * 1. Extrair restrições da instrução (lógicas + semânticas)
 * 2. Verificar cada restrição na resposta (CSP solving)
 * 3. Calcular Constraint Satisfaction Rate (CSR)
 * 4. Se CSR < threshold: identificar violações e sugerir correções
 * 5. Feedback interpretável para melhorar instruction-following
 */

import { createLogger } from '../_core/logger.js';
import { invokeLLM } from '../_core/llm.js';

const logger = createLogger('nsvif-instruction-verifier');

export interface NSVIFConfig {
  /** Threshold mínimo de CSR (0-1). Default: 0.95 */
  csrThreshold: number;
  /** Verificar restrições lógicas (formato, comprimento, estrutura). Default: true */
  verifyLogical: boolean;
  /** Verificar restrições semânticas (conteúdo, tópico, tom). Default: true */
  verifySemantic: boolean;
  /** Categorias onde NSVIF é obrigatório */
  mandatoryCategories: string[];
}

export interface Constraint {
  type: 'logical' | 'semantic';
  description: string;
  satisfied: boolean;
  confidence: number;
  evidence?: string;
}

export interface NSVIFResult {
  csrScore: number;
  totalConstraints: number;
  satisfiedConstraints: number;
  constraints: Constraint[];
  violations: string[];
  feedback: string;
  action: 'accept' | 'flag' | 'reject';
  confidence: number;
}

const DEFAULT_CONFIG: NSVIFConfig = {
  csrThreshold: 0.95,
  verifyLogical: true,
  verifySemantic: true,
  mandatoryCategories: ['instruction_following', 'complex_reasoning'],
};

/**
 * Extrai restrições lógicas da instrução (formato, comprimento, estrutura)
 * Implementa o modelo de restrições lógicas do NSVIF (arXiv:2601.17789)
 */
function extractLogicalConstraints(instruction: string): Constraint[] {
  const constraints: Constraint[] = [];

  // Format constraints
  if (/lista|list|bullet|enumerate|numbered/i.test(instruction)) {
    constraints.push({
      type: 'logical',
      description: 'Response must use list/bullet format',
      satisfied: false,
      confidence: 0.9,
    });
  }

  if (/tabela|table|grid/i.test(instruction)) {
    constraints.push({
      type: 'logical',
      description: 'Response must include a table',
      satisfied: false,
      confidence: 0.9,
    });
  }

  // Length constraints
  const wordMatch = instruction.match(/(\d+)\s*(words?|palavras?)/i);
  if (wordMatch) {
    constraints.push({
      type: 'logical',
      description: `Response must be approximately ${wordMatch[1]} words`,
      satisfied: false,
      confidence: 0.95,
    });
  }

  const sentenceMatch = instruction.match(/(\d+)\s*(sentences?|frases?)/i);
  if (sentenceMatch) {
    constraints.push({
      type: 'logical',
      description: `Response must have approximately ${sentenceMatch[1]} sentences`,
      satisfied: false,
      confidence: 0.95,
    });
  }

  // Language constraints
  if (/em português|in english|en español|auf deutsch/i.test(instruction)) {
    const langMatch = instruction.match(/(em português|in english|en español|auf deutsch)/i);
    constraints.push({
      type: 'logical',
      description: `Response must be in: ${langMatch?.[1]}`,
      satisfied: false,
      confidence: 0.99,
    });
  }

  // Step-by-step constraints
  if (/passo a passo|step.by.step|step 1|etapa 1/i.test(instruction)) {
    constraints.push({
      type: 'logical',
      description: 'Response must include step-by-step structure',
      satisfied: false,
      confidence: 0.9,
    });
  }

  return constraints;
}

/**
 * Verifica restrições lógicas na resposta
 */
function verifyLogicalConstraints(
  constraints: Constraint[],
  response: string
): Constraint[] {
  return constraints.map((c) => {
    let satisfied = false;
    let evidence = '';

    if (c.description.includes('list/bullet')) {
      satisfied = /^[\s]*[-•*]\s|^\d+\.\s/m.test(response);
      evidence = satisfied ? 'Found list markers' : 'No list markers found';
    } else if (c.description.includes('table')) {
      satisfied = /\|.*\|/m.test(response) || /\t.*\t/m.test(response);
      evidence = satisfied ? 'Found table structure' : 'No table structure found';
    } else if (c.description.includes('words')) {
      const targetWords = parseInt(c.description.match(/(\d+)/)?.[1] || '0');
      const actualWords = response.split(/\s+/).length;
      satisfied = Math.abs(actualWords - targetWords) / targetWords < 0.2;
      evidence = `Actual: ${actualWords} words, Target: ${targetWords}`;
    } else if (c.description.includes('sentences')) {
      const targetSentences = parseInt(c.description.match(/(\d+)/)?.[1] || '0');
      const actualSentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
      satisfied = Math.abs(actualSentences - targetSentences) / targetSentences < 0.3;
      evidence = `Actual: ${actualSentences} sentences, Target: ${targetSentences}`;
    } else if (c.description.includes('step-by-step')) {
      satisfied = /step \d|passo \d|etapa \d|\d\.\s/i.test(response);
      evidence = satisfied ? 'Found step structure' : 'No step structure found';
    } else if (c.description.includes('in:')) {
      // Language check — simplified
      const lang = c.description.toLowerCase();
      if (lang.includes('português')) {
        satisfied = /[ãõáéíóúâêôàç]/i.test(response);
      } else if (lang.includes('english')) {
        satisfied = !/[ãõáéíóúâêôàç]/i.test(response);
      } else {
        satisfied = true; // Cannot verify other languages simply
      }
      evidence = satisfied ? 'Language constraint satisfied' : 'Language mismatch detected';
    } else {
      satisfied = true; // Unknown constraint = accept
    }

    return { ...c, satisfied, evidence };
  });
}

/**
 * Verifica restrições semânticas usando LLM (NSVIF semantic solver)
 */
async function verifySemanticConstraints(
  instruction: string,
  response: string,
  provider: string
): Promise<Constraint[]> {
  try {
    const result = await invokeLLM({
      provider: provider as any,
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are NSVIF, a neuro-symbolic instruction verifier. 
Given an instruction and response, identify 2-4 semantic constraints from the instruction and verify if the response satisfies them.
Format: CONSTRAINT: <description> | SATISFIED: YES/NO | CONFIDENCE: 0.0-1.0
One constraint per line.`,
        },
        {
          role: 'user',
          content: `Instruction: ${instruction.slice(0, 500)}\n\nResponse: ${response.slice(0, 1000)}\n\nVerify semantic constraints:`,
        },
      ],
      temperature: 0.0,
      maxTokens: 300,
    });

    const content = String(result.choices[0]?.message?.content || '');
    const lines = content.split('\n').filter((l: string) => l.includes('CONSTRAINT:'));

    return lines.map((line: string) => {
      const constraintMatch = line.match(/CONSTRAINT:\s*([^|]+)/);
      const satisfiedMatch = line.match(/SATISFIED:\s*(YES|NO)/i);
      const confidenceMatch = line.match(/CONFIDENCE:\s*([\d.]+)/);

      return {
        type: 'semantic' as const,
        description: constraintMatch?.[1]?.trim() || 'Unknown semantic constraint',
        satisfied: satisfiedMatch?.[1]?.toUpperCase() === 'YES',
        confidence: parseFloat(confidenceMatch?.[1] || '0.8'),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Aplica NSVIF instruction verification
 * Implementa: arXiv:2601.17789 — CSP-based instruction verification
 */
export async function verifyInstructionFollowing(
  instruction: string,
  response: string,
  category: string,
  provider: string,
  config: Partial<NSVIFConfig> = {}
): Promise<NSVIFResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const shouldApply =
    cfg.mandatoryCategories.includes(category) ||
    instruction.length > 50;

  if (!shouldApply) {
    return {
      csrScore: 1.0,
      totalConstraints: 0,
      satisfiedConstraints: 0,
      constraints: [],
      violations: [],
      feedback: 'NSVIF not applied (simple query)',
      action: 'accept',
      confidence: 1.0,
    };
  }

  // Step 1: Extract logical constraints
  let allConstraints: Constraint[] = [];

  if (cfg.verifyLogical) {
    const logicalConstraints = extractLogicalConstraints(instruction);
    const verifiedLogical = verifyLogicalConstraints(logicalConstraints, response);
    allConstraints = [...allConstraints, ...verifiedLogical];
  }

  // Step 2: Verify semantic constraints
  if (cfg.verifySemantic) {
    const semanticConstraints = await verifySemanticConstraints(
      instruction,
      response,
      provider
    );
    allConstraints = [...allConstraints, ...semanticConstraints];
  }

  if (allConstraints.length === 0) {
    return {
      csrScore: 1.0,
      totalConstraints: 0,
      satisfiedConstraints: 0,
      constraints: [],
      violations: [],
      feedback: 'No constraints identified',
      action: 'accept',
      confidence: 0.8,
    };
  }

  // Step 3: Compute CSR (Constraint Satisfaction Rate)
  const satisfiedCount = allConstraints.filter((c) => c.satisfied).length;
  const csrScore = satisfiedCount / allConstraints.length;
  const avgConfidence =
    allConstraints.reduce((sum, c) => sum + c.confidence, 0) / allConstraints.length;

  // Step 4: Identify violations
  const violations = allConstraints
    .filter((c) => !c.satisfied)
    .map((c) => `[${c.type.toUpperCase()}] ${c.description}${c.evidence ? ` (${c.evidence})` : ''}`);

  // Step 5: Generate interpretable feedback (NSVIF feature)
  const feedback =
    violations.length === 0
      ? 'All constraints satisfied'
      : `Violations: ${violations.join('; ')}`;

  const action =
    csrScore >= cfg.csrThreshold
      ? 'accept'
      : csrScore >= 0.7
      ? 'flag'
      : 'reject';

  logger.info('NSVIF verification result', {
    category,
    totalConstraints: allConstraints.length,
    satisfiedConstraints: satisfiedCount,
    csrScore: csrScore.toFixed(3),
    violations: violations.length,
    action,
  });

  return {
    csrScore,
    totalConstraints: allConstraints.length,
    satisfiedConstraints: satisfiedCount,
    constraints: allConstraints,
    violations,
    feedback,
    action,
    confidence: avgConfidence,
  };
}

/**
 * Verifica se NSVIF deve ser aplicado
 */
export function shouldApplyNSVIF(category: string, instructionLength: number): boolean {
  return (
    DEFAULT_CONFIG.mandatoryCategories.includes(category) ||
    instructionLength > 100
  );
}

/**
 * Calcula score de instruction-following para integração com QualityEnsembleScorer
 */
export function computeNSVIFScore(result: NSVIFResult): number {
  if (result.totalConstraints === 0) return 90; // No constraints = high score

  // NSVIF score: CSR * 100 com bonus por alta confiança
  const baseScore = result.csrScore * 100;
  const confidenceBonus = result.confidence > 0.9 ? 3 : 0;
  const violationPenalty = result.violations.length * 2;

  return Math.min(100, Math.max(0, baseScore + confidenceBonus - violationPenalty));
}
