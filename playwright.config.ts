import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * CI authentication contract
 * --------------------------
 * Inject a pre-approved storage-state JSON file using ASANA_STORAGE_STATE.
 * The session-setup project verifies that file and the signed-in workspace
 * before either dependent onboarding project is allowed to create test data.
 *
 * `chromium-onboarding` retains the original serial narrative journey.
 * `chromium-onboarding-sharded` contains independent tests that make their own
 * uniquely named project data and can be distributed with --shard=x/y.
 */
const workspaceUrl = process.env.ASANA_TEST_WORKSPACE_URL ?? 'https://app.asana.com/0/home';
const sessionStateInput = process.env.ASANA_STORAGE_STATE ?? '.asana_auth.json';
const sessionStatePath = resolve(process.cwd(), sessionStateInput);
const approvedStorageState = existsSync(sessionStatePath) ? sessionStatePath : undefined;

const commonUse = {
  baseURL: workspaceUrl,
  storageState: approvedStorageState,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
  screenshot: 'only-on-failure' as const,
  trace: 'on-first-retry' as const,
  video: 'retain-on-failure' as const
};

const reporter: ReporterDescription[] = process.env.CI
  ? [
      ['list', {}],
      ['blob', { outputDir: 'blob-report' }],
      ['json', { outputFile: 'test-results/playwright-results.json' }]
    ]
  : [
      ['list', {}],
      ['html', { outputFolder: 'playwright-report', open: 'never' }]
    ];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  reporter,
  outputDir: 'test-results',
  projects: [
    {
      // Runs first. It validates the injected auth state and stops the pipeline
      // if the runner has been redirected to SSO or a sign-in page.
      name: 'session-setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...commonUse
      }
    },
    {
      // Original serial, stateful tutorial flow. Retain this as a smoke test
      // or use it when the story must be asserted as one connected journey.
      name: 'chromium-onboarding',
      dependencies: ['session-setup'],
      testMatch: /asana-onboarding\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...commonUse
      }
    },
    {
      // Independent, data-isolated checks suitable for --shard=x/y. Every
      // test creates its own timestamped project and has no order dependency.
      name: 'chromium-onboarding-sharded',
      dependencies: ['session-setup'],
      testMatch: /asana-onboarding-sharded\.spec\.ts/,
      fullyParallel: true,
      use: {
        ...devices['Desktop Chrome'],
        ...commonUse
      }
    }
  ]
});
