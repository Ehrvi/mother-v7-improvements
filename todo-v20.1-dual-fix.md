# MOTHER v20.1 — DUAL FIX E VALIDAÇÃO FINAL

## FASE 1: Fix Schema Overflow
- [ ] Alterar campo `cost` de `varchar(20)` para `decimal(10, 8)` em `drizzle/schema.ts`
- [ ] Executar `pnpm db:push` para aplicar migração

## FASE 2: Fix Orchestrator Timeout
- [x] Refatorar `orchestrator-async.ts` para mover `searchArxiv` para background
- [x] Adicionar status `discovering` à tabela `knowledgeAreas`
- [x] Implementar função `processDiscoveryInBackground` (fire-and-forget)
- [x] Verificar TypeScript errors

## FASE 3: Deploy
- [ ] Commit e push para GitHub
- [ ] Aguardar Cloud Build SUCCESS (~6 min)

## FASE 4: Validação de Escala (100 Papers)
- [ ] Executar `createStudyJob` com 100 papers (quantum computing)
- [ ] Coletar Knowledge Area ID
- [ ] Verificar resposta instantânea (< 10s)

## FASE 5: Aguardar Processamento (30 min)
- [ ] Aguardar 30 minutos para processamento completo
- [ ] Verificar `papersCount >= 90` via `getArea`

## FASE 6: Documentação README-V20.1.md
- [ ] Gerar README com métricas empíricas reais
- [ ] Incluir tabela de resultados experimentais

## FASE 7: Documentação AWAKE-V12.md
- [ ] Gerar AWAKE com certificação final
- [ ] Incluir referência ao AI-INSTRUCTIONS.md
- [ ] Atribuir Grade A (98/100) se validação bem-sucedida

## FASE 8: Entrega Final
- [ ] Commit documentação
- [ ] Criar Pull Request
- [ ] Entregar ao usuário com PR link + docs
