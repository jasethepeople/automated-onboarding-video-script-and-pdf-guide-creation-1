# Deploy the Complete Verification and Dashboard Suite to a New GitHub Repository

This guide deploys the entire package—guide generation, serial and sharded Playwright checks, session health, recovery support, metrics, dashboard artifacts, trend analysis, regression issues, Slack/email alerts, operations preflight, and artifact pruning—to a **new GitHub repository**.

> Use a dedicated, least-privileged Asana test account and a test-only workspace. Do not use a production administrator account, do not commit browser session files, and do not automate interactive SSO/MFA. The suite validates and reuses an approved state, but it intentionally does not bypass identity-provider controls.

## Deployment prerequisites

| Requirement | Why it is needed | Check |
|---|---|---|
| GitHub account with repository administration rights | Required to create environments, manage environment secrets, and enable necessary workflow permissions. | `gh auth status` |
| GitHub CLI (`gh`) | Creates the repository and performs the optional one-command configuration. | `gh --version` |
| Git and Node.js 22+ | Required for repository setup and Playwright tooling. | `git --version`, `node --version` |
| Python 3.11+ | Required for guide generation, recovery support, and Python validators. | `python3 --version` |
| Dedicated Asana test workspace/account | Supplies browser state and prevents test data from reaching production. | Confirm manually in the browser. |
| Optional Slack/Resend credentials | Enables external operational notices. | Keep in local files until the configuration command streams them into GitHub Secrets. |

GitHub requires write access to create repository secrets and variables, and environment-secret management may require repository owner or organization-admin privileges.[1] GitHub environments can protect secrets and restrict which branches may deploy to them.[2]

## Step 1 — Extract the package and verify it locally

Download `asana_onboarding_asset_suite.zip`, extract it into an empty local folder, and install the declared dependencies:

```bash
unzip asana_onboarding_asset_suite.zip -d asana-onboarding-suite
cd asana-onboarding-suite

npm ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Runs every safe, local validator without accessing Asana, GitHub APIs,
# Slack, or email providers.
npm run verify:all
```

A successful run ends with:

```text
All coded suite features passed local validation.
```

## Step 2 — Create and push the new GitHub repository

Choose the repository name and visibility before running the commands below. The example uses a private repository named `asana-onboarding-ops`.

```bash
gh auth login

git init -b main
git add .
git commit -m "Initial all-feature onboarding verification suite"

gh repo create OWNER/asana-onboarding-ops \
  --private \
  --source=. \
  --remote=origin \
  --push
```

For a public repository, replace `--private` with `--public`. Confirm that `.gitignore` excludes `.asana_auth.json`, encrypted recovery envelopes, `.env`, test artifacts, and reports before pushing.

## Step 3 — Set repository policy before live automation

After the first push, configure these repository settings in GitHub.

| GitHub area | Recommended setting | Reason |
|---|---|---|
| **Settings → Branches** | Protect `main`; require pull-request review for workflow and script changes. | Prevents unreviewed changes to browser-state, notification, deletion, or issue automation. |
| **Settings → Actions → General** | Allow the repository’s workflows the token access required by the included job-level `permissions` declarations. | Trend history writes, regression issues, and artifact deletion need write scopes. |
| **Settings → Environments** | Create `asana-e2e` and `asana-e2e-monitor`; restrict deployment branches to `main`. | Scopes browser-state access to trusted workflow jobs. |
| **Environment protection rules** | For unattended session monitoring, avoid a required reviewer on `asana-e2e-monitor`; otherwise scheduled health checks will wait for approval. | Maintains automation while allowing branch restrictions. |
| **Code owners** | Review `.github/workflows/`, `scripts/`, and `tests/`. | Protects all automation-control changes. |

The workflows already declare least-privilege job scopes such as `contents: write`, `issues: write`, and `actions: write` only where needed. GitHub recommends limiting the `GITHUB_TOKEN` to the minimum permissions required for each workflow/job.[3]

## Step 4 — Capture an approved browser session state

On a secured workstation, sign in to the dedicated Asana test account in a visible browser. Complete SSO/MFA normally, then save Playwright storage state:

```bash
python3 asana_guide_generator.py --record-auth --auth-only --headed
```

This produces `.asana_auth.json`. Keep the file local and private; do **not** commit, email, upload to issue comments, or paste it into chat. The all-feature setup command encodes it directly from the file and streams it into environment secrets without printing it.

## Step 5 — Configure every suite feature in one command

The package includes `scripts/configure-all-features.sh`. It provisions both protected environments, browser-state secrets, environment variables, trend thresholds, pruning policy, and—if supplied—Slack plus email notifications. Run it once as a dry-run and once with `--apply`.

