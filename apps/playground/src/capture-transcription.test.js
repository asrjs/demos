import { expect, it, vi } from 'vitest';
import {
  prepareCapturedPcm,
  rebaseCapturedTranscriptTimes,
  transcribeCapturedPcm,
} from '@asrjs/demo-runtime';

it('keeps captured microphone chunks in one native streaming context', async () => {
  const chunks = [];
  const streamer = {
    pushAudio: vi.fn(async (audio) => chunks.push([...audio.samples])),
    finalize: vi.fn(async () => ({ text: 'complete captured utterance' })),
    dispose: vi.fn(async () => undefined),
  };
  const model = {
    supportsStreaming: true,
    createStreamingTranscriber: vi.fn(async () => streamer),
  };

  const outcome = await transcribeCapturedPcm(model, Float32Array.from([1, 2, 3, 4, 5]), 1000, {
    chunkDurationMs: 2,
    streamingOptions: { detail: 'words', language: 'en' },
    toAudioInput: (samples, sampleRate) => ({ samples, sampleRate }),
  });

  expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  expect(model.createStreamingTranscriber).toHaveBeenCalledWith({ detail: 'words', language: 'en', emitPartials: false });
  expect(model.createStreamingTranscriber).toHaveBeenCalledOnce();
  expect(streamer.finalize).toHaveBeenCalledOnce();
  expect(streamer.dispose).toHaveBeenCalledOnce();
  expect(outcome.result.text).toBe('complete captured utterance');
});

it('trims only exact-zero edges and keeps internal silence with the requested margin', () => {
  const input = Float32Array.from([0, 0, 0, 1, 0, 2, 0, 0, 0]);
  const prepared = prepareCapturedPcm(input, 1000, { paddingMs: 1 });

  expect(prepared).toMatchObject({ originalFrames: 9, startFrame: 2, endFrame: 7, trimmedLeadingFrames: 2, trimmedTrailingFrames: 2, policy: 'exact-zero-samples-only' });
  expect([...prepared.pcm]).toEqual([0, 1, 0, 2, 0]);
});

it('preserves short, all-zero and quiet nonzero captures instead of trimming them away', () => {
  const short = Float32Array.from([0, 0.000001, 0]);
  const silence = new Float32Array(20);
  const preparedShort = prepareCapturedPcm(short, 16000);
  const preparedSilence = prepareCapturedPcm(silence, 16000);

  expect(preparedShort.pcm).toEqual(short);
  expect(preparedSilence.pcm).toBe(silence);
  expect(preparedSilence.startFrame).toBe(0);
  expect(preparedSilence.endFrame).toBe(silence.length);
});

it('rejects non-finite PCM before calculating capture bounds', () => {
  expect(() => prepareCapturedPcm(Float32Array.from([0, Number.NaN, 1]), 16000))
    .toThrow('Captured audio contains a non-finite sample at frame 1.');
});

it('preserves transcription options when a captured-audio model has no streaming support', async () => {
  const options = { language: 'en', detail: 'words' };
  const result = { text: 'batch transcript' };
  const model = {
    supportsStreaming: false,
    transcribePrepared: vi.fn(async () => result),
  };

  const outcome = await transcribeCapturedPcm(model, new Float32Array([0]), 16000, {
    batchOptions: options,
  });

  expect(outcome).toMatchObject({ mode: 'batch', result, audioWindow: { inputFrames: 1, startFrame: 0, endFrame: 1, outputFrames: 1 } });
  expect(model.transcribePrepared).toHaveBeenCalledWith({ pcm: expect.any(Float32Array), sampleRate: 16000 }, options);
});

it('disposes an invalid streaming handle and keeps both validation and cleanup failures', async () => {
  const disposeError = new Error('dispose failed');
  const streamer = { dispose: vi.fn(async () => { throw disposeError; }) };
  const model = { supportsStreaming: true, createStreamingTranscriber: async () => streamer };

  await expect(transcribeCapturedPcm(model, new Float32Array([1]), 16000, {
    toAudioInput: (samples) => samples,
  })).rejects.toMatchObject({
    name: 'AggregateError',
    errors: [expect.objectContaining({ message: 'Model returned an invalid streaming transcriber.' }), disposeError],
  });
  expect(streamer.dispose).toHaveBeenCalledOnce();
});

it.each(['pushAudio', 'finalize'])('disposes the session and reports %s failures', async (stage) => {
  const failure = new Error(`${stage} failed`);
  const streamer = {
    pushAudio: vi.fn(async () => { if (stage === 'pushAudio') throw failure; }),
    finalize: vi.fn(async () => { if (stage === 'finalize') throw failure; return { text: 'ok' }; }),
    dispose: vi.fn(async () => undefined),
  };
  const model = { supportsStreaming: true, createStreamingTranscriber: async () => streamer };

  await expect(transcribeCapturedPcm(model, new Float32Array([1]), 16000, {
    toAudioInput: (samples) => samples,
  })).rejects.toBe(failure);
  expect(streamer.dispose).toHaveBeenCalledOnce();
});

it('does not hide inference failure when cleanup also fails', async () => {
  const inferenceError = new Error('finalize failed');
  const disposeError = new Error('dispose failed');
  const streamer = {
    pushAudio: vi.fn(async () => undefined),
    finalize: vi.fn(async () => { throw inferenceError; }),
    dispose: vi.fn(async () => { throw disposeError; }),
  };
  const model = { supportsStreaming: true, createStreamingTranscriber: async () => streamer };

  await expect(transcribeCapturedPcm(model, new Float32Array([1]), 16000, {
    toAudioInput: (samples) => samples,
  })).rejects.toMatchObject({ name: 'AggregateError', errors: [inferenceError, disposeError] });
});

