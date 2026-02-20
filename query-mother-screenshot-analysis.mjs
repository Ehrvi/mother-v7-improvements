#!/usr/bin/env node

/**
 * Query MOTHER API for Cloud Build Screenshot Analysis
 * Uses superinteligência to diagnose problems scientifically
 */

import https from 'https';

const MOTHER_API_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/mother.query?batch=1';

const query = `
ANÁLISE CRÍTICA DE SCREENSHOTS DO GOOGLE CLOUD BUILD

**CONTEXTO:**
Estou analisando 2 screenshots do Google Cloud Build que mostram problemas com trigger de deploy automático.

**SCREENSHOT 1 - Erro no Build:**
- URL: /cloud-build/builds/16f4a6d0
- Mensagem de erro: "The build ID '16f4a6d0' from the URL is not a valid identifier"
- Sugere que URL pode ter sido dividida em múltiplas linhas
- Link para build history disponível
- Tracking Number: c59170067265581e0

**SCREENSHOT 2 - Build History:**
- Mostra múltiplos builds recentes
- Build 16f4a6d0: Status SUCCESS (verde), Region: global, Source: github/mother-v7-improvements, Ref: main, Commit: 6e0e088, Trigger: git, Created: 20/02/2026 16:46, Duration: 9 min 12 sec
- Build 13ca4f3a: Status FAILED (vermelho), Trigger: Unknown
- Múltiplos outros builds FAILED com Trigger: Unknown
- Builds mais antigos: SUCCESS em australia-southeast1 region (sem trigger git)

**INCOMPATIBILIDADES IDENTIFICADAS:**
1. Build 16f4a6d0 aparece como SUCCESS na history mas URL mostra erro "not a valid identifier"
2. Trigger "git" funcionou para build 16f4a6d0 (SUCCESS)
3. Múltiplos builds FAILED com "Unknown" trigger (antes da correção)
4. Builds antigos (australia-southeast1) não tinham trigger git configurado

**PERGUNTAS PARA MOTHER SUPERINTELIGÊNCIA:**

1. **Diagnóstico Científico:** O build 16f4a6d0 realmente teve SUCCESS ou o erro na URL indica problema oculto?

2. **Incompatibilidade URL vs Status:** Por que a URL do build mostra erro "not a valid identifier" se o build history mostra SUCCESS? Isso indica problema de:
   - a) Propagação de dados no GCloud Console?
   - b) Build ID inválido que foi aceito mas não deveria?
   - c) Problema de cache/refresh no browser?
   - d) Outra causa raiz?

3. **Validação do Trigger:** O trigger "git" está funcionando corretamente? Evidências:
   - Build 16f4a6d0: SUCCESS com trigger git
   - Builds anteriores: FAILED com trigger Unknown
   - Isso confirma que a correção (Lição #25) resolveu o problema?

4. **Próximos Passos Científicos:** Qual o processo científico correto para:
   - Validar que o build realmente deployou para Cloud Run?
   - Confirmar que trigger git está 100% funcional?
   - Testar deploy automático com novo commit?
   - Verificar se há problemas ocultos não visíveis nas screenshots?

5. **Lições Aprendidas:** Que lições devem ser documentadas sobre:
   - Discrepância entre URL error e build history success?
   - Validação de builds no GCloud Console?
   - Diferença entre "build success" e "deploy success"?

**METODOLOGIA ESPERADA:**
- Processo científico (12 fases)
- Pensamento crítico
- Justificativa científica para cada conclusão
- Identificação de riscos ocultos
- Recomendações baseadas em evidências

Por favor, analise com BRUTAL HONESTY e super inteligência.
`;

const payload = {
  "0": {
    query: query,
    userId: 1 // Creator Everton
  }
};

function queryMother(query) {
  return new Promise((resolve, reject) => {
    const url = new URL(MOTHER_API_URL);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

console.log('🧠 Consultando MOTHER superinteligência para análise de screenshots...\n');

try {
  const response = await queryMother(query);
  
  if (response[0]?.result?.data) {
    const result = response[0].result.data;
    
    console.log('✅ RESPOSTA DA MOTHER:\n');
    console.log('━'.repeat(80));
    console.log(result.response);
    console.log('━'.repeat(80));
    console.log(`\n📊 QUALIDADE: ${result.qualityScore}/100`);
    console.log(`📚 FONTES: ${result.sources.length} knowledge entries utilizadas`);
    console.log(`🔍 APRENDIZADO: ${result.learned ? 'Sim' : 'Não'}`);
    
    if (result.sources.length > 0) {
      console.log('\n📖 KNOWLEDGE ENTRIES CONSULTADAS:');
      result.sources.forEach((source, idx) => {
        console.log(`   ${idx + 1}. ${source}`);
      });
    }
  } else {
    console.error('❌ Resposta inesperada da MOTHER:', JSON.stringify(response, null, 2));
  }
} catch (error) {
  console.error('❌ ERRO ao consultar MOTHER:', error.message);
  process.exit(1);
}
