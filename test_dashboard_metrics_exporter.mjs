import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('.', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'playwright-dashboard-metrics-'));
const report = {
  suites: [{
    title: 'independent onboarding',
    specs: [
      { title: 'passed first try', tests: [{ results: [{ status: 'passed' }] }] },
      { title: 'passed on retry', tests: [{ results: [{ status: 'failed' }, { status: 'passed' }] }] },
      { title: 'skipped', tests: [{ results: [{ status: 'skipped' }] }] }
    ],
    suites: []
  }]
};
const reportPath = join(temp, 'playwright-results.json');
await writeFile(reportPath, JSON.stringify(report));

function exportShard(index, outcome) {
  const output = join(temp, `shard-${index}.json`);
  const result = spawnSync('node', [join(root, 'scripts/export-shard-metrics.mjs'), '--input', reportPath, '--output', output, '--outcome', outcome, '--shard-start-epoch', '1700000000', '--test-start-epoch', '1700000010'], {
    env: {
      ...process.env,
      GITHUB_RUN_ID: '12345', GITHUB_RUN_NUMBER: '17', GITHUB_WORKFLOW: 'Asana onboarding E2E', GITHUB_REF_NAME: 'main', GITHUB_EVENT_NAME: 'push', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'example/repo', RUNNER_NAME: `runner-${index}`, PLAYWRIGHT_SHARD_INDEX: String(index), PLAYWRIGHT_SHARD_TOTAL: '2'
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return output;
}

const shard1 = exportShard(1, 'success');
const shard2 = exportShard(2, 'failure');
const first = JSON.parse(await readFile(shard1, 'utf8'));
const shard = first.runs[0].shards[0];
if (shard.testsPassed !== 2 || shard.testsSkipped !== 1 || shard.testsFailed !== 0 || shard.retries !== 1) throw new Error('Playwright JSON summary did not produce expected counts.');
if (first.collection.includesSecrets !== false || JSON.stringify(first).includes('ASANA_STORAGE_STATE')) throw new Error('Exporter output breached the safe data boundary.');

const mergedInput = join(temp, 'merged-input');
await mkdir(mergedInput);
await writeFile(join(mergedInput, 'one.json'), await readFile(shard1));
await writeFile(join(mergedInput, 'two.json'), await readFile(shard2));
const mergedOutput = join(temp, 'merged.json');
const merge = spawnSync('node', [join(root, 'scripts/merge-shard-metrics.mjs'), '--input-dir', mergedInput, '--output', mergedOutput], { encoding: 'utf8' });
if (merge.status !== 0) throw new Error(merge.stderr || merge.stdout);
const merged = JSON.parse(await readFile(mergedOutput, 'utf8'));
if (merged.runs.length !== 1 || merged.runs[0].shards.length !== 2 || merged.runs[0].status !== 'failure') throw new Error('Shard merge did not produce the expected combined run.');
console.log('Dashboard metrics exporter and shard merger validated with deterministic fixture data.');
