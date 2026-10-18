import {
  buildSpeechModelLoadOptions,
  createSpeechPipeline,
} from '@asrjs/speech-recognition';
import { getDemoModelConfig } from './modelCatalog.js';

let activeHubProgressCallback = null;

const hubPipeline = createSpeechPipeline({
  cacheModels: true,
  hooks: {
    onProgress(event) {
      activeHubProgressCallback?.(event);
    },
  },
});

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
  const modelConfig = getDemoModelConfig(modelId);
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
      model: {
        ...loaded,
        kind: 'hub-pipeline',
        cacheKey,
        async evict() {
          await hubPipeline.disposeModel(cacheKey);
        },
      },
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
