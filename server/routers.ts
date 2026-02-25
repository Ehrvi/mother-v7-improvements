import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { motherRouter } from "./routers/mother";
import { selfAuditRouter } from "./routers/self-audit";
import { nativeAuthRouter } from "./routers/auth";
import { proposalsRouter } from "./routers/proposals";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    // Session management (existing)
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Native email/password auth (MOTHER v49.0)
    register: nativeAuthRouter.register,
    login: nativeAuthRouter.login,

    // Admin: user approval management
    pendingUsers: nativeAuthRouter.pendingUsers,
    approveUser: nativeAuthRouter.approveUser,
    rejectUser: nativeAuthRouter.rejectUser,
  }),

  // MOTHER v7.0 router
  mother: motherRouter,

  // MOTHER Self-Audit System
  selfAudit: selfAuditRouter,

  // MOTHER v56.0: Update Proposals & Authorization (Req #5, #6, #7)
  proposals: proposalsRouter,
});

export type AppRouter = typeof appRouter;
