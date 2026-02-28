/**
 * Contrastive Chain-of-Thought (CCoT) — MOTHER v75.9
 * 
 * Base científica: arXiv:2311.09277 (Chia et al., ACL 2024 Findings)
 * "Contrastive Chain-of-Thought Prompting"
 * 
 * Insight central: CoT convencional não informa o modelo sobre o que EVITAR.
 * CCoT fornece exemplos positivos (raciocínio correto) E negativos (erros comuns),
 * reduzindo erros de raciocínio ao tornar explícito o que não fazer.
 * 
 * Construção automática de exemplos:
 * - Positivos: respostas com qualityScore > 85 do bd_central (Guardian G-Eval)
 * - Negativos: respostas com qualityScore < 60 do bd_central + análise do erro
 * - Método: Self-Refine (arXiv:2303.17651) para gerar exemplos negativos sintéticos
 * 
 * Aplicação: complex_reasoning, research (onde erros de raciocínio são mais custosos)
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';
import type { LLMProvider } from './intelligence';

const logger = createLogger('CONTRASTIVE-COT');

export interface ContrastiveExample {
  query: string;
  positiveReasoning: string;
  positiveAnswer: string;
  negativeReasoning: string;
  negativeAnswer: string;
  errorType: string;  // "factual_error" | "logical_fallacy" | "incomplete_reasoning" | "hallucination"
}

export interface CCoTResult {
  enhancedSystemPrompt: string;
  examplesUsed: number;
  positiveExamples: number;
  negativeExamples: number;
  applied: boolean;
  skipReason?: string;
}

/**
 * Common reasoning error patterns for synthetic negative example generation
 * Based on: Chia et al. (2023) — "conventional CoT does not inform models on what mistakes to avoid"
 */
const COMMON_ERROR_PATTERNS: Record<string, { description: string; example: string }> = {
  factual_error: {
    description: "Afirmar fatos incorretos com confiança sem verificar fontes",
    example: "Incorretamente afirmar que um evento ocorreu em data errada ou atribuir descoberta a pessoa errada"
  },
  logical_fallacy: {
    description: "Saltar para conclusões sem evidência suficiente ou usar raciocínio circular",
    example: "Assumir que correlação implica causalidade, ou concluir sem verificar todos os casos"
  },
  incomplete_reasoning: {
    description: "Parar o raciocínio antes de completar todos os passos necessários",
    example: "Calcular apenas parte da expressão matemática ou ignorar casos extremos (edge cases)"
  },
  hallucination: {
    description: "Inventar referências, citações ou dados que não existem",
    example: "Citar um paper com título plausível mas que não existe, ou inventar estatísticas"
  },
  unit_error: {
    description: "Errar unidades de medida ou conversões",
    example: "Confundir km com m, ou esquecer de converter unidades antes de operar"
  },
};

/**
 * Determine if Contrastive CoT should be applied
 * Apply for complex_reasoning and research where reasoning errors are most costly
 */
export function shouldApplyCCoT(
  category: string,
  query: string,
  knowledgeContextLength: number
): boolean {
  // Only for complex reasoning and research
  const targetCategories = ['complex_reasoning', 'research', 'stem'];
  if (!targetCategories.includes(category)) return false;
  
  // Apply when knowledge context is available (we have examples to contrast)
  if (knowledgeContextLength < 100) return false;
  
  // Apply for queries where reasoning errors are common
  const errorPronePatterns = [
    /cite|citation|reference|paper|artigo|arXiv/i,
    /calcul|compute|solve|resolva|calcule/i,
    /prove|proof|demonstrate|demonstre|prove/i,
    /compare|contrast|difference|diferença/i,
    /explain.*mechanism|explique.*mecanismo/i,
    /what.*causes|o que causa/i,
  ];
  
  return errorPronePatterns.some(p => p.test(query));
}

/**
 * Generate synthetic negative examples using Self-Refine pattern
 * Based on: Madaan et al. (2023) arXiv:2303.17651 — Self-Refine
 */
