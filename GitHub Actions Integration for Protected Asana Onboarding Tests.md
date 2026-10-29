# GitHub Actions Integration for Protected Asana Onboarding Tests

This integration runs the Playwright onboarding suite safely in GitHub Actions. It separates **untrusted pull-request validation** from **authenticated browser testing**. Pull requests type-check and discover tests without receiving a browser session; the live SaaS journey runs only after code reaches the protected `main` branch or is manually dispatched against that branch.

> A Playwright storage-state file is a bearer credential. Treat it with the same care as an access token: create it for a dedicated, least-privileged test user; restrict who can run the protected environment; and rotate it whenever its access, device posture, or owner changes.

## Pipeline behavior

| Job | Trigger | Session secret available? | Purpose |
|---|---|---:|---|
| `validate` | Pull requests, protected-branch pushes, manual runs | No | Installs locked dependencies, type-checks the suite, and lists test discovery. |
| `onboarding-e2e` | Protected `main` branch push or manual run on `main` | Yes, only in `asana-e2e` environment | Materializes session state temporarily, runs session health, then runs the six dependent onboarding tests. |

The workflow uses GitHub environment protection for the authenticated job. Required reviewers can prevent a job from accessing environment secrets until an authorized reviewer approves it.[2] The configuration additionally grants the workflow only `contents: read`, and does not grant repository-write or cloud-identity permissions.

## One-time GitHub configuration

### 1. Create a protected environment

In the repository, navigate to **Settings → Environments → New environment** and create `asana-e2e`. Configure the following controls:

| Environment control | Recommended value | Why |
|---|---|---|
| Required reviewers | QA owner and security/identity owner | Requires an explicit approval before the session secret is released. |
| Deployment branches | Protected `main` only | Prevents feature branches from invoking the authenticated SaaS run. |
| Environment variable `ASANA_TEST_WORKSPACE_URL` | URL for the dedicated test organization’s home page | Keeps the test workspace URL out of the workflow source. |
| Environment variable `ASANA_TEST_PROJECT_PREFIX` | `E2E Onboarding` | Identifies data that test cleanup may remove. |

GitHub supports secrets at repository, environment, and organization scope; environment secrets are created through the environment’s **Secrets** settings.[1] Keep the browser session scoped to this single environment rather than storing it as a broadly accessible repository secret.

### 2. Create the dedicated test session

On a secured workstation, sign in to the test Asana account and capture its session state once:

```bash
python asana_guide_generator.py --record-auth --auth-only --headed
```

Confirm the JSON contains a session for the **test** account only. Do not use a personal account, an administrator, or a production workspace.

### 3. Store session state as a protected secret

Encode the state file as a single line locally, then enter its value as the environment secret `ASANA_STORAGE_STATE_B64` in the `asana-e2e` environment. Base64 makes multiline JSON practical to transfer; it is **not encryption**. GitHub encrypts secrets at rest, and the workflow decodes the secret only into a temporary runner file.

```bash
base64 -w 0 .asana_auth.json > asana_auth.b64
```

Alternatively, use GitHub CLI to enter the secret interactively from the file:

```bash
base64 -w 0 .asana_auth.json | gh secret set --env asana-e2e ASANA_STORAGE_STATE_B64
```

Delete `asana_auth.b64` immediately after the secret has been stored. GitHub’s documentation recommends using secrets as environment variables or inputs, and warns against passing secrets in command lines; the workflow therefore maps the secret into a step environment rather than interpolating it into a shell command.[1]

> Do not put `.asana_auth.json`, `asana_auth.b64`, a base64 session string, test-account password, TOTP seed, or any OAuth refresh token in the repository, workflow YAML, run logs, artifacts, or cache.

### 4. Commit the workflow

Place the supplied workflow at:

```text
.github/workflows/asana-onboarding-e2e.yml
```

Ensure `.gitignore` contains at least:

```gitignore
.asana_auth.json
*.auth.json
*.auth.b64
playwright-report/
test-results/
```

## What happens during an authenticated run

The job installs Chromium, decodes the protected secret to `${RUNNER_TEMP}/asana_auth.json` with restrictive file permissions, verifies that it is non-empty JSON, and exports only the **file path** through `GITHUB_ENV`. `session-health.setup.ts` runs first. It fails when the state file is absent, the workspace redirects to a sign-in/SSO page, or the authenticated UI does not expose the expected Create control. The dependent `chromium-onboarding` project therefore cannot create any test project on an expired or rejected session.

If a test fails, the workflow archives the Playwright report and test-results directory for seven days. GitHub’s artifact action supports uploading files and directories with a configured retention period.[3] The session-state JSON is explicitly excluded from artifacts, and a cleanup step deletes its temporary file whether the test passes, fails, or is cancelled.

## Session renewal procedure

A CI session may expire because of identity-provider policy, cookie lifetime, conditional access, browser/device binding, or explicit logout. When `session-setup` fails, **do not add interactive login, SMS scraping, email OTP polling, or MFA bypass to the workflow**. Instead, use this controlled renewal sequence:

1. An approved test-account owner signs in manually on the secured workstation and completes all required MFA.
2. The owner reruns the auth-only command to create a fresh `.asana_auth.json`.
3. The owner base64-encodes the new file and replaces `ASANA_STORAGE_STATE_B64` in the protected `asana-e2e` environment.
4. The owner runs the workflow manually from protected `main` and reviews the session-health result.
5. The owner securely deletes every local transient copy of the serialized state.

| Failure signal | Meaning | Correct response |
|---|---|---|
| `ASANA_STORAGE_STATE_B64 is not available` | The environment secret was not released or was not configured. | Confirm the run is on `main`, the job uses `asana-e2e`, and reviewers approved access. |
| `ASANA_STORAGE_STATE does not exist` | The temporary secret-to-file step failed. | Review only workflow logic and secret availability; never print the secret. |
| Login or SSO redirect | Browser session was expired or rejected. | Renew session through the approved manual-authentication process. |
| Missing Create control | Account role or workspace UI changed. | Verify dedicated account permissions and then update stable locators if needed. |

## Trigger and branch safety

The authenticated job is deliberately excluded from `pull_request` events. GitHub warns that secrets are not sent to workflows from forked repositories and highlights the risks of privileged workflows that process untrusted pull-request code.[1] [2] Keep the authenticated workflow on a protected branch, require review for edits to `.github/workflows/`, and never replace this design with `pull_request_target` solely to make session secrets available.

## References

[1]: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions "GitHub Docs — Using secrets in GitHub Actions"
[2]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Docs — Secure use reference"
[3]: https://docs.github.com/en/actions/tutorials/store-and-share-data "GitHub Docs — Store and share data with workflow artifacts"

---

**Prepared by Manus AI.**
