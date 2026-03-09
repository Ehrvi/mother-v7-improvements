/**
 * MOTHER v92.0: Playwright Configuration — Sprint 10 C209
 *
 * E2E test configuration for MOTHER platform.
 * Tests run against the local development server or production URL.
 *
 * Scientific basis:
 * - Fowler (2019) TestPyramid — E2E tests for critical user journeys
 * - Google Testing Blog (2015) — Focus E2E on critical paths
 * - ISO/IEC 25010:2011 §4.2.1 — Functional Suitability
 *
 * C209-8: Testes E2E Playwright — Sprint 10 C209
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:5173';
const API_URL = process.env.TEST_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // API testing context
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },

  projects: [
    {
      name: 'api-tests',
      testMatch: '**/mother-sprint10.spec.ts',
      use: {
        // API tests don't need a browser
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
      },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Global setup/teardown
  globalSetup: undefined,
  globalTeardown: undefined,

  // Web server config — start dev server before tests
  // Uncomment for CI:
  // webServer: {
  //   command: 'pnpm dev',
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});
