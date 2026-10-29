import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSpeechModelFromLocalEntries: vi.fn(),
  loadHubDemoModel: vi.fn(),
  decodeAudioBufferToMonoPcm: vi.fn(),
  getCachedAudioFile: vi.fn(),
  matchesWarmupResult: vi.fn(),
}));

vi.mock('@asrjs/speech-recognition/browser', async (importOriginal) => ({
  ...await importOriginal(),
  loadSpeechModelFromLocalEntries: mocks.loadSpeechModelFromLocalEntries,
}));

vi.mock('@asrjs/speech-recognition', async (importOriginal) => ({
  ...await importOriginal(),
  probeSpeechModelExecutionPlan: vi.fn(async () => ({
    runtime: { webgpu: true, wasm: true },
    plan: {
      manifestVersion: '1', status: 'unverified',
      encoderBackend: 'webgpu', decoderBackend: 'wasm',
      encoderQuant: 'fp16', decoderQuant: 'int8',
    },
  })),
}));

vi.mock('../shared/modelLoader.js', () => ({
  loadHubDemoModel: mocks.loadHubDemoModel,
}));

vi.mock('./audioUtils.js', () => ({
  decodeAudioBufferToMonoPcm: mocks.decodeAudioBufferToMonoPcm,
  encodeMonoPcmToWavBlob: vi.fn(),
  getCachedAudioFile: mocks.getCachedAudioFile,
}));

vi.mock('./warmupUtils.js', () => ({
  matchesWarmupResult: mocks.matchesWarmupResult,
}));

import { loadModelFlow } from './transcriptionFlows.js';

describe('loadModelFlow', () => {
  beforeEach(() => {
    mocks.loadSpeechModelFromLocalEntries.mockReset();
    mocks.loadHubDemoModel.mockReset();
    mocks.decodeAudioBufferToMonoPcm.mockReset();
    mocks.getCachedAudioFile.mockReset();
    mocks.matchesWarmupResult.mockReset();
  });

  it('uses the browser local-model handle shape so warm-up can call transcribeMonoPcm', async () => {
    const transcribeMonoPcm = vi.fn(async () => ({ text: 'warmup ok' }));
    const dispose = vi.fn(async () => undefined);
    const modelRef = { current: null };
    const releaseCurrentModel = vi.fn(async () => undefined);
    const setIsModelLoading = vi.fn();
    const setStatus = vi.fn();
    const setProgressText = vi.fn();
    const setProgressPct = vi.fn();
    const setLoadedFromCache = vi.fn();
    const setModelLoaded = vi.fn();

    mocks.loadSpeechModelFromLocalEntries.mockResolvedValue({
      transcribeMonoPcm,
      dispose,
      model: {},
      runtime: {},
      session: {},
      selection: {
        encoderName: 'encoder-model.fp16.onnx',
        decoderName: 'decoder_joint-model.int8.onnx',
        tokenizerName: 'vocab.txt',
        preprocessorName: undefined,
      },
    });
    mocks.getCachedAudioFile.mockResolvedValue({
      arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
    });
    mocks.decodeAudioBufferToMonoPcm.mockResolvedValue({
      pcm: new Float32Array([0.1, -0.1, 0.2]),
    });
    mocks.matchesWarmupResult.mockReturnValue(true);

    await loadModelFlow({
      modelSource: 'local',
      modelRef,
      localEntries: ['vocab.txt', 'encoder-model.fp16.onnx', 'decoder_joint-model.int8.onnx'].map(basename => ({ path: `demo/${basename}`, basename })),
      selectedModel: 'parakeet-tdt-0.6b-v3',
      encoderBackend: 'webgpu',
      decoderBackend: 'wasm',
      encoderQuant: 'fp16',
      decoderQuant: 'int8',
      localTokenizerName: 'vocab.txt',
      preprocessor: 'nemo128',
      preprocessorBackend: 'js',
      backend: 'webgpu-hybrid',
      verboseLog: false,
      cpuThreads: 4,
      enableProfiling: false,
      setIsModelLoading,
      setStatus,
      setProgressText,
      setProgressPct,
      setLoadedFromCache,
      releaseCurrentModel,
      modelRevision: 'main',
      modelConfig: {
        warmup: {
          expectedTexts: ['warmup ok'],
        },
      },
      warmupAudioUrl: 'https://example.test/warmup.ogg',
      setModelLoaded,
    });

    expect(mocks.loadSpeechModelFromLocalEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'parakeet-tdt-0.6b-v3',
        entries: expect.arrayContaining([{ path: 'demo/vocab.txt', basename: 'vocab.txt' }]),
        tokenizerName: 'vocab.txt',
        preprocessorName: 'nemo128',
      }),
    );
    expect(modelRef.current).toMatchObject({
      transcribeMonoPcm,
      dispose,
    });
    expect(transcribeMonoPcm).toHaveBeenCalledWith(
      expect.any(Float32Array),
      16000,
      expect.objectContaining({
        enableProfiling: false,
      }),
    );
    expect(setModelLoaded).toHaveBeenCalledWith(true);
  });
});
