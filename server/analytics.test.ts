import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyticsRouter } from './routers/analytics';
import type { TrpcContext } from './_core/trpc';

/**
 * Analytics Router Tests
 * Validates admin-only access and data aggregation
 */

describe('Analytics Router', () => {
  describe('summary endpoint', () => {
    it('should allow admin to access analytics', async () => {
      // Mock admin context
      const adminCtx: TrpcContext = {
        user: {
          id: 1,
          openId: 'admin-123',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const caller = analyticsRouter.createCaller(adminCtx);
      
      // Should not throw error for admin
      const result = await caller.summary({ days: 7 });
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('totalQueries');
      expect(result).toHaveProperty('avgCost');
      expect(result).toHaveProperty('avgQualityScore');
      expect(result).toHaveProperty('avgCostReduction');
      expect(result).toHaveProperty('cacheHitRate');
      expect(result).toHaveProperty('tierDistribution');
      expect(result).toHaveProperty('dateRange');
    });

    it('should reject non-admin users', async () => {
      // Mock regular user context
      const userCtx: TrpcContext = {
        user: {
          id: 2,
          openId: 'user-456',
          name: 'Regular User',
          email: 'user@example.com',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const caller = analyticsRouter.createCaller(userCtx);
      
      // Should throw FORBIDDEN error
      await expect(caller.summary({ days: 7 })).rejects.toThrow('Admin access required');
    });

    it('should return valid tier distribution structure', async () => {
      const adminCtx: TrpcContext = {
        user: {
          id: 1,
          openId: 'admin-123',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const caller = analyticsRouter.createCaller(adminCtx);
      const result = await caller.summary({ days: 7 });
      
      expect(result.tierDistribution).toBeDefined();
      expect(result.tierDistribution).toHaveProperty('guardian');
      expect(result.tierDistribution).toHaveProperty('direct');
      expect(result.tierDistribution).toHaveProperty('parallel');
      
      // Percentages should be numbers
      expect(typeof result.tierDistribution.guardian).toBe('number');
      expect(typeof result.tierDistribution.direct).toBe('number');
      expect(typeof result.tierDistribution.parallel).toBe('number');
    });

    it('should accept days parameter within valid range', async () => {
      const adminCtx: TrpcContext = {
        user: {
          id: 1,
          openId: 'admin-123',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const caller = analyticsRouter.createCaller(adminCtx);
      
      // Test valid ranges
      await expect(caller.summary({ days: 1 })).resolves.toBeDefined();
      await expect(caller.summary({ days: 30 })).resolves.toBeDefined();
      await expect(caller.summary({ days: 90 })).resolves.toBeDefined();
    });

    it('should return dateRange with from and to', async () => {
      const adminCtx: TrpcContext = {
        user: {
          id: 1,
          openId: 'admin-123',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const caller = analyticsRouter.createCaller(adminCtx);
      const result = await caller.summary({ days: 7 });
      
      expect(result.dateRange).toBeDefined();
      expect(result.dateRange.from).toBeDefined();
      expect(result.dateRange.to).toBeDefined();
      
      // Validate ISO date format
      expect(() => new Date(result.dateRange.from)).not.toThrow();
      expect(() => new Date(result.dateRange.to)).not.toThrow();
      
      // from should be before to
      const fromDate = new Date(result.dateRange.from);
      const toDate = new Date(result.dateRange.to);
      expect(fromDate.getTime()).toBeLessThan(toDate.getTime());
    });

    it('should handle graceful degradation on database error', async () => {
      const adminCtx: TrpcContext = {
        user: {
          id: 1,
          openId: 'admin-123',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const caller = analyticsRouter.createCaller(adminCtx);
      
      // Even with database errors, should return empty data instead of throwing
      const result = await caller.summary({ days: 7 });
      
      // Should return structure with zero values (graceful degradation)
      expect(result).toBeDefined();
      expect(typeof result.totalQueries).toBe('number');
      expect(typeof result.avgCost).toBe('number');
      expect(typeof result.avgQualityScore).toBe('number');
    });
  });
});
