#!/usr/bin/env node
/**
 * Unified aggregate-only notifier for operational CI events.
 * Credentials are read only from injected secrets. No browser state, artifact
 * names, raw logs, error stacks, or credentials are emitted in messages.
 */

import { appendFile } from 'node:fs/promises';

function arg(name, fallback = undefined) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function sanitize(value) { return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, 500); }

const event = sanitize(arg('--event', 'operations-event'));
const status = sanitize(arg('--status', 'failed'));
const runUrl = sanitize(arg('--run-url', ''));
const detail = sanitize(arg('--detail', 'Review the linked GitHub Actions run for safe diagnostics.'));
const labels = {
  'e2e-failure': 'Playwright onboarding E2E failed',
  'e2e-regression': 'Playwright shard performance regression detected',
  'session-health-failure': 'Approved Playwright session health check failed',
  'operations-preflight-failure': 'Playwright operations preflight requires configuration action',
  'artifact-pruning-failure': 'Artifact pruning workflow failed',
  'artifact-pruning-complete': 'Artifact pruning completed'
};
const heading = labels[event] || `Playwright operations event: ${event}`;
const lines = [
  heading,
  `Status: ${status}`,
  `Repository: ${sanitize(process.env.GITHUB_REPOSITORY || 'unknown')}`,
  `Detail: ${detail}`,
  runUrl ? `Run: ${runUrl}` : ''
].filter(Boolean);
const text = lines.join('\n');
const outcomes = [];

async function sendSlack() {
  const webhook = process.env.SLACK_PRUNE_WEBHOOK_URL;
  if (!webhook) return 'slack-not-configured';
  const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error(`Slack returned HTTP ${response.status}.`);
  return 'slack-sent';
}

async function sendEmail() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PRUNE_NOTIFICATION_EMAIL_FROM;
  const recipients = (process.env.PRUNE_NOTIFICATION_EMAIL_TO || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!apiKey && !from && !recipients.length) return 'email-not-configured';
  if (!apiKey || !from || !recipients.length) throw new Error('Email notification is partially configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, subject: `[CI] ${heading}`, text, tags: [{ name: 'source', value: 'playwright-operations' }, { name: 'event', value: event }, { name: 'status', value: status }] })
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  return 'email-sent';
}

for (const sender of [sendSlack, sendEmail]) {
  try { outcomes.push(await sender()); }
  catch (error) { outcomes.push(`notification-error:${sanitize(error.message)}`); }
}
const summary = `\n### Operations notification delivery\n\n- **Event:** ${event}\n- **Status:** ${status}\n- **Channels:** ${outcomes.join(', ')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(`Operations notification outcomes: ${outcomes.join(', ')}`);
