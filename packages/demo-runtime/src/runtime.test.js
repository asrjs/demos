import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSpeechModelLoadOptions } from '@asrjs/speech-recognition';
import { buildDemoModelLoadRequest, createDemoHubLoader, getDemoModelCacheKey } from './model-loader.js';
import { MODEL_OPTIONS } from './model-catalog.js';
import { resolveDemoAppLinks } from './suite-navigation.js';

test('shared requests preserve the public catalog contract for every listed model', () => {
  for (const { key: modelId } of MODEL_OPTIONS) {
    const options = { modelId, backend: 'wasm', revision: 'main' };
    let expected;
    try { expected = buildSpeechModelLoadOptions(options); }
    catch (error) {
      assert.throws(() => buildDemoModelLoadRequest(options), { message: error.message });
      continue;
    }
    assert.deepEqual(buildDemoModelLoadRequest(options), expected);
  }
});

test('cache keys distinguish configuration, normalize key order, and ignore callbacks', () => {
  const a = { source: { repoId: 'model', revision: 'main' }, backend: 'wasm' };
  assert.equal(getDemoModelCacheKey(a), getDemoModelCacheKey({ backend: 'wasm', source: { revision: 'main', repoId: 'model' }, onProgress() {} }));
  for (const change of [{ backend: 'webgpu' }, { source: { repoId: 'model', revision: 'v2' } }, { encoderQuant: 'int8' }, { preprocessor: 'onnx' }]) {
    assert.notEqual(getDemoModelCacheKey(a), getDemoModelCacheKey({ ...a, ...change }));
  }
});

test('loader serializes requests, preserves progress ownership and evicts cached models', async () => {
  const loaded = new Map(); const events = []; let active = 0; let disposed = false;
  const loader = createDemoHubLoader({ createPipeline: ({ hooks }) => ({
    listLoadedModels: () => [...loaded.keys()],
    async loadModel(request) {
      assert.equal(active++, 0);
      await new Promise(resolve => setTimeout(resolve, 5));
      hooks.onProgress(request.backend);
      request.onProgress?.(request.backend);
      active--;
      const handle = { model: { info: { backend: request.backend } } };
      loaded.set(request.cacheKey, handle); return handle;
    },
    async disposeModel(key) { loaded.delete(key); },
    async dispose() { assert.equal(active, 0); disposed = true; },
  }) });
  const options = { modelId: MODEL_OPTIONS[0].key, backend: 'wasm' };
  const [first, second] = await Promise.all([
    loader.loadModel({ ...options, onProgress: event => events.push(['first', event]) }),
    loader.loadModel({ ...options, onProgress: event => events.push(['second', event]) }),
  ]);
  assert.equal(first.fromCache, false); assert.equal(second.fromCache, true);
  assert.deepEqual(events.map(([owner]) => owner), ['first', 'second']);
  await first.model.evict(); assert.equal(loaded.size, 0);
  await loader.dispose(); assert.equal(disposed, true);
  await assert.rejects(loader.loadModel(options), /disposed/);
});

test('a failed request does not poison subsequent model loads', async () => {
  let calls = 0;
  const loader = createDemoHubLoader({ createPipeline: () => ({
    listLoadedModels: () => [],
    async loadModel() { if (++calls === 1) throw new Error('download failed'); return { model: { info: {} } }; },
    async dispose() {},
  }) });
  const options = { modelId: MODEL_OPTIONS[0].key };
  await assert.rejects(loader.loadModel(options), /download failed/);
  await loader.loadModel(options);
  await loader.dispose();
});

test('navigation supports nested suite deployment and honest standalone links', () => {
  assert.deepEqual(resolveDemoAppLinks(), {});
  const links = resolveDemoAppLinks({ suiteBase: '/speech/demos/' });
  assert.equal(links.home, '/speech/demos/');
  assert.equal(links.realtime, '/speech/demos/realtime/');
  const dev = resolveDemoAppLinks({ development: true, origin: 'http://127.0.0.1:5173' });
  assert.equal(dev.realtime, 'http://127.0.0.1:3000/');
  assert.equal(dev.showcase, 'http://127.0.0.1:5173/');
});
