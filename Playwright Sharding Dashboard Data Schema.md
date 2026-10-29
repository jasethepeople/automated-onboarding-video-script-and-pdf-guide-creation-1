# Playwright Sharding Dashboard Data Schema

The dashboard accepts a JSON document containing one or more **non-secret workflow run summaries**. It does not read browser state, logs, HTML reports, traces, cookies, or GitHub credentials. Its purpose is to visualize operational timing data that a GitHub Actions workflow exports as a small, safe artifact.

> Start with an empty dashboard and import only real GitHub Actions metrics. Do not publish session-state files, raw Playwright traces, or test inputs in the dashboard data.

## Root document

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-20T16:30:00Z",
  "runs": []
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `schemaVersion` | number | Yes | Schema version. The dashboard currently supports `1`. |
| `generatedAt` | ISO 8601 timestamp | No | Time at which the collection was exported. |
| `runs` | array | Yes | Workflow-run summaries, newest or oldest first. |

## Workflow run object

```json
{
  "runId": "1234567890",
  "runNumber": 42,
  "workflow": "Asana onboarding E2E",
  "branch": "main",
  "trigger": "push",
  "status": "success",
  "startedAt": "2026-08-20T16:00:00Z",
  "durationSeconds": 518,
  "url": "https://github.com/OWNER/REPO/actions/runs/1234567890",
  "shards": []
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `runId` | string | Yes | GitHub Actions run ID; used as a dashboard key. |
| `runNumber` | number | No | Human-readable Actions run number. |
| `workflow` | string | Yes | Workflow display name. |
| `branch` | string | No | Source branch, normally `main` for protected E2E execution. |
| `trigger` | string | No | Trigger, such as `push`, `workflow_dispatch`, or `schedule`. |
| `status` | string | Yes | `success`, `failure`, `cancelled`, or `skipped`. |
| `startedAt` | ISO 8601 timestamp | Yes | Start time in UTC. |
| `durationSeconds` | number | Yes | Whole workflow duration, including runner setup and report merge. |
| `url` | URL | No | Link to the GitHub Actions run. |
| `shards` | array | Yes | Per-runner shard measurements. |

## Shard object

```json
{
  "index": 1,
  "total": 2,
  "runner": "ubuntu-latest",
  "status": "success",
  "queueSeconds": 9,
  "setupSeconds": 91,
  "testSeconds": 169,
  "durationSeconds": 269,
  "retries": 0,
  "testsPassed": 3,
  "testsFailed": 0,
  "testsSkipped": 0
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `index` and `total` | number | Yes | Shard position and shard count, for example `1` and `2`. |
| `runner` | string | No | Runner label, such as `ubuntu-latest`. |
| `status` | string | Yes | Shard conclusion. |
| `queueSeconds` | number | No | Time spent waiting for a runner, if collected. |
| `setupSeconds` | number | No | Checkout, dependency, browser, and state-materialization time. |
| `testSeconds` | number | No | Playwright execution time. |
| `durationSeconds` | number | Yes | Total shard time. |
| `retries` | number | No | Number of Playwright/session retry attempts beyond the first. |
| `testsPassed`, `testsFailed`, `testsSkipped` | number | No | Per-shard test outcomes. |

## Dashboard calculations

| Metric | Calculation |
|---|---|
| Average workflow duration | Mean of `durationSeconds` across imported runs. |
| Failure rate | Failed or cancelled runs ÷ all imported runs. |
| Average shard imbalance | For each run, `(max shard duration − min shard duration) ÷ max shard duration`; then mean across multi-shard runs. |
| Runner setup share | `setupSeconds ÷ durationSeconds`, averaged across shards with both values. |
| Retry rate | Total retries ÷ count of imported shard records. |
| Test pass rate | Passed tests ÷ (passed + failed tests), excluding skipped tests. |

## Collection guidance

A future workflow metrics-export step should write only this JSON schema to an artifact. Derive shard timing from job start/end timestamps, test counts from Playwright’s JSON/blob report summaries, and retry counts from the session-health retry helper’s secret-free summary. Never derive dashboard input from `.asana_auth.json`, environment secrets, browser cookies, or raw test screenshots.

The visualizer supports importing a local JSON file and dropping one onto the page. It offers export of filtered dashboard data as CSV for further analysis.

---

**Prepared by Manus AI.**
