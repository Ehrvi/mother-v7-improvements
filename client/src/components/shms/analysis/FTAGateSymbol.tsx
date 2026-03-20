/**
 * FTAGateSymbol.tsx — IEC 61025 Gate SVG Symbols
 * Supports: AND, OR, PAND (Priority-AND), VOTE (k/n), FDEP (Functional Dependency)
 */

import type { GateType } from './FaultTreeEngine';

interface Props { gate: GateType; x: number; y: number; triggered: boolean }

export default function GateSymbol({ gate, x, y, triggered }: Props) {
  const color = triggered ? '#ff3344' : gate === 'AND' ? '#00ccff' : gate === 'OR' ? '#ff8844' : gate === 'PAND' ? '#ff44aa' : '#c8f';
  const glow = triggered ? `0 0 12px ${color}` : `0 0 6px ${color}44`;
  if (gate === 'AND') {
    return (
      <g transform={`translate(${x},${y})`} style={{ filter: `drop-shadow(${glow})` }}>
        <path d="M-14,10 L-14,-6 Q-14,-14 0,-14 Q14,-14 14,-6 L14,10 Z" fill={`${color}22`} stroke={color} strokeWidth={1.5} />
        <text x={0} y={2} textAnchor="middle" fill={color} fontSize={8} fontWeight={800}>AND</text>
      </g>
    );
  }
  if (gate === 'OR') {
    return (
      <g transform={`translate(${x},${y})`} style={{ filter: `drop-shadow(${glow})` }}>
        <path d="M-14,10 Q-10,-4 0,-14 Q10,-4 14,10 Q0,4 -14,10 Z" fill={`${color}22`} stroke={color} strokeWidth={1.5} />
        <text x={0} y={4} textAnchor="middle" fill={color} fontSize={8} fontWeight={800}>OR</text>
      </g>
    );
  }
  if (gate === 'PAND') {
    return (
      <g transform={`translate(${x},${y})`} style={{ filter: `drop-shadow(${glow})` }}>
        <path d="M-14,10 L-14,-6 Q-14,-14 0,-14 Q14,-14 14,-6 L14,10 Z" fill={`${color}22`} stroke={color} strokeWidth={1.5} />
        <line x1={-8} y1={10} x2={8} y2={10} stroke={color} strokeWidth={1.5} />
        <text x={0} y={0} textAnchor="middle" fill={color} fontSize={6} fontWeight={800}>PAND</text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={12} fill={`${color}22`} stroke={color} strokeWidth={1.5} />
      <text x={0} y={4} textAnchor="middle" fill={color} fontSize={7} fontWeight={700}>{gate}</text>
    </g>
  );
}
