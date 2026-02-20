/**
 * Knowledge Sync Router
 * 
 * Automates syncing lessons learned from LESSONS-LEARNED-UPDATED.md to database
 * Implements Lição #29: Automated Knowledge Sync
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { knowledge, Knowledge } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Parse LESSONS-LEARNED-UPDATED.md and extract individual lessons
 */
function parseLessonsFile(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  const lessons: Array<{
    number: number;
    title: string;
    content: string;
    priority?: string;
    category?: string;
    tags: string[];
  }> = [];

  // Split by lesson headers (## Lição #N or ## N.)
  const lessonRegex = /^## (?:Lição #(\d+)|(\d+)\.)\s*[:\-]?\s*(.+?)$/gm;
  const matches = Array.from(content.matchAll(lessonRegex));

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const lessonNumber = parseInt(match[1] || match[2]);
    const lessonTitle = match[3].trim();
    const startIndex = match.index! + match[0].length;
    const endIndex = matches[i + 1]?.index || content.length;
    const lessonContent = content.substring(startIndex, endIndex).trim();

    // Extract metadata from content
    const priorityMatch = lessonContent.match(/\*\*Priority:\*\*\s*(.+?)$/m);
    const categoryMatch = lessonContent.match(/\*\*Category:\*\*\s*(.+?)$/m);
    const tagsMatch = lessonContent.match(/\*\*Tags?:\*\*\s*(.+?)$/m);

    const priority = priorityMatch?.[1].trim();
    const category = categoryMatch?.[1].trim();
    const tags = tagsMatch?.[1]
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean) || [];

    lessons.push({
      number: lessonNumber,
      title: lessonTitle,
      content: lessonContent,
      priority,
      category,
      tags
    });
  }

  return lessons;
}

/**
 * Generate embedding for lesson content (placeholder - integrate with actual embedding service)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // TODO: Integrate with OpenAI embeddings API or similar
  // For now, return empty array (embeddings optional for basic functionality)
  return [];
}

export const knowledgeSyncRouter = router({
  /**
   * Sync all lessons from LESSONS-LEARNED-UPDATED.md to database
   * Protected procedure - only authenticated users can trigger sync
   */
  syncLessonsFromFile: protectedProcedure
    .input(z.object({
      filePath: z.string().optional(),
      forceUpdate: z.boolean().optional().default(false)
    }))
    .mutation(async ({ input, ctx }) => {
      const filePath = input.filePath || join(process.cwd(), 'LESSONS-LEARNED-UPDATED.md');
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      try {
        const lessons = parseLessonsFile(filePath);
        const results = {
          added: 0,
          updated: 0,
          skipped: 0,
          errors: [] as string[]
        };

        for (const lesson of lessons) {
          try {
            const lessonTitle = `Lição #${lesson.number}: ${lesson.title}`;
            
            // Check if lesson already exists
            const existing = await db.select()
              .from(knowledge)
              .where(eq(knowledge.title, lessonTitle))
              .limit(1);

            if (existing.length > 0) {
              if (input.forceUpdate) {
                // Update existing lesson
                await db.update(knowledge)
                  .set({
                    content: lesson.content,
                    category: lesson.category || 'lessons-learned',
                    tags: JSON.stringify(lesson.tags),
                    updatedAt: new Date()
                  })
                  .where(eq(knowledge.id, existing[0].id));
                
                results.updated++;
              } else {
                results.skipped++;
              }
            } else {
              // Add new lesson
              const embedding = await generateEmbedding(lesson.content);
              
              await db.insert(knowledge).values({
                title: lessonTitle,
                content: lesson.content,
                category: lesson.category || 'lessons-learned',
                tags: JSON.stringify(lesson.tags),
                source: 'LESSONS-LEARNED-UPDATED.md',
                sourceType: 'learning',
                embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
                embeddingModel: embedding.length > 0 ? 'text-embedding-ada-002' : null,
                accessCount: 0
              });
              
              results.added++;
            }
          } catch (error) {
            results.errors.push(`Lição #${lesson.number}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        return {
          success: true,
          message: `Sync complete: ${results.added} added, ${results.updated} updated, ${results.skipped} skipped`,
          results
        };
      } catch (error) {
        return {
          success: false,
          message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          results: { added: 0, updated: 0, skipped: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        };
      }
    }),

  /**
   * Add a single lesson to knowledge base
   * Protected procedure
   */
  addLesson: protectedProcedure
    .input(z.object({
      number: z.number(),
      title: z.string(),
      content: z.string(),
      priority: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const lessonTitle = `Lição #${input.number}: ${input.title}`;
      
      // Check if lesson already exists
      const existing = await db.select()
        .from(knowledge)
        .where(eq(knowledge.title, lessonTitle))
        .limit(1);

      if (existing.length > 0) {
        return {
          success: false,
          message: `Lição #${input.number} already exists. Use forceUpdate to overwrite.`
        };
      }

      const embedding = await generateEmbedding(input.content);
      
      await db.insert(knowledge).values({
        title: lessonTitle,
        content: input.content,
        category: input.category || 'lessons-learned',
        tags: JSON.stringify(input.tags || []),
        source: 'manual-add',
        sourceType: 'learning',
        embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
        embeddingModel: embedding.length > 0 ? 'text-embedding-ada-002' : null,
        accessCount: 0
      });

      return {
        success: true,
        message: `Lição #${input.number} added successfully`
      };
    }),

  /**
   * Get all lessons from knowledge base
   * Public procedure - anyone can read lessons
   */
  getAllLessons: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const lessons = await db.select()
        .from(knowledge)
        .where(eq(knowledge.category, 'lessons-learned'))
        .orderBy(knowledge.createdAt);

      return lessons.map((lesson: Knowledge) => ({
        ...lesson,
        tags: lesson.tags ? JSON.parse(lesson.tags) : [],
        embedding: null // Don't send embeddings to client
      }));
    }),

  /**
   * Search lessons by keyword
   * Public procedure
   */
  searchLessons: publicProcedure
    .input(z.object({
      keyword: z.string(),
      limit: z.number().optional().default(10)
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const allLessons = await db.select()
        .from(knowledge)
        .where(eq(knowledge.category, 'lessons-learned'));

      // Simple text search (TODO: upgrade to vector similarity search)
      const results = allLessons
        .filter((lesson: Knowledge) => 
          lesson.title.toLowerCase().includes(input.keyword.toLowerCase()) ||
          lesson.content.toLowerCase().includes(input.keyword.toLowerCase())
        )
        .slice(0, input.limit);

      return results.map((lesson: Knowledge) => ({
        ...lesson,
        tags: lesson.tags ? JSON.parse(lesson.tags) : [],
        embedding: null
      }));
    }),

  /**
   * Get lesson by number
   * Public procedure
   */
  getLessonByNumber: publicProcedure
    .input(z.object({
      number: z.number()
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const lessons = await db.select()
        .from(knowledge)
        .where(eq(knowledge.category, 'lessons-learned'));

      const lesson = lessons.find((l: Knowledge) => l.title.includes(`Lição #${input.number}:`));

      if (!lesson) {
        return null;
      }

      // Increment access count
      await db.update(knowledge)
        .set({
          accessCount: (lesson.accessCount || 0) + 1,
          lastAccessed: new Date()
        })
        .where(eq(knowledge.id, lesson.id));

      return {
        ...lesson,
        tags: lesson.tags ? JSON.parse(lesson.tags) : [],
        embedding: null
      };
    })
});