```bash
# Optional: create local files that contain only the actual secret values.
printf '%s' 'https://hooks.slack.com/services/...' > /secure/slack-webhook.txt
printf '%s' 're_...' > /secure/resend-api-key.txt
chmod 600 /secure/slack-webhook.txt /secure/resend-api-key.txt .asana_auth.json

# Review every intended change. This makes no GitHub changes.
bash scripts/configure-all-features.sh \
  --repo OWNER/asana-onboarding-ops \
  --session-state .asana_auth.json \
  --workspace-url https://app.asana.com/0/YOUR_TEST_WORKSPACE \
  --project-prefix "E2E Onboarding" \
  --slack-webhook-file /secure/slack-webhook.txt \
  --resend-key-file /secure/resend-api-key.txt \
  --email-from "CI Operations <ci@your-domain.example>" \
  --email-to "ops@your-domain.example,oncall@your-domain.example"

# Apply the reviewed plan.
bash scripts/configure-all-features.sh \
  --repo OWNER/asana-onboarding-ops \
  --session-state .asana_auth.json \
  --workspace-url https://app.asana.com/0/YOUR_TEST_WORKSPACE \
  --project-prefix "E2E Onboarding" \
  --slack-webhook-file /secure/slack-webhook.txt \
  --resend-key-file /secure/resend-api-key.txt \
  --email-from "CI Operations <ci@your-domain.example>" \
  --email-to "ops@your-domain.example,oncall@your-domain.example" \
  --apply
```

Slack and Resend are optional. Omit all flags related to either channel to leave it disabled. The rest of the suite remains fully configured. GitHub documents `gh secret set` for repository and environment secret management; use files/standard input rather than placing a secret on the command line.[1]

## Step 6 — Activate safely in this order

Run the following workflows from the repository’s **Actions** tab, selecting `main`.

| Order | Workflow | Expected result | Side effect |
|---:|---|---|---|
| 1 | **Playwright onboarding operations preflight** | Confirms variables, source assets, notification completeness, and history readiness. | None. It does not open a browser, send messages, or prune artifacts. |
| 2 | **Asana session health** | Confirms the stored session reaches the authenticated workspace. | None. It only checks session health. |
| 3 | **Asana onboarding E2E** | Runs serial/sharded checks, creates isolated timestamped test data, emits reports and metrics. | Dedicated test workspace receives isolated projects/tasks. |
| 4 | **Prune Playwright performance artifacts** with `dry-run` | Produces an allowlisted manifest. | None. It deletes nothing. |
| 5 | **Prune Playwright performance artifacts** with `delete` | Removes only old, allowlisted artifacts shown by the reviewed manifest. | Deletes eligible GitHub Actions artifacts irreversibly. |

The first successful E2E merge creates the `metrics-history` branch and begins the five-successful-run baseline warm-up for regression detection. Do not edit its generated history file manually.

## Step 7 — View dashboard and reports

After the E2E run completes:

1. Open the workflow’s **Artifacts** section.
2. Download `playwright-shard-dashboard-metrics-*` or `playwright-shard-trend-analysis-*`.
3. Open `dashboard/playwright-shard-dashboard.html` locally in a browser.
4. Import the downloaded JSON artifact using the dashboard’s file picker.

The dashboard remains local-only. It does not send metrics to an external analytics service.

## Step 8 — Confirm ongoing automation

After merge to `main`, the included workflows run automatically:

| Automation | Schedule | Outcome |
|---|---|---|
| Session health | Daily at 16:17 UTC | Bounded retry, remediation issue, optional Slack/email alert on failure. |
| Operations preflight | Monday at 07:17 UTC | Non-destructive policy and integration check; optional alert on failure. |
| Artifact pruning | Sunday at 03:37 UTC | Allowlisted retention cleanup and optional outcome/failure notice. |
| E2E, dashboard, trend analysis | Pushes to protected `main` and manual dispatch | Shards, report merging, metrics/history, native charts, regression issue, and optional alerts. |

## Deployment troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Preflight reports incomplete state | Session secret or environment variable was not configured. | Re-run `configure-all-features.sh` with the approved storage-state file and correct workspace URL. |
| Session health redirects to login | Browser state expired, was revoked, or is invalid for the selected test account. | Renew manually through normal SSO/MFA and rerun the one-command configuration. |
| History branch or regression issue cannot be written | Workflow token policy disallows job-level write scope. | Review repository Actions permissions; allow only the scopes needed by this suite. |
| Pruning fails with API permission error | Actions token lacks `actions: write` or repository policy blocks artifact deletion. | Adjust the GitHub Actions token policy, then run a dry-run before retrying deletion. |
| Slack/email is reported as not configured | Optional secret or variables were omitted. | Add the channel’s complete set of values using the control command. |
| Scheduled workflow does not run unattended | Environment rule requires manual review. | Remove the reviewer rule for the monitor environment or accept that runs will wait for approval. |

## Final acceptance check

The deployment is complete when `npm run verify:all` passes locally; preflight and session health pass on GitHub; one protected E2E run produces merged metrics; the dashboard imports a real artifact; `metrics-history` exists; and a pruning dry-run produces a reviewed manifest.

## References

[1]: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions "GitHub Docs — Using secrets in GitHub Actions"
[2]: https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment "GitHub Docs — Managing environments for deployment"
[3]: https://docs.github.com/actions/reference/authentication-in-a-workflow "GitHub Docs — Use GITHUB_TOKEN for authentication in workflows"

---

**Prepared by Manus AI.**
