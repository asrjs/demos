import { getSpeechModelDescriptor, resolveSpeechModelComponentBackends } from '@asrjs/speech-recognition';
import { inspectSpeechModelLocalEntries, loadSpeechModelFromLocalEntries } from '@asrjs/speech-recognition/browser';

export function assertDemoModelRuntimeBackend(descriptor, backend) {
  if (!backend || !descriptor) return;
  const loading = descriptor.loading;
  const encoder = loading.availableEncoderBackends ?? ['webgpu', 'wasm'];
  const decoder = loading.availableDecoderBackends ?? ['webgpu', 'wasm'];
  const wasm = encoder.includes('wasm') && decoder.includes('wasm');
  const gpu = encoder.includes('webgpu') || decoder.includes('webgpu');
  const supported = backend === 'wasm' ? wasm : backend === 'webgpu-strict'
    ? encoder.includes('webgpu') && decoder.includes('webgpu')
    : String(backend).startsWith('webgpu') && gpu;
  if (!supported) {
    const available = [...(gpu ? ['webgpu'] : []), ...(wasm ? ['wasm'] : [])];
    throw new Error(`${descriptor.displayName ?? descriptor.modelId} does not support ${backend}; select ${available.join(' or ')}.`);
  }
}

// Policy reads registered capabilities; artifact names and graph layout stay in
// the library's model adapters. No model-family switches belong in the demos.
export function createDemoModelLoadingPolicy({
  getDescriptor = getSpeechModelDescriptor,
  inspectEntries = inspectSpeechModelLocalEntries,
  resolveBackends = resolveSpeechModelComponentBackends,
} = {}) {
  function getDemoModelSourceOptions(modelId) {
    const loading = getDescriptor(modelId)?.loading;
    if (!loading) return [];
    return [
      ...(loading.supportsHubSource !== false ? ['huggingface'] : []),
      ...(loading.supportsLocalSource === true ? ['local'] : []),
    ];
  }

  function resolveDemoModelSource(modelId, requested = 'huggingface') {
    const sources = getDemoModelSourceOptions(modelId);
    return sources.includes(requested) ? requested : sources[0] ?? null;
  }

  function getDemoModelLoadingState({ modelId, source, entries = [], ...options }) {
    const descriptor = getDescriptor(modelId);
    const sources = getDemoModelSourceOptions(modelId);
    const resolvedSource = resolveDemoModelSource(modelId, source);
    if (!descriptor || !resolvedSource) throw new Error(`No registered loading path for "${modelId}".`);
    const loading = descriptor.loading;
    const inspection = resolvedSource === 'local' && entries.length
      ? inspectEntries(modelId, entries) : null;
    const quantOptions = (part) => {
      const declared = loading[part === 'encoder' ? 'availableEncoderQuantizations' : 'availableDecoderQuantizations'] ?? ['fp32'];
      return inspection ? inspection[`${part}Quantizations`].filter(value => declared.includes(value)) : [...declared];
    };
    const encoderQuantOptions = quantOptions('encoder');
    const decoderQuantOptions = quantOptions('decoder');
    const choose = (requested, available, preferred) => available.includes(requested)
      ? requested : available.includes(preferred) ? preferred : available[0];
    const backends = resolveBackends(modelId, options);
    return {
      source: resolvedSource, sources, inspection,
      encoderBackend: backends.encoderBackend,
      decoderBackend: backends.decoderBackend,
      encoderQuantOptions, decoderQuantOptions,
      encoderQuant: choose(options.encoderQuant, encoderQuantOptions, loading.defaultEncoderQuantization),
      decoderQuant: choose(options.decoderQuant, decoderQuantOptions, loading.defaultDecoderQuantization),
    };
  }

  return { getDemoModelSourceOptions, resolveDemoModelSource, getDemoModelLoadingState };
}

export const {
  getDemoModelSourceOptions, resolveDemoModelSource, getDemoModelLoadingState,
} = createDemoModelLoadingPolicy();

export async function loadDemoLocalModel(options, { loadModel = loadSpeechModelFromLocalEntries } = {}) {
  assertDemoModelRuntimeBackend(getSpeechModelDescriptor(options.modelId), options.backend);
  if (!getDemoModelSourceOptions(options.modelId).includes('local')) {
    throw new Error('This model does not support a local folder.');
  }
  if (!options.entries?.length) throw new Error('Select a local model folder first.');
  const state = getDemoModelLoadingState({ ...options, source: 'local' });
  if (!state.encoderQuantOptions.length || !state.decoderQuantOptions.length) {
    throw new Error('The folder has no compatible encoder/decoder artifacts for the selected model.');
  }
  const { source, ...request } = options;
  return loadModel({
    ...request,
    encoderBackend: state.encoderBackend, decoderBackend: state.decoderBackend,
    encoderQuant: state.encoderQuant, decoderQuant: state.decoderQuant,
  });
}
