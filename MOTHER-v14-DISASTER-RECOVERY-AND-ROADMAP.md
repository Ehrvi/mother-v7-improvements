# MOTHER v14 - Disaster Recovery & Project Roadmap

**Autor**: Manus AI  
**Data**: 21 Fevereiro 2026  
**Versão**: 1.0  
**Projeto**: mothers-library-mcp  
**Owner**: Everton Luis Garcia (elgarcia.eng@gmail.com)

---

## 📋 Índice

1. [Restauração de Emergência](#1-restauração-de-emergência)
2. [Localização de Arquivos](#2-localização-de-arquivos)
3. [Cronograma Completo](#3-cronograma-completo)
4. [Procedimentos de Backup](#4-procedimentos-de-backup)
5. [Troubleshooting](#5-troubleshooting)

---

# 1. RESTAURAÇÃO DE EMERGÊNCIA

## 1.1. Cenário: Sistema em Produção Quebrado

### Passo 1: Autenticar no Google Cloud

```bash
# Criar arquivo de credenciais
cat > /tmp/gcloud-key.json << 'EOF'
{
  "type": "service_account",
  "project_id": "mothers-library-mcp",
  "private_key_id": "535c57895cc0668f1894c9e86e37819137ffdf42",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCyyWKDLTGOkdrg\nEeqiHBgh1mR9SDQMWH1eKmY/TX/FUYYEzEgShmEMpihZkUMY40dkpKm6VvBWDAt+\ndpeSslg7RBrzaIwALyyBxiJaP+rRV6EXsgiIZoyw6iQQ5mTaM/e42KDTCcl0pmMw\nPFD53KGOB6LDTI4Cpz+j+rOCaWt6R7Cv5ESAGLZ/WLoWIjjBrjLrElGCKVKOuG4m\n6taCTDIbqMoDCdsXjhQZw8QvTHvKGKMFmiAOy8aXvjqV4KIiuCCMRSrbIEjR2qJq\n9rnndgUXL6prBa9TJVpKxbwudeS/W4t90LHRdxwOo2di0/EiWWZe5o3uq7JzE9oo\nBKVKiSQHAgMBAAECggEAGwXAO4ZtqphWBi7/EUCAz0B50MvEficzz7NF4ASFLtw7\nDueXbyFbcs98YslHZHAZvtb6hl0Ul1TbueIP187X8iFBl4+yNWbr6bN6RrzJb5m4\nkf3JN2CUnDrPd7RzAt3+77PiXvNoPRbXABflv1Y/Htn9mlosTq9buZuvXSM06PbD\nAtq4BYE8kZXvV57LYUsvD4Iz122QerEZW0tItEq5nzYG6F6BHaGjexCMOH7y1hxS\nhw+ggQoPeCrJ1PnUD9TGeehjULXG1SSa5GNxXZftvg8dO71KYbUR13fyxcpM103V\njPUJ1kHEzXe+XL0wLlOxXB6EtuA0z+03M2d4yvqU2QKBgQDrE8tllaVaC7WjVuXu\nI9Y9RZN2jtBDF+PSwxcE4jurqHMJmTG6Hs5znqz42U8Wh/t56H1VeVsDlOqO0Jw+\nM3wUCayc3cgcWSzrFOqrOIkSgAr+vSrFUMcuOHjovrK60yZeQ5XDm1CfVEFFu1Oo\nNlDiNtGAuhhHaZR7rhO/E4WNuQKBgQDCswPZhYJjPYuFUfMdEFhEWZ98y/Nnj38t\neiqGugoyEf4445X0fYD280ow6l69/i2h+i4UVsDuKj7cJOZKYiRoCGHPkRs+rkSo\nkPnofA54yXCX6X11T0gS9nv1pe4TIBkw7bdPqZgBptgJh3dEbLpVJpluFc9zC520\n9gBz0RMfvwKBgHBDmcU/vCHOqcYBv/kEgFHuokfiWC9Sf2it5pZcfGa0IYwZ7xeV\nkr7ArpaBITX/ZueHUiO5uu9w9LuTgKpr5/uhyx93AxQWuk7iRFfUvhFpuNaC/KQS\nuaynJ4bvW2fBYvdti15JFC2jDTECDyesGOCPkWnKdcHU+CZAsgl0hzlxAoGAP/iL\nkkPgpHTLS8GyTGFbbxG3akykq+klEy8pm9yyjuMEkXKNiahW4EztmobXHDvQiIDn\n9PzQJTCyOKjTFauLZLckVAvMVNrzaiNASVfBdYRSP0eTViD3gGuGLR8YyyXnwQDK\nEx2Y+Sn1n6Pn1w6WZnXpQZde8uDlL1kIqwUN8IcCgYB/ch8ueKCWvKqsTitj2XhN\nkDz+BvP1pzC45Q3t1mo1HD3YCgP3PZZyqrqTEBzaJfNLuZjdKRz56Lc+6CzZJ4/a\nPyAUObP/xhUGgNJV2opQoOnRt9z6fDVn2E9117t690HPWn+fDuFH2rSs+iMr0h2W\n+dgrbC5/2V1zMvjkE9ufzQ==\n-----END PRIVATE KEY-----\n",
  "client_email": "mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com",
  "client_id": "109502166361648744659",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/mother-cloudrun-sa%40mothers-library-mcp.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
EOF

# Autenticar
gcloud auth activate-service-account --key-file=/tmp/gcloud-key.json
gcloud config set project mothers-library-mcp
```

### Passo 2: Listar Revisões Disponíveis

```bash
# Ver todas as revisões do Cloud Run
gcloud run revisions list \
  --service=mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format="table(
    metadata.name,
    status.conditions[0].status:label=READY,
    metadata.creationTimestamp.date('%Y-%m-%d %H:%M:%S'):label=CREATED,
    spec.containers[0].image.slice(0:80):label=IMAGE
  )"
```

**Revisões Conhecidas (Última Atualização: 21 Fev 2026)**:
- `mother-interface-00077-whv` - Phase 2 com health checks + backup (ATUAL)
- `mother-interface-00076-5jb` - Phase 1 com segurança básica (ESTÁVEL)
- Revisões anteriores disponíveis via comando acima

### Passo 3: Rollback para Última Versão Estável

#### Opção A: Rollback Rápido (100% tráfego para revisão anterior)

```bash
# Rollback para revisão específica (substitua REVISION_NAME)
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=mother-interface-00076-5jb=100 \
  --project=mothers-library-mcp

# Exemplo: Rollback para Phase 1 (última versão estável conhecida)
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=mother-interface-00076-5jb=100 \
  --project=mothers-library-mcp
```

#### Opção B: Rollback Gradual (Canary Deployment)

```bash
# 10% tráfego para nova versão, 90% para versão estável
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=mother-interface-00077-whv=10,mother-interface-00076-5jb=90 \
  --project=mothers-library-mcp

# Se tudo OK, aumentar gradualmente
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=mother-interface-00077-whv=50,mother-interface-00076-5jb=50 \
  --project=mothers-library-mcp

# Finalmente, 100% para nova versão
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=mother-interface-00077-whv=100 \
  --project=mothers-library-mcp
```

### Passo 4: Verificar Status Após Rollback

```bash
# Verificar serviço
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Testar health check (se disponível)
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.check

# Verificar logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mother-interface" \
  --limit=50 \
  --project=mothers-library-mcp
```

---

## 1.2. Cenário: Restaurar do GitHub

### Passo 1: Clonar Repositório

```bash
# Autenticar GitHub CLI (se necessário)
gh auth login

# Clonar repositório
git clone https://github.com/Ehrvi/mother-v7-improvements.git
cd mother-v7-improvements

# Ver commits recentes
git log --oneline -20

# Ver tags/releases
git tag -l
```

### Passo 2: Checkout para Versão Específica

```bash
# Opção 1: Checkout para commit específico
git checkout c77ea5b  # Phase 2 deployment

# Opção 2: Checkout para tag (se existir)
git checkout v14.0-phase2

# Opção 3: Voltar N commits
git checkout HEAD~5  # 5 commits atrás
```

### Passo 3: Deploy Manual para Cloud Run

```bash
# Build e deploy
gcloud run deploy mother-interface \
  --source=. \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=mysql://4fDvvKLu8Qp6wR2.root:xxxxxxxx@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/mother_v14,BACKUP_TOKEN=b7e365bfbf9fded0323a6c0d57007a8b779039be0da4b91430d38759db251880"
```

**IMPORTANTE**: Substitua `xxxxxxxx` pela senha real do TiDB Cloud.

---

## 1.3. Cenário: Restaurar do Google Drive

### Passo 1: Baixar Backup Mais Recente

```bash
# Listar backups disponíveis
rclone ls manus_google_drive:MOTHER-BACKUPS/ --config /home/ubuntu/.gdrive-rclone.ini

# Baixar backup mais recente
rclone copy \
  manus_google_drive:MOTHER-BACKUPS/mother-interface-20260220-081912/ \
  ./mother-restore/ \
  --config /home/ubuntu/.gdrive-rclone.ini \
  --progress

cd mother-restore
```

### Passo 2: Restaurar Dependências e Build

```bash
# Instalar dependências
pnpm install

# Build
pnpm build

# Testar localmente
pnpm dev
```

### Passo 3: Deploy para Cloud Run

```bash
# Deploy
gcloud run deploy mother-interface \
  --source=. \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --platform=managed \
  --allow-unauthenticated
```

---

## 1.4. Restauração do Banco de Dados

### Passo 1: Listar Backups Disponíveis

```bash
# Backups automáticos (se configurados)
ls -lh /path/to/backups/

# Ou do Google Drive
rclone ls manus_google_drive:MOTHER-v14-BACKUP/database/ --config /home/ubuntu/.gdrive-rclone.ini
```

### Passo 2: Restaurar Backup

```bash
# Baixar backup
rclone copy \
  manus_google_drive:MOTHER-v14-BACKUP/database/mother_backup_20260221.sql.gz \
  ./ \
  --config /home/ubuntu/.gdrive-rclone.ini

# Descompactar
gunzip mother_backup_20260221.sql.gz

# Restaurar para TiDB Cloud
mysql -h gateway01.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 4fDvvKLu8Qp6wR2.root \
  -p \
  mother_v14 < mother_backup_20260221.sql
```

---

# 2. LOCALIZAÇÃO DE ARQUIVOS

## 2.1. Arquivos Críticos no Google Drive

### Estrutura de Diretórios

```
manus_google_drive:
├── MOTHER-v7.0/
│   ├── auto-start-superinteligencia.sh
│   ├── MOTHER-V14-COMPLETE-PLAN.md
│   ├── test-mother-gcloud.sh
│   └── README.md
│
├── MOTHER-v14-BACKUP/
│   ├── components.json
│   ├── package.json
│   ├── tsconfig.json
│   └── [código completo do projeto]
│
├── MOTHER-BACKUPS/
│   └── mother-interface-20260220-081912/
│       └── [backup completo 20 Fev 2026]
│
├── IntellTech/
│   ├── INTELLTECH - Technical Description.pdf
│   ├── Integrated_Technical_Proposal_Fortescue_v4.3.1.docx
│   └── [documentação do projeto]
│
└── Manus_Knowledge/
    ├── metrics/
    ├── search_index/
    └── [base de conhecimento]
```

### Comandos para Acessar

```bash
# Configuração do rclone
rclone config file
# Output: /home/ubuntu/.gdrive-rclone.ini

# Listar arquivos
rclone ls manus_google_drive:MOTHER-v7.0/ --config /home/ubuntu/.gdrive-rclone.ini

# Baixar arquivo específico
rclone copy \
  manus_google_drive:MOTHER-v7.0/MOTHER-V14-COMPLETE-PLAN.md \
  ./ \
  --config /home/ubuntu/.gdrive-rclone.ini

# Baixar diretório inteiro
rclone copy \
  manus_google_drive:MOTHER-v14-BACKUP/ \
  ./mother-backup/ \
  --config /home/ubuntu/.gdrive-rclone.ini \
  --progress
```

## 2.2. Arquivos no GitHub

**Repositório**: https://github.com/Ehrvi/mother-v7-improvements.git

### Branches Importantes

- `main` - Versão de produção atual
- (outras branches se existirem)

### Commits Importantes

```bash
# Ver histórico
git log --oneline --graph --all -20

# Commits conhecidos:
# c77ea5b - Phase 2 deployment (21 Fev 2026)
# 4b0fbc6 - Phase 1 security (anterior)
```

### Arquivos Chave

```
mother-v7-improvements/
├── server/
│   ├── _core/index.ts           # Servidor principal
│   ├── middleware/
│   │   ├── rate-limit.ts        # Rate limiting
│   │   ├── input-validation.ts  # Validação de input
│   │   └── error-handler.ts     # Error handling
│   ├── lib/logger.ts            # Winston logging
│   ├── routers/
│   │   ├── health.ts            # Health checks
│   │   ├── backup.ts            # Backup endpoints
│   │   └── mother.ts            # MOTHER API
│   └── scripts/
│       └── backup-database.ts   # Script de backup
│
├── scripts/
│   ├── check-production-status.sh  # Monitoramento
│   └── monitor-deployment.sh       # Deploy monitoring
│
├── DEPLOYMENT-INSTRUCTIONS.md      # Instruções de deploy
├── CLOUD-SCHEDULER-SETUP.md        # Setup do scheduler
└── todo.md                         # Progresso do projeto
```

## 2.3. Arquivos Locais (Sandbox Manus)

### Localização no Projeto Manus

```bash
# Projeto principal
/home/ubuntu/mother-interface/

# Projeto compartilhado
/home/ubuntu/projects/intelltech-f1b1582b/

# Backups temporários
/home/ubuntu/mother-backups/

# Credenciais (temporário)
/tmp/gcloud-key.json
/tmp/backup-token.txt
```

### Comandos para Backup Local

```bash
# Criar backup completo
tar -czf mother-interface-$(date +%Y%m%d-%H%M%S).tar.gz \
  /home/ubuntu/mother-interface/ \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.git

# Upload para Google Drive
rclone copy \
  mother-interface-*.tar.gz \
  manus_google_drive:MOTHER-BACKUPS/ \
  --config /home/ubuntu/.gdrive-rclone.ini
```

---

# 3. CRONOGRAMA COMPLETO

## 3.1. Progresso Atual (21 Fev 2026)

### ✅ Fase 1: Critical Security (7/7 - 100% COMPLETO)

| # | Correção | Status | Data Conclusão |
|---|----------|--------|----------------|
| 1 | Rate limiting | ✅ | 20 Fev 2026 |
| 2 | Input validation | ✅ | 20 Fev 2026 |
| 3 | Database pooling | ✅ | 20 Fev 2026 |
| 4 | HTTPS enforcement | ✅ | 20 Fev 2026 |
| 5 | Security headers | ✅ | 20 Fev 2026 |
| 6 | Request size limits | ✅ | 20 Fev 2026 |
| 7 | Graceful shutdown | ✅ | 20 Fev 2026 |

**Tempo Real**: 14 horas  
**Checkpoint**: `19a4256b`

### ✅ Fase 2: High Priority Stability (4/7 - 57% COMPLETO)

| # | Correção | Status | Data Conclusão | Notas |
|---|----------|--------|----------------|-------|
| 8 | Logging framework | ✅ | 21 Fev 2026 | Winston + JSON |
| 9 | Secrets rotation | ⏭ SKIP | - | Requer AWS Secrets Manager |
| 10 | Backup automatizado | ✅ | 21 Fev 2026 | Cloud Scheduler |
| 11 | Health checks | ✅ | 21 Fev 2026 | Simple + Detailed |
| 12 | Monitoring (Prometheus) | ⏭ DEFER | - | Phase 3 |
| 13 | Circuit breaker | ⏭ DEFER | - | Phase 3 |
| 14 | Error handling global | ✅ | 21 Fev 2026 | TRPCError |

**Tempo Real**: 8 horas  
**Checkpoint**: `c77ea5b8`  
**Deploy**: Em progresso (Build ID: e8342130)

### 📊 Resumo Geral

- **Completo**: 11/35 correções (31%)
- **Tempo gasto**: 22 horas
- **Tempo restante estimado**: 72 horas
- **Progresso**: Fase 2 de 5

---

## 3.2. Fase 3: Performance Optimization (7 correções)

**Prioridade**: 🟡 MÉDIA  
**Tempo Estimado**: 24 horas  
**Data Início Prevista**: 22 Fev 2026  
**Data Conclusão Prevista**: 24 Fev 2026

| # | Correção | Tempo | Complexidade | Dependências |
|---|----------|-------|--------------|--------------|
| 15 | Redis caching | 4h | Média | Database pooling |
| 16 | Message queue (BullMQ) | 5h | Alta | Redis |
| 17 | Query optimization | 3h | Média | Database indexes |
| 18 | CDN setup (Cloudflare) | 2h | Baixa | - |
| 19 | Lazy loading | 3h | Média | - |
| 20 | Code splitting | 3h | Média | - |
| 21 | Image optimization | 2h | Baixa | - |
| 22 | Compression (gzip/brotli) | 2h | Baixa | - |

### Detalhamento

#### #15: Redis Caching (4h)

**Objetivo**: Cache de queries frequentes e sessões

**Implementação**:
```bash
# 1. Provisionar Redis no Google Cloud
gcloud redis instances create mother-cache \
  --size=1 \
  --region=australia-southeast1 \
  --tier=basic \
  --project=mothers-library-mcp

# 2. Instalar dependências
pnpm add ioredis @types/ioredis

# 3. Criar arquivo server/lib/redis.ts
# 4. Integrar com MOTHER query processing
# 5. Adicionar cache invalidation
# 6. Testes
```

**Métricas de Sucesso**:
- Cache hit rate ≥70%
- Latência reduzida em 50%
- Memory usage <100MB

#### #16: Message Queue - BullMQ (5h)

**Objetivo**: Processamento assíncrono de queries pesadas

**Implementação**:
```bash
# 1. Instalar BullMQ
pnpm add bullmq

# 2. Criar server/lib/queue.ts
# 3. Criar workers para processamento
# 4. Integrar com MOTHER tiers (gpt-4 queries → queue)
# 5. Dashboard de monitoramento
# 6. Testes
```

**Métricas de Sucesso**:
- 100% queries pesadas processadas via queue
- Zero timeouts em queries longas
- Throughput +200%

#### #17-22: Otimizações Adicionais

- **Query optimization**: Indexes no TiDB, query analysis
- **CDN**: Cloudflare para assets estáticos
- **Lazy loading**: React.lazy() para componentes
- **Code splitting**: Vite chunks otimizados
- **Image optimization**: WebP, responsive images
- **Compression**: gzip/brotli no Cloud Run

---

## 3.3. Fase 4: Developer Experience (8 correções)

**Prioridade**: 🟢 BAIXA  
**Tempo Estimado**: 28 horas  
**Data Início Prevista**: 25 Fev 2026  
**Data Conclusão Prevista**: 28 Fev 2026

| # | Correção | Tempo | Complexidade |
|---|----------|-------|--------------|
| 23 | API documentation (OpenAPI) | 4h | Média |
| 24 | JavaScript SDK | 6h | Alta |
| 25 | Python SDK | 6h | Alta |
| 26 | Webhook support | 4h | Média |
| 27 | Rate limit headers | 1h | Baixa |
| 28 | Error response standardization | 2h | Baixa |
| 29 | CORS configuration | 1h | Baixa |
| 30 | Request logging enhancement | 2h | Baixa |

### Detalhamento

#### #23: API Documentation (4h)

**Objetivo**: OpenAPI 3.0 spec completa

**Implementação**:
```bash
# 1. Instalar swagger
pnpm add swagger-ui-express @types/swagger-ui-express

# 2. Gerar spec do tRPC
# 3. Criar /api/docs endpoint
# 4. Publicar em docs.mother.ai
```

#### #24-25: SDKs (12h total)

**JavaScript SDK**:
```typescript
// npm install @mother/sdk
import { MotherClient } from '@mother/sdk';

const client = new MotherClient({ apiKey: 'xxx' });
const response = await client.query('Explain quantum computing');
```

**Python SDK**:
```python
# pip install mother-sdk
from mother import MotherClient

client = MotherClient(api_key='xxx')
response = client.query('Explain quantum computing')
```

---

## 3.4. Fase 5: Code Quality & Cleanup (6 correções)

**Prioridade**: 🟢 BAIXA  
**Tempo Estimado**: 20 horas  
**Data Início Prevista**: 1 Mar 2026  
**Data Conclusão Prevista**: 3 Mar 2026

| # | Correção | Tempo | Complexidade |
|---|----------|-------|--------------|
| 31 | Console.log cleanup | 2h | Baixa |
| 32 | TODO completion | 3h | Média |
| 33 | Type safety improvements | 4h | Média |
| 34 | Async error handling | 3h | Média |
| 35 | Promise rejection handling | 2h | Baixa |
| 36 | Memory leak fixes | 4h | Alta |
| 37 | Dead code removal | 2h | Baixa |

---

## 3.5. Cronograma Visual

```
FEVEREIRO 2026
═══════════════════════════════════════════════════════════════

Semana 3 (17-23 Fev)
─────────────────────
17-20 │ ████████████████████ │ Fase 1: Security (COMPLETO)
21    │ ██████████           │ Fase 2: Stability (PARCIAL)
22-23 │ ████████████████████ │ Fase 3: Performance (INÍCIO)

Semana 4 (24-29 Fev)
─────────────────────
24    │ ████████████████████ │ Fase 3: Performance (CONCLUSÃO)
25-28 │ ████████████████████ │ Fase 4: DevEx
29    │ ██████               │ Buffer

MARÇO 2026
═══════════════════════════════════════════════════════════════

Semana 1 (1-7 Mar)
─────────────────────
1-3   │ ████████████████████ │ Fase 5: Code Quality
4-5   │ ████████████████████ │ Testes finais + Documentação
6-7   │ ████████████████████ │ Deploy final + Monitoramento

TOTAL: 18 dias úteis (94 horas)
```

---

## 3.6. Milestones & Deliverables

### Milestone 1: Security Hardened (✅ COMPLETO)
**Data**: 20 Fev 2026  
**Deliverables**:
- ✅ Rate limiting ativo
- ✅ Input validation
- ✅ Database pooling
- ✅ HTTPS enforcement
- ✅ Security headers
- ✅ Checkpoint `19a4256b`

### Milestone 2: Production Ready (🔄 EM PROGRESSO)
**Data**: 22 Fev 2026  
**Deliverables**:
- ✅ Winston logging
- ✅ Health checks
- ✅ Automated backups
- ✅ Error handling
- 🔄 Cloud Scheduler configurado
- 🔄 Monitoring dashboard
- 🔄 Checkpoint `c77ea5b8` deployed

### Milestone 3: High Performance (📅 PLANEJADO)
**Data**: 24 Fev 2026  
**Deliverables**:
- Redis caching
- Message queue
- Query optimization
- CDN setup
- Code splitting
- Image optimization
- Latency <200ms (p95)
- Throughput >1000 req/s

### Milestone 4: Developer Friendly (📅 PLANEJADO)
**Data**: 28 Fev 2026  
**Deliverables**:
- OpenAPI documentation
- JavaScript SDK
- Python SDK
- Webhook support
- Standardized errors
- CORS configurado

### Milestone 5: Production Excellence (📅 PLANEJADO)
**Data**: 3 Mar 2026  
**Deliverables**:
- Zero console.logs
- 100% TODOs resolvidos
- Type safety 100%
- Zero memory leaks
- Code coverage ≥80%
- Performance benchmarks
- Final documentation

---

# 4. PROCEDIMENTOS DE BACKUP

## 4.1. Backup Automático (Configurado)

### Cloud Scheduler Job

**Nome**: mother-backup-daily  
**Schedule**: Todos os dias às 2:00 AM (Australia/Sydney)  
**Endpoint**: https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/backup.trigger  
**Token**: `b7e365bfbf9fded0323a6c0d57007a8b779039be0da4b91430d38759db251880`

### Verificar Status do Job

```bash
# Ver detalhes do job
gcloud scheduler jobs describe mother-backup-daily \
  --location=australia-southeast1 \
  --project=mothers-library-mcp

# Ver histórico de execuções
gcloud scheduler jobs list \
  --location=australia-southeast1 \
  --project=mothers-library-mcp
```

### Trigger Manual

```bash
# Executar backup agora
gcloud scheduler jobs run mother-backup-daily \
  --location=australia-southeast1 \
  --project=mothers-library-mcp

# Ou via curl
curl -X POST \
  https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/backup.trigger \
  -H "Content-Type: application/json" \
  -d '{"token":"b7e365bfbf9fded0323a6c0d57007a8b779039be0da4b91430d38759db251880"}'
```

## 4.2. Backup Manual do Código

### Para Google Drive

```bash
# Criar backup completo
cd /home/ubuntu/mother-interface
tar -czf mother-interface-$(date +%Y%m%d-%H%M%S).tar.gz \
  . \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.git \
  --exclude=logs

# Upload para Google Drive
rclone copy \
  mother-interface-*.tar.gz \
  manus_google_drive:MOTHER-BACKUPS/ \
  --config /home/ubuntu/.gdrive-rclone.ini \
  --progress
```

### Para GitHub

```bash
# Criar tag de release
git tag -a v14.0-phase2 -m "Phase 2: Stability improvements"
git push github v14.0-phase2

# Ou criar release no GitHub
gh release create v14.0-phase2 \
  --title "MOTHER v14.0 - Phase 2" \
  --notes "Stability improvements: logging, health checks, backups"
```

## 4.3. Backup do Banco de Dados

### Backup Manual

```bash
# Conectar ao TiDB Cloud e fazer dump
mysqldump \
  -h gateway01.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 4fDvvKLu8Qp6wR2.root \
  -p \
  --databases mother_v14 \
  --single-transaction \
  --quick \
  --lock-tables=false \
  > mother_backup_$(date +%Y%m%d_%H%M%S).sql

# Comprimir
gzip mother_backup_*.sql

# Upload para Google Drive
rclone copy \
  mother_backup_*.sql.gz \
  manus_google_drive:MOTHER-v14-BACKUP/database/ \
  --config /home/ubuntu/.gdrive-rclone.ini
```

### Verificar Backup

```bash
# Listar backups
rclone ls manus_google_drive:MOTHER-v14-BACKUP/database/ \
  --config /home/ubuntu/.gdrive-rclone.ini

# Verificar integridade
gunzip -t mother_backup_*.sql.gz
```

---

# 5. TROUBLESHOOTING

## 5.1. Problemas Comuns

### Problema: Build Falha no Cloud Run

**Sintomas**:
- Build status: FAILURE
- Erro: "npm install failed"

**Solução**:
```bash
# 1. Verificar logs do build
gcloud builds log <BUILD_ID> --project=mothers-library-mcp

# 2. Verificar package.json
cat package.json | grep -A 5 "dependencies"

# 3. Limpar cache e rebuild local
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build

# 4. Commit e push novamente
git add package.json pnpm-lock.yaml
git commit -m "fix: update dependencies"
git push github main
```

### Problema: Health Checks Retornam 404

**Sintomas**:
- `/api/trpc/health.check` retorna 404
- Erro: "No procedure found"

**Solução**:
```bash
# 1. Verificar se código foi deployado
gcloud run revisions list \
  --service=mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# 2. Verificar se arquivo existe no repositório
git ls-files | grep health.ts

# 3. Verificar se está registrado em routers.ts
cat server/routers.ts | grep health

# 4. Se não existe, fazer rollback ou re-deploy
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=<WORKING_REVISION>=100 \
  --project=mothers-library-mcp
```

### Problema: Backup Job Falha

**Sintomas**:
- Cloud Scheduler job status: FAILED
- Erro: 401 Unauthorized

**Solução**:
```bash
# 1. Verificar BACKUP_TOKEN
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format="yaml(spec.template.spec.containers[0].env)"

# 2. Atualizar token se necessário
BACKUP_TOKEN=$(openssl rand -hex 32)
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --update-env-vars=BACKUP_TOKEN=$BACKUP_TOKEN \
  --project=mothers-library-mcp

# 3. Atualizar Cloud Scheduler job
gcloud scheduler jobs update http mother-backup-daily \
  --location=australia-southeast1 \
  --message-body="{\"token\":\"${BACKUP_TOKEN}\"}" \
  --project=mothers-library-mcp

# 4. Testar
gcloud scheduler jobs run mother-backup-daily \
  --location=australia-southeast1 \
  --project=mothers-library-mcp
```

### Problema: Database Connection Failed

**Sintomas**:
- Erro: "ECONNREFUSED" ou "Access denied"
- Health check detailed mostra database: "unhealthy"

**Solução**:
```bash
# 1. Verificar DATABASE_URL
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format="yaml(spec.template.spec.containers[0].env)" | grep DATABASE

# 2. Testar conexão manual
mysql -h gateway01.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 4fDvvKLu8Qp6wR2.root \
  -p

# 3. Verificar IP whitelist no TiDB Cloud Console
# https://tidbcloud.com/console/clusters

# 4. Atualizar DATABASE_URL se necessário
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --update-env-vars=DATABASE_URL="mysql://..." \
  --project=mothers-library-mcp
```

## 5.2. Comandos de Diagnóstico

### Verificar Status Geral

```bash
# Status do serviço
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Logs recentes
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mother-interface" \
  --limit=100 \
  --project=mothers-library-mcp \
  --format="table(timestamp,severity,textPayload)"

# Métricas
gcloud monitoring time-series list \
  --filter='resource.type="cloud_run_revision" AND resource.labels.service_name="mother-interface"' \
  --project=mothers-library-mcp
```

### Verificar Health

```bash
# Simple health check
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.check

# Detailed health check
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.detailed | jq '.'

# Script de monitoramento completo
/home/ubuntu/mother-interface/scripts/check-production-status.sh
```

---

## 📞 Contatos de Emergência

**Owner**: Everton Luis Garcia  
**Email**: elgarcia.eng@gmail.com  
**GitHub**: @Ehrvi  

**Projeto Google Cloud**: mothers-library-mcp  
**Service Account**: mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com  

**Repositório GitHub**: https://github.com/Ehrvi/mother-v7-improvements.git  
**Production URL**: https://mother-interface-233196174701.australia-southeast1.run.app  

---

## 📚 Documentação Adicional

- **Deployment Instructions**: `DEPLOYMENT-INSTRUCTIONS.md`
- **Cloud Scheduler Setup**: `CLOUD-SCHEDULER-SETUP.md`
- **AI Automation Guide**: `MOTHER-v14-AI-AUTOMATION-GUIDE.md`
- **Project TODO**: `todo.md`
- **Google Drive**: `manus_google_drive:MOTHER-v7.0/`

---

**Última Atualização**: 21 Fevereiro 2026 04:50 UTC  
**Versão do Documento**: 1.0  
**Status do Projeto**: Phase 2 - 31% Complete (11/35 corrections)
