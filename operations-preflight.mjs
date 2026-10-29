#!/usr/bin/env node
/**
 * Non-destructive configuration preflight for the consolidated operations suite.
 * It evaluates only boolean presence flags and non-secret variables; it never
 * reads session state, prints credentials, invokes webhooks, or sends email.
 */

import { access, appendFile } from 'node:fs/promises';

function bool(value) { return String(value || '').toLowerCase() === 'true'; }
function positiveInteger(value) { return Number.isInteger(Number(value)) && Number(value) > 0; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }

const checks = [];
function check(name, status, detail) { checks.push({ name, status, detail }); }

const requiredFiles = [
  '.github/workflows/asana-onboarding-e2e.yml',
  '.github/workflows/asana-session-health.yml',
  '.github/workflows/prune-playwright-artifacts.yml',
  'playwright.config.ts',
  'scripts/export-shard-metrics.mjs',
  'scripts/analyze-shard-trends.mjs',
  'scripts/plan-artifact-prune.mjs',
  'scripts/notify-artifact-prune.mjs',
  'dashboard/playwright-shard-dashboard.html'
];
for (const file of requiredFiles) check(`Asset: ${file}`, await exists(file) ? 'pass' : 'fail', await exists(file) ? 'Present.' : 'Missing required operational asset.');

const slack = bool(process.env.SLACK_PRUNE_WEBHOOK_CONFIGURED);
const resend = bool(process.env.RESEND_API_KEY_CONFIGURED);
const emailFrom = bool(process.env.PRUNE_EMAIL_FROM_CONFIGURED);
const emailTo = bool(process.env.PRUNE_EMAIL_TO_CONFIGURED);
check('Slack pruning notification', slack ? 'pass' : 'info', slack ? 'Configured; delivery remains aggregate-only.' : 'Optional; add SLACK_PRUNE_WEBHOOK_URL to enable.');
const emailStates = [resend, emailFrom, emailTo];
check('Email pruning notification', emailStates.every(Boolean) ? 'pass' : emailStates.some(Boolean) ? 'fail' : 'info', emailStates.every(Boolean) ? 'Fully configured.' : emailStates.some(Boolean) ? 'Partial configuration: configure Resend key, sender, and recipient together.' : 'Optional; all three values are absent.');

for (const [name, value] of [
  ['Metrics retention', process.env.PLAYWRIGHT_PRUNE_METRICS_DAYS],
  ['Report retention', process.env.PLAYWRIGHT_PRUNE_REPORT_DAYS],
  ['Diagnostic retention', process.env.PLAYWRIGHT_PRUNE_DIAGNOSTIC_DAYS],
  ['Pruning deletion cap', process.env.PLAYWRIGHT_PRUNE_MAX_DELETIONS],
  ['Trend baseline size', process.env.PLAYWRIGHT_TREND_BASELINE_SIZE],
  ['Trend minimum baseline', process.env.PLAYWRIGHT_TREND_MINIMUM_BASELINE]
]) check(name, positiveInteger(value) ? 'pass' : 'fail', positiveInteger(value) ? `Configured as ${value}.` : 'Must be a positive integer.');

const minimum = Number(process.env.PLAYWRIGHT_TREND_MINIMUM_BASELINE);
const baseline = Number(process.env.PLAYWRIGHT_TREND_BASELINE_SIZE);
check('Trend baseline relationship', minimum <= baseline ? 'pass' : 'fail', minimum <= baseline ? 'Minimum baseline does not exceed baseline window.' : 'Minimum baseline cannot exceed baseline window.');
check('Metrics history branch', bool(process.env.METRICS_HISTORY_BRANCH_EXISTS) ? 'pass' : 'info', bool(process.env.METRICS_HISTORY_BRANCH_EXISTS) ? 'metrics-history branch is available.' : 'Branch will be created on the first successful metrics merge run.');

const counts = { pass: checks.filter(c => c.status === 'pass').length, info: checks.filter(c => c.status === 'info').length, fail: checks.filter(c => c.status === 'fail').length };
const rows = checks.map(c => `| ${c.status === 'pass' ? 'Pass' : c.status === 'fail' ? 'Fail' : 'Optional'} | ${c.name} | ${c.detail} |`).join('\n');
const markdown = [
  '### Playwright onboarding operations preflight',
  '',
  `**Result:** ${counts.fail ? 'configuration action required' : 'ready'} · ${counts.pass} pass · ${counts.info} optional · ${counts.fail} fail`,
  '',
  '| Status | Check | Detail |',
  '|---|---|---|',
  rows,
  '',
  '> This preflight is non-destructive. It does not read session state, run browser tests, prune artifacts, post to Slack, or send email.'
].join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
process.stdout.write(markdown);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `preflight_failed=${counts.fail > 0}\n`);
if (counts.fail) process.exitCode = 1;
