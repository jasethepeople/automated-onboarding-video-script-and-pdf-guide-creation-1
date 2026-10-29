import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Prerequisite project for the onboarding suite.
 *
 * This test validates an injected, pre-approved browser session before the
 * dependent onboarding project is allowed to create any test data. It does not
 * sign in, generate OTPs, or attempt MFA. If session renewal is needed, it
 * fails closed and the owner must refresh the session through the approved
 * authentication procedure.
 */

const sessionStateInput = process.env.ASANA_STORAGE_STATE ?? '.asana_auth.json';
const sessionStatePath = resolve(process.cwd(), sessionStateInput);
const workspaceUrl = process.env.ASANA_TEST_WORKSPACE_URL ?? 'https://app.asana.com/0/home';

test('approved test session is present and authenticated', async ({ page }) => {
  if (!process.env.ASANA_STORAGE_STATE) {
    throw new Error(
      'ASANA_STORAGE_STATE is required. Inject an approved, temporary browser-session file from your secret manager.'
    );
  }

  if (!existsSync(sessionStatePath)) {
    throw new Error(`ASANA_STORAGE_STATE does not exist: ${sessionStatePath}`);
  }

  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(750);

  if (/login|signin|sso|auth/i.test(page.url())) {
    throw new Error(
      'The approved test session has expired or was rejected. Refresh the test-account storage state through the approved MFA process; do not automate interactive login in CI.'
    );
  }

  const createControl = page.locator("button:has-text('Create'), [aria-label*='Create'], button[title*='Create']").first();
  await expect(createControl).toBeVisible();
});
