/**
 * Script de teste local do DGM True Outer Loop
 * Roda 1 geração com benchmark mínimo (2 queries) pra validar o fluxo.
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
  console.log('═══════════════════════════════════════════');
  console.log('  DGM TRUE OUTER LOOP — TESTE LOCAL');
  console.log('  1 geração, 2 queries benchmark');
  console.log('═══════════════════════════════════════════\n');

  const start = Date.now();

  try {
    console.log('[1/3] Rodando 1 geração DGM...\n');
    const result = await runSingleGeneration({
      selfImproveSize: 1,       // apenas 1 mutação pra ser rápido
      selfImproveWorkers: 1,
      parentSelectionMethod: 'score_child_prop',
      archiveUpdateMethod: 'keep_all',
      benchmarkSmall: MINI_BENCHMARK,
      benchmarkMedium: [],      // sem avaliação profunda
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('\n[2/3] Resultado da geração:');
    console.log(`  Geração:           ${result.generation}`);
    console.log(`  Mutações:          ${result.mutations.map(m => `${m.parentId}:${m.entryType}`).join(', ')}`);
    console.log(`  Filhos gerados:    ${result.childrenIds.length}`);
    console.log(`  Filhos compilados: ${result.childrenCompiledIds.length}`);
    console.log(`  Archive size:      ${result.archiveSize}`);
    console.log(`  Melhor accuracy:   ${(result.bestAccuracy * 100).toFixed(1)}%`);
    console.log(`  Tempo:             ${elapsed}s`);

    console.log('\n[3/3] Estado do archive:');
    const archive = getArchiveState();
    console.log(`  Total variantes:   ${archive.size}`);
    console.log(`  Melhor variante:   ${archive.bestVariantId} (${(archive.bestAccuracy * 100).toFixed(1)}%)`);
    console.log(`  Accuracy inicial:  ${(archive.initialAccuracy * 100).toFixed(1)}%`);

    const tree = getEvolutionaryTree();
    console.log(`\n  Árvore evolutiva:`);
    for (const node of tree) {
      const indent = '  '.repeat(node.generation + 2);
      console.log(`${indent}${node.id} (gen ${node.generation}, acc ${(node.accuracy * 100).toFixed(1)}%, ${node.children} filhos)`);
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(`  TESTE COMPLETO — ${elapsed}s`);
    console.log('═══════════════════════════════════════════');

  } catch (err) {
    console.error('\n[ERRO] DGM falhou:', err);
    process.exit(1);
  }
}

main();
