/**
 * Unit Tests: Critical Thinking Central
 * 
 * Test Coverage:
 * - Configuration
 * - 8-Phase Process
 * - Feature Flag
 * - Thresholds (complexity, quality)
 * - Error Handling
 * - Integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CriticalThinkingCentral } from "./critical-thinking";
import type { CriticalThinkingResult } from "./critical-thinking";

// Mock dependencies
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
}));

import { invokeLLM } from "../_core/llm";

describe("Critical Thinking Central", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Configuration", () => {
    it("should have correct default configuration", () => {
      const ct = new CriticalThinkingCentral();
      expect(ct["config"].enabled).toBe(false);
      expect(ct["config"].complexityThreshold).toBe(70);
      expect(ct["config"].qualityThreshold).toBe(95);
      expect(ct["config"].maxIterations).toBe(3);
    });

    it("should accept custom configuration", () => {
      const ct = new CriticalThinkingCentral({
        enabled: true,
        complexityThreshold: 80,
        qualityThreshold: 90,
        maxIterations: 5,
      });
      expect(ct["config"].enabled).toBe(true);
      expect(ct["config"].complexityThreshold).toBe(80);
      expect(ct["config"].qualityThreshold).toBe(90);
      expect(ct["config"].maxIterations).toBe(5);
    });
  });

  describe("Feature Flag", () => {
    it("should return null when disabled", async () => {
      const ct = new CriticalThinkingCentral({ enabled: false });
      const result = await ct.execute("test query", 80);
      expect(result).toBeNull();
    });

    it("should execute when enabled", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true });

      // Mock LLM responses
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 90, gaps: ["gap1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ knowledge: ["fact1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Improved response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ baseline_quality: 90, improved_quality: 98, improvement: 8.9 }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ insights: ["insight1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Introspection text" } }],
      } as any);

      const result = await ct.execute("test query", 80);
      expect(result).not.toBeNull();
      expect(result?.baselineResponse).toBe("Baseline response");
      expect(result?.improvedResponse).toBe("Improved response");
    });
  });

  describe("Complexity Threshold", () => {
    it("should return null when complexity below threshold", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true, complexityThreshold: 70 });
      const result = await ct.execute("simple query", 50);
      expect(result).toBeNull();
    });

    it("should execute when complexity above threshold", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true, complexityThreshold: 70 });

      // Mock LLM responses (same as feature flag test)
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 90, gaps: ["gap1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ knowledge: ["fact1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Improved response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ baseline_quality: 90, improved_quality: 98, improvement: 8.9 }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ insights: ["insight1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Introspection text" } }],
      } as any);

      const result = await ct.execute("complex query", 80);
      expect(result).not.toBeNull();
    });
  });

  describe("Quality Threshold", () => {
    it("should return null when baseline quality above threshold", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true, qualityThreshold: 95 });

      // Mock baseline response
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline response" } }],
      } as any);

      // Mock quality evaluation (high quality)
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 98, gaps: [] }) } }],
      } as any);

      const result = await ct.execute("test query", 80);
      expect(result).toBeNull(); // Quality already good, skip CT
    });

    it("should execute when baseline quality below threshold", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true, qualityThreshold: 95 });

      // Mock all 7 LLM calls
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 90, gaps: ["gap1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ knowledge: ["fact1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Improved response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ baseline_quality: 90, improved_quality: 98, improvement: 8.9 }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ insights: ["insight1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Introspection text" } }],
      } as any);

      const result = await ct.execute("test query", 80);
      expect(result).not.toBeNull();
      expect(result?.baselineQuality).toBe(90);
      expect(result?.improvedQuality).toBe(98);
    });
  });

  describe("8-Phase Process", () => {
    it("should execute all 8 phases successfully", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true });

      // Mock all 7 LLM calls (8 phases, 7 LLM calls)
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline response" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 85, gaps: ["gap1", "gap2"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ knowledge: ["fact1", "fact2", "fact3"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Improved response with GOD knowledge" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ baseline_quality: 85, improved_quality: 97, improvement: 14.1 }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ insights: ["insight1", "insight2"] }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Deep introspection about learning process" } }],
      } as any);

      const result = await ct.execute("complex query requiring deep thought", 85);

      expect(result).not.toBeNull();
      expect(result?.baselineResponse).toBe("Baseline response");
      expect(result?.baselineQuality).toBe(85);
      expect(result?.gaps).toEqual(["gap1", "gap2"]);
      expect(result?.godKnowledge).toEqual(["fact1", "fact2", "fact3"]);
      expect(result?.improvedResponse).toBe("Improved response with GOD knowledge");
      expect(result?.improvedQuality).toBe(97);
      expect(result?.qualityImprovement).toBe(14.1);
      expect(result?.guardianInsights).toEqual(["insight1", "insight2"]);
      expect(result?.systemIntrospection).toBe("Deep introspection about learning process");
      expect(result?.documentation).toContain("# Critical Thinking Central");
      expect(result?.iterations).toBe(1);
    });

    it("should generate complete documentation", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true });

      // Mock all LLM calls
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 90, gaps: ["gap1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ knowledge: ["fact1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Improved" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ baseline_quality: 90, improved_quality: 98, improvement: 8.9 }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ insights: ["insight1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Introspection" } }],
      } as any);

      const result = await ct.execute("test", 80);

      expect(result?.documentation).toContain("# Critical Thinking Central");
      expect(result?.documentation).toContain("## Query");
      expect(result?.documentation).toContain("## Phase 1: Baseline Response");
      expect(result?.documentation).toContain("## Phase 2: Gaps Identified");
      expect(result?.documentation).toContain("## Phase 3: GOD Knowledge Acquired");
      expect(result?.documentation).toContain("## Phase 4: Improved Response");
      expect(result?.documentation).toContain("## Phase 6: Guardian Insights");
      expect(result?.documentation).toContain("## Phase 7: System Introspection");
    });
  });

  describe("Error Handling", () => {
    it("should return null on LLM error", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true });

      // Mock LLM error
      vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("LLM API error"));

      const result = await ct.execute("test query", 80);
      expect(result).toBeNull();
    });

    it("should handle malformed JSON responses gracefully", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true });

      // Mock baseline response
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline response" } }],
      } as any);

      // Mock malformed JSON
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "invalid json" } }],
      } as any);

      const result = await ct.execute("test query", 80);
      expect(result).toBeNull(); // Should fail gracefully
    });
  });

  describe("Integration", () => {
    it("should integrate with GOD-level learning knowledge base", async () => {
      const ct = new CriticalThinkingCentral({ enabled: true });

      // Mock LLM responses
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Baseline" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ quality: 90, gaps: ["gap1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ knowledge: ["fact1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Improved" } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ baseline_quality: 90, improved_quality: 98, improvement: 8.9 }),
            },
          },
        ],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ insights: ["insight1"] }) } }],
      } as any);

      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [{ message: { content: "Introspection" } }],
      } as any);

      const result = await ct.execute("test", 80);

      expect(result).not.toBeNull();
      expect(result?.godKnowledge.length).toBeGreaterThan(0);
    });
  });
});
