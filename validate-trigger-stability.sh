#!/bin/bash

##
# Cloud Build Trigger Stability Validation Script
# Tests trigger with 3 consecutive commits (Lição #26 Protocol)
##

set -e

echo "🔬 VALIDAÇÃO DE ESTABILIDADE DO CLOUD BUILD TRIGGER"
echo "=================================================="
echo ""
echo "Protocol: Lição #26 - Cloud Build Trigger Validation"
echo "Método: 3 commits consecutivos (sample size mínimo)"
echo "Critério de Sucesso: 3/3 builds SUCCESS"
echo ""

cd /home/ubuntu/mother-interface

# Test 1/3
echo "📝 TEST 1/3: Creating first test commit..."
echo "# Cloud Build Trigger Validation Test 1/3" >> CLOUD-BUILD-TEST.md
echo "Timestamp: $(date -Iseconds)" >> CLOUD-BUILD-TEST.md
echo "" >> CLOUD-BUILD-TEST.md

git add CLOUD-BUILD-TEST.md
git commit -m "test: Validate trigger stability (1/3)"
git push origin main

echo "✅ Commit 1/3 pushed"
echo "⏳ Aguardando 45 segundos para build iniciar..."
sleep 45

BUILD1=$(gcloud builds list --region=global --limit=1 --format="value(id,status,createTime)" 2>&1)
echo "📊 Build 1/3: $BUILD1"
echo ""

# Test 2/3
echo "📝 TEST 2/3: Creating second test commit..."
echo "# Cloud Build Trigger Validation Test 2/3" >> CLOUD-BUILD-TEST.md
echo "Timestamp: $(date -Iseconds)" >> CLOUD-BUILD-TEST.md
echo "" >> CLOUD-BUILD-TEST.md

git add CLOUD-BUILD-TEST.md
git commit -m "test: Validate trigger stability (2/3)"
git push origin main

echo "✅ Commit 2/3 pushed"
echo "⏳ Aguardando 45 segundos para build iniciar..."
sleep 45

BUILD2=$(gcloud builds list --region=global --limit=1 --format="value(id,status,createTime)" 2>&1)
echo "📊 Build 2/3: $BUILD2"
echo ""

# Test 3/3
echo "📝 TEST 3/3: Creating third test commit..."
echo "# Cloud Build Trigger Validation Test 3/3" >> CLOUD-BUILD-TEST.md
echo "Timestamp: $(date -Iseconds)" >> CLOUD-BUILD-TEST.md
echo "" >> CLOUD-BUILD-TEST.md

git add CLOUD-BUILD-TEST.md
git commit -m "test: Validate trigger stability (3/3)"
git push origin main

echo "✅ Commit 3/3 pushed"
echo "⏳ Aguardando 45 segundos para build iniciar..."
sleep 45

BUILD3=$(gcloud builds list --region=global --limit=1 --format="value(id,status,createTime)" 2>&1)
echo "📊 Build 3/3: $BUILD3"
echo ""

# Summary
echo "=================================================="
echo "📊 RESUMO DOS TESTES"
echo "=================================================="
echo ""
echo "Build 1/3: $BUILD1"
echo "Build 2/3: $BUILD2"
echo "Build 3/3: $BUILD3"
echo ""

# Aguardar builds completarem
echo "⏳ Aguardando 10 minutos para builds completarem..."
echo "(Cada build leva ~6-9 minutos)"
sleep 600

echo ""
echo "📊 STATUS FINAL DOS BUILDS:"
echo "=================================================="
gcloud builds list --region=global --limit=3 --format="table(id,status,createTime,finishTime,source.repoSource.branchName)"

echo ""
echo "✅ Validação completa!"
echo ""
echo "ANÁLISE:"
echo "- Se 3/3 SUCCESS → Trigger ESTÁVEL ✅"
echo "- Se 2/3 SUCCESS → Trigger INSTÁVEL ⚠️"
echo "- Se 1/3 SUCCESS → Trigger NÃO FUNCIONAL ❌"
