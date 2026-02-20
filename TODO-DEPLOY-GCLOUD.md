# To-Do List: Deploy MOTHER v14 em GCloud

**Projeto**: mothers-library-mcp  
**Data**: 2026-02-20  
**Status**: 🟡 EM PROGRESSO

---

## ✅ Fase 1: Preparação (COMPLETO)

- [x] Implementar Knowledge Acquisition Layer (500+ linhas)
- [x] Implementar Anna's Archive Integration (300+ linhas)
- [x] Integrar Knowledge Acquisition Layer com MOTHER Core
- [x] Criar testes unitários (550+ linhas, 40 test cases)
- [x] Documentar estado atual (ESTADO-ATUAL-MOTHER-V14.md)
- [x] Documentar 48 lições aprendidas (LESSONS-LEARNED.md)
- [x] Commit + push para GitHub (c2ec790a)

---

## 🟡 Fase 2: Backup e Documentação (EM PROGRESSO)

- [ ] Backup completo para Google Drive
  - [ ] Sync `/home/ubuntu/mother-interface` → `manus_google_drive:MOTHER-v14-BACKUP/`
  - [ ] Verificar sync completo (rclone check)
  - [ ] Documentar backup location

- [ ] Commit + push de TODOS documentos para GitHub
  - [ ] ESTADO-ATUAL-MOTHER-V14.md
  - [ ] TODO-DEPLOY-GCLOUD.md (este arquivo)
  - [ ] PLANO-DEPLOY-GCLOUD.md
  - [ ] Atualizar README.md com instruções de deploy
  - [ ] Git push para GitHub

---

## ⏳ Fase 3: Configuração GCloud (PENDENTE)

- [ ] Instalar Google Cloud SDK (se necessário)
  ```bash
  curl https://sdk.cloud.google.com | bash
  exec -l $SHELL
  gcloud init
  ```

- [ ] Configurar projeto GCloud
  ```bash
  gcloud config set project mothers-library-mcp
  gcloud config set compute/region australia-southeast1
  ```

- [ ] Habilitar APIs necessárias
  ```bash
  gcloud services enable cloudbuild.googleapis.com
  gcloud services enable run.googleapis.com
  gcloud services enable secretmanager.googleapis.com
  ```

- [ ] Configurar secrets no Secret Manager
  ```bash
  # DATABASE_URL
  echo -n "mysql://..." | gcloud secrets create DATABASE_URL --data-file=-
  
  # JWT_SECRET
  echo -n "..." | gcloud secrets create JWT_SECRET --data-file=-
  
  # OPENAI_API_KEY
  echo -n "..." | gcloud secrets create OPENAI_API_KEY --data-file=-
  
  # OAUTH_SERVER_URL
  echo -n "https://api.manus.im" | gcloud secrets create OAUTH_SERVER_URL --data-file=-
  
  # VITE_OAUTH_PORTAL_URL
  echo -n "https://auth.manus.im" | gcloud secrets create VITE_OAUTH_PORTAL_URL --data-file=-
  
  # OWNER_OPEN_ID
  echo -n "Mtbbro8K87S6VUA2A2hq6X" | gcloud secrets create OWNER_OPEN_ID --data-file=-
  
  # OWNER_NAME
  echo -n "Everton Luis Garcia" | gcloud secrets create OWNER_NAME --data-file=-
  
  # BUILT_IN_FORGE_API_URL
  echo -n "https://api.manus.im" | gcloud secrets create BUILT_IN_FORGE_API_URL --data-file=-
  
  # BUILT_IN_FORGE_API_KEY
  echo -n "..." | gcloud secrets create BUILT_IN_FORGE_API_KEY --data-file=-
  ```

---

## ⏳ Fase 4: Criar Arquivos de Deploy (PENDENTE)

- [ ] Criar `Dockerfile`
  - [ ] Multi-stage build (build → production)
  - [ ] Node.js 22 base image
  - [ ] Install dependencies (pnpm)
  - [ ] Build frontend (vite build)
  - [ ] Build backend (esbuild)
  - [ ] Expose port 8080 (Cloud Run default)
  - [ ] Health check endpoint
  - [ ] Optimizar tamanho da imagem (<500MB)

- [ ] Criar `cloudbuild.yaml`
  - [ ] Build Docker image
  - [ ] Push para Container Registry
  - [ ] Deploy para Cloud Run
  - [ ] Configure secrets
  - [ ] Configure environment variables
  - [ ] Configure service account
  - [ ] Configure health checks
  - [ ] Configure auto-scaling (min: 1, max: 10)

- [ ] Criar `.dockerignore`
  - [ ] node_modules
  - [ ] .git
  - [ ] dist
  - [ ] *.log
  - [ ] .env*
  - [ ] *.test.ts
  - [ ] coverage

- [ ] Criar `.gcloudignore`
  - [ ] node_modules
  - [ ] .git
  - [ ] *.log
  - [ ] .env*

---

## ⏳ Fase 5: Executar Deploy (PENDENTE)

- [ ] Build e deploy via Cloud Build
  ```bash
  gcloud builds submit --config cloudbuild.yaml
  ```

- [ ] Aguardar build completo (5-10 minutos)

- [ ] Verificar deploy success
  ```bash
  gcloud run services list --region australia-southeast1
  ```

- [ ] Obter URL do serviço
  ```bash
  gcloud run services describe mother-interface \
    --region australia-southeast1 \
    --format 'value(status.url)'
  ```

