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

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
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

  // TEMPORARY: Rate limiting disabled for Phase 17 load testing
  // TODO: Re-enable after load test completion
  return next({ ctx });

  // Get identifier (user ID or IP)
  // const identifier = ctx.user?.id?.toString() || ctx.req.ip || "unknown";

  // Get rate limit config for this procedure
  // const config = getRateLimitConfig(path);

  // Check rate limit
  // const result = await checkRateLimit(identifier, config);

  // Add headers to response
  // const headers = formatRateLimitHeaders(result);
  // Object.entries(headers).forEach(([key, value]) => {
  //   ctx.res.setHeader(key, value);
  // });

  // Deny if rate limited
  // if (!result.allowed) {
  //   throw new TRPCError({
  //     code: "TOO_MANY_REQUESTS",
  //     message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
  //   });
  // }

  // return next({ ctx });
});

export const publicProcedure = t.procedure.use(rateLimitMiddleware);

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

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
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
