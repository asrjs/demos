export function prepareCapturedPcm(pcm, sampleRate, { paddingMs = 300 } = {}) {
  if (!(pcm instanceof Float32Array)) {
    throw new TypeError('Captured audio must be a Float32Array.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Captured audio sample rate must be positive.');
  }
  if (!Number.isFinite(paddingMs) || paddingMs < 0) {
    throw new RangeError('Captured audio padding must be non-negative.');
  }

  let firstNonZero = -1;
  let lastNonZero = -1;
  for (let index = 0; index < pcm.length; index += 1) {
    if (!Number.isFinite(pcm[index])) {
      throw new TypeError(`Captured audio contains a non-finite sample at frame ${index}.`);
    }
    if (pcm[index] !== 0) {
      if (firstNonZero < 0) firstNonZero = index;
      lastNonZero = index;
    }
  }

  // An all-zero capture has no safe speech bounds; preserve it unchanged so
  // the model can report its normal empty-audio behavior.
  const allZero = firstNonZero < 0;
  const paddingFrames = Math.round(sampleRate * paddingMs / 1000);
  const startFrame = allZero ? 0 : Math.max(0, firstNonZero - paddingFrames);
  const endFrame = allZero ? pcm.length : Math.min(pcm.length, lastNonZero + 1 + paddingFrames);
  return {
    pcm: allZero ? pcm : pcm.subarray(startFrame, endFrame),
    originalFrames: pcm.length,
    startFrame,
    endFrame,
    trimmedLeadingFrames: startFrame,
    trimmedTrailingFrames: pcm.length - endFrame,
    paddingFrames,
    policy: 'exact-zero-samples-only',
  };
}

function rebaseTimedRecords(records, offsetSeconds) {
  if (!Array.isArray(records)) return records;
  let changed = false;
  const rebased = records.map((record) => {
    if (!record || typeof record !== 'object') return record;
    const startTime = record.startTime;
    const endTime = record.endTime;
    if (!Number.isFinite(startTime) && !Number.isFinite(endTime)) return record;
    changed = true;
    return {
      ...record,
      ...(Number.isFinite(startTime) ? { startTime: startTime + offsetSeconds } : {}),
      ...(Number.isFinite(endTime) ? { endTime: endTime + offsetSeconds } : {}),
    };
  });
  return changed ? rebased : records;
}

/**
 * Rebase canonical transcript timestamps from a cropped PCM window onto its
 * original capture timeline. Native diagnostics and duration metadata stay
 * untouched.
 */
export function rebaseCapturedTranscriptTimes(result, startFrame, sampleRate) {
  if (!Number.isFinite(startFrame) || startFrame < 0) {
    throw new RangeError('Captured audio start frame must be non-negative.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Captured audio sample rate must be positive.');
  }
  if (startFrame === 0 || !result || typeof result !== 'object') return result;

  const offsetSeconds = startFrame / sampleRate;
  const rebaseCanonical = (canonical) => {
    if (
      !canonical
      || typeof canonical !== 'object'
      || typeof canonical.text !== 'string'
      || !canonical.meta
      || typeof canonical.meta !== 'object'
    ) {
      return canonical;
    }
    let changed = false;
    const rebased = { ...canonical };
    for (const field of ['segments', 'sentences', 'words', 'tokens']) {
      const records = canonical[field];
      if (!Array.isArray(records)) continue;
      const nextRecords = rebaseTimedRecords(records, offsetSeconds);
      if (nextRecords !== records) {
        rebased[field] = nextRecords;
        changed = true;
      }
    }
    return changed ? rebased : canonical;
  };

  if ('canonical' in result) {
    const canonical = rebaseCanonical(result.canonical);
    return canonical === result.canonical ? result : { ...result, canonical };
  }
  return rebaseCanonical(result);
}

/**
 * Transcribe one captured utterance through a model's native streaming contract
 * when it supports that contract. Audio chunks share one transcriber instance;
 * only the complete utterance is finalized and returned to the caller.
 */
export async function transcribeCapturedPcm(
  model,
  pcm,
  sampleRate,
  {
    toAudioInput,
    chunkDurationMs = 640,
    edgeSilenceMs = 300,
    streamingOptions = {},
    batchOptions,
  } = {},
) {
  if (!Number.isFinite(chunkDurationMs) || chunkDurationMs <= 0) {
    throw new RangeError('Streaming chunk duration must be positive.');
  }
  const prepared = prepareCapturedPcm(pcm, sampleRate, { paddingMs: edgeSilenceMs });
  const audioWindow = {
    inputFrames: prepared.originalFrames,
    startFrame: prepared.startFrame,
    endFrame: prepared.endFrame,
    outputFrames: prepared.pcm.length,
    leadingFramesRemoved: prepared.trimmedLeadingFrames,
    trailingFramesRemoved: prepared.trimmedTrailingFrames,
    edgeSilencePolicy: prepared.policy,
  };

  if (model?.supportsStreaming !== true || typeof model.createStreamingTranscriber !== 'function') {
    return {
      mode: 'batch',
      result: rebaseCapturedTranscriptTimes(
        await model.transcribePrepared({ pcm: prepared.pcm, sampleRate }, batchOptions),
        prepared.startFrame,
        sampleRate,
      ),
      audioWindow,
    };
  }
  if (typeof toAudioInput !== 'function') {
    throw new TypeError('Streaming capture requires an audio input adapter.');
  }

  const streamer = await model.createStreamingTranscriber({ emitPartials: false, ...streamingOptions });
  let operationError;
  let operationFailed = false;
  try {
    if (!streamer || typeof streamer.pushAudio !== 'function' || typeof streamer.finalize !== 'function') {
      throw new TypeError('Model returned an invalid streaming transcriber.');
    }
    const chunkSamples = Math.max(1, Math.round(sampleRate * chunkDurationMs / 1000));
    for (let offset = 0; offset < prepared.pcm.length; offset += chunkSamples) {
      const chunk = prepared.pcm.subarray(offset, Math.min(prepared.pcm.length, offset + chunkSamples));
      await streamer.pushAudio(toAudioInput(chunk, sampleRate));
    }
    return {
      mode: 'streaming',
      result: rebaseCapturedTranscriptTimes(await streamer.finalize(), prepared.startFrame, sampleRate),
      audioWindow,
    };
  } catch (error) {
    operationFailed = true;
    operationError = error;
    throw error;
  } finally {
    try {
      await streamer?.dispose?.();
    } catch (disposeError) {
      if (operationFailed) {
        throw new AggregateError(
          [operationError, disposeError],
          'Captured-audio inference and streaming cleanup both failed.',
        );
      }
      throw disposeError;
    }
  }
}
