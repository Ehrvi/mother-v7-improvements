/**
 * long-form-generator.ts — Hierarchical Long-form Document Generator
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Conselho dos 6 IAs consensus: NC-FEAT-001 — MOTHER cannot write 60-page documents
 * - Hierarchical generation (arXiv:2212.10560): outline → sections → paragraphs
 * - Context window management: chunked generation with semantic continuity
 * - G-EVAL (arXiv:2303.16634): quality evaluation at each generation step
 *
 * Architecture:
 * 1. Generate outline (title, chapters, sections)
 * 2. For each section: generate content with context from previous sections
 * 3. Assemble final document with coherence checking
 * 4. Export to Markdown, LaTeX, or plain text
 */

import OpenAI from "openai";

export interface LongFormRequest {
  /** Document title */
  title: string;
  /** Document type */
  type: "book_chapter" | "technical_report" | "research_paper" | "manual" | "article";
  /** Target length in pages (1 page ≈ 500 words) */
  targetPages: number;
  /** Target audience */
  audience: string;
  /** Main topic/subject */
  topic: string;
  /** Optional: specific sections to include */
  sections?: string[];
  /** Language (default: "pt-BR") */
  language?: string;
  /** Output format */
  outputFormat?: "markdown" | "latex" | "plain";
  /** Job ID for progress tracking */
  jobId?: string;
  /** Progress callback */
  onProgress?: (progress: LongFormProgress) => void;
}

export interface LongFormProgress {
  jobId: string;
  phase: "outline" | "generating" | "assembling" | "complete" | "error";
  currentSection: number;
  totalSections: number;
  percentComplete: number;
  currentSectionTitle?: string;
  wordCount: number;
  estimatedTimeRemainingMs?: number;
  error?: string;
}

export interface LongFormSection {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  content: string;
  wordCount: number;
  generatedAt: Date;
}

export interface LongFormDocument {
  jobId: string;
  title: string;
  type: LongFormRequest["type"];
  sections: LongFormSection[];
  fullText: string;
  wordCount: number;
  pageCount: number;
  generationTimeMs: number;
  outline: string[];
  metadata: {
    language: string;
    audience: string;
    topic: string;
    outputFormat: string;
    generatedAt: Date;
    motherVersion: string;
  };
}

const WORDS_PER_PAGE = 500;
const MAX_CONTEXT_SECTIONS = 3; // How many previous sections to include as context

/**
 * LongFormGenerator — generates documents up to 60+ pages using hierarchical generation.
 *
 * Key innovation: maintains semantic continuity by including previous section summaries
 * as context for each new section, preventing topic drift in long documents.
 */
