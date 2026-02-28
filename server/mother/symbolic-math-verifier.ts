/**
 * Symbolic Math Verifier — MOTHER v75.12 (Ciclo 62)
 *
 * Base científica:
 * - Process Reward Model (arXiv:2305.20050, ICLR 2024): Lightman et al.
 *   "Let's Verify Step by Step" — 78% accuracy no MATH dataset
 * - SymPy: Meurer et al. (2017), PeerJ Computer Science
 *   "SymPy: symbolic mathematics in Python"
 *   Verificação simbólica de equações físicas e matemáticas
 * - WizardMath (arXiv:2308.09583, 2023): Luo et al.
 *   "WizardMath: Empowering Mathematical Reasoning for LLMs"
 *   Reinforcement Learning from Evol-Instruct Feedback para math
 * - Minerva (arXiv:2206.14858, 2022): Lewkowycz et al.
 *   "Solving Quantitative Reasoning Problems with Language Models"
 *   Verificação de equações físicas com Python sympy
 *
 * Motivação (NC-REASONING-002):
 * - ProcessRewardVerifier (v75.10) usa heurísticas para verificar passos matemáticos
 * - Insuficiente para física avançada (cálculo, mecânica quântica, termodinâmica)
 * - Benchmark Ciclo 60: Q5 reasoning gap = -2.1 (física — cálculo numérico)
 * - Meta Ciclo 62: complex_reasoning ≥ 100.8 (Manus 84.0 × 1.20)
 *
 * Algoritmo:
 * 1. Extrair expressões matemáticas da resposta (LaTeX, Unicode, inline)
 * 2. Para cada expressão:
 *    a. Tentar verificação simbólica via LLM-assisted SymPy
 *    b. Verificar consistência dimensional (unidades físicas)
 *    c. Verificar ordem de magnitude (sanity check numérico)
 * 3. Score = proporção de expressões verificadas corretamente
 * 4. Ação: accept | correct_step | regenerate_from_step | full_regenerate
 */

import { invokeLLM } from '../_core/llm.js';
import { createLogger } from '../_core/logger.js';

const logger = createLogger('symbolic-math-verifier');

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface MathExpression {
  /** Expressão matemática extraída */
  expression: string;
  /** Tipo: equation | inequality | formula | numerical */
  type: 'equation' | 'inequality' | 'formula' | 'numerical';
  /** Contexto ao redor da expressão */
  context: string;
  /** Linha/passo onde aparece */
  stepIndex: number;
}

export interface MathVerificationResult {
  expression: MathExpression;
  /** Score de verificação (0-100) */
  verificationScore: number;
  /** Resultado: correct | incorrect | uncertain | unverifiable */
  verdict: 'correct' | 'incorrect' | 'uncertain' | 'unverifiable';
  /** Explicação do veredicto */
  explanation: string;
  /** Correção sugerida (se incorrect) */
  suggestedCorrection?: string;
}

export interface SymbolicMathResult {
  /** Score global de verificação matemática (0-100) */
  mathVerificationScore: number;
  /** Expressões verificadas */
  verifiedExpressions: MathVerificationResult[];
  /** Expressões com erros */
  incorrectExpressions: MathVerificationResult[];
  /** Primeiro passo incorreto (para PRM step-level) */
  firstIncorrectStep: number | null;
  /** Ação recomendada */
  action: 'accept' | 'correct_step' | 'regenerate_from_step' | 'full_regenerate';
  /** Confiança na verificação (0-1) */
  confidence: number;
}

export interface SymbolicMathConfig {
  /** Threshold para aceitar sem correção */
  acceptThreshold: number;
  /** Threshold para corrigir passo específico */
  correctStepThreshold: number;
  /** Threshold para regenerar a partir do passo incorreto */
  regenerateFromStepThreshold: number;
  /** Máximo de expressões a verificar */
  maxExpressions: number;
  /** Categorias que ativam verificação simbólica */
  mathCategories: string[];
  /** Timeout para verificação LLM-assisted (ms) */
  verificationTimeout: number;
}

// ─── Configuração padrão ─────────────────────────────────────────────────────

const DEFAULT_CONFIG: SymbolicMathConfig = {
  acceptThreshold: 80,
  correctStepThreshold: 60,
  regenerateFromStepThreshold: 40,
  maxExpressions: 8,
  mathCategories: ['complex_reasoning', 'stem', 'coding'],
  verificationTimeout: 10000, // 10s
};

