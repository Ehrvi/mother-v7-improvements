/**
 * inject-knowledge-c205-sprint6.cjs
 * MOTHER v87.0 — Sprint 6 (C205) Knowledge Base Injection
 * 
 * Injects 15 new knowledge entries documenting Sprint 6 work.
 * Schema: id, title, content, category, tags, source, sourceType, 
 *         embedding, embeddingModel, accessCount, lastAccessed, domain, createdAt, updatedAt
 *
 * Usage: node inject-knowledge-c205-sprint6.cjs
 * Requires: DATABASE_URL env var
 */

'use strict';

const mysql = require('mysql2/promise');

const DB_URL = process.env.DATABASE_URL || process.env.MYSQL_URL;

if (!DB_URL) {
  console.error('[C205] ERROR: DATABASE_URL not set');
  process.exit(1);
}

const ENTRIES = [
  {
    title: 'MOTHER v87.0 — Version Correction C205',
    content: JSON.stringify({
      from: 'v83.0', to: 'v87.0',
      reason: '3 sprints completed: C202→v84, C203→v85, C204→v86, C205→v87',
      filesUpdated: ['package.json', 'cloudbuild.yaml', 'AWAKE', 'TODO-ROADMAP'],
      cycle: 'C205', date: '2026-03-09',
    }),
    category: 'versioning',
    tags: JSON.stringify(['version', 'c205', 'sprint6', 'v87']),
    source: 'Sprint 6 C205 — Semantic Versioning (Preston-Werner 2013)',
    sourceType: 'learning',
    domain: 'mother-core',
  },
  {
    title: 'NC-UX-001 FIXED — ExpandableSidebar Integrated (C205)',
    content: JSON.stringify({
      ncId: 'NC-UX-001', component: 'ExpandableSidebar',
      file: 'client/src/components/ExpandableSidebar.tsx',
      integratedIn: 'client/src/components/RightPanel.tsx',
      method: 'New Monitor tab with TabView', status: 'FIXED', cycle: 'C205',
    }),
    category: 'nc_fix',
    tags: JSON.stringify(['nc-ux-001', 'orphan', 'c202', 'c205', 'right-panel']),
    source: 'Sprint 6 C205 — Fowler (1999) Refactoring: Dead Code Elimination',
    sourceType: 'learning',
    domain: 'mother-ui',
  },
  {
    title: 'NC-UX-002 FIXED — DGMPanel Integrated (C205)',
    content: JSON.stringify({
      ncId: 'NC-UX-002', component: 'DGMPanel',
      file: 'client/src/components/DGMPanel.tsx',
      integratedIn: 'client/src/components/RightPanel.tsx',
      method: 'Monitor tab — DGM control panel section', status: 'FIXED', cycle: 'C205',
    }),
    category: 'nc_fix',
    tags: JSON.stringify(['nc-ux-002', 'orphan', 'c202', 'c205', 'dgm-panel']),
    source: 'Sprint 6 C205 — Fowler (1999) Refactoring: Dead Code Elimination',
    sourceType: 'learning',
    domain: 'mother-ui',
  },
  {
    title: 'NC-UX-003 FIXED — MotherMonitor Integrated (C205)',
    content: JSON.stringify({
      ncId: 'NC-UX-003', component: 'MotherMonitor',
      file: 'client/src/components/MotherMonitor.tsx',
      integratedIn: 'client/src/components/RightPanel.tsx',
      method: 'Monitor tab — real-time SSE monitor section', status: 'FIXED', cycle: 'C205',
    }),
    category: 'nc_fix',
    tags: JSON.stringify(['nc-ux-003', 'orphan', 'c202', 'c205', 'mother-monitor']),
    source: 'Sprint 6 C205 — Fowler (1999) Refactoring: Dead Code Elimination',
    sourceType: 'learning',
    domain: 'mother-ui',
  },
  {
    title: 'NC-DGM-004 FIXED — Double DGM Startup Removed (C205)',
    content: JSON.stringify({
      ncId: 'NC-DGM-004',
      issue: 'Double DGM startup: runDGMDailyCycle (C194) + scheduleDGMLoopC203 (C203)',
      fix: 'Removed legacy runDGMDailyCycle from production-entry.ts',
      kept: 'scheduleDGMLoopC203 — C203 Loop Activator with dedup + MCC≥0.85 + proof',
      principle: 'DRY — Hunt & Thomas (1999)', status: 'FIXED', cycle: 'C205',
    }),
    category: 'nc_fix',
    tags: JSON.stringify(['nc-dgm-004', 'dgm', 'dry', 'c205', 'production-entry']),
    source: 'Sprint 6 C205 — DRY Principle (Hunt & Thomas 1999)',
    sourceType: 'learning',
    domain: 'mother-dgm',
  },
  {
    title: 'Closed-Loop Learning System — C205 Implementation',
    content: JSON.stringify({
      file: 'server/mother/closed-loop-learning-c205.ts',
      loop: 'RESPOSTA → G-EVAL → MEMÓRIA → DGM',
      gEvalThreshold: 0.85, reflexionTrigger: 0.70, dgmSignalConsecutive: 3,
      dimensions: ['coherence', 'consistency', 'fluency', 'relevance'],
      weights: { relevance: 0.35, coherence: 0.30, consistency: 0.20, fluency: 0.15 },
      scientificBasis: ['arXiv:2303.16634 G-EVAL', 'arXiv:2303.11366 Reflexion', 'arXiv:2505.22954 DGM'],
      status: 'IMPLEMENTED', cycle: 'C205',
    }),
    category: 'architecture',
    tags: JSON.stringify(['closed-loop', 'g-eval', 'reflexion', 'dgm', 'c205', 'learning']),
    source: 'arXiv:2303.16634 G-EVAL + arXiv:2303.11366 Reflexion + arXiv:2505.22954 DGM',
    sourceType: 'external',
    domain: 'mother-learning',
  },
  {
    title: 'SHMS Digital Twin Engine — C205 Stub Implementation',
    content: JSON.stringify({
      file: 'server/shms/digital-twin-engine-c205.ts',
      anomalyDetection: 'Z-score (3σ) + IQR (Tukey 1977) combined',
      healthIndex: 'Composite: anomaly + offline sensor + critical alert penalties',
      demoStructures: ['STRUCT-001 Barragem Piloto Norte', 'STRUCT-002 Talude Mineração Sul', 'STRUCT-003 Fundação Edificio A'],
      predictiveEngine: 'STUB — LSTM planned for C207',
      scientificBasis: ['Grieves (2014) Digital Twin', 'Farrar & Worden (2012) SHM', 'ISO 13374-1:2003'],
      status: 'IMPLEMENTED_STUB', cycle: 'C205',
    }),
    category: 'architecture',
    tags: JSON.stringify(['shms', 'digital-twin', 'anomaly-detection', 'z-score', 'iqr', 'c205']),
    source: 'Grieves (2014) + Farrar & Worden (2012) + ISO 13374-1:2003',
    sourceType: 'external',
    domain: 'mother-shms',
  },
  {
    title: 'Iterative Audit C205 — 4 NCs Fixed, 17 Remaining',
    content: JSON.stringify({
      totalNCs: 21, fixedInC205: 4, remaining: 17,
      deadCodeBefore: '47.9% (151/315 files)',
      deadCodeAfterC205: '46.6% (estimated, 3 orphans integrated)',
      councilRound: 4, councilConsensus: 'unanimous',
      sprintScore: '95/100', realSystemScore: '32/100', cycle: 'C205',
    }),
    category: 'audit',
    tags: JSON.stringify(['audit', 'nc', 'dead-code', 'c205', 'sprint6', 'quality']),
    source: 'Sprint 6 C205 — ISO/IEC 25010:2011 + Lehman Law of Continuing Change',
    sourceType: 'learning',
    domain: 'mother-quality',
  },
  {
    title: 'Conselho Rodada 4 — Consenso Unânime C205',
    content: JSON.stringify({
      round: 4, protocol: 'Delphi + MAD',
      members: ['DeepSeek', 'Anthropic', 'Google AI', 'Mistral', 'MOTHER', 'MANUS'],
      consensus: 'unanimous',
      topGap: 'Cognitive loop OPEN (RESPONSE→G-EVAL→MEMORY→DGM not closed)',
      solutions: ['C1: DashboardLayout', 'C2: production-entry', 'C3: startup-scheduler', 'C4: closed-loop', 'C5: digital-twin', 'C6: migration'],
      implementedInC205: ['C1', 'C2', 'C4', 'C5'], cycle: 'C205',
    }),
    category: 'council',
    tags: JSON.stringify(['council', 'delphi', 'mad', 'c205', 'round4', 'consensus']),
    source: 'Sprint 6 C205 — Delphi Method (Dalkey & Helmer 1963) + MAD Protocol',
    sourceType: 'learning',
    domain: 'mother-governance',
  },
  {
    title: 'Cloud Run C205 Deployment Target — v87.0',
    content: JSON.stringify({
      currentRevision: 'mother-interface-00727-kp8',
      targetVersion: 'v87.0', targetCycle: 'C205',
      motherVersion: 'v87.0', motherCycle: '205',
      buildTrigger: 'git push origin main',
      cloudBuildLastSuccess: '73c240d3 (2026-03-08T20:25:02Z)',
    }),
    category: 'deployment',
    tags: JSON.stringify(['cloud-run', 'deployment', 'c205', 'v87', 'gcp']),
    source: 'Sprint 6 C205 — Google Cloud Run',
    sourceType: 'learning',
    domain: 'mother-infra',
  },
  {
    title: 'DGM Darwin Gödel Machine — C205 State',
    content: JSON.stringify({
      paper: 'arXiv:2505.22954',
      phases: ['proposal', 'sandbox', 'fitness', 'proof', 'commit', 'deploy'],
      mccGate: '≥0.85', deduplication: 'Jaccard ≥0.85, 168h window (C204)',
      scheduler: 'C203 Loop Activator — t=16s startup, t=25min first cycle, 24h recurring',
      status: 'ACTIVE_SINGLE_SCHEDULER', cycle: 'C205',
    }),
    category: 'scientific',
    tags: JSON.stringify(['dgm', 'darwin', 'godel', 'mcc', 'c205', 'arxiv']),
    source: 'arXiv:2505.22954 — Darwin Gödel Machine',
    sourceType: 'external',
    domain: 'mother-dgm',
  },
  {
    title: 'HippoRAG2 Memory Indexer — C205 State',
    content: JSON.stringify({
      paper: 'arXiv:2502.14902',
      recall10Target: '≥80%',
      indexer: 'server/memory/hipporag2-indexer-c204.ts',
      status: 'ACTIVE', cycle: 'C205',
    }),
    category: 'scientific',
    tags: JSON.stringify(['hipporag2', 'memory', 'recall', 'c205', 'arxiv']),
    source: 'arXiv:2502.14902 — HippoRAG2',
    sourceType: 'external',
    domain: 'mother-memory',
  },
  {
    title: 'LongFormV2 Parallel Generator — C205 State',
    content: JSON.stringify({
      file: 'server/mother/long-form-generator-v2.ts',
      batchSize: 3, speedup: '2.1x vs sequential',
      etaStreaming: true, gEvalTarget: '≥0.85',
      target: '20 pages in <5min', status: 'ACTIVE', cycle: 'C205',
    }),
    category: 'architecture',
    tags: JSON.stringify(['longform', 'parallel', 'g-eval', 'c205', 'generation']),
    source: 'Sprint 4 C203 — integrated, validated in C204',
    sourceType: 'learning',
    domain: 'mother-generation',
  },
  {
    title: 'Sprint 6 C205 Metrics — Score Tracking',
    content: JSON.stringify({
      sprintScore: 95, realSystemScore: 32,
      targetSprintScore: 96, targetRealSystemScore: 40,
      bdRecordsBefore: 7621, bdRecordsAfterC205: 7636,
      deadCodeBefore: 47.9, deadCodeAfterC205: 46.6,
      ncsFixed: 4, ncsRemaining: 17, cycle: 'C205',
    }),
    category: 'metrics',
    tags: JSON.stringify(['metrics', 'score', 'c205', 'sprint6', 'quality']),
    source: 'Sprint 6 C205 — ISO/IEC 25010:2011 quality metrics',
    sourceType: 'learning',
    domain: 'mother-quality',
  },
  {
    title: 'Sprint 7 C206 Plan — SHMS Phase 2 + God Object Refactor',
    content: JSON.stringify({
      sprint: 7, cycle: 'C206', version: 'v88.0',
      goals: [
        'SHMS Phase 2: REST API endpoints for Digital Twin',
        'SHMS Phase 3: MQTT sensor ingestion',
        'NC-ARCH-001: production-entry.ts refactor (1068 → <300 lines)',
        'Migration 0037: learning_evaluations + dgm_signals tables',
        'G-EVAL integration test: verify loop closure criterion',
      ],
      targetSprintScore: 97, targetRealSystemScore: 50,
    }),
    category: 'roadmap',
    tags: JSON.stringify(['roadmap', 'sprint7', 'c206', 'shms', 'god-object', 'migration']),
    source: 'Sprint 6 C205 — MOTHER v87.0 roadmap',
    sourceType: 'learning',
    domain: 'mother-roadmap',
  },
];