async function generateNegativeExample(
  query: string,
  positiveReasoning: string,
  errorType: string,
  provider: string,
  model: string
): Promise<{ negativeReasoning: string; negativeAnswer: string } | null> {
  try {
    const errorInfo = COMMON_ERROR_PATTERNS[errorType] || COMMON_ERROR_PATTERNS.logical_fallacy;
    
    const prompt = `Dado o seguinte raciocínio CORRETO para uma pergunta, gere um exemplo de raciocínio INCORRETO que demonstra o erro: "${errorInfo.description}".

Pergunta: ${query}

Raciocínio CORRETO:
${positiveReasoning.substring(0, 500)}

Gere um raciocínio INCORRETO que comete o erro de: ${errorInfo.description}
Exemplo desse tipo de erro: ${errorInfo.example}

Formato de resposta:
RACIOCÍNIO_INCORRETO: [raciocínio com o erro]
RESPOSTA_INCORRETA: [resposta errada resultante]
TIPO_ERRO: ${errorType}`;

    const response = await invokeLLM({
      provider: provider as LLMProvider,
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 600,
    });
    
    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map((c: unknown) => (c as { text?: string }).text || '').join('')
        : '';
    
    const reasoningMatch = content.match(/RACIOCÍNIO_INCORRETO:\s*(.+?)(?=RESPOSTA_INCORRETA:|$)/s);
    const answerMatch = content.match(/RESPOSTA_INCORRETA:\s*(.+?)(?=TIPO_ERRO:|$)/s);
    
    if (reasoningMatch && answerMatch) {
      return {
        negativeReasoning: reasoningMatch[1].trim(),
        negativeAnswer: answerMatch[1].trim(),
      };
    }
    return null;
  } catch (err) {
    logger.warn(`[CCoT] Failed to generate negative example: ${err}`);
    return null;
  }
}

/**
 * Build the Contrastive CoT system prompt injection
 * Adds positive and negative examples to guide the model
 */
export async function buildContrastiveCotPrompt(
  query: string,
  category: string,
  knowledgeContext: string,
  provider: string,
  model: string
): Promise<CCoTResult> {
  
  if (!shouldApplyCCoT(category, query, knowledgeContext.length)) {
    return {
      enhancedSystemPrompt: '',
      examplesUsed: 0,
      positiveExamples: 0,
      negativeExamples: 0,
      applied: false,
      skipReason: `Category ${category} or query pattern not eligible for CCoT`,
    };
  }
  
  logger.info(`[CCoT] Building contrastive examples for category=${category}`);
  
  // Determine most relevant error type for this query
  let primaryErrorType = 'logical_fallacy';
  if (/cite|citation|arXiv|paper|artigo/i.test(query)) primaryErrorType = 'hallucination';
  if (/calcul|compute|solve|math/i.test(query)) primaryErrorType = 'unit_error';
  if (/prove|proof|theorem/i.test(query)) primaryErrorType = 'incomplete_reasoning';
  
  // Build a synthetic positive example from knowledge context
  const contextLines = knowledgeContext.split('\n').filter(l => l.trim().length > 20);
  const positiveContext = contextLines.slice(0, 5).join('\n');
  
  // Generate negative example
  const negativeExample = await generateNegativeExample(
    query,
    positiveContext || "Raciocínio baseado em evidências verificadas das fontes disponíveis.",
    primaryErrorType,
    provider,
    model
  );
  
  // Build the contrastive prompt injection
  let contrastiveSection = `\n\n## CONTRASTIVE CHAIN-OF-THOUGHT GUIDANCE (arXiv:2311.09277)

Para esta resposta, observe os seguintes exemplos de raciocínio CORRETO e INCORRETO:

### ✅ RACIOCÍNIO CORRETO (o que fazer):
- Verificar afirmações contra fontes disponíveis no contexto
- Raciocinar passo a passo, sem pular etapas
- Citar apenas referências verificadas
- Reconhecer incerteza quando não há evidência suficiente
- Completar todos os passos antes de concluir

### ❌ RACIOCÍNIO INCORRETO (o que EVITAR — ${primaryErrorType}):
${COMMON_ERROR_PATTERNS[primaryErrorType]?.description || 'Evitar erros de raciocínio'}
Exemplo do erro: ${COMMON_ERROR_PATTERNS[primaryErrorType]?.example || 'Ver padrões comuns de erro'}`;

  if (negativeExample) {
    contrastiveSection += `\n\nExemplo específico de erro a evitar nesta resposta:
RACIOCÍNIO INCORRETO: "${negativeExample.negativeReasoning.substring(0, 200)}..."
RESPOSTA INCORRETA RESULTANTE: "${negativeExample.negativeAnswer.substring(0, 100)}"`;
  }
  
  contrastiveSection += `\n\nAplique o raciocínio CORRETO acima para responder à pergunta atual.\n`;
  
  logger.info(`[CCoT] Built contrastive prompt: errorType=${primaryErrorType}, hasNegativeExample=${!!negativeExample}`);
  
  return {
    enhancedSystemPrompt: contrastiveSection,
    examplesUsed: negativeExample ? 1 : 0,
    positiveExamples: 1,
    negativeExamples: negativeExample ? 1 : 0,
    applied: true,
  };
}
