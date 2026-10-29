#!/usr/bin/env bash
# Run only Playwright's session-setup project with a small, bounded retry budget.
#
# This helper deliberately does not refresh credentials. It retries only to reduce
# false alerts caused by runner/browser/network transience. A clear login/SSO
# redirect is classified as confirmed expiry and stops immediately.

set -euo pipefail

max_attempts="${SESSION_HEALTH_MAX_ATTEMPTS:-3}"
base_delay_seconds="${SESSION_HEALTH_BASE_DELAY_SECONDS:-15}"
max_delay_seconds="${SESSION_HEALTH_MAX_DELAY_SECONDS:-60}"
state_path="${ASANA_STORAGE_STATE:-}"
results_root="${SESSION_HEALTH_RESULTS_DIR:-test-results/session-health-retries}"
summary_path="${results_root}/summary.txt"

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "SESSION_HEALTH_MAX_ATTEMPTS must be a positive integer." >&2
  exit 2
fi
if ! [[ "$base_delay_seconds" =~ ^[0-9]+$ ]] || ! [[ "$max_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "Retry delay settings must be non-negative integers." >&2
  exit 2
fi
if [[ -z "$state_path" || ! -f "$state_path" ]]; then
  echo "ASANA_STORAGE_STATE is missing or does not point to a readable temporary state file." >&2
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "classification=configuration-error"
      echo "attempts=0"
    } >> "$GITHUB_OUTPUT"
  fi
  exit 2
fi

mkdir -p "$results_root"
chmod 700 "$results_root"
printf 'Session-health retry summary\n' > "$summary_path"
printf 'Maximum attempts: %s\n' "$max_attempts" >> "$summary_path"

record_output() {
  local classification="$1"
  local attempts="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "classification=${classification}"
      echo "attempts=${attempts}"
    } >> "$GITHUB_OUTPUT"
  fi
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo '### Session-health retry result'
      echo
      echo "- **Classification:** ${classification}"
      echo "- **Attempts:** ${attempts}/${max_attempts}"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

for ((attempt=1; attempt<=max_attempts; attempt++)); do
  attempt_dir="${results_root}/attempt-${attempt}"
  attempt_log="${attempt_dir}/playwright.log"
  mkdir -p "$attempt_dir"
  chmod 700 "$attempt_dir"
  printf 'Attempt %s/%s started at %s UTC\n' "$attempt" "$max_attempts" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" | tee -a "$summary_path"

  set +e
  npx playwright test --project=session-setup --output="$attempt_dir" 2>&1 | tee "$attempt_log"
  status="${PIPESTATUS[0]}"
  set -e

  if [[ "$status" -eq 0 ]]; then
    printf 'Attempt %s passed.\n' "$attempt" | tee -a "$summary_path"
    record_output "healthy" "$attempt"
    exit 0
  fi

  # This string is emitted only by our session-health setup test after it sees a
  # sign-in/SSO redirect. Retrying cannot refresh the session, so fail closed.
  if grep -Fq 'Replacement state was redirected to an authentication page' "$attempt_log" || \
     grep -Fq 'The approved test session has expired or was rejected' "$attempt_log"; then
    printf 'Attempt %s confirmed session expiry or rejection; no further retries.\n' "$attempt" | tee -a "$summary_path"
    record_output "confirmed-expired" "$attempt"
    exit 1
  fi

  # Missing state or JSON shape errors are deterministic configuration failures.
  if grep -Eq 'ASANA_STORAGE_STATE is required|ASANA_STORAGE_STATE does not exist|State file is empty|not valid JSON' "$attempt_log"; then
    printf 'Attempt %s found a deterministic state configuration error; no further retries.\n' "$attempt" | tee -a "$summary_path"
    record_output "configuration-error" "$attempt"
    exit 1
  fi

  if [[ "$attempt" -eq "$max_attempts" ]]; then
    printf 'Attempt %s failed; retry budget exhausted.\n' "$attempt" | tee -a "$summary_path"
    record_output "unverified-after-retries" "$attempt"
    exit 1
  fi

  delay=$(( base_delay_seconds * (2 ** (attempt - 1)) ))
  if (( delay > max_delay_seconds )); then
    delay="$max_delay_seconds"
  fi
  printf 'Attempt %s failed without confirmed expiry; retrying after %s seconds.\n' "$attempt" "$delay" | tee -a "$summary_path"
  sleep "$delay"
done
