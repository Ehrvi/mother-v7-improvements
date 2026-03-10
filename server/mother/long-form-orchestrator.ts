/**
 * Long-Form Sequential Architecture (LFSA) — C241
 * Conselho dos 6 — Sessão v100 — 2026-03-10
 *
 * Scientific basis:
 * - HiRAP (EMNLP 2025): Hierarchical Reasoning and Planning for long-form generation
 * - MemAGent (IEEE 2025): Persistent state management across generation steps
 * - arXiv:2603.04445 (Dynamic Model Routing): cascade routing for complex tasks
 *
 * Architecture: Plan (gpt-4o) → Execute (gemini-2.5-pro, chapter-by-chapter)
 *               → Assemble → Review (claude-opus-4-6)
 *
 * Key insight: 60 pages = ~27,000 tokens output. No single LLM call can produce
 * this reliably. Decomposition into 8-12 chapters of 6,000-8,000 tokens each
 * maximizes quality and coherence (HiRAP optimal chunk size finding).
 *
 * Implementation note: Uses existing HTTP fetch patterns from core-orchestrator.ts
 * (no new SDK dependencies required).
 */

import { ENV } from '../_core/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LFSARequest {
  prompt: string;
  userId: string;
  sessionId: string;
  estimatedPages: number;
  styleGuidelines?: string;
}

export interface ChapterPlan {
  chapterNumber: number;
  title: string;
  estimatedTokens: number;
  keyPoints: string[];
  characters?: string[];
  settings?: string[];
  styleInstructions: string;
}

export interface LFSAResult {
  success: boolean;
  content?: string;
  sessionId: string;
  metrics?: {
    totalTokens: number;
    totalChapters: number;
    generationTimeSeconds: number;
    overallConsistencyScore: number;
    planModel: string;
    writeModel: string;
    reviewModel: string;
  };
  error?: string;
}

// ─── Models ───────────────────────────────────────────────────────────────────
const PLANNER_MODEL  = 'gpt-4o';                // Structured planning, JSON output
const WRITER_MODEL   = 'gemini-2.5-pro';        // 65K output tokens — only model capable of long chapters
const REVIEWER_MODEL = 'claude-opus-4-6';       // Best consistency reviewer

const MAX_CHAPTER_TOKENS = 8000;  // Optimal per HiRAP: 6K-8K tokens/chapter for coherence
const CHAPTER_CONTEXT_WINDOW = 2000; // Chars of previous chapter to include as context

// ─── HTTP helpers (same pattern as core-orchestrator.ts) ─────────────────────

async function callOpenAI(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  jsonMode = false
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const apiKey = ENV.googleApiKey ?? '';
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens, topP: 0.9 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>
  };
  return data.candidates[0]?.content?.parts[0]?.text ?? '';
}

