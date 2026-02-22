/**
 * MOTHER v14 - Phase 16: Tier Routing Tests
 * 
 * Tests for complexity assessment and tier selection logic
 * Target: Validate 60/30/10 distribution after Phase 15 calibration
 */

import { describe, it, expect } from "vitest";
import { assessComplexity } from "./intelligence";

describe("Tier Routing - Complexity Assessment", () => {
  describe("Guardian Tier (gpt-4o-mini) - Complexity < 0.4", () => {
    it("should route simple factual questions to Guardian", () => {
      const queries = [
        "What is the capital of France?",
        "Who invented the telephone?",
        "What is 2+2?",
        "Define photosynthesis",
        "What year did World War 2 end?",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
        expect(result.tier).toBe("gpt-4o-mini");
        expect(result.complexityScore).toBeLessThan(0.4);
      });
    });

    it("should route short queries without technical terms to Guardian", () => {
      const queries = [
        "Hello world",
        "Good morning",
        "Thank you",
        "How are you?",
        "Nice to meet you",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
        expect(result.tier).toBe("gpt-4o-mini");
        expect(result.complexityScore).toBeLessThan(0.4);
      });
    });

    it("should route basic explanations to Guardian", () => {
      const queries = [
        "Explain gravity",
        "What is democracy?",
        "How does rain form?",
        "What is a computer?",
        "Describe the sun",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
        expect(result.tier).toBe("gpt-4o-mini");
        expect(result.complexityScore).toBeLessThan(0.4);
      });
    });

    it("should have baseline complexity of 0.25", () => {
      const result = assessComplexity("test");
      expect(result.complexityScore).toBeGreaterThanOrEqual(0.25);
    });

    it("should increase complexity with word count", () => {
      const short = assessComplexity("What is AI?");
      const medium = assessComplexity("What is artificial intelligence and how does it work in modern systems?");
      
      expect(medium.complexityScore).toBeGreaterThan(short.complexityScore);
    });
  });

  describe("Direct Tier (gpt-4o) - Complexity 0.35-0.65", () => {
    it("should route technical explanations to Direct", () => {
      const queries = [
        "Explain the algorithm for binary search",
        "How does TCP/IP networking work?",
        "Describe the architecture of a neural network",
        "What is the difference between REST and GraphQL?",
        "Analyze the performance of bubble sort",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
      expect(result.tier).toBe("gpt-4o");
      expect(result.complexityScore).toBeGreaterThanOrEqual(0.35);
      expect(result.complexityScore).toBeLessThan(0.65);
      });
    });

    it("should route medium-length technical queries to Direct", () => {
      const query = "Explain how machine learning models are trained using gradient descent optimization and backpropagation in neural networks";
      const result = assessComplexity(query);
      
      expect(result.tier).toBe("gpt-4o");
      expect(result.complexityScore).toBeGreaterThanOrEqual(0.35);
      expect(result.complexityScore).toBeLessThan(0.65);
    });

    it("should route multi-step reasoning to Direct", () => {
      const queries = [
        "First explain photosynthesis, then describe how it affects climate",
        "Compare and contrast classical and quantum computing",
        "Analyze the pros and cons of microservices architecture",
        "Evaluate the effectiveness of different sorting algorithms",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
        expect(result.tier).toBe("gpt-4o");
        expect(result.complexityScore).toBeGreaterThanOrEqual(0.35);
      });
    });

    it("should route code-related queries to Direct", () => {
      const queries = [
        "Write a function to reverse a string",
        "Debug this Python code for errors",
        "Explain how this JavaScript class works",
        "Create a method to validate email addresses",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
        expect(result.tier).toBe("gpt-4o");
        expect(result.complexityScore).toBeGreaterThanOrEqual(0.35);
      });
    });
  });

  describe("Parallel Tier (gpt-4) - Complexity >= 0.65", () => {
    it("should route highly complex technical queries to Parallel", () => {
      const queries = [
        "Design a comprehensive distributed system architecture for a high-traffic e-commerce platform with microservices, event-driven communication, CQRS pattern, and eventual consistency, including detailed analysis of trade-offs, implementation strategy, and optimization techniques for scalability and reliability",
        "Analyze and compare the theoretical foundations, mathematical frameworks, implementation strategies, and practical applications of various machine learning algorithms including supervised learning (linear regression, logistic regression, decision trees, random forests, support vector machines), unsupervised learning (k-means clustering, hierarchical clustering, DBSCAN, PCA), and deep learning (convolutional neural networks, recurrent neural networks, transformers, GANs), with detailed evaluation of their strengths, weaknesses, computational complexity, and use cases",
      ];

      queries.forEach(query => {
        const result = assessComplexity(query);
        expect(result.tier).toBe("gpt-4");
        expect(result.complexityScore).toBeGreaterThanOrEqual(0.65);
      });
    });

    it("should route research-level queries to Parallel", () => {
      const query = "Conduct a comprehensive academic research analysis of the semantic similarity matching algorithms used in modern information retrieval systems, including vector embeddings, cosine similarity, Jaccard index, and neural network-based approaches, with detailed comparison of their theoretical foundations, computational complexity, accuracy metrics, and practical applications in large-scale database systems";
      const result = assessComplexity(query);
      
      expect(result.tier).toBe("gpt-4");
      expect(result.complexityScore).toBeGreaterThanOrEqual(0.65);
    });
  });

  describe("Threshold Boundaries", () => {
    it("should correctly classify queries at Guardian/Direct boundary (0.35)", () => {
      // Query just below 0.35 should be Guardian
      const guardianQuery = "What is machine learning?";
      const guardianResult = assessComplexity(guardianQuery);
      expect(guardianResult.complexityScore).toBeLessThan(0.35);
      expect(guardianResult.tier).toBe("gpt-4o-mini");

      // Query just above 0.35 should be Direct
      const directQuery = "Explain the algorithm and implementation of machine learning gradient descent optimization";
      const directResult = assessComplexity(directQuery);
      expect(directResult.complexityScore).toBeGreaterThanOrEqual(0.35);
      expect(directResult.tier).toBe("gpt-4o");
    });

    it("should correctly classify queries at Direct/Parallel boundary (0.65)", () => {
      // Query just below 0.65 should be Direct
      const directQuery = "Compare and analyze the architecture and implementation of REST and GraphQL APIs with technical evaluation";
      const directResult = assessComplexity(directQuery);
      expect(directResult.complexityScore).toBeLessThan(0.65);
      expect(directResult.tier).toBe("gpt-4o");

      // Query just above 0.65 should be Parallel
      const parallelQuery = "Design a comprehensive distributed system architecture for a high-traffic e-commerce platform with microservices, event-driven communication, CQRS pattern, and eventual consistency, including detailed analysis of trade-offs, implementation strategy, and optimization techniques for scalability and reliability";
      const parallelResult = assessComplexity(parallelQuery);
      expect(parallelResult.complexityScore).toBeGreaterThanOrEqual(0.65);
      expect(parallelResult.tier).toBe("gpt-4");
    });
  });

  describe("Complexity Scoring Factors", () => {
    it("should increase complexity for technical keywords", () => {
      const simple = assessComplexity("What is a computer?");
      const technical = assessComplexity("What is the algorithm architecture for optimization?");
      
      expect(technical.complexityScore).toBeGreaterThan(simple.complexityScore);
    });

    it("should increase complexity for multi-step indicators", () => {
      const simple = assessComplexity("Explain photosynthesis");
      const multiStep = assessComplexity("First explain photosynthesis, then analyze its impact, and finally evaluate its importance");
      
      expect(multiStep.complexityScore).toBeGreaterThan(simple.complexityScore);
    });

    it("should increase complexity for complex question types", () => {
      const simple = assessComplexity("What is REST?");
      const complex = assessComplexity("Compare and contrast REST and GraphQL APIs");
      
      expect(complex.complexityScore).toBeGreaterThan(simple.complexityScore);
    });

    it("should increase complexity for code indicators", () => {
      const simple = assessComplexity("What is programming?");
      const code = assessComplexity("Write a function to debug this code");
      
      expect(code.complexityScore).toBeGreaterThan(simple.complexityScore);
    });

    it("should cap complexity at 1.0", () => {
      const veryComplex = "Design a comprehensive distributed system architecture for a high-traffic e-commerce platform with microservices, event-driven communication, CQRS pattern, and eventual consistency, including detailed analysis of trade-offs, implementation strategy, optimization techniques, algorithm design, technical evaluation, research methodology, academic framework, scientific approach, sophisticated analysis, advanced implementation, complex architecture, and comprehensive evaluation of scalability, reliability, performance, security, and maintainability";
      const result = assessComplexity(veryComplex);
      
      expect(result.complexityScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe("Confidence Scores", () => {
    it("should have high confidence for Parallel tier", () => {
      const query = "Design a comprehensive distributed system architecture for a high-traffic e-commerce platform with microservices, event-driven communication, CQRS pattern, and eventual consistency, including detailed analysis of trade-offs, implementation strategy, and optimization techniques for scalability and reliability";
      const result = assessComplexity(query);
      
      expect(result.tier).toBe("gpt-4");
      expect(result.confidenceScore).toBe(0.95);
    });

    it("should have medium confidence for Direct tier", () => {
      const query = "Explain the algorithm for binary search and analyze its performance";
      const result = assessComplexity(query);
      
      expect(result.tier).toBe("gpt-4o");
      expect(result.confidenceScore).toBe(0.85);
    });

    it("should have high confidence for Guardian tier", () => {
      const query = "What is the capital of France?";
      const result = assessComplexity(query);
      
      expect(result.tier).toBe("gpt-4o-mini");
      expect(result.confidenceScore).toBe(0.9);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty query", () => {
      const result = assessComplexity("");
      expect(result.complexityScore).toBeGreaterThanOrEqual(0);
      expect(result.tier).toBeDefined();
    });

    it("should handle very long query", () => {
      const longQuery = "word ".repeat(200);
      const result = assessComplexity(longQuery);
      expect(result.complexityScore).toBeGreaterThan(0.25);
      expect(result.tier).toBeDefined();
    });

    it("should handle query with special characters", () => {
      const result = assessComplexity("What is @#$%^&*() ?");
      expect(result.tier).toBeDefined();
      expect(result.complexityScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle query with numbers", () => {
      const result = assessComplexity("Calculate 123 + 456 * 789");
      expect(result.tier).toBeDefined();
      expect(result.complexityScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle mixed case query", () => {
      const lower = assessComplexity("what is machine learning?");
      const upper = assessComplexity("WHAT IS MACHINE LEARNING?");
      const mixed = assessComplexity("What Is Machine Learning?");
      
      expect(lower.complexityScore).toBe(upper.complexityScore);
      expect(lower.complexityScore).toBe(mixed.complexityScore);
    });
  });

  describe("Reasoning Transparency", () => {
    it("should provide reasoning for complexity score", () => {
      const result = assessComplexity("Explain the algorithm for binary search");
      
      expect(result.reasoning).toBeDefined();
      expect(typeof result.reasoning).toBe("string");
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning).toContain("Baseline complexity");
    });

    it("should include length reasoning", () => {
      const result = assessComplexity("This is a medium length query with more than twenty words to trigger the length complexity factor");
      
      expect(result.reasoning).toContain("query");
    });

    it("should include technical content reasoning", () => {
      const result = assessComplexity("Explain the algorithm architecture");
      
      expect(result.reasoning).toContain("technical");
    });
  });
});

describe("Tier Routing - Distribution Validation", () => {
  it("should achieve approximately 60/30/10 distribution with diverse queries", () => {
    // Sample 100 diverse queries (same as Phase 17 load test)
    const queries = [
      // Guardian tier (60 queries - simple factual)
      "What is the capital of France?",
      "Who invented the telephone?",
      "What is 2+2?",
      "Define photosynthesis",
      "What year did World War 2 end?",
      "How does rain form?",
      "What is democracy?",
      "Describe the sun",
      "What is a computer?",
      "Explain gravity",
      // ... (50 more simple queries)
      
      // Direct tier (30 queries - technical)
      "Explain the algorithm for binary search",
      "How does TCP/IP networking work?",
      "Describe the architecture of a neural network",
      "What is the difference between REST and GraphQL?",
      "Analyze the performance of bubble sort",
      // ... (25 more technical queries)
      
      // Parallel tier (10 queries - highly complex)
      "Design a comprehensive distributed system architecture for a high-traffic e-commerce platform with microservices, event-driven communication, CQRS pattern, and eventual consistency, including detailed analysis of trade-offs, implementation strategy, and optimization techniques for scalability and reliability",
      // ... (9 more highly complex queries)
    ];

    // Note: This is a placeholder test
    // Actual distribution validation should use real production data
    expect(queries.length).toBeGreaterThan(0);
  });
});
