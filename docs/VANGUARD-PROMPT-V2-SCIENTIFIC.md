# PROMPT DE VANGUARDA CIENTÍFICO (v2.0): Evolução Autônoma de MOTHER

**Objetivo:** Executar um ciclo completo de manutenção e evolução do sistema MOTHER, desde a identificação de oportunidades até o deploy em produção, utilizando uma metodologia científica rigorosa baseada no estado da arte da literatura sobre agentes de IA autônomos.

**Autor:** Manus AI
**Data:** 25 de Fevereiro de 2026

---

## 1. Fundamentação Científica

Este prompt operacionaliza os princípios de sistemas de IA auto-evolutivos, sintetizando os seguintes trabalhos seminais:

| Conceito | Fonte Principal | Contribuição para este Prompt |
| :--- | :--- | :--- |
| **Evolução de Código Aberto** | Darwin Gödel Machine (DGM) [1] | O agente irá propor, codificar, testar e fazer deploy de modificações no código-fonte de MOTHER, mantendo um arquivo de "stepping stones" para evitar o ótimo local. |
| **Evolução em Tempo de Execução** | LIVE-SWE-AGENT [2] | O agente deve ser capaz de modificar o código de MOTHER enquanto o sistema está em execução, sem a necessidade de paradas para manutenção. |
| **Raciocínio + Ação** | ReAct Framework [3] | O agente seguirá um ciclo de **Pensar → Agir → Observar**, onde cada ação é precedida por um passo de raciocínio explícito e seguida por uma observação do resultado. |
| **Decomposição de Problemas** | Chain-of-Thought (CoT) [4] | Para tarefas complexas (e.g., debugging), o agente deve externalizar sua cadeia de pensamentos, decompondo o problema em passos intermediários lógicos. |
| **Auto-Melhoria Recursiva** | Gödel Agent [5] | Embora o agente não modifique seu próprio código-fonte (ele modifica o de MOTHER), o ciclo de melhoria contínua é um passo em direção à auto-melhoria recursiva. |

---

## 2. O Ciclo de Evolução (COMANDO PARA O AGENTE DE IA)

Execute o seguinte ciclo de 5 fases para cada nova evolução de MOTHER (e.g., v58.0, v59.0, etc.).

### FASE 1: OBSERVAÇÃO E HIPÓTESE (PENSAR)

1.  **Coleta de Dados:** Conecte-se à base de dados de produção e execute as seguintes queries:
    *   `SELECT AVG(qualityScore), MIN(qualityScore), category FROM queries WHERE createdAt > NOW() - INTERVAL 1 DAY GROUP BY category ORDER BY AVG(qualityScore) ASC LIMIT 5;`
    *   `SELECT endpoint, AVG(responseTime) FROM system_metrics WHERE createdAt > NOW() - INTERVAL 1 DAY GROUP BY endpoint ORDER BY AVG(responseTime) DESC LIMIT 5;`
    *   `SELECT * FROM audit_log WHERE level = 'error' AND createdAt > NOW() - INTERVAL 1 DAY LIMIT 10;`
2.  **Análise e Formulação da Hipótese:** Analise os dados coletados para identificar a principal fonte de ineficiência, erro ou oportunidade de melhoria. Formule uma hipótese clara e testável. 

    > **Exemplo de Raciocínio (CoT):**
    > *"**Observação:** A query de `queries` mostra que a categoria `code_generation` tem o `qualityScore` médio mais baixo (78%). **Hipótese:** Aumentar a temperatura do LLM de 0.2 para 0.5 no endpoint de geração de código pode aumentar a diversidade e a qualidade das respostas, elevando o `qualityScore` em pelo menos 5 pontos percentuais."*

### FASE 2: PROPOSTA E PLANEJAMENTO (PENSAR)

