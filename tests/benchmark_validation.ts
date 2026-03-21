/**
 * benchmark_validation.ts — Scientific LEM Benchmark Validation Suite
 * 
 * Purpose: Automated validation of all LEM methods against published references.
 * THIS IS THE DEFINITIVE DEBUG ROUTINE for slope stability algorithms.
 * 
 * References:
 *   - Rocscience SLIDE2 Verification Manual (VP#1, VP#2, VP#3)
 *   - Fredlund & Krahn (1977), Canadian Geotechnical Journal, 14(3), 429-439
 *   - Bishop (1955), Géotechnique, 5(1), 7-17
 *   - Donald & Giam (1988), ACADS benchmarks
 *   - USACE EM 1110-2-1902 (2003)
 * 
 * Usage (from project root):
 *   npx tsx tests/benchmark_validation.ts
 * 
 * Each test:
 *   1. Loads the benchmark geometry from ClassicExamples
 *   2. Uses PRESCRIBED critical circle (NOT grid search — per published reference)
 *   3. Runs ALL 7 LEM methods
 *   4. Compares against published FOS values
 *   5. Reports PASS/FAIL with error percentage
 * 
 * Tolerance: ±5% is acceptable per ISO 13374 for LEM software validation
 *            ±2% is "excellent" per Rocscience best practices
 */

import {
  generateSlices,
  felleniusOMS,
  bishopSimplified,
  janbuSimplified,
  janbuCorrected,
  spencerMethod,
  morgensternPrice,
  corpsOfEngineers,
  type SlopeProfile,
  type SlipCircle,
  type StabilityResult,
} from '../client/src/components/shms/analysis/SlopeStabilityEngine';

import {
  BENCHMARK_1,
  BENCHMARK_2,
  BENCHMARK_3,
  BENCHMARK_4,
} from '../client/src/components/shms/analysis/ClassicExamples';

// ─── Result Types ──────────────────────────────────────────────────────────────

interface MethodResult {
  method: string;
  computed: number;
  expected: number | null;
  error: number | null;
  converged: boolean;
  iterations: number;
  pass: boolean;
}

