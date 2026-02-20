/**
 * MOTHER v7.0 - Authentication Router Tests
 * 
 * Tests for secure authentication system:
 * - Signup with strong password validation
 * - Login with bcrypt verification
 * - Logout functionality
 * - Error handling (duplicate email, invalid credentials)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../routers';
import type { TrpcContext } from '../_core/context';
import { getDb } from '../db';
import { users } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

// Mock context for testing
const createMockContext = (user: any = null): TrpcContext => ({
  req: {} as any,
  res: {} as any,
  user,
});

describe('Authentication Router', () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  const testName = 'Test User';
  let testUserId: number;

  // Cleanup test user after all tests
  afterAll(async () => {
    const db = await getDb();
    if (db && testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('Signup', () => {
    it('should create a new user with valid credentials', async () => {
      const caller = appRouter.createCaller(createMockContext());

      const result = await caller.auth.signup({
        name: testName,
        email: testEmail,
        password: testPassword,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Account created successfully');
      expect(result.userId).toBeDefined();
      
      testUserId = result.userId;

      // Wait for transaction to commit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify user was created in database
      const db = await getDb();
      const [user] = await db!.select().from(users).where(eq(users.id, testUserId));
      
      expect(user).toBeDefined();
      expect(user.email).toBe(testEmail);
      expect(user.name).toBe(testName);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(testPassword); // Password should be hashed
      expect(user.loginMethod).toBe('password');
      expect(user.role).toBe('user');
    });

    it('should reject duplicate email', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: testEmail, // Same email as previous test
          password: testPassword,
        })
      ).rejects.toThrow('Email already registered');
    });

    it('should reject weak password (too short)', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: `weak-${Date.now()}@example.com`,
          password: 'Short1!', // Only 7 characters
        })
      ).rejects.toThrow('Password must be at least 12 characters');
    });

    it('should reject password without uppercase', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: `noupper-${Date.now()}@example.com`,
          password: 'testpassword123!', // No uppercase
        })
      ).rejects.toThrow('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: `nolower-${Date.now()}@example.com`,
          password: 'TESTPASSWORD123!', // No lowercase
        })
      ).rejects.toThrow('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: `nonumber-${Date.now()}@example.com`,
          password: 'TestPassword!', // No number
        })
      ).rejects.toThrow('Password must contain at least one number');
    });

    it('should reject password without special character', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: `nospecial-${Date.now()}@example.com`,
          password: 'TestPassword123', // No special character
        })
      ).rejects.toThrow('Password must contain at least one special character');
    });

    it('should reject invalid email format', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: testName,
          email: 'invalid-email', // Invalid format
          password: testPassword,
        })
      ).rejects.toThrow('Invalid email format');
    });

    it('should reject name too short', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.signup({
          name: 'A', // Only 1 character
          email: `shortname-${Date.now()}@example.com`,
          password: testPassword,
        })
      ).rejects.toThrow('Name must be at least 2 characters');
    });
  });

  describe('Login', () => {
    it('should login with correct credentials', async () => {
      const caller = appRouter.createCaller(createMockContext());

      const result = await caller.auth.login({
        email: testEmail,
        password: testPassword,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Login successful');
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testEmail);
      expect(result.user.name).toBe(testName);
      expect(result.user.role).toBe('user');
    });

    it('should reject login with wrong password', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.login({
          email: testEmail,
          password: 'WrongPassword123!',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject login with non-existent email', async () => {
      const caller = appRouter.createCaller(createMockContext());

      await expect(
        caller.auth.login({
          email: 'nonexistent@example.com',
          password: testPassword,
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should update lastSignedIn timestamp on successful login', async () => {
      const caller = appRouter.createCaller(createMockContext());

      // Get current lastSignedIn
      const db = await getDb();
      const [userBefore] = await db!.select().from(users).where(eq(users.id, testUserId));
      const lastSignedInBefore = userBefore.lastSignedIn;

      // Wait 1 second to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Login
      await caller.auth.login({
        email: testEmail,
        password: testPassword,
      });

      // Check lastSignedIn was updated
      const [userAfter] = await db!.select().from(users).where(eq(users.id, testUserId));
      const lastSignedInAfter = userAfter.lastSignedIn;

      expect(lastSignedInAfter.getTime()).toBeGreaterThan(lastSignedInBefore.getTime());
    });
  });

  describe('Me (Get Current User)', () => {
    it('should return user info when authenticated', async () => {
      const mockUser = {
        id: testUserId,
        name: testName,
        email: testEmail,
        role: 'user' as const,
      };

      const caller = appRouter.createCaller(createMockContext(mockUser));

      const result = await caller.auth.me();

      expect(result).toEqual({
        id: testUserId,
        name: testName,
        email: testEmail,
        role: 'user',
      });
    });

    it('should return null when not authenticated', async () => {
      const caller = appRouter.createCaller(createMockContext(null));

      const result = await caller.auth.me();

      expect(result).toBeNull();
    });
  });

  describe('Logout', () => {
    it('should logout successfully', async () => {
      const caller = appRouter.createCaller(createMockContext());

      const result = await caller.auth.logout();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logout successful');
    });
  });

  describe('Security - bcrypt Hashing', () => {
    it('should hash password with bcrypt (not store plain text)', async () => {
      const db = await getDb();
      const [user] = await db!.select().from(users).where(eq(users.id, testUserId));

      // Password hash should be different from plain password
      expect(user.passwordHash).not.toBe(testPassword);
      
      // bcrypt hashes start with $2b$ (bcrypt identifier)
      expect(user.passwordHash).toMatch(/^\$2b\$/);
      
      // bcrypt hash length should be 60 characters
      expect(user.passwordHash?.length).toBe(60);
    });
  });
});
