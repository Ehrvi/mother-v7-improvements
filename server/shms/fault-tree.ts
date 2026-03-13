/**
 * SHMS Fault Tree — server/shms/fault-tree.ts
 * MOTHER v7 | Module 11
 *
 * IEC 61025:2006 — FTA standard | ICOLD B130 (2002) dam risk assessment
 * GISTM 2020 §8.3 — Geotechnical alert thresholds
 * Vesely et al. (1981) "Fault Tree Handbook" — NASA/US NRC methodology
 */

import { createLogger } from '../_core/logger.js';
import { randomUUID } from 'crypto';

const log = createLogger('fault-tree');

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeType = 'AND' | 'OR' | 'sensor_condition' | 'virtual_tag_condition' | 'time_condition' | 'manual';
export type TreeStatus = 'normal' | 'watch' | 'warning' | 'alert' | 'triggered';

export interface FaultTreeNode {
  id: string; label: string; type: NodeType; children: string[];
  sensorId?: string;
  condition?: { operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between'; value: number; value2?: number; unit?: string };
  durationMinutes?: number;
  currentValue?: number; isTriggered: boolean; lastEvaluated?: Date; triggeredAt?: Date;
}

export interface FaultTree {
  id: string; name: string; description: string; structureId: string;
  rootNodeId: string; nodes: Map<string, FaultTreeNode>;
  status: TreeStatus; lastEvaluated?: Date; evaluationIntervalMinutes: number;
  onTrigger: { notifyChannels: string[]; activateDeviceIds: string[]; createEvent: boolean };
}

export interface FaultTreeEvaluation {
  treeId: string; evaluatedAt: Date; status: TreeStatus;
  triggeredNodes: string[]; rootTriggered: boolean;
  evaluationPath: { nodeId: string; result: boolean; value?: number }[];
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function evalCond(c: FaultTreeNode['condition'], v: number): boolean {
  if (!c) return false;
  if (c.operator === 'gt')  return v > c.value;
  if (c.operator === 'gte') return v >= c.value;
  if (c.operator === 'lt')  return v < c.value;
  if (c.operator === 'lte') return v <= c.value;
  if (c.operator === 'eq')  return v === c.value;
  if (c.operator === 'between') return c.value2 !== undefined && v >= c.value && v <= c.value2;
  return false;
}

function makeNode(
  label: string, type: NodeType, children: string[],
  sensorId?: string, condition?: FaultTreeNode['condition'],
): FaultTreeNode {
  return { id: randomUUID(), label, type, children, sensorId, condition, isTriggered: false };
}

function makeTree(
  name: string, structureId: string, description: string,
  rootNodeId: string, nodes: Map<string, FaultTreeNode>,
  intervalMinutes: number, channels: string[],
): FaultTree {
  return {
    id: randomUUID(), name, description, structureId, rootNodeId, nodes,
    status: 'normal', evaluationIntervalMinutes: intervalMinutes,
    onTrigger: { notifyChannels: channels, activateDeviceIds: [], createEvent: true },
  };
}

// ─── Exported pure functions ──────────────────────────────────────────────────

export function evaluateNode(
  node: FaultTreeNode, children: FaultTreeNode[], readings: Map<string, number>,
): boolean {
  switch (node.type) {
    case 'AND': return children.length > 0 && children.every((c) => c.isTriggered);
    case 'OR':  return children.some((c) => c.isTriggered);
    case 'sensor_condition':
    case 'virtual_tag_condition': {
      if (!node.sensorId || !node.condition) return false;
      const val = readings.get(node.sensorId);
      return val !== undefined ? evalCond(node.condition, val) : false;
    }
    case 'time_condition':
      if (!node.triggeredAt || !node.durationMinutes) return false;
      return (Date.now() - node.triggeredAt.getTime()) / 60_000 >= node.durationMinutes;
    case 'manual': return node.isTriggered;
  }
}

export function evaluateTree(tree: FaultTree, readings: Map<string, number>): FaultTreeEvaluation {
  const now = new Date();
  const triggeredNodes: string[] = [];
  const evaluationPath: { nodeId: string; result: boolean; value?: number }[] = [];

  function evalRec(nodeId: string): boolean {
    const node = tree.nodes.get(nodeId);
    if (!node) return false;
    const childNodes = node.children.map((cid) => {
      const child = tree.nodes.get(cid);
      if (child) child.isTriggered = evalRec(cid);
      return child!;
    }).filter(Boolean);
    const val = node.sensorId ? readings.get(node.sensorId) : undefined;
    const result = evaluateNode(node, childNodes, readings);
    node.currentValue = val; node.lastEvaluated = now;
    if (result && !node.isTriggered) node.triggeredAt = now;
    node.isTriggered = result;
    if (result) triggeredNodes.push(nodeId);
    evaluationPath.push({ nodeId, result, value: val });
    return result;
  }

  const rootTriggered = evalRec(tree.rootNodeId);
  tree.lastEvaluated = now;
  tree.status = rootTriggered ? 'triggered' : triggeredNodes.length > 0 ? 'alert' : 'normal';
  log.debug(`Tree ${tree.id}: status=${tree.status} triggered=${triggeredNodes.length}`);
  return { treeId: tree.id, evaluatedAt: now, status: tree.status, triggeredNodes, rootTriggered, evaluationPath };
}

export function buildFaultTree(definition: {
  name: string; structureId: string; description: string;
  nodes: Omit<FaultTreeNode, 'isTriggered' | 'lastEvaluated' | 'triggeredAt'>[];
}): FaultTree {
  const nodes = new Map<string, FaultTreeNode>();
  for (const n of definition.nodes) nodes.set(n.id, { ...n, isTriggered: false });
  return makeTree(definition.name, definition.structureId, definition.description,
    definition.nodes[0]?.id ?? '', nodes, 5, []);
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class FaultTreeEngine {
  private trees = new Map<string, FaultTree>();

  registerTree(tree: FaultTree): void {
    this.trees.set(tree.id, tree);
    log.info(`Fault tree registered: ${tree.id} (${tree.name})`);
  }
  removeTree(id: string): void { this.trees.delete(id); }

  evaluateAll(readings: Map<string, number>): FaultTreeEvaluation[] {
    return [...this.trees.values()].map((t) => evaluateTree(t, readings));
  }
  getTreesByStructure(structureId: string): FaultTree[] {
    return [...this.trees.values()].filter((t) => t.structureId === structureId);
  }
  getActiveAlerts(): { treeId: string; treeName: string; triggeredAt: Date }[] {
    return [...this.trees.values()]
      .filter((t) => t.status === 'triggered' || t.status === 'alert')
      .map((t) => ({
        treeId: t.id, treeName: t.name,
        triggeredAt: t.nodes.get(t.rootNodeId)?.triggeredAt ?? t.lastEvaluated ?? new Date(),
      }));
  }

  /** GISTM 2020 §8.3 — piezometric threshold monitoring tree */
  createPiezometerAlertTree(
    structureId: string, piezometerIds: string[],
    thresholds: { watch: number; warning: number; alert: number },
  ): FaultTree {
    const alertLeaves = piezometerIds.map((sid) =>
      makeNode(`Piezometer ${sid} > alert`, 'sensor_condition', [], sid,
        { operator: 'gt', value: thresholds.alert, unit: 'kPa' }));
    const watchLeaves = piezometerIds.map((sid) =>
      makeNode(`Piezometer ${sid} > watch`, 'sensor_condition', [], sid,
        { operator: 'gt', value: thresholds.watch, unit: 'kPa' }));
    const alertOr = makeNode('Any piezometer ALERT', 'OR', alertLeaves.map((n) => n.id));
    const watchOr = makeNode('Any piezometer WATCH', 'OR', watchLeaves.map((n) => n.id));
    const root = makeNode('Piezometric Alert — Critical Threshold', 'OR', [alertOr.id, watchOr.id]);
    const all = [...alertLeaves, ...watchLeaves, alertOr, watchOr, root];
    const nodes = new Map(all.map((n) => [n.id, n]));
    const tree = makeTree(`Piezometric Alert — ${structureId}`, structureId,
      'GISTM 2020 §8.3 piezometric threshold monitoring', root.id, nodes, 5, ['email', 'sms']);
    this.registerTree(tree);
    return tree;
  }

  /** ICOLD B130 — slope instability: displacement + pore pressure */
  createSlopeInstabilityTree(structureId: string, inclinometerId: string, piezometerId: string): FaultTree {
    const incli = makeNode(`Inclinometer ${inclinometerId} > 25 mm`, 'sensor_condition', [],
      inclinometerId, { operator: 'gt', value: 25, unit: 'mm' });
    const piez = makeNode(`Piezometer ${piezometerId} > 200 kPa`, 'sensor_condition', [],
      piezometerId, { operator: 'gt', value: 200, unit: 'kPa' });
    const and = makeNode('Displacement AND High pore pressure', 'AND', [incli.id, piez.id]);
    const root = makeNode('Slope Instability — Imminent Failure', 'OR', [and.id, incli.id]);
    const nodes = new Map([[incli.id, incli], [piez.id, piez], [and.id, and], [root.id, root]]);
    const tree = makeTree(`Slope Instability — ${structureId}`, structureId,
      'ICOLD B130 slope instability: displacement + pore pressure', root.id, nodes, 2, ['email', 'sms', 'push']);
    this.registerTree(tree);
    return tree;
  }
}

export const faultTreeEngine = new FaultTreeEngine();
