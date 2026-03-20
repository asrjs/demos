import {
  PcmAudioBuffer,
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

function mapMetricsToLegacyShape(metrics) {
  if (!metrics) return null;

  return {
    preprocess_ms: metrics.preprocessMs,
    encode_ms: metrics.encodeMs,
    decode_ms: metrics.decodeMs,
    tokenize_ms: metrics.tokenizeMs,
    postprocess_ms: metrics.postprocessMs,
    total_ms: metrics.totalMs,
    wall_ms: metrics.wallMs,
    audio_duration_sec: metrics.audioDurationSec,
    rtf: metrics.rtf,
    rtfx: metrics.rtfx,
    requested_preprocessor_backend: metrics.requestedPreprocessorBackend,
    preprocessor_backend: metrics.preprocessorBackend,
    audio_decode_ms: metrics.decodeAudioMs,
    downmix_ms: metrics.downmixMs,
    resample_ms: metrics.resampleMs,
    audio_preparation_ms: metrics.audioPreparationMs,
    input_sample_rate: metrics.inputSampleRate,
    output_sample_rate: metrics.outputSampleRate,
    resampler: metrics.resampler,
    resampler_quality: metrics.resamplerQuality,
    encoder_frame_count: metrics.encoderFrameCount,
    decode_iterations: metrics.decodeIterations,
    emitted_token_count: metrics.emittedTokenCount,
    emitted_word_count: metrics.emittedWordCount,
  };
}

function mapWordsToLegacyShape(words = []) {
  return words.map((word) => ({
    text: word.text,
    start_time: word.startTime,
    end_time: word.endTime,
    confidence: word.confidence,
  }));
}

function mapTokensToLegacyShape(tokens = []) {
  return tokens.map((token) => ({
    id: token.id,
    token: token.text,
    start_time: token.startTime,
    end_time: token.endTime,
    confidence: token.confidence,
  }));
}

function adaptEnvelopeToLegacyDemoResult(response) {
  const canonical = response?.canonical ?? response;
  const native = response?.native;

  return {
    utterance_text: canonical?.text ?? '',
    words: mapWordsToLegacyShape(canonical?.words),
    tokens: mapTokensToLegacyShape(canonical?.tokens),
    confidence_scores: {
      utterance: canonical?.meta?.averageConfidence ?? native?.confidence?.utterance,
      word_avg: canonical?.meta?.averageWordConfidence ?? native?.confidence?.wordAverage,
      token_avg: canonical?.meta?.averageTokenConfidence ?? native?.confidence?.tokenAverage,
    },
    metrics: mapMetricsToLegacyShape(canonical?.meta?.metrics),
    canonical,
    native,
  };
}

export function createDemoSpeechModelAdapter(loaded, options = {}) {
  const cacheKey = options.cacheKey ?? null;
  const cacheManaged = options.cacheManaged ?? false;

  return {
    kind: cacheManaged ? 'hub-pipeline' : 'loaded-model',
    cacheKey,
    info: loaded.model.info,
    async transcribe(pcm, sampleRate, options = {}) {
      const response = await loaded.transcribe(PcmAudioBuffer.fromMono(pcm, sampleRate), {
        detail: 'detailed',
        responseFlavor: 'canonical+native',
        ...options,
      });

      return adaptEnvelopeToLegacyDemoResult(response);
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