it('preserves a thrown primitive when cleanup also fails', async () => {
  const disposeError = new Error('dispose failed');
  const streamer = {
    pushAudio: vi.fn(async () => { throw null; }),
    finalize: vi.fn(),
    dispose: vi.fn(async () => { throw disposeError; }),
  };
  const model = { supportsStreaming: true, createStreamingTranscriber: async () => streamer };

  await expect(transcribeCapturedPcm(model, new Float32Array([1]), 16000, {
    toAudioInput: (samples) => samples,
  })).rejects.toMatchObject({ name: 'AggregateError', errors: [null, disposeError] });
});

it('surfaces a cleanup failure after successful finalization', async () => {
  const disposeError = new Error('dispose failed');
  const streamer = {
    pushAudio: vi.fn(async () => undefined),
    finalize: vi.fn(async () => ({ text: 'ok' })),
    dispose: vi.fn(async () => { throw disposeError; }),
  };
  const model = { supportsStreaming: true, createStreamingTranscriber: async () => streamer };

  await expect(transcribeCapturedPcm(model, new Float32Array([1]), 16000, {
    toAudioInput: (samples) => samples,
  })).rejects.toBe(disposeError);
});

it('rebases batch canonical times to the original capture while preserving native diagnostics and durations', async () => {
  const canonical = Object.freeze({
    text: 'captured words',
    warnings: Object.freeze([]),
    meta: Object.freeze({ detailLevel: 'detailed', isFinal: true, durationSeconds: 0.2 }),
    segments: Object.freeze([Object.freeze({ index: 0, text: 'captured words', startTime: 0.01, endTime: 0.19 })]),
    sentences: Object.freeze([Object.freeze({ index: 0, text: 'captured words', startTime: 0.02, endTime: 0.18 })]),
    words: Object.freeze([Object.freeze({ index: 0, text: 'captured', startTime: 0.03, endTime: 0.1 })]),
    tokens: Object.freeze([Object.freeze({ index: 0, text: 'captured', startTime: 0.04, endTime: 0.09 })]),
  });
  const native = Object.freeze({ debug: Object.freeze({ startTime: 0.03, durationSeconds: 0.2 }) });
  const envelope = Object.freeze({ canonical, native });
  const model = {
    supportsStreaming: false,
    transcribePrepared: vi.fn(async () => envelope),
  };

  const outcome = await transcribeCapturedPcm(model, Float32Array.from([0, 0, 1, 1, 0]), 10, {
    edgeSilenceMs: 0,
  });

  expect(outcome.audioWindow).toMatchObject({ startFrame: 2, endFrame: 4, leadingFramesRemoved: 2 });
  expect(outcome.result.canonical.words[0].startTime).toBeCloseTo(0.23, 8);
  expect(outcome.result.canonical.words[0].endTime).toBeCloseTo(0.3, 8);
  expect(outcome.result.canonical.segments[0].startTime).toBeCloseTo(0.21, 8);
  expect(outcome.result.canonical.segments[0].endTime).toBeCloseTo(0.39, 8);
  expect(outcome.result.canonical.sentences[0].startTime).toBeCloseTo(0.22, 8);
  expect(outcome.result.canonical.sentences[0].endTime).toBeCloseTo(0.38, 8);
  expect(outcome.result.canonical.tokens[0].startTime).toBeCloseTo(0.24, 8);
  expect(outcome.result.canonical.tokens[0].endTime).toBeCloseTo(0.29, 8);
  expect(outcome.result.canonical.meta.durationSeconds).toBe(0.2);
  expect(outcome.result.native).toBe(native);
  expect(envelope.canonical.words[0].startTime).toBe(0.03);
  expect(envelope.canonical.meta.durationSeconds).toBe(0.2);
});

it('rebases native streaming canonical timestamps without altering native-only fields', async () => {
  const canonical = Object.freeze({
    text: 'streamed words',
    warnings: Object.freeze([]),
    meta: Object.freeze({ detailLevel: 'words', isFinal: true, durationSeconds: 0.2 }),
    words: Object.freeze([Object.freeze({ index: 0, text: 'streamed', startTime: 0.05, endTime: 0.15 })]),
  });
  const streamer = {
    pushAudio: vi.fn(async () => undefined),
    finalize: vi.fn(async () => canonical),
    dispose: vi.fn(async () => undefined),
  };
  const model = { supportsStreaming: true, createStreamingTranscriber: async () => streamer };

  const outcome = await transcribeCapturedPcm(model, Float32Array.from([0, 0, 1, 1, 0]), 10, {
    edgeSilenceMs: 0,
    toAudioInput: (samples) => samples,
  });

  expect(outcome.result.words[0].startTime).toBeCloseTo(0.25, 8);
  expect(outcome.result.words[0].endTime).toBeCloseTo(0.35, 8);
  expect(outcome.result.meta.durationSeconds).toBe(0.2);
  expect(canonical.words[0].startTime).toBe(0.05);
  expect(streamer.dispose).toHaveBeenCalledOnce();
});

it('leaves native-only model output unchanged when no canonical result exists', () => {
  const nativeOnly = Object.freeze({ words: Object.freeze([{ startTime: 0.1, endTime: 0.2 }]) });
  expect(rebaseCapturedTranscriptTimes(nativeOnly, 1600, 16000)).toBe(nativeOnly);
});
