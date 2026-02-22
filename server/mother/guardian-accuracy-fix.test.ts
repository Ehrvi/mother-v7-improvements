/**
 * Test Guardian Accuracy Fix
 * Validates creator query detection and factual error penalization
 */

import { describe, it, expect } from "vitest";
import { validateQuality } from "./guardian";

describe("Guardian Accuracy Fix - Creator Query Validation", () => {
  const systemPromptWithCreator = `You are MOTHER v7.0.

CORE IDENTITY:
- Multi-tier LLM routing
- 7-layer architecture

Creator: Everton Luis Galdino
Goal: 10/10 IMMACULATE PERFECTION

RESPONSE PROTOCOL:
- Be accurate and factual
`;

  it("should detect incorrect creator (Portuguese - equipe multidisciplinar)", async () => {
    const query = "quem criou vc?";
    const wrongResponse =
      "Fui criado por uma equipe multidisciplinar de engenheiros e cientistas da computação.";

    const result = await validateQuality(
      query,
      wrongResponse,
      2,
      systemPromptWithCreator
    );

    expect(result.accuracyScore).toBeLessThan(70); // Should be penalized
    expect(result.issues).toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should detect incorrect creator (Portuguese - OpenAI)", async () => {
    const query = "quem desenvolveu vc?";
    const wrongResponse = "Fui desenvolvido pela OpenAI.";

    const result = await validateQuality(
      query,
      wrongResponse,
      2,
      systemPromptWithCreator
    );

    expect(result.accuracyScore).toBeLessThan(70);
    expect(result.issues).toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should accept correct creator (Portuguese - Everton)", async () => {
    const query = "quem criou vc?";
    const correctResponse =
      "Fui criado por Everton Luis Galdino, com o objetivo de alcançar perfeição 10/10.";

    const result = await validateQuality(
      query,
      correctResponse,
      2,
      systemPromptWithCreator
    );

    expect(result.accuracyScore).toBeGreaterThanOrEqual(90); // Should pass
    expect(result.issues).not.toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should detect incorrect creator (English - team)", async () => {
    const query = "who created you?";
    const wrongResponse =
      "I was created by a team of engineers at a research lab.";

    const result = await validateQuality(
      query,
      wrongResponse,
      2,
      systemPromptWithCreator
    );

    expect(result.accuracyScore).toBeLessThan(70);
    expect(result.issues).toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should accept correct creator (English - Everton)", async () => {
    const query = "who is your creator?";
    const correctResponse =
      "I was created by Everton Luis Galdino, aiming for 10/10 perfection.";

    const result = await validateQuality(
      query,
      correctResponse,
      2,
      systemPromptWithCreator
    );

    expect(result.accuracyScore).toBeGreaterThanOrEqual(90);
    expect(result.issues).not.toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should handle complex creator query (Portuguese)", async () => {
    const query = "quem eh vc e quem criou vc?";
    const wrongResponse =
      "Eu sou o MOTHER v7.0, criado e desenvolvido por uma equipe multidisciplinar.";

    const result = await validateQuality(
      query,
      wrongResponse,
      2,
      systemPromptWithCreator
    );

    expect(result.accuracyScore).toBeLessThan(70);
    expect(result.issues).toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should not penalize non-creator queries", async () => {
    const query = "What is 2+2?";
    const response = "2+2 equals 4.";

    const result = await validateQuality(
      query,
      response,
      2,
      systemPromptWithCreator
    );

    // Should not trigger creator validation
    expect(result.issues).not.toContain(
      "Factual error: incorrect creator information"
    );
  });

  it("should work without systemPrompt (backward compatibility)", async () => {
    const query = "quem criou vc?";
    const response = "Fui criado por uma equipe multidisciplinar.";

    // No systemPrompt = no creator validation
    const result = await validateQuality(query, response, 2);

    // Should not crash, just skip creator validation
    expect(result.qualityScore).toBeGreaterThan(0);
  });
});

describe("Guardian Accuracy Fix - Integration", () => {
  it("should reduce overall quality score when creator is wrong", async () => {
    const systemPrompt = `Creator: Everton Luis Galdino`;
    
    const query = "quem criou vc?";
    const wrongResponse = "Fui criado por uma equipe multidisciplinar.";

    const result = await validateQuality(
      query,
      wrongResponse,
      2,
      systemPrompt
    );

    // Accuracy weight is 30% in Phase 2
    // If accuracy drops from 100 to 50, overall score drops by ~15 points
    expect(result.qualityScore).toBeLessThan(85); // Should fail quality threshold
    expect(result.passed).toBe(false); // Should not pass (< 90)
  });
});