// ─── Extração de Expressões Matemáticas ──────────────────────────────────────

/**
 * Extrai expressões matemáticas de texto.
 * Suporta: LaTeX inline ($...$), LaTeX block ($$...$$), Unicode math, expressões numéricas.
 */
function extractMathExpressions(text: string): MathExpression[] {
  const expressions: MathExpression[] = [];
  const lines = text.split('\n');
  
  // Padrões de extração
  const patterns = [
    // LaTeX inline: $...$
    { regex: /\$([^$]+)\$/g, type: 'formula' as const },
    // LaTeX block: $$...$$
    { regex: /\$\$([^$]+)\$\$/g, type: 'equation' as const },
    // Equações com = : "x = 5", "F = ma", "E = mc²"
    { regex: /\b([A-Za-z_]\w*\s*=\s*[^,\n;]{3,50})/g, type: 'equation' as const },
    // Expressões numéricas com unidades: "9.8 m/s²", "3×10⁸ m/s"
    { regex: /\b(\d+\.?\d*\s*[×x]\s*10[⁰¹²³⁴⁵⁶⁷⁸⁹\-\d]+\s*\w+\/?\w*)/g, type: 'numerical' as const },
    // Inequações: "x > 0", "n ≥ 1"
    { regex: /\b([A-Za-z_]\w*\s*[><=≤≥≠]\s*[^,\n;]{2,30})/g, type: 'inequality' as const },
  ];
  
  let stepIndex = 0;
  for (const line of lines) {
    if (line.match(/^\s*\d+[\.\)]/)) stepIndex++;
    
    for (const { regex, type } of patterns) {
      const matches = [...line.matchAll(new RegExp(regex.source, 'g'))];
      for (const match of matches) {
        const expr = match[1]?.trim();
        if (expr && expr.length > 3 && expr.length < 200) {
          // Evitar duplicatas
          if (!expressions.some(e => e.expression === expr)) {
            expressions.push({
              expression: expr,
              type,
              context: line.slice(0, 100),
              stepIndex,
            });
          }
        }
      }
    }
  }
  
  return expressions.slice(0, DEFAULT_CONFIG.maxExpressions);
}

// ─── Verificação Simbólica via LLM ───────────────────────────────────────────

/**
 * Verifica uma expressão matemática usando LLM como verificador simbólico.
 *
 * Abordagem: usar GPT-4o como "SymPy interpreter" para verificar:
 * 1. Consistência algébrica
 * 2. Consistência dimensional (unidades)
 * 3. Ordem de magnitude (sanity check)
 *
 * Base: Minerva (arXiv:2206.14858) — LLMs como verificadores matemáticos
 */
async function verifyExpressionWithLLM(
  expression: MathExpression,
  fullContext: string,
  config: SymbolicMathConfig
): Promise<MathVerificationResult> {
  const verificationPrompt = `You are a mathematical verification system. Verify the following mathematical expression or equation for correctness.

Expression: ${expression.expression}
Type: ${expression.type}
Context: ${expression.context}

Full response context (first 500 chars):
${fullContext.slice(0, 500)}

Verify:
1. Is this expression mathematically/physically correct?
2. Are the units consistent (if applicable)?
3. Is the numerical value in the right order of magnitude (if applicable)?

Respond in JSON format:
{
  "verdict": "correct" | "incorrect" | "uncertain" | "unverifiable",
  "score": 0-100,
  "explanation": "brief explanation",
  "correction": "corrected expression if incorrect, null otherwise"
}`;

  try {
    const result = await invokeLLM({
      provider: 'openai',
      model: 'gpt-4o-mini', // Usar mini para custo menor
      messages: [
        { role: 'system', content: 'You are a mathematical verification assistant. Always respond with valid JSON.' },
        { role: 'user', content: verificationPrompt },
      ],
      temperature: 0.1,
      maxTokens: 300,
    });
    
    const content = ((result.choices[0]?.message?.content as string) ?? '');
    
    // Extrair JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        expression,
        verificationScore: 70,
        verdict: 'uncertain',
        explanation: 'Could not parse verification response',
      };
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as {
      verdict: string;
      score: number;
      explanation: string;
      correction?: string;
    };
    
    return {
      expression,
      verificationScore: Math.min(100, Math.max(0, parsed.score ?? 70)),
      verdict: (parsed.verdict as MathVerificationResult['verdict']) ?? 'uncertain',
      explanation: parsed.explanation ?? '',
      suggestedCorrection: parsed.correction ?? undefined,
    };
  } catch (error) {
    logger.warn('Math verification failed', { expression: expression.expression, error: String(error) });
    return {
      expression,
      verificationScore: 65,
      verdict: 'uncertain',
      explanation: 'Verification timeout or error',
    };
  }
}

