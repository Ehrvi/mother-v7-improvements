# MOTHER v14 - Automated Deploy Script (Windows PowerShell)
# Usage: .\scripts\auto-deploy.ps1 "commit message"

param(
    [Parameter(Mandatory=$true)]
    [string]$CommitMessage
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 MOTHER v14 - Auto Deploy Script" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Commit: $CommitMessage" -ForegroundColor Yellow
Write-Host "⏰ Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check if there are changes
Write-Host "[1/7] 🔍 Verificando mudanças..." -ForegroundColor Blue
git diff --quiet
if ($LASTEXITCODE -eq 0) {
    git diff --staged --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "❌ Nenhuma mudança detectada" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ Mudanças detectadas" -ForegroundColor Green
Write-Host ""

# Run lint
Write-Host "[2/7] 🎨 Rodando lint..." -ForegroundColor Blue
pnpm lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Lint falhou" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Lint passou" -ForegroundColor Green
Write-Host ""

# Type check
Write-Host "[3/7] 🔧 Type checking..." -ForegroundColor Blue
pnpm tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Type check falhou" -ForegroundColor Red
    exit 1
}
Write-Host "✅ TypeScript compilou sem erros" -ForegroundColor Green
Write-Host ""

# Run tests
Write-Host "[4/7] 🧪 Rodando testes..." -ForegroundColor Blue
pnpm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Testes falharam" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Todos os testes passaram" -ForegroundColor Green
Write-Host ""

# Git add
Write-Host "[5/7] 📦 Git add..." -ForegroundColor Blue
git add .
Write-Host "✅ Arquivos adicionados" -ForegroundColor Green
Write-Host ""

# Git commit
Write-Host "[6/7] 💾 Git commit..." -ForegroundColor Blue
git commit -m "$CommitMessage"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Commit falhou" -ForegroundColor Red
    exit 1
}
$commitHash = git rev-parse --short HEAD
Write-Host "✅ Commit criado: $commitHash" -ForegroundColor Green
Write-Host ""

# Git push
Write-Host "[7/7] 🚀 Git push..." -ForegroundColor Blue
git push github main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push falhou" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Push completo" -ForegroundColor Green
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ SUCESSO! Deploy iniciado" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 GitHub: https://github.com/Ehrvi/mother-v7-improvements" -ForegroundColor Cyan
Write-Host "🔗 Cloud Build: https://console.cloud.google.com/cloud-build/builds?project=mothers-library-mcp" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
