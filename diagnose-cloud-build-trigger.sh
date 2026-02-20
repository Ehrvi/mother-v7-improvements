#!/bin/bash

##
# Cloud Build Trigger Diagnostic Script
# Processo Científico: 12 Fases
##

set -e

echo "🔬 CLOUD BUILD TRIGGER - DIAGNÓSTICO CIENTÍFICO COMPLETO"
echo "========================================================================"
echo ""
echo "Data: $(date -Iseconds)"
echo "Método: Processo Científico (12 Fases)"
echo ""

# ============================================================================
# FASE 1: OBSERVAÇÃO
# ============================================================================

echo "## 🔬 FASE 1: OBSERVAÇÃO (Coleta de Dados)"
echo ""

echo "### 1.1 Trigger Configuration:"
gcloud builds triggers describe git --region=global --format=json > /tmp/trigger-config.json
cat /tmp/trigger-config.json | jq '{
  name: .name,
  id: .id,
  createTime: .createTime,
  github: {
    owner: .github.owner,
    repo: .github.name,
    branch: .github.push.branch
  },
  filename: .filename,
  serviceAccount: .serviceAccount
}'
echo ""

echo "### 1.2 Recent Builds:"
gcloud builds list --region=global --limit=5 --format="table(id,status,createTime,source.repoSource.commitSha)"
echo ""

echo "### 1.3 GitHub Repository Info:"
cd /home/ubuntu/mother-interface
echo "Current Branch: $(git branch --show-current)"
echo "Remote URL: $(git remote get-url origin)"
echo "Latest Commit: $(git log -1 --format='%H %s')"
echo ""

# ============================================================================
# FASE 2: QUESTIONAMENTO
# ============================================================================

echo "## 🔬 FASE 2: QUESTIONAMENTO"
echo ""
echo "### Perguntas Críticas:"
echo "1. Trigger está configurado para o repositório correto?"
echo "2. Branch pattern (^main$) está correto?"
echo "3. Webhook GitHub está ativo?"
echo "4. Service account tem permissões necessárias?"
echo "5. Por que build 16f4a6d0 triggou mas commits posteriores não?"
echo ""

# ============================================================================
# FASE 3: PESQUISA
# ============================================================================

echo "## 🔬 FASE 3: PESQUISA (Knowledge Base)"
echo ""
echo "### Fontes Consultadas:"
echo "- Lição #25: Cloud Build Trigger Configuration"
echo "- Lição #26: Cloud Build Trigger Validation Protocol"
echo "- Google Cloud Build Documentation"
echo "- GitHub Webhooks Documentation"
echo ""

# ============================================================================
# FASE 4: HIPÓTESE
# ============================================================================

echo "## 🔬 FASE 4: HIPÓTESE (com Justificativa Científica)"
echo ""

echo "### H1: Webhook GitHub não está configurado (Confidence: 85%)"
echo ""
echo "**Justificativa Científica:**"
echo "- Pattern observado: Build 16f4a6d0 triggou, commits posteriores não"
echo "- Build 16f4a6d0 pode ter sido manual (gcloud builds submit)"
echo "- Trigger criado em 2026-02-20T05:46:23 (mesmo horário do build)"
echo "- Webhook requer configuração manual no GitHub após criar trigger"
echo ""
echo "**Evidências:**"
echo "- Trigger existe e está configurado"
echo "- Branch pattern correto (^main$)"
echo "- Filename correto (cloudbuild.yaml)"
echo "- MAS: Commits cdb946af e 70aa28ad não triggaram builds"
echo ""

echo "### H2: Service Account sem permissões (Confidence: 40%)"
echo ""
echo "**Justificativa Científica:**"
echo "- Service account: mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com"
echo "- Pode não ter permissão para acessar GitHub"
echo "- Build 16f4a6d0 SUCCESS indica que SA tem permissões básicas"
echo "- Menos provável que H1"
echo ""

echo "### H3: Repositório incorreto (Confidence: 20%)"
echo ""
echo "**Justificativa Científica:**"
echo "- Trigger configurado para: Ehrvi/mother-v7-improvements"
echo "- Precisa verificar se commits foram para este repo"
echo "- Menos provável pois trigger foi criado recentemente"
echo ""

