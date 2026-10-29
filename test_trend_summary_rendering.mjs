import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'playwright-summary-charts-'));
const historyPath = join(temp, 'history.json');
const analysisPath = join(temp, 'analysis.json');
const summaryPath = join(temp, 'summary.md');
const run = (id, duration, shards) => ({ runId: String(id), runNumber: id, workflow: 'Asana onboarding E2E', status: 'success', startedAt: `2026-08-${String(id).padStart(2, '0')}T00:00:00Z`, durationSeconds: duration, shards: shards.map((value, index) => ({ index: index + 1, total: shards.length, status: 'success', durationSeconds: value, retries: 0 })) });
const history = { schemaVersion: 1, runs: [run(1, 100, [51, 49]), run(2, 120, [70, 50]), run(3, 110, [56, 54])] };
const analysis = {
  schemaVersion: 1,
  latestRun: { runId: '3', runNumber: 3, status: 'success', durationSeconds: 110, imbalance: (56 - 54) / 56, retries: 0 },
  baseline: { successfulRuns: 2, minimumRequired: 2 },
  thresholds: { durationRatio: 0.35, durationAbsoluteSeconds: 50, imbalanceIncrease: 0.20, imbalanceCeiling: 0.40, retryIncrease: 3 },
  regressionDetected: false,
  findings: []
};
await writeFile(historyPath, JSON.stringify(history));
await writeFile(analysisPath, JSON.stringify(analysis));
const render = spawnSync('node', [join(root, 'scripts/render-trend-summary.mjs'), '--input', analysisPath, '--history', historyPath], { env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath }, encoding: 'utf8' });
if (render.status !== 0) throw new Error(render.stderr || render.stdout);
const summary = await readFile(summaryPath, 'utf8');
for (const expected of ['Active threshold configuration', '≥35% and ≥50s', 'Recent successful-run charts', 'Matrix duration (seconds):', 'Shard imbalance:', '▁']) {
  if (!summary.includes(expected)) throw new Error(`Expected summary content missing: ${expected}`);
}
console.log('Configurable threshold table and historical Unicode summary charts validated.');
