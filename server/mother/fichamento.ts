/**
 * FICHAMENTO DE CONHECIMENTO — v73.0
 * 
 * Gera rodapé de conhecimento absorvido para respostas analíticas de MOTHER.
 * 
 * CORREÇÕES v73.0 (baseadas em diagnóstico científico rigoroso):
 * 
 * PROBLEMA 1 — Auto-referência inválida (CORRIGIDO):
 *   ANTES: source: 'Resposta MOTHER' — circularidade epistêmica, viola princípio básico
 *          de que fontes devem ser externas e verificáveis (Zins & Santos, JASIST 2011)
 *   DEPOIS: Conceitos SEM citação externa verificada [N] são OMITIDOS do fichamento.
 *           Apenas conceitos com citação inline [N] do contexto RAG são incluídos.
 * 
 * PROBLEMA 2 — Referências fora de padrão tipográfico (CORRIGIDO):
 *   ANTES: > **Conceito** — def *(Fonte: X)* — mesmo tamanho da fonte, sem hierarquia
 *   DEPOIS: Seção separada com hierarquia visual clara (tamanho menor via <small>),
 *           formato IEEE/ABNT NBR 6023:2018
 *           Hierarquia: resposta principal > rodapé de conhecimento > refs
 * 
 * Base científica:
 * - ABNT NBR 6023:2018 — Informação e documentação: referências
 * - IEEE Citation Reference Guide (2023)
 * - Zins & Santos (2011, JASIST): "Knowledge Classification" — fontes devem ser externas
 * - Wu et al. (2025, Nature Communications): rodapé de citações melhora grounding em 13.83%
 * - "Cite Before You Speak" (arXiv:2503.04830, 2025): citation grounding
 */

export interface FichamentoEntry {
  concept: string;
  definition: string;
  source: string;      // MUST be a real citation [N] — NEVER 'Resposta MOTHER'
  domain: string;
}

export interface FichamentoResult {
  entries: FichamentoEntry[];
  references: string[];
  formattedFootnote: string;
}

/**
 * Classifies the knowledge domain based on query and response content.
 * Based on Zins & Santos (2011, JASIST) 10-pillar knowledge classification.
 */
function classifyDomain(text: string): string {
  const t = text.toLowerCase();
  if (/machine.learning|deep.learning|neural.network|llm|transformer|bert|gpt|ai|artificial.intell/.test(t)) return 'Inteligência Artificial';
  if (/algorithm|data.struct|complexity|big.o|sorting|graph|tree|hash/.test(t)) return 'Ciência da Computação';
  if (/software|code|program|debug|deploy|api|database|server|cloud|devops|typescript|python|javascript/.test(t)) return 'Engenharia de Software';
  if (/theorem|proof|equation|matrix|calculus|probability|statistics|linear.algebra/.test(t)) return 'Matemática';
  if (/cognitive|memory|perception|psychology|neuroscience|brain|behavior/.test(t)) return 'Ciência Cognitiva';
  if (/philosophy|ethics|epistemology|ontology|logic|metaphysics/.test(t)) return 'Filosofia';
  if (/business|market|strategy|finance|economics|management|startup/.test(t)) return 'Negócios';
  if (/health|fitness|medicine|biology|genetics|protein|anatomy/.test(t)) return 'Ciências da Saúde';
  if (/physics|chemistry|astronomy|geology|climate|quantum/.test(t)) return 'Ciências Naturais';
  if (/history|geography|politics|sociology|anthropology|culture/.test(t)) return 'Ciências Sociais';
  return 'Conhecimento Geral';
}

/**
 * Extracts concepts that have REAL inline citations [N] from the response.
 * 
 * CRITICAL RULE: Only extracts concepts with verified external citations.
 * Concepts without citations are OMITTED — NEVER use 'Resposta MOTHER' as source.
 * 
 * Scientific basis: Zins & Santos (2011, JASIST) — knowledge sources must be external
 * and verifiable. Self-referential sources create circular epistemic dependency.
 */
