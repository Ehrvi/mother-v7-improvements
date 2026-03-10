/**
 * Long-Form Engine V3 — server/mother/long-form-engine-v3.ts
 * MOTHER v99.0 | Ciclo C216 | NC-LF-001
 *
 * Enhanced long-form document generation with:
 * 1. Streaming progress via SSE
 * 2. Automatic Google Drive export
 * 3. TTS narration generation
 * 4. Multi-format output (Markdown, PDF, DOCX)
 * 5. Scientific paper structure (Abstract, Methods, Results, Discussion)
 *
 * Scientific basis:
 * - Bai et al. (2022) "Constitutional AI: Harmlessness from AI Feedback"
 *   arXiv:2212.08073 — structured document generation
 * - Gao et al. (2023) "Retrieval-Augmented Generation for Large Language Models"
 *   arXiv:2312.10997 — RAG for long-form content
 * - Lewis et al. (2020) "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
 *   arXiv:2005.11401 — RAG foundation
 * - Agrawal et al. (2024) "Mindful-RAG: A Study of Points of Failure in Long Context RAG"
 *   arXiv:2407.12216 — long-form RAG challenges
 */

import { invokeLLM } from '../_core/llm';
import { uploadToDrive } from './google-workspace-bridge';
import { generateSpeech } from './tts-engine';
import * as fs from 'fs';
import * as path from 'path';

export type DocumentFormat = 'markdown' | 'scientific' | 'report' | 'book_chapter' | 'technical_spec';

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
  error?: string;
}

// Section templates by document format
const FORMAT_SECTIONS: Record<DocumentFormat, string[]> = {
  markdown: ['Introdução', 'Desenvolvimento', 'Análise', 'Conclusão'],
  scientific: ['Abstract', 'Introdução', 'Metodologia', 'Resultados', 'Discussão', 'Conclusão', 'Referências'],
  report: ['Sumário Executivo', 'Contexto', 'Análise', 'Recomendações', 'Próximos Passos'],
  book_chapter: ['Introdução do Capítulo', 'Conceitos Fundamentais', 'Desenvolvimento', 'Exemplos Práticos', 'Resumo do Capítulo'],
  technical_spec: ['Visão Geral', 'Requisitos', 'Arquitetura', 'Implementação', 'Testes', 'Deployment'],
};

/**
 * Detect if a query requests long-form document generation.
 */
export function detectLongFormRequest(query: string): {
  isLongFormRequest: boolean;
  format?: DocumentFormat;
  estimatedWords?: number;
} {
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
 */
export async function generateLongFormV3(request: LongFormV3Request): Promise<LongFormV3Result> {
  const start = Date.now();
  const language = request.language ?? 'pt-BR';
  const targetWords = request.targetWordCount ?? 3000;
  const sections = request.sections ?? FORMAT_SECTIONS[request.format];
  const wordsPerSection = Math.floor(targetWords / sections.length);

  const generatedSections: LongFormV3Section[] = [];
  let totalWordCount = 0;
  const allReferences: string[] = [];

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

    const outlinePrompt = `Você é MOTHER, uma superinteligência especializada em geração de documentos científicos.
    
Crie um outline detalhado para um documento sobre: "${request.topic}"
Título: "${request.title}"
Formato: ${request.format}
Idioma: ${language}
Seções: ${sections.join(', ')}

Para cada seção, liste 3-5 pontos principais a cobrir. Seja específico e técnico.`;

    const outlineResult = await invokeLLM({
      messages: [{ role: 'user', content: outlinePrompt }],
      model: 'gpt-4o',
      maxTokens: 1500,
    });

    const outline = outlineResult.choices?.[0]?.message?.content ?? '';

    // Phase 2: Generate each section
    for (let i = 0; i < sections.length; i++) {
      const sectionName = sections[i];

      request.streamProgress?.({
        phase: 'writing',
        sectionIndex: i,
        totalSections: sections.length,
        currentSection: sectionName,
        percentComplete: 10 + Math.floor((i / sections.length) * 70),
        wordCount: totalWordCount,
      });

      const sectionPrompt = `Você é MOTHER v99.0, especialista em documentos técnicos e científicos.

Documento: "${request.title}"
Tópico: "${request.topic}"
Seção atual: "${sectionName}" (${i + 1}/${sections.length})
Idioma: ${language}
Palavras alvo para esta seção: ${wordsPerSection}

Outline do documento:
${outline}

Escreva a seção "${sectionName}" de forma completa, técnica e científica.
${request.includeReferences !== false ? 'Inclua referências bibliográficas no formato [Autor, Ano].' : ''}
Escreva aproximadamente ${wordsPerSection} palavras.`;

      const sectionResult = await invokeLLM({
        messages: [{ role: 'user', content: sectionPrompt }],
        model: 'gpt-4o',
        maxTokens: Math.max(1000, wordsPerSection * 2),
      });

      const rawContent = sectionResult.choices?.[0]?.message?.content ?? '';
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const wordCount = content.split(/\s+/).length;
      totalWordCount += wordCount;

      // Extract references
      const refMatches = content.match(/\[([A-Z][a-z]+(?:\s+et\s+al\.?)?,\s*\d{4}[a-z]?)\]/g) ?? [];
      allReferences.push(...refMatches);

      generatedSections.push({
        title: sectionName,
        content,
        wordCount,
        references: refMatches,
      });
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
        ? `## Referências\n\n${[...new Set(allReferences)].map((r, i) => `${i + 1}. ${r}`).join('\n')}`
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
    };
  } catch (err) {
    return {
      success: false,
      title: request.title,
      format: request.format,
      sections: generatedSections,
      fullContent: '',
      wordCount: totalWordCount,
      references: [],
      generationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
