import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAsrDemoViteConfig } from './vite.shared.js';

function createTempLayout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asrjs-demo-vite-'));
  const appDir = path.join(root, 'apps', 'realtime');
  const libraryRoot = path.join(root, 'node_modules', '@asrjs', 'speech-recognition');
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(path.join(libraryRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'package.json'), '{}');
  fs.writeFileSync(
    path.join(libraryRoot, 'package.json'),
    JSON.stringify({
      name: '@asrjs/speech-recognition',
      version: '9.8.7',
      main: './dist/index.js',
    }),
  );
  fs.writeFileSync(path.join(libraryRoot, 'dist', 'index.js'), '');
  return { root, appDir, libraryRoot };
}

test('package mode resolves installed package metadata without source aliases or sibling access', (t) => {
  const { root, appDir, libraryRoot } = createTempLayout();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const config = createAsrDemoViteConfig(appDir, {
    env: { ASRJS_SOURCE: 'package', ASRJS_LIB_DIR: path.join(root, 'sibling-source'), ASRJS_SUITE_BASE: '/nested/' },
  });
  assert.equal(config.define.__ASRJS_VERSION__, '"9.8.7"');
  assert.equal(config.define.__ASRJS_SOURCE__, '"npm-package"');
  assert.equal(config.define.__ASRJS_SUITE_BASE__, '"/nested/"');
  assert.equal(config.server.strictPort, true);
  assert.ok(config.resolve.alias.some(({ find }) => find.test('@asrjs/demo-runtime')));
  assert.equal(config.resolve.alias.some(({ find }) => String(find).includes('speech-recognition')), false);
  assert.equal(config.server.fs.allow.includes(libraryRoot), false);
  assert.equal(config.server.fs.allow.some((entry) => entry.startsWith(root)), true);
});

test('source mode aliases the requested source tree and reports uncommitted provenance', (t) => {
  const { root, appDir, libraryRoot } = createTempLayout();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(libraryRoot, 'src'), { recursive: true });

  const config = createAsrDemoViteConfig(appDir, {
    env: { ASRJS_SOURCE: 'source', ASRJS_LIB_DIR: libraryRoot },
  });
  const packageAlias = config.resolve.alias.find(
    ({ find }) => find instanceof RegExp && find.test('@asrjs/speech-recognition'),
  );
  assert.equal(packageAlias.replacement, path.join(libraryRoot, 'src', 'index.ts'));
  assert.equal(config.define.__ASRJS_SOURCE__, '"source-uncommitted"');
  assert.equal(config.server.fs.allow.includes(libraryRoot), true);
});

test('rejects unsupported ASRJS_SOURCE values', () => {
  const { root, appDir } = createTempLayout();
  try {
    assert.throws(
      () => createAsrDemoViteConfig(appDir, { env: { ASRJS_SOURCE: 'auto' }, libraryPackageRoot: root }),
      /ASRJS_SOURCE must be "package" or "source"/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
