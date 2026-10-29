## Cover

# SaaS Onboarding Operations

### A reusable skill for complete, secure, observable onboarding automation

## Slide 1

# One trigger unlocks the full operating system

- Use when a SaaS onboarding flow must be analyzed, automated, tested, monitored, documented, deployed, or presented.
- Start with one activation outcome: first project, first workflow, import, or teammate invitation.
- Deliver the integrated system in one coordinated pass—not as disconnected add-ons.

## Slide 2

# The skill builds four connected layers

- **Experience:** Journey map, time-boxed video script, annotated screenshot/PDF guide.
- **Verification:** Serial Playwright narrative plus independently shardable tests.
- **Operations:** Session health, recovery boundary, preflight, retention, optional notices.
- **Insight:** Metrics, dashboard, history, configurable regression detection.

## Slide 3

# Start with a bounded, testable user journey

1. Define the activation outcome and expected UI evidence.
2. Separate public discovery from stateful test execution.
3. Use a dedicated test account and workspace for authenticated routes.
4. Externalize selectors, visual annotations, and step data into configuration.

## Slide 4

# Security rules are built into the workflow

- Treat browser storage state as a protected credential, not a test artifact.
- Keep PR validation secret-free; scope sensitive state to protected environments.
- Fail closed on login/SSO redirects; retry only transient, unconfirmed failures.
- Never automate passwords, SSO, MFA, OTP, email, SMS, or push-factor challenges.

## Slide 5

# Sharding accelerates checks without corrupting state

- Keep the full onboarding story serial to preserve the narrative.
- Shard only independent tests that create uniquely named, isolated data.
- Run an authenticated session-health prerequisite before each shard.
- Merge reports and safe metrics only after all shards complete.

## Slide 6

# Evidence becomes local operational insight

- Export only timing, outcome, and retry facts; exclude secrets, cookies, raw logs, traces, and screenshots.
- Merge per-shard artifacts into a dashboard-ready JSON contract.
- Use the local dashboard for duration, balance, retries, history, filters, and CSV export.
- Compare real history against configurable baselines before raising regression issues.

## Slide 7

# Maintenance is explicit, narrow, and auditable

- Session health: scheduled, bounded retry, and one renewal issue for confirmed expiry.
- Preflight: non-destructive configuration and wiring check.
- Pruning: allowlisted, dry-run-first retention cleanup with a deletion cap and manifest.
- Notifications: optional aggregate-only Slack/email; delivery never masks a workflow failure.

## Slide 8

# One configuration command; one proof command

| Operator need | Standard control |
|---|---|
| Configure environments, state, variables, and optional notices | `configure-all-features.sh` with dry-run then `--apply` |
| Verify every local code path and contract | Master validation command |
| Prove feature completeness | Feature-manifest validator |
| Explain deployment and architecture | Architecture/deployment slide deck |

## Slide 9

# Completeness is a verifiable contract

- Read the feature contract before planning the implementation.
- Copy and adapt the 12-capability manifest for the generated repository.
- Run the validator so a missing code path cannot hide behind documentation.
- State clearly what was verified offline and what awaits live test-account or repository access.

## Slide 10

# Build the whole system—then prove it

### Reliable onboarding verification requires both product-level UI checks and operational discipline.

### The reusable skill turns that discipline into a repeatable delivery pattern.
