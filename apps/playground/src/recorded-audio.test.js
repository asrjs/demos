import { expect, it, vi } from 'vitest';
import {
  createRecordedPcmAudio,
  preparePlaygroundAudioWindow,
  preparePlaygroundAudio,
  stopAndDisposeMicrophoneSession,
} from './recorded-audio.js';

it('owns the captured Float32 PCM and reports mono capture metrics', () => {
  const captured = Float32Array.from([0, 0.5, -1, 0]);
  const recorded = createRecordedPcmAudio({ pcm: captured, sampleRate: 16000, metadata: { startFrame: 42 } });

  expect(recorded).toMatchObject({
    sampleRate: 16000,
    durationSec: 4 / 16000,
    numberOfChannels: 1,
    metadata: { startFrame: 42 },
    metrics: { strategy: 'microphone-f32', frames: 4, rms: Math.sqrt(0.3125), peakAbs: 1, exactZeroFraction: 0.5 },
  });
  expect([...recorded.pcm]).toEqual([...captured]);
  expect(recorded.pcm).not.toBe(captured);
  captured.fill(0);
  expect([...recorded.pcm]).toEqual([0, 0.5, -1, 0]);
});

it('transcribes recorded microphone PCM without decoding its playback WAV', async () => {
  const recordedPcm = createRecordedPcmAudio({ pcm: Float32Array.from([0.1, 0.2]), sampleRate: 16000 });
  const decodeAudio = vi.fn();

  const result = await preparePlaygroundAudio({
    audioIsRecorded: true,
    recordedPcm,
    audioFile: new Blob(['playback-only']),
    sampleUrl: '/sample.ogg',
    decodeAudio,
  });

  expect(result).toEqual({ prepared: recordedPcm, isRecorded: true });
  expect(decodeAudio).not.toHaveBeenCalled();
});

it('uses the existing decoder for files and bundled samples', async () => {
  const prepared = { pcm: Float32Array.from([1]), sampleRate: 16000 };
  const decodeAudio = vi.fn(async () => prepared);

  await expect(preparePlaygroundAudio({
    audioIsRecorded: false,
    audioFile: new Blob(['upload']),
    sampleUrl: '/sample.ogg',
    decodeAudio,
    decodeOptions: { strategy: 'native-rate' },
  })).resolves.toEqual({ prepared, isRecorded: false });
  expect(decodeAudio).toHaveBeenCalledWith(expect.any(Blob), { strategy: 'native-rate' });

  await preparePlaygroundAudio({ audioIsRecorded: false, audioFile: null, sampleUrl: '/sample.ogg', decodeAudio });
  expect(decodeAudio).toHaveBeenLastCalledWith('/sample.ogg', undefined);
});

it('prepares recorded PCM once for streaming and benchmark while retaining its original timeline', () => {
  const prepared = {
    pcm: Float32Array.from([...new Array(10).fill(0), 0.2, 0, -0.3, ...new Array(10).fill(0)]),
    sampleRate: 10,
    durationSec: 2.3,
    metrics: { strategy: 'microphone-f32' },
  };

  const window = preparePlaygroundAudioWindow(prepared, true);
  expect(window).toMatchObject({ originalDurationSec: 2.3, processedDurationSec: 0.9, startFrame: 7 });
  expect([...window.audio.pcm]).toEqual([...prepared.pcm.slice(7, 16)]);
  expect(window.captureWindow).toMatchObject({ startFrame: 7, endFrame: 16, policy: 'exact-zero-samples-only' });
  expect(window.audio.metrics).toBe(prepared.metrics);

  const fileWindow = preparePlaygroundAudioWindow(prepared, false);
  expect(fileWindow.audio).toBe(prepared);
  expect(fileWindow.captureWindow).toBeNull();
  expect(fileWindow.processedDurationSec).toBe(prepared.durationSec);
});

it('fails clearly instead of decoding the playback asset when raw recorded PCM is missing', async () => {
  const decodeAudio = vi.fn();
  await expect(preparePlaygroundAudio({
    audioIsRecorded: true,
    recordedPcm: null,
    audioFile: new Blob(['playback-only']),
    sampleUrl: '/sample.ogg',
    decodeAudio,
  })).rejects.toThrow('Recorded microphone PCM is unavailable. Record the audio again.');
  expect(decodeAudio).not.toHaveBeenCalled();
});

it('does not let an old asynchronous stop clear a newer recording session', async () => {
  let finishStop;
  const oldSession = {
    id: 4,
    cleanupPromise: null,
    controller: {
      stop: vi.fn(() => new Promise((resolve) => { finishStop = resolve; })),
      dispose: vi.fn(async () => undefined),
    },
  };
  const newSession = { id: 5 };
  const currentSessionRef = { current: oldSession };
  const generationRef = { current: oldSession.id };
  const onSettled = vi.fn();

  const cleanup = stopAndDisposeMicrophoneSession(
    oldSession,
    true,
    currentSessionRef,
    generationRef,
    onSettled,
  );
  currentSessionRef.current = newSession;
  generationRef.current = newSession.id;
  finishStop();
  await cleanup;

  expect(currentSessionRef.current).toBe(newSession);
  expect(generationRef.current).toBe(newSession.id);
  expect(onSettled).toHaveBeenCalledWith(false);
  expect(oldSession.controller.stop).toHaveBeenCalledOnce();
  expect(oldSession.controller.dispose).toHaveBeenCalledOnce();
});

it('invalidates prior PCM while an empty or failed replacement recording is selected', async () => {
  const { beginRecordedAudioCapture } = await import('./recorded-audio.js');
  const previousPcm = createRecordedPcmAudio({ pcm: Float32Array.of(0.25, 0.5), sampleRate: 16000 });
  const recordedPcmRef = { current: previousPcm };
  const pending = beginRecordedAudioCapture(recordedPcmRef);
  expect(recordedPcmRef.current).toBeNull();
  expect(pending.audioUrl).toBe('');
  expect(pending.audioFile).toBeNull();
  const decodeAudio = vi.fn();
  await expect(preparePlaygroundAudio({
    ...pending,
    recordedPcm: recordedPcmRef.current,
    sampleUrl: '/bundled-sample.ogg',
    decodeAudio,
  })).rejects.toThrow('Recorded microphone PCM is unavailable');
  expect(decodeAudio).not.toHaveBeenCalled();
});
