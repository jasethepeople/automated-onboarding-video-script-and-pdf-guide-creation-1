import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'playwright-prune-notifier-'));
const manifest = join(temp, 'manifest.json');
const summary = join(temp, 'summary.md');
await writeFile(manifest, JSON.stringify({ summary: { planned: 4, scanned: 19, plannedBytes: 4096 }, candidates: [{ name: 'sensitive-artifact-name-should-not-appear' }] }));
const result = spawnSync('node', [join(root, 'scripts/notify-artifact-prune.mjs'), '--manifest', manifest, '--status', 'completed', '--mode', 'delete', '--run-url', 'https://github.com/example/repo/actions/runs/1'], { env: { ...process.env, GITHUB_REPOSITORY: 'example/repo', GITHUB_STEP_SUMMARY: summary, SLACK_PRUNE_WEBHOOK_URL: '', RESEND_API_KEY: '', PRUNE_NOTIFICATION_EMAIL_FROM: '', PRUNE_NOTIFICATION_EMAIL_TO: '' }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
if (!result.stdout.includes('slack-not-configured') || !result.stdout.includes('email-not-configured')) throw new Error('Expected unconfigured notification channels to be skipped safely.');
const rendered = await readFile(summary, 'utf8');
if (!rendered.includes('Artifact-pruning notification delivery') || rendered.includes('sensitive-artifact-name-should-not-appear')) throw new Error('Notifier summary breached aggregate-only output boundary.');
console.log('Artifact-pruning notifier aggregate-only and unconfigured-channel safeguards validated.');
