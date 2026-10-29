import { expect, Locator, Page, test } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Shardable onboarding checks.
 *
 * Unlike the serial narrative spec, every test here creates and verifies its own
 * timestamped project. There is no module-level project URL or dependency on a
 * preceding test, so Playwright may distribute these checks to independent
 * GitHub Actions runners with --shard=x/y.
 *
 * Safety: projects and tasks use a unique prefix. Tests open the Share dialog
 * but do not type email addresses or submit invitations.
 */

const workspaceUrl = process.env.ASANA_TEST_WORKSPACE_URL ?? 'https://app.asana.com/0/home';
const projectPrefix = process.env.ASANA_TEST_PROJECT_PREFIX ?? 'E2E Onboarding';

async function firstVisible(page: Page, selectors: string[], label: string, timeout = 12_000): Promise<Locator> {
  const failures: string[] = [];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    } catch {
      failures.push(selector);
    }
  }
  throw new Error(`Could not find ${label}. Checked:\n- ${failures.join('\n- ')}`);
}

async function clickFirstVisible(page: Page, selectors: string[], label: string): Promise<void> {
  await (await firstVisible(page, selectors, label)).click();
}

async function fillFirstVisible(page: Page, selectors: string[], value: string, label: string): Promise<void> {
  await (await firstVisible(page, selectors, label)).fill(value);
}

function testToken(testId: string): string {
  const shard = process.env.PLAYWRIGHT_SHARD_INDEX ?? 'local';
  const compactId = testId.replace(/[^a-zA-Z0-9]/g, '').slice(-10);
  return `${shard}-${compactId}-${Math.random().toString(36).slice(2, 7)}`;
}

function projectNameFor(testId: string): string {
  return `${projectPrefix} ${testToken(testId)}`;
}

async function createProject(page: Page, projectName: string): Promise<void> {
  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded' });
  await clickFirstVisible(page, ["button:has-text('Create')", "[aria-label*='Create']", "button[title*='Create']"], 'Create control');
  await clickFirstVisible(page, ["[role='menuitem']:has-text('Project')", "button:has-text('Project')", 'text=Project'], 'Project option');
  await clickFirstVisible(page, ["button:has-text('Blank project')", "[role='button']:has-text('Blank project')", 'text=Blank project'], 'Blank project option');
  await fillFirstVisible(
    page,
    ["input[placeholder*='Project name']", "input[aria-label*='Project name']", "input[name*='project']"],
    projectName,
    'project name field'
  );
  await clickFirstVisible(
    page,
    ["button:has-text('Create project')", "[role='button']:has-text('Create project')", "button:has-text('Create')"],
    'Create project confirmation'
  );
  await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible();
}

async function addSection(page: Page, sectionName: string): Promise<void> {
  await clickFirstVisible(page, ["button:has-text('Add section')", "[aria-label*='Add section']", 'text=Add section'], 'Add section control');
  await fillFirstVisible(page, ["input[placeholder*='Section']", "input[aria-label*='Section']", 'input:focus'], sectionName, 'section name field');
  await (await firstVisible(page, ["input[placeholder*='Section']", "input[aria-label*='Section']", 'input:focus'], 'section name field')).press('Enter');
  await expect(page.getByText(sectionName, { exact: true }).first()).toBeVisible();
}

async function createAndOpenTask(page: Page, projectName: string, taskName: string): Promise<void> {
  await createProject(page, projectName);
  await addSection(page, 'Plan');
  await clickFirstVisible(
    page,
    ["text=Plan >> xpath=following::button[contains(., 'Add task')][1]", "button:has-text('Add task')", "[aria-label*='Add task']"],
    'Add task control'
  );
  await fillFirstVisible(page, ["input[placeholder*='Task name']", "input[aria-label*='Task name']", 'input:focus'], taskName, 'task name field');
  await (await firstVisible(page, ["input[placeholder*='Task name']", "input[aria-label*='Task name']", 'input:focus'], 'task name field')).press('Enter');
  const task = page.getByText(taskName, { exact: true }).first();
  await expect(task).toBeVisible();
  await task.click();
}

test.beforeAll(() => {
  const authState = process.env.ASANA_STORAGE_STATE;
  if (!authState || !existsSync(authState)) {
    throw new Error('ASANA_STORAGE_STATE must point to an approved, existing browser-state file before sharded onboarding tests can run.');
  }
});

test.describe.configure({ mode: 'parallel' });

test('SHARD-01: signed-in workspace navigation is visible', async ({ page }) => {
  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded' });
  await expect(firstVisible(page, ["button:has-text('Create')", "[aria-label*='Create']"], 'Create control')).resolves.toBeTruthy();
  await expect(firstVisible(page, ['text=My tasks', "[aria-label*='My tasks']"], 'My tasks navigation')).resolves.toBeTruthy();
  await expect(firstVisible(page, ['text=Inbox', "[aria-label*='Inbox']"], 'Inbox navigation')).resolves.toBeTruthy();
});

test('SHARD-02: user can create a uniquely isolated blank project', async ({ page }, testInfo) => {
  const projectName = projectNameFor(testInfo.testId);
  await createProject(page, projectName);
});

test('SHARD-03: user can create a staged project structure', async ({ page }, testInfo) => {
  const projectName = projectNameFor(testInfo.testId);
  await createProject(page, projectName);
  await addSection(page, 'Plan');
  await addSection(page, 'Build');
  await addSection(page, 'Launch');
});

test('SHARD-04: user can create and open a first task', async ({ page }, testInfo) => {
  const token = testToken(testInfo.testId);
  await createAndOpenTask(page, `${projectPrefix} ${token}`, `Verify first task ${token}`);
});

test('SHARD-05: task-clarity controls render in a new project', async ({ page }, testInfo) => {
  const token = testToken(testInfo.testId);
  await createAndOpenTask(page, `${projectPrefix} ${token}`, `Verify fields ${token}`);
  await expect(firstVisible(page, ["button:has-text('Assignee')", "[aria-label*='Assignee']", 'text=Assignee'], 'Assignee control')).resolves.toBeTruthy();
  await expect(firstVisible(page, ["button:has-text('Due date')", "[aria-label*='Due date']", 'text=Due date'], 'Due date control')).resolves.toBeTruthy();
  await expect(firstVisible(page, ['textarea', "[contenteditable='true']", 'text=Add description'], 'task-context entry control')).resolves.toBeTruthy();
});

test('SHARD-06: sharing controls are available without sending an invite', async ({ page }, testInfo) => {
  const projectName = projectNameFor(testInfo.testId);
  await createProject(page, projectName);
  await clickFirstVisible(page, ["button:has-text('Share')", "[aria-label*='Share']", "button[title*='Share']"], 'Share control');
  await expect(firstVisible(page, ["input[placeholder*='name or email']", "input[aria-label*='name or email']", "input[type='email']"], 'share invite field')).resolves.toBeTruthy();
  await expect(firstVisible(page, ["button:has-text('Editor')", 'text=Editor', 'text=Viewer', 'text=Commenter'], 'permission control')).resolves.toBeTruthy();
});
