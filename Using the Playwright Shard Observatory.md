# Using the Playwright Shard Observatory

Open `dashboard/playwright-shard-dashboard.html` in a modern browser. The dashboard is fully self-contained: it uses no external libraries, makes no network requests, and stores the most recently imported metrics document only in that browser’s local storage.

## Import real metrics

Select **Import run metrics** or drop a JSON file onto the import area. The dashboard expects the schema in `DASHBOARD_DATA_SCHEMA.md`. Start with the dashboard’s **Download empty template** button if you need the correct top-level structure.

The dashboard deliberately ships without fabricated performance data. It will populate only when you import a real, non-secret metrics export from your GitHub Actions runs.

| Dashboard area | Decision it supports |
|---|---|
| Average workflow duration | Whether sharding is reducing end-to-end CI time. |
| Success rate and retry count | Whether parallel execution is introducing instability. |
| Average shard imbalance | Whether one runner is consistently the bottleneck. |
| Workflow duration trend | Whether changes are improving or degrading CI over time. |
| Latest shard balance | Which shard needs rebalancing or test refactoring. |
| Runner-stage composition | Whether browser/setup time outweighs test execution time. |
| Recent runs table | Direct navigation back to the original GitHub Actions run. |

## Safe data boundary

The import file should contain only run identifiers, timestamps, safe status labels, durations, count metrics, and public GitHub run URLs. Do not include browser state, base64 data, cookies, request headers, screenshots, Playwright traces, environment variables, passwords, OTPs, or secret names/values.

Use **Export filtered CSV** to download the currently visible run and shard metrics for spreadsheet or statistical analysis. Use **Clear local data** to remove the imported data from browser local storage.

## Recommended workflow

1. Export real run summaries from the protected GitHub Actions workflow into a small JSON artifact that follows the schema.
2. Download the artifact to an approved workstation.
3. Import it into the dashboard locally.
4. Compare the duration trend and latest runner balance before changing shard count.
5. Keep two shards while setup time dominates; add shards only once independent test execution is the main contributor to wall-clock duration.

See `PLAYWRIGHT_SHARDING_GUIDE.md` for the matrix configuration and `DASHBOARD_DATA_SCHEMA.md` for data collection fields.

---

**Prepared by Manus AI.**
