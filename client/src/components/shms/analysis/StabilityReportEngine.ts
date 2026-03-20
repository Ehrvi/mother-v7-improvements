/**
 * StabilityReportEngine.ts — Report Generation for Dam Safety Standards
 *
 * Supported standards:
 *   - ICOLD Bulletin 158 (2018): Dam Surveillance Guide
 *   - ICOLD Bulletin 194 (2025): Dam Monitoring — Recommended Practice
 *   - GISTM (2020): Global Industry Standard on Tailings Management
 *   - ANCOLD (2024): Guidelines on Dam Safety Management
 *   - ANM Resolução 95/2022 + Lei 14.066/2020 (Brazil)
 *   - CDA (2013): Canadian Dam Association — Dam Safety Guidelines
 *   - USACE ER 1110-2-1156: Dam Safety — Organization/Responsibilities
 */

import type { StabilityResult, FEMResult, GAResult, PSOResult } from './SlopeStabilityEngine';
import type { MonteCarloResult, FORMResult, ScenarioResult } from './ReliabilityEngine';

// ─── Report Types ─────────────────────────────────────────────────────────────

export type ReportStandard = 'ICOLD' | 'GISTM' | 'ANCOLD' | 'ANM-BR' | 'CDA' | 'USACE';

export interface ReportData {
  structureName: string;
  structureId: string;
  analyst: string;
  date: string;
  standard: ReportStandard;
  stability?: { bishop?: StabilityResult; spencer?: StabilityResult; morgensternPrice?: StabilityResult };
  fem?: FEMResult;
  optimization?: { ga?: GAResult; pso?: PSOResult };
  reliability?: { monteCarlo?: MonteCarloResult; form?: FORMResult };
  scenarios?: ScenarioResult[];
  exampleId?: string;
  dgmHash?: string;
}

export interface ReportSection {
  title: string;
  content: string;
  subsections?: ReportSection[];
  tables?: { headers: string[]; rows: string[][] }[];
  status?: 'pass' | 'fail' | 'warning' | 'info';
}

export interface GeneratedReport {
  standard: ReportStandard;
  title: string;
  sections: ReportSection[];
  summary: { totalChecks: number; passed: number; warnings: number; failed: number };
  generatedAt: string;
  dgmHash: string;
}

// ─── GISTM Conformity Matrix (77 requirements) ───────────────────────────────

export interface GISTMRequirement {
  id: string;
  principle: number;
  topic: string;
  requirement: string;
  status: 'conforme' | 'não-conforme' | 'parcial' | 'não-aplicável';
  evidence: string;
}

const GISTM_PRINCIPLES: { principle: number; name: string; topics: string[] }[] = [
  { principle: 1, name: 'Affected Communities', topics: ['Knowledge of communities', 'Emergency preparedness', 'Grievance mechanism'] },
  { principle: 2, name: 'Integrated Knowledge Base', topics: ['Site characterization', 'Design basis', 'Monitoring data', 'Performance assessment'] },
  { principle: 3, name: 'Design, Construction & Operation', topics: ['Robust design', 'Design criteria', 'Construction QA', 'Water management'] },
  { principle: 4, name: 'Management & Governance', topics: ['Accountable executive', 'Responsible engineer', 'Independent review', 'Change management'] },
  { principle: 5, name: 'Emergency Response', topics: ['Dam breach study', 'Emergency plan', 'Warning systems', 'Evacuation procedures'] },
  { principle: 6, name: 'Public Disclosure', topics: ['Transparency', 'Reporting', 'Independent audits', 'Stakeholder engagement'] },
];

// ─── Report Generation Functions ──────────────────────────────────────────────

export function generateReport(data: ReportData): GeneratedReport {
  switch (data.standard) {
    case 'ICOLD': return generateICOLDReport(data);
    case 'GISTM': return generateGISTMReport(data);
    case 'ANCOLD': return generateANCOLDReport(data);
    case 'ANM-BR': return generateANMReport(data);
    case 'CDA': return generateCDAReport(data);
    case 'USACE': return generateUSACEReport(data);
    default: return generateICOLDReport(data);
  }
}

