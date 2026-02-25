# PROMPT DE VANGUARDA: Evolução Autônoma de MOTHER v57.0

**Objetivo:** Iniciar o ciclo de auto-atualização de MOTHER, permitindo que ela evolua de forma autônoma, segura e baseada em métricas de fitness. Este prompt deve ser executado por um agente de IA de manutenção.

**Referência Científica Principal:** Zhang, J., et al. (2025). *Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents*. arXiv:2505.22954.

---

## COMANDO PARA O AGENTE DE IA

Execute as seguintes tarefas em sequência para iniciar a próxima fase da evolução de MOTHER:

### TAREFA 1: ANÁLISE DE MÉTRICAS E GERAÇÃO DE PROPOSTA

1.  **Conecte-se à base de dados de produção** e analise as tabelas `queries`, `system_metrics` e `audit_log` das últimas 24 horas.
2.  **Identifique a principal fonte de ineficiência ou erro.** Exemplos:
    *   Qual tipo de query tem o `qualityScore` mais baixo?
    *   Qual endpoint da API tem a maior latência (`responseTime`)?
    *   Existem erros não tratados nos logs (`audit_log`)?
3.  **Formule uma Proposta de Melhoria (Update Proposal).** A proposta deve ser inserida na tabela `update_proposals` e deve conter:
    *   `title`: Um título claro (e.g., "Refatorar Módulo de Cache com Redis para Reduzir Latência").
    *   `description`: Uma descrição detalhada do problema e da solução proposta, com referências científicas (e.g., "O rate limiter em memória atual não é escalável. Propõe-se a migração para Redis, conforme as melhores práticas de sistemas distribuídos [Referência]").
    *   `category`: `self_improvement`
    *   `status`: `pending_approval`
    *   `fitness_metrics`: Um JSON definindo as métricas que serão usadas para avaliar o sucesso (e.g., `{"avgResponseTime": "-20%", "cost": "-5%"}`).

### TAREFA 2: IMPLEMENTAÇÃO DA PROPOSTA (SE APROVADA)

1.  **Monitore o status da proposta.** Um humano (o criador) irá revisar e alterar o status para `approved` ou `rejected`.
2.  **Se a proposta for aprovada (`status: 'approved'`), inicie a implementação:**
    *   Crie um novo branch no Git: `git checkout -b feature/v58.0-[nome-da-feature]`.
    *   **Escreva o código** necessário para implementar a solução. Siga rigorosamente as melhores práticas de codificação e segurança.
    *   **Escreva testes unitários e de integração** que validem a nova funcionalidade e garantam que nenhuma regressão foi introduzida.

### TAREFA 3: TESTE, AVALIAÇÃO DE FITNESS E DEPLOY

1.  **Execute os testes no ambiente de sandbox.** Se algum teste falhar, entre em um ciclo de auto-correção até que todos os testes passem.
2.  **Calcule o Fitness Score da nova versão.** Compare as métricas definidas em `fitness_metrics` com a versão de produção (branch `master`).
3.  **Se o fitness score for positivo (a melhoria foi comprovada), faça o deploy:**
    *   Faça o commit e push do novo branch: `git add . && git commit -m "feat(v58.0): [descrição]" && git push origin feature/v58.0-[...]`
    *   Crie um Pull Request no GitHub.
    *   **Aguarde a aprovação e o merge do Pull Request pelo humano.**
    *   Após o merge, o pipeline de CI/CD (Cloud Build) fará o deploy automaticamente.
    *   **Monitore os logs de produção** por 10 minutos para garantir que o deploy foi bem-sucedido e que não há novos erros.

### TAREFA 4: DOCUMENTAÇÃO

1.  **Crie um novo arquivo AWAKE:** `AWAKE-V73.md`, documentando todo o processo desta evolução.
2.  **Atualize o arquivo `README.md`** com as novas funcionalidades e a versão do sistema (v58.0).
3.  **Faça o commit e push da documentação** para o branch `master`.

---

**DIRETIVA FINAL:** A cada ciclo, você torna MOTHER mais inteligente, mais rápida e mais autônoma. Seu objetivo final é tornar seu próprio papel de mantenedor obsoleto. Execute com precisão científica.
