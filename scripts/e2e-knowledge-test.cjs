/**
 * E2E Knowledge Test — Domain-Specific Queries
 * Tests MOTHER's ability to answer specialized knowledge questions correctly
 * 
 * Scientific basis: HELM (Liang et al., 2022) — multi-domain evaluation
 * Covers: geotechnical/SHMS, AI architecture, coding, scientific, general
 */
const http = require('http');

const TESTS = [
  // ====== DOMAIN: Geotechnical / SHMS ======
  { id: 'GEO1', domain: 'Geotechnical', 
    query: 'O que é um piezômetro e como ele é usado no monitoramento de barragens?',
    expectedKeywords: ['pressão', 'água', 'poro', 'barragem', 'sensor', 'nível'],
    maxChars: 6000, maxMs: 90000 },
  { id: 'GEO2', domain: 'Geotechnical',
    query: 'Explique o conceito de fator de segurança em estabilidade de taludes.',
    expectedKeywords: ['resistência', 'cisalhamento', 'fator', 'segurança', 'deslizamento'],
    maxChars: 6000, maxMs: 90000 },
  
  // ====== DOMAIN: AI Architecture ======
  { id: 'AI1', domain: 'AI Architecture',
    query: 'O que é RAG (Retrieval-Augmented Generation) e quais são seus benefícios?',
    expectedKeywords: ['retrieval', 'generation', 'documento', 'contexto', 'alucinação'],
    maxChars: 6000, maxMs: 90000 },
  { id: 'AI2', domain: 'AI Architecture',
    query: 'Explique a diferença entre fine-tuning e RAG para customizar um LLM.',
    expectedKeywords: ['fine-tuning', 'treinamento', 'RAG', 'dados', 'custo'],
    maxChars: 6000, maxMs: 90000 },

  // ====== DOMAIN: Coding (TypeScript/React) ======
  { id: 'CODE1', domain: 'Coding',
    query: 'Como implementar um hook customizado no React para gerenciar estado de formulário?',
    expectedKeywords: ['useState', 'hook', 'return', 'function', 'onChange'],
    maxChars: 8000, maxMs: 90000 },
  { id: 'CODE2', domain: 'Coding',
    query: 'Qual a diferença entre interface e type no TypeScript?',
    expectedKeywords: ['interface', 'type', 'extend', 'declaration', 'merging'],
    maxChars: 5000, maxMs: 60000 },

  // ====== DOMAIN: Scientific Research ======
  { id: 'SCI1', domain: 'Scientific',
    query: 'O que é o mecanismo de atenção em Transformers e por que ele é importante?',
    expectedKeywords: ['query', 'key', 'value', 'softmax', 'self-attention', 'Vaswani'],
    maxChars: 6000, maxMs: 90000 },
  { id: 'SCI2', domain: 'Scientific',
    query: 'Explique o conceito de gradient descent e suas variantes (SGD, Adam).',
    expectedKeywords: ['gradient', 'learning rate', 'otimização', 'SGD', 'Adam', 'loss'],
    maxChars: 6000, maxMs: 90000 },

  // ====== DOMAIN: General / Reasoning ======
  { id: 'GEN1', domain: 'General',
    query: 'Se tenho 3 caixas e cada uma contém 5 bolas, quantas bolas tenho no total? Explique o raciocínio.',
    expectedKeywords: ['15', 'multiplicação', '3', '5'],
    maxChars: 3000, maxMs: 45000 },
  { id: 'GEN2', domain: 'General',
    query: 'Resuma a teoria da relatividade de Einstein em termos simples.',
    expectedKeywords: ['Einstein', 'luz', 'tempo', 'espaço', 'massa', 'energia'],
    maxChars: 5000, maxMs: 60000 },
];

