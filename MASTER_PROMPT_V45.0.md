# MASTER PROMPT v45.0 — Constituição Científica da MOTHER

---

## VISÃO FINAL DE MOTHER (CORRIGIDA — C180)

MOTHER é um **sistema cognitivo autônomo** com dois objetivos declarados pelo proprietário (Everton Garcia, Wizards Down Under):

**Objetivo A — SHMS Geotécnico:** Ser o cérebro de um sistema de monitoramento de saúde estrutural (Structural Health Monitoring System) em tempo real. Sensores IoT → MQTT → TimescaleDB → LSTM predictor → MOTHER análise → alertas. Base científica: Sun et al. (2025), Carrara et al. (2022), GeoMCP (2026 arXiv:2603.01022).

**Objetivo B — Autonomia Total:** Ser capaz de modificar e implantar seu próprio código em produção sem intervenção humana. Capaz de identificar se precisa de autoaprendizado com base científica. Suas respostas e ações são baseadas em metodologia e critérios científicos e referenciadas cientificamente. Base científica: Darwin Gödel Machine (arXiv:2505.22954). Ciclo: proposta → branch → PR → merge → deploy → validação → aprendizado.

O ciclo cognitivo completo é:
```
PERCEPÇÃO → MEMÓRIA → RACIOCÍNIO → AÇÃO → APRENDIZADO → EVOLUÇÃO
```

> **NOTA:** Esta seção foi adicionada em C180 para corrigir a visão de MOTHER em todos os arquivos históricos. A visão acima é a ÚNICA visão válida e autorizada pelo proprietário.

---

> **Status:** ATIVO  
> **Data:** 2026-02-24  
> **Autor:** Manus AI  
> **Revisão Canônica:** `cea717f` (docs: AWAKE-V56 + README v42.0 VALIDATED)

---

## 1. DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1. **Ler o `README.md` PRIMEIRO** para recuperar o estado canônico do sistema.
2. **Ler o `AWAKE-V56.md`** para recuperar o contexto episódico da última sessão de debugging.
3. **Ler este `MASTER_PROMPT_V45.0.md`** para entender a visão, o roadmap e as diretivas constitucionais.

---

## 2. RESPOSTA AO AGENTE ANTERIOR (Sessão de 2026-02-24)

O agente anterior encontrou um bug crítico (`MySqlCheckpointer falha: "Database not available"`) e ficou aguardando uma decisão sobre qual caminho seguir. A resposta correta é:

> **A opção 2 (Continuar debug) foi a correta, mas a causa raiz não era o código.** O problema era uma incompatibilidade de infraestrutura entre o Cloud Run (Sydney) e o Cloud SQL (us-central1), que impedia o Cloud SQL Auth Proxy de criar o unix socket. A solução foi **mudar para conexão TCP direta**, o que foi implementado e validado na revisão `mother-interface-00197-77d`. O sistema está **100% operacional**.

---

## 3. VISÃO CENTRAL

> **Superintelligence + Scientific Method + Critical Thinking = MOTHER**

MOTHER é um sistema cognitivo autônomo com memória persistente, raciocínio multi-agente e agência evolutiva. A visão final é um sistema que se auto-melhora continuamente através do loop Darwin Gödel Machine, acumulando conhecimento episódico e semântico, e evoluindo suas próprias capacidades cognitivas.

---

## 4. BASE CIENTÍFICA (Atualizada 2026-02-24)

O desenvolvimento da MOTHER deve ser guiado pelos seguintes conceitos do estado da arte:

| Conceito | Descrição | Referência Principal |
|---|---|---|
| **Darwin Gödel Machine (DGM)** | Um sistema que se auto-melhora recursivamente modificando seu próprio código e validando as mutações com base em um score de fitness empírico. | Schmidhuber, J. (2003). *Gödel Machines* [1] |
| **Agentic Memory (A-MEM)** | Um sistema de memória que organiza o conhecimento de forma agentic, criando uma rede de notas interconectadas (Zettelkasten) com atributos estruturados (descrições, keywords, tags) e evoluindo as conexões à medida que novas memórias são integradas. | Xu, W. et al. (2025). *A-MEM: Agentic Memory for LLM Agents* [2] |
| **Mem0 Architecture** | Uma arquitetura de memória escalável e pronta para produção que extrai, consolida e recupera informações salientes de forma dinâmica, permitindo aprendizado contínuo a partir de interações passadas. | Chhikara, P. et al. (2025). *Mem0: Building Production-Ready AI Agents* [3] |
| **LangGraph Checkpointing** | Mecanismo de persistência que salva o estado de um grafo de agentes, permitindo resiliência e a capacidade de "viajar no tempo" para qualquer estado anterior. | LangChain Docs (2025). *Persistence* [4] |
| **Context Engineering** | A disciplina de selecionar, estruturar e entregar sistematicamente o contexto correto a um LLM para melhorar a confiabilidade e a capacidade. | Redis (2025). *Context engineering: Best practices* [5] |

