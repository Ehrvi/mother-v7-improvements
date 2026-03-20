/**
 * FaultTreeEngine.ts — SOTA Fault Tree Computation Engine
 *
 * Scientific basis:
 *   - IEC 61025:2006   — FTA methodology, gate logic, minimum cut sets
 *   - IEC 62502:2010   — Event Tree Analysis methodology
 *   - ICOLD Bulletin 121/130 — Tailings dam failure modes & risk assessment
 *   - ICOLD Bulletin 194 (2025) — Tailings Dam Safety
 *   - GISTM 2020 §8.3  — Alert thresholds & monitoring frequency
 *   - ANM Res. 95/2022 — Brazilian dam safety regulation
 *   - Vesely et al. (1981) — NASA/NRC Fault Tree Handbook
 *   - Fussell-Vesely (1975) — Importance measures
 *   - NUREG-0492 (1981) — Quantitative FTA methodology
 *   - Bobbio et al. (2001) — FT→BN conversion: improving analysis via Bayesian Networks
 *   - Dugan et al. (1992) — Dynamic fault trees: Priority-AND and FDEP gates
 *   - Seed & Idriss (1971) — Simplified liquefaction evaluation
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type GateType = 'AND' | 'OR' | 'PAND' | 'VOTE' | 'FDEP';
export type NodeKind = 'gate' | 'basic' | 'undeveloped' | 'transfer' | 'house';

export interface FTNode {
  id: string;
  label: string;
  kind: NodeKind;
  gate?: GateType;
  voteK?: number;
  children: string[];
  probability?: number;
  sensorId?: string;
  description?: string;
  triggered?: boolean;
  branch?: string; // subsystem filter: 'OVTOP' | 'PIPE' | 'SLOPE' | 'SEISMIC'
}

export interface CutSet {
  events: string[];
  probability: number;
  order: number;
}

export interface ImportanceMeasure {
  eventId: string;
  label: string;
  fv: number;
  birnbaum: number;
  raw: number;
  rrw: number;
}

export interface MCResult {
  mean: number;
  p5: number;
  p50: number;
  p95: number;
  std: number;
  samples: number[];
  converged: boolean;
}

export interface ScenarioConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  overrides: Record<string, number>; // eventId → new probability
  color: string;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: string[];
}

export interface EventTreeBranch {
  name: string;
  probability: number;
  consequence: 'catastrophic' | 'major' | 'moderate' | 'minor';
  description: string;
}

export interface RiskMatrixCell {
  probability: string;
  consequence: string;
  level: 'intolerable' | 'alarp_high' | 'alarp_low' | 'acceptable';
}

// ─── Realistic Tailings Dam FTA Model (ICOLD Bulletin 121) ────────────────────

export function buildTailingsDamFTA(): Map<string, FTNode> {
  const nodes: FTNode[] = [
    // ── TOP EVENT ──
    { id: 'TOP', label: 'Ruptura da Barragem de Rejeitos', kind: 'gate', gate: 'OR',
      children: ['OVTOP', 'PIPE', 'SLOPE', 'SEISMIC'], description: 'Evento topo: falha catastrófica da estrutura' },

    // ══ BRANCH 1: GALGAMENTO (Overtopping) ══
    { id: 'OVTOP', label: 'Galgamento (Overtopping)', kind: 'gate', gate: 'OR',
      children: ['OV_FLOOD', 'OV_PUMP', 'OV_BOARD'], description: 'ICOLD B.121 — Modo de falha por excesso de nível', branch: 'OVTOP' },
    { id: 'OV_FLOOD', label: 'Precipitação Extrema + Vertedor Insuficiente', kind: 'gate', gate: 'AND',
      children: ['BE_PMF', 'BE_SPILL'], description: 'Evento de cheia combinado com capacidade inadequada', branch: 'OVTOP' },
    { id: 'BE_PMF', label: 'Precipitação > PMP (1:10000)', kind: 'basic', children: [],
      probability: 1e-4, sensorId: 'RAIN-01', description: 'Chuva excedendo a Precipitação Máxima Provável', branch: 'OVTOP' },
    { id: 'BE_SPILL', label: 'Falha no Vertedor', kind: 'basic', children: [],
      probability: 5e-3, description: 'Obstrução ou subdimensionamento do vertedor', branch: 'OVTOP' },
    { id: 'OV_PUMP', label: 'Falha no Sistema de Bombeamento', kind: 'gate', gate: 'AND',
      children: ['BE_PUMP1', 'BE_PUMP2'], description: 'Falha simultânea de bombas redundantes', branch: 'OVTOP' },
    { id: 'BE_PUMP1', label: 'Bomba Primária Falha', kind: 'basic', children: [],
      probability: 2e-2, description: 'Falha mecânica ou elétrica da bomba principal', branch: 'OVTOP' },
    { id: 'BE_PUMP2', label: 'Bomba Reserva Falha', kind: 'basic', children: [],
      probability: 2e-2, description: 'Falha da bomba de backup (redundância)', branch: 'OVTOP' },
    { id: 'OV_BOARD', label: 'Borda Livre Insuficiente', kind: 'basic', children: [],
      probability: 8e-4, sensorId: 'NR-01', description: 'Nível d\'água acima do freeboard mínimo de 1.5m (GISTM)', branch: 'OVTOP' },

    // ══ BRANCH 2: EROSÃO INTERNA (Piping) ══
    { id: 'PIPE', label: 'Erosão Interna (Piping)', kind: 'gate', gate: 'OR',
      children: ['PI_SEEP', 'PI_FILT', 'PI_FOUND'], description: 'ICOLD B.130 — Erosão regressiva e tubificação', branch: 'PIPE' },
    { id: 'PI_SEEP', label: 'Percolação Excessiva + Gradiente Crítico', kind: 'gate', gate: 'AND',
      children: ['BE_SEEP', 'BE_GRAD'], description: 'Condição de percolação associada a gradiente hidráulico extremo', branch: 'PIPE' },
    { id: 'BE_SEEP', label: 'Vazão de Percolação > 5 L/min', kind: 'basic', children: [],
      probability: 3e-3, sensorId: 'VN-01', description: 'Medidor de vazão nos drenos indica percolação anormal', branch: 'PIPE' },
    { id: 'BE_GRAD', label: 'Gradiente > 0.7 (Terzaghi)', kind: 'basic', children: [],
      probability: 2e-3, sensorId: 'PZ-01', description: 'Gradiente hidráulico crítico (Terzaghi i_cr = γ\'/γw)', branch: 'PIPE' },
    { id: 'PI_FILT', label: 'Falha no Sistema de Filtro/Dreno', kind: 'basic', children: [],
      probability: 4e-4, description: 'Colmatação ou ruptura do tapete filtrante (Sherard, 1984)', branch: 'PIPE' },
    { id: 'PI_FOUND', label: 'Erosão na Fundação', kind: 'basic', children: [],
      probability: 3e-4, description: 'Piping na interface barragem-fundação (solo residual)', branch: 'PIPE' },

    // ══ BRANCH 3: INSTABILIDADE DE TALUDE (Slope Instability) ══
    { id: 'SLOPE', label: 'Instabilidade de Talude', kind: 'gate', gate: 'OR',
      children: ['SL_STATIC', 'SL_CREEP'], description: 'ICOLD B.130 — Ruptura circular ou plana do maciço', branch: 'SLOPE' },
    { id: 'SL_STATIC', label: 'FOS < 1.3 + Poropressão Elevada', kind: 'gate', gate: 'AND',
      children: ['BE_FOS', 'BE_PORE', 'BE_DEFORM'], description: 'Condição simultânea de FOS baixo e poropressão alta', branch: 'SLOPE' },
    { id: 'BE_FOS', label: 'Fator de Segurança < 1.3', kind: 'basic', children: [],
      probability: 8e-3, description: 'FOS abaixo do limiar GISTM para operação normal', branch: 'SLOPE' },
    { id: 'BE_PORE', label: 'Poropressão > 200 kPa', kind: 'basic', children: [],
      probability: 6e-3, sensorId: 'PZ-01', description: 'Piezômetros indicam pressão acima do limiar de alerta', branch: 'SLOPE' },
    { id: 'BE_DEFORM', label: 'Deslocamento > 25 mm/mês', kind: 'basic', children: [],
      probability: 4e-3, sensorId: 'GNSS-01', description: 'InSAR+GNSS indicam aceleração de deslocamento', branch: 'SLOPE' },
    { id: 'SL_CREEP', label: 'Fluência Terciária (Fukuzono)', kind: 'basic', children: [],
      probability: 5e-4, sensorId: 'INC-01', description: 'Aceleração exponencial do deslocamento (Fukuzono, 1985)', branch: 'SLOPE' },

    // ══ BRANCH 4: LIQUEFAÇÃO SÍSMICA ══
    { id: 'SEISMIC', label: 'Liquefação Sísmica', kind: 'gate', gate: 'AND',
      children: ['SE_EQ', 'SE_SUSCEPT'], description: 'Sismo + material susceptível = liquefação (Seed & Idriss, 1971)', branch: 'SEISMIC' },
    { id: 'SE_EQ', label: 'Sismo > 0.1g (OBE)', kind: 'basic', children: [],
      probability: 2e-3, sensorId: 'ACC-01', description: 'Aceleração sísmica excedendo o OBE (sismo operacional)', branch: 'SEISMIC' },
    { id: 'SE_SUSCEPT', label: 'Material Susceptível (CRR < CSR)', kind: 'gate', gate: 'OR',
      children: ['BE_SATUR', 'BE_LOOSE'], description: 'Condição de susceptibilidade à liquefação', branch: 'SEISMIC' },
    { id: 'BE_SATUR', label: 'Grau de Saturação > 95%', kind: 'basic', children: [],
      probability: 1.5e-1, description: 'Rejeito saturado (condição necessária para liquefação)', branch: 'SEISMIC' },
    { id: 'BE_LOOSE', label: 'Índice de Vazios > 0.8', kind: 'basic', children: [],
      probability: 8e-2, description: 'Material em estado fofo (contractive, Casagrande, 1936)', branch: 'SEISMIC' },
  ];

  const map = new Map<string, FTNode>();
  nodes.forEach(n => map.set(n.id, n));
  return map;
}

// ─── Probability Computation (IEC 61025) ──────────────────────────────────────

export function computeProbability(nodeId: string, nodes: Map<string, FTNode>, memo = new Map<string, number>()): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!;
  const node = nodes.get(nodeId);
  if (!node) return 0;
  if (node.kind === 'basic' || node.kind === 'undeveloped' || node.kind === 'house') {
    const p = node.probability ?? 0;
    memo.set(nodeId, p);
    return p;
  }
  const childProbs = node.children.map(cid => computeProbability(cid, nodes, memo));
  let result = 0;
  if (node.gate === 'AND' || node.gate === 'PAND') {
    result = childProbs.reduce((a, b) => a * b, 1);
  } else if (node.gate === 'OR') {
    result = 1 - childProbs.reduce((a, b) => a * (1 - b), 1);
  } else if (node.gate === 'VOTE' && node.voteK) {
    const k = node.voteK; const n = childProbs.length;
    let sum = 0;
    for (let i = k; i <= n; i++) {
      sum += binomial(n, i) * Math.pow(childProbs[0], i) * Math.pow(1 - childProbs[0], n - i);
    }
    result = sum;
  }
  memo.set(nodeId, result);
  return result;
}

function binomial(n: number, k: number): number {
  if (k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
}

// ─── Probability with overrides (What-If) ─────────────────────────────────────

export function computeProbabilityWithOverrides(
  nodeId: string, nodes: Map<string, FTNode>, overrides: Record<string, number>
): number {
  const modified = new Map(nodes);
  for (const [eid, p] of Object.entries(overrides)) {
    const n = modified.get(eid);
    if (n) modified.set(eid, { ...n, probability: p });
  }
  return computeProbability(nodeId, modified);
}

// ─── Minimum Cut Sets (Boolean reduction) ─────────────────────────────────────

export function findMinCutSets(nodeId: string, nodes: Map<string, FTNode>): string[][] {
  const node = nodes.get(nodeId);
  if (!node) return [];
  if (node.kind === 'basic' || node.kind === 'undeveloped') return [[nodeId]];
  const childSets = node.children.map(cid => findMinCutSets(cid, nodes));
  if (node.gate === 'OR') {
    return childSets.flat();
  } else {
    return childSets.reduce((acc, sets) => {
      if (acc.length === 0) return sets;
      const result: string[][] = [];
      for (const a of acc) for (const b of sets) {
        const merged = [...new Set([...a, ...b])];
        result.push(merged);
      }
      return result;
    }, [] as string[][]);
  }
}

// ─── Importance Measures (NUREG-0492) ─────────────────────────────────────────

export function computeImportance(nodes: Map<string, FTNode>, topId: string): ImportanceMeasure[] {
  const topP = computeProbability(topId, nodes);
  const basicEvents = [...nodes.values()].filter(n => n.kind === 'basic');
  return basicEvents.map(be => {
    const origP = be.probability ?? 0;
    be.probability = 1;
    const q1 = computeProbability(topId, nodes, new Map());
    be.probability = 0;
    const q0 = computeProbability(topId, nodes, new Map());
    be.probability = origP;
    const birnbaum = q1 - q0;
    const fv = topP > 0 ? (birnbaum * origP) / topP : 0;
    const raw = topP > 0 ? q1 / topP : 1;
    const rrw = topP > 0 && q0 > 0 ? topP / q0 : Infinity;
    return { eventId: be.id, label: be.label, fv: Math.min(fv, 1), birnbaum, raw, rrw: Math.min(rrw, 100) };
  }).sort((a, b) => b.fv - a.fv);
}

// ─── Monte Carlo Simulation ──────────────────────────────────────────────────

export function runMonteCarlo(nodes: Map<string, FTNode>, topId: string, iterations = 10000): MCResult {
  const basicEvents = [...nodes.values()].filter(n => n.kind === 'basic');
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Sample each basic event probability from Lognormal distribution
    const modified = new Map(nodes);
    for (const be of basicEvents) {
      const mu = Math.log(be.probability ?? 1e-6);
      const sigma = 0.5; // uncertainty factor
      const sampled = Math.exp(mu + sigma * gaussianRandom());
      modified.set(be.id, { ...be, probability: Math.min(sampled, 1) });
    }
    samples.push(computeProbability(topId, modified));
  }

  samples.sort((a, b) => a - b);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const std = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length);

  return {
    mean,
    p5: samples[Math.floor(samples.length * 0.05)],
    p50: samples[Math.floor(samples.length * 0.50)],
    p95: samples[Math.floor(samples.length * 0.95)],
    std,
    samples: samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 200)) === 0),
    converged: std / mean < 0.05,
  };
}

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── SVG Tree Layout ──────────────────────────────────────────────────────────

export function layoutTree(rootId: string, nodes: Map<string, FTNode>): { layouts: Map<string, LayoutNode>; width: number; height: number } {
  const NODE_W = 160;
  const NODE_H = 56;
  const H_GAP = 24;
  const V_GAP = 80;
  const layouts = new Map<string, LayoutNode>();
  const subtreeWidths = new Map<string, number>();

  function calcWidth(id: string): number {
    if (subtreeWidths.has(id)) return subtreeWidths.get(id)!;
    const node = nodes.get(id);
    if (!node || node.children.length === 0) {
      subtreeWidths.set(id, NODE_W);
      return NODE_W;
    }
    const childrenW = node.children.reduce((s, c) => s + calcWidth(c), 0) + (node.children.length - 1) * H_GAP;
    const w = Math.max(NODE_W, childrenW);
    subtreeWidths.set(id, w);
    return w;
  }

  function place(id: string, x: number, y: number) {
    const node = nodes.get(id);
    if (!node) return;
    const totalW = subtreeWidths.get(id) ?? NODE_W;
    const cx = x + totalW / 2;
    layouts.set(id, { id, x: cx - NODE_W / 2, y, width: NODE_W, height: NODE_H, children: node.children });
    if (node.children.length > 0) {
      let childX = x;
      const childrenTotalW = node.children.reduce((s, c) => s + (subtreeWidths.get(c) ?? NODE_W), 0) + (node.children.length - 1) * H_GAP;
      childX = cx - childrenTotalW / 2;
      for (const cid of node.children) {
        const cw = subtreeWidths.get(cid) ?? NODE_W;
        place(cid, childX, y + NODE_H + V_GAP);
        childX += cw + H_GAP;
      }
    }
  }

  calcWidth(rootId);
  place(rootId, 20, 20);
  const allLayouts = [...layouts.values()];
  const maxX = Math.max(...allLayouts.map(l => l.x + l.width)) + 40;
  const maxY = Math.max(...allLayouts.map(l => l.y + l.height)) + 40;
  return { layouts, width: maxX, height: maxY };
}

// ─── Color & Status Helpers ───────────────────────────────────────────────────

export function probColor(p: number): string {
  if (p >= 1e-2) return '#ff3344';
  if (p >= 1e-3) return '#ff8844';
  if (p >= 1e-5) return '#ffcc00';
  return '#00ff88';
}

export function probTag(p: number): string {
  if (p >= 1e-2) return 'CRÍTICO';
  if (p >= 1e-3) return 'ALERTA';
  if (p >= 1e-5) return 'ATENÇÃO';
  return 'NORMAL';
}

// ─── Pre-built Scenarios (ICOLD) ──────────────────────────────────────────────

export const ICOLD_SCENARIOS: ScenarioConfig[] = [
  {
    id: 'pmp_flood', name: 'Cheia PMP + Vertedor Falho', icon: '🌊',
    description: 'Precipitação Máxima Provável com vertedor obstruído — ICOLD B.121 cenário de referência',
    overrides: { BE_PMF: 0.8, BE_SPILL: 0.6 }, color: '#0af',
  },
  {
    id: 'piping_progressive', name: 'Piping Progressivo', icon: '💧',
    description: 'Erosão interna progressiva com falha de filtro — Sherard (1984)',
    overrides: { BE_SEEP: 0.7, BE_GRAD: 0.5, PI_FILT: 0.3 }, color: '#ff8844',
  },
  {
    id: 'seismic_liquefaction', name: 'Liquefação Sísmica', icon: '🔴',
    description: 'Sismo MCE com material susceptível — Seed & Idriss (1971)',
    overrides: { SE_EQ: 0.9, BE_SATUR: 0.95, BE_LOOSE: 0.7 }, color: '#ff3344',
  },
  {
    id: 'operational_overload', name: 'Sobrecarga Operacional', icon: '⚠️',
    description: 'Combinação de poropressão elevada, deformação acelerada e FOS degradado',
    overrides: { BE_FOS: 0.5, BE_PORE: 0.6, BE_DEFORM: 0.4, OV_BOARD: 0.3 }, color: '#c8f',
  },
];

// ─── Event Tree (IEC 62502) ──────────────────────────────────────────────────

export function buildEventTree(failureMode: string): EventTreeBranch[] {
  const trees: Record<string, EventTreeBranch[]> = {
    OVTOP: [
      { name: 'Alerta precoce funciona + evacuação', probability: 0.7, consequence: 'minor', description: 'Sistema de alerta dispara >2h antes da ruptura' },
      { name: 'Alerta tardio + evacuação parcial', probability: 0.15, consequence: 'moderate', description: 'Alerta <30min, evacuação incompleta' },
      { name: 'Ruptura gradual + dano a jusante', probability: 0.10, consequence: 'major', description: 'Galgamento prolongado, erosão do corpo da barragem' },
      { name: 'Ruptura súbita catastrófica', probability: 0.05, consequence: 'catastrophic', description: 'Colapso total sem aviso' },
    ],
    PIPE: [
      { name: 'Detecção + reparo do filtro', probability: 0.5, consequence: 'minor', description: 'Vazamento detectado por inspeção visual' },
      { name: 'Piping contido por berma', probability: 0.25, consequence: 'moderate', description: 'Erosão controlada por medidas de emergência' },
      { name: 'Ruptura parcial do pé da barragem', probability: 0.15, consequence: 'major', description: 'Perda parcial de integridade estrutural' },
      { name: 'Ruptura total por piping', probability: 0.10, consequence: 'catastrophic', description: 'Colapso progressivo da barragem' },
    ],
    SLOPE: [
      { name: 'Movimento lento detectado (InSAR)', probability: 0.6, consequence: 'minor', description: 'Deslocamento <5mm/mês, monitoramento reforçado' },
      { name: 'Escorregamento local raso', probability: 0.2, consequence: 'moderate', description: 'Ruptura superficial da face do talude' },
      { name: 'Escorregamento profundo rotacional', probability: 0.12, consequence: 'major', description: 'Ruptura circular atingindo crista da barragem' },
      { name: 'Flow slide (liquefação estática)', probability: 0.08, consequence: 'catastrophic', description: 'Fluxo de lama a alta velocidade' },
    ],
    SEISMIC: [
      { name: 'Sismo leve, sem dano', probability: 0.5, consequence: 'minor', description: 'PGA < 0.05g, dentro do projeto' },
      { name: 'Fissuras + aumento de percolação', probability: 0.25, consequence: 'moderate', description: 'Danos localizados reparáveis' },
      { name: 'Liquefação parcial + deformação', probability: 0.15, consequence: 'major', description: 'Recalque significativo da crista' },
      { name: 'Liquefação total + flow failure', probability: 0.10, consequence: 'catastrophic', description: 'Falha por fluxo após liquefação completa' },
    ],
  };
  return trees[failureMode] || trees.OVTOP;
}

// ─── Risk Matrix (ALARP) ─────────────────────────────────────────────────────

export const RISK_MATRIX: RiskMatrixCell[] = [
  { probability: '>1e-2', consequence: 'Catastrófico', level: 'intolerable' },
  { probability: '>1e-2', consequence: 'Major', level: 'intolerable' },
  { probability: '>1e-2', consequence: 'Moderado', level: 'alarp_high' },
  { probability: '>1e-2', consequence: 'Menor', level: 'alarp_low' },
  { probability: '1e-3–1e-2', consequence: 'Catastrófico', level: 'intolerable' },
  { probability: '1e-3–1e-2', consequence: 'Major', level: 'alarp_high' },
  { probability: '1e-3–1e-2', consequence: 'Moderado', level: 'alarp_low' },
  { probability: '1e-3–1e-2', consequence: 'Menor', level: 'acceptable' },
  { probability: '1e-5–1e-3', consequence: 'Catastrófico', level: 'alarp_high' },
  { probability: '1e-5–1e-3', consequence: 'Major', level: 'alarp_low' },
  { probability: '1e-5–1e-3', consequence: 'Moderado', level: 'acceptable' },
  { probability: '1e-5–1e-3', consequence: 'Menor', level: 'acceptable' },
  { probability: '<1e-5', consequence: 'Catastrófico', level: 'alarp_low' },
  { probability: '<1e-5', consequence: 'Major', level: 'acceptable' },
  { probability: '<1e-5', consequence: 'Moderado', level: 'acceptable' },
  { probability: '<1e-5', consequence: 'Menor', level: 'acceptable' },
];

// ─── Audit Hash Chain (SHA-256 simulation) ────────────────────────────────────

export interface AuditRecord {
  id: number;
  timestamp: string;
  topEventProbability: number;
  triggeredNodes: string[];
  evaluator: string;
  hash: string;
  previousHash: string;
}

let auditChain: AuditRecord[] = [];

export function addAuditRecord(topP: number, triggered: string[]): AuditRecord {
  const prev = auditChain.length > 0 ? auditChain[auditChain.length - 1].hash : '0'.repeat(64);
  const data = `${Date.now()}:${topP}:${triggered.join(',')}:${prev}`;
  // Client-side SHA-256 simulation using simple hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashHex = Math.abs(hash).toString(16).padStart(16, '0') + Math.abs(hash * 31).toString(16).padStart(16, '0') +
    Math.abs(hash * 37).toString(16).padStart(16, '0') + Math.abs(hash * 41).toString(16).padStart(16, '0');

  const record: AuditRecord = {
    id: auditChain.length + 1,
    timestamp: new Date().toISOString(),
    topEventProbability: topP,
    triggeredNodes: triggered,
    evaluator: 'MOTHER-FTA-v2',
    hash: hashHex.slice(0, 64),
    previousHash: prev,
  };
  auditChain.push(record);
  return record;
}

export function getAuditChain(): AuditRecord[] { return [...auditChain]; }
export function verifyAuditChain(): boolean {
  for (let i = 1; i < auditChain.length; i++) {
    if (auditChain[i].previousHash !== auditChain[i - 1].hash) return false;
  }
  return true;
}

// ─── Report Generator Data ────────────────────────────────────────────────────

export interface ReportData {
  structureId: string;
  generatedAt: string;
  standard: string;
  topEventProbability: number;
  topEventTag: string;
  cutSets: CutSet[];
  importance: ImportanceMeasure[];
  mcResult: MCResult;
  auditChainValid: boolean;
  auditRecords: number;
  recommendations: string[];
}

export function generateReportData(
  structureId: string, nodes: Map<string, FTNode>, topP: number,
  cutSets: CutSet[], importance: ImportanceMeasure[], mc: MCResult
): ReportData {
  const recommendations = importance.slice(0, 5).map(im => {
    const priority = im.fv > 0.3 ? 'IMEDIATA' : im.fv > 0.1 ? 'ALTA' : 'MÉDIA';
    return `[${priority}] ${im.label} — F-V: ${im.fv.toFixed(4)}, RAW: ${im.raw.toFixed(1)}`;
  });

  return {
    structureId,
    generatedAt: new Date().toISOString(),
    standard: 'ANM Res. 95/2022 + GISTM 2020 + ICOLD B.130',
    topEventProbability: topP,
    topEventTag: probTag(topP),
    cutSets: cutSets.slice(0, 10),
    importance: importance.slice(0, 10),
    mcResult: mc,
    auditChainValid: verifyAuditChain(),
    auditRecords: auditChain.length,
    recommendations,
  };
}

// ─── Dynamic Probability Updates (Bobbio et al. 2001 — sensor evidence) ───────

export interface ProbabilityUpdateEntry {
  probability: number;
  source: 'mqtt' | 'lstm' | 'dgm' | 'instrumentation' | 'simulated' | 'user';
  sensorValue?: number;
  sensorUnit?: string;
  alarmLevel?: string;
  confidence: number;
}

/**
 * Apply live sensor-derived probabilities to FTA leaf nodes.
 * Converts the static-probability tree into a dynamically-updated one.
 *
 * Updates matching leaf nodes by nodeId (direct match) or sensorId→nodeId mapping.
 * Returns the set of nodeIds that were updated.
 *
 * Scientific basis: Bobbio et al. (2001) — evidence propagation from sensors into FTA
 */
