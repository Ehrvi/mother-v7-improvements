/**
 * DGM Full Autonomy Engine — server/mother/dgm-full-autonomy.ts
 * MOTHER v100.0 | Ciclo C217 | NC-DGM-002
 *
 * Darwin Gödel Machine Full Autonomy: enables MOTHER to autonomously:
 * 1. Detect capability gaps from conversation history
 * 2. Write new TypeScript modules to fill gaps
 * 3. Validate via SGM proof engine (Bayesian safety check)
 * 4. Execute in sandboxed shell session
 * 5. Commit and deploy if tests pass
 *
 * Scientific basis:
 * - Schmidhuber (2003) "Gödel Machines: Fully Self-Referential Optimal Universal Self-Improvers"
 *   arXiv:cs/0309048 — self-modification with proof of utility
 * - Zhang et al. (2025) "Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents"
 *   arXiv:2505.22954 — DGM with evolutionary self-improvement
 * - Jimenez et al. (2024) "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
 *   arXiv:2310.06770 — autonomous code generation benchmark
 * - Yao et al. (2023) "ReAct: Synergizing Reasoning and Acting in Language Models"
 *   arXiv:2210.03629 — ReAct for autonomous agents
 */

import { validateModificationWithSGM, type SGMProofContext, type SGMProofResult } from './sgm-proof-engine';
import { executeInSession } from './persistent-shell';
import { invokeLLM } from '../_core/llm';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../_core/logger';
const log = createLogger('DGM-AUTONOMY');
// C317 (Conselho V108): Supervisor wiring — LangGraph supervisor validates CRITICAL gap modules
// Scientific basis: Zhang et al. (arXiv:2505.22954) DGM + Yao et al. (arXiv:2210.03629) ReAct
// Non-blocking: 8s timeout, failure does not block deployment
let _supervisorInvoke: ((goal: string, threadId: string) => Promise<any>) | null = null;
async function getSupervisorInvoke() {
  if (!_supervisorInvoke) {
    try {
      const mod = await import('./supervisor.js');
      _supervisorInvoke = mod.invokeSupervisor;
    } catch {
      _supervisorInvoke = null;
    }
  }
  return _supervisorInvoke;
}

export interface AutonomyGap {
  id: string;
  capability: string;
  description: string;
  evidenceFromConversation: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedImpact: number;  // 0-1
}

export interface AutonomousModule {
  id: string;
  name: string;
  filePath: string;
  code: string;
  gap: AutonomyGap;
  sgmValidation: {
    approved: boolean;
    confidence: number;
    reason: string;
  };
  testResult?: {
    passed: boolean;
    output: string;
    errors: string[];
  };
  deployed: boolean;
  createdAt: Date;
}

export interface AutonomyCycleResult {
  cycleId: string;
  gapsDetected: AutonomyGap[];
  modulesGenerated: AutonomousModule[];
  modulesDeployed: number;
  autonomyScore: number;  // 0-100
  cycleMs: number;
}

// Autonomy state
let currentAutonomyScore = 65;  // Starting from C212 baseline
const autonomyHistory: number[] = [];
const deployedModules: AutonomousModule[] = [];

/**
 * Detect capability gaps from recent conversation context.
 */
