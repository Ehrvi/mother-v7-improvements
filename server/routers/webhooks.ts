import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { webhooks, webhookDeliveries } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

/**
 * Webhook Router
 * Handles webhook registration, management, and delivery tracking
 */

const webhookEventsEnum = z.enum([
  "query.completed",
  "query.failed",
  "knowledge.created",
  "knowledge.updated",
  "pattern.learned",
  "cache.hit",
  "system.alert",
]);

export const webhooksRouter = router({
  /**
   * Register a new webhook
   */
  register: protectedProcedure
    .input(
      z.object({
        url: z.string().url().max(2048),
        events: z.array(webhookEventsEnum).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Generate HMAC secret for webhook verification
      const secret = crypto.randomBytes(32).toString("hex");

      const [webhook] = await db.insert(webhooks).values({
        userId: ctx.user.id,
        url: input.url,
        events: JSON.stringify(input.events),
        secret,
        isActive: 1,
      });

      return {
        id: webhook.insertId,
        url: input.url,
        events: input.events,
        secret, // Return secret once for user to store
        isActive: true,
        createdAt: new Date(),
      };
    }),

  /**
   * List user's webhooks
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const userWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, ctx.user.id))
      .orderBy(desc(webhooks.createdAt));

    return userWebhooks.map((webhook: any) => ({
      ...webhook,
      events: JSON.parse(webhook.events),
      secret: "***" + webhook.secret.slice(-8), // Mask secret except last 8 chars
    }));
  }),

  /**
   * Get webhook details including delivery stats
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [webhook] = await db
        .select()
        .from(webhooks)
        .where(
          and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id))
        );

      if (!webhook) {
        throw new Error("Webhook not found");
      }

      // Get recent deliveries
      const recentDeliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, input.id))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(10);

      return {
        ...webhook,
        events: JSON.parse(webhook.events),
        secret: "***" + webhook.secret.slice(-8),
        recentDeliveries,
      };
    }),

  /**
   * Update webhook configuration
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        url: z.string().url().max(2048).optional(),
        events: z.array(webhookEventsEnum).min(1).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, id), eq(webhooks.userId, ctx.user.id)));

      if (!existing) {
        throw new Error("Webhook not found");
      }

      const updateData: any = {};
      if (updates.url) updateData.url = updates.url;
      if (updates.events)
        updateData.events = JSON.stringify(updates.events);
      if (updates.isActive !== undefined)
        updateData.isActive = updates.isActive ? 1 : 0;

      await db.update(webhooks).set(updateData).where(eq(webhooks.id, id));

      return { success: true };
    }),

  /**
   * Delete webhook
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Verify ownership
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(
          and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id))
        );

      if (!existing) {
        throw new Error("Webhook not found");
      }

      await db.delete(webhooks).where(eq(webhooks.id, input.id));

      return { success: true };
    }),

  /**
   * Regenerate webhook secret
   */
  regenerateSecret: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Verify ownership
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(
          and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id))
        );

      if (!existing) {
        throw new Error("Webhook not found");
      }

      const newSecret = crypto.randomBytes(32).toString("hex");

      await db
        .update(webhooks)
        .set({ secret: newSecret })
        .where(eq(webhooks.id, input.id));

      return { secret: newSecret };
    }),

  /**
   * Get delivery history for a webhook
   */
  deliveries: protectedProcedure
    .input(
      z.object({
        webhookId: z.number(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Verify ownership
      const [webhook] = await db
        .select()
        .from(webhooks)
        .where(
          and(
            eq(webhooks.id, input.webhookId),
            eq(webhooks.userId, ctx.user.id)
          )
        );

      if (!webhook) {
        throw new Error("Webhook not found");
      }

      const deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, input.webhookId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return deliveries;
    }),
});
