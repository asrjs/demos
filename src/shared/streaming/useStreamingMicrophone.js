import { useEffect, useRef, useState } from 'react';
import { startMicrophoneCapture as startBrowserMicrophoneCapture } from '@asrjs/speech-recognition/browser';
import { StreamingSpeechDetector } from './detector.js';
import { listStreamingPresets } from './presets.js';
import { usePersistentStreamingSettings } from './usePersistentStreamingSettings.js';

function concatFloat32Chunks(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resolveTargetChunkSize(config) {
  const windowMs = config?.analysisWindowMs ?? 80;
  const targetFrames = Math.max(256, Math.round((windowMs / 1000) * 16000));
  let bufferSize = 256;
  while (bufferSize < targetFrames && bufferSize < 16384) {
    bufferSize *= 2;
  }
  return bufferSize;
}

export function useStreamingMicrophone({
  modelId,
  isRealtimeEouModel,
  supportsMicrophoneInput,
  onUtterance,
  onStatus,
}) {
  const {
    micMode,
    setMicMode,
    hudVisible,
    setHudVisible,
    profileId,
    resolvedConfig,
    applyPreset,
    updateConfig,
    resetToDefaults,
    defaultMode,
  } = usePersistentStreamingSettings({
    modelId,
    isRealtimeEouModel,
  });

  const [isMicActive, setIsMicActive] = useState(false);
  const [micStatus, setMicStatus] = useState('Microphone idle');
  const [micError, setMicError] = useState('');
  const [snapshot, setSnapshot] = useState(null);

  const detectorRef = useRef(null);
  const captureHandleRef = useRef(null);
  const activeRef = useRef(false);
  const sampleRateRef = useRef(16000);
  const inputSampleRateRef = useRef(null);
  const inputDeviceLabelRef = useRef('');
  const manualChunksRef = useRef([]);
  const onUtteranceRef = useRef(onUtterance);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const detector = new StreamingSpeechDetector({
      profileId,
      config: resolvedConfig,
      isRealtimeEouModel,
    });
    detectorRef.current = detector;
    setSnapshot(enrichSnapshot(detector.getSnapshot()));

    const unsubscribe = detector.subscribe((event) => {
      if (event.type === 'metrics') {
        setSnapshot(enrichSnapshot(event.payload));
        const tenVadState = event.payload?.tenVad?.state;
        if (activeRef.current && tenVadState === 'degraded') {
          setMicStatus('Listening with rough gate fallback…');
        }
      } else if (event.type === 'speech-start') {
        setMicStatus('Speech detected. Rewinding to onset…');
      } else if (event.type === 'speech-update') {
        setMicStatus('Speech active. Waiting for a natural pause…');
      } else if (event.type === 'speech-end') {
        setMicStatus('Detected a pause. Finalizing utterance…');
      } else if (event.type === 'segment-ready') {
        const pcm = event.payload.readPcm();
        const durationSeconds = pcm.length / event.payload.sampleRate;
        onUtteranceRef.current?.({
          pcm,
          sampleRate: event.payload.sampleRate,
          reason: event.payload.reason,
          durationSeconds,
          sourceLabel: `microphone-${event.payload.reason}-${new Date().toLocaleTimeString()}`,
          metadata: event.payload.metadata,
        });
      } else if (event.type === 'error') {
        const message = event.payload?.message ?? String(event.payload);
        setMicError(message);
      }
    });

    return () => {
      unsubscribe();
      detector.dispose();
      detectorRef.current = null;
    };
  }, [isRealtimeEouModel, profileId, resolvedConfig]);

  useEffect(() => {
    if (!detectorRef.current) return;
    detectorRef.current.updateConfig({
      ...resolvedConfig,
      profileId,
    });
    setSnapshot(enrichSnapshot(detectorRef.current.getSnapshot()));
  }, [profileId, resolvedConfig]);

  function enrichSnapshot(baseSnapshot) {
    return {
      ...baseSnapshot,
      capture: {
        inputSampleRate: inputSampleRateRef.current,
        processingSampleRate: sampleRateRef.current,
        deviceLabel: inputDeviceLabelRef.current,
      },
    };
  }

  function updateStatus(nextStatus, appStatus = nextStatus) {
    setMicStatus(nextStatus);
    onStatusRef.current?.(appStatus);
  }

  function handleChunk(input) {
    const chunk =
      input?.pcm instanceof Float32Array
        ? input.pcm
        : input?.inputBuffer?.getChannelData
          ? new Float32Array(input.inputBuffer.getChannelData(0))
          : null;
    if (!chunk?.length) return;

    sampleRateRef.current = input?.sampleRate || sampleRateRef.current || 16000;

    if (micMode === 'manual') {
      manualChunksRef.current.push(chunk);
      updateStatus(
        `Recording microphone at ${sampleRateRef.current} Hz…`,
        'Microphone active',
      );
      return;
    }

    detectorRef.current?.processChunk(chunk, {
      startFrame: input?.startFrame,
      endFrame: input?.endFrame,
    });
  }

  async function start() {
    if (!supportsMicrophoneInput) {
      throw new Error('Microphone capture is not available in this browser.');
    }

    setMicError('');
    manualChunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const trackSettings = audioTrack?.getSettings?.() ?? null;
    inputSampleRateRef.current =
      typeof trackSettings?.sampleRate === 'number' ? trackSettings.sampleRate : null;
    inputDeviceLabelRef.current = audioTrack?.label ?? '';

    const captureHandle = await startBrowserMicrophoneCapture({
      stream,
      bufferSize: resolveTargetChunkSize(resolvedConfig),
      targetSampleRate: 16000,
      stopTracksOnStop: true,
      onChunk: handleChunk,
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        setMicError(message);
      },
    });

    captureHandleRef.current = captureHandle;
    sampleRateRef.current = captureHandle.sampleRate || 16000;
    setSnapshot((current) =>
      current
        ? {
            ...current,
            capture: {
              inputSampleRate: inputSampleRateRef.current,
              processingSampleRate: sampleRateRef.current,
              deviceLabel: inputDeviceLabelRef.current,
            },
          }
        : current,
    );
    activeRef.current = true;
    setIsMicActive(true);

    if (micMode === 'speech-detect') {
      await detectorRef.current?.start({ sampleRate: sampleRateRef.current });
      const tenVadState = detectorRef.current?.getSnapshot()?.tenVad?.state;
      updateStatus(
        tenVadState === 'degraded'
          ? `Listening for speech at ${sampleRateRef.current} Hz with rough gate fallback…`
          : `Listening for speech at ${sampleRateRef.current} Hz with streaming detector…`,
        'Microphone active',
      );
    } else {
      updateStatus(
        `Recording microphone at ${sampleRateRef.current} Hz. Stop to transcribe the captured audio.`,
        'Microphone active',
      );
    }
  }

  async function stop({ flush = true } = {}) {
    activeRef.current = false;
    setIsMicActive(false);

    const captureHandle = captureHandleRef.current;
    captureHandleRef.current = null;
    if (captureHandle) {
      await captureHandle.stop();
    }
    inputSampleRateRef.current = null;
    inputDeviceLabelRef.current = '';

    if (micMode === 'speech-detect') {
      await detectorRef.current?.stop({ flush });
    } else if (flush && manualChunksRef.current.length > 0) {
      const pcm = concatFloat32Chunks(manualChunksRef.current);
      manualChunksRef.current = [];
      onUtteranceRef.current?.({
        pcm,
        sampleRate: sampleRateRef.current,
        reason: 'stop',
        durationSeconds: pcm.length / sampleRateRef.current,
        sourceLabel: `microphone-stop-${new Date().toLocaleTimeString()}`,
        metadata: null,
      });
    } else {
      manualChunksRef.current = [];
    }

    updateStatus('Microphone stopped', 'Model ready');
    setSnapshot((current) =>
      current
        ? {
            ...current,
            capture: {
              inputSampleRate: null,
              processingSampleRate: sampleRateRef.current,
              deviceLabel: '',
            },
          }
        : current,
    );
  }

  function flush(reason = 'manual') {
    if (micMode === 'speech-detect') {
      detectorRef.current?.flush(reason);
      return;
    }

    if (!manualChunksRef.current.length) return;
    const pcm = concatFloat32Chunks(manualChunksRef.current);
    manualChunksRef.current = [];
    onUtteranceRef.current?.({
      pcm,
      sampleRate: sampleRateRef.current,
      reason,
      durationSeconds: pcm.length / sampleRateRef.current,
      sourceLabel: `microphone-${reason}-${new Date().toLocaleTimeString()}`,
      metadata: null,
    });
  }

  return {
    isMicActive,
    micStatus,
    micError,
    micMode,
    setMicMode,
    hudVisible,
    setHudVisible,
    profileId,
    applyPreset,
    updateConfig,
    resetToDefaults,
    defaultMode,
    snapshot,
    start,
    stop,
    flush,
    presets: listStreamingPresets(),
  };
}
