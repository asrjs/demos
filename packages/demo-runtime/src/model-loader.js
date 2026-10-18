import {
  buildSpeechModelLoadOptions, createSpeechPipeline, getSpeechModelDescriptor,
} from '@asrjs/speech-recognition';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

export function buildDemoModelLoadRequest({ preprocessor, ...options }) {
  return buildSpeechModelLoadOptions({ ...options, preprocessorName: options.preprocessorName ?? preprocessor });
}

export function getDemoModelCacheKey(request) {
  const { onProgress, hooks, signal, ...configuration } = request;
  return `demo:${JSON.stringify(stableValue(configuration))}`;
}

// Each application owns a pipeline. Queuing prevents overlapping progress
// listeners from attributing another model's download to the current request.
export function createDemoHubLoader({ createPipeline = createSpeechPipeline } = {}) {
  let progressListener = null;
  let pending = Promise.resolve();
  let closed = false;
  const pipeline = createPipeline({ cacheModels: true, hooks: {
    onProgress(event) { progressListener?.(event); },
  } });

  return {
    loadModel(options) {
      if (closed) return Promise.reject(new Error('Demo model loader has been disposed.'));
      const run = async () => {
        if (!getSpeechModelDescriptor(options.modelId)) throw new Error(`Unknown demo model "${options.modelId}".`);
        const request = buildDemoModelLoadRequest(options);
        const cacheKey = getDemoModelCacheKey(request);
        const fromCache = pipeline.listLoadedModels().includes(cacheKey);
        progressListener = options.onProgress ?? null;
        try {
          const loaded = await pipeline.loadModel({ ...request, cacheKey });
          return {
            model: { ...loaded, kind: 'hub-pipeline', cacheKey, evict: () => pipeline.disposeModel(cacheKey) },
            info: loaded.model.info, fromCache, cacheKey,
          };
        } finally {
          progressListener = null;
        }
      };
      const result = pending.then(run);
      pending = result.catch(() => undefined);
      return result;
    },
    async dispose() {
      closed = true;
      await pending;
      await pipeline.dispose();
    },
  };
}
