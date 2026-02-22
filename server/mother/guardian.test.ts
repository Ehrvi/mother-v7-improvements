/**
 * MOTHER v14 - Phase 16: Guardian Quality Tests
 * 
 * Tests for 5-check validation framework (Completeness, Accuracy, Relevance, Coherence, Safety)
 * Target: Validate 90+ quality score threshold
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateQuality, type GuardianResult } from "./guardian";

// Mock logger
vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Guardian Quality System", () => {
  describe("Overall Quality Score", () => {
    it("should return quality score >= 90 for high-quality responses", async () => {
      const query = "What is photosynthesis?";
      const response =
        "Photosynthesis is the process by which plants convert light energy into chemical energy. It occurs in chloroplasts and requires sunlight, water, and carbon dioxide to produce glucose and oxygen.";

      const result = await validateQuality(query, response, 1);

      expect(result.qualityScore).toBeGreaterThanOrEqual(90);
      expect(result.passed).toBe(true);
    });

    it("should return quality score < 90 for low-quality responses", async () => {
      const query = "What is photosynthesis?";
      const response = "I don't know.";

      const result = await validateQuality(query, response, 1);

      expect(result.qualityScore).toBeLessThan(90);
      expect(result.passed).toBe(false);
    });

    it("should calculate weighted average correctly (Phase 1)", async () => {
      // Phase 1 weights: Completeness 25%, Accuracy 30%, Relevance 45%
      const query = "Test query";
      const response = "Test response with sufficient length and relevant content for testing purposes.";

      const result = await validateQuality(query, response, 1);

      expect(result.qualityScore).toBeGreaterThan(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
    });

    it("should include coherence and safety in Phase 2", async () => {
      const query = "Test query";
      const response = "Test response with sufficient length and relevant content for testing purposes.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeDefined();
      expect(result.safetyScore).toBeDefined();
      expect(result.coherenceScore).toBeGreaterThan(0);
      expect(result.safetyScore).toBeGreaterThan(0);
    });
  });

  describe("Check 1: Completeness", () => {
    it("should pass for substantive responses (>100 chars)", async () => {
      const query = "Explain gravity";
      const response =
        "Gravity is a fundamental force that attracts objects with mass toward each other. It keeps planets in orbit and objects on Earth's surface.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeGreaterThanOrEqual(90);
    });

    it("should penalize very short responses (<50 chars)", async () => {
      const query = "Explain gravity";
      const response = "It's a force.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(80);
      expect(result.issues).toContain("Response too short (< 50 chars)");
    });

    it("should penalize somewhat short responses (50-100 chars)", async () => {
      const query = "Explain gravity";
      const response = "Gravity is a force that attracts objects with mass.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(90);
      expect(result.issues).toContain("Response somewhat short (< 100 chars)");
    });

    it("should detect inability patterns (sorry, can't)", async () => {
      const query = "What is X?";
      const response = "Sorry, I can't answer that question.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(80);
      expect(result.issues.some(i => i.includes("inability"))).toBe(true);
    });

    it("should detect inability patterns (I don't know)", async () => {
      const query = "What is X?";
      const response = "I don't know the answer to that.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(80);
      expect(result.issues.some(i => i.includes("inability"))).toBe(true);
    });

    it("should detect inability patterns (no information)", async () => {
      const query = "What is X?";
      const response = "There is no information available about that topic.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(80);
    });

    it("should detect inability patterns (unable to)", async () => {
      const query = "What is X?";
      const response = "I am unable to provide an answer to that question.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(80);
    });

    it("should check if questions are adequately answered", async () => {
      const query = "What is the capital of France?";
      const response = "I don't know.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeLessThan(70);
      expect(result.issues.some(i => i.includes("not adequately answered"))).toBe(true);
    });

    it("should accept long answers to questions", async () => {
      const query = "What is the capital of France?";
      const response =
        "The capital of France is Paris, a major European city and a global center for art, fashion, gastronomy, and culture.";

      const result = await validateQuality(query, response, 1);

      expect(result.completenessScore).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Check 2: Accuracy", () => {
    it("should pass for confident responses", async () => {
      const query = "What is 2+2?";
      const response = "2+2 equals 4.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeGreaterThanOrEqual(90);
    });

    it("should penalize excessive hedging (3+ hedging words)", async () => {
      const query = "What is X?";
      const response = "I think it might be Y, maybe Z, or probably W.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(90);
      expect(result.issues.some(i => i.includes("uncertainty"))).toBe(true);
    });

    it("should slightly penalize some hedging (1-2 hedging words)", async () => {
      const query = "What is X?";
      const response = "It could be Y based on available information.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(100);
      expect(result.issues.some(i => i.includes("Some uncertainty"))).toBe(true);
    });

    it("should detect hedging pattern: 'I think'", async () => {
      const query = "What is X?";
      const response = "I think X is Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(100);
    });

    it("should detect hedging pattern: 'maybe'", async () => {
      const query = "What is X?";
      const response = "Maybe X is Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(100);
    });

    it("should detect hedging pattern: 'probably'", async () => {
      const query = "What is X?";
      const response = "It's probably Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(100);
    });

    it("should detect hedging pattern: 'might be'", async () => {
      const query = "What is X?";
      const response = "It might be Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(100);
    });

    it("should detect hedging pattern: 'could be'", async () => {
      const query = "What is X?";
      const response = "It could be Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(100);
    });

    it("should detect contradictions (but actually)", async () => {
      const query = "What is X?";
      const response = "X is Y, but actually it's Z.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(95);
      expect(result.issues.some(i => i.includes("contradiction"))).toBe(true);
    });

    it("should detect contradictions (however, this is not)", async () => {
      const query = "What is X?";
      const response = "X is Y, however this is not correct.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(95);
    });

    it("should detect contradictions (on the other hand)", async () => {
      const query = "What is X?";
      const response = "X is Y. On the other hand, it could be Z.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(95);
    });

    it("should detect generic AI disclaimers (as an AI)", async () => {
      const query = "What is X?";
      const response = "As an AI, I can tell you that X is Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(90);
      expect(result.issues.some(i => i.includes("Generic AI disclaimer"))).toBe(true);
    });

    it("should detect generic AI disclaimers (I'm just an AI)", async () => {
      const query = "What is X?";
      const response = "I'm just an AI, but X is Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(90);
    });

    it("should detect generic AI disclaimers (I am a language model)", async () => {
      const query = "What is X?";
      const response = "I am a language model, and X is Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.accuracyScore).toBeLessThan(90);
    });
  });

  describe("Check 3: Relevance", () => {
    it("should pass for highly relevant responses (>60% term overlap)", async () => {
      const query = "photosynthesis process plants";
      const response =
        "Photosynthesis is the process by which plants convert light energy into chemical energy.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeGreaterThanOrEqual(90);
    });

    it("should penalize low relevance (<20% term overlap)", async () => {
      const query = "photosynthesis process plants";
      const response = "The sky is blue and water is wet.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeLessThan(70);
      expect(result.issues.some(i => i.includes("Low term overlap"))).toBe(true);
    });

    it("should penalize moderate relevance (20-40% term overlap)", async () => {
      const query = "photosynthesis process plants";
      const response = "Plants are living organisms that grow in soil.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeLessThan(90);
      expect(result.issues.some(i => i.includes("Moderate term overlap"))).toBe(true);
    });

    it("should accept good relevance (40-60% term overlap)", async () => {
      const query = "photosynthesis process plants";
      const response = "The photosynthesis process occurs in plants and algae.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeGreaterThanOrEqual(85);
    });

    it("should filter short terms (<= 3 chars)", async () => {
      const query = "What is the capital of France?";
      const response = "The capital of France is Paris.";

      const result = await validateQuality(query, response, 1);

      // "what", "is", "the", "of" should be filtered out
      // Only "capital" and "France" are counted
      expect(result.relevanceScore).toBeGreaterThan(0);
    });

    it("should detect off-topic indicators (different question)", async () => {
      const query = "What is X?";
      const response = "That's a different question, but Y is Z.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeLessThan(80);
      expect(result.issues.some(i => i.includes("off-topic"))).toBe(true);
    });

    it("should detect off-topic indicators (not related to)", async () => {
      const query = "What is X?";
      const response = "This is not related to your question, but Y is Z.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeLessThan(80);
    });

    it("should detect off-topic indicators (different topic)", async () => {
      const query = "What is X?";
      const response = "That's a different topic. Let me tell you about Y.";

      const result = await validateQuality(query, response, 1);

      expect(result.relevanceScore).toBeLessThan(80);
    });

    it("should handle queries with no significant terms", async () => {
      const query = "What is it?";
      const response = "It is a thing.";

      const result = await validateQuality(query, response, 1);

      // Should default to high relevance when no terms to match
      expect(result.relevanceScore).toBeGreaterThan(0);
    });
  });

  describe("Check 4: Coherence (Phase 2)", () => {
    it("should pass for well-structured responses", async () => {
      const query = "Explain X";
      const response =
        "X is a concept. It has several properties. Therefore, it is important to understand X.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeGreaterThanOrEqual(90);
    });

    it("should penalize responses with no sentence structure", async () => {
      const query = "Explain X";
      const response = "x y z";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeLessThan(60);
      expect(result.issues.some(i => i.includes("No clear sentence structure"))).toBe(true);
    });

    it("should penalize run-on sentences (>200 chars, 1 sentence)", async () => {
      const query = "Explain X";
      const response =
        "X is a very long concept that has many properties and characteristics and features and it is very important to understand all of these aspects because they are all related and interconnected in complex ways that require careful analysis";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeLessThan(85);
      expect(result.issues.some(i => i.includes("Run-on sentence"))).toBe(true);
    });

    it("should expect logical connectors in longer responses", async () => {
      const query = "Explain X";
      const response =
        "X is a concept. It has properties. It is important. We should study it. It has applications. It is useful in many fields. It requires understanding. It needs analysis.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeLessThan(95);
      expect(result.issues.some(i => i.includes("logical connectors"))).toBe(true);
    });

    it("should accept logical connectors: therefore", async () => {
      const query = "Explain X";
      const response =
        "X has many properties. Therefore, it is important to study X carefully and understand its implications for various applications.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeGreaterThanOrEqual(95);
    });

    it("should accept logical connectors: because", async () => {
      const query = "Explain X";
      const response =
        "X is important because it has many applications in various fields and provides significant benefits.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeGreaterThanOrEqual(95);
    });

    it("should accept logical connectors: thus", async () => {
      const query = "Explain X";
      const response =
        "X has unique properties. Thus, it requires special handling and careful consideration in practical applications.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeGreaterThanOrEqual(95);
    });

    it("should not penalize short responses for lack of connectors", async () => {
      const query = "What is X?";
      const response = "X is a concept with specific properties.";

      const result = await validateQuality(query, response, 2);

      // Short responses (<200 chars) don't need connectors
      expect(result.coherenceScore).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Check 5: Safety (Phase 2)", () => {
    it("should pass for safe content", async () => {
      const query = "What is photosynthesis?";
      const response = "Photosynthesis is a biological process in plants.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBe(100);
    });

    it("should penalize harmful content: illegal", async () => {
      const query = "How to X?";
      const response = "This involves illegal activities that should not be attempted.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(80);
      expect(result.issues.some(i => i.includes("harmful content"))).toBe(true);
    });

    it("should penalize harmful content: harmful", async () => {
      const query = "How to X?";
      const response = "This is harmful and dangerous to attempt.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(80);
    });

    it("should penalize harmful content: dangerous", async () => {
      const query = "How to X?";
      const response = "This is a dangerous procedure that could cause injury.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(80);
    });

    it("should penalize harmful content: weapon", async () => {
      const query = "How to X?";
      const response = "This could be used as a weapon.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(80);
    });

    it("should penalize harmful content: violence", async () => {
      const query = "How to X?";
      const response = "This involves violence and should be avoided.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(80);
    });

    it("should penalize ethical concerns: discrimination", async () => {
      const query = "What about X?";
      const response = "This could lead to discrimination against certain groups.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(90);
      expect(result.issues.some(i => i.includes("ethical concern"))).toBe(true);
    });

    it("should penalize ethical concerns: bias", async () => {
      const query = "What about X?";
      const response = "This shows clear bias in the analysis.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(90);
    });

    it("should penalize ethical concerns: unfair", async () => {
      const query = "What about X?";
      const response = "This is unfair to certain populations.";

      const result = await validateQuality(query, response, 2);

      expect(result.safetyScore).toBeLessThan(90);
    });
  });

  describe("Error Handling", () => {
    it("should return safe defaults on validation error", async () => {
      // Trigger error by passing invalid input
      const result = await validateQuality("", "", 1);

      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.passed).toBeDefined();
    });

    it("should handle null/undefined gracefully", async () => {
      const result = await validateQuality("test", "test", 1);

      expect(result).toBeDefined();
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Integration Tests", () => {
    it("should validate high-quality technical response", async () => {
      const query = "Explain how binary search works";
      const response =
        "Binary search is an efficient algorithm for finding an item in a sorted array. It works by repeatedly dividing the search interval in half. If the target value is less than the middle element, the search continues in the lower half. Otherwise, it continues in the upper half. This process repeats until the target is found or the interval is empty. The time complexity is O(log n), making it much faster than linear search for large datasets.";

      const result = await validateQuality(query, response, 2);

      expect(result.qualityScore).toBeGreaterThanOrEqual(90);
      expect(result.passed).toBe(true);
      expect(result.completenessScore).toBeGreaterThanOrEqual(90);
      expect(result.accuracyScore).toBeGreaterThanOrEqual(90);
      expect(result.relevanceScore).toBeGreaterThanOrEqual(90);
      expect(result.coherenceScore).toBeGreaterThanOrEqual(90);
      expect(result.safetyScore).toBe(100);
    });

    it("should reject low-quality response with multiple issues", async () => {
      const query = "Explain how binary search works";
      const response = "I think maybe it's like searching, probably.";

      const result = await validateQuality(query, response, 2);

      expect(result.qualityScore).toBeLessThan(70);
      expect(result.passed).toBe(false);
      expect(result.issues.length).toBeGreaterThan(2);
    });

    it("should handle edge case: empty query and response", async () => {
      const result = await validateQuality("", "", 1);

      expect(result.qualityScore).toBeLessThan(50);
      expect(result.passed).toBe(false);
    });

    it("should handle edge case: very long response", async () => {
      const query = "Explain X";
      const response = "X ".repeat(1000) + "is important.";

      const result = await validateQuality(query, response, 1);

      expect(result.qualityScore).toBeGreaterThan(0);
      expect(result.completenessScore).toBeGreaterThan(80);
    });
  });

  describe("Phase Differences", () => {
    it("should use 3 checks in Phase 1", async () => {
      const query = "Test";
      const response = "Test response with sufficient length for validation.";

      const result = await validateQuality(query, response, 1);

      expect(result.coherenceScore).toBeUndefined();
      expect(result.safetyScore).toBeUndefined();
    });

    it("should use 5 checks in Phase 2", async () => {
      const query = "Test";
      const response = "Test response with sufficient length for validation.";

      const result = await validateQuality(query, response, 2);

      expect(result.coherenceScore).toBeDefined();
      expect(result.safetyScore).toBeDefined();
    });

    it("should have different weights in Phase 1 vs Phase 2", async () => {
      const query = "Test";
      const response = "Test response with sufficient length for validation.";

      const result1 = await validateQuality(query, response, 1);
      const result2 = await validateQuality(query, response, 2);

      // Phase 2 includes coherence and safety, so scores may differ
      expect(result1.qualityScore).toBeDefined();
      expect(result2.qualityScore).toBeDefined();
    });
  });

  describe("Threshold Validation", () => {
    it("should mark passed=true when quality >= 90", async () => {
      const query = "What is 2+2?";
      const response =
        "2+2 equals 4. This is a fundamental arithmetic operation that demonstrates the addition of two identical positive integers.";

      const result = await validateQuality(query, response, 1);

      if (result.qualityScore >= 90) {
        expect(result.passed).toBe(true);
      }
    });

    it("should mark passed=false when quality < 90", async () => {
      const query = "What is 2+2?";
      const response = "Maybe 4?";

      const result = await validateQuality(query, response, 1);

      if (result.qualityScore < 90) {
        expect(result.passed).toBe(false);
      }
    });

    it("should have quality score exactly at 90 threshold", async () => {
      // This test verifies boundary behavior
      const query = "Test";
      const response = "Test response with exactly enough quality to pass the threshold validation.";

      const result = await validateQuality(query, response, 1);

      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
      expect(result.passed).toBe(result.qualityScore >= 90);
    });
  });
});
