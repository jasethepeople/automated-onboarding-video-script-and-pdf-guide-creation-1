#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const input = arg('--input');
const runUrl = arg('--run-url') || '';
if (!input) throw new Error('Missing --input');
const report = JSON.parse(await readFile(input, 'utf8'));
const lines = [
  '## Playwright shard performance regression detected',
  '',
  `- **Workflow run:** ${runUrl || report.latestRun?.url || 'Unavailable'}`,
  `- **Latest duration:** ${Math.round(Number(report.latestRun?.durationSeconds || 0))}s`,
  `- **Baseline duration median:** ${report.baseline?.durationSecondsMedian === null ? 'n/a' : `${Math.round(Number(report.baseline?.durationSecondsMedian || 0))}s`}`,
  `- **Latest shard imbalance:** ${report.latestRun?.imbalance === null || report.latestRun?.imbalance === undefined ? 'n/a' : `${Math.round(report.latestRun.imbalance * 100)}%`}`,
  `- **Latest retries:** ${report.latestRun?.retries ?? 0}`,
  '',
  '### Findings'
];
for (const finding of report.findings || []) lines.push(`- **${finding.severity}:** ${finding.message}`);
lines.push('', '### Suggested next step', 'Review the merged dashboard metrics and shard timing. Rebalance independent tests only after confirming this is not explained by GitHub runner, browser-install, or target-SaaS latency.', '', '> This issue intentionally contains only aggregated performance metadata; it contains no browser state, credentials, cookies, screenshots, or test logs.');
process.stdout.write(`${lines.join('\n')}\n`);
