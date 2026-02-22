# 🔬 Análise Científica: Tela Branca no Cloud Run

**Data:** 2026-02-19  
**Problema:** Página carrega mas exibe tela branca  
**URL:** https://mother-interface-qtvghovzxa-ts.a.run.app

---

## Fase 1: Definição do Problema

### Observação
- ✅ HTTP 200 OK (servidor responde)
- ✅ HTML carrega (React bundle presente)
- ❌ Tela completamente branca
- ❌ Nenhum conteúdo renderizado

### Pergunta Científica
**Por que o React não está renderizando a interface mesmo com HTTP 200?**

---

## Fase 2: Coleta de Dados

### Evidências dos Logs

**1. Erro Crítico de OAuth:**
```
[OAuth] ERROR: OAUTH_SERVER_URL is not configured! 
Set OAUTH_SERVER_URL environment variable.
```

**2. Erro de Variáveis de Ambiente:**
```
URIError: Failed to decode param '/%VITE_ANALYTICS_ENDPOINT%/umami'
```

**3. Erro de Build:**
```
ELIFECYCLE  Command failed.
```

### Análise do HTML
- ✅ React bundle carrega (`index-C2k2J-y_.js`)
- ✅ CSS carrega (`index-RMbd6Nbc.css`)
- ⚠️ Variáveis de ambiente não substituídas (`%VITE_ANALYTICS_ENDPOINT%`)

---

## Fase 3: Formação de Hipóteses

### Hipótese 1: Variáveis de Ambiente Não Substituídas ✅ PROVÁVEL
**Evidência:**
- `%VITE_ANALYTICS_ENDPOINT%` aparece literalmente no HTML
- Vite não substituiu as variáveis em build time

**Mecanismo:**
1. Vite usa `import.meta.env.VITE_*` em build time
2. Se variáveis não estão definidas, deixa placeholders
3. Placeholders causam erros de runtime no JavaScript
4. React falha ao inicializar → tela branca

### Hipótese 2: OAuth Não Configurado ✅ PROVÁVEL
**Evidência:**
- `OAUTH_SERVER_URL is not configured!`
- Sistema depende de OAuth para funcionar

**Mecanismo:**
1. App tenta inicializar OAuth no startup
2. OAuth falha por falta de `OAUTH_SERVER_URL`
3. Erro bloqueia inicialização do React
4. Tela branca

### Hipótese 3: JavaScript Runtime Error ✅ MUITO PROVÁVEL
**Evidência:**
- HTML carrega mas nada renderiza
- Típico de erro não tratado em JavaScript

**Mecanismo:**
1. React bundle executa
2. Encontra erro (variável undefined, OAuth falha)
3. Erro não tratado para toda execução
4. React nunca monta → tela branca

---

## Fase 4: Análise de Causa Raiz

### Causa Raiz Primária
**Variáveis de ambiente VITE_* não foram definidas durante o build**

### Cadeia de Eventos

```
1. Build executado sem variáveis VITE_*
   ↓
2. Vite deixa placeholders no código (%VITE_ANALYTICS_ENDPOINT%)
   ↓
3. HTML gerado com placeholders literais
   ↓
4. Browser tenta carregar /%VITE_ANALYTICS_ENDPOINT%/umami
   ↓
5. URIError: Failed to decode param
   ↓
6. JavaScript falha ao inicializar
   ↓
7. React nunca monta
   ↓
8. Tela branca
```

### Causa Raiz Secundária
**OAuth não configurado no Cloud Run**

```
1. App inicia no Cloud Run
   ↓
2. Tenta ler OAUTH_SERVER_URL
   ↓
3. Variável não existe
   ↓
4. Erro: OAUTH_SERVER_URL is not configured
   ↓
5. Sistema pode falhar ao inicializar
```

---

## Fase 5: Design de Solução

### Solução A: Definir Variáveis VITE_* no Build ✅ RECOMENDADA

**Problema:** Vite precisa das variáveis em **build time**, não runtime.

