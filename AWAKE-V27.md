# AWAKE-V27: Observabilidade Primeiro — Um Manifesto para Sistemas Resilientes

**Data**: 2026-02-23  
**Autor**: Manus AI  
**Versão**: v27 (Documento de Visão para v28.3+)  
**Status**: Diagnóstico de Falha Silenciosa — Re-priorizando Observabilidade

---

## 1. A Lição da v28.2: O Custo da Cegueira

A falha silenciosa dos Paper Workers na v28.2, apesar de uma infraestrutura funcional, é a lição mais importante na história do projeto MOTHER até hoje. Ela revela uma verdade fundamental sobre sistemas distribuídos, como articulado por Nygard [1]:

> "Um sistema que falha silenciosamente é pior do que um sistema que não funciona. Um sistema que não funciona alerta você para o problema. Um sistema que falha silenciosamente corrompe dados, perde transações e mina a confiança do usuário, tudo isso enquanto aparenta estar saudável."

MOTHER v28.2 era um sistema que falhava silenciosamente. Ele retornava HTTP 200 enquanto 100% de suas tarefas críticas falhavam. O custo não foi apenas o tempo de depuração, mas a erosão da confiança nos resultados do sistema.

**A partir de hoje, a observabilidade não é mais uma "boa prática" — é o requisito funcional número um.**

---

## 2. O Manifesto da Observabilidade (3 Pilares)

Inspirado pelas práticas de Site Reliability Engineering (SRE) do Google [2], o desenvolvimento futuro de MOTHER será guiado por três pilares de observabilidade:

### Pilar 1: Logs Estruturados e Correlacionados

*   **O quê**: Todos os logs devem ser emitidos em formato JSON estruturado.
*   **Por quê**: Permite filtragem, agregação e análise automáticas em escala.
*   **Como**: Cada log deve conter, no mínimo: `timestamp`, `level`, `message`, `serviceName` (`mother-interface`, `discovery-worker`, etc.), e `traceId`. O `traceId` (extraído do header `X-Cloud-Trace-Context`) é a cola que une as ações de múltiplos serviços em uma única transação lógica.

### Pilar 2: Métricas Acionáveis (Os 4 Sinais de Ouro)

*   **O quê**: Implementar métricas para os "Quatro Sinais de Ouro" para cada serviço:
    1.  **Latência**: Quanto tempo as solicitações levam para serem atendidas.
    2.  **Tráfego**: A quantidade de demanda que o sistema está recebendo.
    3.  **Erros**: A taxa de solicitações que estão falhando.
    4.  **Saturação**: Quão "cheio" o serviço está (uso de CPU/memória).
*   **Por quê**: Fornece uma visão de alto nível da saúde do sistema sem a necessidade de inspecionar logs individuais.
*   **Como**: Usar uma biblioteca como `prom-client` e expor um endpoint `/metrics` para o Prometheus (ou usar a integração nativa do Cloud Monitoring).

### Pilar 3: Verificação de Implantação Contínua

*   **O quê**: Cada implantação deve ser verificável e rastreável.
*   **Por quê**: Para eliminar a divergência entre o código em produção e o repositório Git — a causa raiz mais provável da falha da v28.2.
*   **Como**:
    1.  **Log do Commit SHA**: O servidor deve logar o Git commit SHA na inicialização.
    2.  **Smoke Tests**: Após cada deploy, um conjunto de testes automatizados deve ser executado contra o novo serviço para verificar a funcionalidade básica.
    3.  **Rollback Automático**: Se os smoke tests falharem, o Cloud Build deve reverter automaticamente para a revisão anterior.

---

## 3. Roteiro Re-priorizado

A visão de longo prazo (arquitetura cognitiva) permanece a mesma, mas o caminho para chegar lá mudou. Não podemos construir um sistema inteligente sobre uma fundação que não podemos ver.

1.  **v28.3 (Imediato)**: **Verificar o Código em Produção**. Confirmar a hipótese de divergência de código.
2.  **v28.4 (Curto Prazo)**: **Implementar o Manifesto da Observabilidade**. Adicionar log de commit, logs estruturados e error handling explícito.
3.  **v28.5 (Curto Prazo)**: **Re-validar a Arquitetura Python**. Com a observabilidade no lugar, finalmente validar a hipótese H1 (Python elimina OOM).
4.  **v29.0 (Médio Prazo)**: **Implementar Métricas e Dashboards**. Construir dashboards no Cloud Monitoring para os Quatro Sinais de Ouro.
5.  **v30.0+ (Longo Prazo)**: **Retomar o Roteiro Cognitivo**. Com uma fundação resiliente e observável, retomar a implementação da memória episódica e do CodeAgent.

---

## 4. Referências

[1] Nygard, M. (2018). *Release It! Design and Deploy Production-Ready Software* (2nd ed.). Pragmatic Bookshelf.

[2] Beyer, B., Jones, C., Petoff, J., & Murphy, N. R. (2016). *Site Reliability Engineering: How Google Runs Production Systems*. O'Reilly Media.