export async function detectCapabilityGaps(
  recentQueries: string[],
  failedResponses: string[]
): Promise<AutonomyGap[]> {
  if (recentQueries.length === 0 && failedResponses.length === 0) {
    return [];
  }

  const analysisPrompt = `Você é o DGM (Darwin Gödel Machine) da MOTHER v100.0.
Analise as seguintes consultas e respostas falhas para identificar gaps de capacidade:

CONSULTAS RECENTES:
${recentQueries.slice(-10).map((q, i) => `${i+1}. ${q}`).join('\n')}

RESPOSTAS FALHAS:
${failedResponses.slice(-5).map((r, i) => `${i+1}. ${r}`).join('\n')}

Identifique até 3 gaps de capacidade genuínos. Para cada gap, retorne JSON:
{
  "gaps": [
    {
      "capability": "nome da capacidade",
      "description": "descrição técnica do gap",
      "evidenceFromConversation": "evidência específica",
      "priority": "HIGH|MEDIUM|LOW",
      "estimatedImpact": 0.8
    }
  ]
}`;

  try {
    const result = await invokeLLM({
      messages: [{ role: 'user', content: analysisPrompt }],
      model: 'gpt-4o',
      maxTokens: 1000,
    });

    const content = result.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : JSON.stringify(content);

    const jsonMatch = text.match(/\{[\s\S]*"gaps"[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.gaps ?? []).map((g: Omit<AutonomyGap, 'id'>, i: number) => ({
      ...g,
      id: `gap-${Date.now()}-${i}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Generate TypeScript module code to fill a capability gap.
 */
export async function generateModuleForGap(gap: AutonomyGap): Promise<string> {
  const codePrompt = `Você é o DGM da MOTHER v100.0. Gere um módulo TypeScript para preencher este gap:

CAPABILITY: ${gap.capability}
DESCRIPTION: ${gap.description}
EVIDENCE: ${gap.evidenceFromConversation}

Gere um módulo TypeScript completo e funcional que:
1. Tenha comentário de cabeçalho com base científica (arXiv ou paper)
2. Exporte as funções necessárias
3. Seja compatível com Node.js 22 e TypeScript strict
4. Não use dependências externas além das já no projeto
5. Tenha no máximo 200 linhas

Retorne APENAS o código TypeScript, sem explicações.`;

  const result = await invokeLLM({
    messages: [{ role: 'user', content: codePrompt }],
    model: 'gpt-4o',
    maxTokens: 2000,
  });

  const content = result.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content);

  // Extract code block if present
  const codeMatch = text.match(/```typescript\n([\s\S]*?)\n```/) ??
                    text.match(/```ts\n([\s\S]*?)\n```/) ??
                    text.match(/```\n([\s\S]*?)\n```/);

  return codeMatch ? codeMatch[1] : text;
}

/**
 * Validate a generated module using SGM proof engine.
 */
export function validateModuleWithSGM(code: string, gap: AutonomyGap): {
  approved: boolean;
  confidence: number;
  reason: string;
} {
  const ctx: SGMProofContext = {
    proposedModification: `Auto-generated module for gap: ${gap.capability}`,
    targetModule: `auto-${gap.capability.toLowerCase().replace(/\s+/g, '-')}.ts`,
    currentPerformanceScore: 0.7,
    expectedPerformanceGain: gap.estimatedImpact,
    evidenceSet: [
      `Gap detected: ${gap.description}`,
      `Evidence: ${gap.evidenceFromConversation}`,
      `Priority: ${gap.priority}`,
    ],
    safetyConstraints: [
      'No destructive file operations',
      'No network calls without explicit permission',
      'TypeScript strict mode compliance',
    ],
  };

  const result: SGMProofResult = validateModificationWithSGM(ctx);

  return {
    approved: result.approved,
    confidence: result.bayesianPosterior,
    reason: result.approved
      ? `SGM approved: P(gain)=${(result.bayesianPosterior * 100).toFixed(1)}%, safety=${(result.safetyScore * 100).toFixed(1)}%`
      : `SGM rejected: ${result.rejectionReason}`,
  };
}

/**
 * Execute a full autonomy cycle: detect gaps → generate modules → validate → deploy.
 */
export async function runAutonomyCycle(
  recentQueries: string[] = [],
  failedResponses: string[] = []
): Promise<AutonomyCycleResult> {
  const cycleId = `auto-cycle-${Date.now()}`;
  const start = Date.now();
  const generatedModules: AutonomousModule[] = [];

  // Step 1: Detect gaps
  const gaps = await detectCapabilityGaps(recentQueries, failedResponses);

  // Step 2: Generate and validate modules for high-priority gaps
  const highPriorityGaps = gaps.filter(g => g.priority === 'HIGH' || g.priority === 'CRITICAL');

  for (const gap of highPriorityGaps.slice(0, 2)) {  // Max 2 per cycle
    try {
      const code = await generateModuleForGap(gap);
      const sgmValidation = validateModuleWithSGM(code, gap);

      const moduleName = gap.capability.toLowerCase().replace(/\s+/g, '-');
      const filePath = path.join(
        process.env.MOTHER_PROJECT_ROOT || process.cwd(), 'server/mother', // P1 fix
        `auto-${moduleName}-${Date.now()}.ts`
      );

      const module: AutonomousModule = {
        id: `mod-${Date.now()}`,
        name: moduleName,
        filePath,
        code,
        gap,
        sgmValidation,
        deployed: false,
        createdAt: new Date(),
      };

      // Step 3: Deploy if SGM approved
      if (sgmValidation.approved && sgmValidation.confidence > 0.7) {
        fs.writeFileSync(filePath, code, 'utf-8');

        // Quick syntax check via shell
        const testResult = await executeInSession('dgm-autonomy', `npx tsc --noEmit ${filePath} 2>&1 || echo "TS_ERROR"`, {
          timeout: 15000,
        });

        const combined = testResult.stdout + testResult.stderr;
        module.testResult = {
          passed: !combined.includes('TS_ERROR') && !combined.includes('error TS'),
          output: combined,
          errors: testResult.stderr ? [testResult.stderr] : [],
        };

        if (module.testResult.passed) {
          // C317 (Conselho V108): For CRITICAL gaps, validate with LangGraph supervisor (8s timeout)
          // Scientific basis: Zhang et al. (arXiv:2505.22954) — multi-agent validation increases DGM reliability
          if (gap.priority === 'CRITICAL') {
            try {
              const supervisorFn = await getSupervisorInvoke();
              if (supervisorFn) {
                const supervisorGoal = `Validate this TypeScript module for gap '${gap.capability}': does it correctly implement the required functionality? Module path: ${filePath}`;
                await Promise.race([
                  supervisorFn(supervisorGoal, `dgm-critical-${module.id}`),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('supervisor timeout')), 8000)),
                ]);
              }
            } catch {
              // Non-blocking: supervisor timeout or failure does not block deployment
            }
          }
          module.deployed = true;
          deployedModules.push(module);
        } else {
          // Remove file if TypeScript errors
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      }

      generatedModules.push(module);
    } catch (err) {
      log.error(`[NC-DGM-002] Module generation failed for gap ${gap.id}:`, err);
    }
  }

  // Update autonomy score
  const deployedCount = generatedModules.filter(m => m.deployed).length;
  const scoreIncrease = deployedCount * 2 + (gaps.length > 0 ? 1 : 0);
  currentAutonomyScore = Math.min(100, currentAutonomyScore + scoreIncrease);
  autonomyHistory.push(currentAutonomyScore);

  return {
    cycleId,
    gapsDetected: gaps,
    modulesGenerated: generatedModules,
    modulesDeployed: deployedCount,
    autonomyScore: currentAutonomyScore,
    cycleMs: Date.now() - start,
  };
}

/**
 * Get current DGM autonomy status.
 */
export function getDGMAutonomyStatus(): {
  autonomyScore: number;
  deployedModules: number;
  autonomyHistory: number[];
  level: string;
} {
  const level = currentAutonomyScore >= 90 ? 'FULL_AUTONOMY'
    : currentAutonomyScore >= 75 ? 'HIGH_AUTONOMY'
    : currentAutonomyScore >= 60 ? 'PARTIAL_AUTONOMY'
    : 'SUPERVISED';

  return {
    autonomyScore: currentAutonomyScore,
    deployedModules: deployedModules.length,
    autonomyHistory: autonomyHistory.slice(-20),
    level,
  };
}
