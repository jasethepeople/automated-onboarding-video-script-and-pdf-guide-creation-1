import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'playwright-shard-trends-'));

function runRecord(id, startedAt, durationSeconds, shardDurations, retries = 0, status = 'success') {
  return {
    runId: String(id), runNumber: Number(id), workflow: 'Asana onboarding E2E', branch: 'main', trigger: 'push', status, startedAt, durationSeconds, url: `https://github.com/example/repo/actions/runs/${id}`,
    shards: shardDurations.map((duration, index) => ({ index: index + 1, total: shardDurations.length, runner: `runner-${index + 1}`, status, setupSeconds: 10, testSeconds: Math.max(0, duration - 10), durationSeconds: duration, retries: index === 0 ? retries : 0, testsPassed: 3, testsFailed: 0, testsSkipped: 0 }))
  };
}

const priorRuns = [
  runRecord(1, '2026-08-01T00:00:00Z', 100, [52, 48]),
  runRecord(2, '2026-08-02T00:00:00Z', 102, [53, 49]),
  runRecord(3, '2026-08-03T00:00:00Z', 98, [51, 47]),
  runRecord(4, '2026-08-04T00:00:00Z', 100, [52, 48]),
  runRecord(5, '2026-08-05T00:00:00Z', 101, [53, 48])
];
const latest = runRecord(6, '2026-08-06T00:00:00Z', 165, [130, 80], 3);
const historyPath = join(temp, 'history.json');
const currentPath = join(temp, 'current.json');
const historyOutput = join(temp, 'dashboard-history.json');
const analysisOutput = join(temp, 'analysis.json');
const githubOutput = join(temp, 'github-output.txt');
await writeFile(historyPath, JSON.stringify({ schemaVersion: 1, runs: priorRuns }));
await writeFile(currentPath, JSON.stringify({ schemaVersion: 1, runs: [latest] }));

const result = spawnSync('node', [join(root, 'scripts/analyze-shard-trends.mjs'), '--current', currentPath, '--history', historyPath, '--history-output', historyOutput, '--analysis-output', analysisOutput], { env: { ...process.env, GITHUB_OUTPUT: githubOutput }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
const analysis = JSON.parse(await readFile(analysisOutput, 'utf8'));
const kinds = analysis.findings.map((finding) => finding.type).sort();
for (const expected of ['duration-regression', 'retry-regression', 'shard-imbalance-regression']) if (!kinds.includes(expected)) throw new Error(`Expected ${expected} signal.`);
if (!analysis.regressionDetected || !analysis.baseline.ready) throw new Error('Expected a ready baseline and detected regression.');
const retained = JSON.parse(await readFile(historyOutput, 'utf8'));
if (retained.runs.length !== 6 || retained.runs.at(-1).runId !== '6') throw new Error('Expected latest run to be appended to bounded dashboard history.');
const outputs = await readFile(githubOutput, 'utf8');
if (!outputs.includes('regression=true') || !outputs.includes('baseline_ready=true')) throw new Error('Expected GitHub output values were not written.');

const noBaselineOutput = join(temp, 'no-baseline-analysis.json');
const noBaselineHistory = join(temp, 'no-baseline-history.json');
const noBaseline = spawnSync('node', [join(root, 'scripts/analyze-shard-trends.mjs'), '--current', currentPath, '--history-output', noBaselineHistory, '--analysis-output', noBaselineOutput], { encoding: 'utf8' });
if (noBaseline.status !== 0) throw new Error(noBaseline.stderr || noBaseline.stdout);
const noBaselineAnalysis = JSON.parse(await readFile(noBaselineOutput, 'utf8'));
if (noBaselineAnalysis.regressionDetected || !noBaselineAnalysis.findings.some((finding) => finding.type === 'insufficient-baseline')) throw new Error('Expected insufficient baseline without a false regression.');

const relaxedAnalysisOutput = join(temp, 'relaxed-analysis.json');
const relaxedHistoryOutput = join(temp, 'relaxed-history.json');
const relaxed = spawnSync('node', [join(root, 'scripts/analyze-shard-trends.mjs'), '--current', currentPath, '--history', historyPath, '--history-output', relaxedHistoryOutput, '--analysis-output', relaxedAnalysisOutput, '--duration-ratio-threshold', '1', '--duration-absolute-threshold-seconds', '1000', '--imbalance-increase-threshold', '1', '--imbalance-ceiling', '1', '--retry-increase-threshold', '100'], { encoding: 'utf8' });
if (relaxed.status !== 0) throw new Error(relaxed.stderr || relaxed.stdout);
const relaxedAnalysis = JSON.parse(await readFile(relaxedAnalysisOutput, 'utf8'));
if (relaxedAnalysis.regressionDetected || relaxedAnalysis.thresholds.durationRatio !== 1 || relaxedAnalysis.thresholds.retryIncrease !== 100) throw new Error('Expected explicit threshold overrides to be reflected and suppress the synthetic regression.');

console.log('Shard trend analysis baseline, regression, retention, threshold override, and GitHub output behavior validated.');
