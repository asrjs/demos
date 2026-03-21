import { useEffect, useRef, useState } from 'react';
import {
  createBrowserRealtimeMonitor,
  createBrowserRealtimeStarter,
  startMicrophoneCapture as startBrowserMicrophoneCapture,
  STREAMING_PROCESSING_SAMPLE_RATE,
  STREAMING_TIMELINE_CHUNK_FRAMES,
  STREAMING_TIMELINE_CHUNK_MS,
} from '@asrjs/speech-recognition/browser';
import { listStreamingPresets } from '@asrjs/speech-recognition/realtime';
import { usePersistentStreamingSettings } from './usePersistentStreamingSettings.js';

const STREAMING_MONITOR_FRAME_INTERVAL_MS = 33;

function resolveChunkFrames(sampleRate, chunkDurationMs) {
  return Math.max(1, Math.round((chunkDurationMs / 1000) * sampleRate));
}

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

function createCaptureInfo() {
  return {
    inputSampleRate: null,
    contextSampleRate: null,
    processingSampleRate: STREAMING_PROCESSING_SAMPLE_RATE,
    chunkFrames: STREAMING_TIMELINE_CHUNK_FRAMES,
    chunkDurationMs: STREAMING_TIMELINE_CHUNK_MS,
    deviceLabel: '',
  };
}

export function useStreamingCaptureController({
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
  const [monitor, setMonitor] = useState(null);
  const [captureInfo, setCaptureInfo] = useState(createCaptureInfo);
  const configuredChunkDurationMs = resolvedConfig.chunkDurationMs ?? STREAMING_TIMELINE_CHUNK_MS;
  const configuredChunkFrames = resolveChunkFrames(
    STREAMING_PROCESSING_SAMPLE_RATE,
    configuredChunkDurationMs,
  );

  const starterRef = useRef(null);
  const captureHandleRef = useRef(null);
  const monitorRef = useRef(null);
  const activeRef = useRef(false);
  const sampleRateRef = useRef(STREAMING_PROCESSING_SAMPLE_RATE);
  const inputSampleRateRef = useRef(null);
  const contextSampleRateRef = useRef(null);
  const chunkFramesRef = useRef(STREAMING_TIMELINE_CHUNK_FRAMES);
  const chunkDurationMsRef = useRef(STREAMING_TIMELINE_CHUNK_MS);
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

  function updateCaptureInfo(partial = {}) {
    const nextInfo = {
      inputSampleRate: inputSampleRateRef.current,
      contextSampleRate: contextSampleRateRef.current,
      processingSampleRate: sampleRateRef.current,
      chunkFrames: chunkFramesRef.current,
      chunkDurationMs: chunkDurationMsRef.current,
      deviceLabel: inputDeviceLabelRef.current,
      ...partial,
    };
    setCaptureInfo(nextInfo);
    return nextInfo;
  }

  useEffect(() => {
    const starter = createBrowserRealtimeStarter({
      profileId,
      config: resolvedConfig,
      isRealtimeEouModel,
    });
    const nextMonitor = createBrowserRealtimeMonitor(starter, {
      frameIntervalMs: STREAMING_MONITOR_FRAME_INTERVAL_MS,
    });
    starterRef.current = starter;
    monitorRef.current = nextMonitor;
    setMonitor(nextMonitor);

    const unsubscribe = starter.subscribe((event) => {
      if (event.type === 'metrics') {
        const nextSnapshot = event.payload;
        const tenVadState = nextSnapshot?.tenVad?.state;
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
      nextMonitor.dispose();
      void starter.dispose();
      monitorRef.current = null;
      starterRef.current = null;
      setMonitor(null);
    };
  }, [isRealtimeEouModel]);

  useEffect(() => {
    if (!starterRef.current) return;
    starterRef.current.updateConfig({
      ...resolvedConfig,
      profileId,
    });
    monitorRef.current?.flush();
  }, [profileId, resolvedConfig]);

  useEffect(() => {
    if (activeRef.current) {
      return;
    }
    chunkFramesRef.current = configuredChunkFrames;
    chunkDurationMsRef.current = configuredChunkDurationMs;
    updateCaptureInfo({
      processingSampleRate: STREAMING_PROCESSING_SAMPLE_RATE,
      chunkFrames: configuredChunkFrames,
      chunkDurationMs: configuredChunkDurationMs,
    });
  }, [configuredChunkDurationMs, configuredChunkFrames]);

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

    const nextSampleRate =
      input?.sampleRate || sampleRateRef.current || STREAMING_PROCESSING_SAMPLE_RATE;
    if (nextSampleRate !== sampleRateRef.current) {
      sampleRateRef.current = nextSampleRate;
      updateCaptureInfo({
        processingSampleRate: nextSampleRate,
      });
    } else {
      sampleRateRef.current = nextSampleRate;
    }

    if (micMode === 'manual') {
      manualChunksRef.current.push(chunk);
      updateStatus(
        `Recording microphone at ${sampleRateRef.current} Hz…`,
        'Microphone active',
      );
      return;
    }

    starterRef.current?.processChunk(chunk, {
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
      chunkFrames: configuredChunkFrames,
      chunkDurationMs: configuredChunkDurationMs,
      targetSampleRate: STREAMING_PROCESSING_SAMPLE_RATE,
      stopTracksOnStop: true,
      onChunk: handleChunk,
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        setMicError(message);
      },
    });

    captureHandleRef.current = captureHandle;
    sampleRateRef.current = captureHandle.sampleRate || STREAMING_PROCESSING_SAMPLE_RATE;
    inputSampleRateRef.current =
      captureHandle.deviceSampleRate ?? inputSampleRateRef.current;
    contextSampleRateRef.current =
      captureHandle.contextSampleRate ?? contextSampleRateRef.current;
    chunkFramesRef.current = captureHandle.chunkFrames ?? STREAMING_TIMELINE_CHUNK_FRAMES;
    chunkDurationMsRef.current = captureHandle.chunkDurationMs ?? STREAMING_TIMELINE_CHUNK_MS;
    updateCaptureInfo();
    monitorRef.current?.flush();
    activeRef.current = true;
    setIsMicActive(true);

    if (micMode === 'speech-detect') {
      await starterRef.current?.start({ sampleRate: sampleRateRef.current });
      const tenVadState = starterRef.current?.getSnapshot()?.tenVad?.state;
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
    contextSampleRateRef.current = null;
    inputDeviceLabelRef.current = '';
    updateCaptureInfo({
      inputSampleRate: null,
      contextSampleRate: null,
      deviceLabel: '',
    });

    if (micMode === 'speech-detect') {
      await starterRef.current?.stop({ flush });
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
    monitorRef.current?.flush();
  }

  function flush(reason = 'manual') {
    if (micMode === 'speech-detect') {
      starterRef.current?.flush(reason);
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
    monitor,
    captureInfo,
    start,
    stop,
    flush,
    presets: listStreamingPresets(),
  };
}
