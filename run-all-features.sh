#!/usr/bin/env bash
# Execute every local code-validation path in the complete onboarding suite.
# This is deliberately offline: it does not perform live SaaS actions, send
# notifications, prune GitHub artifacts, or use real credentials.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
report_file="$root/feature-completeness-report.json"
trap 'rm -f "$report_file"' EXIT

echo '==> Shell syntax and all-features configuration boundary'
bash -n scripts/configure-all-features.sh
bash -n scripts/run-all-features.sh
bash test_configure_all_features.sh
bash test_session_health_retry.sh

echo '==> JavaScript source and local feature tests'
node --check scripts/operations-preflight.mjs
node --check scripts/notify-artifact-prune.mjs
node --check scripts/notify-operations.mjs
node --check scripts/plan-artifact-prune.mjs
node --check scripts/analyze-shard-trends.mjs
node --check scripts/verify-feature-completeness.mjs
node test_operations_preflight.mjs
node test_operations_notifier.mjs
node test_artifact_prune_notifier.mjs
node test_artifact_prune_planner.mjs
node test_dashboard_metrics_exporter.mjs
node test_shard_trend_analysis.mjs
node test_trend_summary_rendering.mjs
npm run verify:features

echo '==> Python guide, recovery, dashboard, and workflow validators'
python3 smoke_test.py
python3 test_session_state_recovery.py
python3 validate_dashboard.py
python3 validate_github_workflow.py
python3 validate_session_health_workflow.py
python3 validate_artifact_prune_workflow.py
python3 validate_operations_preflight_workflow.py

echo '==> Playwright TypeScript and project discovery'
npm run test:onboarding:validate

echo 'All coded suite features passed local validation.'