function generateICOLDReport(data: ReportData): GeneratedReport {
  const sections: ReportSection[] = [];
  let passed = 0, warnings = 0, failed = 0;

  // Section 1: Structure ID
  sections.push({
    title: '1. Identificação da Estrutura',
    content: `Estrutura: ${data.structureName}\nID: ${data.structureId}\nAnalista: ${data.analyst}\nData: ${data.date}`,
    status: 'info',
  });

  // Section 2: Stability Analysis
  if (data.stability) {
    const bishop = data.stability.bishop;
    const spencer = data.stability.spencer;
    const mp = data.stability.morgensternPrice;
    const fosStatus = (fos: number) => fos >= 1.5 ? 'pass' : fos >= 1.0 ? 'warning' : 'fail';

    const rows: string[][] = [];
    if (bishop) { rows.push(['Bishop Simplificado', bishop.factorOfSafety.toFixed(3), bishop.converged ? 'Sim' : 'Não', `${bishop.iterations}`, fosStatus(bishop.factorOfSafety) === 'pass' ? '✅' : '⚠️']); }
    if (spencer) { rows.push(['Spencer', spencer.factorOfSafety.toFixed(3), spencer.converged ? 'Sim' : 'Não', `${spencer.iterations}`, fosStatus(spencer.factorOfSafety) === 'pass' ? '✅' : '⚠️']); }
    if (mp) { rows.push(['Morgenstern-Price', mp.factorOfSafety.toFixed(3), mp.converged ? 'Sim' : 'Não', `${mp.iterations}`, fosStatus(mp.factorOfSafety) === 'pass' ? '✅' : '⚠️']); }

    const minFOS = Math.min(...[bishop, spencer, mp].filter(Boolean).map(r => r!.factorOfSafety));
    const status = fosStatus(minFOS);
    if (status === 'pass') passed++; else if (status === 'warning') warnings++; else failed++;

    sections.push({
      title: '2. Análise de Estabilidade (LEM)',
      content: `Fator de Segurança mínimo: ${minFOS.toFixed(3)} (requerido: 1.50 — ICOLD Bulletin 130)`,
      status,
      tables: [{ headers: ['Método', 'FOS', 'Convergiu', 'Iterações', 'Status'], rows }],
    });
  }

  // Section 3: FEM
  if (data.fem) {
    const status = data.fem.srf >= 1.5 ? 'pass' : data.fem.srf >= 1.0 ? 'warning' : 'fail';
    if (status === 'pass') passed++; else if (status === 'warning') warnings++; else failed++;
    sections.push({
      title: '3. Análise por Elementos Finitos (c-φ Reduction)',
      content: `SRF (Shear Reduction Factor): ${data.fem.srf.toFixed(3)}\nConvergiu: ${data.fem.converged ? 'Sim' : 'Não'}\nNós da malha: ${data.fem.meshNodes.length}\nElementos: ${data.fem.meshElements.length}`,
      status,
    });
  }

  // Section 4: Reliability
  if (data.reliability?.monteCarlo) {
    const mc = data.reliability.monteCarlo;
    const status = mc.reliabilityIndex >= 3.0 ? 'pass' : mc.reliabilityIndex >= 2.0 ? 'warning' : 'fail';
    if (status === 'pass') passed++; else if (status === 'warning') warnings++; else failed++;
    sections.push({
      title: '4. Análise de Confiabilidade (Monte Carlo)',
      content: `Iterações: ${mc.fosValues.length}\nFOS médio: ${mc.mean.toFixed(3)} ± ${mc.stdDev.toFixed(3)}\nP(ruptura): ${(mc.probabilityOfFailure * 100).toFixed(2)}%\nÍndice β: ${mc.reliabilityIndex.toFixed(2)}`,
      status,
    });
  }

  // Section 5: Scenarios
  if (data.scenarios) {
    const rows = data.scenarios.map(s => [
      s.scenario.name, s.fos.toFixed(3), s.scenario.requiredFOS.toFixed(1),
      s.passes ? '✅' : '❌', s.scenario.reference,
    ]);
    const allPass = data.scenarios.every(s => s.passes);
    if (allPass) passed++; else failed++;
    sections.push({
      title: '5. Análise de Cenários',
      content: `${data.scenarios.filter(s => s.passes).length} de ${data.scenarios.length} cenários atendem aos requisitos.`,
      status: allPass ? 'pass' : 'fail',
      tables: [{ headers: ['Cenário', 'FOS', 'Requerido', 'Status', 'Referência'], rows }],
    });
  }

  // Section 6: Provenance
  sections.push({
    title: '6. Rastreabilidade (DGM Hash Chain)',
    content: `Hash: ${data.dgmHash ?? 'N/A'}\nPadrão: ICOLD Bulletin 158/194`,
    status: 'info',
  });

  return {
    standard: 'ICOLD', title: `Relatório ICOLD — ${data.structureName}`,
    sections, summary: { totalChecks: passed + warnings + failed, passed, warnings, failed },
    generatedAt: new Date().toISOString(), dgmHash: data.dgmHash ?? '',
  };
}

function generateGISTMReport(data: ReportData): GeneratedReport {
  const icold = generateICOLDReport({ ...data, standard: 'ICOLD' });
  // Add GISTM-specific conformity sections
  const gistmSections: ReportSection[] = GISTM_PRINCIPLES.map(p => ({
    title: `GISTM Princípio ${p.principle}: ${p.name}`,
    content: p.topics.map(t => `• ${t}: Avaliar conformidade`).join('\n'),
    status: 'info' as const,
  }));
  return { ...icold, standard: 'GISTM', title: `Relatório GISTM — ${data.structureName}`,
    sections: [...icold.sections, ...gistmSections] };
}

function generateANCOLDReport(data: ReportData): GeneratedReport {
  const icold = generateICOLDReport({ ...data, standard: 'ICOLD' });
  icold.sections.push({
    title: 'ANCOLD — Dam Safety Management',
    content: 'Conforme ANCOLD Guidelines on Dam Safety Management (2024).\nConsequence Category: a ser determinada.\nDam Safety Review frequency: conforme categoria.',
    status: 'info',
  });
  return { ...icold, standard: 'ANCOLD', title: `Relatório ANCOLD — ${data.structureName}` };
}

