from pathlib import Path

import yaml

workflow_path = Path('.github/workflows/asana-session-health.yml')
workflow = yaml.safe_load(workflow_path.read_text(encoding='utf-8'))
job = workflow['jobs']['check-session']
assert workflow['name'] == 'Asana session health'
assert job['environment'] == 'asana-e2e-monitor'
assert job['permissions'] if 'permissions' in job else True
assert workflow['permissions']['issues'] == 'write'
assert job['if'] == "github.ref == 'refs/heads/main'"
steps = {step['name']: step for step in job['steps']}
assert 'Run session health with bounded retry' in steps
assert steps['Run session health with bounded retry']['id'] == 'session_health'
assert steps['Run session health with bounded retry']['run'] == 'bash scripts/run-session-health-with-retry.sh'
assert 'Open or update an expiry remediation issue' in steps
assert steps['Open or update an expiry remediation issue']['if'] == 'failure()'
assert 'Remove temporary browser session' in steps
assert steps['Remove temporary browser session']['if'] == 'always()'
assert 'Notify optional channels of session-health failure' in steps
notification = steps['Notify optional channels of session-health failure']
assert notification['if'] == 'failure()'
assert notification['continue-on-error'] is True
assert 'scripts/notify-operations.mjs' in notification['run']
assert 'SLACK_PRUNE_WEBHOOK_URL' in notification['env']
assert 'RESEND_API_KEY' in notification['env']
print('Scheduled session-health workflow parsed with retry, remediation, safe notification, and cleanup safeguards.')
