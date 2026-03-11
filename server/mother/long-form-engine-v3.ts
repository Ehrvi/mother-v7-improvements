/**
 * Long-Form Engine V3 — server/mother/long-form-engine-v3.ts
 * MOTHER v122.19 | Ciclo C305-C306 | NC-LF-001
 *
 * C305: Programming book support — detect code-heavy requests and inject code generation
 *       instructions into section prompts. Adds 'programming_book' format with chapter
 *       structure matching user-specified chapters.
 * C306: Parallel section generation — Promise.all instead of sequential for loop.
 *       Reduces 5-section book from ~300s to ~60s (5× speedup).
 *       Live streaming — each section emits onChunk as it completes, so frontend
 *       shows content progressively instead of waiting for all sections.
 *
 * Scientific basis:
 * - Bai et al. (2022) "Constitutional AI" arXiv:2212.08073 — structured document generation
 * - Gao et al. (2023) "RAG for LLMs" arXiv:2312.10997 — RAG for long-form content
 * - Lewis et al. (2020) "RAG for Knowledge-Intensive NLP" arXiv:2005.11401
 * - Google DeepMind (2025) Gemini 2.5 Pro — 65,536 output token limit
 * - FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — output length as routing signal
 * - Cascade LLM (Yue et al., arXiv:2309.02343, 2023) — retry with fallback
 * - Dean & Barroso (2013) CACM "The Tail at Scale" — parallel fan-out reduces P99 latency
 * - Nielsen (1994) Heuristic #1 — visibility of system status (live streaming feedback)
 */

import { invokeLLM } from '../_core/llm';
import { uploadToDrive } from './google-workspace-bridge';
import { generateSpeech } from './tts-engine';
import * as fs from 'fs';

export type DocumentFormat = 'markdown' | 'scientific' | 'report' | 'book_chapter' | 'technical_spec' | 'programming_book';

export interface LongFormV3Request {
  title: string;
  topic: string;
  format: DocumentFormat;
  targetWordCount?: number;      // Default: 3000
  language?: string;             // Default: 'pt-BR'
  sections?: string[];           // Custom section names
  includeReferences?: boolean;   // Default: true
  exportToDrive?: boolean;       // Default: false
  generateTTS?: boolean;         // Default: false
  ttsVoice?: string;
  streamProgress?: (progress: LongFormV3Progress) => void;
  // C306: Live streaming — emit section content as it completes
  onChunk?: (chunk: string) => void;
}

export interface LongFormV3Progress {
  phase: 'outline' | 'writing' | 'reviewing' | 'exporting' | 'complete';
  sectionIndex: number;
  totalSections: number;
  currentSection: string;
  percentComplete: number;
  wordCount: number;
}

export interface LongFormV3Section {
  title: string;
  content: string;
  wordCount: number;
  references: string[];
}

export interface LongFormV3Result {
  success: boolean;
  title: string;
  format: DocumentFormat;
  sections: LongFormV3Section[];
  fullContent: string;
  wordCount: number;
  references: string[];
  driveUrl?: string;
  audioPath?: string;
  generationMs: number;
  modelUsed?: string;
  error?: string;
}

// Section templates by document format
const FORMAT_SECTIONS: Record<DocumentFormat, string[]> = {
  markdown: ['Introdução', 'Desenvolvimento', 'Análise', 'Conclusão'],
  scientific: ['Abstract', 'Introdução', 'Metodologia', 'Resultados', 'Discussão', 'Conclusão', 'Referências'],
  report: ['Sumário Executivo', 'Contexto', 'Análise', 'Recomendações', 'Próximos Passos'],
  book_chapter: ['Introdução do Capítulo', 'Conceitos Fundamentais', 'Desenvolvimento', 'Exemplos Práticos', 'Resumo do Capítulo'],
  technical_spec: ['Visão Geral', 'Requisitos', 'Arquitetura', 'Implementação', 'Testes', 'Deployment'],
  // C305: Programming book — default 5 chapters (overridden by user-specified chapters)
  programming_book: ['Capítulo 1 — Fundamentos', 'Capítulo 2 — Tipos e Interfaces', 'Capítulo 3 — Generics', 'Capítulo 4 — Classes e OOP', 'Capítulo 5 — Async/Await'],
};

