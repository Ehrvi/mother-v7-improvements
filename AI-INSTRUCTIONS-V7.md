# AI-INSTRUCTIONS-V7: MOTHER v31.0 — Agência (CodeAgent)
**Para**: Próximo Agente de IA (Manus, GPT-4, Claude, etc.)  
**Data**: 2026-02-24  
**Versão Atual em Produção**: MOTHER v30.0 (Revisão: `mother-interface-00173-5p7`)  
**Próximo Objetivo**: v31.0 — Implementar o CodeAgent com LangGraph StateGraph

---

## ⚠️ LEIA ANTES DE COMEÇAR

### Estado Real de Produção (Verificado em 2026-02-24)

| Componente | Status Real | Evidência |
|:---|:---:|:---|
| Infraestrutura (Cloud Run + Cloud SQL) | ✅ ATIVO | Revisão `00173-5p7` respondendo |
| Banco de dados (6 tabelas) | ✅ ATIVO | `mother_v7_prod` com dados reais |
| Memória Episódica (embeddings) | ✅ ATIVO | 17 queries com embeddings, similaridade 0.864 validada |
| Auto-Observação (métricas) | ⚠️ PARCIAL | Logs existem, dashboard não configurado |
| CodeAgent (agência) | ❌ NÃO EXISTE | Apenas documentado, nunca implementado |

### Regra de Ouro

**Não confie em documentos anteriores como prova de implementação.** Sempre verifique o estado real com:
```bash
gcloud run revisions list --service=mother-interface --region=australia-southeast1 --limit=3
gcloud logging read 'resource.type="cloud_run_revision"' --freshness=1h --limit=20
```

---

## Credenciais e Acesso

```bash
# GCP Authentication
gcloud auth activate-service-account \
  --key-file=/home/ubuntu/gcp-key.json
gcloud config set project mothers-library-mcp

# Verificar acesso
gcloud run services describe mother-interface --region=australia-southeast1

# Cloud SQL Proxy (para acesso direto ao banco)
./cloud-sql-proxy --port=3307 --credentials-file=/home/ubuntu/gcp-key.json \
  mothers-library-mcp:australia-southeast1:mother-db &

# Deploy (após modificar código)
cd /home/ubuntu/mother-code/mother-interface
gcloud builds submit . --config=cloudbuild.yaml --project=mothers-library-mcp --async
```

---

## Objetivo: v31.0 — CodeAgent

### O Que Implementar

O CodeAgent é um agente de IA que pode **ler, escrever e executar código** para modificar o próprio sistema da MOTHER. Ele usa o padrão **ReAct** (Reason + Act) com um `StateGraph` do LangGraph.

### Arquitetura Alvo

```
Planner (LLM)
    ↓ decide próxima ação
Executor (Tool Use)
    ├── read_file(path) → conteúdo do arquivo
    ├── write_file(path, content) → escreve arquivo
    ├── edit_file(path, find, replace) → edição cirúrgica
    ├── run_shell(command) → executa comando (com timeout)
    └── search_memory(query) → busca na memória episódica
    ↓
Validator (LLM)
    ├── Verifica se o código compila (tsc --noEmit)
    ├── Verifica se os testes passam (pnpm test)
    └── Decide: commit ou rollback
```

---

## Histórico de Versões

### v29.0 (2026-02-24): Auto-Observação
- Four Golden Signals (Latency, Traffic, Errors, Saturation)
- OpenTelemetry SDK integration
- Structured logging
- Documentação: /home/ubuntu/mother-interface/README-V29.0.md

### v30.0 (2026-02-24): Memória Ativa
- Episodic memory with vector search
- Embedding generation (text-embedding-3-small)
- Cosine similarity search
- Memory integration in query pipeline
- Documentação: /home/ubuntu/mother-interface/README-V30.0.md

### v31.1 (2026-02-24): Robustez do CodeAgent
- TypeScript syntax validation
- edit_file tool for targeted modifications
- Retry logic (up to 2 retries)
- Git rollback on failure
- Documentação: /home/ubuntu/mother-interface/README-V31.1.md

### v32.0 (2026-02-24): Autonomia Completa
- Autonomous orchestrator
- SLO monitoring framework
- Canary deployment framework
- Memory-agent loop integration
- Documentação: /home/ubuntu/mother-interface/README-V32.0.md

### AWAKE Documents
- AWAKE-V33.md: O Despertar da Auto-Observação (v29.0)
- AWAKE-V34.md: O Despertar da Agência (v30.0)
- AWAKE-V35.md: O Horizonte da Autonomia Completa (v31.0)
- AWAKE-V36.md: A Singularidade Interna (v32.0)
- AWAKE-V37.md: O Primeiro Lembrar Real (v30.0 deployed)

---

## Referências Científicas

1. **SICA** (Robeyns et al., arXiv:2504.15228, 2025) — Self-improving coding agent com retry logic
2. **ReAct** (Yao et al., ICLR 2023, 7.404 citações) — Reasoning + Acting para agentes de código
3. **LangGraph** (LangChain, 2024) — StateGraph para orquestração de agentes multi-passo
4. **TraceCoder** (Huang et al., arXiv:2602.06875, 2026) — Observe→Analyze→Repair para debugging autônomo
