import {
  PcmAudioBuffer,
  buildSpeechModelLoadOptions,
  createSpeechPipeline,
  getSpeechModelDescriptor,
} from '@asrjs/speech-recognition';

let activeHubProgressCallback = null;

const hubPipeline = createSpeechPipeline({
  cacheModels: true,
  hooks: {
    onProgress(event) {
      activeHubProgressCallback?.(event);
    },
  },
});

export function createDemoSpeechModelAdapter(loaded, options = {}) {
  const cacheKey = options.cacheKey ?? null;
  const cacheManaged = options.cacheManaged ?? false;

  return {
    kind: cacheManaged ? 'hub-pipeline' : 'loaded-model',
    cacheKey,
    info: loaded.model.info,
    async transcribe(pcm, sampleRate, options = {}) {
      return await loaded.transcribe(PcmAudioBuffer.fromMono(pcm, sampleRate), {
        detail: 'detailed',
        responseFlavor: 'canonical+native',
        ...options,
      });
    },
    async dispose() {
      if (cacheManaged) {
        // Hub models are cached at pipeline level for reuse across model switches.
        return undefined;
      }
      await loaded.dispose();
    },
    async evict() {
      if (!cacheKey) {
        return;
      }
      await hubPipeline.disposeModel(cacheKey);
    },
  };
}

function buildHubCacheKey(modelConfig, options) {
  const optionSignature = JSON.stringify(options.options?.source ?? {});
  return `hub:${modelConfig.preset}:${options.modelId}:${options.backend ?? 'auto'}:${optionSignature}`;
}

export async function loadHubDemoModel({
  modelId,
  revision,
  backend,
  encoderBackend,
  decoderBackend,
  encoderQuant,
  decoderQuant,
  preprocessor,
  preprocessorBackend,
  cpuThreads,
  enableProfiling,
  onProgress,
}) {
  const modelConfig = getSpeechModelDescriptor(modelId);
  if (!modelConfig) {
    throw new Error(`Unknown demo model "${modelId}".`);
  }

  const loadOptions = buildSpeechModelLoadOptions({
    modelId,
    revision,
    backend,
    encoderBackend,
    decoderBackend,
    encoderQuant,
    decoderQuant,
    preprocessorName: preprocessor,
    preprocessorBackend,
    cpuThreads,
    enableProfiling,
  });

  const cacheKey = buildHubCacheKey(modelConfig, loadOptions);
  const wasCached = hubPipeline.listLoadedModels().includes(cacheKey);

  activeHubProgressCallback = onProgress ?? null;
  try {
    const loaded = await hubPipeline.loadModel({
      ...loadOptions,
      cacheKey,
      onProgress,
    });

    return {
      model: createDemoSpeechModelAdapter(loaded, {
        cacheKey,
        cacheManaged: true,
      }),
      info: loaded.model.info,
      fromCache: wasCached,
      cacheKey,
    };
  } finally {
    activeHubProgressCallback = null;
  }
}

export async function disposeHubDemoPipeline() {
  await hubPipeline.dispose();
}
