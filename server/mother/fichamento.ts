/**
 * MOTHER v69.7 — Fichamento de Conhecimento (Knowledge Annotation)
 *
 * Automatically extracts and formats knowledge absorbed during a response
 * as a structured footnote appended to the response.
 *
 * Scientific basis:
 * - Wu et al. (2025, Nature Communications): "Some LLMs provided a footnote after each response"
 *   — validates footnote format for grounded AI responses.
 * - "Cite Before You Speak" (arXiv:2503.04830, 2025): incorporating citation generation
 *   in LLM response paradigm increases grounding by 13.83%.
 * - AGREE (Google Research, 2024): LLM adaptation for improved grounding and citation accuracy.
 * - Zins & Santos (2011, JASIST): "10 Pillars of Knowledge" — hierarchical knowledge tree
 *   used as basis for domain classification.
 *
 * Format (based on academic fichamento tradition in Brazilian academia):
 * ---
 * 📚 **Conhecimento Absorvido nesta Resposta**
 * > **[Conceito]** — [Definição] — *Fonte: [Referência]*
 *
 * 📖 **Referências**
 * [1] Autor, "Título," Venue, Ano.
 */

interface FichamentoEntry {
  concept: string;
  definition: string;
  source: string;
  domain: string;
}

interface FichamentoResult {
  entries: FichamentoEntry[];
  references: string[];
  formattedFootnote: string;
}

/**
 * UDC-inspired domain classifier
 * Scientific basis: Universal Decimal Classification (UDC, 2024)
 * Maps concepts to one of 10 main knowledge domains
 */
function classifyDomain(text: string): string {
  const t = text.toLowerCase();
  if (/machine learning|neural|deep learning|llm|transformer|embedding|ai|artificial intelligence/.test(t)) return 'Inteligência Artificial';
  if (/algorithm|software|code|programming|database|api|system|architecture/.test(t)) return 'Engenharia de Software';
  if (/theorem|proof|equation|matrix|calculus|probability|statistics/.test(t)) return 'Matemática';
  if (/cognitive|memory|perception|psychology|neuroscience|brain/.test(t)) return 'Ciência Cognitiva';
  if (/philosophy|ethics|epistemology|ontology|logic/.test(t)) return 'Filosofia';
  if (/business|market|strategy|finance|economics|management/.test(t)) return 'Negócios';
  if (/health|fitness|medicine|biology|genetics|protein/.test(t)) return 'Ciências da Saúde';
  if (/physics|chemistry|astronomy|geology|climate/.test(t)) return 'Ciências Naturais';
  if (/history|geography|politics|sociology|anthropology/.test(t)) return 'Ciências Sociais';
  return 'Conhecimento Geral';
}

/**
 * Extracts key concepts from a response text
 * Uses pattern matching for defined terms, named entities, and technical concepts
 */
function extractConcepts(response: string): Array<{ concept: string; definition: string; source: string }> {
  const concepts: Array<{ concept: string; definition: string; source: string }> = [];
  
  // Pattern 1: "**Term** — definition" (bold term with em-dash definition)
  const boldDefPattern = /\*\*([^*]{3,50})\*\*[:\s—–-]+([^.\n]{20,200})/g;
  let match;
  while ((match = boldDefPattern.exec(response)) !== null) {
    const concept = match[1].trim();
    const definition = match[2].trim().replace(/\*\*/g, '').substring(0, 150);
    if (concept.length > 2 && !concept.includes('\n')) {
      concepts.push({ concept, definition, source: 'Resposta MOTHER' });
    }
  }
  
  // Pattern 2: Extract inline citations [1], [2] and their context
  const citationPattern = /([^.]{20,150})\s*\[(\d+)\]/g;
  const citedConcepts: string[] = [];
  while ((match = citationPattern.exec(response)) !== null) {
    const context = match[1].trim();
    const citNum = match[2];
    // Extract the key noun phrase from the context (first 60 chars)
    const keyPhrase = context.replace(/^(The|A|An|O|A|Os|As|Um|Uma)\s+/i, '').substring(0, 60);
    if (keyPhrase.length > 10 && !citedConcepts.includes(keyPhrase)) {
      citedConcepts.push(keyPhrase);
      concepts.push({ 
        concept: keyPhrase.split(' ').slice(0, 4).join(' '), 
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
 * Extracts references from the response's ## Referências section
 */
function extractReferences(response: string): string[] {
  const refSection = response.match(/##\s*Referências[\s\S]*?(?=##|$)/i);
  if (!refSection) return [];
  
  const refs: string[] = [];
  const refLines = refSection[0].split('\n');
  for (const line of refLines) {
    const refMatch = line.match(/^\[(\d+)\]\s+(.+)/);
    if (refMatch) {
      refs.push(`[${refMatch[1]}] ${refMatch[2].trim()}`);
    }
  }
  return refs.slice(0, 5);
}

/**
 * Main function: generates fichamento footnote for a response
 * 
 * @param response - The MOTHER response text
 * @param query - The original query
 * @returns FichamentoResult with formatted footnote
 */
export function generateFichamento(response: string, query: string): FichamentoResult {
  // Don't add fichamento to very short responses or error messages
  if (response.length < 200 || response.startsWith('Erro') || response.startsWith('Error')) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  // Don't add fichamento if response already has a fichamento section
  if (response.includes('📚 **Conhecimento Absorvido')) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  const rawConcepts = extractConcepts(response);
  const references = extractReferences(response);
  const domain = classifyDomain(query + ' ' + response.substring(0, 500));
  
  const entries: FichamentoEntry[] = rawConcepts.map(c => ({
    concept: c.concept,
    definition: c.definition,
    source: c.source,
    domain,
  }));
  
  // Build formatted footnote
  let footnote = '\n\n---\n\n';
  
  if (entries.length > 0) {
    footnote += '📚 **Conhecimento Absorvido nesta Resposta**\n\n';
    footnote += `*Domínio: ${domain}*\n\n`;
    for (const entry of entries) {
      footnote += `> **${entry.concept}** — ${entry.definition} *(Fonte: ${entry.source})*\n\n`;
    }
  }
  
  if (references.length > 0 && !response.includes('## Referências')) {
    footnote += '📖 **Referências**\n\n';
    for (const ref of references) {
      footnote += `${ref}\n\n`;
    }
  }
  
  // If no concepts and no refs, don't add footnote
  if (entries.length === 0 && references.length === 0) {
    return { entries: [], references: [], formattedFootnote: '' };
  }
  
  return { entries, references, formattedFootnote: footnote };
}
