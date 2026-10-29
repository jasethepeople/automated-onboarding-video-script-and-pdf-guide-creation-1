# Session-State Recovery and Re-encryption Runbook

`session_state_recovery.py` is a **safe recovery guard**, not an unattended login bot. When the scheduled health check detects an expired state, the tool supports the approved renewal workflow: validate a newly captured replacement state in headless Chromium, encrypt the validated file with AES-256-GCM, and hand the sealed output to the organization’s approved secret-management process.

> It will not enter credentials, operate an SSO page, request or read an OTP, generate an MFA code, or attempt to defeat a login requirement. A redirect to login/SSO is a deliberate hard failure.

## Recovery flow

| Step | Owner | Action | Output |
|---:|---|---|---|
| 1 | Scheduled monitor | Detects expired state and opens/updates renewal issue. | Safe remediation alert; no secret material. |
| 2 | Authorized test-account owner | Signs in manually and completes normal MFA. | Authenticated browser session. |
| 3 | Authorized test-account owner | Captures new Playwright state with the existing auth-only command. | Private `.asana_auth.json`. |
| 4 | Recovery guard | Opens the supplied state headlessly, verifies authenticated UI, and encrypts it. | Private AES-GCM envelope. |
| 5 | Secret-management owner | Replaces the protected CI session secret through the approved administrative process. | Updated secret at rest. |
| 6 | CI monitor | Manually reruns session-health check on protected `main`. | Pass/fail confirmation. |

## Prerequisites

Install the package dependencies and the Playwright Chromium binary on the secure workstation that will perform the approved local recovery.

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
```

The workstation must have access to the dedicated test organization and use a dedicated test account. Do not perform this process in a shared shell, on a public runner, or in a workstation directory synchronized to a consumer cloud drive.

## 1. Capture a fresh, approved session manually

Run the existing capture command. Complete the normal password, SSO, and MFA process yourself in the visible browser, then press Enter in the terminal only after the target workspace is open.

```bash
python asana_guide_generator.py --record-auth --auth-only --headed
```

This step creates `.asana_auth.json`. Confirm its file permissions are private before continuing:

```bash
stat -c '%a %n' .asana_auth.json
```

The expected permission mode is `600`.

## 2. Obtain an encryption key through the approved secret manager

The tool requires a base64-encoded **32-byte AES key** in `SESSION_STATE_ENCRYPTION_KEY`. The key must be held separately from the sealed session envelope. In production, request a key from the organization’s KMS or secret manager. The following command is suitable only for a local test of the tooling; do not paste its output into tickets, source control, or chat.

```bash
export SESSION_STATE_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

## 3. Validate headlessly and encrypt the replacement state

The command below opens a headless Chromium context using the fresh state, navigates to the expected workspace, rejects any sign-in/SSO redirect, verifies the authenticated Create control, and only then produces `asana_session.sealed.json` with AES-256-GCM authenticated encryption.

```bash
python session_state_recovery.py seal \
  --state .asana_auth.json \
  --workspace-url https://app.asana.com/0/home \
  --output asana_session.sealed.json
```

Use `--headed` only to debug an unexpected validation failure. It displays the browser but does not enable login automation. Do not use `--skip-browser-validation` for a real CI replacement state; that switch exists only for offline cryptographic tests.

## 4. Handoff to protected CI storage

The existing GitHub Actions workflows currently read a base64 storage-state secret (`ASANA_STORAGE_STATE_B64`). GitHub environment secrets are encrypted at rest; therefore, the recommended handoff is to have an approved secret-management owner decrypt the sealed envelope in a controlled environment and replace the environment secret there. Do **not** upload the sealed envelope as an Actions artifact or commit it to the repository.

A controlled local handoff can decrypt only to a private temporary path:

```bash
python session_state_recovery.py unseal \
  --input asana_session.sealed.json \
  --output .asana_auth.recovered.json

base64 -w 0 .asana_auth.recovered.json | \
  gh secret set --env asana-e2e ASANA_STORAGE_STATE_B64

base64 -w 0 .asana_auth.recovered.json | \
  gh secret set --env asana-e2e-monitor ASANA_STORAGE_STATE_B64
```

Only use the `gh secret set` commands from an administrator-approved workstation and account with authority to manage the protected environment. GitHub supports environment-scoped secrets and its CLI can set them from standard input.[1] After replacing the secret, delete the unsealed state and all transient outputs:

```bash
rm -f .asana_auth.json .asana_auth.recovered.json asana_session.sealed.json
unset SESSION_STATE_ENCRYPTION_KEY
```

## 5. Confirm recovery

Run **Asana session health** manually from protected `main`. The `session-setup` project must pass before full onboarding tests run. Do not close the renewal issue until this check is green.

## Failure guide

| Failure | Meaning | Action |
|---|---|---|
| “redirected to an authentication page” | Captured state is expired, not for the expected tenant, or blocked by conditional access. | Repeat manual sign-in and capture; do not add automated login. |
| “expected authenticated workspace UI” | The account lacks access, UI selector changed, or workspace URL is wrong. | Verify dedicated-account role and URL; then update the stable selector if the UI changed. |
| “could not be authenticated” when unsealing | Incorrect key or altered envelope. | Retrieve the correct key from the approved secret manager; do not weaken integrity checks. |
| GitHub health test still fails | Wrong environment secret, secret did not update, or IdP rejects the runner session. | Confirm environment name and secret replacement; then ask the identity team about CI/device policy. |

## References

[1]: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions "GitHub Docs — Using secrets in GitHub Actions"
[2]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Docs — Secure use reference"

---

**Prepared by Manus AI.**
