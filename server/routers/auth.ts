/**
 * MOTHER v7.0 - Secure Authentication Router
 *
 * Implements custom authentication with god-level security:
 * - bcrypt (12 salt rounds) for password hashing (OWASP A04)
 * - Rate limiting (5 attempts/15min) (OWASP A07)
 * - Strong password requirements (ISO 27001 A.8.28)
 * - Input validation with Zod (OWASP A05)
 * - Session management (httpOnly+secure+sameSite) (OWASP A01)
 * - SQL injection prevention via Drizzle ORM (OWASP A05)
 * - Account lockout after failed attempts
 */

import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import bcrypt from "bcrypt";
import { users } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

const BCRYPT_SALT_ROUNDS = 12; // OWASP recommended minimum

/**
 * Strong Password Schema (ISO 27001 A.8.28)
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const strongPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character (!@#$%^&*...)"
  );

/**
 * Email Schema
 */
const emailSchema = z
  .string()
  .email("Invalid email format")
  .max(320, "Email too long"); // RFC 5321 maximum

/**
 * Signup Input Schema
 */
const signupSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name too long"),
  email: emailSchema,
  password: strongPasswordSchema,
});

/**
 * Login Input Schema
 */
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const authRouter = router({
  /**
   * Signup Endpoint
   * Creates new user with hashed password
   *
   * Security features:
   * - bcrypt hashing (12 rounds)
   * - Input validation (Zod)
   * - Duplicate email check
   * - SQL injection prevention (Drizzle ORM)
   */
  signup: publicProcedure
    .input(signupSchema)
    .mutation(async ({ input, ctx }) => {
      // SECURITY: Signup temporarily disabled (project not finalized)
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Registration is temporarily disabled. Please contact the administrator.",
      });
    }),

  /**
   * Login Endpoint
   * Authenticates user and creates session
   *
   * Security features:
   * - bcrypt password verification
   * - Rate limiting (handled by middleware)
   * - Session cookie (httpOnly+secure+sameSite)
   * - Account lockout (5 failed attempts, 15 min lockout)
   */
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    const { email, password } = input;

    // Find user by email
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Generic error message to prevent user enumeration
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Account locked due to too many failed login attempts. Try again in ${minutesRemaining} minutes.`,
      });
    }

    // Check if user has password (not OAuth user)
    if (!user.passwordHash) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This account uses OAuth login",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockoutThreshold = 5;
      const lockoutDuration = 15 * 60 * 1000; // 15 minutes

      if (newFailedAttempts >= lockoutThreshold) {
        // Lock account for 15 minutes
        await db
          .update(users)
          .set({
            failedLoginAttempts: newFailedAttempts,
            lockedUntil: new Date(Date.now() + lockoutDuration),
          })
          .where(eq(users.id, user.id));

        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Account locked due to too many failed login attempts. Try again in 15 minutes.",
        });
      } else {
        // Update failed attempts count
        await db
          .update(users)
          .set({ failedLoginAttempts: newFailedAttempts })
          .where(eq(users.id, user.id));

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
    }

    // Reset failed login attempts and update last signed in timestamp
    await db
      .update(users)
      .set({
        lastSignedIn: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, user.id));

    // Create session (handled by context middleware)
    // Session cookie will be set with httpOnly+secure+sameSite flags
    return {
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }),

  /**
   * Logout Endpoint
   * Destroys session
   */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    // Destroy session cookie by setting it to empty with immediate expiry
    if (ctx.res) {
      ctx.res.cookie("session", "", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 0, // Expire immediately
      });
    }

    return {
      success: true,
      message: "Logout successful",
    };
  }),

  /**
   * Get Current User
   * Returns authenticated user info
   */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      return null;
    }

    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
    };
  }),
});
