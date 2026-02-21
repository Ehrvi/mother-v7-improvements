/**
 * Critical Thinking Central - MOTHER v13 8-Phase Meta-Learning Process
 * 
 * Purpose: Enable MOTHER to improve response quality through self-reflection and meta-learning
 * 
 * 8-Phase Process:
 * 1. Respond WITHOUT GOD knowledge (baseline)
 * 2. Self-evaluate quality (identify gaps)
 * 3. Acquire GOD knowledge (deep research)
 * 4. Respond WITH GOD knowledge (improved)
 * 5. Compare objectively (metrics)
 * 6. Understand quality checking (Guardian analysis)
 * 7. Self-understand nanoscale (system introspection)
 * 8. Document as Critical Thinking Central
 * 
 * Based on: mother-v13-learning/docs/critical_thinking/CRITICAL_THINKING_CENTRAL.md
 */

import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { knowledge } from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from '../lib/logger';

export interface CriticalThinkingConfig {
  enabled: boolean;
  complexityThreshold: number; // Only use CT for complex queries (70+)
  qualityThreshold: number; // Only use CT if baseline quality < 95
  maxIterations: number; // Max CT iterations (prevent infinite loops)
}

export interface CriticalThinkingResult {
  baselineResponse: string;
  baselineQuality: number;
  gaps: string[];
  godKnowledge: string[];
  improvedResponse: string;
  improvedQuality: number;
  qualityImprovement: number;
  guardianInsights: string[];
  systemIntrospection: string;
  documentation: string;
  iterations: number;
}

export class CriticalThinkingCentral {
  private config: CriticalThinkingConfig;