---

## ⏳ Fase 6: Testes Automatizados (PENDENTE)

- [ ] Health check
  ```bash
  curl https://[SERVICE_URL]/health
  # Expected: {"status": "ok"}
  ```

- [ ] Test MOTHER query endpoint
  ```bash
  curl -X POST https://[SERVICE_URL]/api/trpc/mother.query?batch=1 \
    -H "Content-Type: application/json" \
    -d '{"0":{"query":"Hello MOTHER v14"}}'
  ```

- [ ] Test authentication
  - [ ] Acessar URL no navegador
  - [ ] Fazer login via Manus OAuth
  - [ ] Verificar sessão persistente

- [ ] Test Knowledge Acquisition Layer
  - [ ] Adicionar conceito via interface
  - [ ] Fazer query relacionada
  - [ ] Verificar se conceito aparece no contexto

- [ ] Test cross-task knowledge retention
  - [ ] Query 1: "Remember: MOTHER v14 is deployed"
  - [ ] Query 2: "What do you remember about MOTHER v14?"
  - [ ] Verificar se conhecimento persiste

- [ ] Load testing (opcional)
  ```bash
  ab -n 100 -c 10 https://[SERVICE_URL]/health
  ```

---

## ⏳ Fase 7: Rollback Strategy (SE NECESSÁRIO)

- [ ] Se deploy falhar:
  1. Verificar logs
     ```bash
     gcloud run services logs read mother-interface \
       --region australia-southeast1 \
       --limit 100
     ```
  
  2. Identificar erro
  
  3. Corrigir localmente
  
  4. Testar localmente
     ```bash
     pnpm dev
     pnpm test
     ```
  
  5. Commit + push correção
  
  6. Re-executar deploy
     ```bash
     gcloud builds submit --config cloudbuild.yaml
     ```
  
  7. Repetir até success

- [ ] Se deploy success mas app quebrado:
  1. Rollback para versão anterior
     ```bash
     gcloud run services update-traffic mother-interface \
       --region australia-southeast1 \
       --to-revisions [PREVIOUS_REVISION]=100
     ```
  
  2. Investigar problema
  
  3. Corrigir + re-deploy

---

## ⏳ Fase 8: Pós-Deploy (PENDENTE)

- [ ] Configurar custom domain (se necessário)
  ```bash
  gcloud run domain-mappings create \
    --service mother-interface \
    --domain mother.intelltech.com.br \
    --region australia-southeast1
  ```

- [ ] Configurar SSL certificate (automático via Cloud Run)

- [ ] Configurar monitoring
  - [ ] Cloud Monitoring dashboard
  - [ ] Alertas de uptime
  - [ ] Alertas de erro rate
  - [ ] Alertas de latência

- [ ] Configurar logging
  - [ ] Cloud Logging filters
  - [ ] Log retention policy
  - [ ] Log-based metrics

- [ ] Atualizar documentação
  - [ ] README.md com URL de produção
  - [ ] ESTADO-ATUAL-MOTHER-V14.md com métricas de produção
  - [ ] LESSONS-LEARNED.md com Lição #49 (Deploy GCloud)

- [ ] Commit + push documentação final
  ```bash
  git add .
  git commit -m "Lição #49: Deploy GCloud Complete"
  git push github main
  ```

---

## ⏳ Fase 9: Validação Final (PENDENTE)

- [ ] Verificar uptime (24 horas)
- [ ] Verificar response time (p95 <3s)
- [ ] Verificar cache hit rate (>35%)
- [ ] Verificar cost reduction (>80%)
- [ ] Verificar quality score (avg >90/100)
- [ ] Verificar cross-task knowledge retention
- [ ] Verificar lesson application tracking

---

## Checklist Rápido

### Pré-Deploy
- [x] Código completo e testado
- [x] Documentação atualizada
- [ ] Backup completo
- [ ] Secrets configurados

### Deploy
- [ ] Dockerfile criado
- [ ] cloudbuild.yaml criado
- [ ] Build success
- [ ] Deploy success

### Pós-Deploy
- [ ] Health check OK
- [ ] Authentication OK
- [ ] Knowledge retention OK
- [ ] Monitoring configurado
- [ ] Documentação atualizada

---

## Estimativas de Tempo

| Fase | Tempo Estimado |
|------|----------------|
| Fase 2: Backup e Documentação | 30 minutos |
| Fase 3: Configuração GCloud | 30 minutos |
| Fase 4: Criar Arquivos de Deploy | 1 hora |
| Fase 5: Executar Deploy | 15 minutos |
| Fase 6: Testes Automatizados | 30 minutos |
| Fase 7: Rollback (se necessário) | 1-2 horas |
| Fase 8: Pós-Deploy | 1 hora |
| Fase 9: Validação Final | 24 horas |
| **TOTAL** | **4-5 horas + 24h validação** |

---

## Notas

- **Region**: australia-southeast1 (Sydney) escolhida por proximidade geográfica
- **Auto-scaling**: min 1, max 10 instances
- **Memory**: 2GB por instance (recomendado para Node.js + SQLite)
- **CPU**: 2 vCPU por instance
- **Timeout**: 300s (5 minutos) para queries complexas
- **Concurrency**: 80 requests por instance

---

**Status Atual**: 🟡 Fase 2 em progresso (Backup e Documentação)

**Próximo Passo**: Executar backup completo para Google Drive
