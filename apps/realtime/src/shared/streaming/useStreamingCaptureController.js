import { useEffect, useRef, useState } from 'react';
import {
  createBrowserRealtimeMicrophoneController,
  STREAMING_PROCESSING_SAMPLE_RATE,
  STREAMING_TIMELINE_CHUNK_FRAMES,
  STREAMING_TIMELINE_CHUNK_MS,
} from '@asrjs/speech-recognition/browser';
import { listStreamingPresets } from '@asrjs/speech-recognition/realtime';
import { usePersistentStreamingSettings } from './usePersistentStreamingSettings.js';

const INITIAL_CONTROLLER_STATE = {
  isMicActive: false,
  micStatus: 'Microphone idle',
  micError: '',
  micMode: 'speech-detect',
  captureInfo: {
    inputSampleRate: null,
    contextSampleRate: null,
    processingSampleRate: STREAMING_PROCESSING_SAMPLE_RATE,
    chunkFrames: STREAMING_TIMELINE_CHUNK_FRAMES,
    chunkDurationMs: STREAMING_TIMELINE_CHUNK_MS,
    deviceLabel: '',
  },
  latency: null,
};

export function useStreamingCaptureController({
  modelId,
  isRealtimeEouModel,
  supportsMicrophoneInput,
  onUtterance,
  transcribe,
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

  const onUtteranceRef = useRef(onUtterance);
  const transcribeRef = useRef(transcribe);
  const onStatusRef = useRef(onStatus);
  const controllerRef = useRef(null);
  const [controllerState, setControllerState] = useState(INITIAL_CONTROLLER_STATE);
  const [monitor, setMonitor] = useState(null);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  useEffect(() => {
    transcribeRef.current = transcribe;
  }, [transcribe]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const controller = createBrowserRealtimeMicrophoneController({
      isRealtimeEouModel,
      transcriptionContext: { maxDurationSeconds: 30, maxGapSeconds: 3 },
      profileId,
      config: resolvedConfig,
      micMode,
      fireRedVadConfig: {
        wasmPaths: `${import.meta.env.BASE_URL}ort/`,
      },
      // TEN-VAD is not bundled with the SDK; the app hosts its Web build.
      tenVadConfig: {
        assetBaseUrl: `${import.meta.env.BASE_URL}wasm/`,
      },
      transcribe: (request) => {
        const next = transcribeRef.current;
        if (!next) {
          return {
            text: '',
            warnings: [],
            meta: { detailLevel: 'text', isFinal: true },
          };
        }
        return next(request);
      },
      onUtterance: (utterance) => onUtteranceRef.current?.(utterance),
      onStatus: (status) => onStatusRef.current?.(status),
    });
    controllerRef.current = controller;
    setMonitor(controller.monitor);
    setControllerState(controller.getState());
    const unsubscribe = controller.subscribe((nextState) => {
      setControllerState(nextState);
    });

    return () => {
      unsubscribe();
      setMonitor(null);
      controllerRef.current = null;
      void controller.dispose();
    };
  }, [isRealtimeEouModel]);

  useEffect(() => {
    controllerRef.current?.setMicMode(micMode);
  }, [micMode]);

  useEffect(() => {
    controllerRef.current?.configure({
      profileId,
      config: resolvedConfig,
    });
  }, [profileId, resolvedConfig]);

  return {
    isMicActive: controllerState.isMicActive,
    micStatus: controllerState.micStatus,
    micError: controllerState.micError,
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
    captureInfo: controllerState.captureInfo,
    latency: controllerState.latency ?? null,
    start: async () => {
      if (!supportsMicrophoneInput) {
        throw new Error('Microphone capture is not available in this browser.');
      }
      return controllerRef.current?.start();
    },
    stop: async (options) => controllerRef.current?.stop(options),
    flush: (reason) => controllerRef.current?.flush(reason),
    presets: listStreamingPresets(),
  };
}
