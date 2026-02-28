/**
 * MOTHER v71.0 — Admin Documentation System
 *
 * Creator-only documentation accessible via /docs command or admin_docs tool.
 * Contains all credentials, procedures, and system reference needed to operate MOTHER.
 *
 * Scientific basis:
 * - ISO/IEC 25010:2011 — Software Quality Model: Maintainability requires complete
 *   and accurate documentation of all operational procedures.
 * - NIST SP 800-162 — RBAC: Access to sensitive documentation must be restricted
 *   to authorized principals only (creator role).
 * - DevOps Handbook (Kim et al., 2016): Runbooks and operational documentation
 *   must be co-located with the system they describe.
 *
 * Security: This module is only callable from tool-engine.ts after creator auth check.
 * The content is served at runtime — never stored in plaintext in the frontend.
 */

import { MOTHER_VERSION } from './core';

const SECTIONS: Record<string, () => string> = {

  overview: () => `# MOTHER ${MOTHER_VERSION} — Admin Overview

## Sistema
- **Nome:** MOTHER (Modular Orchestrated Thinking Hub for Evolutionary Research)
- **Versão:** ${MOTHER_VERSION}
- **URL Produção:** https://mother-interface-qtvghovzxa-ts.a.run.app
- **Criador:** elgarcia.eng@gmail.com
- **GCP Project:** mothers-library-mcp
- **Região:** australia-southeast1
- **Repositório:** https://github.com/everton-dgm/mother-interface

## Arquitetura
MOTHER é uma superinteligência autoevolutiva com 7 camadas cognitivas:
1. **Interface Layer** — tRPC routers (server/routers/)
2. **Orchestration Layer** — core.ts (processQuery pipeline)
3. **Intelligence Layer** — intelligence.ts (routing, tier selection)
4. **Execution Layer** — LLM invocation (OpenAI, Anthropic, Google)
5. **Knowledge Layer** — knowledge.ts + CRAG + Omniscient RAG
6. **Quality Layer** — guardian.ts (Guardian Regeneration Loop)
7. **Learning Layer** — learning.ts + DGM + GEA + fitness scoring

## Módulos Principais
| Módulo | Arquivo | Função |
|--------|---------|--------|
| Core Pipeline | server/mother/core.ts | Orquestração principal |
| Intelligence | server/mother/intelligence.ts | Routing + tier selection |
| Knowledge | server/mother/knowledge.ts | bd_central queries |
| Guardian | server/mother/guardian.ts | Quality validation |
| DGM | server/mother/update-proposals.ts | Self-improvement proposals |
| GEA | server/mother/gea_supervisor.ts | Group-Evolving Agents |
| Tool Engine | server/mother/tool-engine.ts | 16 ferramentas agentic |
| Self-Code-Writer | server/mother/self-code-writer.ts | Gödel Machine write |
| Admin Docs | server/mother/admin-docs.ts | Este arquivo |`,

  commands: () => `# MOTHER ${MOTHER_VERSION} — Comandos Admin (Creator Only)

Todos os comandos começam com / e só funcionam quando logado como criador.

## Comandos Disponíveis

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| \`/status\` | Status operacional resumido | \`/status\` |
| \`/audit\` | Auditoria completa do sistema | \`/audit\` |
| \`/proposals\` | Listar propostas DGM pendentes | \`/proposals\` |
| \`/approve [ID]\` | Aprovar proposta DGM | \`/approve 42\` |
| \`/fitness\` | Score de fitness em tempo real | \`/fitness\` |
| \`/learn [texto]\` | Ingerir conhecimento direto | \`/learn Quantum entanglement....\` |
| \`/docs [seção]\` | Esta documentação | \`/docs credentials\` |

## Ferramentas Agentic (via linguagem natural)
MOTHER também responde a linguagem natural para acionar ferramentas:
- "audite o sistema" → audit_system
- "mostre as propostas" → get_proposals
- "aprove a proposta 5" → approve_proposal
- "leia o arquivo core.ts" → read_own_code
- "atualize o arquivo X com Y" → write_own_code
- "mostre a documentação admin" → admin_docs
- "qual o status do deploy" → write_own_code(deploy_status)`,

  tools: () => `# MOTHER ${MOTHER_VERSION} — 16 Ferramentas Agentic

## Ferramentas READ (todos os usuários)
| # | Ferramenta | Função |
|---|-----------|--------|
| 1 | audit_system | Auditoria completa do sistema |
| 2 | get_proposals | Listar propostas DGM |
| 3 | get_performance_metrics | Métricas de performance |
| 4 | search_knowledge | Buscar no bd_central |
| 5 | read_own_code | Ler código fonte |
| 6 | knowledge_graph | Grafo de conhecimento |
| 7 | abductive_reasoning | Raciocínio abdutivo (IBE) |
| 8 | dpo_status | Status do dataset DPO |
| 9 | hle_benchmark | Benchmark HLE |
| 10 | get_audit_log | Log de auditoria |

## Ferramentas WRITE/ADMIN (criador apenas)
| # | Ferramenta | Função |
|---|-----------|--------|
| 11 | approve_proposal | Aprovar proposta DGM |
| 12 | learn_knowledge | Ingerir conhecimento |
| 13 | self_repair | Auto-reparo do sistema |
| 14 | force_study | Forçar estudo de tópico |
| 15 | self_improve | Ciclo MAPE-K |
| 16 | write_own_code | Escrever próprio código + deploy |
| 17 | admin_docs | Esta documentação |`,

  credentials: () => `# MOTHER ${MOTHER_VERSION} — Credenciais e Acesso

## Google Cloud Platform
- **Project ID:** mothers-library-mcp
- **Region:** australia-southeast1
- **Service Account:** mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com
- **Cloud Run Service:** mother-interface
- **Cloud SQL Instance:** mothers-library-mcp:australia-southeast1:mother-db

## Banco de Dados Produção (Cloud SQL PostgreSQL)
- **Tipo:** Cloud SQL (PostgreSQL 15)
- **Instância:** mothers-library-mcp:australia-southeast1:mother-db
- **Banco:** mother_v7_prod
- **Conexão local:** Via Cloud SQL Auth Proxy na porta 3307
- **Secret:** mother-db-url (Google Cloud Secret Manager)

### Conectar ao Banco de Produção (do sandbox):
\`\`\`bash
# 1. Iniciar Cloud SQL Auth Proxy
cloud-sql-proxy mothers-library-mcp:australia-southeast1:mother-db --port 3307 &

# 2. Obter senha
DB_PASS=$(gcloud secrets versions access latest --secret=mother-db-url | grep -oP '(?<=:)[^@]+(?=@)')

# 3. Conectar
mysql -h 127.0.0.1 -P 3307 -u mother_user -p"$DB_PASS" mother_v7_prod
\`\`\`

## Tabelas Principais do Banco
| Tabela | Descrição | Registros (aprox.) |
|--------|-----------|-------------------|
| knowledge | bd_central — base de conhecimento | ~793 |
| queries | Histórico de queries | ~372 |
| papers | Papers arXiv indexados | ~743 |
| paper_chunks | Chunks para RAG | ~8000+ |
| self_proposals | Propostas DGM | ~20 |
| fitness_history | Histórico de fitness | ~50 |
| audit_log | Log de auditoria | ~200 |
| users | Usuários autenticados | ~5 |
| episodic_memory | Memória episódica | ~100 |
| system_metrics | Métricas do sistema | ~500 |

## GitHub
- **Repositório:** https://github.com/everton-dgm/mother-interface
- **Branch principal:** main
- **Secret:** mother-github-token (Google Cloud Secret Manager)

## OpenAI
- **Secret:** mother-openai-key (Google Cloud Secret Manager)
- **Modelos usados:** gpt-4o-mini (tier 1), gpt-4o (tier 2/3)

## Autenticação JWT
- **Secret:** mother-jwt-secret (Google Cloud Secret Manager)
- **Cookie:** mother_session
- **Criador:** elgarcia.eng@gmail.com`,

  deploy: () => `# MOTHER ${MOTHER_VERSION} — Pipeline de Deploy

## Processo Automático (via Chat)
1. Diga a MOTHER o que quer mudar (em linguagem natural ou /docs)
2. MOTHER usa write_own_code para escrever/patchar o arquivo
3. MOTHER faz git commit + git push automaticamente
4. Cloud Build é triggerado pelo push (webhook GitHub → Cloud Build)
5. Build: ~8-12 minutos
6. Cloud Run atualiza automaticamente

## Processo Manual (do sandbox)
\`\`\`bash
cd /home/ubuntu/mother-code/mother-interface

# Fazer mudanças nos arquivos
# ...

# Commit e push
git add -A
git commit -m "feat(v71.0): descrição da mudança"
git push origin main

# Monitorar build
gcloud builds list --limit=3 --format="table(id,status,createTime)"
gcloud builds log <BUILD_ID> --stream
\`\`\`

## Rollback
\`\`\`bash
# Ver commits recentes
git log --oneline -10

# Reverter último commit
git revert HEAD
git push origin main

# Ou rollback para versão específica
git revert <commit-sha>
git push origin main
\`\`\`

## Cloud Build Config
- **Arquivo:** cloudbuild.yaml (na raiz do projeto)
- **Trigger:** Push para branch main
- **Steps:** install → build → push image → deploy Cloud Run
- **Timeout:** 20 minutos

## Verificar Versão em Produção
\`\`\`bash
curl -s -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/trpc/mother.query \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"query":"/audit","useCache":false}}' | jq '.result.data.json.response' | head -5
\`\`\``,

  database: () => `# MOTHER ${MOTHER_VERSION} — Banco de Dados

## Inserir Conhecimento (bd_central)
\`\`\`sql
INSERT INTO knowledge (title, content, category, source, created_at, updated_at)
VALUES (
  'Título do Conhecimento',
  'Conteúdo completo aqui...',
  'categoria',
  'fonte',
  NOW(),
  NOW()
);
\`\`\`

## Queries Úteis
\`\`\`sql
-- Contar entradas por categoria
SELECT category, COUNT(*) as total
FROM knowledge
GROUP BY category
ORDER BY total DESC;

-- Últimas queries processadas
SELECT query, quality_score, response_time, created_at
FROM queries
ORDER BY created_at DESC
LIMIT 10;

-- Status do sistema
SELECT config_key, config_value
FROM system_config;

-- Fitness history
SELECT fitness_score, created_at
FROM fitness_history
ORDER BY created_at DESC
LIMIT 10;

-- Propostas DGM pendentes
SELECT id, title, status, created_at
FROM self_proposals
WHERE status = 'pending'
ORDER BY created_at DESC;
\`\`\`

## Schema Principal (knowledge)
\`\`\`sql
CREATE TABLE knowledge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  source VARCHAR(200),
  embedding JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
\`\`\``,

  architecture: () => `# MOTHER ${MOTHER_VERSION} — Arquitetura Detalhada

## Fluxo de uma Query
\`\`\`
User → tRPC Router → Admin Command Check → processQuery()
  ↓
Cache Check (SHA-256 exact + semantic cosine 0.92)
  ↓
Intelligence Layer (classifyQuery → tier selection)
  ↓
Parallel Context Build (Promise.allSettled):
  ├── CRAG (Self-Correcting RAG)
  ├── Omniscient (arXiv paper chunks, top-7, threshold 0.50)
  ├── Episodic Memory (top-3, threshold 0.75)
  ├── User Memory (personalized context)
  ├── Scientific Research (if requiresResearch())
  └── Abductive Reasoning (if requiresAbductiveReasoning())
  ↓
System Prompt Construction (creatorContext + knowledgeContext + ...)
  ↓
ReAct Loop (if complex) → Tool Calls (16 tools)
  ↓
LLM Invocation (gpt-4o-mini | gpt-4o | claude-3.5 | gemini-2.0)
  ↓
Guardian Quality Check (threshold 75/100)
  ↓
Grounding (if needsGrounding())
  ↓
Learning (learnFromResponse if quality >= 75)
  ↓
Metrics (insertQuery, cache store, episodic memory)
  ↓
Response → User
\`\`\`

## Módulos de Ciclos 36-40 (v70.0)
| Ciclo | Módulo | Base Científica |
|-------|--------|----------------|
| 36 | knowledge-graph.ts | GraphRAG (arXiv:2408.08921) |
| 37 | abductive-engine.ts | Peirce (1878), Lipton (2004) |
| 38 | dpo-builder.ts | Rafailov et al. NeurIPS 2023 |
| 39 | rlvr-verifier.ts | DeepSeek-R1 (arXiv:2501.12948) |
| 40 | self-improve.ts | MAPE-K (Kephart & Chess, 2003) |

## Módulos de v71.0
| Módulo | Função |
|--------|--------|
| self-code-writer.ts | Gödel Machine write + deploy |
| admin-docs.ts | Documentação creator-only |

## Multi-Provider Cascade (v68.8 + NC-PROVIDER-001 v75.2)
Ordem de fallback: OpenAI → Anthropic → Google
- Tier 1 (simple): deepseek-chat → gpt-4o-mini (auto-fallback se DeepSeek key ausente)
- Tier 2 (moderate): gpt-4o → claude-3.5-sonnet → gemini-1.5-pro
- Tier 3 (complex): gpt-4o → claude-3.5-sonnet → gemini-2.0-flash

**NC-PROVIDER-001 (Ciclo 52):** Graceful fallback implementado em llm.ts.
Quando DeepSeek ou Mistral key ausente → auto-fallback para gpt-4o-mini sem crash.
Base científica: FrugalGPT (Chen et al., arXiv:2305.05176, 2023).

## DGM Roadmap — Gestão de Crashes (ROADMAP-DGM-CRASH-001)
**Prioridade:** ALTA | **Status:** PLANEJADO | **Ciclo alvo:** 53-55

Objetivo: DGM detecta automaticamente falhas de provider (HTTP 500/503) e:
1. Cria proposta de update em update-proposals.ts com fallback chain corrigido
2. Executa autonomous-update-job.ts para aplicar o fix sem intervenção humana
3. Registra o incidente no bd_central com causa raiz e solução aplicada
4. Notifica o criador via /status com summary do crash e auto-recovery

Implementação planejada:
- health-monitor.ts: detecta HTTP 500/503 consecutivos por provider
- crash-recovery.ts: gera proposta DGM automaticamente
- Threshold: 3 falhas consecutivas em 5 minutos → auto-proposta

Base científica:
- Gödel Machine (Schmidhuber, 2003) — self-modifying systems
- MAPE-K (Kephart & Chess, 2003) — Monitor-Analyze-Plan-Execute loop
- SWE-agent (Yang et al., arXiv:2405.15793, 2024) — autonomous code repair`,
};

/**
 * Get admin documentation for a specific section or all sections.
 * This function is called only after creator authorization check in tool-engine.ts.
 */
export async function getAdminDocs(section?: string): Promise<string> {
  if (!section || section === 'all') {
    return Object.values(SECTIONS).map(fn => fn()).join('\n\n---\n\n');
  }

  const sectionFn = SECTIONS[section];
  if (!sectionFn) {
    const available = Object.keys(SECTIONS).join(', ');
    return `❌ Section "${section}" not found.\n\nAvailable sections: ${available}\n\nUse \`/docs all\` for complete documentation.`;
  }

  return sectionFn();
}
