#!/usr/bin/env bash
# Configure the full Playwright onboarding operations suite in one repository.
# Defaults to a dry run. Use --apply only after reviewing the printed plan.
# Sensitive values are accepted only as files and are streamed to GitHub CLI stdin.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/configure-all-features.sh \
    --repo OWNER/REPOSITORY \
    --session-state FILE \
    --workspace-url URL \
    --project-prefix PREFIX \
    [--slack-webhook-file FILE] \
    [--resend-key-file FILE --email-from SENDER --email-to RECIPIENTS] \
    [--apply]

What one --apply run configures:
  - asana-e2e and asana-e2e-monitor protected environments
  - ASANA_STORAGE_STATE_B64 in both environments from the supplied state file
  - workspace/prefix variables for the E2E environment
  - all trend and artifact-pruning policy variables
  - optional Slack and Resend notification credentials when their files/options are supplied

The command is dry-run by default. It never prints secret or browser-state values.
USAGE
}

repo=''
session_state=''
workspace_url=''
project_prefix=''
slack_webhook_file=''
resend_key_file=''
email_from=''
email_to=''
apply=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo=${2:?Missing value for --repo}; shift 2 ;;
    --session-state) session_state=${2:?Missing value for --session-state}; shift 2 ;;
    --workspace-url) workspace_url=${2:?Missing value for --workspace-url}; shift 2 ;;
    --project-prefix) project_prefix=${2:?Missing value for --project-prefix}; shift 2 ;;
    --slack-webhook-file) slack_webhook_file=${2:?Missing value for --slack-webhook-file}; shift 2 ;;
    --resend-key-file) resend_key_file=${2:?Missing value for --resend-key-file}; shift 2 ;;
    --email-from) email_from=${2:?Missing value for --email-from}; shift 2 ;;
    --email-to) email_to=${2:?Missing value for --email-to}; shift 2 ;;
    --apply) apply=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for required in repo session_state workspace_url project_prefix; do
  if [[ -z ${!required} ]]; then
    echo "Missing required option: --${required//_/-}" >&2
    usage >&2
    exit 2
  fi
done
[[ -f "$session_state" ]] || { echo "Session-state file not found." >&2; exit 2; }
[[ -z "$slack_webhook_file" || -f "$slack_webhook_file" ]] || { echo "Slack webhook file not found." >&2; exit 2; }
[[ -z "$resend_key_file" || -f "$resend_key_file" ]] || { echo "Resend key file not found." >&2; exit 2; }

if [[ -n "$resend_key_file" || -n "$email_from" || -n "$email_to" ]]; then
  if [[ -z "$resend_key_file" || -z "$email_from" || -z "$email_to" ]]; then
    echo "Resend email requires --resend-key-file, --email-from, and --email-to together." >&2
    exit 2
  fi
fi

command -v gh >/dev/null || { echo "GitHub CLI is required." >&2; exit 2; }
gh auth status >/dev/null || { echo "Authenticate GitHub CLI before running this command." >&2; exit 2; }

note() { printf '%s\n' "$*"; }
set_environment() {
  local environment=$1
  note "  • Ensure protected environment: ${environment}"
  if $apply; then gh api --method PUT "repos/${repo}/environments/${environment}" >/dev/null; fi
}
set_environment_secret_from_file() {
  local environment=$1 name=$2 file=$3
  note "  • Set ${environment} secret: ${name} (value hidden)"
  if $apply; then base64 -w0 "$file" | gh secret set "$name" --repo "$repo" --env "$environment"; fi
}
set_environment_variable() {
  local environment=$1 name=$2 value=$3
  note "  • Set ${environment} variable: ${name}"
  if $apply; then gh variable set "$name" --repo "$repo" --env "$environment" --body "$value"; fi
}
set_repository_variable() {
  local name=$1 value=$2
  note "  • Set repository variable: ${name}=${value}"
  if $apply; then gh variable set "$name" --repo "$repo" --body "$value"; fi
}
set_repository_secret_from_file() {
  local name=$1 file=$2
  note "  • Set repository secret: ${name} (value hidden)"
  if $apply; then cat "$file" | gh secret set "$name" --repo "$repo"; fi
}

note "All-features configuration plan for ${repo}:"
set_environment asana-e2e
set_environment asana-e2e-monitor
set_environment_secret_from_file asana-e2e ASANA_STORAGE_STATE_B64 "$session_state"
set_environment_secret_from_file asana-e2e-monitor ASANA_STORAGE_STATE_B64 "$session_state"
set_environment_variable asana-e2e ASANA_TEST_WORKSPACE_URL "$workspace_url"
set_environment_variable asana-e2e ASANA_TEST_PROJECT_PREFIX "$project_prefix"
set_environment_variable asana-e2e-monitor ASANA_TEST_WORKSPACE_URL "$workspace_url"

# Trend analysis defaults (all can be adjusted later without workflow edits).
set_repository_variable PLAYWRIGHT_TREND_BASELINE_SIZE 10
set_repository_variable PLAYWRIGHT_TREND_MINIMUM_BASELINE 5
set_repository_variable PLAYWRIGHT_TREND_RETENTION 60
set_repository_variable PLAYWRIGHT_TREND_DURATION_RATIO 0.20
set_repository_variable PLAYWRIGHT_TREND_DURATION_SECONDS 30
set_repository_variable PLAYWRIGHT_TREND_IMBALANCE_INCREASE 0.15
set_repository_variable PLAYWRIGHT_TREND_IMBALANCE_CEILING 0.35
set_repository_variable PLAYWRIGHT_TREND_RETRY_INCREASE 2

# Artifact lifecycle defaults.
set_repository_variable PLAYWRIGHT_PRUNE_METRICS_DAYS 90
set_repository_variable PLAYWRIGHT_PRUNE_REPORT_DAYS 30
set_repository_variable PLAYWRIGHT_PRUNE_DIAGNOSTIC_DAYS 14
set_repository_variable PLAYWRIGHT_PRUNE_MAX_DELETIONS 100

if [[ -n "$slack_webhook_file" ]]; then
  set_repository_secret_from_file SLACK_PRUNE_WEBHOOK_URL "$slack_webhook_file"
else
  note '  • Slack notification: skipped (no --slack-webhook-file supplied)'
fi
if [[ -n "$resend_key_file" ]]; then
  set_repository_secret_from_file RESEND_API_KEY "$resend_key_file"
  set_repository_variable PRUNE_NOTIFICATION_EMAIL_FROM "$email_from"
  set_repository_variable PRUNE_NOTIFICATION_EMAIL_TO "$email_to"
else
  note '  • Email notification: skipped (no complete Resend configuration supplied)'
fi

if $apply; then
  note
  note 'Applied. Next: run “Playwright onboarding operations preflight” from the Actions tab.'
  note 'Repository branch protection and GitHub Actions token write policy remain organization decisions and are intentionally not changed by this script.'
else
  note
  note 'Dry run only. Re-run with --apply after reviewing this plan; no repository configuration was changed.'
fi
