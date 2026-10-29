#!/usr/bin/env node
/**
 * Verifies that every promised suite capability has executable source and, where
 * appropriate, a workflow reference. This is intentionally file-based and does
 * not use live SaaS accounts, secrets, webhooks, or GitHub APIs.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
const root = resolve(arg('--root') || '.');
const output = arg('--output') ? resolve(arg('--output')) : null;
const read = (path) => readFile(resolve(root, path), 'utf8');

const featureDefinitions = [
  { id: 'onboarding-video-script', files: ['asana_onboarding_video_script.md'] },
  { id: 'annotated-pdf-guide-generator', files: ['asana_guide_generator.py', 'workflow.json'] },
  { id: 'serial-playwright-onboarding', files: ['tests/asana-onboarding.spec.ts', 'playwright.config.ts'] },
  { id: 'sharded-playwright-onboarding', files: ['tests/asana-onboarding-sharded.spec.ts', '.github/workflows/asana-onboarding-e2e.yml'], references: [{ file: '.github/workflows/asana-onboarding-e2e.yml', text: '--shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}' }] },
  { id: 'persistent-session-health', files: ['tests/session-health.setup.ts', 'scripts/run-session-health-with-retry.sh', '.github/workflows/asana-session-health.yml'] },
  { id: 'safe-session-recovery', files: ['session_state_recovery.py', 'SESSION_STATE_RECOVERY_RUNBOOK.md'] },
  { id: 'metrics-collection-and-merge', files: ['scripts/export-shard-metrics.mjs', 'scripts/merge-shard-metrics.mjs', '.github/workflows/asana-onboarding-e2e.yml'] },
  { id: 'local-shard-dashboard', files: ['dashboard/playwright-shard-dashboard.html', 'DASHBOARD_DATA_SCHEMA.md'] },
  { id: 'trend-regression-and-summary-charts', files: ['scripts/analyze-shard-trends.mjs', 'scripts/render-trend-summary.mjs', '.github/workflows/asana-onboarding-e2e.yml'] },
  { id: 'deduplicated-regression-issues', files: ['scripts/render-trend-issue.mjs', '.github/workflows/asana-onboarding-e2e.yml'], references: [{ file: '.github/workflows/asana-onboarding-e2e.yml', text: 'Open or update performance-regression issue' }] },
  { id: 'safe-artifact-pruning', files: ['scripts/plan-artifact-prune.mjs', '.github/workflows/prune-playwright-artifacts.yml'] },
  { id: 'slack-and-email-pruning-notification', files: ['scripts/notify-artifact-prune.mjs', '.github/workflows/prune-playwright-artifacts.yml'] },
  { id: 'unified-operations-notification', files: ['scripts/notify-operations.mjs', '.github/workflows/asana-onboarding-e2e.yml', '.github/workflows/asana-session-health.yml', '.github/workflows/operations-preflight.yml'], references: [{ file: '.github/workflows/asana-onboarding-e2e.yml', text: 'notify-operations.mjs' }, { file: '.github/workflows/asana-session-health.yml', text: 'notify-operations.mjs' }, { file: '.github/workflows/operations-preflight.yml', text: 'notify-operations.mjs' }] },
  { id: 'operations-preflight', files: ['scripts/operations-preflight.mjs', '.github/workflows/operations-preflight.yml'] },
  { id: 'single-command-all-feature-configuration', files: ['scripts/configure-all-features.sh', 'ALL_FEATURES_CONTROL_CENTER.md'] }
];

const results = [];
for (const feature of featureDefinitions) {
  const missingFiles = [];
  for (const file of feature.files) if (!await exists(resolve(root, file))) missingFiles.push(file);
  const missingReferences = [];
  for (const reference of feature.references || []) {
    const content = await read(reference.file);
    if (!content.includes(reference.text)) missingReferences.push(`${reference.file}: ${reference.text}`);
  }
  results.push({ id: feature.id, implemented: !missingFiles.length && !missingReferences.length, missingFiles, missingReferences });
}
const failed = results.filter((result) => !result.implemented);
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), totalFeatures: results.length, implementedFeatures: results.length - failed.length, failedFeatures: failed.length, results };
if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); }
console.log(`Feature completeness: ${report.implementedFeatures}/${report.totalFeatures} implemented.`);
for (const item of failed) console.error(`Missing ${item.id}: ${[...item.missingFiles, ...item.missingReferences].join(', ')}`);
if (failed.length) process.exitCode = 1;
