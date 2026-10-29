#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
# Offline stub: dry-run mode should only call auth status.
if [[ "$1" == 'auth' && "$2" == 'status' ]]; then exit 0; fi
echo "Unexpected GitHub CLI call in dry-run: $*" >&2
exit 1
GH
chmod +x "$tmp/bin/gh"
printf '%s' '{"cookies":[],"origins":[]}' > "$tmp/session.json"
printf '%s' 'https://hooks.slack.com/services/hidden' > "$tmp/slack.txt"
printf '%s' 're_hidden' > "$tmp/resend.txt"
output=$(PATH="$tmp/bin:$PATH" bash "$root/scripts/configure-all-features.sh" \
  --repo example/onboarding-suite \
  --session-state "$tmp/session.json" \
  --workspace-url https://app.asana.com/0/test \
  --project-prefix 'E2E Onboarding' \
  --slack-webhook-file "$tmp/slack.txt" \
  --resend-key-file "$tmp/resend.txt" \
  --email-from 'CI <ci@example.test>' \
  --email-to 'ops@example.test')
[[ "$output" == *'asana-e2e secret: ASANA_STORAGE_STATE_B64 (value hidden)'* ]]
[[ "$output" == *'asana-e2e-monitor variable: ASANA_TEST_WORKSPACE_URL'* ]]
[[ "$output" == *'repository secret: SLACK_PRUNE_WEBHOOK_URL (value hidden)'* ]]
[[ "$output" == *'repository secret: RESEND_API_KEY (value hidden)'* ]]
[[ "$output" == *'Dry run only.'* ]]
[[ "$output" != *'hooks.slack.com'* ]]
[[ "$output" != *'re_hidden'* ]]
if PATH="$tmp/bin:$PATH" bash "$root/scripts/configure-all-features.sh" --repo example/repo --session-state "$tmp/session.json" --workspace-url https://app.asana.com/0/test --project-prefix test --email-from sender@example.test >/dev/null 2>&1; then
  echo 'Expected partial email configuration to be rejected.' >&2
  exit 1
fi
echo 'Single all-features setup command dry-run and secret-boundary safeguards validated.'
