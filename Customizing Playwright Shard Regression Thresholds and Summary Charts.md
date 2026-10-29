# Customizing Playwright Shard Regression Thresholds and Summary Charts

The trend-monitoring job now reads non-secret **repository or organization variables** before every protected `main` run. This lets an engineering team tune the regression policy without editing the analyzer source code. The same effective values are displayed in the GitHub Actions job summary, so every alert remains auditable.

> Set thresholds through **Settings → Secrets and variables → Actions → Variables**. Do not use secrets for these values; they contain no credential material. Repository variables override the workflow defaults shown below.

## Available variables

| Variable | Default | Accepted range | Effect |
|---|---:|---:|---|
| `PLAYWRIGHT_TREND_BASELINE_SIZE` | `10` | Positive integer | Number of prior successful runs used to compute the median baseline. |
| `PLAYWRIGHT_TREND_MINIMUM_BASELINE` | `5` | Positive integer, no greater than baseline size | Successful observations required before performance rules can alert. |
| `PLAYWRIGHT_TREND_RETENTION` | `60` | Positive integer | Maximum real run summaries retained on the `metrics-history` branch. |
| `PLAYWRIGHT_TREND_DURATION_RATIO` | `0.20` | `0` to `10` | Relative duration increase needed to flag a regression; `0.20` means 20%. |
| `PLAYWRIGHT_TREND_DURATION_SECONDS` | `30` | Non-negative number | Minimum absolute duration increase, in seconds, required with the ratio rule. |
| `PLAYWRIGHT_TREND_IMBALANCE_INCREASE` | `0.15` | `0` to `1` | Required increase above baseline shard imbalance; `0.15` means 15 percentage points. |
| `PLAYWRIGHT_TREND_IMBALANCE_CEILING` | `0.35` | `0` to `1` | Minimum current imbalance needed before an imbalance signal; `0.35` means 35%. |
| `PLAYWRIGHT_TREND_RETRY_INCREASE` | `2` | Non-negative number | Required increase in retry count above the median baseline. |

The analyzer rejects invalid values and stops with a clear configuration error. It also rejects a minimum baseline larger than the baseline window, rather than silently applying an impossible policy.

## Example policy profiles

| Profile | Suggested variables | Appropriate use |
|---|---|---|
| Default balanced policy | Leave all variables unset. | New suite or moderate runtime variance. |
| Short, stable smoke suite | `DURATION_RATIO=0.15`, `DURATION_SECONDS=10`, `MINIMUM_BASELINE=8`. | Fast tests where even small regressions matter. |
| Noisy shared SaaS environment | `DURATION_RATIO=0.30`, `DURATION_SECONDS=60`, `BASELINE_SIZE=15`, `MINIMUM_BASELINE=8`. | Target environment has occasional latency spikes. |
| Strong shard-balance focus | `IMBALANCE_CEILING=0.25`, `IMBALANCE_INCREASE=0.10`. | Two or more shards should finish at similar times. |

Use both duration controls together. For example, setting a 15% ratio with a 10-second floor recognizes meaningful slowdowns without flagging a two-second difference in a very short suite.

## Historical charts in the GitHub Actions summary

The **Write trend summary with historical charts** workflow step adds a compact, textual visual directly to `GITHUB_STEP_SUMMARY`. GitHub Actions job summaries support GitHub Flavored Markdown written through the `GITHUB_STEP_SUMMARY` file.[1]

| Summary section | Chart input | Reading it |
|---|---|---|
| Matrix duration sparkline | Up to 12 most recent successful workflow durations | A rising sequence indicates longer matrix wall-clock time. |
| Shard imbalance sparkline | Up to 12 most recent successful imbalance values | Higher bars mean one shard is consuming more of the matrix wall-clock time. |
| Run labels | Matching run numbers, oldest to newest | Lets reviewers align visual movement to individual Actions runs. |
| Active threshold table | Effective repository-variable values | Confirms which policy evaluated the displayed run. |

The renderer uses Unicode sparklines rather than an external image, charting service, or secret-bearing artifact. This keeps the summary self-contained and renders reliably in native Markdown while preserving the full interactive chart capability in the local HTML dashboard.

## Apply and verify a change

1. Add or update the desired values in Actions variables.
2. Use **Run workflow** on protected `main`, or wait for the next qualifying E2E run.
3. Open the `merge-reports` job and inspect **Playwright shard trend analysis**.
4. Confirm the **Active threshold configuration** table shows the intended values.
5. Download the trend-analysis artifact or import the history JSON into Shard Observatory for the full visual trend.

Threshold changes do not rewrite prior history. They only alter the evaluation of the next and future real runs. Record threshold changes in the pull request or operational change log so an alert-rate shift is explainable.

## References

[1]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands "GitHub Docs — Workflow commands and job summaries"
[2]: https://docs.github.com/en/actions/reference/workflows-and-actions/variables "GitHub Docs — Variables reference"

---

**Prepared by Manus AI.**