interface BenchmarkResult {
  name: string;
  circle: SlipCircle;
  methods: MethodResult[];
  sliceCount: number;
  totalWeight: number;
  passRate: number;
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const TOLERANCE = 0.05; // 5% tolerance
const N_SLICES = 30;

// Published reference values from Rocscience SLIDE2 and Fredlund & Krahn (1977)
const REFERENCES: Record<string, Record<string, number>> = {
  'ACADS 1a': {
    fellenius: 0.950,
    bishop: 0.987,
    janbu_simp: 0.949,
    janbu_corr: 0.990,
    spencer: 0.986,
    mp: 0.986,
  },
  'ACADS 1b': {
    bishop: 1.596,
    spencer: 1.595,
  },
  'ACADS 1c': {
    bishop: 1.157,
    spencer: 1.158,
    janbu_corr: 1.144,
  },
  'Fredlund & Krahn 1977': {
    bishop: 1.372,
    spencer: 1.373,
    mp: 1.373,
    janbu_simp: 1.281,
  },
};

// ─── Validation Runner ─────────────────────────────────────────────────────────

function runBenchmark(
  name: string,
  profile: SlopeProfile,
  circle: SlipCircle,
): BenchmarkResult {
  const slices = generateSlices(profile, circle, N_SLICES);
  const totalWeight = slices.reduce((sum, s) => sum + s.weight, 0);
  
  const refs = REFERENCES[name] ?? {};
  const methods: MethodResult[] = [];

  // Run all 7 methods
  const runs: [string, () => StabilityResult][] = [
    ['fellenius', () => felleniusOMS(profile, circle, N_SLICES)],
    ['bishop', () => bishopSimplified(profile, circle, N_SLICES, 100, 0.001)],
    ['janbu_simp', () => janbuSimplified(profile, circle, N_SLICES, 100, 0.001)],
    ['janbu_corr', () => janbuCorrected(profile, circle, N_SLICES, 100, 0.001)],
    ['spencer', () => spencerMethod(profile, circle, N_SLICES, 200, 0.001)],
    ['mp', () => morgensternPrice(profile, circle, 'half-sine', N_SLICES, 300, 0.001)],
    ['coe', () => corpsOfEngineers(profile, circle, 'coe', N_SLICES, 100, 0.001)],
  ];

  for (const [key, fn] of runs) {
    try {
      const result = fn();
      const expected = refs[key] ?? null;
      const error = expected ? ((result.factorOfSafety - expected) / expected) : null;
      const pass = expected ? Math.abs(error!) <= TOLERANCE : true;

      methods.push({
        method: key,
        computed: result.factorOfSafety,
        expected,
        error: error ? error * 100 : null,
        converged: result.converged,
        iterations: result.iterations,
        pass,
      });
    } catch (e) {
      methods.push({
        method: key,
        computed: NaN,
        expected: refs[key] ?? null,
        error: null,
        converged: false,
        iterations: 0,
        pass: false,
      });
    }
  }

  const testedMethods = methods.filter(m => m.expected !== null);
  const passRate = testedMethods.length > 0
    ? testedMethods.filter(m => m.pass).length / testedMethods.length
    : 1;

  return { name, circle, methods, sliceCount: slices.length, totalWeight, passRate };
}

// ─── Slice Diagnostic ──────────────────────────────────────────────────────────

function printSliceDiagnostic(profile: SlopeProfile, circle: SlipCircle, nSlices: number = 10) {
  const slices = generateSlices(profile, circle, nSlices);
  console.log(`\n  📐 Slice Diagnostic (${slices.length} valid of ${nSlices} total):`);
  console.log(`  ${'i'.padStart(3)} | ${'xMid'.padStart(6)} | ${'base'.padStart(6)} | ${'top'.padStart(6)} | ${'α°'.padStart(7)} | ${'W'.padStart(8)} | ${'c'.padStart(5)} | ${'φ°'.padStart(5)} | ${'u'.padStart(6)}`);
  for (const s of slices) {
    const deg = (s.baseAngle * 180 / Math.PI).toFixed(1);
    console.log(`  ${String(s.index).padStart(3)} | ${((s.xLeft + s.xRight) / 2).toFixed(1).padStart(6)} | ${((s.baseLeft + s.baseRight) / 2).toFixed(1).padStart(6)} | ${((s.topLeft + s.topRight) / 2).toFixed(1).padStart(6)} | ${deg.padStart(7)} | ${s.weight.toFixed(1).padStart(8)} | ${s.baseCohesion.toFixed(0).padStart(5)} | ${(s.baseFriction * 180 / Math.PI).toFixed(0).padStart(5)} | ${s.porePressure.toFixed(1).padStart(6)}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     MOTHER SHMS — LEM Benchmark Validation Suite v1.0          ║');
  console.log('║     Scientific Method: Cross-reference vs Published Values     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();

  const benchmarks: [string, SlopeProfile, SlipCircle][] = [
    ['ACADS 1a', BENCHMARK_1.profile, BENCHMARK_1.criticalCircle!],
    ['ACADS 1b', BENCHMARK_2.profile, BENCHMARK_2.criticalCircle!],
    ['ACADS 1c', BENCHMARK_3.profile, BENCHMARK_3.criticalCircle!],
    ['Fredlund & Krahn 1977', BENCHMARK_4.profile, BENCHMARK_4.criticalCircle!],
  ];

  const results: BenchmarkResult[] = [];
  let totalPassed = 0, totalTested = 0;

  for (const [name, profile, circle] of benchmarks) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  📊 ${name}`);
    console.log(`  Circle: center=(${circle.center.x}, ${circle.center.y}), R=${circle.radius}`);
    console.log(`${'─'.repeat(70)}`);

    const result = runBenchmark(name, profile, circle);
    results.push(result);

    console.log(`  Slices: ${result.sliceCount} | Total W: ${result.totalWeight.toFixed(0)} kN/m`);
    console.log();

    // Results table
    console.log(`  ${'Method'.padEnd(14)} | ${'Computed'.padStart(8)} | ${'Expected'.padStart(8)} | ${'Error%'.padStart(8)} | ${'Conv'.padStart(4)} | ${'Iter'.padStart(4)} | Status`);
    console.log(`  ${'─'.repeat(14)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(8)}-+-${'─'.repeat(4)}-+-${'─'.repeat(4)}-+-------`);
    
    for (const m of result.methods) {
      const computed = isNaN(m.computed) ? 'ERR' : m.computed.toFixed(4);
      const expected = m.expected ? m.expected.toFixed(3) : '—';
      const error = m.error !== null ? `${m.error >= 0 ? '+' : ''}${m.error.toFixed(1)}%` : '—';
      const conv = m.converged ? '✓' : '✗';
      const status = m.expected === null ? '—' : (m.pass ? '✅ PASS' : '❌ FAIL');
      
      if (m.expected !== null) {
        totalTested++;
        if (m.pass) totalPassed++;
      }

      console.log(`  ${m.method.padEnd(14)} | ${computed.padStart(8)} | ${expected.padStart(8)} | ${error.padStart(8)} | ${conv.padStart(4)} | ${String(m.iterations).padStart(4)} | ${status}`);
    }

    // Print slice diagnostic for failed tests
    const failedMethods = result.methods.filter(m => !m.pass && m.expected !== null);
    if (failedMethods.length > 0) {
      printSliceDiagnostic(profile, circle, 15);
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  SUMMARY: ${totalPassed}/${totalTested} tests passed (${(totalPassed / totalTested * 100).toFixed(0)}%)`);
  console.log(`  Tolerance: ±${TOLERANCE * 100}% per ISO 13374`);
  
  for (const r of results) {
    const icon = r.passRate >= 1 ? '✅' : r.passRate >= 0.5 ? '⚠️' : '❌';
    console.log(`  ${icon} ${r.name}: ${(r.passRate * 100).toFixed(0)}% pass`);
  }
  console.log(`${'═'.repeat(70)}`);

  // Exit with appropriate code
  process.exit(totalPassed === totalTested ? 0 : 1);
}

main();