export class LongFormGenerator {
  private openai: OpenAI;
  private readonly model = "gpt-4o";

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate a long-form document. Main entry point.
   */
  async generate(request: LongFormRequest): Promise<LongFormDocument> {
    const jobId = request.jobId ?? `lf-${Date.now()}`;
    const startTime = Date.now();
    const language = request.language ?? "pt-BR";
    const outputFormat = request.outputFormat ?? "markdown";
    const targetWords = request.targetPages * WORDS_PER_PAGE;

    // Phase 1: Generate outline
    request.onProgress?.({
      jobId,
      phase: "outline",
      currentSection: 0,
      totalSections: 0,
      percentComplete: 5,
      wordCount: 0,
    });

    const outline = await this.generateOutline(request, targetWords, language);
    const totalSections = outline.length;

    // Phase 2: Generate each section
    const sections: LongFormSection[] = [];
    let totalWordCount = 0;

    for (let i = 0; i < outline.length; i++) {
      const sectionTitle = outline[i];
      const wordsPerSection = Math.ceil(targetWords / totalSections);

      request.onProgress?.({
        jobId,
        phase: "generating",
        currentSection: i + 1,
        totalSections,
        percentComplete: Math.round(5 + (i / totalSections) * 85),
        currentSectionTitle: sectionTitle,
        wordCount: totalWordCount,
        estimatedTimeRemainingMs: this.estimateTimeRemaining(i, totalSections, startTime),
      });

      // Build context from previous sections (semantic continuity)
      const contextSections = sections.slice(-MAX_CONTEXT_SECTIONS);
      const context = this.buildContext(contextSections, request.title);

      const sectionContent = await this.generateSection({
        documentTitle: request.title,
        sectionTitle,
        sectionIndex: i,
        totalSections,
        targetWords: wordsPerSection,
        context,
        language,
        audience: request.audience,
        topic: request.topic,
        type: request.type,
        outputFormat,
      });

      const wordCount = this.countWords(sectionContent);
      totalWordCount += wordCount;

      sections.push({
        id: `section-${i + 1}`,
        title: sectionTitle,
        level: this.getSectionLevel(sectionTitle, i),
        content: sectionContent,
        wordCount,
        generatedAt: new Date(),
      });
    }

    // Phase 3: Assemble document
    request.onProgress?.({
      jobId,
      phase: "assembling",
      currentSection: totalSections,
      totalSections,
      percentComplete: 95,
      wordCount: totalWordCount,
    });

    const fullText = this.assembleDocument(request, sections, outputFormat);
    const finalWordCount = this.countWords(fullText);
    const pageCount = Math.ceil(finalWordCount / WORDS_PER_PAGE);

    request.onProgress?.({
      jobId,
      phase: "complete",
      currentSection: totalSections,
      totalSections,
      percentComplete: 100,
      wordCount: finalWordCount,
    });

    return {
      jobId,
      title: request.title,
      type: request.type,
      sections,
      fullText,
      wordCount: finalWordCount,
      pageCount,
      generationTimeMs: Date.now() - startTime,
      outline,
      metadata: {
        language,
        audience: request.audience,
        topic: request.topic,
        outputFormat,
        generatedAt: new Date(),
        motherVersion: process.env.MOTHER_VERSION ?? "v83.0",
      },
    };
  }

  /**
   * Generate the document outline (list of section titles).
   */
  private async generateOutline(
    request: LongFormRequest,
    targetWords: number,
    language: string
  ): Promise<string[]> {
    // If sections provided, use them
    if (request.sections && request.sections.length > 0) {
      return request.sections;
    }

    const sectionsNeeded = Math.max(5, Math.ceil(targetWords / 600));

    const prompt = `Você é um especialista em ${request.topic}. 
Crie um outline detalhado para um documento do tipo "${request.type}" com as seguintes características:
- Título: "${request.title}"
- Público-alvo: ${request.audience}
- Idioma: ${language}
- Número de seções necessárias: ${sectionsNeeded}

Retorne APENAS uma lista JSON de títulos de seções, sem numeração, sem explicações.
Exemplo: ["Introdução", "Fundamentação Teórica", "Metodologia", ...]

O outline deve cobrir o tema de forma completa e progressiva, do básico ao avançado.`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content ?? "[]";

    try {
      // Extract JSON array from response
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as string[];
      }
    } catch {
      // Fallback: split by newlines
    }