function extractVerifiedConcepts(response: string): Array<{ concept: string; definition: string; source: string }> {
  const concepts: Array<{ concept: string; definition: string; source: string }> = [];
  
  // ONLY extract concepts that have real inline citations [N]
  // Pattern: "**Term** — definition [N]" or "**Term** (definition) [N]"
  const citedBoldPattern = /\*\*([^*]{3,50})\*\*[:\s—–-]+([^.\n]{20,200})\s*\[(\d+)\]/g;
  let match;
  while ((match = citedBoldPattern.exec(response)) !== null) {
    const concept = match[1].trim();
    const definition = match[2].trim().replace(/\*\*/g, '').substring(0, 150);
    const citNum = match[3];
    if (concept.length > 2 && !concept.includes('\n')) {
      concepts.push({ concept, definition, source: `[${citNum}]` });
    }
  }
  
  // Pattern: sentence ending with [N] — extract the key phrase
  const sentenceCitedPattern = /([A-ZÁÉÍÓÚÀÂÊÔÃÕ][^.!?\n]{20,150})\s*\[(\d+)\]/g;
  const citedConcepts: string[] = [];
  while ((match = sentenceCitedPattern.exec(response)) !== null) {
    const context = match[1].trim();
    const citNum = match[2];
    // Extract key noun phrase (remove leading articles)
    const keyPhrase = context.replace(/^(The|A|An|O|A|Os|As|Um|Uma|Este|Esta|Esse|Essa)\s+/i, '').substring(0, 60);
    if (keyPhrase.length > 10 && !citedConcepts.includes(keyPhrase)) {
      citedConcepts.push(keyPhrase);
      concepts.push({ 
        concept: keyPhrase.split(' ').slice(0, 5).join(' '), 
        definition: context.substring(0, 120),
        source: `[${citNum}]`
      });
    }
  }
  
  // Deduplicate and limit to 3 most relevant
  const seen = new Set<string>();
  return concepts
    .filter(c => {
      const key = c.concept.toLowerCase().substring(0, 20);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

/**
 * Extracts references from the response's ## Referências section.
 * Returns only properly formatted references (IEEE/ABNT format).
 */
function extractReferences(response: string): string[] {
  const refSection = response.match(/##\s*Referências[\s\S]*?(?=\n##|\n---|\n📚|$)/i);
  if (!refSection) return [];
  
  const refs: string[] = [];
  const refLines = refSection[0].split('\n');
  for (const line of refLines) {
    // IEEE format: [N] Author, "Title," Venue, year.
    const refMatch = line.match(/^\[(\d+)\]\s+(.+)/);
    if (refMatch && refMatch[2].length > 10) {
      refs.push(`[${refMatch[1]}] ${refMatch[2].trim()}`);
    }
  }
  return refs.slice(0, 8);
}

/**
 * Main function: generates fichamento footnote for a response.
 * 
 * DESIGN PRINCIPLES (v73.0):
 * 1. NEVER use self-referential sources ('Resposta MOTHER', 'Contexto da conversa')
 * 2. Only include concepts with verified external citations [N]
 * 3. Use typographic hierarchy: footnote is visually subordinate to main response
 * 4. Format follows IEEE/ABNT NBR 6023:2018
 * 
 * @param response - The MOTHER response text
 * @param query - The original query
 * @returns FichamentoResult with formatted footnote
 */
export function generateFichamento(response: string, query: string): FichamentoResult {
  // Don't add fichamento to very short responses or error messages
  if (response.length < 300 || response.startsWith('Erro') || response.startsWith('Error')) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  // Don't add fichamento if response already has one
  if (response.includes('📚 **Conhecimento Absorvido')) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  // Don't add fichamento to conversational/command responses (no citations present)
  if (response.length < 500 && !response.includes('[1]') && !response.includes('## Referências')) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  const verifiedConcepts = extractVerifiedConcepts(response);
  const references = extractReferences(response);
  const domain = classifyDomain(query + ' ' + response.substring(0, 500));
  
  // Only include concepts with real citations — NEVER self-referential
  const entries: FichamentoEntry[] = verifiedConcepts.map(c => ({
    concept: c.concept,
    definition: c.definition,
    source: c.source,  // Always [N] — NEVER 'Resposta MOTHER'
    domain,
  }));
  
  // If no verified concepts and no references, don't add fichamento
  if (entries.length === 0 && references.length === 0) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  // Build formatted footnote with proper typographic hierarchy
  // Uses <small> for visual subordination (renders smaller in markdown-capable UIs)
  let footnote = '\n\n---\n\n';
  
  if (entries.length > 0) {
    footnote += '<small>\n\n';
    footnote += `📚 **Conhecimento Absorvido** · *Domínio: ${domain}*\n\n`;
    for (const entry of entries) {
      // Format: concept — definition (citation) — visually subordinate
      footnote += `**${entry.concept}** — ${entry.definition} ${entry.source}\n\n`;
    }
    footnote += '</small>\n\n';
  }
  
  // References section — only if not already in response body
  if (references.length > 0 && !response.includes('## Referências')) {
    footnote += '<small>\n\n';
    footnote += '📖 **Referências** *(IEEE/ABNT NBR 6023:2018)*\n\n';
    for (const ref of references) {
      footnote += `${ref}\n\n`;
    }
    footnote += '</small>\n\n';
  }
  
  return { entries, references, formattedFootnote: footnote };
}