// C243b: Section generation model config
const SECTION_MODEL_PRIMARY = 'gemini-2.5-pro';
const SECTION_MODEL_FALLBACK = 'gpt-4o';
const SECTION_MAX_TOKENS = 8000;

// C305: Detect if topic is a programming/code-heavy request
function isProgrammingRequest(topic: string): boolean {
  const codeSignals = [
    'typescript', 'javascript', 'python', 'java', 'golang', 'rust', 'c++', 'c#',
    'programação', 'programacao', 'programming', 'código', 'codigo', 'code',
    'livro de programação', 'livro de programacao', 'programming book',
    'tutorial de código', 'exemplos de código', 'exemplos de codigo',
    'code examples', 'funcional', 'functional', 'algoritmo', 'algorithm',
    'react', 'node', 'express', 'angular', 'vue', 'next.js', 'nestjs',
    'sql', 'mongodb', 'api', 'rest', 'graphql', 'docker', 'kubernetes',
  ];
  const lower = topic.toLowerCase();
  return codeSignals.some(s => lower.includes(s));
}

// C305: Extract chapter structure from user query (e.g. "Capítulo 1 - Tipos básicos")
function extractChaptersFromQuery(query: string): string[] | null {
  // Match patterns like "Capítulo 1 - X, Capítulo 2 - Y" or "Chapter 1: X"
  const chapterPattern = /(?:cap[íi]tulo|chapter)\s*\d+\s*[-:—]\s*([^,\n.]+)/gi;
  const matches = [...query.matchAll(chapterPattern)];
  if (matches.length >= 2) {
    return matches.map(m => m[0].trim());
  }
  return null;
}