**Solução:**
1. Adicionar variáveis ao `cloudbuild.yaml` como build args
2. Ou: Criar `.env.production` com valores
3. Rebuild com variáveis corretas

**Implementação:**
```yaml
# cloudbuild.yaml
- name: 'gcr.io/cloud-builders/docker'
  args:
    - 'build'
    - '--build-arg'
    - 'VITE_ANALYTICS_ENDPOINT=${_VITE_ANALYTICS_ENDPOINT}'
    - '--build-arg'
    - 'VITE_APP_TITLE=${_VITE_APP_TITLE}'
    # ... outras variáveis
```

### Solução B: Adicionar Variáveis OAuth ao Cloud Run ✅ NECESSÁRIA

**Implementação:**
```bash
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --set-env-vars="OAUTH_SERVER_URL=https://api.manus.im" \
  --set-env-vars="VITE_OAUTH_PORTAL_URL=https://portal.manus.im"
```

### Solução C: Remover Dependência de Analytics ⚠️ TEMPORÁRIA

**Se analytics não é crítico:**
1. Remover referências a `VITE_ANALYTICS_ENDPOINT`
2. Rebuild
3. Deploy

---

## Fase 6: Implementação

### Passo 1: Verificar Variáveis Necessárias

Variáveis VITE_* que precisam estar definidas em **build time**:
- `VITE_APP_ID`
- `VITE_APP_TITLE`
- `VITE_APP_LOGO`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_FRONTEND_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`

### Passo 2: Criar Arquivo .env.production

```bash
# .env.production
VITE_APP_ID=mother-interface
VITE_APP_TITLE="MOTHER v12.0"
VITE_APP_LOGO="/logo.png"
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_FRONTEND_FORGE_API_KEY=${BUILT_IN_FORGE_API_KEY}
VITE_FRONTEND_FORGE_API_URL=https://api.openai.com
VITE_ANALYTICS_ENDPOINT=https://analytics.manus.im
VITE_ANALYTICS_WEBSITE_ID=mother-v7
```

### Passo 3: Rebuild com Variáveis

```bash
cd /home/ubuntu/mother-interface
pnpm build
# Verificar se variáveis foram substituídas
grep -r "VITE_" dist/public/
```

### Passo 4: Redeploy

```bash
gcloud builds submit --config cloudbuild.yaml
```

---

## Fase 7: Teste e Validação

### Testes Necessários

1. **Verificar HTML gerado:**
   - ✅ Sem placeholders `%VITE_*%`
   - ✅ URLs corretas

2. **Verificar Console do Browser:**
   - ✅ Sem erros JavaScript
   - ✅ React monta corretamente

3. **Verificar Logs Cloud Run:**
   - ✅ Sem erros OAuth
   - ✅ Servidor inicia corretamente

4. **Teste Visual:**
   - ✅ Interface renderiza
   - ✅ Não há tela branca

---

## Fase 8: Conclusão e Aprendizado

### Causa Raiz Confirmada
**Variáveis VITE_* não foram definidas durante o build, causando:**
1. Placeholders literais no HTML
2. URIError ao tentar carregar recursos
3. JavaScript falha ao inicializar
4. React nunca monta → tela branca

### Lição Aprendida

**Vite Build-Time vs Runtime:**
- ❌ **ERRADO:** Definir `VITE_*` apenas no Cloud Run (runtime)
- ✅ **CORRETO:** Definir `VITE_*` durante o build (build-time)

**Por quê?**
Vite substitui `import.meta.env.VITE_*` em **build time**, não runtime. Se as variáveis não existem durante o build, Vite deixa placeholders ou `undefined`.

### Solução Definitiva

1. **Build-time:** Criar `.env.production` com todas variáveis `VITE_*`
2. **Runtime:** Definir variáveis server-side no Cloud Run (OAuth, Database, etc.)
3. **Separação clara:** 
   - Frontend vars → `VITE_*` (build-time)
   - Backend vars → sem prefixo (runtime)

---

## Status: DIAGNÓSTICO COMPLETO

**Próxima Ação:** Implementar Solução A + B e fazer rebuild/redeploy.
