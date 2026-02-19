import { describe, it, expect, beforeAll } from 'vitest';

/**
 * MOTHER v7.0 GCloud - Comprehensive Audit Test Suite
 * Scientific Method Phase 11: Audit
 * 
 * Tests all 7 layers of MOTHER architecture
 */

const GCLOUD_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app';

// Helper to add delay between tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe.sequential('MOTHER v7.0 GCloud - Comprehensive Audit', () => {
  
  // Warm-up: ensure GCloud Run instance is active before tests
  beforeAll(async () => {
    console.log('🔥 Warming up GCloud Run instance...');
    await fetch(`${GCLOUD_URL}/api/trpc/mother.stats`);
    await delay(3000); // Wait for instance to be fully ready
    console.log('✅ Warm-up complete');
  }, 30000);
  
  describe('Layer 1: Interface (tRPC)', () => {
    it('should respond to health check', async () => {
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.stats`);
      expect(response.status).toBe(200);
    });

    it('should accept batch queries', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "test", "useCache": false } }
        })
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data[0].result.data.json).toBeDefined();
    }, 60000);
  });

  describe('Layer 3: Intelligence (Complexity Assessment)', () => {
    it('should route simple queries to gpt-4o-mini', async () => {
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "What is 2+2?", "useCache": false } }
        })
      });
      const data = await response.json();
      if (data[0].error) {
        console.log('❌ Test 1 Error:', JSON.stringify(data[0].error, null, 2));
      }
      if (!data[0].result) {
        console.log('❌ Test 1 No Result:', JSON.stringify(data[0], null, 2).substring(0, 500));
      }
      expect(data[0].result.data.json.tier).toBe('gpt-4o-mini');
      expect(data[0].result.data.json.complexityScore).toBeLessThan(0.3);
    }, 60000);

    it('should calculate complexity scores correctly', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "Explain quantum entanglement", "useCache": false } }
        })
      });
      const data = await response.json();
      // Log error if exists
      if (data[0].error) {
        console.log('Error:', JSON.stringify(data[0].error, null, 2));
      }
      expect(data[0].result?.data?.json?.complexityScore).toBeGreaterThan(0);
      expect(data[0].result?.data?.json?.complexityScore).toBeLessThanOrEqual(1);
    }, 60000);
  });

  describe('Layer 4: Execution (LLM Integration)', () => {
    it('should return valid responses', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "Say hello", "useCache": false } }
        })
      });
      const data = await response.json();
      expect(data[0].result.data.json.response).toBeDefined();
      expect(data[0].result.data.json.response.length).toBeGreaterThan(0);
    }, 60000);

    it('should track token usage', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "test", "useCache": false } }
        })
      });
      const data = await response.json();
      expect(data[0].result.data.json.tokensUsed).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Layer 5: Knowledge (Retrieval)', () => {
    it('should retrieve knowledge for relevant queries', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "What is brutal honesty?", "useCache": false } }
        })
      });
      const data = await response.json();
      const responseText = data[0].result.data.json.response.toLowerCase();
      // Should contain knowledge-based content
      expect(responseText).toContain('honest');
      expect(data[0].result.data.json.response.length).toBeGreaterThan(100);
    }, 60000);
  });

  describe('Layer 6: Guardian (Quality)', () => {
    it('should calculate quality scores', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "Explain AI", "useCache": false } }
        })
      });
      const data = await response.json();
      console.log('🔍 Full Response:', JSON.stringify(data, null, 2).substring(0, 500));
      if (data[0]?.error) {
        console.log('❌ API Error:', JSON.stringify(data[0].error, null, 2));
      }
      expect(data[0]?.result?.data?.json?.quality).toBeDefined();
      expect(data[0].result.data.json.quality.qualityScore).toBeGreaterThan(0);
      expect(data[0].result.data.json.quality.qualityScore).toBeLessThanOrEqual(100);
    }, 60000);
  });

  describe('Layer 7: Learning (Metrics)', () => {
    it('should log queries to database', async () => {
      await delay(3000); // Wait 3s for previous query to be logged
      const statsBefore = await fetch(`${GCLOUD_URL}/api/trpc/mother.stats`);
      const beforeData = await statsBefore.json();
      const totalBefore = beforeData.result.data.json.totalQueries;

      await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "test query", "useCache": false } }
        })
      });

      const statsAfter = await fetch(`${GCLOUD_URL}/api/trpc/mother.stats`);
      const afterData = await statsAfter.json();
      const totalAfter = afterData.result.data.json.totalQueries;

      expect(totalAfter).toBeGreaterThan(totalBefore);
    }, 60000);

    it('should calculate cost metrics', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "test", "useCache": false } }
        })
      });
      const data = await response.json();
      expect(data[0].result.data.json.cost).toBeGreaterThan(0);
      expect(data[0].result.data.json.costReduction).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Performance Benchmarks', () => {
    it('should respond within 15 seconds', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const start = Date.now();
      await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "test", "useCache": false } }
        })
      });
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(15000);
    }, 60000);

    it('should achieve >80% cost reduction', async () => {
      await delay(2000); // Wait 2s to avoid rate limiting
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "0": { "json": { "query": "Explain something complex", "useCache": false } }
        })
      });
      const data = await response.json();
      expect(data[0].result.data.json.costReduction).toBeGreaterThan(80);
    }, 60000);
  });

  describe('System Stats', () => {
    it('should return valid statistics', async () => {
      const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.stats`);
      const data = await response.json();
      const stats = data.result.data.json;
      
      expect(stats.totalQueries).toBeGreaterThan(0);
      expect(stats.tier1Percentage + stats.tier2Percentage + stats.tier3Percentage).toBeCloseTo(100, 1);
      expect(parseFloat(stats.avgQuality)).toBeGreaterThan(0);
    });
  });
});