// C305: Build a code-aware section prompt for programming books
function buildCodeAwareSectionPrompt(
  sectionName: string,
  sectionIndex: number,
  totalSections: number,
  title: string,
  topic: string,
  outline: string,
  wordsPerSection: number,
  language: string,
  includeReferences: boolean,
): string {
  const isProg = isProgrammingRequest(topic);

  if (isProg) {
    // Detect the programming language from topic
    const langMatch = topic.match(/typescript|javascript|python|java\b|golang|rust|c\+\+|c#/i);
    const progLang = langMatch ? langMatch[0] : 'TypeScript';

    return `Você é MOTHER v122.19, especialista em documentação técnica e livros de programação.

Livro: "${title}"
Tópico: "${topic}"
Linguagem de programação: ${progLang}
Seção atual: "${sectionName}" (${sectionIndex + 1}/${totalSections})
Idioma do texto: ${language}
Tamanho alvo: aproximadamente ${wordsPerSection} palavras

Outline do livro:
${outline}

INSTRUÇÕES CRÍTICAS — VOCÊ DEVE SEGUIR TODAS:
1. Esta é uma seção de um LIVRO DE PROGRAMAÇÃO. Você DEVE incluir código ${progLang} REAL e FUNCIONAL.
2. Cada seção DEVE ter no mínimo 5 (cinco) blocos de código completos e funcionais em ${progLang}.
3. Use blocos de código Markdown: \`\`\`${progLang.toLowerCase()}\n...\n\`\`\`
4. O código deve ser REAL, COMPILÁVEL e EXECUTÁVEL — não pseudocódigo, não placeholder.
5. Cada bloco de código deve ter comentários explicativos em ${language}.
6. Após cada bloco de código, explique o que ele faz e por que é importante.
7. Inclua exemplos práticos do mundo real, não apenas "hello world".
8. Estrutura obrigatória por seção:
   - Introdução conceitual (2-3 parágrafos)
   - Exemplo 1: código básico com explicação
   - Exemplo 2: código intermediário com explicação
   - Exemplo 3: código avançado com explicação
   - Exemplo 4: caso de uso prático (aplicação real)
   - Exemplo 5: exercício resolvido com código completo
   - Resumo dos conceitos

Escreva a seção "${sectionName}" AGORA com código ${progLang} real e funcional:`;
  }

  // Default non-programming prompt (unchanged from original)
  return `Você é MOTHER v122.19, especialista em documentos técnicos e científicos de alta qualidade.

Documento: "${title}"
Tópico: "${topic}"
Seção atual: "${sectionName}" (${sectionIndex + 1}/${totalSections})
Idioma: ${language}
Palavras alvo para esta seção: ${wordsPerSection}

Outline do documento:
${outline}

Escreva a seção "${sectionName}" de forma completa, técnica e científica.
${includeReferences ? 'Inclua referências bibliográficas no formato [Autor, Ano].' : ''}
Escreva aproximadamente ${wordsPerSection} palavras. Seja detalhado e aprofundado.`;
}

/**
 * Detect if a query requests long-form document generation.
 * C305: Added programming_book detection.
 */
export function detectLongFormRequest(query: string): {
  isLongFormRequest: boolean;
  format?: DocumentFormat;
  estimatedWords?: number;
} {
  // C305: Check for programming book first (most specific)
  if (isProgrammingRequest(query) && /livro|book|manual|guia/i.test(query)) {
    const wordMatch = query.match(/\b(\d+)\s*(?:palavras|words)\b/i);
    return {
      isLongFormRequest: true,
      format: 'programming_book',
      estimatedWords: wordMatch ? parseInt(wordMatch[1]) : 15000,
    };
  }

  const patterns = [
    { pattern: /escrever.*(?:artigo|paper|relatório|report|documento|livro|capítulo)/i, format: 'report' as DocumentFormat },
    { pattern: /gerar.*(?:relatório|report|análise.*completa|documento.*completo)/i, format: 'report' as DocumentFormat },
    { pattern: /paper.*científico|artigo.*científico|scientific.*paper/i, format: 'scientific' as DocumentFormat },
    { pattern: /especificação.*técnica|technical.*spec|documentação.*técnica/i, format: 'technical_spec' as DocumentFormat },
    { pattern: /capítulo.*livro|book.*chapter/i, format: 'book_chapter' as DocumentFormat },
    { pattern: /\b(?:3000|5000|10000)\s*(?:palavras|words)\b/i, format: 'markdown' as DocumentFormat },
  ];

  for (const { pattern, format } of patterns) {
    if (pattern.test(query)) {
      const wordMatch = query.match(/\b(\d+)\s*(?:palavras|words)\b/i);
      return {
        isLongFormRequest: true,
        format,
        estimatedWords: wordMatch ? parseInt(wordMatch[1]) : 3000,
      };
    }
  }

  return { isLongFormRequest: false };
}

/**
 * Generate a long-form document with streaming progress.
 *
 * C243b: Section generation upgraded to gemini-2.5-pro (65K output tokens).
 * C305: Programming book support with code-aware section prompts.
 * C306: Parallel section generation (Promise.all) + live streaming via onChunk.
 */
export async function generateLongFormV3(request: LongFormV3Request): Promise<LongFormV3Result> {
  const start = Date.now();
  const language = request.language ?? 'pt-BR';
  const targetWords = request.targetWordCount ?? 3000;

  // C305: For programming books, extract chapter structure from the topic/query
  let sections = request.sections ?? FORMAT_SECTIONS[request.format];
  if (request.format === 'programming_book') {
    const extractedChapters = extractChaptersFromQuery(request.topic);
    if (extractedChapters && extractedChapters.length >= 2) {
      sections = extractedChapters;
    }
  }

  const wordsPerSection = Math.floor(targetWords / sections.length);
  const generatedSections: LongFormV3Section[] = new Array(sections.length);
  let totalWordCount = 0;
  const allReferences: string[] = [];
  let sectionModelUsed = SECTION_MODEL_PRIMARY;

  try {
    // Phase 1: Generate outline
    request.streamProgress?.({
      phase: 'outline',
      sectionIndex: 0,
      totalSections: sections.length,
      currentSection: 'Gerando estrutura...',
      percentComplete: 5,
      wordCount: 0,
    });

    // C305: Code-aware outline prompt for programming books
    const isProg = isProgrammingRequest(request.topic);
    const outlinePrompt = isProg
      ? `Você é MOTHER, especialista em livros de programação técnica.

Crie um outline detalhado para um LIVRO DE PROGRAMAÇÃO sobre: "${request.topic}"
Título: "${request.title}"
Capítulos: ${sections.join(', ')}

Para cada capítulo, liste:
1. Conceitos teóricos a cobrir
2. Pelo menos 5 exemplos de código específicos (com nomes de funções/classes reais)
3. Exercício prático final

Seja específico sobre QUAL código será escrito em cada capítulo.`
      : `Você é MOTHER, uma superinteligência especializada em geração de documentos científicos.

Crie um outline detalhado para um documento sobre: "${request.topic}"
Título: "${request.title}"
Formato: ${request.format}
Idioma: ${language}
Seções: ${sections.join(', ')}

Para cada seção, liste 3-5 pontos principais a cobrir. Seja específico e técnico.`;

    const outlineResult = await invokeLLM({
      messages: [{ role: 'user', content: outlinePrompt }],
      model: 'gpt-4o',
      maxTokens: 2000,
    });

    const outlineRaw = outlineResult.choices?.[0]?.message?.content ?? '';
    const outline = typeof outlineRaw === 'string' ? outlineRaw : JSON.stringify(outlineRaw);

    // C306: Emit outline as first chunk so frontend shows something immediately
    if (request.onChunk) {
      request.onChunk(`# ${request.title}\n\n`);
    }

    // Phase 2: C306 — Generate ALL sections in PARALLEL (Promise.all)
    // Scientific basis: Dean & Barroso (2013) CACM "The Tail at Scale"
    // Parallel fan-out: 5 sections × 60s sequential → max(60s) parallel = 5× speedup
    request.streamProgress?.({
      phase: 'writing',
      sectionIndex: 0,
      totalSections: sections.length,
      currentSection: 'Gerando todas as seções em paralelo...',
      percentComplete: 10,
      wordCount: 0,
    });

    const sectionPromises = sections.map(async (sectionName, i) => {
      const sectionPrompt = buildCodeAwareSectionPrompt(
        sectionName, i, sections.length,
        request.title, request.topic, outline,
        wordsPerSection, language,
        request.includeReferences !== false,
      );

      const sectionMaxTokens = Math.max(SECTION_MAX_TOKENS, wordsPerSection * 3);
      let content = '';
      let sectionAttempts = 0;

      while (sectionAttempts < 2) {
        const useGemini = sectionAttempts === 0;
        const model = useGemini ? SECTION_MODEL_PRIMARY : SECTION_MODEL_FALLBACK;
        const provider = useGemini ? 'google' : 'openai';
        const maxTokens = useGemini ? sectionMaxTokens : Math.min(sectionMaxTokens, 16000);

        try {
          const sectionResult = await invokeLLM({
            messages: [{ role: 'user', content: sectionPrompt }],
            model,
            provider: provider as any,
            maxTokens,
          });
          const rawCandidate = sectionResult.choices?.[0]?.message?.content ?? '';
          const text = typeof rawCandidate === 'string' ? rawCandidate : JSON.stringify(rawCandidate);

          if (text.trim().length > 50) {
            content = text;
            sectionModelUsed = model;
            break;
          }
          sectionAttempts++;
        } catch (sectionErr) {
          sectionAttempts++;
          if (sectionAttempts >= 2) throw sectionErr;
          console.warn(`[LongFormV3] ${model} failed for section "${sectionName}", retrying with ${SECTION_MODEL_FALLBACK}:`, sectionErr);
        }
      }

      // C306: Emit section content as it completes (live streaming)
      // Scientific basis: Nielsen (1994) Heuristic #1 — visibility of system status
      if (request.onChunk && content) {
        request.onChunk(`\n\n## ${sectionName}\n\n${content}`);
      }

      // C306: Emit progress for this section
      request.streamProgress?.({
        phase: 'writing',
        sectionIndex: i + 1,
        totalSections: sections.length,
        currentSection: sectionName,
        percentComplete: 10 + Math.floor(((i + 1) / sections.length) * 70),
        wordCount: content.split(/\s+/).length,
      });

      const wordCount = content.split(/\s+/).length;
      const refMatches = content.match(/\[([A-Z][a-z]+(?:\s+et\s+al\.?)?,\s*\d{4}[a-z]?)\]/g) ?? [];

      return {
        index: i,
        section: { title: sectionName, content, wordCount, references: refMatches } as LongFormV3Section,
        refs: refMatches,
      };
    });

    // Wait for all sections to complete in parallel
    const results = await Promise.all(sectionPromises);

    // Reassemble in order (parallel execution may complete out of order)
    for (const { index, section, refs } of results) {
      generatedSections[index] = section;
      totalWordCount += section.wordCount;
      allReferences.push(...refs);
    }

    // Phase 3: Review and assemble
    request.streamProgress?.({
      phase: 'reviewing',
      sectionIndex: sections.length,
      totalSections: sections.length,
      currentSection: 'Revisando documento...',
      percentComplete: 85,
      wordCount: totalWordCount,
    });

    const fullContent = [
      `# ${request.title}`,
      '',
      ...generatedSections.map(s => `## ${s.title}\n\n${s.content}`),
      '',
      request.includeReferences !== false && allReferences.length > 0
        ? `## Referências\n\n${[...new Set(allReferences)].map((r, idx) => `${idx + 1}. ${r}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n');

    // Phase 4: Export
    let driveUrl: string | undefined;
    let audioPath: string | undefined;

    if (request.exportToDrive) {
      request.streamProgress?.({
        phase: 'exporting',
        sectionIndex: sections.length,
        totalSections: sections.length,
        currentSection: 'Exportando para Google Drive...',
        percentComplete: 90,
        wordCount: totalWordCount,
      });

      const tmpPath = `/tmp/mother-longform-${Date.now()}.md`;
      fs.writeFileSync(tmpPath, fullContent, 'utf-8');
      const uploadResult = await uploadToDrive(tmpPath, `MOTHER-v7.0/docs/${request.title}.md`);
      driveUrl = uploadResult.shareableLink;
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }

    if (request.generateTTS) {
      const summary = generatedSections[0]?.content?.slice(0, 1000) ?? fullContent.slice(0, 1000);
      const ttsResult = await generateSpeech({
        text: `${request.title}. ${summary}`,
        voice: (request.ttsVoice as any) ?? 'onyx',
        model: 'tts-1',
        format: 'mp3',
      });
      audioPath = ttsResult.audioPath;
    }

    request.streamProgress?.({
      phase: 'complete',
      sectionIndex: sections.length,
      totalSections: sections.length,
      currentSection: 'Concluído!',
      percentComplete: 100,
      wordCount: totalWordCount,
    });

    return {
      success: true,
      title: request.title,
      format: request.format,
      sections: generatedSections,
      fullContent,
      wordCount: totalWordCount,
      references: [...new Set(allReferences)],
      driveUrl,
      audioPath,
      generationMs: Date.now() - start,
      modelUsed: sectionModelUsed,
    };
  } catch (err) {
    return {
      success: false,
      title: request.title,
      format: request.format,
      sections: generatedSections.filter(Boolean),
      fullContent: '',
      wordCount: totalWordCount,
      references: [],
      generationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
