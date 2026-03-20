/**
 * benchmark_validation.ts — Hardening Phase 13 Item 1
 * 
 * Validates Benchmark 4 (Fredlund & Krahn 1977) FOS values:
 *   - Bishop Simplified: expected 1.372
 *   - Spencer: expected 1.373
 *   - Morgenstern-Price: expected 1.373
 * 
 * Run: npx tsx /tmp/benchmark_validation.ts
 */

import { bishopSimplified, spencerMethod, morgensternPrice } from '../client/src/components/shms/analysis/SlopeStabilityEngine';
import { CLASSIC_EXAMPLES } from '../client/src/components/shms/analysis/ClassicExamples';

const TOLERANCE = 0.15;  // ±15% tolerance for simplified implementations

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SHMS Benchmark 4 Validation — Fredlund & Krahn (1977)');
console.log('═══════════════════════════════════════════════════════════════');
console.log();

// Get Benchmark 4
const b4 = CLASSIC_EXAMPLES.find(e => e.id === 'fredlund-krahn-1977');
if (!b4) {
  console.error('❌ FATAL: Benchmark 4 not found in CLASSIC_EXAMPLES');
  process.exit(1);
}

console.log(`Benchmark: ${b4.name}`);
console.log(`Reference: ${b4.reference.split('\n')[0]}`);
console.log(`Layers: ${b4.profile.layers.length}`);
console.log(`Surface points: ${b4.profile.surfacePoints.length}`);
console.log();

const circle = b4.criticalCircle!;
console.log(`Critical circle: center=(${circle.center.x}, ${circle.center.y}), R=${circle.radius}`);
console.log();

// Run all three methods
const results: { method: string; computed: number; expected: number; delta: number; pass: boolean }[] = [];

try {
  const bishopResult = bishopSimplified(b4.profile, circle, 30);
  const bishopDelta = Math.abs(bishopResult.factorOfSafety - b4.expectedFOS.bishop!) / b4.expectedFOS.bishop!;
  results.push({
    method: 'Bishop Simplified',
    computed: bishopResult.factorOfSafety,
    expected: b4.expectedFOS.bishop!,
    delta: bishopDelta,
    pass: bishopDelta < TOLERANCE,
  });
  console.log(`Bishop: FOS=${bishopResult.factorOfSafety.toFixed(4)} (expected ${b4.expectedFOS.bishop}) converged=${bishopResult.converged} iter=${bishopResult.iterations} slices=${bishopResult.slices.length}`);
} catch (e) {
  console.error(`❌ Bishop CRASHED: ${e}`);
  results.push({ method: 'Bishop Simplified', computed: 0, expected: b4.expectedFOS.bishop!, delta: 1, pass: false });
}

try {
  const spencerResult = spencerMethod(b4.profile, circle, 30);
  const spencerDelta = Math.abs(spencerResult.factorOfSafety - b4.expectedFOS.spencer!) / b4.expectedFOS.spencer!;
  results.push({
    method: 'Spencer',
    computed: spencerResult.factorOfSafety,
    expected: b4.expectedFOS.spencer!,
    delta: spencerDelta,
    pass: spencerDelta < TOLERANCE,
  });
  console.log(`Spencer: FOS=${spencerResult.factorOfSafety.toFixed(4)} (expected ${b4.expectedFOS.spencer}) converged=${spencerResult.converged} iter=${spencerResult.iterations} θ=${spencerResult.theta?.toFixed(4)}`);
} catch (e) {
  console.error(`❌ Spencer CRASHED: ${e}`);
  results.push({ method: 'Spencer', computed: 0, expected: b4.expectedFOS.spencer!, delta: 1, pass: false });
}

try {
  const mpResult = morgensternPrice(b4.profile, circle, 30);
  const mpDelta = Math.abs(mpResult.factorOfSafety - b4.expectedFOS.morgensternPrice!) / b4.expectedFOS.morgensternPrice!;
  results.push({
    method: 'Morgenstern-Price',
    computed: mpResult.factorOfSafety,
    expected: b4.expectedFOS.morgensternPrice!,
    delta: mpDelta,
    pass: mpDelta < TOLERANCE,
  });
  console.log(`M-P: FOS=${mpResult.factorOfSafety.toFixed(4)} (expected ${b4.expectedFOS.morgensternPrice}) converged=${mpResult.converged} iter=${mpResult.iterations}`);
} catch (e) {
  console.error(`❌ M-P CRASHED: ${e}`);
  results.push({ method: 'Morgenstern-Price', computed: 0, expected: b4.expectedFOS.morgensternPrice!, delta: 1, pass: false });
}

console.log();
console.log('╔══════════════════════╤══════════╤══════════╤═══════╤════════╗');
console.log('║ Method               │ Computed │ Expected │ Δ(%)  │ Status ║');
console.log('╟──────────────────────┼──────────┼──────────┼───────┼────────╢');
for (const r of results) {
  const mPad = r.method.padEnd(20);
  const cPad = r.computed.toFixed(4).padStart(8);
  const ePad = r.expected.toFixed(4).padStart(8);
  const dPad = (r.delta * 100).toFixed(1).padStart(5);
  const sPad = r.pass ? '  ✅  ' : '  ❌  ';
  console.log(`║ ${mPad} │ ${cPad} │ ${ePad} │ ${dPad} │${sPad} ║`);
}
console.log('╚══════════════════════╧══════════╧══════════╧═══════╧════════╝');

const allPass = results.every(r => r.pass);
console.log();
console.log(allPass
  ? '✅ ALL BENCHMARKS PASS — FOS within ±15% of published values'
  : '⚠️ SOME BENCHMARKS OUTSIDE TOLERANCE — review implementation');

// Also run all 4 benchmarks with Bishop for a quick sanity check
console.log();
console.log('─── Quick sanity check: Bishop on all 4 benchmarks ────────────');
for (const ex of CLASSIC_EXAMPLES) {
  try {
    const c = ex.criticalCircle ?? { center: { x: 25, y: 40 }, radius: 20 };
    const r = bishopSimplified(ex.profile, c, 25);
    const expected = ex.expectedFOS.bishop ?? 0;
    const delta = expected > 0 ? Math.abs(r.factorOfSafety - expected) / expected : 0;
    console.log(`  ${ex.id.padEnd(25)} Bishop=${r.factorOfSafety.toFixed(3)} expected=${expected.toFixed(3)} Δ=${(delta * 100).toFixed(1)}% ${delta < TOLERANCE ? '✅' : '⚠️'}`);
  } catch (e) {
    console.log(`  ${ex.id.padEnd(25)} ❌ CRASHED: ${e}`);
  }
}

process.exit(allPass ? 0 : 1);