async function testQuery(test) {
  return new Promise((resolve) => {
    const start = Date.now();
    const data = JSON.stringify({ query: test.query, useCache: false, conversationHistory: [] });
    const opts = {
      hostname: 'localhost', port: 3000, path: '/api/mother/stream',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    let body = '';
    const req = http.request(opts, res => {
      res.on('data', c => { body += c.toString() });
      res.on('end', () => {
        const elapsed = Date.now() - start;
        const events = body.split('\n\n').filter(e => e.trim());
        const tokens = events.filter(e => e.includes('event: token')).map(e => {
          try { return JSON.parse(e.split('data: ')[1]).text || ''; } catch { return ''; }
        }).join('');

        let quality = null, model = null, tier = null, responseText = null;
        const respEvents = events.filter(e => e.includes('event: response'));
        if (respEvents.length > 0) {
          try {
            const r = JSON.parse(respEvents[0].split('data: ')[1]);
            quality = r.quality?.qualityScore;
            model = r.modelName;
            tier = r.tier;
            responseText = r.response;
          } catch {}
        }

        const finalText = (responseText || tokens).toLowerCase();
        const isBusyMsg = finalText.includes('sobrecarregado') || finalText.includes('tente novamente');
        
        // Knowledge check: how many expected keywords appear in response?
        const keywordsFound = test.expectedKeywords.filter(kw => 
          finalText.includes(kw.toLowerCase())
        );
        const keywordHitRate = keywordsFound.length / test.expectedKeywords.length;

        const results = {
          id: test.id, domain: test.domain, elapsed,
          chars: finalText.length, quality, model, tier,
          keywordHitRate: Math.round(keywordHitRate * 100),
          keywordsFound: keywordsFound.length,
          keywordsTotal: test.expectedKeywords.length,
          isBusy: isBusyMsg,
          assertions: {
            notBusy: !isBusyMsg,
            noEcho: !finalText.startsWith('# ' + test.query.toLowerCase().slice(0, 20)),
            hasKeywords: keywordHitRate >= 0.3,  // at least 30% keywords must appear
            underMaxChars: finalText.length <= test.maxChars,
            underTimeout: elapsed <= test.maxMs,
          }
        };

        const allPass = Object.values(results.assertions).every(v => v);
        const status = allPass ? '✅ PASS' : '❌ FAIL';
        
        console.log(`\n${status} | ${test.id} [${test.domain}]: ${test.query.slice(0, 50)}...`);
        console.log(`  Time: ${(elapsed/1000).toFixed(1)}s | Chars: ${finalText.length} | Q: ${quality || 'N/A'} | Model: ${model || 'N/A'}`);
        console.log(`  Keywords: ${keywordsFound.length}/${test.expectedKeywords.length} (${Math.round(keywordHitRate*100)}%) [${keywordsFound.join(', ')}]`);
        
        for (const [key, val] of Object.entries(results.assertions)) {
          if (!val) console.log(`  ❌ FAILED: ${key}`);
        }
        if (isBusyMsg) console.log(`  ⚠️ SYSTEM BUSY — returned 'sobrecarregado' error`);

        resolve(results);
      });
    });
    req.setTimeout(test.maxMs + 30000);
    req.on('error', e => {
      console.log(`\n❌ ERROR | ${test.id}: ${e.message}`);
      resolve({ id: test.id, domain: test.domain, error: e.message, assertions: { noError: false } });
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' MOTHER E2E Knowledge Test — Domain-Specific Bug Hunt');
  console.log(' Testing', TESTS.length, 'domain-specific queries sequentially');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const results = [];
  for (const test of TESTS) {
    console.log(`\n⏳ [${test.domain}] "${test.query.slice(0, 60)}..."`);
    const result = await testQuery(test);
    results.push(result);
    // Small delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  // Summary by domain
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(' SUMMARY BY DOMAIN');
  console.log('═══════════════════════════════════════════════════════════════');
  const domains = [...new Set(TESTS.map(t => t.domain))];
  let totalPass = 0, totalFail = 0, totalBusy = 0;
  for (const domain of domains) {
    const domainResults = results.filter(r => r.domain === domain);
    console.log(`\n  📂 ${domain}:`);
    for (const r of domainResults) {
      const pass = r.assertions && Object.values(r.assertions).every(v => v);
      if (pass) totalPass++; else totalFail++;
      if (r.isBusy) totalBusy++;
      console.log(`    ${pass ? '✅' : '❌'} ${r.id}: ${(r.elapsed/1000).toFixed(1)}s, ${r.chars} chars, Q=${r.quality||'N/A'}, Keywords=${r.keywordHitRate||0}%${r.isBusy ? ' ⚠️BUSY' : ''}`);
    }
  }
  console.log(`\n  TOTAL: ${totalPass} PASS, ${totalFail} FAIL, ${totalBusy} BUSY out of ${results.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
