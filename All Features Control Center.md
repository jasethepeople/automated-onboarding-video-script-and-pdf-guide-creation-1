# All Features Control Center

This is the **one-fell-swoop** entry point for the entire suite. Instead of configuring session health, sharded tests, trend analysis, pruning, Slack, and email one by one, use `scripts/configure-all-features.sh` once for the repository. It provisions every environment, session-state secret, policy variable, and optional notification value that can be safely configured without changing organization-level governance.

> The command prints a complete plan first. It changes nothing unless `--apply` is supplied. It accepts browser state and external credentials only as files, never as command-line values, and never prints them.

## What the one command configures

| Capability | Provisioned automatically by the control command |
|---|---|
| E2E UI test environment | Creates or updates `asana-e2e`; sets its approved storage state, workspace URL, and project prefix. |
| Session-health environment | Creates or updates `asana-e2e-monitor`; sets its approved storage state and workspace URL. |
| Sharded tests and serial smoke test | Receives the required environment configuration through the existing workflow. |
| Trend analysis and summary charts | Sets the full default baseline, regression, imbalance, retry, and retention policy variables. |
| Artifact lifecycle | Sets metric/report/diagnostic retention and a deletion cap. |
| Slack pruning notices | Configures automatically if a webhook file is supplied. |
| Resend email pruning notices | Configures automatically if key, sender, and recipient values are supplied together. |
| Dashboard and history | Activated by the first protected E2E metrics run; no separate provisioning required. |
| Scheduled monitoring and cleanup | Already committed in workflow YAML and becomes active after merge. |

## Run it once

First produce a fresh, approved Playwright storage state through the normal interactive sign-in and MFA flow. Store it in a local file that will not be committed. If you want Slack or email, store each credential in a separate local file as well.

```bash
cd /path/to/repository

# Review the complete plan first. This changes nothing.
bash scripts/configure-all-features.sh \
  --repo OWNER/REPOSITORY \
  --session-state /secure/path/asana-storage-state.json \
  --workspace-url https://app.asana.com/0/YOUR_TEST_WORKSPACE \
  --project-prefix "E2E Onboarding" \
  --slack-webhook-file /secure/path/slack-webhook.txt \
  --resend-key-file /secure/path/resend-key.txt \
  --email-from "CI Operations <ci@your-domain.example>" \
  --email-to "ops@your-domain.example,oncall@your-domain.example"

# Apply exactly the reviewed plan.
bash scripts/configure-all-features.sh \
  --repo OWNER/REPOSITORY \
  --session-state /secure/path/asana-storage-state.json \
  --workspace-url https://app.asana.com/0/YOUR_TEST_WORKSPACE \
  --project-prefix "E2E Onboarding" \
  --slack-webhook-file /secure/path/slack-webhook.txt \
  --resend-key-file /secure/path/resend-key.txt \
  --email-from "CI Operations <ci@your-domain.example>" \
  --email-to "ops@your-domain.example,oncall@your-domain.example" \
  --apply
```

Slack and email are both optional. Omit their related flags to leave them inactive; every other feature is still configured. The command requires authenticated GitHub CLI access to the intended repository.

## What remains intentionally outside the command

| Item | Why it remains manual |
|---|---|
| Branch protection and code ownership | Organization and repository governance policy cannot be guessed or safely overwritten. |
| GitHub Actions token write policy | The organization must approve permissions needed for trend history, issues, and artifact deletion. |
| Normal SSO/MFA sign-in | Browser state must be captured through an approved human sign-in; automation does not bypass MFA. |
| Slack app/webhook creation | The workspace administrator chooses the notification channel and grants the webhook. |
| Resend sender/domain authorization | The email provider owner controls authorized sending identities. |

## Final verification

After applying configuration, open the **Playwright onboarding operations preflight** workflow and use **Run workflow**. A ready result confirms the committed assets, policy variables, notification completeness, and history-branch readiness without touching the SaaS, pruning artifacts, posting Slack, or sending email. Then run the session-health workflow once, followed by a protected E2E run.

---

**Prepared by Manus AI.**
