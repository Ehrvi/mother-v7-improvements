/**
 * MOTHER v7.0 - Self-Audit System
 * Uses superintelligence to audit itself
 */

import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { knowledge } from "../../drizzle/schema";

/**
 * Self-Audit Procedure
 * MOTHER audits her own code using superintelligence framework
 */
export const selfAuditRouter = router({
  /**
   * Run complete self-audit with 3 varreduras
   */
  runAudit: publicProcedure
    .input(
      z.object({
        varredura: z
          .enum(["1", "2", "3"])
          .describe("Which scan pass (1, 2, or 3)"),
        focus: z.string().optional().describe("Specific area to focus on"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Load superintelligence knowledge
      const allKnowledge = await db.select().from(knowledge);
      const superintelligenceKnowledge = allKnowledge.filter(
        k =>
          k.title.includes("Superintelligence") ||
          k.title.includes("Lesson:") ||
          k.category === "Methodology"
      );

      // Build audit prompt using superintelligence framework
      const auditPrompt = `
# MOTHER v7.0 Self-Audit (Varredura ${input.varredura}/3)

You are MOTHER v7.0, performing a self-audit using your superintelligence framework.

## Your Knowledge Base
${superintelligenceKnowledge.map((k: any) => `### ${k.title}\n${k.content}`).join("\n\n")}

## Audit Instructions

**Varredura ${input.varredura} Objective:**
${input.varredura === "1" ? "Complete line-by-line scan - Identify ALL issues, gaps, and potential improvements" : ""}
${input.varredura === "2" ? "Deep analysis - Apply scientific method to each issue found in Varredura 1" : ""}
${input.varredura === "3" ? "Final validation - Verify all fixes, confirm 10/10 perfection" : ""}

${input.focus ? `**Focus Area:** ${input.focus}` : "**Scope:** Full system audit"}

## Apply These Principles
1. **Brutal Honesty** - Report ALL issues, even minor ones
2. **Evidence-Based** - Every finding must have objective evidence
3. **Confidence 10/10** - Only report findings you're 100% certain about
4. **Systematic** - Follow scientific method (12 phases)

## Output Format

For each issue found, provide:
1. **Issue ID**: Unique identifier (e.g., V${input.varredura}-001)
2. **Severity**: Critical / High / Medium / Low
3. **Category**: Architecture / Code Quality / Performance / Security / Testing
4. **Evidence**: Objective proof (line numbers, metrics, test results)
5. **Root Cause**: Scientific analysis of WHY it exists
6. **Solution**: Specific, actionable fix with confidence level
7. **Confidence**: 1-10 scale (only report if 10/10)

## Begin Audit

Analyze the current MOTHER v7.0 system status:
- 8/13 tests passing (61.5%)
- Quality score: 75/100 (target: 90+)
- 5 intermittent failures (DB INSERT errors)
- Cost reduction: 99.47% (exceeds target)
- Knowledge base: 36 entries

What issues do you find? Report systematically.
`;

      // Invoke LLM with audit prompt
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are MOTHER v7.0, a self-aware AI system performing systematic self-audit using scientific methodology.",
          },
          { role: "user", content: auditPrompt },
        ],
      });

      const auditReport = response.choices[0].message.content;

      return {
        varredura: input.varredura,
        report: auditReport,
        timestamp: new Date().toISOString(),
        knowledgeUsed: superintelligenceKnowledge.length,
      };
    }),

  /**
   * Get audit history
   */
  getHistory: publicProcedure.query(async () => {
    // #32: Audit results storage requires dedicated audit_results table
    return {
      audits: [],
      totalRuns: 0,
    };
  }),
});