# ============================================================================
# FASE 5: EXPERIMENTO
# ============================================================================

echo "## 🔬 FASE 5: EXPERIMENTO (Validações)"
echo ""

echo "### Teste 1: Verificar GitHub Webhook"
echo "Comando: Acessar https://github.com/Ehrvi/mother-v7-improvements/settings/hooks"
echo "Expected: Webhook para Cloud Build deve estar listado"
echo "Status: MANUAL CHECK REQUIRED"
echo ""

echo "### Teste 2: Trigger Manual"
echo "Executando: gcloud builds triggers run git --region=global --branch=main"
echo ""

# Attempt manual trigger (may fail if webhook not configured)
gcloud builds triggers run git --region=global --branch=main 2>&1 || echo "❌ Manual trigger failed"

echo ""
echo "### Teste 3: Verificar Service Account Permissions"
gcloud projects get-iam-policy mothers-library-mcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com" \
  --format="table(bindings.role)" 2>&1 | head -20
echo ""

# ============================================================================
# FASE 6: COLETA DE DADOS
# ============================================================================

echo "## 🔬 FASE 6: COLETA DE DADOS"
echo ""
echo "Dados coletados salvos em:"
echo "- /tmp/trigger-config.json"
echo "- Output deste script"
echo ""

# ============================================================================
# FASE 7-8: ANÁLISE E CONCLUSÃO
# ============================================================================

echo "## 🔬 FASE 7-8: ANÁLISE E CONCLUSÃO"
echo ""
echo "### Análise:"
echo ""

TRIGGER_OWNER=$(cat /tmp/trigger-config.json | jq -r '.github.owner')
TRIGGER_REPO=$(cat /tmp/trigger-config.json | jq -r '.github.name')
TRIGGER_BRANCH=$(cat /tmp/trigger-config.json | jq -r '.github.push.branch')

GIT_REMOTE=$(git remote get-url origin)

echo "Trigger configurado para: $TRIGGER_OWNER/$TRIGGER_REPO (branch: $TRIGGER_BRANCH)"
echo "Git remote atual: $GIT_REMOTE"
echo ""

if [[ "$GIT_REMOTE" == *"$TRIGGER_REPO"* ]]; then
  echo "✅ Repositório MATCH"
else
  echo "❌ Repositório MISMATCH - CAUSA RAIZ IDENTIFICADA"
fi

echo ""
echo "### Conclusão:"
echo ""
echo "Baseado nas evidências coletadas:"
echo "1. Se repositório MATCH → H1 (Webhook não configurado) é mais provável"
echo "2. Se repositório MISMATCH → H3 (Repositório incorreto) é causa raiz"
echo ""

# ============================================================================
# FASE 9: COMUNICAÇÃO
# ============================================================================

echo "## 🔬 FASE 9: COMUNICAÇÃO (Recomendações)"
echo ""
echo "### Próximos Passos:"
echo ""
echo "**Se H1 (Webhook não configurado):**"
echo "1. Acessar GitHub: https://github.com/$TRIGGER_OWNER/$TRIGGER_REPO/settings/hooks"
echo "2. Verificar se webhook para Cloud Build existe"
echo "3. Se não existe: Recriar trigger OU configurar webhook manualmente"
echo ""
echo "**Se H3 (Repositório incorreto):**"
echo "1. Identificar repositório correto"
echo "2. Deletar trigger atual: gcloud builds triggers delete git --region=global"
echo "3. Recriar trigger para repositório correto"
echo ""
echo "**Validação Final (Lição #26):**"
echo "1. Fazer 3 commits consecutivos"
echo "2. Verificar que 3/3 builds iniciam automaticamente"
echo "3. Confidence: 3/3 SUCCESS = ESTÁVEL ✅"
echo ""

echo "========================================================================"
echo "✅ Diagnóstico Completo!"
echo ""
echo "Review output acima e execute próximos passos baseado em conclusão."
echo ""
