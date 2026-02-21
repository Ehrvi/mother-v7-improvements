import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDb } from "../db";
import { systemConfig } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  // MOTHER v14.0: Feature Flag Management
  getConfig: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, input.key))
        .limit(1);

      return result[0] || null;
    }),

  setConfig: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Upsert: update if exists, insert if not
      const existing = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, input.key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(systemConfig)
          .set({ value: input.value, description: input.description })
          .where(eq(systemConfig.key, input.key));
      } else {
        await db.insert(systemConfig).values({
          key: input.key,
          value: input.value,
          description: input.description,
        });
      }

      return { success: true };
    }),

  toggleCriticalThinking: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, "critical_thinking_enabled"))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(systemConfig)
          .set({ value: input.enabled.toString() })
          .where(eq(systemConfig.key, "critical_thinking_enabled"));
      } else {
        await db.insert(systemConfig).values({
          key: "critical_thinking_enabled",
          value: input.enabled.toString(),
          description:
            "Enable/disable Critical Thinking Central for A/B testing",
        });
      }

      return { success: true, enabled: input.enabled };
    }),
});
