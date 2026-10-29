from html.parser import HTMLParser
from pathlib import Path
import re

source = Path('dashboard/playwright-shard-dashboard.html').read_text(encoding='utf-8')
assert '<title>Playwright Shard Observatory</title>' in source
assert 'schemaVersion' in source
assert 'Import real workflow metrics' in source
assert 'Local-only processing' in source
assert 'fetch(' not in source
assert 'XMLHttpRequest' not in source

match = re.search(r'<script>(.*?)</script>', source, flags=re.S)
assert match, 'Inline JavaScript was not found.'
Path('/tmp/playwright-shard-dashboard.js').write_text(match.group(1), encoding='utf-8')
print('Dashboard HTML structure validated; extracted inline JavaScript for Node syntax check.')
