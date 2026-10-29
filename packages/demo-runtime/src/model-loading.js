import * as speechRecognition from '@asrjs/speech-recognition';
import { getSpeechModelDescriptor } from '@asrjs/speech-recognition';
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
  resolveExecutionPlan = speechRecognition.resolveSpeechModelExecutionPlan,
  probeExecutionPlan = speechRecognition.probeSpeechModelExecutionPlan,
  getRuntime = () => ({
    webgpu: typeof navigator !== 'undefined' && Boolean(navigator.gpu),
    wasm: typeof WebAssembly !== 'undefined',
  }),
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

  function getDemoModelLoadingState({ modelId, source, entries = [], executionCapabilities, resolvedExecutionPlan, ...options }) {
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
    const runtime = executionCapabilities ?? getRuntime();
    let plan;
    try {
      if (resolvedExecutionPlan) {
        plan = resolvedExecutionPlan;
      } else if (typeof resolveExecutionPlan !== 'function') {
        throw new Error('The installed speech-recognition package has no execution-plan resolver. Update the package to use the approved model manifest.');
      } else {
        plan = resolveExecutionPlan(modelId, {
          runtime,
          backend: options.backend,
          encoderBackend: options.encoderBackend,
          decoderBackend: options.decoderBackend,
          encoderQuant: options.encoderQuant,
          decoderQuant: options.decoderQuant,
        });
      }
    } catch (error) {
      const selectAvailable = (part) => {
        const available = loading[part === 'encoder' ? 'availableEncoderBackends' : 'availableDecoderBackends'] ?? [];
        return available.find(backend => runtime[backend]) ?? loading[part === 'encoder' ? 'defaultEncoderBackend' : 'defaultDecoderBackend'];
      };
      plan = {
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
        encoderBackend: selectAvailable('encoder'),
        decoderBackend: selectAvailable('decoder'),
        encoderQuant: loading.defaultEncoderQuantization,
        decoderQuant: loading.defaultDecoderQuantization,
      };
    }
    const choose = (requested, available, preferred) => available.includes(requested)
      ? requested : available.includes(preferred) ? preferred : available[0];
    // A local folder may not contain the manifest's preferred precision. Keep
    // the requested compatible file, but do not present it as an approved plan.
    const encoderQuant = choose(options.encoderQuant, encoderQuantOptions, plan.encoderQuant ?? loading.defaultEncoderQuantization);
    const decoderQuant = choose(options.decoderQuant, decoderQuantOptions, plan.decoderQuant ?? loading.defaultDecoderQuantization);
    const executionPlan = encoderQuant === plan.encoderQuant && decoderQuant === plan.decoderQuant
      ? plan : { ...plan, encoderQuant, decoderQuant, status: 'unverified' };
    return {
      source: resolvedSource, sources, inspection,
      runtime,
      executionPlan,
      encoderBackend: executionPlan.encoderBackend,
      decoderBackend: executionPlan.decoderBackend,
      encoderQuantOptions, decoderQuantOptions,
      encoderQuant,
      decoderQuant,
    };
  }

  async function resolveDemoModelLoadingState({ modelId, ...options }) {
    try {
      if (typeof probeExecutionPlan !== 'function') {
        throw new Error('The installed speech-recognition package has no execution-plan probe. Update the package to probe the current runtime.');
      }
      const { runtime, plan } = await probeExecutionPlan(modelId, {
        backend: options.backend,
        encoderBackend: options.encoderBackend,
        decoderBackend: options.decoderBackend,
        encoderQuant: options.encoderQuant,
        decoderQuant: options.decoderQuant,
      });
      return getDemoModelLoadingState({ ...options, modelId, executionCapabilities: runtime, resolvedExecutionPlan: plan });
    } catch (error) {
      const preview = getDemoModelLoadingState({ ...options, modelId });
      return {
        ...preview,
        executionPlan: {
          ...preview.executionPlan,
          status: 'unavailable',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  return { getDemoModelSourceOptions, resolveDemoModelSource, getDemoModelLoadingState, resolveDemoModelLoadingState };
}

export const {
  getDemoModelSourceOptions, resolveDemoModelSource, getDemoModelLoadingState, resolveDemoModelLoadingState,
} = createDemoModelLoadingPolicy();

export async function loadDemoLocalModel(options, { loadModel = loadSpeechModelFromLocalEntries, resolveState = resolveDemoModelLoadingState } = {}) {
  assertDemoModelRuntimeBackend(getSpeechModelDescriptor(options.modelId), options.backend);
  if (!getDemoModelSourceOptions(options.modelId).includes('local')) {
    throw new Error('This model does not support a local folder.');
  }
  if (!options.entries?.length) throw new Error('Select a local model folder first.');
  const state = await resolveState({ ...options, source: 'local' });
  if (state.executionPlan.status === 'unavailable') {
    throw new Error(state.executionPlan.error);
  }
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
