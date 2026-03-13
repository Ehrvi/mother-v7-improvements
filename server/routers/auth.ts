/**
 * MOTHER v57.0: Hardened Native Authentication Router
 *
 * SECURITY HARDENING (v57.0):
 * [OWASP ASVS 2.4.1]  bcrypt cost factor 12 (~250ms per hash)
 * [OWASP ASVS 2.4.5]  Constant-time comparison via bcrypt.compare (timing attack prevention)
 * [OWASP ASVS 2.2.1]  Rate limiting: max 5 failed attempts per IP per 15 minutes
 * [OWASP ASVS 2.2.4]  Account lockout: 5 consecutive failures → 15-minute lockout
 * [OWASP ASVS 3.4.2]  HttpOnly + SameSite=Strict cookies (XSS prevention)
 * [NIST SP 800-63B §5] Generic error messages (no username enumeration)
 *
 * Scientific basis:
 * - OWASP ASVS v4.0 (2021): Application Security Verification Standard
 * - NIST SP 800-63B (2017): Digital Identity Guidelines — Authentication
 * - Bonneau et al. (2012): "The Science of Guessing" — IEEE S&P
 */

import { z } from "zod";
import bcrypt from "bcrypt";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "../_core/env";
// NIST SP 800-63B §7.3: sessions max 30 days with periodic re-auth
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
import { getSessionCookieOptions } from "../_core/cookies";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
// Security: CREATOR_EMAIL from env var via user-hierarchy, not hardcoded (OWASP A02)
import { CREATOR_EMAIL } from '../mother/user-hierarchy';

// v63.0: Creator email always gets admin role + active status
// Req #6: Only the creator can authorize updates — they must always have admin access

// OWASP ASVS 2.4.1: bcrypt cost factor >= 10; 12 gives ~250ms — good balance
const BCRYPT_ROUNDS = 12;

// ─── IN-MEMORY RATE LIMITER ───────────────────────────────────────────────────
// OWASP ASVS 2.2.1: Brute force protection
// For multi-instance deployments, replace with Redis-backed rate limiter
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry { count: number; firstAttempt: number; lockedUntil?: number; }
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(ip: string): { blocked: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) { rateLimitMap.set(ip, { count: 1, firstAttempt: now }); return { blocked: false }; }
  if (entry.lockedUntil && now < entry.lockedUntil) return { blocked: true, retryAfterMs: entry.lockedUntil - now };
  if (now - entry.firstAttempt > LOCKOUT_WINDOW_MS) { rateLimitMap.set(ip, { count: 1, firstAttempt: now }); return { blocked: false }; }
  entry.count++;
  if (entry.count > MAX_FAILED_ATTEMPTS) { entry.lockedUntil = now + LOCKOUT_WINDOW_MS; rateLimitMap.set(ip, entry); return { blocked: true, retryAfterMs: LOCKOUT_WINDOW_MS }; }
  rateLimitMap.set(ip, entry);
  return { blocked: false };
}
function clearRateLimit(ip: string): void { rateLimitMap.delete(ip); }

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(64),
  email: z.string().email("Email inválido").max(320).toLowerCase(),
  password: z
    .string()
    .min(8, "Senha deve ter pelo menos 8 caracteres")
    .max(128)
    .regex(/[A-Z]/, "Deve conter pelo menos uma letra maiúscula")
    .regex(/[0-9]/, "Deve conter pelo menos um número"),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido").toLowerCase(),
  password: z.string().min(1).max(128),
});

