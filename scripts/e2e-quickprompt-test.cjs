/**
 * E2E QuickPrompt Test — Systematic Bug Hunt
 * Tests all 4 QuickPrompts + 4 edge cases via direct API call
 * 
 * Scientific basis: LLMAutoE2E (2025) — E2E testing through actual API
 * catches bugs that unit tests miss (streaming, LFSA routing, echo, verbosity)
 */
const http = require('http');

const TESTS = [
  // 4 QuickPrompts from QuickPrompts.tsx
  { id: 'Q1', name: 'Arquitetura Cognitiva', query: 'Explique sua arquitetura cognitiva de 8 camadas e como cada uma contribui para o processamento.', maxChars: 8000, maxMs: 90000 },
  { id: 'Q2', name: 'Darwin Godel Machine', query: 'O que é o Darwin Gödel Machine e como ele te permite evoluir autonomamente?', maxChars: 8000, maxMs: 90000 },
  { id: 'Q3', name: 'React Component', query: 'Me ajude a criar um novo componente React com TypeScript e testes unitários.', maxChars: 8000, maxMs: 90000 },
  { id: 'Q4', name: 'RAG Papers arXiv', query: 'Pesquise os últimos papers sobre retrieval-augmented generation no arXiv e faça uma síntese.', maxChars: 15000, maxMs: 120000 },
  // Edge cases
  { id: 'Q5', name: 'MICRO - Ola', query: 'Olá', maxChars: 2000, maxMs: 30000 },
  { id: 'Q6', name: 'SHORT - O que e TS', query: 'O que é TypeScript?', maxChars: 5000, maxMs: 45000 },
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
        
        // Extract streaming tokens
        const tokens = events.filter(e => e.includes('event: token')).map(e => {
          try { return JSON.parse(e.split('data: ')[1]).text || ''; } catch { return ''; }
        }).join('');
        
        // Extract response event
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
        
        const finalText = responseText || tokens;
        const queryLower = test.query.toLowerCase().slice(0, 30);
        
        // Assertions
        const results = {
          id: test.id,
          name: test.name,
          elapsed,
          chars: finalText.length,
          quality,
          model,
          tier,
          assertions: {
            noEcho: !finalText.toLowerCase().startsWith('# ' + queryLower),
            underMaxChars: finalText.length <= test.maxChars,
            underTimeout: elapsed <= test.maxMs,
            hasContent: finalText.trim().length > 20,
            qualityOk: quality === null || quality >= 60,
          }
        };
        
        const allPass = Object.values(results.assertions).every(v => v);
        const status = allPass ? '✅ PASS' : '❌ FAIL';
        
        console.log(`\n${status} | ${test.id}: ${test.name}`);
        console.log(`  Time: ${(elapsed/1000).toFixed(1)}s | Chars: ${finalText.length} | Q: ${quality || 'N/A'} | Model: ${model || 'N/A'} | Tier: ${tier || 'N/A'}`);
        
        for (const [key, val] of Object.entries(results.assertions)) {
          if (!val) console.log(`  ❌ FAILED: ${key}`);
        }
        
        // Show first 150 chars
        console.log(`  Preview: ${finalText.slice(0, 150).replace(/\n/g, ' ').trim()}...`);
        
        resolve(results);
      });
    });
    req.setTimeout(test.maxMs + 30000);
    req.on('error', e => {
      console.log(`\n❌ ERROR | ${test.id}: ${test.name} — ${e.message}`);
      resolve({ id: test.id, name: test.name, error: e.message, assertions: { noError: false } });
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' MOTHER E2E QuickPrompt Test — Systematic Bug Hunt');
  console.log(' Testing', TESTS.length, 'queries sequentially');
  console.log('═══════════════════════════════════════════════════════════');
  
  const results = [];
  for (const test of TESTS) {
    console.log(`\n⏳ Running ${test.id}: "${test.query.slice(0, 60)}..."`);
    const result = await testQuery(test);
    results.push(result);
  }
  
  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  let pass = 0, fail = 0;
  for (const r of results) {
    const allPass = r.assertions && Object.values(r.assertions).every(v => v);
    if (allPass) pass++; else fail++;
    const emoji = allPass ? '✅' : '❌';
    console.log(`  ${emoji} ${r.id}: ${r.name} (${r.elapsed ? (r.elapsed/1000).toFixed(1)+'s' : 'ERR'}, ${r.chars || 0} chars, Q=${r.quality || 'N/A'})`);
  }
  console.log(`\n  TOTAL: ${pass} PASS, ${fail} FAIL out of ${results.length}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main();