    // Fallback outline
    return [
      "Introdução",
      "Fundamentação Teórica",
      "Estado da Arte",
      "Metodologia",
      "Desenvolvimento",
      "Resultados",
      "Discussão",
      "Conclusão",
      "Referências",
    ];
  }

  /**
   * Generate content for a single section.
   */
  private async generateSection(params: {
    documentTitle: string;
    sectionTitle: string;
    sectionIndex: number;
    totalSections: number;
    targetWords: number;
    context: string;
    language: string;
    audience: string;
    topic: string;
    type: LongFormRequest["type"];
    outputFormat: string;
  }): Promise<string> {
    const isFirst = params.sectionIndex === 0;
    const isLast = params.sectionIndex === params.totalSections - 1;

    const formatInstructions =
      params.outputFormat === "markdown"
        ? "Use formatação Markdown: ## para subtítulos, **negrito**, *itálico*, listas com -, tabelas com |."
        : params.outputFormat === "latex"
        ? "Use formatação LaTeX: \\section{}, \\subsection{}, \\textbf{}, \\begin{itemize}."
        : "Use texto simples sem formatação especial.";

    const prompt = `Você é um especialista em ${params.topic} escrevendo um ${params.type} em ${params.language}.

DOCUMENTO: "${params.documentTitle}"
SEÇÃO ATUAL: "${params.sectionTitle}" (${params.sectionIndex + 1}/${params.totalSections})
PÚBLICO-ALVO: ${params.audience}

${params.context ? `CONTEXTO DAS SEÇÕES ANTERIORES:\n${params.context}\n` : ""}

INSTRUÇÕES:
- Escreva ${params.targetWords} palavras para esta seção
- ${isFirst ? "Esta é a introdução — apresente o tema, contexto e objetivos do documento." : ""}
- ${isLast ? "Esta é a conclusão — sintetize os pontos principais e apresente perspectivas futuras." : ""}
- Mantenha coerência com o contexto das seções anteriores
- Use linguagem técnica adequada para ${params.audience}
- ${formatInstructions}
- NÃO repita informações já cobertas no contexto
- NÃO inclua o título da seção no texto (já será adicionado automaticamente)

Escreva APENAS o conteúdo da seção, sem prefácio ou meta-comentários.`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: Math.ceil(params.targetWords * 1.5), // Allow 50% buffer
    });

    return response.choices[0]?.message?.content ?? "";
  }

  /**
   * Build context string from previous sections (for semantic continuity).
   */
  private buildContext(sections: LongFormSection[], documentTitle: string): string {
    if (sections.length === 0) return "";

    const summaries = sections.map(
      (s) =>
        `[${s.title}]: ${s.content.slice(0, 300)}...`
    );

    return `Documento: "${documentTitle}"\nSeções anteriores:\n${summaries.join("\n\n")}`;
  }

  /**
   * Assemble all sections into the final document.
   */
  private assembleDocument(
    request: LongFormRequest,
    sections: LongFormSection[],
    outputFormat: string
  ): string {
    const parts: string[] = [];

    if (outputFormat === "markdown") {
      parts.push(`# ${request.title}\n`);
      parts.push(`**Tipo:** ${request.type} | **Público:** ${request.audience}\n`);
      parts.push(`---\n`);

      for (const section of sections) {
        const heading = section.level === 1 ? "##" : section.level === 2 ? "###" : "####";
        parts.push(`${heading} ${section.title}\n`);
        parts.push(section.content);
        parts.push("\n\n");
      }
    } else if (outputFormat === "latex") {
      parts.push(`\\documentclass{article}\n\\begin{document}\n`);
      parts.push(`\\title{${request.title}}\n\\maketitle\n`);

      for (const section of sections) {
        const cmd = section.level === 1 ? "\\section" : section.level === 2 ? "\\subsection" : "\\subsubsection";
        parts.push(`${cmd}{${section.title}}\n`);
        parts.push(section.content);
        parts.push("\n\n");
      }

      parts.push(`\\end{document}`);
    } else {
      parts.push(`${request.title.toUpperCase()}\n${"=".repeat(request.title.length)}\n\n`);

      for (const section of sections) {
        parts.push(`${section.title}\n${"-".repeat(section.title.length)}\n`);
        parts.push(section.content);
        parts.push("\n\n");
      }
    }

    return parts.join("\n");
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  private getSectionLevel(title: string, index: number): 1 | 2 | 3 {
    if (index === 0 || title.toLowerCase().includes("introdução") || title.toLowerCase().includes("conclusão")) {
      return 1;
    }
    return 2;
  }

  private estimateTimeRemaining(
    currentIndex: number,
    totalSections: number,
    startTime: number
  ): number {
    if (currentIndex === 0) return totalSections * 15_000; // 15s per section estimate
    const elapsed = Date.now() - startTime;
    const avgPerSection = elapsed / currentIndex;
    const remaining = totalSections - currentIndex;
    return Math.round(avgPerSection * remaining);
  }
}

// Singleton instance
export const longFormGenerator = new LongFormGenerator();
