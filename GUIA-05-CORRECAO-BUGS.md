# Volume 5: Correção de Bugs - Identificação, Fix e Validação

**Nível**: Intermediário-Avançado  
**Tempo Estimado**: 1-2 horas  
**Autor**: Manus AI  
**Data**: 2026-02-20

---

## Índice

1. [Como Identificar Bugs](#como-identificar-bugs)
2. [Debugging Local vs Produção](#debugging-local-vs-produção)
3. [Bugs Comuns e Soluções](#bugs-comuns-e-soluções)
4. [Processo de Fix](#processo-de-fix)
5. [Prevenção de Regressões](#prevenção-de-regressões)

---

## Como Identificar Bugs

### Fontes de Bugs

1. **Logs do Servidor** (`.manus-logs/`)
2. **Browser Console** (F12 → Console)
3. **Monitoring Dashboard** (Google Cloud)
4. **Relatórios de Usuários**
5. **Testes Automatizados Falhando**

### Verificar Logs do Servidor

```bash
cd /home/ubuntu/mother-interface

# Ver últimas 100 linhas do dev server
tail -100 .manus-logs/devserver.log

# Filtrar apenas erros
grep -i "error\|exception\|failed" .manus-logs/devserver.log

# Ver logs do browser console
tail -100 .manus-logs/browserConsole.log

# Ver network requests falhando
grep "status.*[45][0-9][0-9]" .manus-logs/networkRequests.log
```

### Verificar Browser Console

1. Abrir aplicação no navegador
2. Pressionar F12
3. Ir para aba "Console"
4. Procurar por mensagens em vermelho (erros)

**Exemplo de erro**:
```
Uncaught TypeError: Cannot read property 'map' of undefined
    at Home.tsx:42
```

### Verificar Monitoring (Produção)

1. Acesse: https://console.cloud.google.com/monitoring
2. Selecione projeto: `mothers-library-mcp`
3. Vá para "Logs Explorer"
4. Filtrar por severity: `severity >= ERROR`

---

## Debugging Local vs Produção

### Debugging Local

**Vantagens**:
- Acesso direto ao código
- Pode adicionar `console.log()` e `debugger`
- Pode rodar testes unitários
- Pode usar VS Code debugger

**Como fazer**:

1. **Adicionar breakpoints no VS Code**:
   - Abrir arquivo `.ts`
   - Clicar na margem esquerda (linha vermelha aparece)
   - Pressionar F5 para iniciar debug

2. **Adicionar console.log()**:
   ```typescript
   export async function processQuery(query: string) {
     console.log('🔍 Processing query:', query);
     
     const complexity = await assessComplexity(query);
     console.log('📊 Complexity:', complexity);
     
     // ... resto do código
   }
   ```

3. **Usar debugger statement**:
   ```typescript
   export async function processQuery(query: string) {
     debugger; // Pausa execução aqui
     const complexity = await assessComplexity(query);
     // ...
   }
   ```

### Debugging Produção

**Limitações**:
- Não pode adicionar `console.log()` diretamente
- Não pode usar breakpoints
- Deve confiar em logs existentes

**Como fazer**:

1. **Ver logs em tempo real**:
   ```bash
   gcloud run services logs read mother-interface \
     --region=asia-southeast1 \
     --follow
   ```

2. **Filtrar logs por erro**:
   ```bash
   gcloud run services logs read mother-interface \
     --region=asia-southeast1 \
     --filter="severity=ERROR" \
     --limit=50
   ```

3. **Buscar por request específico**:
   ```bash
   gcloud run services logs read mother-interface \
     --region=asia-southeast1 \
     --filter='textPayload:"query-id-123"'
   ```

---

## Bugs Comuns e Soluções

### Bug 1: "Cannot read property 'X' of undefined"

**Causa**: Tentando acessar propriedade de objeto que é `undefined` ou `null`.

**Exemplo**:
```typescript
const user = await getUser(userId);
console.log(user.name); // ❌ Error se user for undefined
```

**Solução**: Usar optional chaining (`?.`) ou verificar antes:

```typescript
// Opção 1: Optional chaining
console.log(user?.name);

// Opção 2: Verificar antes
if (user) {
  console.log(user.name);
} else {
  console.log('User not found');
}

// Opção 3: Nullish coalescing
console.log(user?.name ?? 'Unknown');
```

### Bug 2: "CORS Error"

**Causa**: Frontend e backend em domínios diferentes sem CORS configurado.

**Sintoma**:
```
Access to fetch at 'https://api.example.com' from origin 'https://app.example.com' 
has been blocked by CORS policy
```

**Solução**: Adicionar headers CORS no backend:

```typescript
// server/_core/index.ts
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});
```

### Bug 3: "Database connection failed"

**Causa**: Credenciais incorretas, firewall, ou database offline.

**Sintoma**:
```
Error: connect ETIMEDOUT
    at TCPConnectWrap.afterConnect [as oncomplete]
```

**Solução**:

1. **Verificar credenciais**:
   ```bash
   echo $DATABASE_URL
   # Deve ser: mysql://user:pass@host:port/database
   ```

2. **Testar conexão manualmente**:
   ```bash
   mysql -h your-host -u your-user -p your-database
   ```

3. **Verificar firewall**:
   - TiDB Cloud: Adicionar IP do Cloud Run em "Security" → "IP Access List"

### Bug 4: "Memory limit exceeded"

**Causa**: Aplicação consumindo mais memória que o limite (2GB).

**Sintoma**:
```
Error: Process killed due to memory limit
```

**Solução**:

1. **Aumentar limite no Cloud Run**:
   ```bash
   gcloud run services update mother-interface \
     --memory=4Gi \
     --region=asia-southeast1
   ```

2. **Identificar memory leak**:
   ```typescript
   // Adicionar logging de memória
   setInterval(() => {
     const used = process.memoryUsage();
     console.log('Memory:', {
       rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
       heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`
     });
   }, 60000); // A cada 1 minuto
   ```

3. **Corrigir memory leak comum**:
   ```typescript
   // ❌ Memory leak: event listener não removido
   const listener = () => console.log('event');
   emitter.on('event', listener);
   
   // ✅ Correto: remover listener
   emitter.on('event', listener);
   // ... depois
   emitter.off('event', listener);
   ```

### Bug 5: "Rate limit exceeded" (OpenAI API)

**Causa**: Muitas requisições para OpenAI API em curto período.

**Sintoma**:
```
Error: Rate limit reached for requests
```

**Solução**:

1. **Implementar retry com exponential backoff**:
   ```typescript
   async function invokeLLMWithRetry(params: LLMParams, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await invokeLLM(params);
       } catch (err) {
         if (err.message.includes('rate limit') && i < maxRetries - 1) {
           const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
           await new Promise(resolve => setTimeout(resolve, delay));
           continue;
         }
         throw err;
       }
     }
   }
   ```

2. **Aumentar cache hit rate** (reduz chamadas à API):
   ```typescript
   // Aumentar TTL do cache de 24h para 7 dias
   const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
   ```

### Bug 6: "Infinite loop" ou "Max call stack size exceeded"

**Causa**: Recursão infinita ou loop sem condição de parada.

**Sintoma**:
```
RangeError: Maximum call stack size exceeded
```

**Solução**:

1. **Adicionar limite de recursão**:
   ```typescript
   async function processQuery(query: string, depth = 0) {
     if (depth > 10) {
       throw new Error('Max recursion depth exceeded');
     }
     
     // ... resto do código
     
     if (needsRetry) {
       return processQuery(query, depth + 1);
     }
   }
   ```

2. **Adicionar timeout**:
   ```typescript
   const timeout = setTimeout(() => {
     throw new Error('Operation timeout');
   }, 30000); // 30 segundos
   
   try {
     await processQuery(query);
   } finally {
     clearTimeout(timeout);
   }
   ```

---

## Processo de Fix

### Passo 1: Reproduzir Bug

**Objetivo**: Entender exatamente quando e como o bug acontece.

**Como fazer**:

1. **Ler relatório do bug**:
   - O que o usuário estava fazendo?
   - Qual foi o erro exato?
   - Em qual página/funcionalidade?

2. **Tentar reproduzir localmente**:
   ```bash
   cd /home/ubuntu/mother-interface
   pnpm dev
   # Abrir http://localhost:3000
   # Seguir passos do relatório
   ```

3. **Se não reproduzir localmente, tentar em produção**:
   - Acessar URL de produção
   - Seguir mesmos passos
   - Verificar logs

### Passo 2: Identificar Causa Raiz

**Técnicas**:

1. **Binary search** (dividir e conquistar):
   - Comentar metade do código
   - Bug ainda acontece? → Bug está na outra metade
   - Repetir até encontrar linha exata

2. **Add logging**:
   ```typescript
   console.log('1. Before database query');
   const result = await db.select().from(users);
   console.log('2. After database query:', result.length);
   ```

3. **Check git history**:
   ```bash
   # Ver últimos commits que tocaram no arquivo
   git log --oneline server/mother/core.ts
   
   # Ver diff de um commit específico
   git show abc123
   ```

### Passo 3: Criar Teste que Falha

**Objetivo**: Garantir que o fix realmente resolve o problema.

**Como fazer**:

```typescript
// server/mother/core.test.ts
describe('Bug #123: processQuery crashes on empty query', () => {
  it('should handle empty query gracefully', async () => {
    // Este teste deve FALHAR antes do fix
    const result = await processQuery('');
    
    expect(result).toBeDefined();
    expect(result.response).toContain('Please provide a query');
  });
});
```

**Rodar teste**:
```bash
pnpm test core
```

**Resultado esperado**: ❌ Teste falha (antes do fix)

### Passo 4: Implementar Fix

**Exemplo** (Bug #123):

```typescript
// server/mother/core.ts
export async function processQuery(query: string) {
  // ✅ FIX: Validar input antes de processar
  if (!query || query.trim().length === 0) {
    return {
      response: 'Please provide a query.',
      tier: 'none',
      quality: { score: 0, passed: false },
      // ... outros campos
    };
  }
  
  // ... resto do código original
}
```

### Passo 5: Validar Fix

**Rodar teste novamente**:
```bash
pnpm test core
```

**Resultado esperado**: ✅ Teste passa

**Testar manualmente**:
```bash
pnpm dev
# Abrir http://localhost:3000
# Tentar reproduzir bug
# Bug não deve mais acontecer
```

### Passo 6: Commit e Deploy

```bash
# Commit com mensagem descritiva
git add server/mother/core.ts server/mother/core.test.ts
git commit -m "Fix #123: Handle empty query gracefully

