import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
/**
 * tRPC Router Configuration
 *
 * NOTE: This file has an intentional circular dependency with context.ts.
 * This is a standard pattern in tRPC applications where:
 * - context.ts defines the context type
 * - trpc.ts uses the context type to create procedures
 * - context.ts imports procedures for type inference
 *
 * TypeScript handles this correctly through declaration merging.
 * Do not attempt to "fix" this circular dependency.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import {
  checkRateLimit,
  getRateLimitConfig,
  formatRateLimitHeaders,
} from "../lib/rateLimit";
import { recordRequestMetrics, logMetrics } from "./metrics";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  /**
   * Global middleware for metrics collection (Four Golden Signals)
   * Instruments all tRPC procedures with latency, traffic, errors, and saturation metrics
   */
  errorFormatter({ shape, error }) {
    return shape;
  },
});

/**
 * Metrics middleware - Instruments all procedures with Four Golden Signals
 * 1. Latency: Request duration
 * 2. Traffic: Request count
 * 3. Errors: Error count
 * 4. Saturation: Memory/CPU usage (collected via observables)
 */
const metricsMiddleware = t.middleware(async (opts) => {
  const { path, type, next, ctx } = opts;
  const startTime = Date.now();
  
  try {
    const result = await next();
    const duration = Date.now() - startTime;
    
    // Extract tier from result if available (for mother.query)
    const tier = (result as any)?.data?.tier || (result as any)?.tier;
    
    // Record metrics
    recordRequestMetrics({
      path,
      method: type,
      duration,
      success: true,
      tier,
    });
    
    // Log metrics (structured logging)
    logMetrics({
      path,
      method: type,
      duration,
      success: true,
      tier,
      userId: ctx.user?.id?.toString(),
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorCode = error instanceof TRPCError ? error.code : 'INTERNAL_SERVER_ERROR';
    
    // Record error metrics
    recordRequestMetrics({
      path,
      method: type,
      duration,
      success: false,
      errorCode,
    });
    
    // Log error metrics
    logMetrics({
      path,
      method: type,
      duration,
      success: false,
      errorCode,
      userId: ctx.user?.id?.toString(),
    });
    
    throw error;
  }
});

export const router = t.router;

/**
 * Rate limit middleware
 *
 * Checks rate limit and adds headers to response.
 * Uses user ID if authenticated, otherwise IP address.
 */
const rateLimitMiddleware = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  // Get identifier (user ID or IP)
  const identifier = ctx.user?.id?.toString() || ctx.req.ip || "unknown";

  // Get rate limit config for this procedure
  const config = getRateLimitConfig(path);

  // Check rate limit
  const result = await checkRateLimit(identifier, config);

  // Add headers to response
  const headers = formatRateLimitHeaders(result);
  Object.entries(headers).forEach(([key, value]) => {
    ctx.res.setHeader(key, value);
  });

  // Deny if rate limited
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
    });
  }

  return next({ ctx });
});

export const publicProcedure = t.procedure.use(metricsMiddleware).use(rateLimitMiddleware);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(metricsMiddleware).use(requireUser);

export const adminProcedure = t.procedure.use(metricsMiddleware).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
