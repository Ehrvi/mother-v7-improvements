# AWAKE-V28: A Última Milha da Observabilidade — Da Teoria à Prática

**Data**: 2026-02-23  
**Autor**: Manus AI  
**Versão**: v28 (Documento de Visão para v28.4.1+)  
**Status**: Corrigindo a Lacuna entre Intenção e Realidade no Logging

---

## 1. A Lição da v28.4: A Implementação Importa

O Manifesto da Observabilidade (AWAKE-V27) estabeleceu a visão correta: logs estruturados, métricas acionáveis e verificação de implantação. A v28.4 implementou a intenção, mas falhou na execução. Os logs, embora contendo as informações corretas, não estavam no formato que o Google Cloud Logging esperava. O resultado foi o mesmo da v28.2: cegueira operacional.

Isso nos ensina uma segunda lição fundamental:

> "A teoria e a prática são a mesma coisa na teoria. Na prática, não são." - *Adaptado de Yogi Berra*

Não basta *ter* logs estruturados; eles devem ser *consumíveis* pela plataforma. A última milha da observabilidade é garantir que os dados que emitimos sejam corretamente interpretados pelo sistema que os coleta. A v28.4.1 é dedicada a cruzar essa última milha.

---

## 2. O Schema é o Contrato

O Google Cloud Logging define um contrato claro para logs estruturados [1]. Para que um log seja parseado corretamente, o objeto JSON escrito no `stdout` deve conter campos específicos:

| Campo no JSON | Campo no LogEntry | Propósito |
| :--- | :--- | :--- |
| `severity` | `severity` | Define o nível do log (INFO, ERROR, etc.) |
| `message` | `jsonPayload.message` | A mensagem de log principal |
| `timestamp` | `timestamp` | O carimbo de data/hora do evento |
| `logging.googleapis.com/trace` | `trace` | ID de trace para correlação entre serviços |
| `logging.googleapis.com/spanId` | `spanId` | ID do span dentro de um trace |

O `logger.ts` da v28.4 falhou em dois pontos:

1.  **Formato de Saída**: Usava `printf` e `colorize`, produzindo texto em vez de JSON puro.
2.  **Nome do Campo de Nível**: Usava `level` em vez de `severity`.

Esses pequenos desvios do contrato quebraram toda a cadeia de observabilidade.

---

## 3. Roteiro para a Confiabilidade Total

O roteiro permanece o mesmo, mas a definição de "concluído" para cada etapa agora inclui verificação explícita da observabilidade.

1.  **v28.4.1 (Imediato)**: **Correção do Logger**. Implementar o formato JSON correto e verificar no Cloud Logging que os logs são parseados com a severidade correta.

2.  **v28.5 (Curto Prazo)**: **Re-validar a Arquitetura Python**. Executar o teste de 10 papers e confirmar que o fluxo completo (Discovery → Paper Worker → Python) é visível nos logs estruturados e correlacionados pelo `traceId`.

3.  **v29.0 (Médio Prazo)**: **Implementar Métricas e Dashboards**. Com logs confiáveis, podemos agora construir dashboards significativos para os Quatro Sinais de Ouro.

4.  **v30.0+ (Longo Prazo)**: **Retomar o Roteiro Cognitivo**. Com uma fundação de observabilidade comprovada na prática, podemos finalmente construir a casa da inteligência artificial sobre ela.

---

## 4. Referências

[1] Google Cloud. (n.d.). *Structured logging*. Retrieved February 23, 2026, from https://docs.cloud.google.com/logging/docs/structured-logging