// ─── Verificador Heurístico (Fallback) ───────────────────────────────────────

/**
 * Verificação heurística rápida quando LLM não está disponível.
 * Detecta erros comuns em física e matemática.
 */
function heuristicMathCheck(expression: MathExpression): MathVerificationResult {
  const expr = expression.expression;
  let score = 75;
  let verdict: MathVerificationResult['verdict'] = 'uncertain';
  let explanation = 'Heuristic check';
  
  // Verificar divisão por zero
  if (/\/\s*0\b/.test(expr)) {
    score = 0;
    verdict = 'incorrect';
    explanation = 'Division by zero detected';
  }
  // Verificar raiz de número negativo (sem complexos)
  else if (/sqrt\s*\(\s*-/.test(expr) || /√\s*-/.test(expr)) {
    score = 30;
    verdict = 'uncertain';
    explanation = 'Square root of negative number — may need complex numbers';
  }
  // Verificar velocidade acima da luz (física clássica)
  else if (/(\d+\.?\d*)\s*[×x]\s*10[⁸⁹]/.test(expr)) {
    const match = expr.match(/(\d+\.?\d*)\s*[×x]\s*10([⁸⁹\d]+)/);
    if (match) {
      const mantissa = parseFloat(match[1]);
      const exp = match[2] === '⁸' ? 8 : match[2] === '⁹' ? 9 : parseInt(match[2]);
      const value = mantissa * Math.pow(10, exp);
      if (value > 3e8 * 1.01) { // Acima da velocidade da luz
        score = 40;
        verdict = 'uncertain';
        explanation = 'Value exceeds speed of light — verify units';
      }
    }
  }
  // Verificar consistência básica de equação
  else if (expression.type === 'equation' && expr.includes('=')) {
    const parts = expr.split('=');
    if (parts.length === 2) {
      const lhs = parts[0].trim();
      const rhs = parts[1].trim();
      // Verificar se ambos os lados têm conteúdo
      if (lhs.length > 0 && rhs.length > 0) {
        score = 80;
        verdict = 'uncertain';
        explanation = 'Equation structure valid — content not verified';
      }
    }
  }
  else {
    score = 75;
    verdict = 'uncertain';
    explanation = 'Expression structure appears valid';
  }
  
  return {
    expression,
    verificationScore: score,
    verdict,
    explanation,
  };
}

// ─── Verificador Principal ────────────────────────────────────────────────────

/**
 * Verifica expressões matemáticas em uma resposta.
 *
 * Combina:
 * 1. LLM-assisted symbolic verification (GPT-4o-mini como SymPy interpreter)
 * 2. Heuristic checks (fallback rápido)
 * 3. PRM step-level integration (identificar primeiro passo incorreto)
 */
export async function verifyMathematicalContent(
  response: string,
  query: string,
  category: string,
  config: SymbolicMathConfig = DEFAULT_CONFIG
): Promise<SymbolicMathResult> {
  // Verificar se categoria é relevante
  if (!config.mathCategories.includes(category)) {
    return {
      mathVerificationScore: 85,
      verifiedExpressions: [],
      incorrectExpressions: [],
      firstIncorrectStep: null,
      action: 'accept',
      confidence: 0.5,
    };
  }
  
  // Extrair expressões matemáticas
  const expressions = extractMathExpressions(response);
  
  if (expressions.length === 0) {
    // Sem expressões matemáticas — score neutro
    return {
      mathVerificationScore: 80,
      verifiedExpressions: [],
      incorrectExpressions: [],
      firstIncorrectStep: null,
      action: 'accept',
      confidence: 0.6,
    };
  }
  
  logger.info('Symbolic math verification started', {
    expressionCount: expressions.length,
    category,
    query: query.slice(0, 80),
  });
  
  // Verificar cada expressão (paralelo com limite de concorrência)
  const verificationPromises = expressions.map(async (expr) => {
    // Tentar verificação LLM primeiro
    try {
      return await Promise.race([
        verifyExpressionWithLLM(expr, response, config),
        new Promise<MathVerificationResult>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), config.verificationTimeout)
        ),
      ]);
    } catch {
      // Fallback para heurística
      return heuristicMathCheck(expr);
    }
  });
  
  const results = await Promise.all(verificationPromises);
  
  // Calcular score global
  const totalScore = results.reduce((sum, r) => sum + r.verificationScore, 0);
  const avgScore = results.length > 0 ? totalScore / results.length : 80;
  
  // Identificar expressões incorretas
  const incorrectExpressions = results.filter(r => r.verdict === 'incorrect');
  
  // Identificar primeiro passo incorreto (PRM step-level)
  let firstIncorrectStep: number | null = null;
  for (const result of results) {
    if (result.verdict === 'incorrect' && result.expression.stepIndex > 0) {
      if (firstIncorrectStep === null || result.expression.stepIndex < firstIncorrectStep) {
        firstIncorrectStep = result.expression.stepIndex;
      }
    }
  }
  
  // Calcular confiança baseada na proporção de verificações bem-sucedidas
  const llmVerified = results.filter(r => r.verdict !== 'uncertain' && r.verdict !== 'unverifiable').length;
  const confidence = results.length > 0 ? llmVerified / results.length : 0.5;
  
  // Determinar ação
  let action: SymbolicMathResult['action'];
  if (avgScore >= config.acceptThreshold) {
    action = 'accept';
  } else if (avgScore >= config.correctStepThreshold && firstIncorrectStep !== null) {
    action = 'correct_step';
  } else if (avgScore >= config.regenerateFromStepThreshold && firstIncorrectStep !== null) {
    action = 'regenerate_from_step';
  } else {
    action = 'full_regenerate';
  }
  
  logger.info('Symbolic math verification completed', {
    avgScore: avgScore.toFixed(2),
    expressionCount: expressions.length,
    incorrectCount: incorrectExpressions.length,
    firstIncorrectStep,
    action,
    confidence: confidence.toFixed(2),
  });
  
  return {
    mathVerificationScore: Math.round(avgScore * 10) / 10,
    verifiedExpressions: results,
    incorrectExpressions,
    firstIncorrectStep,
    action,
    confidence,
  };
}

