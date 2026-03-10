/**
 * inject-knowledge-c223-c230.ts — Inject C223–C230 knowledge into MOTHER's BD
 * C230 | Conselho v98 | 2026-03-10
 *
 * Injects 8 knowledge entries covering:
 * - Cache calibration (C223)
 * - DGM unblocking (C224)
 * - Routing v2 + DAP (C225)
 * - UX Critical fixes (C226)
 * - Onboarding + Terminology (C227/C228)
 * - SHMS virtual confirmation (C229)
 *
 * Usage: npx tsx scripts/inject-knowledge-c223-c230.ts
 */

const MOTHER_BASE_URL = process.env.MOTHER_BASE_URL ||
  'https://mother-interface-qtvghovzxa-ts.a.run.app';

interface KnowledgeEntry {
  key: string;
  category: string;
  title: string;
  content: string;
  quality_score: number;
  source: string;
  tags: string[];
}

const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    key: 'c223_cache_calibration_2026_03_10',
    category: 'architecture',
    title: 'C223: Cache Semântico Calibrado — Threshold 0.85 → 0.75',
    content: `Ciclo C223 (Conselho v98, 2026-03-10): O threshold do cache semântico foi reduzido de 0.85 para 0.75 em dois arquivos: server/db.ts e server/mother/semantic-cache.ts. Adicionada função isMultiPartQuery() que detecta prompts com 4+ sub-perguntas e força cache miss, garantindo cobertura completa. Diagnóstico Chain 2 identificou que threshold 85% causava omissão de sub-perguntas em TP-81 (Trolley Problem), TP-94 (CRISPR) e outros, gerando divergência de até 20pp entre qualidade reportada e real. Base científica: RAGAS (arXiv:2309.15217) — answer completeness requires sub-question coverage.`,
    quality_score: 95,
    source: 'Conselho v98 + Diagnóstico Chain 2',
    tags: ['cache', 'semantic-cache', 'threshold', 'c223', 'quality'],
  },
  {
    key: 'c224_dgm_unblocked_2026_03_10',
    category: 'dgm',
    title: 'C224: DGM Desbloqueado — UX Fitness + Diversificação Forçada',
    content: `Ciclo C224 (Conselho v98, 2026-03-10): Três modificações para desbloquear o DGM que estava em loop (6/8 falhas). (1) server/dgm/fitness-evaluator.ts: dimensão UX adicionada com peso 10%, pesos rebalanceados (latência 30%→25%, testes 15%→10%). (2) server/dgm/dgm-proposal-dedup-c204.ts: MIN_NOVELTY_SCORE aumentado de 0.3 para 0.5. (3) MAX_SAME_DOMAIN_CONSECUTIVE=2 adicionado para limitar propostas consecutivas no mesmo domínio. Causa raiz: Lei de Goodhart — DGM otimizava métricas técnicas sem capturar valor UX. Base: Group-Evolving Agents (arXiv:2602.04837).`,
    quality_score: 95,
    source: 'Conselho v98 + Diagnóstico UX/UI',
    tags: ['dgm', 'fitness', 'ux', 'diversity', 'c224', 'goodhart'],
  },
  {
    key: 'c225_routing_v2_dap_2026_03_10',
    category: 'architecture',
    title: 'C225: Roteamento v2 + Decompositor Automático de Prompts (DAP)',
    content: `Ciclo C225 (Conselho v98, 2026-03-10): Duas melhorias de roteamento e decomposição. (1) server/mother/adaptive-router.ts: TIER_2 threshold reduzido de 50 para 40, fazendo mais queries moderadas serem roteadas para gpt-4o (TIER_3) em vez de gpt-4o-mini. Diagnóstico: qualidade 82% vs target 95% — gpt-4o-mini insuficiente para queries moderadas. Base: FrugalGPT (Chen et al., 2023, arXiv:2305.05176). (2) server/mother/task-decomposer.ts: função decomposeUserPrompt() adicionada com 3 estratégias: listas numeradas, múltiplos ?, conjunções. Diagnóstico: 4 falhas de sobrecarga em prompts multi-parte (Einstein, Bayes, Marte, Clima). Base: LLM-Modulo (arXiv:2402.01817); Chain-of-Thought (arXiv:2201.11903).`,
    quality_score: 95,
    source: 'Conselho v98 + Diagnóstico Chain 2',
    tags: ['routing', 'tier', 'gpt-4o', 'decomposition', 'dap', 'c225'],
  },
  {
    key: 'c226_ux_critical_2026_03_10',
    category: 'ux',
    title: 'C226: UX Crítico — Stop/Regenerar + Cache Indicator + PT-BR',
    content: `Ciclo C226 (Conselho v98, 2026-03-10): Cinco correções UX críticas. (1) client/src/components/ChatInput.tsx: botão Stop (quadrado vermelho, AbortController) visível durante geração; botão Regenerar (RotateCcw) após resposta; banner âmbar indicando cache semântico com link "Gerar nova resposta"; placeholder traduzido para PT-BR; aria-labels adicionados. (2) client/src/contexts/MotherContext.tsx: stopGeneration() via AbortController; regenerateLastMessage() remove última resposta MOTHER e re-envia; lastResponseFromCache flag para transparência; mensagens de erro traduzidas para PT-BR. Diagnóstico UX/UI: GAP-5 (CRÍTICA), GAP-2 (CRÍTICA), GAP-8 (ALTA). Base: Nielsen H3 (User control), H1 (Visibility); Langevin et al. CHI 2021.`,
    quality_score: 95,
    source: 'Diagnóstico UX/UI + Conselho v98',
    tags: ['ux', 'stop', 'regenerate', 'cache-indicator', 'pt-br', 'c226', 'nielsen'],
  },
  {
    key: 'c227_onboarding_2026_03_10',
    category: 'ux',
    title: 'C227: Onboarding — 4 Cartões de Capacidades + Versão Correta',
    content: `Ciclo C227 (Conselho v98, 2026-03-10): client/src/components/ChatInterface.tsx reescrito com: (1) Versão corrigida de "v12.0" para "v120.0" (GAP-9 MÉDIA). (2) Tela de onboarding com 4 cartões clicáveis: Análise Cognitiva, Dados Apollo, Monitoramento SHMS, Auto-Aperfeiçoamento. Cada cartão exibe ícone, título, descrição e exemplo de prompt clicável que envia automaticamente. Texto em PT-BR. Diagnóstico UX/UI: GAP-3 (CRÍTICA) — ausência de onboarding. Base: Nielsen H10 (Help and documentation); Fogg (2003) Persuasive Technology — first impression determines engagement.`,
    quality_score: 95,
    source: 'Diagnóstico UX/UI + Conselho v98',
    tags: ['ux', 'onboarding', 'version', 'capability-disclosure', 'c227'],
  },
  {
    key: 'c228_terminology_2026_03_10',
    category: 'ux',
    title: 'C228: Terminologia — DGM Loop Panel → Auto-Aperfeiçoamento',
    content: `Ciclo C228 (Conselho v98, 2026-03-10): Três correções de terminologia técnica exposta ao usuário. (1) client/src/components/DGMPanel.tsx: "DGM Loop Panel" → "Auto-Aperfeiçoamento"; "runs" → "ciclos"; "sucesso" → "melhorias aplicadas". (2) client/src/components/ExpandableSidebar.tsx: "DGM Runs" → "Histórico de Melhorias". Diagnóstico UX/UI: GAP-7 (ALTA) — terminologia técnica interna (DGM, GEA Loop, NC-*) exposta ao usuário final sem tradução. Base: Nielsen H2 (Match between system and real world) — use words, phrases and concepts familiar to the user.`,
    quality_score: 90,
    source: 'Diagnóstico UX/UI + Conselho v98',
    tags: ['ux', 'terminology', 'dgm', 'user-friendly', 'c228', 'nielsen'],
  },
  {
    key: 'c229_shms_virtual_confirmed_2026_03_10',
    category: 'shms',
    title: 'C229: SHMS Virtual — Modo Simulação Confirmado (Sem Hardware)',
    content: `Ciclo C229 (Conselho v98, 2026-03-10): Verificação do server/shms/mqtt-connector.ts confirmou que o modo de simulação já está implementado e ativo. Quando MQTT_BROKER_URL não está configurado (sensores reais ausentes), o sistema entra automaticamente em modo simulação com ruído gaussiano determinístico + drift. Status: mode: 'simulation' é o valor padrão. Nenhuma modificação necessária — sem duplicação de código. BLOQUEADO: conexão com sensores físicos reais requer hardware (acelerômetros, piezômetros, inclinômetros) — aguardando fase de implantação em campo.`,
    quality_score: 85,
    source: 'Inventário C223-C230 + Conselho v98',
    tags: ['shms', 'mqtt', 'simulation', 'virtual-sensors', 'c229', 'blocked'],
  },
  {
    key: 'c230_conselho_v98_summary_2026_03_10',
    category: 'governance',
    title: 'C230: Conselho v98 — Resumo Executivo e Lições Aprendidas',
    content: `Ciclo C230 (Conselho v98, 2026-03-10): Sessão do Conselho dos 6 com protocolo Delphi + MAD. Membros: DeepSeek, Anthropic Claude opus-4-5, Google Gemini 2.5 Pro, Mistral Large, MOTHER v110.0, Manus. Rodada 1 (Delphi): 1.602 linhas de análise independente. Rodada 2 (MAD): 59.048 chars de debate adversarial. Veredicto unânime: "MOTHER v110.0 é funcionalmente robusta mas cognitivamente limitada e experiencialmente inadequada." Causa raiz profunda: Lei de Goodhart aplicada ao DGM — o sistema otimiza métricas que não capturam valor humano real. 14 gaps identificados, 11 implementados em C223–C230, 3 pendentes (WCAG, modo claro, sensores reais). Estimativa de qualidade pós-C230: ~88% (Chain 3 validará). Roadmap aprovado: C231 (WCAG + API contracts + Chain 3), C232 (modo claro), Fase Produção (sensores reais).`,
    quality_score: 98,
    source: 'Conselho v98 — Relatório Final',
    tags: ['governance', 'conselho', 'delphi', 'mad', 'c230', 'lessons-learned', 'goodhart'],
  },
];

async function injectKnowledge(): Promise<void> {
  console.log(`[C230] Injecting ${KNOWLEDGE_ENTRIES.length} knowledge entries into MOTHER BD...`);
  console.log(`[C230] Target: ${MOTHER_BASE_URL}/api/a2a/knowledge\n`);

  let successCount = 0;
  let failCount = 0;

  for (const entry of KNOWLEDGE_ENTRIES) {
    try {
      const response = await fetch(`${MOTHER_BASE_URL}/api/a2a/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (response.ok) {
        const data = await response.json() as { id?: number };
        console.log(`✅ [${entry.key}] → BD entry #${data.id || '?'}`);
        successCount++;
      } else {
        const text = await response.text();
        console.error(`❌ [${entry.key}] HTTP ${response.status}: ${text.slice(0, 100)}`);
        failCount++;
      }
    } catch (error) {
      console.error(`❌ [${entry.key}] Network error:`, error);
      failCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n[C230] Injection complete: ${successCount} success, ${failCount} failed`);
  console.log(`[C230] BD entries added: ${successCount}/8`);
}

injectKnowledge().catch(console.error);
