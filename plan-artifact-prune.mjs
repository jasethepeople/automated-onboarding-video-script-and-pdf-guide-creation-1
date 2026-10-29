#!/usr/bin/env node
/**
 * Build a safe, auditable deletion plan from GitHub Actions artifact metadata.
 * This script never calls GitHub and never deletes artifacts itself.
 */

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function arg(name, fallback = undefined) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function required(value, name) { if (value === undefined || value === null || value === '') throw new Error(`Missing ${name}.`); return value; }
function positiveInteger(name, value, fallback) { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`); return parsed; }
function writeSummary(text) { return process.env.GITHUB_STEP_SUMMARY ? appendFile(process.env.GITHUB_STEP_SUMMARY, text) : Promise.resolve(); }
function writeOutput(key, value) { return process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`) : Promise.resolve(); }

const input = resolve(required(arg('--input'), '--input'));
const output = resolve(required(arg('--output'), '--output'));
const now = new Date(arg('--now', new Date().toISOString()));
if (Number.isNaN(now.getTime())) throw new Error('--now must be a valid ISO 8601 timestamp.');
const metricsDays = positiveInteger('--metrics-days', arg('--metrics-days'), 90);
const reportDays = positiveInteger('--report-days', arg('--report-days'), 30);
const diagnosticDays = positiveInteger('--diagnostic-days', arg('--diagnostic-days'), 14);
const maxDeletions = positiveInteger('--max-deletions', arg('--max-deletions'), 100);
const document = JSON.parse(await readFile(input, 'utf8'));
const artifacts = Array.isArray(document.artifacts) ? document.artifacts : [];

const policies = [
  { group: 'metrics', prefixes: ['playwright-shard-dashboard-metrics-', 'playwright-shard-trend-analysis-'], retentionDays: metricsDays },
  { group: 'reports', prefixes: ['blob-report-', 'asana-onboarding-html-report-'], retentionDays: reportDays },
  { group: 'diagnostics', prefixes: ['asana-onboarding-diagnostics-', 'asana-session-health-diagnostics-'], retentionDays: diagnosticDays }
];
const protectedPrefixes = ['playwright-shard-dashboard-metrics-', 'playwright-shard-trend-analysis-'];
const candidates = [];
const excluded = [];
const unmatched = [];

for (const artifact of artifacts) {
  const name = String(artifact.name || '');
  const created = new Date(artifact.created_at || artifact.updated_at || '');
  if (artifact.expired) { excluded.push({ id: artifact.id, name, reason: 'already-expired' }); continue; }
  if (Number.isNaN(created.getTime())) { excluded.push({ id: artifact.id, name, reason: 'missing-or-invalid-created-at' }); continue; }
  const policy = policies.find((item) => item.prefixes.some((prefix) => name.startsWith(prefix)));
  if (!policy) { unmatched.push({ id: artifact.id, name }); continue; }
  const ageDays = (now.getTime() - created.getTime()) / 86_400_000;
  const shouldDelete = ageDays >= policy.retentionDays;
  // Metrics are never pruned before their longer retention window, protecting
  // recent dashboard imports and the trend-analysis artifact lifecycle.
  const record = { id: artifact.id, name, sizeInBytes: Number(artifact.size_in_bytes || 0), createdAt: created.toISOString(), ageDays: Number(ageDays.toFixed(2)), group: policy.group, retentionDays: policy.retentionDays, workflowRunId: artifact.workflow_run?.id ?? null };
  if (shouldDelete) candidates.push(record); else excluded.push({ ...record, reason: 'within-retention-window' });
}

candidates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
const planned = candidates.slice(0, maxDeletions);
const overflow = candidates.slice(maxDeletions);
const plannedBytes = planned.reduce((sum, item) => sum + item.sizeInBytes, 0);
const manifest = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  safety: {
    mode: 'plan-only',
    irreversible: true,
    protectedArtifactPrefixes: protectedPrefixes,
    maxDeletions,
    reason: 'Only recognized artifact prefixes older than their group retention windows can appear in this manifest.'
  },
  policy: { metricsDays, reportDays, diagnosticDays },
  summary: { scanned: artifacts.length, candidates: candidates.length, planned: planned.length, overflow: overflow.length, plannedBytes },
  candidates: planned,
  overflow,
  excluded,
  unmatched
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
const kib = (plannedBytes / 1024).toFixed(1);
const summary = [
  '### GitHub Actions artifact pruning plan',
  '',
  `- **Artifacts scanned:** ${artifacts.length}`,
  `- **Eligible for deletion:** ${candidates.length}`,
  `- **Planned this run:** ${planned.length}/${maxDeletions} (${kib} KiB in test/run metadata; GitHub applies actual storage reclamation)`,
  `- **Retention:** metrics ${metricsDays}d · reports ${reportDays}d · diagnostics ${diagnosticDays}d`,
  `- **Unmatched/protected:** ${unmatched.length} artifact(s) were not in an approved prefix and will never be deleted by this workflow.`,
  overflow.length ? `- **Deferred:** ${overflow.length} eligible artifact(s) exceed the per-run deletion cap and are deferred to a later scheduled run.` : '',
  '',
  '> Deletion is irreversible. The workflow deletes only IDs in this generated manifest, after a separate explicit delete step is enabled.'
].filter(Boolean).join('\n') + '\n';
await writeSummary(summary);
await writeOutput('planned_deletions', String(planned.length));
await writeOutput('deletion_permitted', String(planned.length > 0));
console.log(`Artifact prune plan: ${planned.length} planned deletion(s) from ${artifacts.length} scanned artifact(s).`);