- Add input validation in processQuery()
- Return helpful error message instead of crashing
- Add test case to prevent regression"

# Push para GitHub
git push origin main

# Deploy automático via Cloud Build (se configurado)
# Ou deploy manual:
gcloud builds submit --config=cloudbuild.yaml .
```

### Passo 7: Verificar em Produção

```bash
# Aguardar deploy completar (~10 min)

# Testar em produção
curl -X POST 'https://your-domain/api/trpc/mother.query' \
  -H 'Content-Type: application/json' \
  -d '{"0":{"query":""}}'

# Verificar logs
gcloud run services logs read mother-interface \
  --region=asia-southeast1 \
  --limit=10
```

---

## Prevenção de Regressões

### 1. Sempre Adicionar Testes

**Para cada bug corrigido, adicionar teste**:

```typescript
describe('Bug fixes', () => {
  it('Bug #123: should handle empty query', async () => {
    // ...
  });
  
  it('Bug #124: should handle special characters', async () => {
    // ...
  });
  
  it('Bug #125: should handle very long queries', async () => {
    // ...
  });
});
```

### 2. Usar TypeScript Strict Mode

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

**Benefício**: Catch bugs em compile time, não runtime.

### 3. Code Review

**Antes de fazer merge**:

1. Outro desenvolvedor revisa código
2. Verifica se testes foram adicionados
3. Verifica se documentação foi atualizada
4. Aprova ou solicita mudanças

### 4. Continuous Integration (CI)

**GitHub Actions** (`.github/workflows/test.yml`):

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm test
```

