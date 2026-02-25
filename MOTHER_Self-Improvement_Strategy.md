## MOTHER Self-Improvement: Diagnosis, State of the Art, and Execution Strategy

**Data:** 25 de fevereiro de 2026
**Autor:** Manus AI

### 1. Diagnóstico: A Ilusão da Auto-Atualização

A análise do código-fonte da MOTHER (v65.4) e do comportamento observado revela uma verdade fundamental: **a capacidade de auto-atualização da MOTHER é uma simulação bem orquestrada, não uma realidade funcional.**

O fluxo atual é o seguinte:

1.  **Proposta:** O `self-proposal-engine.ts` gera propostas de melhoria baseadas em métricas (ex: latência, qualidade). Essas propostas são puramente textuais, contendo um título, descrição e uma lista de "mudanças" em linguagem natural (ex: "Wrap calls in Promise.all").
2.  **Aprovação:** O criador aprova a proposta via interface. A função `approveProposal` no `update-proposals.ts` simplesmente atualiza o status da proposta no banco de dados para "approved".
3.  **Execução (Simulada):** É aqui que o sistema falha. A interface exibe mensagens como "A mudança será implementada", mas **nenhum código é executado**. O `autonomous-update-job.ts` existe, mas ele **nunca é acionado**. A função `executeUpdate` no `autonomous.ts` que deveria chamar o Cloud Run Job está presente, mas a lógica do `tool-engine.ts` e do `core.ts` **não a invoca** após a aprovação. A aprovação apenas muda um status no banco de dados.

| Componente | Realidade no Código da MOTHER | Estado da Arte (DGM, Gödel Agent) |
| :--- | :--- | :--- |
| **Proposta de Mudança** | Descrição em linguagem natural de alto nível. | Diffs de código concretos e executáveis. |
| **Mecanismo de Update** | Inexistente. A aprovação apenas muda o status no DB. | Agente lê seu próprio código, aplica o diff, e executa. |
| **Validação** | Nenhuma. A proposta é marcada como "implementada" sem verificação. | Compilação, testes unitários e benchmarks de performance (fitness). |
| **Loop de Melhoria** | Quebrado. O ciclo para na aprovação. | Ciclo completo: Propor → Executar → Testar → Comitar/Reverter. |

**Conclusão do Diagnóstico:** MOTHER é como um gerente que aprova um projeto, mas não tem uma equipe para executá-lo. Ela não possui a capacidade de ler, modificar e validar seu próprio código em tempo de execução. A infraestrutura (Cloud Run Job, repo no GitHub) foi parcialmente configurada, mas o elo de ligação — o gatilho que inicia o trabalho de engenharia de software autônoma — está ausente.

---

### 2. Estado da Arte: Como a Auto-Atualização Realmente Funciona

A pesquisa em artigos científicos de ponta (2024-2025) revela dois modelos principais que resolvem este problema:

**A. Darwin Gödel Machine (DGM) [1]:**

> O DGM é um sistema auto-aperfeiçoável que modifica iterativamente seu próprio código e valida empiricamente cada mudança usando benchmarks de codificação. Ele mantém um arquivo de agentes de codificação gerados, amostra um agente, usa um modelo de fundação para criar uma nova versão interessante e a adiciona ao arquivo. Esta exploração de final aberto forma uma árvore crescente de agentes diversos e de alta qualidade.

-   **Mecanismo:** Um agente (código Python) usa um LLM para gerar uma **mutação** de si mesmo. A mutação é um diff de código. O agente original aplica o diff, cria um novo agente-filho, executa uma bateria de testes de performance (fitness) e, se o filho for melhor, ele é mantido no "arquivo" (uma coleção de agentes viáveis).
-   **Ponto-chave:** A validação é **empírica**, não baseada em provas formais. O sistema testa se a mudança *realmente* melhora a performance.

**B. Gödel Agent [2] e SWE-agent [3]:**

> O Gödel Agent é um framework auto-evolutivo inspirado na máquina de Gödel, permitindo que agentes se aprimorem recursivamente. Ele usa LLMs para modificar dinamicamente sua própria lógica e comportamento em tempo de execução, guiado por objetivos de alto nível.

-   **Mecanismo:** Estes agentes operam como engenheiros de software autônomos. Eles recebem um problema (ex: "resolver bug #123"), leem o código-fonte, usam ferramentas (shell, editor de texto) para aplicar mudanças, rodam testes, e submetem um pull request quando o problema é resolvido. O `SWE-agent` se destaca por sua `Agent-Computer Interface (ACI)`, um conjunto de comandos de edição de texto (`abrir`, `substituir`, `ir para linha`) que o LLM pode usar, tornando a interação com o código mais robusta.
-   **Ponto-chave:** O agente tem um **ambiente de desenvolvimento completo** (acesso a arquivos, terminal, compilador) e age como um desenvolvedor humano, usando ferramentas para completar uma tarefa.

---

### 3. Estratégia Executável para MOTHER: O Plano "Prometheus"

Para dar à MOTHER a capacidade real de auto-atualização, precisamos preencher o gap entre a simulação e a execução. A estratégia a seguir, batizada de "Prometheus", integra os conceitos do DGM e do SWE-agent em um plano executável por um agente de IA.

