import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { motherRouter } from "./routers/mother";
import { selfAuditRouter } from "./routers/self-audit";
import { nativeAuthRouter } from "./routers/auth";
import { proposalsRouter } from "./routers/proposals";
import { autonomousRouter } from "./routers/autonomous";
import { publicProcedure, router } from "./_core/trpc";
import { CREATOR_EMAIL as CREATOR } from "./mother/update-proposals";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    // Session management (existing)
    me: publicProcedure.query(opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      return { ...user, isCreator: user.email === CREATOR };
    }),
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

  // MOTHER v61.0: Autonomous Self-Update Engine (DGM Loop)
  // Scientific basis: Darwin Gödel Machine (Zhang et al., 2025 arXiv:2505.22954)
  autonomous: autonomousRouter,
});

export type AppRouter = typeof appRouter;
