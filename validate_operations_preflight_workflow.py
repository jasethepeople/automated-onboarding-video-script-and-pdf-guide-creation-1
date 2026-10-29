from pathlib import Path
import yaml

workflow = yaml.safe_load(Path('.github/workflows/operations-preflight.yml').read_text(encoding='utf-8'))
assert workflow['name'] == 'Playwright onboarding operations preflight'
assert 'schedule' in workflow[True]
assert 'workflow_dispatch' in workflow[True]
assert workflow['permissions']['contents'] == 'read'
job = workflow['jobs']['preflight']
assert job['env']['PLAYWRIGHT_PRUNE_METRICS_DAYS'] == "${{ vars.PLAYWRIGHT_PRUNE_METRICS_DAYS || '90' }}"
assert 'SLACK_PRUNE_WEBHOOK_CONFIGURED' in job['env']
assert 'RESEND_API_KEY_CONFIGURED' in job['env']
steps = {step['name']: step for step in job['steps']}
assert 'Check metrics-history branch availability' in steps
assert 'Run non-destructive operations preflight' in steps
assert 'scripts/operations-preflight.mjs' in steps['Run non-destructive operations preflight']['run']
assert 'Notify optional channels of preflight failure' in steps
notification = steps['Notify optional channels of preflight failure']
assert notification['if'] == 'failure()'
assert notification['continue-on-error'] is True
assert 'scripts/notify-operations.mjs' in notification['run']
print('Operations preflight workflow parsed with read-only checks, credential-presence flags, safe notification, and non-destructive feature safeguards.')
