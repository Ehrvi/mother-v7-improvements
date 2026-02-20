# Volume 4: Deploy GCloud - Passo a Passo Absoluto

**Nível**: Intermediário  
**Tempo Estimado**: 2-3 horas  
**Pré-requisitos**: Conta Google Cloud, projeto criado  
**Autor**: Manus AI  
**Data**: 2026-02-20

---

## Índice

1. [Configuração Inicial GCloud](#configuração-inicial-gcloud)
2. [Preparar Aplicação para Deploy](#preparar-aplicação-para-deploy)
3. [Deploy para Cloud Run](#deploy-para-cloud-run)
4. [Configurar Domínio Customizado](#configurar-domínio-customizado)
5. [Monitoramento e Logs](#monitoramento-e-logs)
6. [Rollback e Disaster Recovery](#rollback-e-disaster-recovery)

---

## Configuração Inicial GCloud

### Passo 1: Instalar Google Cloud SDK

**macOS**:
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

**Linux (Ubuntu)**:
```bash
sudo apt-get update
sudo apt-get install google-cloud-sdk
gcloud init
```

**Windows**:
1. Baixar: https://cloud.google.com/sdk/docs/install
2. Executar instalador
3. Abrir "Google Cloud SDK Shell"
4. Rodar: `gcloud init`

### Passo 2: Autenticar

```bash
gcloud auth login
```

**O que acontece**:
1. Abre navegador
2. Selecione sua conta Google
3. Clique "Allow"
4. Volte ao terminal

**Verificar autenticação**:
```bash
gcloud auth list
```

**Saída esperada**:
```
Credentialed Accounts
ACTIVE  ACCOUNT
*       your-email@gmail.com
```

### Passo 3: Configurar Projeto

```bash
# Listar projetos existentes
gcloud projects list

# Selecionar projeto mothers-library-mcp
gcloud config set project mothers-library-mcp

# Verificar
gcloud config get-value project
```

**Saída esperada**:
```
mothers-library-mcp
```

### Passo 4: Habilitar APIs Necessárias

```bash
# Cloud Run API
gcloud services enable run.googleapis.com

# Cloud Build API
gcloud services enable cloudbuild.googleapis.com

# Container Registry API
gcloud services enable containerregistry.googleapis.com

# Artifact Registry API
gcloud services enable artifactregistry.googleapis.com

# Cloud SQL Admin API (se usar Cloud SQL)
gcloud services enable sqladmin.googleapis.com
```

**Tempo**: ~2-3 minutos para habilitar todas

### Passo 5: Configurar Região

```bash
# Listar regiões disponíveis
gcloud compute regions list

# Configurar região (Ásia - Singapura)
gcloud config set run/region asia-southeast1

# Verificar
gcloud config get-value run/region
```

**Regiões recomendadas**:
- **asia-southeast1** (Singapura): Melhor para Ásia
- **us-central1** (Iowa): Melhor para América do Norte
- **europe-west1** (Bélgica): Melhor para Europa

---

## Preparar Aplicação para Deploy

### Passo 1: Criar Dockerfile

```bash
cd /home/ubuntu/mother-interface
nano Dockerfile
```

**Conteúdo**:
```dockerfile
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY client/package.json ./client/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY client ./client
COPY shared ./shared
COPY drizzle ./drizzle

# Build frontend
RUN pnpm build

# Stage 2: Build backend
FROM node:22-alpine AS backend-builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies (production only)
RUN pnpm install --frozen-lockfile --prod

# Copy backend source
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle

# Build backend
RUN pnpm build:server

# Stage 3: Production image
FROM node:22-alpine

WORKDIR /app

# Install production dependencies
RUN apk add --no-cache \
    sqlite \
    git \
    rclone

# Copy built artifacts from previous stages
COPY --from=frontend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/server ./server
COPY --from=backend-builder /app/dist/server ./dist/server

# Copy other necessary files
COPY package.json ./
COPY drizzle ./drizzle
COPY shared ./shared

# Create knowledge directory
RUN mkdir -p /app/knowledge

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "dist/server/index.js"]
```

**Salvar**: Ctrl+O, Enter, Ctrl+X

### Passo 2: Criar .dockerignore

```bash
nano .dockerignore
```

**Conteúdo**:
```
node_modules
dist
.git
.env
.env.local
*.log
.DS_Store
coverage
.vscode
.idea
*.test.ts
*.test.js
.manus-logs
knowledge.db
knowledge.db-shm
knowledge.db-wal
```

### Passo 3: Criar cloudbuild.yaml

```bash
nano cloudbuild.yaml
```

**Conteúdo**:
```yaml
steps:
  # Step 1: Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/mother-interface:latest'
      - '.'
    timeout: '1200s'

  # Step 2: Push image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/mother-interface:latest'

  # Step 3: Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'mother-interface'
      - '--image=gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'
      - '--platform=managed'
      - '--region=asia-southeast1'
      - '--allow-unauthenticated'
      - '--memory=2Gi'
      - '--cpu=2'
      - '--timeout=300s'
      - '--max-instances=10'
      - '--min-instances=1'
      - '--set-env-vars=NODE_ENV=production'
      - '--set-secrets=DATABASE_URL=DATABASE_URL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,JWT_SECRET=JWT_SECRET:latest'

# Timeout for entire build
timeout: '2400s'

# Build options
options:
  machineType: 'E2_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY

# Images to push
images:
  - 'gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'
  - 'gcr.io/$PROJECT_ID/mother-interface:latest'
```

### Passo 4: Configurar Secrets no Secret Manager

```bash
# Criar secrets
echo -n "your-database-url" | gcloud secrets create DATABASE_URL --data-file=-
echo -n "your-openai-api-key" | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create JWT_SECRET --data-file=-

# Dar permissão para Cloud Run acessar secrets
PROJECT_NUMBER=$(gcloud projects describe mothers-library-mcp --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding OPENAI_API_KEY \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding JWT_SECRET \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Deploy para Cloud Run

### Método 1: Deploy Manual (Teste)

```bash
# Build image localmente
docker build -t gcr.io/mothers-library-mcp/mother-interface:test .

# Push para Container Registry
docker push gcr.io/mothers-library-mcp/mother-interface:test

# Deploy para Cloud Run
gcloud run deploy mother-interface \
  --image=gcr.io/mothers-library-mcp/mother-interface:test \
  --platform=managed \
  --region=asia-southeast1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300s \
  --max-instances=10 \
  --min-instances=1 \
  --set-env-vars=NODE_ENV=production \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,JWT_SECRET=JWT_SECRET:latest
```

**Tempo**: ~5-10 minutos

**Saída esperada**:
```
Deploying container to Cloud Run service [mother-interface] in project [mothers-library-mcp] region [asia-southeast1]
✓ Deploying new service... Done.
  ✓ Creating Revision...
  ✓ Routing traffic...
  ✓ Setting IAM Policy...
Done.
Service [mother-interface] revision [mother-interface-00001-abc] has been deployed and is serving 100 percent of traffic.
Service URL: https://mother-interface-abc123-as.a.run.app
```

### Método 2: Deploy via Cloud Build (Produção)

```bash
# Trigger build manualmente
gcloud builds submit --config=cloudbuild.yaml .
```

**Tempo**: ~10-15 minutos

**Acompanhar progresso**:
```bash
# Listar builds recentes
gcloud builds list --limit=5

# Ver logs de um build específico
gcloud builds log <BUILD_ID>
```

### Método 3: Deploy Automático via GitHub (CI/CD)

**Passo 1**: Conectar repositório GitHub ao Cloud Build

1. Acesse: https://console.cloud.google.com/cloud-build/triggers
2. Clique "Connect Repository"
3. Selecione "GitHub"
4. Autorize acesso
5. Selecione repositório: `Ehrvi/mother-v7-improvements`

**Passo 2**: Criar trigger

```bash
gcloud builds triggers create github \
  --repo-name=mother-v7-improvements \
  --repo-owner=Ehrvi \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --description="Deploy MOTHER v14 on push to main"
```

**Resultado**: Agora, todo push para `main` dispara deploy automático!

---

## Configurar Domínio Customizado

### Passo 1: Verificar Domínio

```bash
# Mapear domínio customizado para Cloud Run
gcloud run domain-mappings create \
  --service=mother-interface \
  --domain=mother.intelltech.com.br \
  --region=asia-southeast1
```

**Saída**:
```
Waiting for certificate provisioning. You must configure your DNS records for certificate issuance to begin.
```

### Passo 2: Configurar DNS

**Registrar**: Seu provedor de DNS (Cloudflare, GoDaddy, etc.)

**Adicionar records**:

| Type | Name | Value |
|------|------|-------|
| A | mother | 216.239.32.21 |
| A | mother | 216.239.34.21 |
| A | mother | 216.239.36.21 |
| A | mother | 216.239.38.21 |
| AAAA | mother | 2001:4860:4802:32::15 |
| AAAA | mother | 2001:4860:4802:34::15 |
| AAAA | mother | 2001:4860:4802:36::15 |
| AAAA | mother | 2001:4860:4802:38::15 |

**Tempo de propagação**: 5 minutos - 48 horas

### Passo 3: Verificar SSL

```bash
# Verificar status do certificado
gcloud run domain-mappings describe \
  --domain=mother.intelltech.com.br \
  --region=asia-southeast1
```

**Status esperado**:
```
status:
  certificate Status: ACTIVE
  url: https://mother.intelltech.com.br
```

---

## Monitoramento e Logs

### Ver Logs em Tempo Real

```bash
# Logs do Cloud Run
gcloud run services logs read mother-interface \
  --region=asia-southeast1 \
  --follow

# Filtrar por erro
gcloud run services logs read mother-interface \
  --region=asia-southeast1 \
  --filter="severity=ERROR"
```

### Criar Dashboard de Monitoramento

1. Acesse: https://console.cloud.google.com/monitoring
2. Clique "Dashboards" → "Create Dashboard"
3. Adicione widgets:
   - **Request count** (Metric: `run.googleapis.com/request_count`)
   - **Request latencies** (Metric: `run.googleapis.com/request_latencies`)
   - **Container CPU utilization** (Metric: `run.googleapis.com/container/cpu/utilizations`)
   - **Container memory utilization** (Metric: `run.googleapis.com/container/memory/utilizations`)

### Configurar Alertas

```bash
# Criar alerta para erro rate > 5%
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="MOTHER Error Rate Alert" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"'
```

---

## Rollback e Disaster Recovery

### Rollback para Versão Anterior

```bash
# Listar revisões
gcloud run revisions list \
  --service=mother-interface \
  --region=asia-southeast1

# Rollback para revisão específica
gcloud run services update-traffic mother-interface \
  --to-revisions=mother-interface-00001-abc=100 \
  --region=asia-southeast1
```

**Tempo**: ~30 segundos

### Backup de Database

```bash
# Backup manual do TiDB
# (Executar no servidor TiDB Cloud)
mysqldump -h your-tidb-host -u root -p your_database > backup-$(date +%Y%m%d).sql

# Upload para Google Cloud Storage
gsutil cp backup-$(date +%Y%m%d).sql gs://mothers-library-backups/
```

### Restore de Database

```bash
# Download backup
gsutil cp gs://mothers-library-backups/backup-20260220.sql .

# Restore
mysql -h your-tidb-host -u root -p your_database < backup-20260220.sql
```

---

## Checklist de Deploy

Antes de fazer deploy para produção:

- [ ] Todos os testes passando (`pnpm test`)
- [ ] Build local funcionando (`pnpm build`)
- [ ] Dockerfile testado localmente
- [ ] Secrets configurados no Secret Manager
- [ ] Database acessível do Cloud Run
- [ ] DNS configurado (se usar domínio customizado)
- [ ] Monitoramento configurado
- [ ] Alertas configurados
- [ ] Backup de database feito
- [ ] Plano de rollback documentado

---

## Custos Estimados

| Recurso | Configuração | Custo/mês (USD) |
|---------|-------------|-----------------|
| Cloud Run | 2 vCPU, 2GB RAM, 1 min instance | $25-30 |
| Cloud Build | 120 builds/mês | $0 (free tier) |
| Container Registry | 10GB storage | $1 |
| Secret Manager | 3 secrets | $0.18 |
| Load Balancer | (se usar) | $18 |
| **Total** | | **$26-49/mês** |

---

**Autor**: Manus AI  
**Data**: 2026-02-20  
**Versão**: 1.0
