#!/usr/bin/env node
/** Merge safe per-shard dashboard metrics into one workflow-run JSON document. */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function outcome(statuses) {
  if (statuses.includes('failure')) return 'failure';
  if (statuses.includes('cancelled')) return 'cancelled';
  if (statuses.includes('skipped')) return 'skipped';
  return 'success';
}

const inputDir = resolve(argument('--input-dir') || 'dashboard-metrics-artifacts');
const output = resolve(argument('--output') || 'dashboard-metrics/playwright-shard-runs.json');
const entries = (await readdir(inputDir)).filter((name) => name.endsWith('.json'));
if (!entries.length) throw new Error(`No JSON metrics files found in ${inputDir}`);

const records = [];
for (const entry of entries) {
  const document = JSON.parse(await readFile(join(inputDir, entry), 'utf8'));
  if (document?.schemaVersion !== 1 || !Array.isArray(document.runs) || document.runs.length !== 1) {
    throw new Error(`${entry} is not a valid one-run dashboard metrics document.`);
  }
  records.push(document.runs[0]);
}

const byRun = new Map();
for (const run of records) {
  const existing = byRun.get(run.runId) || [];
  existing.push(run);
  byRun.set(run.runId, existing);
}

const runs = [...byRun.values()].map((group) => {
  const first = group[0];
  const shards = group.flatMap((run) => run.shards || []);
  const starts = group.map((run) => Date.parse(run.startedAt)).filter(Number.isFinite);
  const ends = group.map((run) => Date.parse(run.startedAt) + Number(run.durationSeconds || 0) * 1000).filter(Number.isFinite);
  const deduplicatedShards = [...new Map(shards.map((shard) => [`${shard.index}/${shard.total}`, shard])).values()].sort((a, b) => a.index - b.index);
  return {
    runId: String(first.runId),
    runNumber: first.runNumber ?? null,
    workflow: first.workflow,
    branch: first.branch || '',
    trigger: first.trigger || '',
    status: outcome(group.map((run) => String(run.status || 'failure').toLowerCase())),
    startedAt: new Date(Math.min(...starts)).toISOString(),
    // Matrix wall-clock proxy: earliest shard start to latest shard completion.
    durationSeconds: Math.max(0, Math.round((Math.max(...ends) - Math.min(...starts)) / 1000)),
    url: first.url || '',
    shards: deduplicatedShards
  };
}).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

const merged = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runs,
  collection: {
    source: 'github-actions-post-test-exporter',
    includesSecrets: false,
    note: 'Merged from per-shard workflow artifacts. Run duration is a matrix wall-clock proxy from earliest shard start to latest shard completion.'
  }
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(merged, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`Merged ${records.length} shard metric artifact(s) into ${output}`);
