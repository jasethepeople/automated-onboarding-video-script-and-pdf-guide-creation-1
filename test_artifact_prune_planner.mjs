import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'playwright-artifact-prune-'));
const input = join(temp, 'inventory.json');
const output = join(temp, 'manifest.json');
const summary = join(temp, 'summary.md');
const githubOutput = join(temp, 'github-output.txt');
const artifact = (id, name, createdAt, size = 1024, expired = false) => ({ id, name, created_at: createdAt, updated_at: createdAt, size_in_bytes: size, expired, workflow_run: { id: 99 } });
const inventory = {
  artifacts: [
    artifact(1, 'playwright-shard-dashboard-metrics-1', '2026-01-01T00:00:00Z'),
    artifact(2, 'playwright-shard-dashboard-metrics-2', '2026-03-15T00:00:00Z'),
    artifact(3, 'blob-report-1-1', '2026-03-01T00:00:00Z'),
    artifact(4, 'asana-onboarding-diagnostics-1-shard-1', '2026-03-10T00:00:00Z'),
    artifact(5, 'unrelated-build-output', '2025-01-01T00:00:00Z'),
    artifact(6, 'blob-report-expired', '2025-01-01T00:00:00Z', 10, true),
    artifact(7, 'asana-session-health-diagnostics-2', '2026-03-01T00:00:00Z')
  ]
};
await writeFile(input, JSON.stringify(inventory));
const result = spawnSync('node', [join(root, 'scripts/plan-artifact-prune.mjs'), '--input', input, '--output', output, '--now', '2026-04-01T00:00:00Z', '--metrics-days', '90', '--report-days', '30', '--diagnostic-days', '14', '--max-deletions', '2'], { env: { ...process.env, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: githubOutput }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
const manifest = JSON.parse(await readFile(output, 'utf8'));
if (manifest.candidates.length !== 2 || manifest.overflow.length !== 2) throw new Error('Expected the deletion cap to retain two planned and defer two eligible artifacts.');
if (!manifest.candidates.every((entry) => ['metrics', 'reports', 'diagnostics'].includes(entry.group))) throw new Error('Planner included a non-allowlisted artifact group.');
if (manifest.unmatched.length !== 1 || manifest.unmatched[0].name !== 'unrelated-build-output') throw new Error('Planner did not preserve the unmatched artifact.');
if (!manifest.excluded.some((entry) => entry.reason === 'within-retention-window')) throw new Error('Expected a recent protected metrics artifact to remain within retention.');
if (!manifest.excluded.some((entry) => entry.reason === 'already-expired')) throw new Error('Expected expired artifact to be excluded from deletion plan.');
const outputText = await readFile(githubOutput, 'utf8');
if (!outputText.includes('planned_deletions=2') || !outputText.includes('deletion_permitted=true')) throw new Error('Expected GitHub step outputs were not emitted.');
const summaryText = await readFile(summary, 'utf8');
if (!summaryText.includes('GitHub Actions artifact pruning plan') || !summaryText.includes('Unmatched/protected')) throw new Error('Expected pruning summary content was not rendered.');
console.log('Artifact-pruning allowlist, age windows, cap, exclusion, and summary safeguards validated.');
