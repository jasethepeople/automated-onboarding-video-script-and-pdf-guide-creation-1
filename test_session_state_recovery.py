import base64
import json
import os
from pathlib import Path

from session_state_recovery import key_from_environment, load_state, seal, unseal, write_private_bytes

out = Path('recovery_smoke_output')
out.mkdir(exist_ok=True)
state = out / 'synthetic_state.json'
envelope = out / 'synthetic_state.sealed.json'
recovered = out / 'synthetic_state.recovered.json'

payload = {
    'cookies': [{'name': 'synthetic', 'value': 'test-only', 'domain': 'example.test', 'path': '/'}],
    'origins': []
}
write_private_bytes(state, (json.dumps(payload) + '\n').encode('utf-8'))
os.environ['SESSION_STATE_ENCRYPTION_KEY'] = base64.b64encode(os.urandom(32)).decode('ascii')
_, raw = load_state(state)
sealed = seal(raw, key_from_environment('SESSION_STATE_ENCRYPTION_KEY'))
write_private_bytes(envelope, (json.dumps(sealed) + '\n').encode('utf-8'))
write_private_bytes(recovered, unseal(sealed, key_from_environment('SESSION_STATE_ENCRYPTION_KEY')))

assert json.loads(recovered.read_text(encoding='utf-8')) == payload
assert state.stat().st_mode & 0o777 == 0o600
assert envelope.stat().st_mode & 0o777 == 0o600
assert recovered.stat().st_mode & 0o777 == 0o600
print('Recovery encryption round trip and private file permissions validated.')
