#!/usr/bin/env node
/**
 * Send optional, aggregate-only notifications for the artifact-pruning workflow.
 * Secret values are read only from injected GitHub Actions secrets and are never
 * printed, saved, or included in the message body.
 */

import { readFile } from 'node:fs/promises';

function arg(name, fallback = undefined) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB']; let value = bytes; let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}
function sanitize(text) { return String(text ?? '').replace(/[\r\n]+/g, ' ').slice(0, 500); }

const manifestPath = arg('--manifest');
const status = arg('--status', 'completed');
const mode = arg('--mode', 'delete');
const runUrl = arg('--run-url', '');
const errorSummary = arg('--error-summary', '');
let manifest = null;
if (manifestPath) {
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { console.warn(`Manifest unavailable for notification context: ${error.message}`); }
}

const planned = number(manifest?.summary?.planned);
const scanned = number(manifest?.summary?.scanned);
const bytes = number(manifest?.summary?.plannedBytes);
const isFailure = status === 'failed';
const heading = isFailure ? 'Artifact pruning workflow failed' : mode === 'dry-run' ? 'Artifact pruning dry run completed' : 'Artifact pruning completed';
const lines = [
  heading,
  `Repository: ${sanitize(process.env.GITHUB_REPOSITORY || 'unknown')}`,
  `Mode: ${sanitize(mode)}`,
  `Artifacts scanned: ${scanned}`,
  isFailure ? `Error context: ${sanitize(errorSummary || 'See the linked GitHub Actions run.')}` : `Artifacts ${mode === 'delete' ? 'deleted' : 'planned for deletion'}: ${planned}`,
  !isFailure ? `Planned storage metadata: ${formatBytes(bytes)}` : '',
  runUrl ? `Run: ${runUrl}` : ''
].filter(Boolean);
const text = lines.join('\n');
const outcomes = [];

async function sendSlack() {
  const webhook = process.env.SLACK_PRUNE_WEBHOOK_URL;
  if (!webhook) return 'slack-not-configured';
  const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error(`Slack notification returned HTTP ${response.status}.`);
  return 'slack-sent';
}

async function sendResend() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PRUNE_NOTIFICATION_EMAIL_FROM;
  const recipients = (process.env.PRUNE_NOTIFICATION_EMAIL_TO || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!apiKey && !from && !recipients.length) return 'email-not-configured';
  if (!apiKey || !from || !recipients.length) throw new Error('Email notification is partially configured; RESEND_API_KEY, PRUNE_NOTIFICATION_EMAIL_FROM, and PRUNE_NOTIFICATION_EMAIL_TO are all required.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, subject: `[CI] ${heading}`, text, tags: [{ name: 'source', value: 'artifact-pruning' }, { name: 'status', value: isFailure ? 'failed' : 'completed' }] })
  });
  if (!response.ok) throw new Error(`Email notification returned HTTP ${response.status}.`);
  return 'email-sent';
}

for (const sender of [sendSlack, sendResend]) {
  try { outcomes.push(await sender()); }
  catch (error) { outcomes.push(`notification-error:${error.message}`); }
}

console.log(`Pruning notification outcomes: ${outcomes.join(', ')}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = `\n### Artifact-pruning notification delivery\n\n- **Outcome:** ${isFailure ? 'failure alert' : `${mode} notification`}\n- **Channels:** ${outcomes.map(sanitize).join(', ')}\n`;
  await (await import('node:fs/promises')).appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