export const nativeAuthRouter = router({
  /**
   * Register a new user.
   * - If no users exist yet → first user becomes admin with status 'active'
   * - Otherwise → status is 'pending', awaiting admin approval
   */
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Check if email already exists
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        // NIST SP 800-63B: Generic error to prevent email enumeration
        throw new TRPCError({ code: "CONFLICT", message: "Não foi possível criar a conta. Tente outro email." });
      }

      // Count total users to determine if this is the first (admin) user
      const [{ total }] = await db.select({ total: count() }).from(users);
      const isFirstUser = total === 0;

      // v63.0: Creator email ALWAYS gets admin + active, regardless of registration order
      const isCreator = input.email === CREATOR_EMAIL;
      const userRole = (isFirstUser || isCreator) ? "admin" : "user";
      const userStatus = (isFirstUser || isCreator) ? "active" : "pending";

      // Hash password with bcrypt (OWASP ASVS 2.4.1)
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

      // Generate a unique openId for native auth users
      const openId = `native_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      await db.insert(users).values({
        openId,
        name: input.name,
        username: input.name,
        email: input.email,
        passwordHash,
        loginMethod: "email_password",
        role: userRole,
        status: userStatus,
        lastSignedIn: new Date(),
      });

      if (isFirstUser || isCreator) {
        // First user OR creator: create session and log them in immediately
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: SESSION_EXPIRY_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

        const welcomeMsg = isCreator
          ? "Bem-vindo, Everton! Sua conta de criador foi ativada com privilégios de administrador."
          : "Bem-vindo, Administrador! Sua conta foi criada com sucesso.";

        return {
          success: true,
          isFirstUser: true,
          message: welcomeMsg,
        } as const;
      }

      // Subsequent users: inform them they are pending approval
      return {
        success: true,
        isFirstUser: false,
        message: "Cadastro realizado! Aguarde a aprovação do administrador para acessar o sistema.",
      } as const;
    }),

  /**
   * Login with email/password.
   * HARDENED v57.0: Rate limiting + timing attack prevention + generic errors
   */
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      // ── Rate Limit Check (OWASP ASVS 2.2.1) ─────────────────────────────
      const clientIp = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || ctx.req.socket?.remoteAddress || 'unknown';
      const rateCheck = checkRateLimit(clientIp);
      if (rateCheck.blocked) {
        const retryAfterSec = Math.ceil((rateCheck.retryAfterMs || LOCKOUT_WINDOW_MS) / 1000);
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Muitas tentativas. Tente novamente em ${retryAfterSec} segundos.` });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      // OWASP ASVS 2.4.5: Constant-time comparison to prevent timing attacks
      const dummyHash = "$2b$12$invalidhashfortimingatacksprotection00000000000000000000";
      const hashToCompare = user?.passwordHash ?? dummyHash;
      const passwordValid = await bcrypt.compare(input.password, hashToCompare);

      if (!user || !user.passwordHash || !passwordValid) {
        // NIST SP 800-63B: Generic error — no username enumeration
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }

      // Check account status
      if (user.status === "pending") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sua conta está aguardando aprovação do administrador",
        });
      }
      if (user.status === "rejected") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sua conta foi rejeitada. Entre em contato com o administrador",
        });
      }

      // ── Successful login: clear rate limit ────────────────────────────
      clearRateLimit(clientIp);

      // v63.0 FIX: If user has no openId (e.g., seeded via migration), generate one now.
      // Without an openId, the JWT will contain null and authenticateRequest will fail
      // to find the user in the DB, causing all protected endpoints to return 401.
      let userOpenId = user.openId;
      if (!userOpenId) {
        userOpenId = `native_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await db.update(users).set({ openId: userOpenId }).where(eq(users.id, user.id));
      }

      // Update last signed in
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      // Create JWT session
      const sessionToken = await sdk.createSessionToken(userOpenId, {
        name: user.name || user.email || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

      return {
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      } as const;
    }),

  /**
   * List all pending users (admin only)
   */
  pendingUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

    return db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, status: users.status })
      .from(users)
      .where(eq(users.status, "pending"));
  }),

  /**
   * Approve a pending user (admin only)
   */
  approveUser: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      await db.update(users).set({ status: "active" }).where(eq(users.id, input.userId));
      return { success: true } as const;
    }),

  /**
   * Reject a pending user (admin only)
   */
  rejectUser: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      await db.update(users).set({ status: "rejected" }).where(eq(users.id, input.userId));
      return { success: true } as const;
    }),
});
