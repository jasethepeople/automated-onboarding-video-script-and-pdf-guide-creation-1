# Collecting Dashboard Metrics After Sharded Playwright Tests

The GitHub Actions workflow now emits real, non-secret dashboard data after every protected Playwright shard. The collection pipeline has three stages: **Playwright JSON reporting**, **per-shard post-test export**, and **merge-job aggregation**. The resulting artifact matches `DASHBOARD_DATA_SCHEMA.md` and can be imported directly into `dashboard/playwright-shard-dashboard.html`.

> The exporter reads only the Playwright JSON reporter result, timestamps created by the workflow, and GitHub’s standard non-secret run-context variables. It never reads `.asana_auth.json`, cookies, browser storage, test logs, traces, screenshots, headers, or environment-secret values.

## Collection architecture

| Stage | Location | Real input | Output |
|---|---|---|---|
| Playwright reporters | Each protected matrix shard | Executed test outcomes and retry attempts | `test-results/playwright-results.json` plus the existing blob report. |
| `export-shard-metrics.mjs` | Post-test step in each shard | Playwright JSON, runner start/test timestamps, shard matrix fields, GitHub run context | One safe `dashboard-metrics/shard-N.json` artifact. |
| `merge-shard-metrics.mjs` | No-secret `merge-reports` job | All per-shard metrics artifacts | `dashboard-metrics/playwright-shard-runs.json`. |
| Dashboard import | Local approved workstation | Merged JSON artifact | Interactive trend, balance, retry, and runner-stage visualization. |

Playwright supports multiple reporters, including JSON output to a file, so the suite retains its blob report for report merging and additionally writes JSON for metrics extraction.[1] GitHub provides stable default variables such as run ID, run number, workflow name, ref, event name, server URL, and repository on each runner.[2]

## Workflow changes

The shard job records a start timestamp, runs Playwright with `continue-on-error: true`, and immediately exports metrics before the job re-raises the actual shard failure. That sequencing is important: failed test shards still generate a safe measurement document and diagnostics.

```yaml
- name: Run independent onboarding checks for this shard
  id: playwright
  continue-on-error: true
  run: |
    echo "epoch=$(date +%s)" >> "$GITHUB_OUTPUT"
    npx playwright test \
      --project=chromium-onboarding-sharded \
      --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}

- name: Export safe dashboard metrics for this shard
  if: always()
  env:
    PLAYWRIGHT_JOB_OUTCOME: ${{ steps.playwright.outcome }}
    SHARD_METRICS_STARTED_EPOCH: ${{ steps.shard_start.outputs.epoch }}
    SHARD_TEST_STARTED_EPOCH: ${{ steps.playwright.outputs.epoch }}
  run: >-
    node scripts/export-shard-metrics.mjs
    --input test-results/playwright-results.json
    --output dashboard-metrics/shard-${{ matrix.shardIndex }}.json
```

The merge job downloads the two safe shard artifacts and produces a single JSON file:

```yaml
- name: Merge safe dashboard metrics
  run: >-
    node scripts/merge-shard-metrics.mjs
    --input-dir dashboard-metrics-artifacts
    --output dashboard-metrics/playwright-shard-runs.json
```

## Metric definitions

| Dashboard field | Source | Notes |
|---|---|---|
| `runId`, `runNumber`, `workflow`, `branch`, `trigger`, `url` | GitHub default run variables | Non-secret metadata only. |
| `startedAt` | Recorded start timestamp | Earliest available shard start in the merged document. |
| `durationSeconds` | Earliest shard start to latest shard completion | A **matrix wall-clock proxy**; it excludes queue time and merge-report duration. |
| Shard `setupSeconds` | Shard start to Playwright-start timestamp | Includes checkout, Node installation, browser install, auth-state materialization, and other pre-test steps that occur after start capture. |
| Shard `testSeconds` | Playwright-start timestamp to post-test exporter time | Includes Playwright test duration and final reporter write. |
| Shard `durationSeconds` | Shard start to exporter time | Total recorded protected-shard duration. |
| Test counts and retries | Playwright JSON reporter | Final test outcomes; retries count non-skipped attempts beyond the first. |

If Playwright cannot write its JSON output because an early prerequisite failed, the exporter still writes a run/shard metadata document with zero test counts and a clear collection note. This preserves an operational signal without fabricating test results.

## Downloading and importing real metrics

After a protected `main` run completes, open the workflow run’s **Artifacts** section and download:

```text
playwright-shard-dashboard-metrics-RUN_ATTEMPT
```

Extract the artifact and import `playwright-shard-runs.json` through the dashboard’s **Import run metrics** button. The standalone dashboard processes the JSON locally and makes no network request.

For a multi-run trend, retain several real merged JSON exports, then combine their `runs` arrays into one document with `schemaVersion: 1`. Preserve only the safe fields described in the schema.

## Safe data checklist

| Include | Exclude |
|---|---|
| Run IDs, timestamps, workflow name, branch, trigger, public run URL, durations, status, shard index, aggregate test counts, retry counts | Browser state JSON, base64 state, cookies, headers, test input values, secret names/values, OTPs, screenshots, traces, console/network logs |

The workflow uploads metric artifacts for 30 days. Metrics are designed to be shareable inside the engineering team, but access should still follow the repository’s artifact-retention and data-governance policies. GitHub artifacts support retention controls on upload.[3]

## Local validation

The package includes a deterministic validation script for the exporter and merger:

```bash
node test_dashboard_metrics_exporter.mjs
```

It verifies test-result counting, retry extraction, safe output markers, shard aggregation, and failure propagation using a local fixture. It does not call GitHub, Asana, or any authentication service.

## References

[1]: https://playwright.dev/docs/test-reporters "Playwright Docs — Reporters"
[2]: https://docs.github.com/en/actions/reference/workflows-and-actions/variables "GitHub Docs — Variables reference"
[3]: https://docs.github.com/en/actions/tutorials/store-and-share-data "GitHub Docs — Store and share data with workflow artifacts"

---

**Prepared by Manus AI.**
