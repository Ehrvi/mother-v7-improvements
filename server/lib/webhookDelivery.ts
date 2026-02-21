import crypto from "crypto";
import { getDb } from "../db";
import { webhooks, webhookDeliveries } from "../../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Webhook Delivery System
 * Handles webhook event delivery with retry logic and HMAC verification
 */

export type WebhookEvent =
  | "query.completed"
  | "query.failed"
  | "knowledge.created"
  | "knowledge.updated"
  | "pattern.learned"
  | "cache.hit"
  | "system.alert";

export interface WebhookPayload {
  event: WebhookEvent;
  data: any;
  timestamp: string;
  id: string;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Deliver webhook to a single endpoint
 */
async function deliverWebhook(
  webhookId: number,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<{
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
}> {
  try {
    const payloadString = JSON.stringify(payload);
    const signature = generateSignature(payloadString, secret);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
        "X-Webhook-ID": payload.id,
        "User-Agent": "MOTHER-Webhooks/1.0",
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseBody = await response.text();

    return {
      success: response.ok,
      statusCode: response.status,
      responseBody: responseBody.slice(0, 1000), // Limit to 1KB
    };
  } catch (error: any) {
    return {
      success: false,
      errorMessage: error.message || "Unknown error",
    };
  }
}

/**
 * Trigger webhook event for all subscribed webhooks
 */
export async function triggerWebhookEvent(
  event: WebhookEvent,
  data: any
): Promise<void> {
  const db = await getDb();
  if (!db) {
    logger.warn("[Webhooks] Database not available, skipping webhook delivery");
    return;
  }

  // Find all active webhooks subscribed to this event
  const activeWebhooks = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.isActive, 1));

  const subscribedWebhooks = activeWebhooks.filter(webhook => {
    const events = JSON.parse(webhook.events) as WebhookEvent[];
    return events.includes(event);
  });

  if (subscribedWebhooks.length === 0) {
    return; // No webhooks subscribed to this event
  }

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
    id: crypto.randomBytes(16).toString("hex"),
  };

  // Create delivery records and attempt delivery
  for (const webhook of subscribedWebhooks) {
    try {
      // Create delivery record
      const [delivery] = await db.insert(webhookDeliveries).values({
        webhookId: webhook.id,
        event,
        payload: JSON.stringify(payload),
        status: "pending",
        attempts: 0,
      });

      // Attempt delivery
      const result = await deliverWebhook(
        webhook.id,
        webhook.url,
        webhook.secret,
        payload
      );

      // Update delivery record
      await db
        .update(webhookDeliveries)
        .set({
          status: result.success ? "success" : "failed",
          statusCode: result.statusCode,
          responseBody: result.responseBody,
          errorMessage: result.errorMessage,
          attempts: 1,
          deliveredAt: result.success ? new Date() : undefined,
          nextRetryAt: result.success
            ? undefined
            : new Date(Date.now() + 60000), // Retry in 1 minute
        })
        .where(eq(webhookDeliveries.id, delivery.insertId));

      // Update webhook stats
      await db
        .update(webhooks)
        .set({
          totalDeliveries: (webhook.totalDeliveries || 0) + 1,
          successfulDeliveries: result.success
            ? (webhook.successfulDeliveries || 0) + 1
            : webhook.successfulDeliveries || 0,
          failedDeliveries: result.success
            ? webhook.failedDeliveries || 0
            : (webhook.failedDeliveries || 0) + 1,
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: result.success ? "success" : "failed",
        })
        .where(eq(webhooks.id, webhook.id));
    } catch (error) {
      logger.error(
        `[Webhooks] Failed to deliver webhook ${webhook.id}:`,
        error
      );
    }
  }
}

/**
 * Retry failed webhook deliveries
 * Should be called periodically (e.g., every minute)
 */
export async function retryFailedDeliveries(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // Find failed deliveries that are ready for retry (max 3 attempts)
  const failedDeliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "failed"),
        lte(webhookDeliveries.attempts, 3),
        lte(webhookDeliveries.nextRetryAt!, now)
      )
    )
    .limit(10); // Process 10 at a time

  for (const delivery of failedDeliveries) {
    try {
      // Get webhook details
      const [webhook] = await db
        .select()
        .from(webhooks)
        .where(eq(webhooks.id, delivery.webhookId));

      if (!webhook || !webhook.isActive) {
        continue; // Skip if webhook is deleted or inactive
      }

      const payload: WebhookPayload = JSON.parse(delivery.payload);

      // Attempt delivery
      const result = await deliverWebhook(
        webhook.id,
        webhook.url,
        webhook.secret,
        payload
      );

      const attempts = (delivery.attempts || 0) + 1;

      // Update delivery record
      await db
        .update(webhookDeliveries)
        .set({
          status: result.success ? "success" : "failed",
          statusCode: result.statusCode,
          responseBody: result.responseBody,
          errorMessage: result.errorMessage,
          attempts,
          deliveredAt: result.success ? new Date() : undefined,
          nextRetryAt: result.success
            ? undefined
            : new Date(Date.now() + Math.pow(2, attempts) * 60000), // Exponential backoff
        })
        .where(eq(webhookDeliveries.id, delivery.id));

      // Update webhook stats
      if (result.success) {
        await db
          .update(webhooks)
          .set({
            successfulDeliveries: (webhook.successfulDeliveries || 0) + 1,
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: "success",
          })
          .where(eq(webhooks.id, webhook.id));
      }
    } catch (error) {
      logger.error(
        `[Webhooks] Failed to retry delivery ${delivery.id}:`,
        error
      );
    }
  }
}

/**
 * Verify webhook signature (for webhook receivers)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
