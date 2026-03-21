# Mistral Fine-Tuning — Relatório Final Completo

## 🔍 Root Cause CONFIRMADA

A documentação de fine-tuning da Mistral está em **`docs.mistral.ai/deprecated/finetuning`** — a API foi oficialmente **DEPRECATED** em Março 2026 com o lançamento do **Forge**.

O endpoint `/v1/fine_tuning/jobs` ainda existe mas rejeita todos os jobs tipo `completion` para todos os modelos. Único tipo alternativo (`classifier`) não serve para SFT/LoRA.

## Abordagens Testadas

| # | Abordagem | Resultado |
|---|-----------|-----------|
| 1 | API REST `/v1/fine_tuning/jobs` | ❌ "completion not available" — 11 modelos × 3 keys × 15+ variações |
| 2 | `job_type` alternativo (sft, chat, instruct, lora, text) | ❌ Enum validation — só aceita `completion` e `classifier` |
| 3 | Browser subagent (Antigravity) | ❌ Protocol crash — `target closed: EOF` |
| 4 | Playwright v1 (browser limpo) | ❌ Timeout — sem login |
| 5 | Playwright v2 (perfil Chrome) | ❌ Chrome locked + timeout |
| 6 | Vibe CLI | ❌ Bash-only, não disponível para Windows |
| 7 | Local fine-tune (PyTorch/Unsloth) | ❌ Sem GPU NVIDIA, sem PyTorch |
| 8 | Python SDK mistralai | ❌ Incompatível com Python 3.14 |

## ✅ Soluções Viáveis

### Opção A: Google Colab (MAIS RÁPIDA — Automatizada)
Posso criar um notebook Colab completo que:
1. Baixa o modelo `Mistral-Nemo-Instruct-2407` do HuggingFace
2. Carrega seus dados de treino (SFT v2)
3. Fine-tuna com LoRA usando Unsloth (GPU T4/A100 grátis no Colab)
4. Salva o modelo adaptado para download
5. Integra no pipeline MOTHER

**Custo**: Grátis (Colab free) ou ~$10/mês (Colab Pro para A100)

### Opção B: Mistral Forge UI (Manual)
1. Acesse `console.mistral.ai`, clique em **"Fine-tune"** no sidebar
2. Crie job manualmente pela interface
3. A Forge UI pode funcionar mesmo com API deprecated

### Opção C: OpenAI SFT (JÁ FUNCIONANDO ✅)
- Modelo: `ft:gpt-4o-mini-2024-07-18:mother:mother-v10:DLGnsKZr`
- Status: **Operacional** no pipeline DPO
- Job v2 com dados multilíngues: `ftjob-CEz1lotrtPTrRGfNLftBxj9q`

## Recomendação

**Opção A (Colab)** é a mais prática. Posso gerar o notebook completo agora mesmo, basta abrir no Colab e clicar "Run All". O fine-tuning roda na GPU do Google gratuitamente.
