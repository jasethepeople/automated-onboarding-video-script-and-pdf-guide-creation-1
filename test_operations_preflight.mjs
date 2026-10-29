import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'playwright-operations-preflight-'));
const baseEnv = {
  ...process.env,
  PLAYWRIGHT_PRUNE_METRICS_DAYS: '90', PLAYWRIGHT_PRUNE_REPORT_DAYS: '30', PLAYWRIGHT_PRUNE_DIAGNOSTIC_DAYS: '14', PLAYWRIGHT_PRUNE_MAX_DELETIONS: '100', PLAYWRIGHT_TREND_BASELINE_SIZE: '10', PLAYWRIGHT_TREND_MINIMUM_BASELINE: '5', METRICS_HISTORY_BRANCH_EXISTS: 'false', SLACK_PRUNE_WEBHOOK_CONFIGURED: 'false', RESEND_API_KEY_CONFIGURED: 'false', PRUNE_EMAIL_FROM_CONFIGURED: 'false', PRUNE_EMAIL_TO_CONFIGURED: 'false'
};
const summary = join(temp, 'summary.md');
const result = spawnSync('node', [join(root, 'scripts/operations-preflight.mjs')], { cwd: root, env: { ...baseEnv, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
const content = await readFile(summary, 'utf8');
if (!content.includes('Result:** ready') || !content.includes('Slack pruning notification') || !content.includes('Optional')) throw new Error('Expected ready preflight summary with optional notification handling.');

const partialSummary = join(temp, 'partial-summary.md');
const partial = spawnSync('node', [join(root, 'scripts/operations-preflight.mjs')], { cwd: root, env: { ...baseEnv, GITHUB_STEP_SUMMARY: partialSummary, RESEND_API_KEY_CONFIGURED: 'true' }, encoding: 'utf8' });
if (partial.status === 0) throw new Error('Expected partial email configuration to fail preflight.');
const partialContent = await readFile(partialSummary, 'utf8');
if (!partialContent.includes('Partial configuration')) throw new Error('Expected partial email configuration guidance.');
console.log('Operations preflight asset checks, optional notifications, and partial-email safeguards validated.');
