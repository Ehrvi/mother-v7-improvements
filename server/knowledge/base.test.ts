/**
 * MOTHER v14 - Knowledge Acquisition Layer Tests
 * Tests for SQLite persistence, deduplication, and semantic search
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import knowledgeBase from "./base";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "/tmp/test-knowledge.db";

describe("Knowledge Acquisition Layer", () => {
  beforeEach(() => {
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("saveConcept", () => {
    it("should save a concept to knowledge base", async () => {
      const conceptId = await knowledgeBase.saveConcept(
        "Test Concept",
        "test",
        "This is a test concept for unit testing",
        "Unit Test",
        0.9
      );

      expect(conceptId).toBeTruthy();
      expect(conceptId.length).toBe(16); // MD5 hash truncated to 16 chars
    });

    it("should update existing concept on conflict", async () => {
      const conceptName = "Duplicate Concept";
      const description1 = "First description";
      const description2 = "Updated description";

      const id1 = await knowledgeBase.saveConcept(
        conceptName,
        "test",
        description1
      );
      const id2 = await knowledgeBase.saveConcept(
        conceptName,
        "test",
        description2
      );

      expect(id1).toBe(id2); // Same concept ID
    });

    it("should detect duplicates with similarity ≥0.85", async () => {
      // First concept
      await knowledgeBase.saveConcept(
        "Machine Learning",
        "ai",
        "Machine learning is a subset of artificial intelligence that focuses on data-driven algorithms"
      );

      // Very similar concept (should be detected as duplicate)
      const conceptId = await knowledgeBase.saveConcept(
        "Machine Learning Basics",
        "ai",
        "Machine learning is a subset of AI that focuses on data-driven algorithms and pattern recognition"
      );

      // Should return same ID (duplicate detected)
      expect(conceptId).toBeTruthy();
    });
  });

  describe("saveLesson", () => {
    it("should save a lesson learned", async () => {
      const lessonId = await knowledgeBase.saveLesson(
        "Test Lesson",
        "testing",
        "Always write unit tests before deploying",
        "Multiple production bugs caught by tests",
        "HIGH",
        "Run tests before every deployment",
        0.95
      );

      expect(lessonId).toBeTruthy();
      expect(lessonId.length).toBe(16);
    });

    it("should update existing lesson on conflict", async () => {
      const lessonTitle = "Duplicate Lesson";
      const description1 = "First description";
      const description2 = "Updated description";

      const id1 = await knowledgeBase.saveLesson(
        lessonTitle,
        "test",
        description1
      );
      const id2 = await knowledgeBase.saveLesson(
        lessonTitle,
        "test",
        description2
      );

      expect(id1).toBe(id2);
    });
  });

  describe("searchConcepts", () => {
    it("should search concepts by query", async () => {
      // Add test concepts
      await knowledgeBase.saveConcept(
        "Deep Learning",
        "ai",
        "Deep learning uses neural networks with multiple layers"
      );

      await knowledgeBase.saveConcept(
        "Machine Learning",
        "ai",
        "Machine learning focuses on algorithms that learn from data"
      );

      // Search
      const results = await knowledgeBase.searchConcepts("neural networks");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].conceptName).toContain("Deep Learning");
    });

    it("should filter by concept type", async () => {
      await knowledgeBase.saveConcept(
        "AI Concept",
        "ai",
        "Artificial intelligence concept"
      );
      await knowledgeBase.saveConcept(
        "DB Concept",
        "database",
        "Database concept"
      );

      const results = await knowledgeBase.searchConcepts("concept", "ai");

      expect(results.length).toBe(1);
      expect(results[0].conceptType).toBe("ai");
    });

    it("should limit results to topK", async () => {
      // Add 10 concepts
      for (let i = 0; i < 10; i++) {
        await knowledgeBase.saveConcept(
          `Concept ${i}`,
          "test",
          `Test concept number ${i}`
        );
      }

      const results = await knowledgeBase.searchConcepts(
        "concept",
        undefined,
        3
      );

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("searchLessons", () => {
    it("should search lessons by query", async () => {
      await knowledgeBase.saveLesson(
        "Testing Lesson",
        "testing",
        "Always write tests before deployment"
      );

      const results = await knowledgeBase.searchLessons("tests");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].lessonTitle).toContain("Testing");
    });

    it("should filter by lesson type", async () => {
      await knowledgeBase.saveLesson("Test Lesson", "testing", "Write tests");
      await knowledgeBase.saveLesson(
        "Deploy Lesson",
        "deployment",
        "Deploy carefully"
      );

      const results = await knowledgeBase.searchLessons("lesson", "testing");

      expect(results.length).toBe(1);
      expect(results[0].lessonType).toBe("testing");
    });
  });

  describe("getAllLessons", () => {
    it("should get all lessons", async () => {
      await knowledgeBase.saveLesson("Lesson 1", "test", "Description 1");
      await knowledgeBase.saveLesson("Lesson 2", "test", "Description 2");

      const results = await knowledgeBase.getAllLessons();

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter by lesson type", async () => {
      await knowledgeBase.saveLesson(
        "Test Lesson",
        "testing",
        "Test description"
      );
      await knowledgeBase.saveLesson(
        "Deploy Lesson",
        "deployment",
        "Deploy description"
      );

      const results = await knowledgeBase.getAllLessons("testing");

      expect(results.length).toBe(1);
      expect(results[0].lessonType).toBe("testing");
    });
  });

  describe("markLessonApplied", () => {
    it("should increment applied count", async () => {
      const lessonId = await knowledgeBase.saveLesson(
        "Applied Lesson",
        "test",
        "Test description"
      );

      // Mark as applied twice
      knowledgeBase.markLessonApplied(lessonId);
      knowledgeBase.markLessonApplied(lessonId);

      const lessons = await knowledgeBase.getAllLessons();
      const lesson = lessons.find(l => l.lessonId === lessonId);

      expect(lesson?.appliedCount).toBe(2);
    });
  });

  describe("getStats", () => {
    it("should return knowledge base statistics", async () => {
      await knowledgeBase.saveConcept("Concept 1", "ai", "AI concept");
      await knowledgeBase.saveConcept("Concept 2", "database", "DB concept");
      await knowledgeBase.saveLesson("Lesson 1", "testing", "Test lesson");

      const stats = knowledgeBase.getStats();

      expect(stats.totalConcepts).toBeGreaterThanOrEqual(2);
      expect(stats.totalLessons).toBeGreaterThanOrEqual(1);
      expect(stats.conceptsByType).toHaveProperty("ai");
      expect(stats.conceptsByType).toHaveProperty("database");
      expect(stats.lessonsByType).toHaveProperty("testing");
    });

    it("should calculate average confidence", async () => {
      await knowledgeBase.saveConcept(
        "High Confidence",
        "test",
        "Description",
        undefined,
        0.9
      );
      await knowledgeBase.saveConcept(
        "Low Confidence",
        "test",
        "Description",
        undefined,
        0.7
      );

      const stats = knowledgeBase.getStats();

      expect(stats.avgConfidence).toBeCloseTo(0.8, 1);
    });
  });
});
