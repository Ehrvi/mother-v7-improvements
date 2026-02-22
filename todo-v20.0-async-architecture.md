# MOTHER v20.0 ASYNCHRONOUS ARCHITECTURE TODO

## FASE 1: Modificar Schema do Banco de Dados
- [x] Adicionar campo `status` à tabela `papers` (enum: pending, processing, completed, failed)
- [x] Executar `pnpm db:push` para aplicar migração

## FASE 2: Refatorar Worker para Arquitetura Assíncrona
- [x] Criar função `enqueuePaper` (retorna HTTP 200 imediatamente)
- [x] Criar função `processPendingPapers` (loop de processamento em background)
- [x] Atualizar lógica de processamento para usar status do banco
- [x] Verificar TypeScript errors

## FASE 3: Atualizar Production Entry Point
- [x] Atualizar import em `production-entry.ts` para usar `enqueuePaper`
- [x] Verificar que o endpoint `/api/tasks/omniscient-worker` está registrado

## FASE 4: Deploy
- [ ] Commit e push para GitHub
- [ ] Aguardar Cloud Build SUCCESS (~6 min)
- [ ] Verificar nova revisão do Cloud Run

## FASE 5: Teste de Escala (100 Papers)
- [ ] Executar createStudyJob com 100 papers
- [ ] Coletar Knowledge Area ID
- [ ] Verificar response time < 10s

## FASE 6: Validação (30 minutos)
- [ ] Aguardar 30 minutos para processamento em background
- [ ] Verificar papersCount >= 90 (critério de sucesso)
- [ ] Coletar métricas finais (chunksCount, cost)

## FASE 7: Documentação README-V20.0.md
- [ ] Gerar README com análise científica completa
- [ ] Incluir métricas empíricas do teste de 100 papers
- [ ] Documentar arquitetura assíncrona implementada

## FASE 8: Documentação AWAKE-V11.md
- [ ] Gerar AWAKE com certificação final (Grade A esperada)
- [ ] Incluir referência obrigatória ao AI-INSTRUCTIONS.md
- [ ] Documentar lições científicas aprendidas

## FASE 9: Entrega Final
- [ ] Commit documentação para GitHub
- [ ] Criar Pull Request
- [ ] Criar checkpoint final
- [ ] Entregar resultados ao usuário com PR link