/**
 * Integração com pipeline MOTHER.
 * Chamado após geração da resposta para queries math/physics.
 */
export async function applySymbolicMathVerification(
  primaryResponse: string,
  query: string,
  category: string
): Promise<{
  response: string;
  mathScore: number;
  mathVerificationApplied: boolean;
  action: string;
  firstIncorrectStep: number | null;
}> {
  const result = await verifyMathematicalContent(
    primaryResponse,
    query,
    category,
    DEFAULT_CONFIG
  );
  
  if (result.action === 'accept') {
    return {
      response: primaryResponse,
      mathScore: result.mathVerificationScore,
      mathVerificationApplied: false,
      action: 'accepted',
      firstIncorrectStep: null,
    };
  }
  
  if (result.action === 'correct_step' && result.incorrectExpressions.length > 0) {
    // Adicionar nota de correção
    const corrections = result.incorrectExpressions
      .filter(e => e.suggestedCorrection)
      .map(e => `- "${e.expression.expression}" → "${e.suggestedCorrection}"`)
      .join('\n');
    
    if (corrections) {
      const correctionNote = `\n\n> **Verificação simbólica (v75.12):** Possíveis correções identificadas:\n${corrections}`;
      return {
        response: primaryResponse + correctionNote,
        mathScore: result.mathVerificationScore,
        mathVerificationApplied: true,
        action: 'corrected',
        firstIncorrectStep: result.firstIncorrectStep,
      };
    }
  }
  
  return {
    response: primaryResponse,
    mathScore: result.mathVerificationScore,
    mathVerificationApplied: (result.action as string) !== 'accept',
    action: result.action,
    firstIncorrectStep: result.firstIncorrectStep,
  };
}
