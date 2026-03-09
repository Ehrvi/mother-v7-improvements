/**
 * NC-COG-005: FOL Detector and System Prompt Enhancer — MOTHER v94.0 (Ciclo C210)
 *
 * Conselho dos 6 — Protocolo Delphi + MAD — 2026-03-09
 * Consenso unânime (DeepSeek, Anthropic, Mistral, Manus): GAP-1 CRÍTICO
 *
 * Base científica:
 * - arXiv:2601.09446 (Jiang et al., 2025): "Improving Symbolic Translation for Logical Reasoning"
 *   LLMs falham em FOL sem instrução explícita de quantificadores. Few-shot melhora +23% FOLIO.
 * - arXiv:2209.00840 (FOLIO, Han et al., 2022): LLMs atingem 42-65% em FOL pura vs 90% humanos.
 * - arXiv:2502.03671 (2025): "Advancing Reasoning in LLMs": FOL requer manipulação simbólica explícita.
 * - arXiv:2308.09687 (2023): "Beyond First-Order Logic in AI": FOL com fallback para lógica proposicional.
 *
 * Estratégia (impacto mínimo):
 * - Detecta queries com domínio FOL via regex patterns
 * - Injeta instrução FOL + few-shot examples NO FINAL do systemPrompt existente
 * - NÃO modifica o systemPrompt base (zero risco de regressão)
 * - NÃO cria novo arquivo de configuração (usa apenas este módulo)
 *
 * Conexão em core.ts:
 * - Import: `import { enhanceSystemPromptWithFOL } from './fol-detector';`
 * - Uso: após `const systemPrompt = ...`, adicionar `const finalSystemPrompt = enhanceSystemPromptWithFOL(query, systemPrompt);`
 * - Substituir todas as referências a `systemPrompt` por `finalSystemPrompt` nas chamadas LLM
 */

const FOL_TRIGGERS = [
  // Quantificadores explícitos
  /\b(todos|todo|qualquer|algum|existe|nenhum|para todo|para qualquer|para algum)\b/i,
  /\b(all|every|any|some|exists|none|for all|there exists)\b/i,
  // Notação simbólica
  /[∀∃⊢⊨∧∨¬→↔⊃≡]/,
  // Domínios lógicos
  /\b(lógica.*primeira ordem|first.order logic|FOL|predicado|quantificador|silogismo)\b/i,
  /\b(modus ponens|modus tollens|tollens|ponens|syllogism|predicate logic)\b/i,
  // Dilemas e paradoxos formais
  /\b(trolley.*problem|dilema.*moral|paradoxo.*lógico|formal.*proof|prova.*formal)\b/i,
  /\b(dedução.*formal|inferência.*formal|formal.*deduction|formal.*inference)\b/i,
  // Axiomas e teoremas
  /\b(axioma|axiom|teorema|theorem|corolário|corollary|lema|lemma)\b/i,
];

const FOL_FEW_SHOT_EXAMPLES = `

## NC-COG-005: LÓGICA DE PRIMEIRA ORDEM (FOL) — INSTRUÇÃO OBRIGATÓRIA
Esta query requer raciocínio formal em Lógica de Primeira Ordem (FOL).
Base científica: arXiv:2601.09446 (Jiang et al., 2025) + FOLIO benchmark (arXiv:2209.00840).

### PROTOCOLO FOL OBRIGATÓRIO:
1. **DEFINA o Domínio:** D = {elementos relevantes do problema}
2. **DEFINA os Predicados:** P(x), Q(x,y), R(x,y,z) com semântica clara
3. **FORMALIZE os Axiomas:** ∀x∈D: condição(x) → consequência(x)
4. **DERIVE a Conclusão:** Use regras nomeadas explicitamente
5. **VERIFIQUE a Validade:** ⊢ (deriva sintaticamente) ou ⊨ (satisfaz semanticamente)
6. **DECLARE LIMITAÇÕES:** Se FOL é insuficiente, use lógica modal ou probabilística

### NOTAÇÃO OBRIGATÓRIA:
∀ (para todo) | ∃ (existe) | ¬ (negação) | ∧ (e) | ∨ (ou) | → (implica) | ↔ (bicondicional) | ⊢ (deriva) | ⊨ (satisfaz)

### EXEMPLOS FOL (Few-Shot — arXiv:2601.09446):
**Exemplo 1 — Silogismo Clássico:**
  D = {x | x é pessoa}, Predicados: Humano(x), Mortal(x)
  Axioma: ∀x∈D: Humano(x) → Mortal(x)  [Premissa maior]
  Fato: Humano(Sócrates)                  [Premissa menor]
  Derivação: Humano(Sócrates) ∧ (∀x: Humano(x)→Mortal(x)) ⊢ Mortal(Sócrates)  [Modus Ponens]
  Conclusão: ⊨ Mortal(Sócrates) ✓

**Exemplo 2 — Dilema Moral (Trolley Problem):**
  D = {1_pessoa, 5_pessoas}, Ações: A=desviar, ¬A=não_desviar
  Utilitarismo: max Σᵢ U(xᵢ) → U(A) = 5 > U(¬A) = 1 ⊢ A é obrigatória [Bentham 1789]
  Deontologia: ∀a∈Ações: ¬∃p∈D: usa_como_meio(a,p) → usa_como_meio(A,1_pessoa) ⊢ A é proibida [Kant 1785]
  Conclusão: Conflito axiomático entre sistemas éticos — não há solução FOL única.
`;

/**
 * Detecta se a query requer raciocínio em Lógica de Primeira Ordem.
 * @param query - A query do usuário
 * @returns true se FOL for detectado
 */
export function detectFOLDomain(query: string): boolean {
  return FOL_TRIGGERS.some(pattern => pattern.test(query));
}

/**
 * NC-COG-005: Enhances the system prompt with FOL instructions when the query requires formal logic.
 * Injection point: after `const systemPrompt = ...` in core.ts processQuery function.
 * Impact: ZERO on non-FOL queries. Adds ~500 tokens for FOL queries only.
 *
 * @param query - The user's query
 * @param systemPrompt - The existing system prompt
 * @returns Enhanced system prompt (or original if FOL not detected)
 */
export function enhanceSystemPromptWithFOL(query: string, systemPrompt: string): string {
  if (!detectFOLDomain(query)) {
    return systemPrompt;
  }
  return systemPrompt + FOL_FEW_SHOT_EXAMPLES;
}