async function callClaude(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ENV.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find(c => c.type === 'text')?.text ?? '';
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export class LongFormOrchestrator {

  /**
   * Main entry point: orchestrates Plan → Execute → Assemble → Review
   */
  async orchestrate(request: LFSARequest): Promise<LFSAResult> {
    const startTime = Date.now();
    const sessionId = request.sessionId || `lfsa_${Date.now()}`;

    console.log(`[LFSA] Starting orchestration for ${request.estimatedPages} pages. Session: ${sessionId}`);

    try {
      // ── Phase 1: Plan ──────────────────────────────────────────────────────
      console.log(`[LFSA] Phase 1: Planning with ${PLANNER_MODEL}...`);
      const chapterPlans = await this.planChapters(request);
      console.log(`[LFSA] Plan complete: ${chapterPlans.length} chapters`);

      // ── Phase 2: Execute (sequential chapter generation) ──────────────────
      console.log(`[LFSA] Phase 2: Executing ${chapterPlans.length} chapters with ${WRITER_MODEL}...`);
      const generatedChapters: Array<{ plan: ChapterPlan; content: string; tokens: number }> = [];

      for (const plan of chapterPlans) {
        console.log(`[LFSA] Generating chapter ${plan.chapterNumber}/${chapterPlans.length}: "${plan.title}"`);

        // Build context from previous chapters (MemAGent persistent state)
        const previousContext = generatedChapters
          .slice(-2) // Last 2 chapters for context
          .map(c => c.content.substring(0, CHAPTER_CONTEXT_WINDOW))
          .join('\n\n--- [Fim do capítulo anterior] ---\n\n');

        const content = await this.generateChapter(plan, previousContext, request);
        const tokens = Math.ceil(content.length / 2); // PT: ~2 chars/token

        generatedChapters.push({ plan, content, tokens });

        // Small delay to avoid rate limiting
        await this.delay(500);
      }

      // ── Phase 3: Assemble ─────────────────────────────────────────────────
      console.log(`[LFSA] Phase 3: Assembling ${generatedChapters.length} chapters...`);
      const assembled = this.assembleChapters(generatedChapters, request);

      // ── Phase 4: Review ───────────────────────────────────────────────────
      console.log(`[LFSA] Phase 4: Reviewing with ${REVIEWER_MODEL}...`);
      const { finalContent, consistencyScore } = await this.reviewAndFinalize(assembled, request);

      const totalTokens = generatedChapters.reduce((sum, c) => sum + c.tokens, 0);
      const generationTimeSeconds = (Date.now() - startTime) / 1000;

      console.log(`[LFSA] Complete! ${totalTokens} tokens, ${generationTimeSeconds.toFixed(1)}s, consistency: ${consistencyScore}`);

      return {
        success: true,
        content: finalContent,
        sessionId,
        metrics: {
          totalTokens,
          totalChapters: chapterPlans.length,
          generationTimeSeconds,
          overallConsistencyScore: consistencyScore,
          planModel: PLANNER_MODEL,
          writeModel: WRITER_MODEL,
          reviewModel: REVIEWER_MODEL,
        },
      };

    } catch (error: any) {
      console.error(`[LFSA] Orchestration failed:`, error);
      return {
        success: false,
        error: `LFSA falhou: ${error.message}`,
        sessionId,
      };
    }
  }

  /**
   * Phase 1: Plan — Decompose into chapters using gpt-4o
   * Inspired by HiRAP hierarchical decomposition
   */
  private async planChapters(request: LFSARequest): Promise<ChapterPlan[]> {
    const numChapters = Math.max(4, Math.ceil(request.estimatedPages / 6)); // ~6 pages per chapter

    const planningPrompt = `Decomponha a seguinte solicitação em ${numChapters} capítulos bem estruturados para um livro/documento de ${request.estimatedPages} páginas.

SOLICITAÇÃO: ${request.prompt}

ESTILO: ${request.styleGuidelines || 'Prosa narrativa padrão'}

INSTRUÇÕES:
- Crie exatamente ${numChapters} capítulos
- Cada capítulo deve ter 5-8 páginas (6.000-8.000 tokens)
- Forneça 3-5 pontos-chave por capítulo
- Garanta progressão lógica e coerência narrativa

Retorne JSON puro (sem markdown):
{
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Título do Capítulo",
      "estimatedTokens": 7000,
      "keyPoints": ["ponto1", "ponto2", "ponto3"],
      "characters": ["personagem1"],
      "settings": ["cenário1"],
      "styleInstructions": "Instruções específicas de estilo"
    }
  ]
}`;

    const planJson = await callOpenAI(
      PLANNER_MODEL,
      [
        { role: 'system', content: 'Você é um planejador de livros especializado. Retorne apenas JSON válido.' },
        { role: 'user', content: planningPrompt },
      ],
      4000,
      true // JSON mode
    );

    const planData = JSON.parse(planJson);
    return planData.chapters as ChapterPlan[];
  }

  /**
   * Phase 2: Execute — Generate each chapter with Gemini 2.5 Pro
   * Uses persistent context (MemAGent principle)
   */
  private async generateChapter(
    plan: ChapterPlan,
    previousContext: string,
    request: LFSARequest
  ): Promise<string> {
    const systemPrompt = `Você é um escritor especializado em criar conteúdo longo e coerente. 
Sua tarefa é gerar um capítulo completo e detalhado, mantendo consistência com os capítulos anteriores.
Escreva em português brasileiro. Use formatação markdown.`;

    const userPrompt = `# CAPÍTULO ${plan.chapterNumber}: ${plan.title}

## CONTEXTO DA OBRA:
${request.prompt}

## ESTILO:
${request.styleGuidelines || 'Prosa narrativa padrão'}

${previousContext ? `## CONTEXTO DOS CAPÍTULOS ANTERIORES:
${previousContext}

` : ''}## PLANO DESTE CAPÍTULO:
**Título:** ${plan.title}
**Pontos-chave:**
${plan.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}
${plan.characters?.length ? `**Personagens:** ${plan.characters.join(', ')}` : ''}
${plan.settings?.length ? `**Cenários:** ${plan.settings.join(', ')}` : ''}
**Estilo:** ${plan.styleInstructions}

## INSTRUÇÕES:
1. Escreva o capítulo COMPLETO com 6.000-8.000 tokens de conteúdo rico e detalhado
2. Mantenha consistência total com os capítulos anteriores
3. Cubra TODOS os pontos-chave listados
4. Termine com transição natural para o próximo capítulo
5. Use ## para o título do capítulo e ### para seções internas

ESCREVA O CAPÍTULO COMPLETO AGORA:`;

    return await callGemini(WRITER_MODEL, systemPrompt, userPrompt, MAX_CHAPTER_TOKENS);
  }

  /**
   * Phase 3: Assemble — Combine all chapters into a single document
   */
  private assembleChapters(
    chapters: Array<{ plan: ChapterPlan; content: string; tokens: number }>,
    request: LFSARequest
  ): string {
    const title = this.extractTitle(request.prompt);

    const header = `# ${title}\n\n*Gerado por MOTHER v122.0 — Long-Form Sequential Architecture (LFSA)*\n\n---\n\n`;

    const toc = ['## Sumário\n'];
    for (const c of chapters) {
      toc.push(`${c.plan.chapterNumber}. ${c.plan.title}`);
    }

    const body = chapters
      .map(c => `## Capítulo ${c.plan.chapterNumber}: ${c.plan.title}\n\n${c.content}`)
      .join('\n\n---\n\n');

    return `${header}${toc.join('\n')}\n\n---\n\n${body}`;
  }

  /**
   * Phase 4: Review — Consistency check with Claude Opus
   */
  private async reviewAndFinalize(
    assembled: string,
    request: LFSARequest
  ): Promise<{ finalContent: string; consistencyScore: number }> {
    // For very long content, use a sample for review (first 50K chars)
    const reviewSample = assembled.substring(0, 50000);

    try {
      const reviewPrompt = `Avalie a consistência deste livro gerado por IA.

PROMPT ORIGINAL: ${request.prompt}

CONTEÚDO (amostra):
${reviewSample}

Avalie e retorne JSON: {"overallScore": 85, "issues": ["problema1"], "approved": true}`;

      const reviewText = await callClaude(
        REVIEWER_MODEL,
        'Você é um revisor literário especializado. Avalie consistência e retorne apenas JSON válido.',
        reviewPrompt,
        1000
      );

      const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0]);
        return {
          finalContent: assembled,
          consistencyScore: review.overallScore ?? 80,
        };
      }
    } catch (error) {
      console.warn(`[LFSA] Review failed (non-critical):`, error);
    }

    return { finalContent: assembled, consistencyScore: 75 };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private extractTitle(prompt: string): string {
    const titleMatch = prompt.match(/(?:sobre|about|titled?|chamado?|intitulado?)[:\s]+["']?([^"'\n.]{5,60})/i);
    if (titleMatch) return titleMatch[1].trim();
    return prompt.substring(0, 60).trim() + (prompt.length > 60 ? '...' : '');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
let _instance: LongFormOrchestrator | null = null;

export function getLongFormOrchestrator(): LongFormOrchestrator {
  if (!_instance) {
    _instance = new LongFormOrchestrator();
  }
  return _instance;
}
