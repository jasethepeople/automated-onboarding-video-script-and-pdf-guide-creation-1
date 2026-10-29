#!/usr/bin/env node
/**
 * Export one non-secret Playwright shard summary for the dashboard schema.
 *
 * Reads only the Playwright JSON reporter file and selected GitHub Actions
 * metadata variables. It never reads storage state, logs, traces, cookies,
 * request headers, or environment secret values.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(value, label) {
  if (value === undefined || value === null || value === '') throw new Error(`Missing ${label}.`);
  return value;
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOutcome(value) {
  const outcome = String(value || '').toLowerCase();
  if (outcome === 'success') return 'success';
  if (outcome === 'cancelled') return 'cancelled';
  if (outcome === 'skipped') return 'skipped';
  return 'failure';
}

function collectSpecs(suite, accumulator) {
  for (const spec of suite.specs || []) accumulator.push(spec);
  for (const child of suite.suites || []) collectSpecs(child, accumulator);
}

function summarizePlaywrightReport(report) {
  const specs = [];
  for (const suite of report.suites || []) collectSpecs(suite, specs);
  let testsPassed = 0;
  let testsFailed = 0;
  let testsSkipped = 0;
  let retries = 0;

  for (const spec of specs) {
    for (const test of spec.tests || []) {
      const results = Array.isArray(test.results) ? test.results : [];
      const finalStatus = String(results.at(-1)?.status || test.status || '').toLowerCase();
      const nonSkippedAttempts = results.filter((result) => String(result.status).toLowerCase() !== 'skipped').length;
      retries += Math.max(0, nonSkippedAttempts - 1);
      if (finalStatus === 'passed' || finalStatus === 'expected') testsPassed += 1;
      else if (finalStatus === 'skipped') testsSkipped += 1;
      else testsFailed += 1;
    }
  }
  return { testsPassed, testsFailed, testsSkipped, retries };
}

const inputArgument = argument('--input');
const input = inputArgument ? resolve(inputArgument) : null;
const output = resolve(required(argument('--output'), '--output'));
const testOutcome = normalizeOutcome(argument('--outcome', process.env.PLAYWRIGHT_JOB_OUTCOME));
const shardStartEpoch = numeric(required(argument('--shard-start-epoch', process.env.SHARD_METRICS_STARTED_EPOCH), '--shard-start-epoch'));
const testStartEpoch = numeric(required(argument('--test-start-epoch', process.env.SHARD_TEST_STARTED_EPOCH), '--test-start-epoch'));
const nowEpoch = Math.floor(Date.now() / 1000);

let report = { suites: [] };
let reportAvailable = false;
if (input) {
  try {
    await access(input);
    report = JSON.parse(await readFile(input, 'utf8'));
    reportAvailable = true;
  } catch (error) {
    console.warn(`Playwright JSON report was unavailable or invalid; exporting job metadata with zero test counts: ${error.message}`);
  }
}
const counts = summarizePlaywrightReport(report);
const shardDuration = Math.max(0, nowEpoch - shardStartEpoch);
const testDuration = Math.max(0, nowEpoch - testStartEpoch);
const setupDuration = Math.max(0, testStartEpoch - shardStartEpoch);
const runId = String(required(process.env.GITHUB_RUN_ID, 'GITHUB_RUN_ID'));
const runNumber = numeric(process.env.GITHUB_RUN_NUMBER, 0) || null;
const shardIndex = numeric(required(process.env.PLAYWRIGHT_SHARD_INDEX, 'PLAYWRIGHT_SHARD_INDEX'));
const shardTotal = numeric(required(process.env.PLAYWRIGHT_SHARD_TOTAL, 'PLAYWRIGHT_SHARD_TOTAL'));

const document = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runs: [{
    runId,
    runNumber,
    workflow: process.env.GITHUB_WORKFLOW || 'Playwright onboarding',
    branch: process.env.GITHUB_REF_NAME || '',
    trigger: process.env.GITHUB_EVENT_NAME || '',
    status: testOutcome,
    startedAt: new Date(shardStartEpoch * 1000).toISOString(),
    // This per-shard document uses shard duration. The merge script replaces
    // it with the matrix wall-clock proxy when all shards are available.
    durationSeconds: shardDuration,
    url: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY || ''}/actions/runs/${runId}`,
    shards: [{
      index: shardIndex,
      total: shardTotal,
      runner: process.env.RUNNER_NAME || process.env.RUNNER_OS || 'github-hosted',
      status: testOutcome,
      setupSeconds: setupDuration,
      testSeconds: testDuration,
      durationSeconds: shardDuration,
      retries: counts.retries,
      testsPassed: counts.testsPassed,
      testsFailed: counts.testsFailed,
      testsSkipped: counts.testsSkipped
    }]
  }],
  collection: {
    source: 'github-actions-post-test-exporter',
    includesSecrets: false,
    note: reportAvailable
      ? 'Per-shard artifact. Merge all shard artifacts before importing into the dashboard.'
      : 'Per-shard artifact with runner metadata only; Playwright JSON output was unavailable for this attempt.'
  }
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`Wrote safe shard metrics to ${output}`);
