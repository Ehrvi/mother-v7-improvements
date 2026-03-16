/**
 * Script de teste local do DGM True Outer Loop
 * Roda 1 geração com benchmark mínimo (2 queries) pra validar o fluxo.
 * Imprime TODOS os proof hashes (SHA-256) de cada etapa.
 *
 * Usage: npx tsx scripts/test-dgm-local.ts
 */

import 'dotenv/config';
import { runSingleGeneration, getArchiveState, getEvolutionaryTree } from '../server/mother/dgm-true-outer-loop';
import type { BenchmarkQuery } from '../server/mother/dgm-true-outer-loop';

const MINI_BENCHMARK: BenchmarkQuery[] = [
  { id: 'test-001', query: 'O que é o Darwin Gödel Machine?', expectedMinQuality: 60, category: 'factual' },
  { id: 'test-002', query: 'Oi, tudo bem?', expectedMinQuality: 50, category: 'conversational' },
];

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  DGM TRUE OUTER LOOP — PROVA DE EXECUÇÃO END-TO-END         ║');
  console.log('║  Darwin Gödel Machine (arXiv:2505.22954, Zhang et al. 2025)  ║');
  console.log('║  1 geração, 2 queries benchmark, SHA-256 proof hashes        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const start = Date.now();

  try {
    console.log('━━━ FASE 1: EVOLUTIONARY LOOP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    const result = await runSingleGeneration({
      selfImproveSize: 1,
      selfImproveWorkers: 1,
      parentSelectionMethod: 'score_child_prop',
      archiveUpdateMethod: 'keep_all',
      benchmarkSmall: MINI_BENCHMARK,
      benchmarkMedium: [],
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('');
    console.log('━━━ FASE 2: RESULTADOS DA GERAÇÃO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  Geração:             ${result.generation}`);
    console.log(`  Mutações:            ${result.mutations.map(m => `${m.parentId}:${m.entryType}`).join(', ')}`);
    console.log(`  Filhos gerados:      ${result.childrenIds.length}`);
    console.log(`  Filhos compilados:   ${result.childrenCompiledIds.length}`);
    console.log(`  Archive size:        ${result.archiveSize}`);
    console.log(`  Melhor accuracy:     ${(result.bestAccuracy * 100).toFixed(1)}%`);
    console.log(`  Generation Hash:     ${result.generationHash}`);
    console.log(`  Tempo:               ${elapsed}s`);

    console.log('');
    console.log('━━━ FASE 3: ARCHIVE STATE + PROOF HASHES ━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    const archive = getArchiveState();
    console.log(`  Total variantes:     ${archive.size}`);
    console.log(`  Melhor variante:     ${archive.bestVariantId}`);
    console.log(`  Melhor accuracy:     ${(archive.bestAccuracy * 100).toFixed(1)}%`);
    console.log(`  Accuracy inicial:    ${(archive.initialAccuracy * 100).toFixed(1)}%`);
    console.log(`  Archive Hash:        ${archive.archiveHash}`);

    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────────────┐');
    console.log('  │ PROOF HASHES POR VARIANTE (SHA-256)                         │');
    console.log('  ├─────────────────────────────────────────────────────────────┤');
    for (const v of archive.variants) {
      console.log(`  │ Variant: ${v.id}`);
      console.log(`  │   Gen: ${v.generation} | Acc: ${(v.accuracy * 100).toFixed(1)}% | Parent: ${v.parentId || '(root)'}`);
      console.log(`  │   Strategy: ${v.strategy.slice(0, 60)}`);
      console.log(`  │   proofHash:        ${v.proofHash}`);
      if (v.diagnosisHash)    console.log(`  │   diagnosisHash:    ${v.diagnosisHash}`);
      if (v.modificationHash) console.log(`  │   modificationHash: ${v.modificationHash}`);
      if (v.benchmarkHash)    console.log(`  │   benchmarkHash:    ${v.benchmarkHash}`);
      console.log(`  │`);
    }
    console.log('  └─────────────────────────────────────────────────────────────┘');

    console.log('');
    console.log('━━━ FASE 4: ÁRVORE EVOLUTIVA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    const tree = getEvolutionaryTree();
    for (const node of tree) {
      const indent = '  '.repeat(node.generation + 1);
      const arrow = node.generation > 0 ? '└→ ' : '';
      console.log(`  ${indent}${arrow}${node.id} (gen ${node.generation}, acc ${(node.accuracy * 100).toFixed(1)}%, children=${node.children.length})`);
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║  EXECUÇÃO COMPLETA — ${elapsed}s                              `);
    console.log(`║  Archive Hash: ${archive.archiveHash.slice(0, 48)}...`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

  } catch (err) {
    console.error('\n[ERRO] DGM falhou:', err);
    process.exit(1);
  }
}

main();