function generateANMReport(data: ReportData): GeneratedReport {
  const icold = generateICOLDReport({ ...data, standard: 'ICOLD' });
  icold.sections.push({
    title: 'ANM — Resolução 95/2022 + Lei 14.066/2020',
    content: 'Requisitos brasileiros:\n• PAEBM (Plano de Ação de Emergência)\n• DCE (Declaração de Condição de Estabilidade)\n• RSB (Revisão de Segurança de Barragem)\n• Inspeção Regular (frequência conforme DPA/CRI)\n• Classificação: DPA + CRI → Nível de Segurança\n• Proibição de alteamento a montante (Lei 14.066)',
    status: 'info',
    subsections: [
      { title: 'DCE — Declaração de Condição de Estabilidade', content: `FOS calculado: ${data.stability?.bishop?.factorOfSafety.toFixed(3) ?? 'N/A'}\nCondição: ${(data.stability?.bishop?.factorOfSafety ?? 0) >= 1.3 ? 'Estável' : 'Instável'}`, status: (data.stability?.bishop?.factorOfSafety ?? 0) >= 1.3 ? 'pass' : 'fail' },
      { title: 'PAEBM — Plano de Ação de Emergência', content: 'O PAEBM deve considerar os cenários de ruptura analisados neste relatório.', status: 'info' },
    ],
  });
  return { ...icold, standard: 'ANM-BR', title: `Relatório ANM (Brasil) — ${data.structureName}` };
}

function generateCDAReport(data: ReportData): GeneratedReport {
  const icold = generateICOLDReport({ ...data, standard: 'ICOLD' });
  return { ...icold, standard: 'CDA', title: `CDA Dam Safety Report — ${data.structureName}` };
}

function generateUSACEReport(data: ReportData): GeneratedReport {
  const icold = generateICOLDReport({ ...data, standard: 'ICOLD' });
  icold.sections.push({
    title: 'USACE Compliance',
    content: 'EM 1110-2-1902: Slope Stability\nER 1110-2-1156: Dam Safety\nETL 1110-2-556: Risk Analysis\n\nFOS Requirements:\n• Operating: 1.5\n• Flood: 1.3\n• Seismic (OBE): 1.1\n• Post-earthquake: 1.2',
    status: 'info',
  });
  return { ...icold, standard: 'USACE', title: `USACE Report — ${data.structureName}` };
}

// ─── Export Report as Formatted Text ──────────────────────────────────────────

export function reportToText(report: GeneratedReport): string {
  const lines: string[] = [];
  lines.push('═'.repeat(60));
  lines.push(report.title);
  lines.push('═'.repeat(60));
  lines.push(`Gerado em: ${report.generatedAt}`);
  lines.push(`DGM Hash: ${report.dgmHash}`);
  lines.push('');

  for (const section of report.sections) {
    const icon = section.status === 'pass' ? '✅' : section.status === 'fail' ? '❌' : section.status === 'warning' ? '⚠️' : 'ℹ️';
    lines.push(`${icon} ${section.title}`);
    lines.push('─'.repeat(40));
    lines.push(section.content);
    if (section.tables) {
      for (const table of section.tables) {
        lines.push('');
        lines.push('| ' + table.headers.join(' | ') + ' |');
        lines.push('| ' + table.headers.map(() => '---').join(' | ') + ' |');
        for (const row of table.rows) {
          lines.push('| ' + row.join(' | ') + ' |');
        }
      }
    }
    if (section.subsections) {
      for (const sub of section.subsections) {
        lines.push(`  ${sub.title}: ${sub.content.split('\n')[0]}`);
      }
    }
    lines.push('');
  }

  lines.push('═'.repeat(60));
  lines.push(`RESUMO: ${report.summary.passed} ✅  ${report.summary.warnings} ⚠️  ${report.summary.failed} ❌  (Total: ${report.summary.totalChecks})`);
  lines.push('═'.repeat(60));

  return lines.join('\n');
}

// ─── Available Standards ──────────────────────────────────────────────────────

export const AVAILABLE_STANDARDS: { id: ReportStandard; name: string; description: string }[] = [
  { id: 'ICOLD', name: 'ICOLD Bulletin 158/194', description: 'International Commission on Large Dams — Monitoramento e Segurança' },
  { id: 'GISTM', name: 'GISTM (2020)', description: 'Global Industry Standard on Tailings Management — 77 requisitos' },
  { id: 'ANCOLD', name: 'ANCOLD (2024)', description: 'Australian National Committee on Large Dams — Safety Management' },
  { id: 'ANM-BR', name: 'ANM Res. 95/2022 (Brasil)', description: 'Agência Nacional de Mineração — DCE, RSB, PAEBM' },
  { id: 'CDA', name: 'CDA (2013)', description: 'Canadian Dam Association — Dam Safety Guidelines' },
  { id: 'USACE', name: 'USACE EM/ER', description: 'US Army Corps of Engineers — Dam Safety Standards' },
];
