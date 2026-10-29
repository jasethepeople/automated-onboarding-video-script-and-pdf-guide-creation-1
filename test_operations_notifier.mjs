import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'operations-notifier-'));
const summary = join(temp, 'summary.md');
const result = spawnSync('node', [join(root, 'scripts/notify-operations.mjs'), '--event', 'e2e-regression', '--status', 'warning', '--detail', 'Threshold exceeded\nsecret-like-value-should-not-appear', '--run-url', 'https://github.com/example/repo/actions/runs/7'], { env: { ...process.env, GITHUB_REPOSITORY: 'example/repo', GITHUB_STEP_SUMMARY: summary, SLACK_PRUNE_WEBHOOK_URL: '', RESEND_API_KEY: '', PRUNE_NOTIFICATION_EMAIL_FROM: '', PRUNE_NOTIFICATION_EMAIL_TO: '' }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
if (!result.stdout.includes('slack-not-configured') || !result.stdout.includes('email-not-configured')) throw new Error('Expected optional notification channels to be skipped safely.');
const rendered = await readFile(summary, 'utf8');
if (!rendered.includes('Event:** e2e-regression') || rendered.includes('secret-like-value-should-not-appear')) throw new Error('Notifier did not preserve the aggregate-only output boundary.');
console.log('Unified operations notifier aggregate-only and no-credential safeguards validated.');
