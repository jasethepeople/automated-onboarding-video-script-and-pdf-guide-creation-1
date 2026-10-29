# Automated Playwright Shard Trend Analysis Runbook

This integration turns the merged dashboard metrics from each protected `main` E2E run into a bounded, dashboard-ready history. It compares the newest run with the median of recent successful runs and opens or updates one regression issue only when configured performance rules are met.

> The monitor compares non-secret duration, shard-balance, status, retry, and aggregate test-count data. It never stores browser state, cookies, test logs, screenshots, traces, or secrets in the history branch or trend artifacts.

## One-time repository setup

| Step | Required action | Why it matters |
|---:|---|---|
| 1 | Merge the supplied `asana-onboarding-e2e.yml` and `scripts/` changes through the normal protected-`main` review process. | The analyzer runs only from trusted workflow code. |
| 2 | In **Settings → Actions → General**, permit workflow `GITHUB_TOKEN` write access for this repository, or grant equivalent approved repository policy. | The no-secret merge job needs `contents: write` to update the metrics history and `issues: write` to maintain a regression alert. |
| 3 | Protect the `metrics-history` branch after the first successful run creates it. Allow only the trusted GitHub Actions workflow to push, and require administrator review for any direct changes. | Prevents a user from altering the performance baseline outside the workflow. |
| 4 | Add workflow files, `scripts/analyze-shard-trends.mjs`, and `metrics/playwright-shard-history.json` to the appropriate code-owner review rules. | Changes to thresholds or history behavior receive explicit review. |
| 5 | Ensure the existing `asana-e2e` environment remains protected and secrets remain scoped only to the E2E shard jobs. | The trend job itself is intentionally no-secret. |

GitHub recommends granting workflow credentials only the permissions required for a particular job. The workflow keeps `contents: write` and `issues: write` exclusively on the no-secret merge/trend job, rather than at top-level.[1]

## What happens on every protected main run

1. The E2E matrix emits one safe metrics artifact per shard.
2. The merge job combines them into `playwright-shard-runs.json`.
3. The analyzer loads the prior `metrics-history` branch document, adds the newest run, and retains at most 60 runs.
4. It calculates a median baseline from the previous 10 successful runs, requiring at least 5 before applying regression rules.
5. It writes a CI step summary and uploads `dashboard-metrics-history.json` and `shard-trend-analysis.json` for 30 days.
6. It publishes the safe history file back to `metrics-history`.
7. If a regression rule is met, it opens or comments on a deduplicated issue titled **`[CI] Playwright shard performance regression`**.

## Baseline warm-up and thresholds

| Signal | Default rule | First action when flagged |
|---|---|---|
| Wall-clock performance | At least 20% slower and 30+ seconds slower than the median of the prior successful baseline. | Check shard timing, browser-install/setup cost, GitHub runner health, and target-SaaS latency before changing shard count. |
| Shard imbalance | Current imbalance exceeds 35% and rises 15+ percentage points above baseline. | Identify the longest shard in the dashboard; refactor or redistribute independent checks. |
| Retries | Current retries are at least two higher than baseline and at least two total. | Investigate flaky selector, session validation, runner, or network behavior. |
| Functional failure | Latest run is not successful. | Treat it as a test/product failure first; do not label it merely a performance regression. |

The first five successful runs intentionally generate an **insufficient baseline** finding rather than a performance alert. This prevents a comparison against an unreliable single run. If the project’s normal E2E runtime or variance differs materially, adjust analyzer arguments in the workflow rather than modifying script defaults ad hoc.

## Tuning example

The default analyzer invocation uses conservative defaults. To tune them visibly in review, add arguments to the **Analyze multi-run shard trends** step:

```bash
node scripts/analyze-shard-trends.mjs \
  --current dashboard-metrics/playwright-shard-runs.json \
  --history "$RUNNER_TEMP/metrics-history/playwright-shard-history.json" \
  --history-output "$RUNNER_TEMP/trend/dashboard-metrics-history.json" \
  --analysis-output "$RUNNER_TEMP/trend/shard-trend-analysis.json" \
  --baseline-size 12 \
  --minimum-baseline 6 \
  --duration-ratio-threshold 0.25 \
  --duration-absolute-threshold-seconds 45
```

Keep both a relative and an absolute duration threshold. The paired requirement avoids escalating a negligible number of seconds on a very fast suite and avoids treating a fixed small delay as a major percentage problem.

## Reading the result

The merge job’s **Playwright shard trend analysis** section provides a compact readout of latest duration, shard imbalance, retry count, baseline readiness, and findings. For deeper inspection, download the artifact named:

```text
playwright-shard-trend-analysis-RUN_ATTEMPT
```

Import `dashboard-metrics-history.json` into the local **Shard Observatory** dashboard. It contains the retained real `runs` array used by the analyzer; no JSON combining is necessary.

## Regression issue triage

The workflow maintains one open regression issue rather than creating a new issue on each slow run. Each later regression adds a comment with the current safe metrics and the workflow link.

| Observation | Likely interpretation | Recommended response |
|---|---|---|
| Duration increase, balanced shards | Shared setup, GitHub queue/runner, browser install, or target SaaS is slower. | Compare setup/test composition and run again before refactoring tests. |
| Duration increase, one long shard | Uneven test work or a slow isolated test. | Move or split independent tests; preserve unique test data. |
| Retry increase, stable duration | Intermittent selectors, state, target availability, or browser startup. | Review failure diagnostics and session-health classification. |
| Sustained slow trend across many runs | The baseline may have shifted. | Confirm the cause, then allow new successful observations to establish a new median; do not manually edit history unless correcting an audited data error. |

## Manual verification

The package includes a deterministic local test of the analyzer:

```bash
node test_shard_trend_analysis.mjs
```

It validates that duration, imbalance, and retry regressions are detected only after a sufficient five-run baseline, that insufficient history does not create a false performance regression, and that retained history is dashboard-compatible.

## References

[1]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Docs — Secure use reference"
[2]: https://docs.github.com/en/actions/tutorials/store-and-share-data "GitHub Docs — Store and share data with workflow artifacts"
[3]: https://playwright.dev/docs/test-sharding "Playwright Docs — Sharding"

---

**Prepared by Manus AI.**
