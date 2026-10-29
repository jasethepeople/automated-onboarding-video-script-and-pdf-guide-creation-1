# One-Time Setup: Complete Playwright Onboarding Operations Suite

Use this document once after merging the package into the repository. It consolidates every optional feature so the suite can run unattended afterward. The supplied workflows are already prewired; you only add the approved credentials and repository policy choices that cannot be safely invented in code.

> Begin with **Playwright onboarding operations preflight** using **Run workflow**. It is non-destructive: it checks file wiring, numeric policy variables, optional notification completeness, and `metrics-history` availability without opening a browser, touching test data, pruning artifacts, posting to Slack, or sending email.

## 1. Repository governance

| Item | One-time action | Needed for |
|---|---|---|
| Protected `main` | Require review for workflow, script, and test changes. | Safe E2E execution and secret protection. |
| Workflow-token policy | Allow Actions token write access where repository policy permits. | Trend history branch, regression issue, artifact deletion. |
| `metrics-history` branch | Allow first successful trend run to create it, then protect direct changes. | Retained dashboard history and median baselines. |
| Code ownership | Require review for `.github/workflows/`, `scripts/`, and `tests/`. | Prevents unreviewed changes to notification, deletion, and credential boundaries. |
| Dedicated SaaS test workspace | Separate from production with a least-privileged test account. | Browser tests, screenshots, and session health. |

## 2. Required protected environments and secrets

| Location | Name | Purpose | Required now? |
|---|---|---|---:|
| `asana-e2e` environment secret | `ASANA_STORAGE_STATE_B64` | Approved browser state for sharded onboarding tests. | Yes for live UI tests. |
| `asana-e2e-monitor` environment secret | `ASANA_STORAGE_STATE_B64` | Separate or equivalent state for scheduled session health. | Yes for session monitoring. |
| Repository secret | `SLACK_PRUNE_WEBHOOK_URL` | Aggregate Slack alerts after pruning deletes or errors. | Optional. |
| Repository secret | `RESEND_API_KEY` | Transactional email for pruning outcomes. | Optional, with both email variables. |

Capture the browser state only through the normal interactive sign-in and MFA procedure described in `SESSION_STATE_RECOVERY_RUNBOOK.md`. Do not place passwords, OTPs, browser cookies, browser-state JSON, or sender credentials in source control, chat, artifacts, repository variables, or issue bodies.

## 3. Non-secret Actions variables

The supplied defaults work without any variables. Create values only when policy tuning is needed.

| Variable family | Use | Default location |
|---|---|---|
| `ASANA_TEST_WORKSPACE_URL`, `ASANA_TEST_PROJECT_PREFIX` | Points the dedicated E2E account at the intended test workspace and project naming convention. | `asana-e2e` environment variables. |
| `PLAYWRIGHT_TREND_*` | Median-baseline length, retention, duration, imbalance, and retry thresholds. | Repository or organization variables. |
| `PLAYWRIGHT_PRUNE_*` | Metrics/report/diagnostic retention and pruning deletion cap. | Repository or organization variables. |
| `PRUNE_NOTIFICATION_EMAIL_FROM`, `PRUNE_NOTIFICATION_EMAIL_TO` | Sender and recipient list for optional Resend notifications. | Repository or organization variables. |

See `TREND_THRESHOLD_CUSTOMIZATION.md` and `ARTIFACT_PRUNING_RUNBOOK.md` for every variable’s accepted values and defaults.

## 4. Verify features in safe order

| Order | Workflow or command | Expected safe result |
|---:|---|---|
| 1 | **Playwright onboarding operations preflight** | Summary reports ready or identifies a concrete missing configuration. |
| 2 | **Asana session health** manual dispatch | Validates state without creating Asana data. |
| 3 | **Asana onboarding E2E** protected manual dispatch | Runs session setup, two isolated shards, merged reports, metrics, and trend history. |
| 4 | Download `playwright-shard-dashboard-metrics-*` artifact | Import the real JSON into `dashboard/playwright-shard-dashboard.html`. |
| 5 | **Prune Playwright performance artifacts** in `dry-run` | Generates a manifest; deletes nothing. |
| 6 | Review manifest, then select `delete` only if expected | Deletes only allowlisted aged artifacts; optionally notifies configured channels. |

## 5. What runs automatically afterward

| Automation | Cadence | Result |
|---|---|---|
| Session health | Daily | Detects expired/rejected state, retries transient issues, opens or updates a renewal issue. |
| Onboarding E2E | Protected pushes to `main` and manual dispatch | Runs isolated UI checks, metrics, reports, trend analysis, and regression alerting. |
| Operations preflight | Weekly Monday 07:17 UTC | Confirms policy/configuration wiring without side effects. |
| Artifact pruning | Weekly Sunday 03:37 UTC | Deletes only aged allowlisted artifacts; preserves manifest audit trail. |

## 6. Dashboard and reporting

Open `dashboard/playwright-shard-dashboard.html` locally and import a real merged metrics or retained-history JSON artifact. The dashboard is self-contained and makes no network request. Its metrics show wall-clock trend, shard balance, retries, setup/test composition, and status history.

Use the GitHub Actions job summary for a compact operational view: effective thresholds, duration and imbalance sparklines, session-health result, pruning plan, and notification-channel outcomes. Use the retained dashboard history for deeper investigation.

## Completion definition

The suite is fully operational when preflight passes, session health passes in the dedicated test workspace, a protected E2E run produces merged metrics, the `metrics-history` branch exists, pruning dry-run produces an expected manifest, and optional Slack/email displays `configured` only if the responsible team has supplied approved credentials.

---

**Prepared by Manus AI.**
