#!/usr/bin/env node
import { readFile, appendFile } from 'node:fs/promises';

function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function imbalance(run) {
  const durations = (run.shards || []).map((shard) => number(shard.durationSeconds)).filter((value) => value > 0);
  return durations.length < 2 ? null : (Math.max(...durations) - Math.min(...durations)) / Math.max(...durations);
}
function sparkline(values) {
  const glyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 'n/a';
  const min = Math.min(...valid); const max = Math.max(...valid);
  if (min === max) return glyphs[3].repeat(valid.length);
  return valid.map((value) => glyphs[Math.max(0, Math.min(glyphs.length - 1, Math.round((value - min) / (max - min) * (glyphs.length - 1))))]).join('');
}
function recentSuccessfulRuns(history, limit = 12) {
  return [...(history?.runs || [])]
    .filter((run) => run.status === 'success')
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .slice(-limit);
}

const input = arg('--input');
if (!input) throw new Error('Missing --input');
const report = JSON.parse(await readFile(input, 'utf8'));
const historyPath = arg('--history');
const history = historyPath ? JSON.parse(await readFile(historyPath, 'utf8')) : { runs: [] };
const findings = report.findings || [];
const trends = recentSuccessfulRuns(history);
const durations = trends.map((run) => number(run.durationSeconds));
const imbalances = trends.map(imbalance).filter((value) => value !== null);
const runLabels = trends.map((run) => `#${run.runNumber ?? run.runId}`).join(' · ') || 'n/a';
const threshold = report.thresholds || {};
const lines = [
  '### Playwright shard trend analysis',
  '',
  `- **Latest run:** ${report.latestRun?.runNumber ?? report.latestRun?.runId ?? 'unknown'}`,
  `- **Baseline:** ${report.baseline?.successfulRuns ?? 0}/${report.baseline?.minimumRequired ?? 0} successful runs`,
  `- **Regression detected:** ${report.regressionDetected ? 'yes' : 'no'}`,
  `- **Latest matrix wall-clock proxy:** ${Math.round(number(report.latestRun?.durationSeconds))}s`,
  `- **Latest shard imbalance:** ${report.latestRun?.imbalance === null || report.latestRun?.imbalance === undefined ? 'n/a' : `${Math.round(report.latestRun.imbalance * 100)}%`}`,
  `- **Latest retries:** ${report.latestRun?.retries ?? 0}`,
  '',
  '#### Active threshold configuration',
  '',
  '| Signal | Active rule |',
  '|---|---|',
  `| Duration | ≥${Math.round(number(threshold.durationRatio) * 100)}% and ≥${Math.round(number(threshold.durationAbsoluteSeconds))}s above baseline median |`,
  `| Imbalance | ≥${Math.round(number(threshold.imbalanceCeiling) * 100)}% and ≥${Math.round(number(threshold.imbalanceIncrease) * 100)} percentage points above baseline |`,
  `| Retries | ≥${number(threshold.retryIncrease)} above baseline median |`,
  '',
  '#### Recent successful-run charts',
  '',
  `**Matrix duration (seconds):** \`${sparkline(durations)}\``,
  '',
  `**Shard imbalance:** \`${sparkline(imbalances)}\``,
  '',
  `Runs, oldest → newest: ${runLabels}`,
  '',
  '#### Findings'
];
if (!findings.length) lines.push('- No regression or baseline-readiness finding was produced.');
else findings.forEach((finding) => lines.push(`- **${finding.severity}:** ${finding.message}`));
const text = `${lines.join('\n')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
process.stdout.write(text);