1.  **Criação da Proposta:** Insira uma nova entrada na tabela `update_proposals` com os seguintes campos:
    *   `title`: Título da hipótese (e.g., "Aumentar Temperatura do LLM para Geração de Código").
    *   `description`: Descrição detalhada, incluindo a hipótese e a referência científica, se aplicável.
    *   `category`: `self_improvement`.
    *   `status`: `pending_approval`.
    *   `fitness_metrics`: JSON com a métrica de sucesso (e.g., `{"avgQualityScore_code_generation": "+5"}`).
2.  **Aguardar Aprovação:** Monitore a proposta até que o status seja alterado para `approved` pelo criador.
3.  **Planejamento da Ação:** Uma vez aprovado, crie um plano de ação detalhado. Liste os arquivos que serão modificados e os comandos que serão executados.

### FASE 3: AÇÃO E IMPLEMENTAÇÃO (AGIR)

1.  **Setup do Ambiente:** Crie um novo branch no Git: `git checkout -b feature/v58.0-increase-temp-codegen`.
2.  **Modificação do Código:** Modifique os arquivos necessários para implementar a mudança. Use a ferramenta `file` com a ação `edit`.
3.  **Criação de Testes:** Crie ou modifique um teste unitário que valide a nova funcionalidade. O teste deve falhar antes da mudança e passar depois.
4.  **Verificação Local:** Compile o código (`npx tsc --noEmit`) e execute os testes (`npm test`) para garantir que a mudança não introduziu regressões.

### FASE 4: OBSERVAÇÃO E AVALIAÇÃO DE FITNESS (OBSERVAR)

1.  **Deploy em Staging (se disponível) ou Produção:**
    *   `git add .`
    *   `git commit -m "feat(v58.0): Increase LLM temperature for code generation"`
    *   `git push origin feature/v58.0-[...]`
    *   Crie e aguarde o merge do Pull Request.
    *   Monitore o pipeline de CI/CD (Cloud Build) até a conclusão do deploy.
2.  **Validação da Hipótese:** Monitore a métrica de fitness definida na proposta por 1 hora após o deploy. Execute a mesma query da Fase 1 para comparar o "antes" e o "depois".
3.  **Atualização da Proposta:** Atualize o status da proposta para `completed` ou `failed` com base no resultado da validação. Adicione um campo `results` com os dados da validação.

### FASE 5: DOCUMENTAÇÃO E LIMPEZA (AGIR)

1.  **Criação do AWAKE:** Crie um novo arquivo `AWAKE-V73.md` documentando todo o ciclo, incluindo a hipótese, os resultados e as observações.
2.  **Atualização do README:** Atualize o `README.md` para refletir a nova versão (v58.0) e as mudanças implementadas.
3.  **Commit da Documentação:** `git add AWAKE-V73.md README.md && git commit -m "docs(v58.0): Document temperature increase evolution" && git push origin master`.

---

## 3. Diretivas de Segurança e Qualidade

- **Idempotência:** Todas as operações de banco de dados (especialmente migrações) devem ser idempotentes (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- **Observabilidade:** Após cada deploy, monitore os logs de produção por 5 minutos (`gcloud logging read ...`) para identificar erros imediatamente.
- **Reversão (Rollback):** Se um deploy resultar em uma falha crítica, execute imediatamente o rollback para a revisão anterior através do console do Cloud Run e inicie um novo ciclo para corrigir o problema.
- **Human-in-the-Loop:** Nenhuma mudança de código deve ir para produção sem a aprovação explícita do criador via Pull Request.

---

## 4. Referências

[1] Zhang, J., et al. (2025). *Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents*. arXiv:2505.22954.

[2] Xia, C.S., et al. (2025). *LIVE-SWE-AGENT: Can Software Engineering Agents Self-Evolve on the Fly?*. arXiv:2511.13646.

[3] Yao, S., et al. (2022). *ReAct: Synergizing Reasoning and Acting in Language Models*. arXiv:2210.03629.

[4] Wei, J., et al. (2022). *Chain-of-Thought Prompting Elicits Reasoning in Large Language Models*. arXiv:2201.11903.

[5] Yin, X., et al. (2024). *Gödel Agent: A Self-Referential Agent Framework for Recursive Self-Improvement*. arXiv:2410.04444.
