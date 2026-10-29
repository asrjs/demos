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
  for (const id of ['nvidia/canary-1b', 'nvidia/canary-1b-v2', 'UsefulSensors/moonshine-tiny']) {
    assert.deepEqual(getDemoModelSourceOptions(id), ['local']);
    assert.equal(resolveDemoModelSource(id, 'huggingface'), 'local');
  }
  const qwen = getSpeechModelDescriptor('Qwen/Qwen3-ASR-0.6B-hf');
  assert.deepEqual(getDemoModelSourceOptions(qwen.modelId), ['huggingface', 'local']);
  assert.equal(qwen.loading.repoId, 'ysdede/qwen3-asr-0.6b-onnx');
  assert.equal(qwen.loading.defaultRevision, 'ac0bedcc0f1614c0b3982940c14bdb169ff2365d');
  const moonshine = getSpeechModelDescriptor('moonshine-ai/moonshine-streaming-tiny');
  assert.deepEqual(getDemoModelSourceOptions(moonshine.modelId), ['huggingface', 'local']);
  assert.equal(moonshine.loading.repoId, 'ysdede/moonshine-streaming-tiny-onnx');
  assert.equal(moonshine.loading.defaultRevision, 'cb347a0760c2d7d6cf9083eb770376ba108e5b31');
  assert.equal(resolveDemoModelSource('unregistered'), null);
});

test('new model policy needs registration data, not a family-specific code branch', () => {
  const policy = createDemoModelLoadingPolicy({
    getDescriptor: id => id === 'new-family' ? { loading: {
      supportsHubSource: false, supportsLocalSource: true,
      availableEncoderQuantizations: ['fp32'], availableDecoderQuantizations: ['fp16'],
    } } : null,
    inspectEntries: () => ({ encoderQuantizations: ['fp32'], decoderQuantizations: ['fp16'] }),
    resolveExecutionPlan: () => ({
      encoderBackend: 'wasm', decoderBackend: 'wasm',
      encoderQuant: 'fp32', decoderQuant: 'fp16', status: 'unverified',
    }),
  });
  const state = policy.getDemoModelLoadingState({ modelId: 'new-family', source: 'huggingface', entries: [{}] });
  assert.equal(state.source, 'local');
  assert.equal(state.decoderQuant, 'fp16');
});

test('shared loading policy delegates automatic component backend and precision selection to the library manifest', () => {
  const policy = createDemoModelLoadingPolicy({
    getDescriptor: () => ({ modelId: 'parakeet-tdt-0.6b-v3', loading: {
      supportsHubSource: true, supportsLocalSource: true,
      availableEncoderQuantizations: ['fp16'], availableDecoderQuantizations: ['int8'],
      defaultEncoderQuantization: 'fp32', defaultDecoderQuantization: 'fp32',
    } }),
    inspectEntries: () => ({ encoderQuantizations: ['fp16'], decoderQuantizations: ['int8'] }),
    getRuntime: () => ({ webgpu: true, wasm: true }),
    resolveExecutionPlan: (modelId, input) => {
      assert.equal(modelId, 'parakeet-tdt-0.6b-v3');
      assert.deepEqual(input.runtime, { webgpu: true, wasm: true });
      return {
        manifestVersion: '1', status: 'unverified',
        encoderBackend: 'webgpu', decoderBackend: 'wasm',
        encoderQuant: 'fp16', decoderQuant: 'int8',
      };
    },
  });
  const state = policy.getDemoModelLoadingState({
    modelId: 'parakeet-tdt-0.6b-v3', source: 'local', entries: [{}], backend: 'webgpu-hybrid',
  });
  assert.equal(state.encoderBackend, 'webgpu');
  assert.equal(state.decoderBackend, 'wasm');
  assert.equal(state.encoderQuant, 'fp16');
  assert.equal(state.decoderQuant, 'int8');
  assert.equal(state.executionPlan.status, 'unverified');
});

test('a model with no runtime-compatible backend stays inspectable and reports unavailable', () => {
  const policy = createDemoModelLoadingPolicy({
    getDescriptor: () => ({ modelId: 'gpu-only', loading: {
      supportsHubSource: true, availableEncoderBackends: ['webgpu'], availableDecoderBackends: ['webgpu'],
      defaultEncoderBackend: 'webgpu', defaultDecoderBackend: 'webgpu',
      availableEncoderQuantizations: ['fp16'], availableDecoderQuantizations: ['fp16'],
      defaultEncoderQuantization: 'fp16', defaultDecoderQuantization: 'fp16',
    } }),
    getRuntime: () => ({ webgpu: false, wasm: false }),
    resolveExecutionPlan: () => { throw new Error('No supported backend is available for "gpu-only".'); },
  });
  const state = policy.getDemoModelLoadingState({ modelId: 'gpu-only' });
  assert.equal(state.executionPlan.status, 'unavailable');
  assert.match(state.executionPlan.error, /No supported backend/);
});

