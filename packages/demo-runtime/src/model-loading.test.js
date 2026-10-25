import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpeechModelDescriptor } from '@asrjs/speech-recognition';
import { MODEL_OPTIONS } from './model-catalog.js';
import { createDemoHubLoader } from './model-loader.js';
import {
  createDemoModelLoadingPolicy, getDemoModelSourceOptions,
  resolveDemoModelSource, getDemoModelLoadingState, loadDemoLocalModel,
  assertDemoModelRuntimeBackend,
} from './model-loading.js';

const qwenFiles = ['audio-encoder-dynamic.onnx', 'decoder-prefill-fp16.onnx',
  'decoder-step-fp16.onnx', 'decoder-fp16.onnx.data', 'tokenizer/tokenizer.json'];
const entries = qwenFiles.map(path => ({ path, basename: path.split('/').at(-1), size: 1 }));

test('a GPU-only registered export cannot silently run under a WASM request', () => {
  const descriptor = { modelId: 'gpu-export', loading: {
    availableEncoderBackends: ['webgpu'], availableDecoderBackends: ['webgpu'],
  } };
  assert.throws(() => assertDemoModelRuntimeBackend(descriptor, 'wasm'), /does not support wasm/);
  assert.doesNotThrow(() => assertDemoModelRuntimeBackend(descriptor, 'webgpu-hybrid'));
  const hybrid = { modelId: 'hybrid-export', loading: {
    availableEncoderBackends: ['webgpu', 'wasm'], availableDecoderBackends: ['wasm'],
  } };
  assert.doesNotThrow(() => assertDemoModelRuntimeBackend(hybrid, 'webgpu-hybrid'));
  assert.throws(() => assertDemoModelRuntimeBackend(hybrid, 'webgpu-strict'), /does not support webgpu-strict/);
  assert.throws(() => assertDemoModelRuntimeBackend({modelId:'gpu-decoder',loading:{
    availableEncoderBackends:['wasm'],availableDecoderBackends:['webgpu'],
  }}, 'wasm'), /select webgpu\./);
});

test('every registered model resolves only to one of its declared sources', () => {
  for (const { key } of MODEL_OPTIONS) {
    const sources = getDemoModelSourceOptions(key);
    for (const requested of ['huggingface', 'local']) {
      assert.ok(sources.includes(resolveDemoModelSource(key, requested)));
    }
  }
  for (const id of ['qwen3-asr-0.6b', 'Qwen/Qwen3-ASR-0.6B-hf', 'moonshine-tiny']) {
    assert.deepEqual(getDemoModelSourceOptions(id), ['local']);
    assert.equal(resolveDemoModelSource(id, 'huggingface'), 'local');
  }
  assert.equal(resolveDemoModelSource('unregistered'), null);
});

test('new model policy needs registration data, not a family-specific code branch', () => {
  const policy = createDemoModelLoadingPolicy({
    getDescriptor: id => id === 'new-family' ? { loading: {
      supportsHubSource: false, supportsLocalSource: true,
      availableEncoderQuantizations: ['fp32'], availableDecoderQuantizations: ['fp16'],
    } } : null,
    inspectEntries: () => ({ encoderQuantizations: ['fp32'], decoderQuantizations: ['fp16'] }),
    resolveBackends: () => ({ encoderBackend: 'wasm', decoderBackend: 'wasm' }),
  });
  const state = policy.getDemoModelLoadingState({ modelId: 'new-family', source: 'huggingface', entries: [{}] });
  assert.equal(state.source, 'local');
  assert.equal(state.decoderQuant, 'fp16');
});

test('Qwen folder options reflect the registered adapter and requested component backends', async () => {
  const options = { modelId: 'qwen3-asr-0.6b', entries, backend: 'webgpu', decoderQuant: 'int8' };
  const state = getDemoModelLoadingState(options);
  assert.deepEqual(state.encoderQuantOptions, ['fp32']);
  assert.deepEqual(state.decoderQuantOptions, ['fp16']);
  assert.equal(state.decoderQuant, 'fp16');
  assert.equal(state.encoderBackend, 'webgpu');
  assert.equal(state.decoderBackend, 'webgpu');
  const handle = { dispose() {} };
  const loaded = await loadDemoLocalModel(options, { loadModel: async request => {
    assert.equal(request.decoderQuant, 'fp16');
    assert.equal(request.encoderBackend, 'webgpu');
    assert.equal(request.decoderBackend, 'webgpu');
    assert.equal(request.entries, entries);
    return handle;
  } });
  assert.equal(loaded, handle);
  await assert.rejects(loadDemoLocalModel({ ...options, entries: [] }), /folder/);
  await assert.rejects(loadDemoLocalModel({ ...options, entries: [{ path: 'wrong.onnx', basename: 'wrong.onnx' }] }), /compatible/);
});

test('local-only models never reach the Hub pipeline even if called directly', async () => {
  let calls = 0;
  const loader = createDemoHubLoader({ createPipeline: () => ({
    listLoadedModels: () => [],
    async loadModel() { calls++; throw new Error('Unexpected Hub request'); },
    async dispose() {},
  }) });
  try {
    await assert.rejects(loader.loadModel({ modelId: 'qwen3-asr-0.6b' }), /local folder/);
    await assert.rejects(loader.loadModel({ modelId: 'moonshine-tiny' }), /local folder/);
    assert.equal(calls, 0);
  } finally { await loader.dispose(); }
});


test('bundled warmup oracle checks missing expected-text metadata without accepting arbitrary output', async () => {
  const { matchesWarmupResult } = await import('./warmup.js');
  for (const modelId of ['qwen3-asr-0.6b', 'UsefulSensors/moonshine-tiny']) {
    const config = getSpeechModelDescriptor(modelId);
    assert.equal(matchesWarmupResult(config, ['The boy was there when the sun rose.']), true);
    assert.equal(matchesWarmupResult(config, ['some unrelated output']), false);
    assert.equal(matchesWarmupResult(config, ['']), false);
  }
  assert.equal(matchesWarmupResult({warmup:{mode:'expected-text',expectedTexts:['specific oracle']}}, ['The boy was there when the sun rose.']), false);
  assert.equal(matchesWarmupResult({warmup:{mode:'non-empty'}}, ['']), false);
});


test('catalog coverage markers are never sent as decoder language tags', async () => {
  const {getDemoModelLanguageOptions,resolveDemoLanguage} = await import('./model-catalog.js');
  assert.deepEqual(getDemoModelLanguageOptions('qwen3-asr-0.6b'), ['auto']);
  assert.equal(resolveDemoLanguage('auto'), undefined);
  assert.equal(resolveDemoLanguage('multilingual'), undefined);
  assert.equal(resolveDemoLanguage('en'), 'en');
  assert.deepEqual(getDemoModelLanguageOptions('UsefulSensors/moonshine-tiny'), ['en']);
});
