import { prepareCapturedPcm } from '@asrjs/demo-runtime';

export function createRecordedPcmAudio(utterance) {
  const { pcm, sampleRate } = utterance ?? {};
  if (!(pcm instanceof Float32Array) || pcm.length === 0) {
    throw new TypeError('Microphone capture did not return PCM audio.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Microphone capture returned an invalid sample rate.');
  }

  let squaredSum = 0;
  let peakAbs = 0;
  let exactZeroSamples = 0;
  for (const sample of pcm) {
    if (!Number.isFinite(sample)) {
      throw new TypeError('Microphone capture contains non-finite PCM samples.');
    }
    squaredSum += sample * sample;
    peakAbs = Math.max(peakAbs, Math.abs(sample));
    if (sample === 0) exactZeroSamples += 1;
  }

  const ownedPcm = pcm.slice();
  const durationSec = ownedPcm.length / sampleRate;
  return {
    pcm: ownedPcm,
    sampleRate,
    durationSec,
    numberOfChannels: 1,
    metadata: utterance.metadata ?? null,
    metrics: {
      backend: 'browser',
      strategy: 'microphone-f32',
      inputSampleRate: sampleRate,
      outputSampleRate: sampleRate,
      decodeMs: 0,
      downmixMs: 0,
      resampleMs: 0,
      totalMs: 0,
      wallMs: 0,
      resampler: 'none',
      resamplerQuality: null,
      audioDurationSec: durationSec,
      frames: ownedPcm.length,
      rms: Math.sqrt(squaredSum / ownedPcm.length),
      peakAbs,
      exactZeroFraction: exactZeroSamples / ownedPcm.length,
    },
  };
}

export function preparePlaygroundAudioWindow(prepared, isRecorded) {
  const captureWindow = isRecorded
    ? prepareCapturedPcm(prepared.pcm, prepared.sampleRate)
    : null;
  const audio = captureWindow
    ? { ...prepared, pcm: captureWindow.pcm, durationSec: captureWindow.pcm.length / prepared.sampleRate }
    : prepared;
  return {
    audio,
    captureWindow,
    originalDurationSec: prepared.durationSec,
    processedDurationSec: audio.durationSec,
    startFrame: captureWindow?.startFrame ?? 0,
  };
}

export async function preparePlaygroundAudio({
  audioIsRecorded,
  recordedPcm,
  audioFile,
  sampleUrl,
  decodeAudio,
  decodeOptions,
}) {
  if (audioIsRecorded) {
    if (!recordedPcm) {
      throw new Error('Recorded microphone PCM is unavailable. Record the audio again.');
    }
    return { prepared: recordedPcm, isRecorded: true };
  }

  return {
    prepared: await decodeAudio(audioFile || sampleUrl, decodeOptions),
    isRecorded: false,
  };
}

export function stopAndDisposeMicrophoneSession(
  session,
  flush,
  recordingSessionRef,
  recordingGenerationRef,
  onSettled,
) {
  if (session.cleanupPromise) return session.cleanupPromise;
  session.stopping = true;
  session.cleanupPromise = (async () => {
    const errors = [];
    try {
      await session.controller.stop({ flush });
    } catch (error) {
      errors.push(error);
    }
    try {
      await session.controller.dispose();
    } catch (error) {
      errors.push(error);
    }

    const ownsSession = recordingSessionRef.current === session
      && recordingGenerationRef.current === session.id;
    if (ownsSession) {
      recordingSessionRef.current = null;
      recordingGenerationRef.current += 1;
    }
    onSettled?.(ownsSession);

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Microphone recording cleanup failed.');
  })();
  return session.cleanupPromise;
}

/** Select a new, not-yet-captured recording without falling back to stale audio. */
export function beginRecordedAudioCapture(recordedPcmRef) {
  recordedPcmRef.current = null;
  return { audioIsRecorded: true, audioFile: null, audioUrl: '', audioLabel: 'Microphone' };
}