**Fase 1: Construir a Forja (O Ambiente de Execução)**

1.  **Criar o Cloud Run Job:** Usar `gcloud` para criar um novo Cloud Run Job chamado `mother-swe-agent-job`. Este job receberá um `PROPOSAL_ID` como variável de ambiente.
2.  **Configurar Permissões:** Conceder ao Service Account do Job acesso ao repositório `Ehrvi/mother-v7-improvements` no GitHub (via o segredo `mother-github-token`) e ao Secret Manager para obter as credenciais.
3.  **Criar o Dockerfile:** Criar um `Dockerfile.swe` que instala as dependências necessárias: `git`, `gh` (GitHub CLI), `node`, `typescript`.

**Fase 2: Implementar o Agente SWE (O Engenheiro de Software Autônomo)**

1.  **Modificar `autonomous-update-job.ts`:** Este arquivo será o coração do agente. Ele deve:
    a.  Receber o `PROPOSAL_ID`.
    b.  Clonar o repositório `Ehrvi/mother-v7-improvements`.
    c.  Chamar o LLM com um prompt específico (ver abaixo) para converter a descrição da proposta em um **plano de ação detalhado** (lista de comandos de arquivo/shell).
    d.  Executar o plano de ação em um loop ReAct (Think-Act-Observe).
    e.  Rodar `npm run build` para verificar se o código ainda compila.
    f.  Se a compilação for bem-sucedida, criar um novo branch, comitar as mudanças e abrir um Pull Request usando o `gh` CLI.
    g.  Se falhar, registrar o erro e marcar a proposta como "failed" no banco de dados.

**Fase 3: Ligar os Fios (O Gatilho de Execução)**

1.  **Modificar `update-proposals.ts`:** A função `approveProposal` deve ser alterada. Após atualizar o status da proposta para "approved", ela deve **invocar o Cloud Run Job `mother-swe-agent-job`**, passando o `proposalId`.
2.  **Modificar `autonomous.ts`:** A rota `executeUpdate` deve ser o gatilho real, chamando o Cloud Run Job. A opção de rodar "inline" deve ser removida para produção.

---

### 4. O Prompt de Execução (A Mente do Agente)

Este é o prompt que será usado dentro do `autonomous-update-job.ts` para guiar o LLM na conversão da proposta em um plano de ação. Ele é projetado para ser o mais eficiente e direto possível, focando em ferramentas e ações concretas.

```prompt
Você é o **SWE-Agent (Software Engineering Agent)** da MOTHER. Sua missão é converter uma proposta de alto nível em um plano de ação executável para modificar o código-fonte da MOTHER. O repositório já está clonado em `/app/repo`.

**OBJETIVO:**
Implementar a seguinte proposta:
- **Título:** {{proposal.title}}
- **Descrição:** {{proposal.description}}
- **Mudanças Propostas (Linguagem Natural):**
{{#each proposal.changes}}
- {{this}}
{{/each}}

**FERRAMENTAS DISPONÍVEIS (ACI - Agent-Computer Interface):**

- `readFile(path)`: Lê o conteúdo de um arquivo.
- `writeFile(path, content)`: Escreve (ou sobrescreve) um arquivo.
- `findAndReplace(path, find_string, replace_string)`: Encontra e substitui um texto em um arquivo.
- `insertIntoFile(path, content, line_number)`: Insere texto em uma linha específica.
- `executeShell(command)`: Executa um comando no terminal (ex: `ls -l`, `grep`, `npm install`).

**INSTRUÇÕES:**

1.  **Pense passo a passo.** Comece lendo os arquivos relevantes para entender o contexto.
2.  **Crie um plano de ação.** Gere uma lista ordenada de chamadas de ferramentas em JSON para implementar a proposta.
3.  **Seja preciso e minimalista.** Altere apenas o necessário. Prefira `findAndReplace` a `writeFile` para pequenas modificações.
4.  **Valide seu plano.** O plano deve ser robusto e levar a um estado de código válido.
5.  **Retorne APENAS o JSON** com a lista de ações. Não inclua nenhuma outra explicação.

**Exemplo de Saída JSON:**

[
  {
    "tool": "readFile",
    "path": "server/mother/core.ts"
  },
  {
    "tool": "findAndReplace",
    "path": "server/mother/core.ts",
    "find_string": "const IS_SEQUENTIAL = true;",
    "replace_string": "const IS_SEQUENTIAL = false; // Changed by SWE-Agent for Proposal #{{proposal.id}}"
  },
  {
    "tool": "executeShell",
    "command": "npm run build"
  }
]

**Agora, gere o plano de ação JSON para a proposta acima.**
```

---

### Referências

[1] Zhang, J., Hu, S., Lu, C., Lange, R., & Clune, J. (2025). *Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents*. arXiv preprint arXiv:2505.22954.

[2] Yin, X., Wang, X., Pan, L., Wan, X., & Wang, W. Y. (2024). *Gödel Agent: A Self-Referential Agent Framework for Recursive Self-Improvement*. arXiv preprint arXiv:2410.04444.

[3] Xia, C. S., & Zhang, L. (2024). *Agent-Computer Interfaces Enable Automated Software Engineering*. arXiv preprint arXiv:2405.15793.
