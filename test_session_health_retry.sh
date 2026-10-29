#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
touch "$TMP/state.json"
chmod 600 "$TMP/state.json"

cat > "$TMP/bin/npx" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
counter_file="${FAKE_COUNTER_FILE:?}"
count=0
[[ -f "$counter_file" ]] && count="$(cat "$counter_file")"
count=$((count + 1))
printf '%s' "$count" > "$counter_file"
case "${FAKE_MODE:?}" in
  transient-then-success)
    if [[ "$count" -lt 2 ]]; then
      echo 'temporary browser transport failure' >&2
      exit 1
    fi
    echo 'session health passed'
    ;;
  confirmed-expiry)
    echo 'The approved test session has expired or was rejected' >&2
    exit 1
    ;;
  always-transient)
    echo 'temporary browser transport failure' >&2
    exit 1
    ;;
  *)
    echo "unexpected FAKE_MODE: ${FAKE_MODE}" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$TMP/bin/npx"

run_case() {
  local mode="$1"
  local expected_status="$2"
  local expected_classification="$3"
  local expected_attempts="$4"
  rm -f "$TMP/counter" "$TMP/output"
  set +e
  PATH="$TMP/bin:$PATH" \
  FAKE_MODE="$mode" \
  FAKE_COUNTER_FILE="$TMP/counter" \
  ASANA_STORAGE_STATE="$TMP/state.json" \
  SESSION_HEALTH_RESULTS_DIR="$TMP/results-$mode" \
  SESSION_HEALTH_MAX_ATTEMPTS=3 \
  SESSION_HEALTH_BASE_DELAY_SECONDS=0 \
  SESSION_HEALTH_MAX_DELAY_SECONDS=0 \
  GITHUB_OUTPUT="$TMP/output" \
  bash "$ROOT/scripts/run-session-health-with-retry.sh"
  status=$?
  set -e
  [[ "$status" -eq "$expected_status" ]]
  grep -Fxq "classification=$expected_classification" "$TMP/output"
  grep -Fxq "attempts=$expected_attempts" "$TMP/output"
}

run_case transient-then-success 0 healthy 2
run_case confirmed-expiry 1 confirmed-expired 1
run_case always-transient 1 unverified-after-retries 3

echo 'Session-health retry classifications and bounded attempts validated.'
