import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpaceReadme, stripCoiServiceWorker } from './export-hf-space.mjs';

test('removes the coi-serviceworker script tag and keeps everything else', () => {
  const html = [
    '<head>',
    '    <script src="./coi-serviceworker.js"></script>',
    '    <script type="module" src="/showcase/assets/index.js"></script>',
    '</head>',
  ].join('\n');
  const stripped = stripCoiServiceWorker(html);
  assert.ok(!stripped.includes('coi-serviceworker'));
  assert.ok(stripped.includes('/showcase/assets/index.js'));
});

test('leaves pages without the service worker unchanged', () => {
  const html = '<head><script src="suite.js"></script></head>';
  assert.equal(stripCoiServiceWorker(html), html);
});

test('Space README declares a static app with cross-origin isolation headers', () => {
  const readme = createSpaceReadme({ commit: 'abc1234', branch: 'main', sdkVersion: '0.3.0' });
  assert.match(readme, /^---\n/);
  assert.match(readme, /\nsdk: static\n/);
  assert.match(readme, /\napp_file: index\.html\n/);
  assert.match(readme, /cross-origin-embedder-policy: require-corp/);
  assert.match(readme, /cross-origin-opener-policy: same-origin/);
  assert.match(readme, /abc1234/);
});
