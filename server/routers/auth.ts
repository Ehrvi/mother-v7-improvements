/**
 * MOTHER v49.0: Native Authentication Router
 *
 * Implements secure email/password authentication following OWASP guidelines:
 * - bcrypt with cost factor 12 for password hashing (OWASP ASVS 2.4.1)
 * - JWT tokens signed with HS256 (OWASP ASVS 3.5.3)
 * - HttpOnly cookies to prevent XSS token theft (OWASP ASVS 3.4.2)
 * - Constant-time comparison via bcrypt.compare (OWASP ASVS 2.4.5)
 *
 * Access Control Model:
 * - First registered user automatically becomes admin with 'active' status
 * - All subsequent registrations are set to 'pending' status
 * - Only admin can approve/reject pending users via approveUser/rejectUser
 * - Pending/rejected users cannot log in
 *
 * Scientific basis: OWASP ASVS v4.0, NIST SP 800-63B
 */

import { z } from "zod";
import bcrypt from "bcrypt";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// OWASP ASVS 2.4.1: bcrypt cost factor >= 10; 12 gives ~250ms — good balance
const BCRYPT_ROUNDS = 12;

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
        throw new TRPCError({ code: "CONFLICT", message: "Este email já está cadastrado" });
      }

      // Count total users to determine if this is the first (admin) user
      const [{ total }] = await db.select({ total: count() }).from(users);
      const isFirstUser = total === 0;

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
        role: isFirstUser ? "admin" : "user",
        status: isFirstUser ? "active" : "pending",
        lastSignedIn: new Date(),
      });

      if (isFirstUser) {
        // First user: create session and log them in immediately
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          isFirstUser: true,
          message: "Bem-vindo, Administrador! Sua conta foi criada com sucesso.",
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
   * Only users with status 'active' can log in.
   */
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
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

      // Update last signed in
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      // Create JWT session
      const sessionToken = await sdk.createSessionToken(user.openId!, {
        name: user.name || user.email || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

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
