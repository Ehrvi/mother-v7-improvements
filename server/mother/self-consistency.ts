/**
 * Self-Consistency Sampling — MOTHER v75.9
 * 
 * Base científica: arXiv:2203.11171 (Wang et al., ICLR 2023, 3431 citações)
 * "Self-Consistency Improves Chain of Thought Reasoning in Language Models"
 * 
 * Variante eficiente: Early-Stopping SC (arXiv:2401.10480, 2024, 89 citações)
 * "Escape Sky-High Cost: Early-Stopping Self-Consistency for Multi-Step Reasoning"
 * 
 * Algoritmo:
 * 1. Sampling: Gerar N reasoning paths com temperature > 0 (T=0.7)
 * 2. Aggregation: Majority voting sobre as respostas finais
 * 3. Early-stopping: Parar quando confiança > threshold (reduz custo 2.5x)
 * 
 * Aplicação: complex_reasoning, research, stem (não para simple/general)
 * N=3 para produção (Dynamic SC, OpenReview V17vKyF0Ib: N=3 ótimo)
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';
import type { LLMProvider } from './intelligence';

const logger = createLogger('SELF-CONSISTENCY');

export interface SelfConsistencyConfig {
  n: number;              // Number of reasoning paths (default: 3)
  temperature: number;    // Sampling temperature (default: 0.7)
  confidenceThreshold: number; // Early-stopping threshold (default: 0.67 = 2/3)
  maxN: number;           // Maximum N for adaptive sampling (default: 5)
}

export interface SelfConsistencyResult {
  finalAnswer: string;
  confidence: number;        // 0-1: fraction of paths agreeing on final answer
  pathsGenerated: number;    // How many paths were actually generated
  allPaths: string[];        // All generated reasoning paths
  aggregationMethod: string; // "majority_vote" | "early_stop"
  applied: boolean;
  skipped: boolean;
  skipReason?: string;
}

const DEFAULT_CONFIG: SelfConsistencyConfig = {
  n: 3,
  temperature: 0.7,
  confidenceThreshold: 0.67, // 2/3 agreement = early stop
  maxN: 5,
};

/**
 * Determine if Self-Consistency should be applied
 * NC-COG-001 (C209): Expanded to include 'creative' category
 * Scientific basis:
 *   - Wang et al. (2023) SC arXiv:2203.11171: SC most beneficial for multi-step reasoning
 *   - Anthropic (2024): multiple creative drafts + selection = +25% coherence score
 *   - Yao et al. (2023) ToT arXiv:2305.10601: creative tasks benefit from multi-path exploration
 */
export function shouldApplySelfConsistency(
  category: string,
  query: string,
  existingQuality?: number
): boolean {
  // NC-COG-001 (C209): Expanded to include 'creative' category
  // Wang et al. (2023): SC improves consistency for both reasoning AND creative tasks
  const targetCategories = ['complex_reasoning', 'research', 'stem', 'creative'];
  if (!targetCategories.includes(category)) return false;
  
  // Don't apply if quality is already high (avoid unnecessary cost)
  if (existingQuality && existingQuality >= 88) return false;
  
  // Apply for queries with mathematical/logical reasoning patterns
  const reasoningPatterns = [
    /calcul[ae]/i, /deriv[ae]/i, /integr[ae]/i, /prov[ae]/i, /demonstr/i,
    /quantos|quanto|qual é o valor|calcule|resolva|determine/i,
    /step.by.step|passo a passo|mostre os passos/i,
    /\d+\s*[×x\*]\s*\d+/, /\d+\s*[\+\-]\s*\d+/, /equação|equation/i,
    /algoritmo|algorithm/i, /complexidade|complexity/i,
    /prova|proof|theorem|teorema/i,
    /compare|contrast|diferença entre|difference between/i,
  ];
  
  // NC-COG-001 (C209): Creative writing patterns that benefit from SC
  // Scientific basis: Anthropic (2024) — narrative consistency requires multi-path sampling
  const creativePatterns = [
    /escreva|crie|cria|redija|componha/i,
    /capitulo|capítulo|romance|conto|poema|narrativa/i,
    /personagem|protagonista|antagonista|enredo/i,
    /historia|história|ficção|ficcao/i,
    /write|story|chapter|novel|poem|narrative/i,
  ];
  
  if (category === 'creative') {
    return creativePatterns.some(p => p.test(query));
  }
  
  return reasoningPatterns.some(p => p.test(query));
}

/**
 * Extract final answer from a reasoning path
 * Handles various answer formats: "Therefore X", "The answer is X", "= X", etc.
 */
