#!/usr/bin/env node
/**
 * Analyze merged dashboard metrics against a bounded successful-run baseline.
 * Input and output contain only the safe dashboard metrics schema.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function arg(name, fallback = undefined) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function required(value, name) { if (value === undefined || value === null || value === '') throw new Error(`Missing ${name}`); return value; }
function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function configuredNumber(name, value, fallback, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be a number between ${minimum} and ${maximum === Number.POSITIVE_INFINITY ? '∞' : maximum}.`);
  return parsed;
}
function configuredInteger(name, value, fallback, minimum = 1) {
  const parsed = configuredNumber(name, value, fallback, minimum);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}
function median(values) { const items = values.filter(Number.isFinite).sort((a,b)=>a-b); if (!items.length) return null; const middle = Math.floor(items.length/2); return items.length % 2 ? items[middle] : (items[middle-1]+items[middle])/2; }
function imbalance(run) { const durations = (run.shards || []).map((shard) => number(shard.durationSeconds)).filter((value) => value > 0); return durations.length < 2 ? null : (Math.max(...durations) - Math.min(...durations)) / Math.max(...durations); }
function retries(run) { return (run.shards || []).reduce((sum, shard) => sum + number(shard.retries), 0); }
function latestFirst(runs) { return [...runs].sort((a,b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)); }
function validDocument(document, name) { if (document?.schemaVersion !== 1 || !Array.isArray(document.runs)) throw new Error(`${name} must be a schemaVersion 1 document with runs array.`); return document; }
async function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, { flag: 'a' }); }

const currentPath = resolve(required(arg('--current'), '--current'));
const historyPath = arg('--history') ? resolve(arg('--history')) : null;
const historyOutput = resolve(required(arg('--history-output'), '--history-output'));
const analysisOutput = resolve(required(arg('--analysis-output'), '--analysis-output'));
const baselineSize = configuredInteger('--baseline-size', arg('--baseline-size'), 10);
const minimumBaseline = configuredInteger('--minimum-baseline', arg('--minimum-baseline'), 5);
const retention = configuredInteger('--retention', arg('--retention'), 60);
const durationRatioThreshold = configuredNumber('--duration-ratio-threshold', arg('--duration-ratio-threshold'), 0.20, 0, 10);
const durationAbsoluteThreshold = configuredNumber('--duration-absolute-threshold-seconds', arg('--duration-absolute-threshold-seconds'), 30, 0);
const imbalanceIncreaseThreshold = configuredNumber('--imbalance-increase-threshold', arg('--imbalance-increase-threshold'), 0.15, 0, 1);
const imbalanceCeiling = configuredNumber('--imbalance-ceiling', arg('--imbalance-ceiling'), 0.35, 0, 1);
const retryIncreaseThreshold = configuredNumber('--retry-increase-threshold', arg('--retry-increase-threshold'), 2, 0);
if (minimumBaseline > baselineSize) throw new Error('--minimum-baseline cannot exceed --baseline-size.');

const current = validDocument(JSON.parse(await readFile(currentPath, 'utf8')), 'Current metrics');
if (current.runs.length !== 1) throw new Error('Current metrics must contain exactly one merged workflow run.');
const latest = current.runs[0];
let prior = { schemaVersion: 1, runs: [] };
if (historyPath) {
  try { prior = validDocument(JSON.parse(await readFile(historyPath, 'utf8')), 'Historical metrics'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const candidateBaseline = latestFirst(prior.runs.filter((run) => run.runId !== latest.runId && run.status === 'success')).slice(0, baselineSize);
const baselineReady = candidateBaseline.length >= minimumBaseline;
const durationBaseline = median(candidateBaseline.map((run) => number(run.durationSeconds)));
const imbalanceBaseline = median(candidateBaseline.map(imbalance).filter((value) => value !== null));
const retryBaseline = median(candidateBaseline.map(retries));
const latestImbalance = imbalance(latest);
const latestRetries = retries(latest);
const findings = [];

if (latest.status !== 'success') {
  findings.push({ type: 'functional-failure', severity: 'critical', message: `Latest run concluded ${latest.status}; assess functional failure separately from performance.` });
}
if (!baselineReady) {
  findings.push({ type: 'insufficient-baseline', severity: 'info', message: `Collected ${candidateBaseline.length}/${minimumBaseline} successful baseline runs; performance thresholds are not applied yet.` });
} else {
  const durationIncrease = durationBaseline ? (number(latest.durationSeconds) - durationBaseline) / durationBaseline : 0;
  const durationAbsoluteIncrease = number(latest.durationSeconds) - durationBaseline;
  if (durationIncrease >= durationRatioThreshold && durationAbsoluteIncrease >= durationAbsoluteThreshold) {
    findings.push({ type: 'duration-regression', severity: 'warning', message: `Matrix wall-clock proxy rose ${Math.round(durationIncrease * 100)}% (+${Math.round(durationAbsoluteIncrease)}s) over the median baseline.`, current: number(latest.durationSeconds), baseline: durationBaseline });
  }
  if (latestImbalance !== null && imbalanceBaseline !== null && latestImbalance >= imbalanceCeiling && latestImbalance - imbalanceBaseline >= imbalanceIncreaseThreshold) {
    findings.push({ type: 'shard-imbalance-regression', severity: 'warning', message: `Shard imbalance reached ${Math.round(latestImbalance * 100)}%, materially above the ${Math.round(imbalanceBaseline * 100)}% median baseline.`, current: latestImbalance, baseline: imbalanceBaseline });
  }
  if (latestRetries >= retryBaseline + retryIncreaseThreshold && latestRetries >= retryIncreaseThreshold) {
    findings.push({ type: 'retry-regression', severity: 'warning', message: `Latest run recorded ${latestRetries} retries versus a ${retryBaseline} median baseline.`, current: latestRetries, baseline: retryBaseline });
  }
}

const mergedRuns = latestFirst([...prior.runs.filter((run) => run.runId !== latest.runId), latest]).slice(0, retention).reverse();
const history = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runs: mergedRuns,
  collection: { source: 'github-actions-shard-trend-analysis', includesSecrets: false, retainedRuns: mergedRuns.length }
};
const regression = findings.some((finding) => finding.severity === 'warning' || finding.severity === 'critical');
const analysis = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  latestRun: { runId: latest.runId, runNumber: latest.runNumber ?? null, status: latest.status, durationSeconds: number(latest.durationSeconds), imbalance: latestImbalance, retries: latestRetries, url: latest.url || '' },
  baseline: { successfulRuns: candidateBaseline.length, minimumRequired: minimumBaseline, targetWindow: baselineSize, ready: baselineReady, durationSecondsMedian: durationBaseline, imbalanceMedian: imbalanceBaseline, retriesMedian: retryBaseline },
  thresholds: { durationRatio: durationRatioThreshold, durationAbsoluteSeconds: durationAbsoluteThreshold, imbalanceIncrease: imbalanceIncreaseThreshold, imbalanceCeiling, retryIncrease: retryIncreaseThreshold },
  regressionDetected: regression,
  findings
};

await mkdir(dirname(historyOutput), { recursive: true });
await mkdir(dirname(analysisOutput), { recursive: true });
await writeFile(historyOutput, `${JSON.stringify(history, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
await writeFile(analysisOutput, `${JSON.stringify(analysis, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
await writeOutput('regression', String(regression));
await writeOutput('baseline_ready', String(baselineReady));
await writeOutput('finding_count', String(findings.length));
console.log(`Analyzed run ${latest.runId}: ${findings.length} finding(s), regression=${regression}.`);
