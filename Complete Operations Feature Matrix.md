# Complete Operations Feature Matrix

This package now combines the onboarding walkthrough, safe UI verification, session management, CI parallelization, performance intelligence, notifications, and storage hygiene into one operating model. The table below distinguishes features that work immediately from features that become active after a one-time repository configuration.

| Capability | Included asset(s) | Default behavior | One-time configuration needed |
|---|---|---|---|
| Five-minute onboarding narrative | `asana_onboarding_video_script.md` | Ready to record. | None. |
| Screenshot/PDF guide generator | `asana_guide_generator.py`, `workflow.json` | Generates a live guide from approved test access. | Dedicated test account and first session capture. |
| Serial onboarding smoke test | `tests/asana-onboarding.spec.ts` | Ready in the test project. | Protected test environment/session state. |
| Sharded independent onboarding checks | `tests/asana-onboarding-sharded.spec.ts`, `playwright.config.ts` | Two protected CI shards with unique test data. | Protected test environment/session state. |
| Authentication health and retry | `tests/session-health.setup.ts`, `run-session-health-with-retry.sh` | Fails closed, retries only transient checks, never bypasses MFA. | Approved session state. |
| Scheduled session expiry monitor | `asana-session-health.yml` | Daily health check and deduplicated renewal issue. | `asana-e2e-monitor` environment session state. |
| Safe manual recovery | `session_state_recovery.py` | Validates and encrypts manually refreshed state; no headless login. | Approved key-management procedure. |
| Metrics export and report merge | `export-shard-metrics.mjs`, `merge-shard-metrics.mjs` | Aggregates non-secret shard timing and outcomes. | None beyond CI run. |
| Local interactive performance dashboard | `dashboard/playwright-shard-dashboard.html` | Imports real metrics locally; no network calls. | Download a metrics artifact. |
| Trend detection and native CI charts | `analyze-shard-trends.mjs`, `render-trend-summary.mjs` | Maintains 60-run history, median baseline, threshold table, and summary sparklines. | Workflow-token write policy and `metrics-history` branch policy. |
| Performance regression issue | E2E merge job | Deduplicated issue when configured thresholds are crossed. | Workflow-token issue-write policy. |
| Artifact pruning | `prune-playwright-artifacts.yml`, `plan-artifact-prune.mjs` | Weekly allowlisted cleanup with manual dry-run mode. | Workflow-token Actions write policy. |
| Slack pruning notifications | `notify-artifact-prune.mjs` | Sends aggregate success/failure result only when secret exists. | `SLACK_PRUNE_WEBHOOK_URL` secret. |
| Email pruning notifications | `notify-artifact-prune.mjs` | Sends aggregate success/failure email only when fully configured. | Resend secret plus sender/recipient variables. |
| Operations preflight | Added in this final consolidation pass. | Manual or scheduled non-destructive verification of configured capabilities and policy. | Optional protected environment approval to verify test state is present. |
| Unified setup checklist | Added in this final consolidation pass. | One place to configure all optional features. | Complete once for the repository. |

## Final consolidation choices

The remaining implementation work adds **operational preflight** and a **single one-time setup checklist**. No destructive action, external notification, live account operation, or credential configuration is performed automatically. Features that need credentials are implemented but remain dormant until the repository owner adds the corresponding approved GitHub Actions secret or variable.

---

**Prepared by Manus AI.**
