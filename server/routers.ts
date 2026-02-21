import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { motherRouter } from "./routers/mother";
import { selfAuditRouter } from "./routers/self-audit";
import { authRouter } from "./routers/auth";
import { knowledgeSyncRouter } from "./routers/knowledgeSync";
import { healthRouter } from "./routers/health";
import { backupRouter } from "./routers/backup";
import { queueRouter } from "./routers/queue";
import { router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  // Secure authentication system (bcrypt + rate limiting + validation)
  auth: authRouter,

  // MOTHER v7.0 router
  mother: motherRouter,
  
  // MOTHER Self-Audit System
  selfAudit: selfAuditRouter,
  
  // Knowledge Sync (Automated Lessons Learned)
  knowledgeSync: knowledgeSyncRouter,
  
  // Health check (#11: Health checks)
  health: healthRouter,
  
  // Automated backup (#10: Backup automatizado)
  backup: backupRouter,
  
  // Queue monitoring (#16: Message Queue - BullMQ)
  queue: queueRouter,
});

export type AppRouter = typeof appRouter;
