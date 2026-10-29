# SaaS Onboarding Operations Feature Contract

Use this reference when scoping or auditing a full SaaS onboarding operations suite. Treat every item as a code/workflow deliverable, not a documentation-only promise.

| Capability | Required implementation outcome |
|---|---|
| Journey analysis | Record the target activation path, preconditions, expected UI evidence, and test-data boundaries. |
| Video and guide assets | Produce a time-boxed onboarding script and an automation-backed screenshot/PDF guide generator. |
| Serial UI journey | Implement the complete user narrative in one serial Playwright test. |
| Parallel checks | Split independent checks into shardable tests that create uniquely named, isolated test data. |
| Session gate | Require authenticated workspace access before any test data is created. |
| Fail-closed session handling | Classify login/SSO redirects as expired; use bounded retries only for unconfirmed transient failures. |
| Approved recovery | Validate an externally refreshed state; never automate password, SSO, MFA, OTP, email, or SMS factors. |
| CI orchestration | Use protected environments, job-level least privilege, artifact retention, and serial/shard dependencies. |
| Metrics contract | Export only aggregate timing, result, and retry metadata; exclude storage state, cookies, secrets, raw logs, screenshots, and traces. |
| Dashboard | Provide a local HTML dashboard with JSON import, filters, summary metrics, and CSV export. |
| Trend analysis | Retain bounded history, warm up a baseline, compare current run to prior successful runs, and make thresholds configurable. |
| Regression response | Write native job-summary context and maintain one deduplicated issue for an active regression. |
| Retention hygiene | Provide a dry-run-first, allowlisted artifact-pruning planner with a deletion cap and manifest. |
| Notifications | Use optional Slack/email delivery with aggregate-only content; notification failure must not replace the primary workflow outcome. |
| Operations preflight | Provide a non-destructive workflow that verifies code wiring, configuration completeness, and retention/notification policy. |
| Unified controls | Provide one configuration command and one complete validation command. |
| Deployment and architecture narrative | Create a deployment guide and an architecture/deployment presentation after the code suite is complete. |

## Default safety rules

1. Use a dedicated, least-privileged SaaS test account and workspace. Do not use a production administrator account.
2. Treat Playwright storage state as a credential. Keep it in protected environment secrets and out of Git, artifacts, logs, reports, and issue bodies.
3. Do not bypass identity-provider controls. Recovery must be a manual, approved sign-in followed by validation of the new state.
4. Keep pull-request validation secret-free. Release environment secrets only to trusted branches and scheduled/manual jobs that require them.
5. Make deletion operations dry-run first and allowlist-driven. Never infer that a broad artifact name is safe to remove.
6. Use genuine metrics only. Do not add illustrative performance numbers to dashboards, trend signals, summaries, or presentations.
