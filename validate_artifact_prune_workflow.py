from pathlib import Path
import yaml

workflow = yaml.safe_load(Path('.github/workflows/prune-playwright-artifacts.yml').read_text(encoding='utf-8'))
assert workflow['name'] == 'Prune Playwright performance artifacts'
assert workflow['permissions']['contents'] == 'read'
assert workflow['permissions']['actions'] == 'write'
assert 'schedule' in workflow[True]
assert 'workflow_dispatch' in workflow[True]
job = workflow['jobs']['prune']
assert job['env']['PRUNE_MODE'] == "${{ inputs.mode || 'delete' }}"
steps = {step['name']: step for step in job['steps']}
assert 'Retrieve Actions artifact metadata' in steps
assert 'Build allowlisted deletion manifest' in steps
assert 'scripts/plan-artifact-prune.mjs' in steps['Build allowlisted deletion manifest']['run']
delete = steps['Delete only allowlisted artifact IDs']
assert "env.PRUNE_MODE == 'delete'" in delete['if']
assert "steps.plan.outputs.deletion_permitted == 'true'" in delete['if']
assert 'Upload pruning manifest' in steps
success_notice = steps['Notify optional channels of completed deletion']
assert "env.PRUNE_MODE == 'delete'" in success_notice['if']
assert "steps.plan.outputs.deletion_permitted == 'true'" in success_notice['if']
assert success_notice['continue-on-error'] is True
assert 'SLACK_PRUNE_WEBHOOK_URL' in success_notice['env']
assert 'RESEND_API_KEY' in success_notice['env']
failure_notice = steps['Notify optional channels of pruning failure']
assert failure_notice['if'] == 'failure()'
assert failure_notice['continue-on-error'] is True
assert 'scripts/notify-artifact-prune.mjs' in success_notice['run']
print('Artifact-pruning workflow parsed with allowlist planning, explicit delete gate, safe notifications, and manifest safeguards.')