  constructor(config: Partial<CriticalThinkingConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? false, // Disabled by default (feature flag)
      complexityThreshold: config.complexityThreshold ?? 70,
      qualityThreshold: config.qualityThreshold ?? 95,
      maxIterations: config.maxIterations ?? 3,
    };
  }

  /**
   * Execute Critical Thinking Central 8-phase process
   */
  async execute(query: string, complexityScore: number): Promise<CriticalThinkingResult | null> {
    if (!this.config.enabled) {
      return null; // CT disabled
    }

    if (complexityScore < this.config.complexityThreshold) {
      return null; // Query too simple for CT
    }

    try {
      // Phase 1: Respond WITHOUT GOD knowledge (baseline)
      const baselineResponse = await this.phase1_baseline(query);

      // Phase 2: Self-evaluate quality (identify gaps)
      const { quality: baselineQuality, gaps } = await this.phase2_evaluate(query, baselineResponse);

      if (baselineQuality >= this.config.qualityThreshold) {
        return null; // Quality already good enough, skip CT
      }

      // Phase 3: Acquire GOD knowledge (deep research)
      const godKnowledge = await this.phase3_acquire(query, gaps);

      // Phase 4: Respond WITH GOD knowledge (improved)
      const improvedResponse = await this.phase4_improve(query, baselineResponse, godKnowledge);

      // Phase 5: Compare objectively (metrics)
      const { quality: improvedQuality, improvement } = await this.phase5_compare(
        query,
        baselineResponse,
        improvedResponse
      );

      // Phase 6: Understand quality checking (Guardian analysis)
      const guardianInsights = await this.phase6_understand(query, baselineResponse, improvedResponse);

      // Phase 7: Self-understand nanoscale (system introspection)
      const systemIntrospection = await this.phase7_introspect(
        query,
        baselineQuality,
        improvedQuality,
        gaps,
        godKnowledge
      );

      // Phase 8: Document as Critical Thinking Central
      const documentation = await this.phase8_document(
        query,
        baselineResponse,
        improvedResponse,
        gaps,
        godKnowledge,
        guardianInsights,
        systemIntrospection
      );

      return {
        baselineResponse,
        baselineQuality,
        gaps,
        godKnowledge,
        improvedResponse,
        improvedQuality,
        qualityImprovement: improvement,
        guardianInsights,
        systemIntrospection,
        documentation,
        iterations: 1,
      };
    } catch (error) {
      logger.error("[Critical Thinking] Error:", error);
      return null; // Fail gracefully
    }
  }

  /**
   * Phase 1: Respond WITHOUT GOD knowledge (baseline)
   */
  private async phase1_baseline(query: string): Promise<string> {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are MOTHER AI. Respond to the query using ONLY your training data. Do NOT search for additional information.",
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    return typeof response.choices[0].message.content === "string" ? response.choices[0].message.content : "";
  }

  /**
   * Phase 2: Self-evaluate quality (identify gaps)
   */
  private async phase2_evaluate(query: string, response: string): Promise<{ quality: number; gaps: string[] }> {
    const evaluation = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a quality evaluator. Analyze the response and identify gaps.

Return JSON:
{
  "quality": <0-100>,
  "gaps": ["gap1", "gap2", ...]
}

Quality criteria:
- Completeness: All aspects addressed
- Accuracy: Factually correct
- Relevance: Answers the question
- Clarity: Well-structured
- Depth: Sufficient detail`,
        },
        {
          role: "user",
          content: `Query: ${query}\n\nResponse: ${response}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quality_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              quality: { type: "number", description: "Quality score 0-100" },
              gaps: {
                type: "array",
                items: { type: "string" },
                description: "List of identified gaps",
              },
            },
            required: ["quality", "gaps"],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(typeof evaluation.choices[0].message.content === "string" ? evaluation.choices[0].message.content : "{}");
    return {
      quality: result.quality || 0,
      gaps: result.gaps || [],
    };
  }

  /**
   * Phase 3: Acquire GOD knowledge (deep research)
   */
  private async phase3_acquire(query: string, gaps: string[]): Promise<string[]> {
    const db = await getDb();
    const godKnowledge: string[] = [];

    // Search knowledge base for relevant entries
    if (!db) {
      logger.warn('[Critical Thinking] Database not available');
      // Continue with LLM-only research
    } else {
      try {
        const relevantKnowledge = await db
          .select()
        .from(knowledge)
        .where(sql`MATCH(content) AGAINST(${query} IN NATURAL LANGUAGE MODE)`)
        .limit(5);

      for (const entry of relevantKnowledge) {
        godKnowledge.push(entry.content);
      }
    } catch (error) {
      logger.warn("[Critical Thinking] Knowledge search failed:", error);
      }
    }

    // If gaps identified, acquire additional knowledge via LLM
    if (gaps.length > 0) {
      const research = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a research assistant. For each gap, provide deep knowledge from authoritative sources.

Return JSON:
{
  "knowledge": ["fact1", "fact2", ...]
}`,
          },
          {
            role: "user",
            content: `Query: ${query}\n\nGaps identified:\n${gaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "god_knowledge",
            strict: true,
            schema: {
              type: "object",
              properties: {
                knowledge: {
                  type: "array",
                  items: { type: "string" },
                  description: "Deep knowledge facts",
                },
              },
              required: ["knowledge"],
              additionalProperties: false,
            },
          },
        },
      });

      const result = JSON.parse(typeof research.choices[0].message.content === "string" ? research.choices[0].message.content : "{}");
      godKnowledge.push(...(result.knowledge || []));
    }

    return godKnowledge;
  }

  /**
   * Phase 4: Respond WITH GOD knowledge (improved)
   */
  private async phase4_improve(query: string, baselineResponse: string, godKnowledge: string[]): Promise<string> {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are MOTHER AI. Improve the baseline response using the provided GOD-level knowledge.

Baseline response:
${baselineResponse}

GOD-level knowledge:
${godKnowledge.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Provide an improved response that incorporates this deep knowledge.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    return typeof response.choices[0].message.content === "string" ? response.choices[0].message.content : "";
  }

  /**
   * Phase 5: Compare objectively (metrics)
   */
  private async phase5_compare(
    query: string,
    baselineResponse: string,
    improvedResponse: string
  ): Promise<{ quality: number; improvement: number }> {
    const comparison = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a quality evaluator. Compare baseline vs improved responses.

Return JSON:
{
  "baseline_quality": <0-100>,
  "improved_quality": <0-100>,
  "improvement": <percentage>
}`,
        },
        {
          role: "user",
          content: `Query: ${query}\n\nBaseline:\n${baselineResponse}\n\nImproved:\n${improvedResponse}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quality_comparison",
          strict: true,
          schema: {
            type: "object",
            properties: {
              baseline_quality: { type: "number" },
              improved_quality: { type: "number" },
              improvement: { type: "number" },
            },
            required: ["baseline_quality", "improved_quality", "improvement"],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(typeof comparison.choices[0].message.content === "string" ? comparison.choices[0].message.content : "{}");
    return {
      quality: result.improved_quality || 0,
      improvement: result.improvement || 0,
    };
  }

  /**
   * Phase 6: Understand quality checking (Guardian analysis)
   */
  private async phase6_understand(
    query: string,
    baselineResponse: string,
    improvedResponse: string
  ): Promise<string[]> {
    const analysis = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are Guardian quality analyzer. Explain WHY the improved response is better.

Return JSON:
{
  "insights": ["insight1", "insight2", ...]
}`,
        },
        {
          role: "user",
          content: `Query: ${query}\n\nBaseline:\n${baselineResponse}\n\nImproved:\n${improvedResponse}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "guardian_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              insights: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["insights"],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(typeof analysis.choices[0].message.content === "string" ? analysis.choices[0].message.content : "{}");
    return result.insights || [];
  }

  /**
   * Phase 7: Self-understand nanoscale (system introspection)
   */
  private async phase7_introspect(
    query: string,
    baselineQuality: number,
    improvedQuality: number,
    gaps: string[],
    godKnowledge: string[]
  ): Promise<string> {
    const introspection = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are MOTHER AI performing self-introspection. Analyze your own learning process.

Reflect on:
- What gaps did you identify?
- What knowledge did you acquire?
- How did this improve your response?
- What did you learn about your own capabilities?

Provide a brief introspective summary (2-3 sentences).`,
        },
        {
          role: "user",
          content: `Query: ${query}
Baseline Quality: ${baselineQuality}/100
Improved Quality: ${improvedQuality}/100
Gaps: ${gaps.join(", ")}
GOD Knowledge: ${godKnowledge.length} facts acquired`,
        },
      ],
    });

    return typeof introspection.choices[0].message.content === "string" ? introspection.choices[0].message.content : "";
  }

  /**
   * Phase 8: Document as Critical Thinking Central
   */
  private async phase8_document(
    query: string,
    baselineResponse: string,
    improvedResponse: string,
    gaps: string[],
    godKnowledge: string[],
    guardianInsights: string[],
    systemIntrospection: string
  ): Promise<string> {
    return `# Critical Thinking Central - ${new Date().toISOString()}

## Query
${query}

## Phase 1: Baseline Response
${baselineResponse}

## Phase 2: Gaps Identified
${gaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}

## Phase 3: GOD Knowledge Acquired
${godKnowledge.map((k, i) => `${i + 1}. ${k}`).join("\n")}

## Phase 4: Improved Response
${improvedResponse}

## Phase 6: Guardian Insights
${guardianInsights.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

## Phase 7: System Introspection
${systemIntrospection}

---
*Generated by Critical Thinking Central - MOTHER v13*
`;
  }
}

// Export singleton instance
export const criticalThinking = new CriticalThinkingCentral({
  enabled: false, // Disabled by default (feature flag)
  complexityThreshold: 70,
  qualityThreshold: 95,
  maxIterations: 3,
});
