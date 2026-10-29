import { expect, Locator, Page, test } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Representative Asana new-user activation flow.
 *
 * Preconditions:
 * 1. ASANA_STORAGE_STATE points to a manually-created, authenticated Playwright
 *    storage-state file for a dedicated test organization.
 * 2. The signed-in account can create projects in that organization.
 *
 * Safety: This suite creates one timestamped test project and one task. It opens
 * the Share dialog but never fills an email address or submits an invitation.
 */

const workspaceUrl = process.env.ASANA_TEST_WORKSPACE_URL ?? 'https://app.asana.com/0/home';
const projectPrefix = process.env.ASANA_TEST_PROJECT_PREFIX ?? 'E2E Onboarding';
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
const projectName = `${projectPrefix} ${runId}`;
const taskName = `Verify first task ${runId}`;

let createdProjectUrl = '';

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

async function clickFirstVisible(page: Page, selectors: string[], label: string, timeout?: number): Promise<void> {
  const locator = await firstVisible(page, selectors, label, timeout);
  await locator.click();
}

async function fillFirstVisible(page: Page, selectors: string[], value: string, label: string): Promise<void> {
  const locator = await firstVisible(page, selectors, label);
  await locator.fill(value);
}

async function openCreatedProject(page: Page): Promise<void> {
  expect(createdProjectUrl, 'A previous test must create a project before this step.').not.toBe('');
  await page.goto(createdProjectUrl, { waitUntil: 'domcontentloaded' });
  await expect(firstVisible(page, [`text=${projectName}`, 'h1'], 'created project title')).resolves.toBeTruthy();
}

async function addSection(page: Page, sectionName: string): Promise<void> {
  await clickFirstVisible(
    page,
    [
      "button:has-text('Add section')",
      "[aria-label*='Add section']",
      "text=Add section"
    ],
    'Add section control'
  );
  await fillFirstVisible(
    page,
    [
      "input[placeholder*='Section']",
      "input[aria-label*='Section']",
      'input:focus'
    ],
    sectionName,
    'new section name field'
  );
  const input = await firstVisible(
    page,
    ["input[placeholder*='Section']", "input[aria-label*='Section']", 'input:focus'],
    'new section name field'
  );
  await input.press('Enter');
  await expect(page.getByText(sectionName, { exact: true }).first()).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  const authState = process.env.ASANA_STORAGE_STATE;
  if (!authState) {
    throw new Error(
      'ASANA_STORAGE_STATE is required. Save a test-account session with: python asana_guide_generator.py --record-auth --auth-only --headed'
    );
  }
  if (!existsSync(authState)) {
    throw new Error(`ASANA_STORAGE_STATE does not exist: ${authState}`);
  }
});

test.beforeEach(async ({ page }) => {
  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded' });
});

test('ONB-01: workspace navigation is available to a signed-in user', async ({ page }) => {
  await expect(firstVisible(page, ["button:has-text('Create')", "[aria-label*='Create']"], 'Create control')).resolves.toBeTruthy();
  await expect(firstVisible(page, ['text=My tasks', "[aria-label*='My tasks']"], 'My tasks navigation')).resolves.toBeTruthy();
  await expect(firstVisible(page, ['text=Inbox', "[aria-label*='Inbox']"], 'Inbox navigation')).resolves.toBeTruthy();
});

test('ONB-02: user can begin and create a blank project', async ({ page }) => {
  await clickFirstVisible(
    page,
    ["button:has-text('Create')", "[aria-label*='Create']", "button[title*='Create']"],
    'Create control'
  );
  await clickFirstVisible(
    page,
    ["[role='menuitem']:has-text('Project')", "button:has-text('Project')", 'text=Project'],
    'Project option'
  );
  await clickFirstVisible(
    page,
    ["button:has-text('Blank project')", "[role='button']:has-text('Blank project')", 'text=Blank project'],
    'Blank project option'
  );
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
  createdProjectUrl = page.url();
  expect(createdProjectUrl).toContain('app.asana.com');
});

test('ONB-03: user can structure the project into visible work stages', async ({ page }) => {
  await openCreatedProject(page);
  await addSection(page, 'Plan');
  await addSection(page, 'Build');
  await addSection(page, 'Launch');
  await expect(page.getByText('Plan', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Build', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Launch', { exact: true }).first()).toBeVisible();
});

test('ONB-04: user can capture and open a first actionable task', async ({ page }) => {
  await openCreatedProject(page);
  await clickFirstVisible(
    page,
    [
      "text=Plan >> xpath=following::button[contains(., 'Add task')][1]",
      "button:has-text('Add task')",
      "[aria-label*='Add task']"
    ],
    'Add task control'
  );
  await fillFirstVisible(
    page,
    ["input[placeholder*='Task name']", "input[aria-label*='Task name']", 'input:focus'],
    taskName,
    'task title field'
  );
  const taskInput = await firstVisible(
    page,
    ["input[placeholder*='Task name']", "input[aria-label*='Task name']", 'input:focus'],
    'task title field'
  );
  await taskInput.press('Enter');
  const task = page.getByText(taskName, { exact: true }).first();
  await expect(task).toBeVisible();
  await task.click();
  await expect(page.getByText(taskName, { exact: true }).first()).toBeVisible();
});

test('ONB-05: task-clarity controls render before the user commits work', async ({ page }) => {
  await openCreatedProject(page);
  await page.getByText(taskName, { exact: true }).first().click();
  await expect(firstVisible(page, ["button:has-text('Assignee')", "[aria-label*='Assignee']", 'text=Assignee'], 'Assignee control')).resolves.toBeTruthy();
  await expect(firstVisible(page, ["button:has-text('Due date')", "[aria-label*='Due date']", 'text=Due date'], 'Due date control')).resolves.toBeTruthy();
  await expect(firstVisible(page, ["textarea", "[contenteditable='true']", "text=Add description"], 'task-context entry control')).resolves.toBeTruthy();
});

test('ONB-06: user can open project sharing controls without sending an invitation', async ({ page }) => {
  await openCreatedProject(page);
  await clickFirstVisible(
    page,
    ["button:has-text('Share')", "[aria-label*='Share']", "button[title*='Share']"],
    'Share control'
  );
  await expect(firstVisible(page, ["input[placeholder*='name or email']", "input[aria-label*='name or email']", "input[type='email']"], 'share invite field')).resolves.toBeTruthy();
  await expect(firstVisible(page, ["button:has-text('Editor')", 'text=Editor', 'text=Viewer', 'text=Commenter'], 'project permission control')).resolves.toBeTruthy();
  // Intentionally no fill or click is performed in the invite field.
});