**Benefício**: Testes rodam automaticamente em cada push.

### 5. Monitoring e Alertas

**Configurar alertas para**:

- Error rate > 5%
- Response time (p95) > 3s
- Memory usage > 80%
- CPU usage > 80%

**Quando alerta dispara**:

1. Verificar logs imediatamente
2. Identificar se é novo bug ou regressão
3. Se regressão, fazer rollback
4. Investigar causa raiz
5. Implementar fix
6. Deploy novamente

---

## Checklist de Correção de Bug

- [ ] Bug reproduzido localmente ou em produção
- [ ] Causa raiz identificada
- [ ] Teste que falha criado
- [ ] Fix implementado
- [ ] Teste passa
- [ ] Testado manualmente
- [ ] Code review feito
- [ ] Commit com mensagem descritiva
- [ ] Deploy para produção
- [ ] Verificado em produção
- [ ] Documentação atualizada (se necessário)
- [ ] Lição aprendida adicionada (LESSONS-LEARNED.md)

---

## Ferramentas Úteis

### 1. Chrome DevTools

**Network tab**: Ver todas requisições HTTP
**Console tab**: Ver erros JavaScript
**Sources tab**: Debugar código com breakpoints
**Performance tab**: Identificar bottlenecks

### 2. VS Code Extensions

- **ESLint**: Detecta erros de código
- **Prettier**: Formata código automaticamente
- **Error Lens**: Mostra erros inline
- **GitLens**: Ver histórico de git inline

### 3. Command Line Tools

```bash
# Buscar texto em todos arquivos
grep -r "searchTerm" server/

# Buscar e substituir
find server/ -name "*.ts" -exec sed -i 's/oldText/newText/g' {} +

# Ver diferença entre branches
git diff main..feature-branch

# Ver quem modificou cada linha (blame)
git blame server/mother/core.ts
```

---

**Autor**: Manus AI  
**Data**: 2026-02-20  
**Versão**: 1.0