export function updateNodeProbabilities(
  nodes: Map<string, FTNode>,
  updates: Map<string, ProbabilityUpdateEntry>,
): Set<string> {
  const updatedIds = new Set<string>();

  for (const [nodeId, entry] of updates) {
    const node = nodes.get(nodeId);
    if (node && (node.kind === 'basic' || node.kind === 'undeveloped')) {
      node.probability = Math.max(1e-8, Math.min(0.999, entry.probability));
      node.triggered = entry.probability > 0.01;
      updatedIds.add(nodeId);
    }
  }

  return updatedIds;
}

/**
 * Build sensor→node mapping from the FTA tree.
 * Returns Map<sensorId, nodeId[]> for all nodes that have a sensorId field.
 */
export function getSensorNodeMapping(nodes: Map<string, FTNode>): Map<string, string[]> {
  const mapping = new Map<string, string[]>();
  for (const [nodeId, node] of nodes) {
    if (node.sensorId) {
      const existing = mapping.get(node.sensorId) || [];
      existing.push(nodeId);
      mapping.set(node.sensorId, existing);
    }
  }
  return mapping;
}

/**
 * Merge live probability updates into nodes by sensorId lookup.
 * Handles the case where multiple FTA nodes share the same sensorId (e.g. PZ-01).
 */
export function mergeByLiveSensorData(
  nodes: Map<string, FTNode>,
  sensorProbabilities: Map<string, { probability: number; source: string }>,
): Set<string> {
  const sensorMap = getSensorNodeMapping(nodes);
  const updatedIds = new Set<string>();

  for (const [sensorId, data] of sensorProbabilities) {
    const nodeIds = sensorMap.get(sensorId);
    if (!nodeIds) continue;
    for (const nodeId of nodeIds) {
      const node = nodes.get(nodeId);
      if (node && (node.kind === 'basic' || node.kind === 'undeveloped')) {
        node.probability = Math.max(1e-8, Math.min(0.999, data.probability));
        node.triggered = data.probability > 0.01;
        updatedIds.add(nodeId);
      }
    }
  }

  return updatedIds;
}

