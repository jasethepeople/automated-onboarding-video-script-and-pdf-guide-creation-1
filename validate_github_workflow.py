from pathlib import Path

import yaml

workflow_path = Path('.github/workflows/asana-onboarding-e2e.yml')
workflow = yaml.safe_load(workflow_path.read_text(encoding='utf-8'))
assert workflow['name'] == 'Asana onboarding E2E'
assert 'validate' in workflow['jobs']
assert 'onboarding-e2e' in workflow['jobs']
onboarding = workflow['jobs']['onboarding-e2e']
assert onboarding['needs'] == 'validate'
assert onboarding['environment'] == 'asana-e2e'
assert onboarding['permissions'] if 'permissions' in onboarding else True
assert onboarding['strategy']['matrix']['shardIndex'] == [1, 2]
steps = {step['name']: step for step in onboarding['steps']}
assert steps['Run independent onboarding checks for this shard']['continue-on-error'] is True
assert steps['Export safe dashboard metrics for this shard']['if'] == 'always()'
assert 'scripts/export-shard-metrics.mjs' in steps['Export safe dashboard metrics for this shard']['run']
assert steps['Upload dashboard metrics shard artifact']['if'] == 'always()'
merge_steps = {step['name']: step for step in workflow['jobs']['merge-reports']['steps']}
assert 'Download dashboard metrics shard artifacts' in merge_steps
assert 'scripts/merge-shard-metrics.mjs' in merge_steps['Merge safe dashboard metrics']['run']
assert 'Upload dashboard metrics collection' in merge_steps
assert workflow['jobs']['merge-reports']['permissions']['contents'] == 'write'
assert workflow['jobs']['merge-reports']['permissions']['issues'] == 'write'
trend_env = workflow['jobs']['merge-reports']['env']
assert 'PLAYWRIGHT_TREND_DURATION_RATIO' in trend_env
assert 'PLAYWRIGHT_TREND_IMBALANCE_CEILING' in trend_env
assert 'Retrieve bounded metrics history' in merge_steps
assert 'scripts/analyze-shard-trends.mjs' in merge_steps['Analyze multi-run shard trends']['run']
assert 'Publish safe metrics history branch' in merge_steps
assert 'scripts/render-trend-summary.mjs' in merge_steps['Write trend summary with historical charts']['run']
assert '--history' in merge_steps['Write trend summary with historical charts']['run']
assert merge_steps['Open or update performance-regression issue']['if'] == "steps.trend_analysis.outputs.regression == 'true'"
assert 'Upload trend analysis artifacts' in merge_steps
assert 'Notify optional channels of performance regression' in merge_steps
regression_notification = merge_steps['Notify optional channels of performance regression']
assert regression_notification['if'] == "steps.trend_analysis.outputs.regression == 'true'"
assert regression_notification['continue-on-error'] is True
assert 'scripts/notify-operations.mjs' in regression_notification['run']
assert 'Notify optional channels of E2E failure' in merge_steps
failure_notification = merge_steps['Notify optional channels of E2E failure']
assert 'needs.onboarding-e2e.result != \'success\'' in failure_notification['if']
assert failure_notification['continue-on-error'] is True
assert 'scripts/notify-operations.mjs' in failure_notification['run']
print('GitHub Actions workflow parsed with sharded metrics, trend analysis, regression issues, and unified notification safeguards.')
