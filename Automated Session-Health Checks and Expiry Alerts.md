# Automated Session-Health Checks and Expiry Alerts

This guide adds a scheduled GitHub Actions monitor for the Playwright storage state used by the Asana onboarding tests. The monitor tests **only the session-health setup project**. It does not create an Asana project, task, or invitation, and it fails closed if authentication cannot be proven.

> **Security principle:** Browser storage state is an authentication credential. The monitor may verify it but must never print, upload, cache, or include it in an issue, notification, trace, or artifact.

## Recommended monitoring design

The supplied workflow, `.github/workflows/asana-session-health.yml`, runs daily at **16:17 UTC** and can also be run manually. GitHub schedules use POSIX cron, run on the latest default-branch commit, and have a minimum interval of five minutes.[1] Daily monitoring is appropriate for a session credential that typically expires over hours or days; monitoring every few minutes would add noise without improving the controlled renewal process.

| Alert approach | What the team receives | Setup and trade-offs | Recommendation |
|---|---|---|---|
| GitHub workflow notification | A run-status notification for the user associated with the scheduled workflow. | No additional secret; notifications for scheduled workflows are associated with the user who created or last changed the cron schedule.[2] | Enable as a personal backup for the test-account owner. |
| **Deduplicated GitHub issue** | One open, actionable repository issue; later failures are added as comments. | Requires `issues: write`; visible to the team and avoids an alert per failed run. | **Use as the default team alert.** |
| External channel webhook | Slack, Teams, PagerDuty, or email service notification. | Requires another protected secret and an approved external integration; do not place webhook URLs in YAML. | Add only when a repository issue does not meet operational response needs. |

The workflow implements the first two options. It opens one issue titled **[CI] Asana Playwright session renewal required** when the check fails and adds later failure-run links to the same issue. The issue contains a remediation runbook and no credential material.

## One-time setup

### 1. Create a dedicated monitor environment

Create a GitHub environment named `asana-e2e-monitor`. Unlike the manually approved `asana-e2e` environment used for full onboarding checks, this environment is intended for scheduled verification. Restrict it to protected `main`, limit repository write access, and make the Asana account itself a dedicated least-privileged test identity. GitHub environments can hold environment-specific secrets and variables.[3]

| Item | Where to configure it | Required value |
|---|---|---|
| `ASANA_STORAGE_STATE_B64` | `asana-e2e-monitor` environment secret | Base64-encoded, approved browser-state JSON for the dedicated test account. |
| `ASANA_TEST_WORKSPACE_URL` | `asana-e2e-monitor` environment variable | Dedicated test organization home URL, such as `https://app.asana.com/0/home`. |
| `main` branch protection | Repository branch rules | Require review for workflow-file changes and restrict direct pushes. |
| Workflow code ownership | `CODEOWNERS` | Require QA/security review for `.github/workflows/**`. |

> Do not reuse a personal account’s browser session. The monitor should use a test account with the minimum SaaS role necessary to reach the expected signed-in home page.

### 2. Add the session secret

Capture a fresh test-account session through the approved, manual sign-in process, then encode and store it in the monitor environment:

```bash
python asana_guide_generator.py --record-auth --auth-only --headed
base64 -w 0 .asana_auth.json | gh secret set --env asana-e2e-monitor ASANA_STORAGE_STATE_B64
rm -f .asana_auth.json
```

Base64 is only a transport encoding, not encryption. The secrecy comes from the protected GitHub environment secret. GitHub recommends passing secrets through the `secrets` context as an environment variable or action input rather than inserting them directly into command lines.[3]

### 3. Commit the monitor workflow to protected `main`

Place the included file at:

```text
.github/workflows/asana-session-health.yml
```

Scheduled workflows execute from the default branch, so the workflow must exist on the repository’s protected default branch.[1]

## What the monitor does

| Stage | Behavior | Safe failure behavior |
|---|---|---|
| Secret materialization | Decodes `ASANA_STORAGE_STATE_B64` to a temporary runner file with mode 600. | Stops if the secret is missing, empty, or invalid JSON. |
| Authentication proof | Runs `npx playwright test --project=session-setup`. | Stops if the workspace redirects to login/SSO or expected authenticated UI is absent. |
| Alert | Opens one renewal issue or comments on the existing open issue. | No session content, cookie, OTP, or screenshot is placed in the issue. |
| Diagnostics | Uploads Playwright diagnostics only on failure for seven days. | Explicitly excludes storage-state filenames. |
| Cleanup | Deletes the temporary session file in an `always` step. | Executes on success, failure, and cancellation. |

## Renewal runbook

When an issue is opened, the session must be renewed by an authorized owner outside CI. Do not extend the monitor to drive MFA prompts or poll SMS/email one-time codes.

1. Sign in manually to the dedicated test account from an approved, secured workstation.
2. Complete SSO and MFA according to the organization’s identity policy.
3. Regenerate `.asana_auth.json` with the auth-only capture command.
4. Replace the protected `ASANA_STORAGE_STATE_B64` secret in **both** `asana-e2e` and `asana-e2e-monitor` if they use separate secrets; otherwise replace it in the common environment used by both workflows.
5. Manually dispatch **Asana session health** from protected `main`.
6. Confirm the session-health project passes, then close the renewal issue.
7. Securely delete all local copies of the session JSON and base64 output.

## Enable and test alerting safely

Before enabling the schedule, use **Run workflow** to execute the monitor from `main` with a valid session. Then test the alert route by temporarily using an expired/invalid **test-only** session secret, not a production credential. Confirm that exactly one renewal issue is created, diagnostic artifacts do not contain session JSON, and the cleanup step executes. Immediately restore the valid test session.

GitHub’s native notifications can tell the workflow owner about a scheduled run’s status, while the renewal issue ensures that the wider team has a durable, shared record of the remediation task.[2] Review the repository’s Actions logs after both a successful and failed trial to make sure no secret-derived value was printed. GitHub warns that structured secrets can be harder to redact reliably, which is why the workflow avoids echoing the JSON or the base64 blob.[4]

## Optional external notification

If the team needs immediate notification outside GitHub, add a **separate** `notify` job conditioned on `failure()` and use an organization-approved webhook or incident-management integration. Store its destination URL or token as an environment secret such as `SESSION_HEALTH_ALERT_WEBHOOK`; limit that secret to `asana-e2e-monitor`; and do not include the session-state secret in the notification job. The notification payload should include only the repository, workflow-run URL, and action required.

| Include in an external alert | Never include |
|---|---|
| Repository name, workflow name, run URL, timestamp, “session renewal required” | Browser-state JSON, base64 text, cookies, headers, passwords, SSO URLs with tokens, OTPs, TOTP seeds, or screenshots containing sensitive data |

## References

[1]: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions "GitHub Docs — Workflow syntax for GitHub Actions"
[2]: https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs "GitHub Docs — Notifications for workflow runs"
[3]: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions "GitHub Docs — Using secrets in GitHub Actions"
[4]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Docs — Secure use reference"

---

**Prepared by Manus AI.**
