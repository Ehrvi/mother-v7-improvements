// server/mother/rlvr-dpo-connector.ts
// C312: RLVR→DPO Automatic Loop
// Base: DeepSeek-R1 (arXiv:2501.12948); Rafailov et al. DPO (arXiv:2305.18290)
// Reflexion (Shinn et al., arXiv:2303.11366)

import { createLogger } from '../_core/logger';
const log = createLogger('RLVRDPOConnector');

interface RLVRResult {
  totalReward: number;
  factualAccuracy: number;
  scientificGrounding: number;
  completeness: number;
  claims: string[];
}

interface DPOPairCandidate {
  prompt: string;
  chosenResponse: string;
  rejectedResponse: string;
  chosenScore: number;
  rejectedScore: number;
  chosenRLVR: RLVRResult;
  rejectedRLVR: RLVRResult;
  domain: string;
}

/**
 * C312: Process a response pair through RLVR and store in DPO dataset if eligible
 * Called from core.ts after GRPO generates multiple candidates
 * 
 * @param prompt - The original user query
 * @param candidates - Array of response candidates with quality scores
 * @param domain - Domain of the query (shms, autonomy, general, etc.)
 */
export async function processRLVRAndStoreDPO(
  prompt: string,
  candidates: Array<{ text: string; qualityScore: number }>,
  domain: string = 'general'
): Promise<{ stored: boolean; reason: string; pairCount?: number }> {
  
  if (candidates.length < 2) {
    return { stored: false, reason: 'Need at least 2 candidates for DPO pair' };
  }
  
  try {
    // Sort by quality score
    const sorted = [...candidates].sort((a, b) => b.qualityScore - a.qualityScore);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    
    // Minimum quality gap required for meaningful DPO pair
    const qualityGap = best.qualityScore - worst.qualityScore;
    if (qualityGap < 15) {
      return { stored: false, reason: `Quality gap too small: ${qualityGap.toFixed(1)} (need ≥15)` };
    }
    
    // Compute RLVR rewards for both
    const bestRLVR = await computeSimpleRLVR(best.text, prompt);
    const worstRLVR = await computeSimpleRLVR(worst.text, prompt);
    
    // Composite score = 0.6 * qualityScore/100 + 0.4 * rlvrReward
    const bestComposite = 0.6 * (best.qualityScore / 100) + 0.4 * bestRLVR.totalReward;
    const worstComposite = 0.6 * (worst.qualityScore / 100) + 0.4 * worstRLVR.totalReward;
    
    // Only store if chosen is high quality AND rejected is clearly worse
    const chosenEligible = bestComposite >= 0.80 && bestRLVR.factualAccuracy >= 0.6;
    const rejectedEligible = worstComposite < 0.65;
    
    if (!chosenEligible || !rejectedEligible) {
      return { 
        stored: false, 
        reason: `Eligibility check failed: chosen=${bestComposite.toFixed(2)} (need ≥0.80), rejected=${worstComposite.toFixed(2)} (need <0.65)` 
      };
    }
    
    // Store the DPO pair
    const { storeDPOPair } = await import('./dpo-builder');
    await storeDPOPair({
      prompt,
      chosen: best.text,
      rejected: worst.text,
      chosenScore: bestComposite,
      rejectedScore: worstComposite,
      domain,
      source: 'rlvr-auto',
      metadata: {
        chosenRLVR: bestRLVR,
        rejectedRLVR: worstRLVR,
        qualityGap,
        candidateCount: candidates.length
      }
    });
    
    log.info('DPO pair stored via RLVR connector', {
      domain,
      chosenScore: bestComposite.toFixed(2),
      rejectedScore: worstComposite.toFixed(2),
      qualityGap: qualityGap.toFixed(1)
    });
    
    return { stored: true, reason: `Pair stored (chosen=${bestComposite.toFixed(2)}, rejected=${worstComposite.toFixed(2)})`, pairCount: 1 };
    
  } catch (error) {
    log.error('RLVR→DPO processing failed', { error });
    return { stored: false, reason: `Error: ${error}` };
  }
}

/**
 * Compute RLVR reward for a response
 * Simplified version that checks for scientific grounding and completeness
 */
async function computeSimpleRLVR(response: string, prompt: string): Promise<RLVRResult> {
  // Check for scientific indicators
  const hasReferences = /(arXiv|doi|et al\.|IEEE|ACM|NeurIPS|ICML|ICLR|Nature|Science)/i.test(response);
  const hasNumbers = /\d+\.?\d*\s*(%|ms|s|tokens|pairs|accuracy)/i.test(response);
  const hasStructure = response.split('\n').length > 3 && response.length > 200;
  const hasCode = /```[\s\S]*```/.test(response);
  const wordCount = response.split(/\s+/).length;
  
  // Estimate factual accuracy (simplified — would use actual verification in production)
  const factualAccuracy = hasReferences ? 0.85 : (hasNumbers ? 0.70 : 0.55);
  const scientificGrounding = hasReferences ? 0.90 : 0.40;
  const completeness = Math.min(1.0, wordCount / 300); // Normalize to 300 words
  const codeBonus = hasCode ? 0.1 : 0;
  
  const totalReward = (factualAccuracy * 0.4 + scientificGrounding * 0.3 + completeness * 0.3) + codeBonus;
  
  return {
    totalReward: Math.min(1.0, totalReward),
    factualAccuracy,
    scientificGrounding,
    completeness,
    claims: [] // Would extract actual claims in production
  };
}

export { computeSimpleRLVR };