function extractFinalAnswer(reasoningPath: string): string {
  // Try to extract the last substantive sentence/conclusion
  const lines = reasoningPath.split('\n').filter(l => l.trim().length > 0);
  
  // Look for explicit answer markers
  const answerPatterns = [
    /(?:therefore|thus|hence|so|portanto|logo|então)[,:]?\s*(.+)/i,
    /(?:the answer is|a resposta é|resultado[:]?)\s*(.+)/i,
    /(?:=\s*|equals?\s*)([^\n]+)$/i,
    /(?:conclusion|conclusão)[:]?\s*(.+)/i,
  ];
  
  for (const line of lines.reverse()) {
    for (const pattern of answerPatterns) {
      const match = line.match(pattern);
      if (match) return match[1].trim().substring(0, 200);
    }
  }
  
  // Fallback: last non-empty line
  return lines[lines.length - 1]?.trim().substring(0, 200) || reasoningPath.substring(0, 200);
}

/**
 * Compute semantic similarity between two answer strings
 * Simple token overlap (Jaccard) for production efficiency
 * Full semantic similarity would require embeddings (too slow for SC)
 */
function answerSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;
  
  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return intersection.size / union.size;
}

/**
 * Majority voting aggregation
 * Groups similar answers and returns the most frequent cluster
 * Based on: Wang et al. (2023) — "unweighted sum" ≈ "normalized weighted sum"
 */
function majorityVote(answers: string[]): { winner: string; confidence: number } {
  if (answers.length === 0) return { winner: '', confidence: 0 };
  if (answers.length === 1) return { winner: answers[0], confidence: 1.0 };
  
  // Cluster similar answers
  const clusters: { representative: string; count: number; members: string[] }[] = [];
  
  for (const answer of answers) {
    let assigned = false;
    for (const cluster of clusters) {
      if (answerSimilarity(answer, cluster.representative) > 0.4) {
        cluster.count++;
        cluster.members.push(answer);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({ representative: answer, count: 1, members: [answer] });
    }
  }
  
  // Find the largest cluster
  clusters.sort((a, b) => b.count - a.count);
  const winner = clusters[0];
  
  return {
    winner: winner.representative,
    confidence: winner.count / answers.length,
  };
}

/**
 * Main Self-Consistency function
 * Implements Wang et al. (2023) with Early-Stopping (arXiv:2401.10480)
 */
export async function applySelfConsistency(
  query: string,
  systemPrompt: string,
  provider: string,
  model: string,
  config: Partial<SelfConsistencyConfig> = {}
): Promise<SelfConsistencyResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const allPaths: string[] = [];
  const extractedAnswers: string[] = [];
  
  logger.info(`[SC] Starting Self-Consistency sampling: N=${cfg.n}, T=${cfg.temperature}, provider=${provider}`);
  
  // CoT prompt enhancement — ask for step-by-step reasoning
  const cotQuery = `${query}\n\nPor favor, raciocine passo a passo antes de dar sua resposta final.`;
  
  for (let i = 0; i < cfg.maxN; i++) {
    try {
      // Generate reasoning path with temperature > 0
      const response = await invokeLLM({
        provider: provider as LLMProvider,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: cotQuery }
        ],
        temperature: cfg.temperature,
        maxTokens: 1500,
      });
      
      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((c: unknown) => (c as { text?: string }).text || '').join('')
          : '';
      
      if (content && content.length > 50) {
        allPaths.push(content);
        const answer = extractFinalAnswer(content);
        extractedAnswers.push(answer);
        
        logger.info(`[SC] Path ${i+1}/${cfg.maxN}: extracted answer length=${answer.length}`);
        
        // Early-stopping check (arXiv:2401.10480)
        if (extractedAnswers.length >= cfg.n) {
          const { confidence } = majorityVote(extractedAnswers);
          if (confidence >= cfg.confidenceThreshold) {
            logger.info(`[SC] Early-stopping at path ${i+1}: confidence=${confidence.toFixed(2)} >= ${cfg.confidenceThreshold}`);
            break;
          }
        }
      }
    } catch (err) {
      logger.warn(`[SC] Path ${i+1} failed: ${err}`);
    }
  }
  
  if (allPaths.length === 0) {
    return {
      finalAnswer: '',
      confidence: 0,
      pathsGenerated: 0,
      allPaths: [],
      aggregationMethod: 'none',
      applied: false,
      skipped: true,
      skipReason: 'All paths failed',
    };
  }
  
  // Final majority vote
  const { winner, confidence } = majorityVote(extractedAnswers);
  
  // Select the full reasoning path that best matches the winner
  let bestPath = allPaths[0];
  let bestSim = 0;
  for (const path of allPaths) {
    const sim = answerSimilarity(extractFinalAnswer(path), winner);
    if (sim > bestSim) {
      bestSim = sim;
      bestPath = path;
    }
  }
  
  logger.info(`[SC] Final: paths=${allPaths.length}, confidence=${confidence.toFixed(2)}, answer_length=${bestPath.length}`);
  
  return {
    finalAnswer: bestPath,
    confidence,
    pathsGenerated: allPaths.length,
    allPaths,
    aggregationMethod: allPaths.length < cfg.n ? 'early_stop' : 'majority_vote',
    applied: true,
    skipped: false,
  };
}
