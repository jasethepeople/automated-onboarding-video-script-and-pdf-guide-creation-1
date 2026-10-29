# Retry Logic for Flaky Playwright Session States

The scheduled session-health workflow now uses `scripts/run-session-health-with-retry.sh` instead of a single Playwright invocation. It allows a small number of retries for failures that may result from browser startup, temporary network, or SaaS rendering transience, while **not retrying a confirmed authentication redirect**. This keeps the automation responsive to genuine expiration without creating avoidable renewal alerts for one-off infrastructure noise.

> Retrying does not refresh authentication. It only repeats the safe, read-only health check using the same injected state file. The script never creates SaaS data, enters credentials, or attempts MFA.

## Default policy

| Setting | Default | Purpose |
|---|---:|---|
| `SESSION_HEALTH_MAX_ATTEMPTS` | `3` | One initial check plus at most two retries. |
| `SESSION_HEALTH_BASE_DELAY_SECONDS` | `15` | Delay before retry 1. |
| `SESSION_HEALTH_MAX_DELAY_SECONDS` | `60` | Upper bound for exponential backoff. |
| Retry delays | `15s`, `30s` | Gives transient browser or network state time to settle. |
| Alert threshold | Immediate for confirmed expiry; otherwise after attempt 3 | Avoids a false-positive alert while preserving fail-closed behavior. |

The workflow exposes the settings at job level, so a dedicated test organization can tune retry behavior without changing the helper:

```yaml
env:
  SESSION_HEALTH_MAX_ATTEMPTS: '3'
  SESSION_HEALTH_BASE_DELAY_SECONDS: '15'
  SESSION_HEALTH_MAX_DELAY_SECONDS: '60'
```

Keep the retry budget small. A session state cannot become valid by repeated attempts if the IdP has expired or rejected it; large retry counts only delay the renewal alert and consume CI capacity.

## Failure classification

| Classification | Trigger | Retry? | Result |
|---|---|---:|---|
| `healthy` | Session setup passes. | Not needed. | Workflow succeeds; no issue is opened. |
| `confirmed-expired` | Session setup sees a login/SSO redirect and reports expired or rejected state. | **No.** | Workflow fails immediately and opens/updates the renewal issue. |
| `configuration-error` | Session file is absent, empty, malformed, or unavailable. | **No.** | Workflow fails immediately and opens/updates the intervention issue. |
| `unverified-after-retries` | A non-authentication error continues through the final attempt. | Yes, up to the configured budget. | Workflow fails and opens/updates the intervention issue with retry count. |

The retry helper writes the classification and completed attempt count through `GITHUB_OUTPUT`. The renewal issue includes both fields, helping the operator distinguish a confirmed session expiry from an infrastructure or selector investigation.

## How the GitHub Actions integration works

The monitor job runs this retry-aware step:

```yaml
- name: Run session health with bounded retry
  id: session_health
  run: bash scripts/run-session-health-with-retry.sh
```

The subsequent alert step runs only after this step has failed. It includes values captured from the retry helper:

```yaml
- **Classification:** ${{ steps.session_health.outputs.classification || 'bootstrap-or-secret-error' }}
- **Attempts:** ${{ steps.session_health.outputs.attempts || '0' }}
```

When a transient failure clears on retry, the health job succeeds and the failure-only alert/diagnostic steps do not run. When a state is confirmed expired, the script stops after the first attempt, preserving a clear signal that an approved manual renewal is required.

GitHub Actions supports job-level environment values and failure-conditioned steps in workflow syntax.[1] The retry implementation also preserves the monitor’s restricted environment secret and its credential-cleanup step.

## Diagnostics and tuning

Each attempt writes a separate folder below `test-results/session-health-retries/`, plus a secret-free `summary.txt`. Failure-only artifact upload retains this directory for seven days. The stored output can show whether a problem was a one-off first-attempt failure or a repeated failure; it must not include `.asana_auth.json`, cookie state, headers, or secret-derived strings.

| Pattern observed | Suggested action |
|---|---|
| Frequent first-attempt failures followed by second-attempt success | Increase base delay modestly, check runner/browser startup stability, and review SaaS latency. |
| Immediate `confirmed-expired` failures | Renew the dedicated test account state through the manual MFA runbook. Do not add authentication automation. |
| `configuration-error` | Correct secret materialization, environment scope, or JSON input before rerunning. |
| Repeated `unverified-after-retries` | Investigate network policy, browser dependencies, target availability, or stable UI selectors. |

## Local retry tests

The suite includes `test_session_health_retry.sh`, which replaces `npx` with a deterministic local simulator. It validates these cases without a live browser or SaaS account:

```bash
bash test_session_health_retry.sh
```

The test proves that a transient first failure succeeds on its second attempt, a confirmed expiry fails after one attempt, and a persistent transient failure stops exactly at the configured limit.

## References

[1]: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions "GitHub Docs — Workflow syntax for GitHub Actions"
[2]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Docs — Secure use reference"

---

**Prepared by Manus AI.**
