/**
 * C157 — self-architect-agent.ts
 * Fase 6C: Autonomia Total — Refatoração arquitetural baseada em complexidade ciclomática
 * 
 * Scientific basis:
 * - McCabe (1976): "A Complexity Measure" — Cyclomatic complexity V(G) = E - N + 2P
 * - Gemini Moonshot (Conselho v3 R3): "MOTHER Forge — refatoração contínua baseada em complexidade"
 * - Martin (2008): "Clean Code" — Single Responsibility Principle
 * - Fowler (1999): "Refactoring" — Extract Method, Extract Class patterns
 * 
 * Purpose: Analyzes all TypeScript modules for cyclomatic complexity,
 * identifies refactoring opportunities, and generates autonomous proposals
 * for architectural improvements.
 */

import { createLogger } from './core.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const logger = createLogger('self-architect-agent');

export interface ComplexityReport {
  module: string;
  cyclomaticComplexity: number;
  linesOfCode: number;
  functionCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  refactoringProposals: RefactoringProposal[];
}

export interface RefactoringProposal {
  type: 'extract_function' | 'extract_class' | 'reduce_nesting' | 'split_module';
  description: string;
  estimatedComplexityReduction: number;
  priority: 'low' | 'medium' | 'high';
  scientificBasis: string;
}

export interface ArchitecturalAnalysis {
  timestamp: string;
  totalModules: number;
  averageComplexity: number;
  criticalModules: ComplexityReport[];
  topProposals: RefactoringProposal[];
  analysisHash: string;
}

/**
 * SelfArchitectAgent
 * Analyzes MOTHER's codebase for architectural improvements using
 * McCabe's cyclomatic complexity metric (V(G) = E - N + 2P).
 */
export class SelfArchitectAgent {
  private readonly COMPLEXITY_THRESHOLDS = {
    low: 5,
    medium: 10,
    high: 20,
    critical: 30,
  };

  private readonly MOTHER_DIR: string;

  constructor() {
    this.MOTHER_DIR = process.env.MOTHER_DIR 
      ? path.join(process.env.MOTHER_DIR, 'server/mother')
      : path.join(process.cwd(), 'server/mother');
  }

  /**
   * Analyze all modules and generate architectural report
   */
  async analyzeArchitecture(): Promise<ArchitecturalAnalysis> {
    logger.info('Starting architectural analysis with McCabe complexity metric');
    
    const modules = fs.readdirSync(this.MOTHER_DIR)
      .filter(f => f.endsWith('.ts'))
      .map(f => path.join(this.MOTHER_DIR, f));

    const reports: ComplexityReport[] = [];
    
    for (const modulePath of modules) {
      const report = this.analyzeModule(modulePath);
      reports.push(report);
    }

    // Sort by complexity descending
    reports.sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);

    const criticalModules = reports.filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high');
    const avgComplexity = reports.reduce((sum, r) => sum + r.cyclomaticComplexity, 0) / reports.length;

    // Collect top proposals
    const allProposals = reports.flatMap(r => r.refactoringProposals);
    allProposals.sort((a, b) => b.estimatedComplexityReduction - a.estimatedComplexityReduction);
    const topProposals = allProposals.slice(0, 10);

    const analysis: ArchitecturalAnalysis = {
      timestamp: new Date().toISOString(),
      totalModules: modules.length,
      averageComplexity: Math.round(avgComplexity * 10) / 10,
      criticalModules: criticalModules.slice(0, 5),
      topProposals,
      analysisHash: '',
    };

    analysis.analysisHash = crypto.createHash('sha256')
      .update(JSON.stringify({ timestamp: analysis.timestamp, avgComplexity, criticalCount: criticalModules.length }))
      .digest('hex');

    logger.info(`Analysis complete: ${modules.length} modules, avg complexity: ${avgComplexity.toFixed(1)}, critical: ${criticalModules.length}`);
    
    return analysis;
  }

  /**
   * Compute McCabe cyclomatic complexity for a TypeScript file
   * V(G) = number of decision points + 1
   * Decision points: if, else if, while, for, case, catch, &&, ||, ternary
   */
  private analyzeModule(modulePath: string): ComplexityReport {
    const content = fs.readFileSync(modulePath, 'utf-8');
    const lines = content.split('
');
    const moduleName = path.basename(modulePath);

    // Count decision points (simplified McCabe metric)
    const decisionPatterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
      /\?\s*[^:]/g, // ternary
    ];

    let decisionPoints = 0;
    for (const pattern of decisionPatterns) {
      const matches = content.match(pattern);
      if (matches) decisionPoints += matches.length;
    }

    const cyclomaticComplexity = decisionPoints + 1;

    // Count functions
    const functionMatches = content.match(/(function|async function|=>)/g);
    const functionCount = functionMatches ? functionMatches.length : 0;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (cyclomaticComplexity <= this.COMPLEXITY_THRESHOLDS.low) riskLevel = 'low';
    else if (cyclomaticComplexity <= this.COMPLEXITY_THRESHOLDS.medium) riskLevel = 'medium';
    else if (cyclomaticComplexity <= this.COMPLEXITY_THRESHOLDS.high) riskLevel = 'high';
    else riskLevel = 'critical';

    // Generate refactoring proposals
    const proposals: RefactoringProposal[] = [];

    if (cyclomaticComplexity > this.COMPLEXITY_THRESHOLDS.high) {
      proposals.push({
        type: 'extract_function',
        description: `Extract complex logic from ${moduleName} into smaller functions (V(G)=${cyclomaticComplexity})`,
        estimatedComplexityReduction: Math.round(cyclomaticComplexity * 0.3),
        priority: 'high',
        scientificBasis: 'McCabe (1976): V(G) > 20 indicates high risk. Fowler (1999): Extract Method pattern.',
      });
    }

    if (lines.length > 300) {
      proposals.push({
        type: 'split_module',
        description: `Split ${moduleName} (${lines.length} lines) into focused sub-modules`,
        estimatedComplexityReduction: Math.round(cyclomaticComplexity * 0.4),
        priority: cyclomaticComplexity > 20 ? 'high' : 'medium',
        scientificBasis: 'Martin (2008): Single Responsibility Principle. Modules > 300 lines violate SRP.',
      });
    }

    return {
      module: moduleName,
      cyclomaticComplexity,
      linesOfCode: lines.length,
      functionCount,
      riskLevel,
      refactoringProposals: proposals,
    };
  }
}

// HTTP handler for GET /api/a2a/autonomy/architect
export async function handleArchitectRequest(req: any, res: any): Promise<void> {
  const agent = new SelfArchitectAgent();
  
  try {
    const analysis = await agent.analyzeArchitecture();
    res.json({
      success: true,
      ...analysis,
      message: `Architectural analysis complete. ${analysis.criticalModules.length} critical modules identified.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