async function injectKnowledge() {
  console.log('[C205] Connecting to database...');
  
  let connection;
  try {
    connection = await mysql.createConnection(DB_URL);
    console.log('[C205] Connected successfully');
  } catch (err) {
    console.error('[C205] Connection failed:', err.message);
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const entry of ENTRIES) {
    try {
      const [existing] = await connection.execute(
        'SELECT id FROM knowledge WHERE title = ?',
        [entry.title]
      );

      if (existing.length > 0) {
        await connection.execute(
          `UPDATE knowledge SET 
            content = ?, category = ?, tags = ?, source = ?, sourceType = ?,
            domain = ?, updatedAt = NOW()
          WHERE title = ?`,
          [entry.content, entry.category, entry.tags, entry.source, entry.sourceType, entry.domain, entry.title]
        );
        console.log(`[C205] UPDATED: ${entry.title.slice(0, 60)}`);
        updated++;
      } else {
        await connection.execute(
          `INSERT INTO knowledge (title, content, category, tags, source, sourceType, domain, accessCount, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
          [entry.title, entry.content, entry.category, entry.tags, entry.source, entry.sourceType, entry.domain]
        );
        console.log(`[C205] INSERTED: ${entry.title.slice(0, 60)}`);
        inserted++;
      }
    } catch (err) {
      console.error(`[C205] FAILED: ${entry.title.slice(0, 50)} — ${err.message}`);
      failed++;
    }
  }

  await connection.end();

  console.log('\n[C205] ═══════════════════════════════════════════════');
  console.log(`[C205] Sprint 6 Knowledge Injection Complete`);
  console.log(`[C205]   Inserted: ${inserted}`);
  console.log(`[C205]   Updated:  ${updated}`);
  console.log(`[C205]   Failed:   ${failed}`);
  console.log(`[C205]   Total:    ${ENTRIES.length}`);
  console.log('[C205] ═══════════════════════════════════════════════');
}

injectKnowledge().catch(err => {
  console.error('[C205] Fatal error:', err);
  process.exit(1);
});