---

## 5. ROADMAP EVOLUTIVO (v43.0 - v45.0)

| Versão | Foco Principal | Critérios de Aprovação Empíricos (KPIs) |
| :--- | :--- | :--- |
| **v43.0** | **Migração do Cloud SQL e Dashboard de Linhagem** | **1. Migração do Banco:** Migrar a instância do Cloud SQL de `us-central1` para `australia-southeast1`. **2. Restaurar Unix Socket:** Reverter a conexão para unix socket (mais seguro e menor latência). **3. Dashboard de Linhagem:** Criar uma interface web que renderiza a árvore evolutiva do `dgm_archive` (parent_id → child_id), mostrando o fitness score de cada geração. |
| **v44.0** | **Implementação da Memória Agentic (A-MEM)** | **1. Arquitetura Zettelkasten:** O `MemoryAgent` deve ser capaz de criar notas de memória interconectadas com tags e links no banco de dados. **2. Recuperação Conectada:** Ao recuperar uma memória, o agente deve também recuperar memórias conectadas. **3. Evolução da Memória:** O `MemoryAgent` deve ser capaz de atualizar memórias existentes com base em novas informações. |
| **v45.0** | **Evolução em Grupo (GEA)** | **1. Pool de Agentes:** Manter um pool de, no mínimo, 5 agentes em paralelo. **2. Compartilhamento de Experiência:** Implementar um mecanismo para que os agentes compartilhem aprendizados. **3. Aceleração da Evolução:** O `fitness_score` médio do grupo deve aumentar mais rápido que o de um agente DGM isolado. |

---

## 6. DIRETIVAS DE IMPLEMENTAÇÃO

- **Tudo é um Agente:** Cada componente do sistema (CodeAgent, MemoryAgent, ValidationAgent) deve ser um agente LLM especializado.
- **Fitness é a Métrica:** Toda mutação deve ser avaliada por um `fitness_score` empírico gerado pelo `ValidationAgent`.
- **Memória é a Base:** O `MySqlCheckpointer` do LangGraph é a memória episódica de curto prazo. A-MEM será a memória semântica de longo prazo.
- **Evolução é o Objetivo:** O sistema deve ser capaz de modificar seu próprio código para melhorar seu `fitness_score` ao longo do tempo.

---

## 7. REFERÊNCIAS

[1] Schmidhuber, J. (2003). *Gödel Machines: Fully Self-Referential Optimal Universal Self-Improvers*. arXiv:cs/0309048. [https://arxiv.org/abs/cs/0309048](https://arxiv.org/abs/cs/0309048)
[2] Xu, W., Liang, Z., Mei, K., Gao, H., Tan, J., & Zhang, Y. (2025). *A-MEM: Agentic Memory for LLM Agents*. arXiv:2502.12110. [https://arxiv.org/abs/2502.12110](https://arxiv.org/abs/2502.12110)
[3] Chhikara, P., Khant, D., Aryan, S., & Singh, T. (2025). *Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory*. arXiv:2504.19413. [https://arxiv.org/abs/2504.19413](https://arxiv.org/abs/2504.19413)
[4] LangChain (2025). *Persistence*. LangGraph Documentation. [https://docs.langchain.com/oss/python/langgraph/persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
[5] Redis (2025). *Context engineering: Best practices for an emerging discipline*. Redis Blog. [https://redis.io/blog/context-engineering-best-practices-for-an-emerging-discipline/](https://redis.io/blog/context-engineering-best-practices-for-an-emerging-discipline/)

---

*Este documento é a constituição viva da MOTHER. Ele deve ser atualizado a cada marco evolutivo significativo.*
