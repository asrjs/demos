import argparse
import datetime
import hashlib
import json
import re
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--version', required=True)
parser.add_argument('--output-root', type=Path, required=True)
args = parser.parse_args()
assert re.fullmatch(r'v\d+', args.version)
package = json.loads((Path('vendor') / f'asrjs-speech-recognition-0.2.0-model-audit-20261024-{args.version}.provenance.json').read_text())
target = args.output_root / f'served-{args.version}-provenance.json'
assert args.output_root.is_dir() and not target.exists()
cases = {}
base = 'http://127.0.0.1:4190'
for app in ('showcase', 'realtime', 'playground', 'benchmark'):
    manifest = json.loads((Path('apps') / app / 'package.json').read_text())
    assert package['package'] in manifest['dependencies']['@asrjs/speech-recognition']
    html = (Path('dist') / app / 'index.html').read_bytes()
    assert urllib.request.urlopen(f'{base}/{app}/').read() == html
    scripts = {}
    for src in re.findall(r'<script[^>]*src="([^"]+)"', html.decode('utf-8')):
        url = urljoin(f'{base}/{app}/', src)
        parsed = urlsplit(url)
        assert parsed.netloc == '127.0.0.1:4190' and parsed.path.startswith(f'/{app}/')
        content = urllib.request.urlopen(url).read()
        assert content == (Path('dist') / parsed.path.lstrip('/')).read_bytes()
        scripts[src] = hashlib.sha256(content).hexdigest()
    assert scripts
    cases[app] = {'htmlSha256': hashlib.sha256(html).hexdigest(), 'servedHtmlMatches': True, 'entryScripts': scripts}
result = {'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'package': package['package'],
          'packageSha256': package['packageSha256'], 'servedAppHashes': cases,
          'scope': 'served HTML and entry-script hashes matched disk; four app dependency pins verified'}
target.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'version': args.version, 'servedAppsVerified': len(cases)}))