test('load-time plan resolution uses the core runtime probe result, not navigator presence', async () => {
  const policy = createDemoModelLoadingPolicy({
    getDescriptor: () => ({ modelId: 'parakeet-tdt-0.6b-v3', loading: {
      supportsHubSource: true, availableEncoderBackends: ['webgpu', 'wasm'], availableDecoderBackends: ['wasm'],
      defaultEncoderBackend: 'webgpu', defaultDecoderBackend: 'wasm',
      availableEncoderQuantizations: ['fp16'], availableDecoderQuantizations: ['int8'],
      defaultEncoderQuantization: 'fp16', defaultDecoderQuantization: 'int8',
    } }),
    getRuntime: () => ({ webgpu: true, wasm: true }),
    probeExecutionPlan: async (_modelId, input) => {
      assert.equal('runtime' in input, false);
      return {
        runtime: { webgpu: false, wasm: true },
        plan: {
          manifestVersion: '1', status: 'unverified',
          encoderBackend: 'wasm', decoderBackend: 'wasm', encoderQuant: 'fp16', decoderQuant: 'int8',
        },
      };
    },
  });
  const state = await policy.resolveDemoModelLoadingState({ modelId: 'parakeet-tdt-0.6b-v3', source: 'huggingface' });
  assert.deepEqual(state.runtime, { webgpu: false, wasm: true });
  assert.equal(state.encoderBackend, 'wasm');
  assert.equal(state.executionPlan.status, 'unverified');
});

test('local inference receives the probed component choices but not runtime capability metadata', async () => {
  let request;
  await loadDemoLocalModel({
    modelId: 'qwen3-asr-0.6b', source: 'local', entries, backend: 'webgpu',
  }, {
    resolveState: async () => ({
      executionPlan: { status: 'unverified' },
      encoderQuantOptions: ['fp32'], decoderQuantOptions: ['fp16'],
      encoderBackend: 'webgpu', decoderBackend: 'webgpu',
      encoderQuant: 'fp32', decoderQuant: 'fp16',
      runtime: { webgpu: true, wasm: true },
    }),
    loadModel: async value => { request = value; return { ok: true }; },
  });
  assert.equal(request.encoderBackend, 'webgpu');
  assert.equal(request.decoderQuant, 'fp16');
  assert.equal('runtime' in request, false);
});

test('Qwen folder options reflect the registered adapter and requested component backends', async () => {
  const options = { modelId: 'qwen3-asr-0.6b', source: 'local', entries, backend: 'webgpu' };
  const state = getDemoModelLoadingState({ ...options, executionCapabilities: { webgpu: true, wasm: true } });
  assert.deepEqual(state.encoderQuantOptions, ['fp32']);
  assert.deepEqual(state.decoderQuantOptions, ['fp16']);
  assert.equal(state.decoderQuant, 'fp16');
  assert.equal(state.encoderBackend, 'webgpu');
  assert.equal(state.decoderBackend, 'webgpu');
  const handle = { dispose() {} };
  const loaded = await loadDemoLocalModel(options, {
    resolveState: async () => ({ ...state, executionPlan: { ...state.executionPlan, status: 'unverified' } }),
    loadModel: async request => {
    assert.equal(request.decoderQuant, 'fp16');
    assert.equal(request.encoderBackend, 'webgpu');
    assert.equal(request.decoderBackend, 'webgpu');
    assert.equal(request.entries, entries);
    return handle;
    },
  });
  assert.equal(loaded, handle);
  await assert.rejects(loadDemoLocalModel({ ...options, entries: [] }), /folder/);
  await assert.rejects(loadDemoLocalModel({ ...options, entries: [{ path: 'wrong.onnx', basename: 'wrong.onnx' }] }, {
    resolveState: async () => ({ ...state, encoderQuantOptions: [], decoderQuantOptions: [], executionPlan: { ...state.executionPlan, status: 'unverified' } }),
  }), /compatible/);
});

test('Qwen and Streaming Tiny Hub bundles resolve to their pinned published revisions', () => {
  for (const [modelId, repoId, revision] of [
    ['Qwen/Qwen3-ASR-0.6B-hf', 'ysdede/qwen3-asr-0.6b-onnx', 'ac0bedcc0f1614c0b3982940c14bdb169ff2365d'],
    ['moonshine-ai/moonshine-streaming-tiny', 'ysdede/moonshine-streaming-tiny-onnx', 'cb347a0760c2d7d6cf9083eb770376ba108e5b31'],
  ]) {
    const descriptor = getSpeechModelDescriptor(modelId);
    assert.ok(getDemoModelSourceOptions(modelId).includes('huggingface'));
    assert.equal(descriptor.loading.repoId, repoId);
    assert.equal(descriptor.loading.defaultRevision, revision);
  }
});

test('local-only models never reach the Hub pipeline even if called directly', async () => {
  let calls = 0;
  const loader = createDemoHubLoader({ createPipeline: () => ({
    listLoadedModels: () => [],
    async loadModel() { calls++; throw new Error('Unexpected Hub request'); },
    async dispose() {},
  }) });
  try {
    await assert.rejects(loader.loadModel({ modelId: 'nvidia/canary-1b' }), /local folder/);
    await assert.rejects(loader.loadModel({ modelId: 'UsefulSensors/moonshine-tiny' }), /local folder/);
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
