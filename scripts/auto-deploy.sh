#!/bin/bash
# MOTHER v14 - Automated Deploy Script (Linux/Mac)
# Usage: ./scripts/auto-deploy.sh "commit message"

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if commit message provided
if [ -z "$1" ]; then
  echo -e "${RED}❌ Erro: Commit message required${NC}"
  echo "Usage: ./scripts/auto-deploy.sh \"commit message\""
  exit 1
fi

COMMIT_MESSAGE="$1"

echo -e "${CYAN}🚀 MOTHER v14 - Auto Deploy Script${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📝 Commit: $COMMIT_MESSAGE${NC}"
echo -e "${YELLOW}⏰ Timestamp: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if there are changes
echo -e "${BLUE}[1/7] 🔍 Verificando mudanças...${NC}"
if git diff --quiet && git diff --staged --quiet; then
  echo -e "${RED}❌ Nenhuma mudança detectada${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Mudanças detectadas${NC}"
echo ""

# Run lint
echo -e "${BLUE}[2/7] 🎨 Rodando lint...${NC}"
if ! pnpm lint; then
  echo -e "${RED}❌ Lint falhou${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Lint passou${NC}"
echo ""

# Type check
echo -e "${BLUE}[3/7] 🔧 Type checking...${NC}"
if ! pnpm tsc --noEmit; then
  echo -e "${RED}❌ Type check falhou${NC}"
  exit 1
fi
echo -e "${GREEN}✅ TypeScript compilou sem erros${NC}"
echo ""

# Run tests
echo -e "${BLUE}[4/7] 🧪 Rodando testes...${NC}"
if ! pnpm test; then
  echo -e "${RED}❌ Testes falharam${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Todos os testes passaram${NC}"
echo ""

# Git add
echo -e "${BLUE}[5/7] 📦 Git add...${NC}"
git add .
echo -e "${GREEN}✅ Arquivos adicionados${NC}"
echo ""

# Git commit
echo -e "${BLUE}[6/7] 💾 Git commit...${NC}"
if ! git commit -m "$COMMIT_MESSAGE"; then
  echo -e "${RED}❌ Commit falhou${NC}"
  exit 1
fi
COMMIT_HASH=$(git rev-parse --short HEAD)
echo -e "${GREEN}✅ Commit criado: $COMMIT_HASH${NC}"
echo ""

# Git push
echo -e "${BLUE}[7/7] 🚀 Git push...${NC}"
if ! git push github main; then
  echo -e "${RED}❌ Push falhou${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Push completo${NC}"
echo ""

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✅ SUCESSO! Deploy iniciado${NC}"
echo ""
echo -e "${CYAN}🔗 GitHub: https://github.com/Ehrvi/mother-v7-improvements${NC}"
echo -e "${CYAN}🔗 Cloud Build: https://console.cloud.google.com/cloud-build/builds?project=mothers-library-mcp${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
