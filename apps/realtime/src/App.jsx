import React, { useState, useRef, useEffect } from 'react';
import {
  buildSpeechModelLoadOptions,
  detectSpeechModelRepoQuantizations,
  getSpeechModelLanguageName,
} from '@asrjs/speech-recognition';
import { createBrowserTranscriptionWorkerClient } from '@asrjs/speech-recognition/browser';
import { pickPreferredQuant } from '@asrjs/speech-recognition/io';
import { SPEECH_DATASETS } from './utils/speechDatasets';
import { buildLayoutApp } from './app/buildLayoutApp.js';
import {
  MIC_MIN_UTTERANCE_MS,
  MODEL_SOURCE_OPTIONS,
  REALTIME_EOU_MODEL_ID,
  isInIframe,
} from './app/constants.js';
import {
  getCanonicalRevision,
  getDescriptorDecoderBackendOptions,
  getDescriptorDecoderQuantOptions,
  getDescriptorDefaultDecoderQuant,
  getDescriptorDefaultEncoderQuant,
  getDescriptorDefaultPreprocessorBackend,
  getDescriptorDefaultPreprocessorName,
  getDescriptorEncoderBackendOptions,
  getDescriptorEncoderQuantOptions,
  getDescriptorPreprocessorBackendOptions,
  resolvePreprocessorBackendForSource,
} from './app/modelDescriptors.js';
import { loadSettings, saveSettings } from './app/settingsStorage.js';
import { useDemoTheme } from '@asrjs/demo-ui';
import {
  getDemoModelLoadingState,
  getDemoModelSourceOptions,
  resolveDemoModelSource,
  resolveProfilingSetting,
  prepareCapturedPcm,
  rebaseCapturedTranscriptTimes,
} from '@asrjs/demo-runtime';
import { createTranscriptionRecordFromResult } from './app/transcriptionRecord.js';
import { buildTranscriptionOptions } from './app/transcriptionHelpers.js';
import { createCaptureTranscript } from './app/captureTranscript.js';
import { releaseCurrentModel } from './app/modelLifecycle.js';
import { useLocalModelFolder } from './app/useLocalModelFolder.js';
import { encodeMonoPcmToWavBlob } from './app/audioUtils.js';
import {
  loadModelFlow,
  loadRandomSampleFlow,
  transcribeUploadedFileFlow,
} from './app/transcriptionFlows.js';
import { disposeHubDemoPipeline } from './shared/modelLoader.js';
import { DEMO_MODELS, MODEL_OPTIONS } from './shared/modelCatalog.js';
import { useStreamingCaptureController } from './shared/streaming/useStreamingCaptureController.js';
import { useStreamingMonitor } from './shared/streaming/useStreamingMonitor.js';
import { BrowserConsoleLayout } from './BrowserConsoleLayout.jsx';
import warmupAudioUrl from './assets/Harvard-L2-1.ogg?url';
import './App.css';

function revokeHistoryClipUrls(records) {
  for (const record of records) {
    if (record?.clipUrl) {
      URL.revokeObjectURL(record.clipUrl);
    }
  }
}

function buildHistoryClipFilename(sourceLabel, timestamp = Date.now()) {
  const baseName = String(sourceLabel || 'microphone')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'microphone';
  return `${baseName}-${timestamp}.wav`;
}

function logMicrophoneQueue(message, meta = {}) {
  console.debug(`[MicQueue] ${message}`, meta);
}

export default function App() {
  const initialSettings = loadSettings();
  const initialSelectedModel = initialSettings.selectedModel;
  const initialModelSource = initialSettings.modelSource;
  const initialModelCandidate = DEMO_MODELS[initialSelectedModel] ? initialSelectedModel : 'parakeet-tdt-0.6b-v2';
  const resolvedInitialModel = initialModelCandidate;
  const resolvedInitialModelSource = resolveDemoModelSource(resolvedInitialModel, initialModelSource);
  const initialDefaultPreprocessorName = getDescriptorDefaultPreprocessorName(resolvedInitialModel);
  const initialDefaultPreprocessorBackend = resolvePreprocessorBackendForSource(
    resolvedInitialModel,
    initialSettings.preprocessorBackend,
    { modelSource: resolvedInitialModelSource },
  );
  const [modelSource, setModelSource] = useState(
    resolvedInitialModelSource
  );
  const [selectedModel, setSelectedModel] = useState(resolvedInitialModel);
  const [modelRevision, setModelRevision] = useState(getCanonicalRevision(resolvedInitialModel));
  const modelConfig = DEMO_MODELS[selectedModel];
  const [selectedLanguage, setSelectedLanguage] = useState(initialSettings.selectedLanguage || 'en');
  const [canaryTask, setCanaryTask] = useState(initialSettings.canaryTask || 'asr');
  const [canaryTargetLanguage, setCanaryTargetLanguage] = useState(
    initialSettings.canaryTargetLanguage || modelConfig?.defaultTargetLanguage || 'en'
  );
  const [canaryPnc, setCanaryPnc] = useState(
    initialSettings.canaryPnc === undefined ? true : Boolean(initialSettings.canaryPnc)
  );
  const [canaryTimestamps, setCanaryTimestamps] = useState(Boolean(initialSettings.canaryTimestamps));
  // Use hybrid mode by default (WebGPU encoder + WASM decoder)
  const [backend, setBackend] = useState(initialSettings.backend || 'webgpu-hybrid');
  const [encoderBackend, setEncoderBackend] = useState(
    initialSettings.encoderBackend || getDescriptorEncoderBackendOptions(resolvedInitialModel)[0] || 'webgpu'
  );
  const [decoderBackend, setDecoderBackend] = useState(
    initialSettings.decoderBackend || getDescriptorDecoderBackendOptions(resolvedInitialModel)[0] || 'wasm'
  );
  const [encoderBackendOptions, setEncoderBackendOptions] = useState(
    getDescriptorEncoderBackendOptions(resolvedInitialModel)
  );
  const [decoderBackendOptions, setDecoderBackendOptions] = useState(
    getDescriptorDecoderBackendOptions(resolvedInitialModel)
  );
  const [threadingStatus, setThreadingStatus] = useState({ sab: false, threads: 1 });
  const [encoderQuant, setEncoderQuant] = useState(
    initialSettings.encoderQuant || getDescriptorDefaultEncoderQuant(resolvedInitialModel)
  );
  const [decoderQuant, setDecoderQuant] = useState(
    initialSettings.decoderQuant || getDescriptorDefaultDecoderQuant(resolvedInitialModel)
  );
  const [encoderQuantOptions, setEncoderQuantOptions] = useState(
    getDescriptorEncoderQuantOptions(resolvedInitialModel)
  );
  const [decoderQuantOptions, setDecoderQuantOptions] = useState(
    getDescriptorDecoderQuantOptions(resolvedInitialModel)
  );
  const [preprocessor, setPreprocessor] = useState(initialSettings.preprocessor || initialDefaultPreprocessorName);
  const [preprocessorBackend, setPreprocessorBackend] = useState(initialDefaultPreprocessorBackend);
  const [status, setStatus] = useState('Idle');
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [text, setText] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [transcriptions, setTranscriptions] = useState([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [verboseLog, setVerboseLog] = useState(Boolean(initialSettings.verboseLog));
  const [frameStride, setFrameStride] = useState(Number.isInteger(initialSettings.frameStride) ? initialSettings.frameStride : 1);
  const [dumpDetail, setDumpDetail] = useState(Boolean(initialSettings.dumpDetail));
  const [enableProfiling, setEnableProfiling] = useState(resolveProfilingSetting(initialSettings));
  const [audioUrl, setAudioUrl] = useState(null);
  const [sampleDownload, setSampleDownload] = useState(null);
  const [isDownloadingSample, setIsDownloadingSample] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const { darkMode } = useDemoTheme({ storageKey: 'asrjs-theme' });
  const [modelLoaded, setModelLoaded] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const maxCores = navigator.hardwareConcurrency || 8;
  const [cpuThreads, setCpuThreads] = useState(
    Number.isInteger(initialSettings.cpuThreads)
      ? Math.min(maxCores, Math.max(1, initialSettings.cpuThreads))
      : Math.max(1, maxCores - 2)
  );
  const modelRef = useRef(null);
  const fileInputRef = useRef(null);
  const modelFolderInputRef = useRef(null);
  const audioRef = useRef(null);
  const transcriptionsRef = useRef([]);
  const micTranscriptionQueueRef = useRef([]);
  const captureTranscriptRef = useRef(createCaptureTranscript());
  const micQueueRunningRef = useRef(false);
  const micPendingJobsRef = useRef(0);
  const isMicActiveRef = useRef(false);
  const micTranscriberRef = useRef(null);
  const micWorkerClientRef = useRef(null);
  const micWorkerLoadGenerationRef = useRef(0);
  const isUnmountingRef = useRef(false);
  const loadModelRunningRef = useRef(false);
  const {
    localEntries,
    localFolderName,
    hasPersistedLocalHandle,
    needsLocalHandleReconnect,
    localHandlePersistenceSupported,
    localTokenizerOptions,
    localTokenizerName,
    setLocalTokenizerName,
    localPreprocessorOptions,
    localDetectedArtifacts,
    pickLocalModelFolder,
    handleLocalFolderInput,
    reconnectPersistedFolder,
  } = useLocalModelFolder({
    modelSource,
    selectedModel,
    backend,
    encoderBackend,
    decoderBackend,
    preprocessorBackend,
    currentPreprocessor: preprocessor,
    currentEncoderQuant: encoderQuant,
    currentDecoderQuant: decoderQuant,
    modelFolderInputRef,
    setStatus,
    setEncoderQuantOptions,
    setDecoderQuantOptions,
    setEncoderQuant,
    setDecoderQuant,
    setEncoderBackend,
    setDecoderBackend,
    setPreprocessor,
    setPreprocessorBackend,
  });

  const isModelReady = modelLoaded;
  const isLoading = isModelLoading;
  const modelSourceOptions = getDemoModelSourceOptions(selectedModel);
  const supportsLocalSource = modelSourceOptions.includes(MODEL_SOURCE_OPTIONS.LOCAL);
  const supportsSplitQuantization = encoderQuantOptions.length > 1 || decoderQuantOptions.length > 1;
  const supportsPreprocessorBackend = modelConfig?.loading?.supportsPreprocessorBackend !== false;
  const preprocessorBackendOptions = getDescriptorPreprocessorBackendOptions(selectedModel);
  const defaultPreprocessorName = getDescriptorDefaultPreprocessorName(selectedModel);
  const defaultPreprocessorBackend = getDescriptorDefaultPreprocessorBackend(selectedModel);
  const hostedModelUsesJsFrontend =
    modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE &&
    defaultPreprocessorBackend === 'js';
  const isRealtimeEouModel = selectedModel === REALTIME_EOU_MODEL_ID;
  const supportsMicrophoneInput =
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';
  const supportsCanaryPrompting = modelConfig?.capabilities?.supportsPromptControls === true;
  const effectiveCanaryTargetLanguage =
    canaryTask === 'asr' ? selectedLanguage : canaryTargetLanguage;
  const isCanaryTranslationMode =
    supportsCanaryPrompting &&
    canaryTask !== 'asr' &&
    effectiveCanaryTargetLanguage !== selectedLanguage;

  function resolveAppStatus(nextStatus) {
    if (nextStatus === 'Model ready' && !modelRef.current) {
      return 'Microphone idle (no model loaded)';
    }
    return nextStatus;
  }

  function updateTranscriptions(nextValue) {
    setTranscriptions((previous) => {
      const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
      transcriptionsRef.current = resolved;
      return resolved;
    });
  }

  async function resetMicWorkerTranscriber() {
    micWorkerLoadGenerationRef.current += 1;
    micTranscriberRef.current = modelRef.current;
    const workerClient = micWorkerClientRef.current;
    if (!workerClient) {
      return;
    }
    try {
      await workerClient.disposeModel();
    } catch (error) {
      console.warn('[MicWorker] Failed to dispose worker model:', error);
    }
  }

  async function prepareMicWorkerTranscriber() {
    const model = modelRef.current;
    if (!model) {
      await resetMicWorkerTranscriber();
      return;
    }

    const generation = ++micWorkerLoadGenerationRef.current;
    micTranscriberRef.current = model;
    const workerClient =
      micWorkerClientRef.current ??
      createBrowserTranscriptionWorkerClient();
    micWorkerClientRef.current = workerClient;

    try {
      const commonLoadOptions = {
        wasmPaths: new URL(import.meta.env.BASE_URL + 'ort/', window.location.href).href,
        modelId: selectedModel,
        encoderBackend,
        decoderBackend,
        encoderQuant,
        decoderQuant,
        preprocessorName: preprocessor,
        preprocessorBackend,
        backend,
        verbose: verboseLog,
        cpuThreads,
        enableProfiling,
      };
      let workerModelInfo = null;
      if (modelSource === MODEL_SOURCE_OPTIONS.LOCAL) {
        const loadingState = getDemoModelLoadingState({
          modelId: selectedModel,
          source: modelSource,
          entries: localEntries,
          backend,
          encoderBackend,
          decoderBackend,
          encoderQuant,
          decoderQuant,
        });
        workerModelInfo = await workerClient.loadLocalModel({
          ...commonLoadOptions,
          encoderBackend: loadingState.encoderBackend,
          decoderBackend: loadingState.decoderBackend,
          encoderQuant: loadingState.encoderQuant,
          decoderQuant: loadingState.decoderQuant,
          entries: localEntries,
          tokenizerName: localTokenizerName,
        });
      } else {
        workerModelInfo = await workerClient.loadBuiltInModel(
          buildSpeechModelLoadOptions({
            ...commonLoadOptions,
            revision: modelRevision,
          }),
        );
      }

      if (micWorkerLoadGenerationRef.current !== generation) {
        return;
      }

      micTranscriberRef.current = workerClient;
      console.log('[MicWorker] Ready', workerModelInfo);
    } catch (error) {
      if (micWorkerLoadGenerationRef.current !== generation) {
        return;
      }
      micTranscriberRef.current = model;
      console.warn('[MicWorker] Falling back to main-thread model for microphone transcriptions:', error);
    }
  }

  async function drainMicrophoneTranscriptionQueue() {
    if (micQueueRunningRef.current) {
      return;
    }
    micQueueRunningRef.current = true;

    while (micTranscriptionQueueRef.current.length > 0) {
      const job = micTranscriptionQueueRef.current.shift();
      if (!job) {
        continue;
      }
      let failureMessage = null;

      logMicrophoneQueue('start', {
        sourceLabel: job.sourceLabel,
        durationSeconds: Number(job.durationSeconds.toFixed(2)),
        pending: micTranscriptionQueueRef.current.length,
        transcriber: job.transcriberLabel,
      });

      try {
        const result = await job.transcriber.transcribeMonoPcm(
          job.pcm,
          job.sampleRate,
          job.options,
        );
        const canonicalResult = result?.canonical ?? result ?? null;

        if (job.dumpDetail) {
          console.log('[Mic] Transcription result:', result);
        }

        if (isUnmountingRef.current) {
          job.settle?.(toMicrophoneTranscriptResult(canonicalResult));
          continue;
        }

        const clipTimestamp = Date.now();
        const clipBlob = encodeMonoPcmToWavBlob(job.pcm, { sampleRate: job.sampleRate });
        const clipUrl = URL.createObjectURL(clipBlob);
        if (isUnmountingRef.current) {
          URL.revokeObjectURL(clipUrl);
          job.settle?.(toMicrophoneTranscriptResult(canonicalResult));
          continue;
        }

        setLatestMetrics(canonicalResult?.meta?.metrics ?? null);
        if (job.captureTranscript === captureTranscriptRef.current) {
          setText(job.captureTranscript.update(canonicalResult?.text ?? '', job.context));
        }
        if (job.context) {
          for (const record of transcriptionsRef.current) {
            if (record.captureContextId === job.context.id && record.clipUrl) URL.revokeObjectURL(record.clipUrl);
          }
        }
        updateTranscriptions((prev) => [
          { ...createTranscriptionRecordFromResult({
            result,
            filename: job.sourceLabel,
            duration: job.durationSeconds,
            audioDuration: job.durationSeconds,
            startTimeSeconds: job.startTimeSeconds,
            task: job.task,
            targetLanguage: job.targetLanguage,
            clipUrl,
            clipFilename: buildHistoryClipFilename(job.sourceLabel, clipTimestamp),
            clipMimeType: clipBlob.type || 'audio/wav',
          }), captureContextId: job.context?.id },
          ...prev.filter((record) => !job.context || record.captureContextId !== job.context.id),
        ]);

        logMicrophoneQueue('complete', {
          sourceLabel: job.sourceLabel,
          textLength: String(canonicalResult?.text ?? '').length,
          pending: micTranscriptionQueueRef.current.length,
        });
        job.settle?.(toMicrophoneTranscriptResult(canonicalResult));
      } catch (error) {
        failureMessage = error instanceof Error ? error.message : String(error);
        console.error('[Mic] Transcription failed:', error);
        logMicrophoneQueue('failed', {
          sourceLabel: job.sourceLabel,
          pending: micTranscriptionQueueRef.current.length,
          error: failureMessage,
        });
        job.settle?.(emptyMicrophoneTranscriptResult());
        if (!isUnmountingRef.current) {
          setStatus(`Microphone transcription failed: ${failureMessage}`);
        }
      } finally {
        micPendingJobsRef.current = Math.max(0, micPendingJobsRef.current - 1);
      }

      if (isUnmountingRef.current) {
        break;
      }
      if (micPendingJobsRef.current === 0 && micTranscriptionQueueRef.current.length === 0) {
        setIsTranscribing(false);
      }
      if (failureMessage) {
        continue;
      }
      if (micPendingJobsRef.current > 0 || micTranscriptionQueueRef.current.length > 0) {
        setStatus(
          `Transcribing microphone queue (${Math.max(
            micPendingJobsRef.current,
            micTranscriptionQueueRef.current.length,
          )} pending)…`,
        );
      } else {
        setStatus(isMicActiveRef.current ? 'Microphone active' : 'Model ready');
      }
    }

    micQueueRunningRef.current = false;
  }

  function emptyMicrophoneTranscriptResult() {
    return { text: '', warnings: [], meta: { detailLevel: 'text', isFinal: true } };
  }

  function toMicrophoneTranscriptResult(canonical) {
    if (!canonical) {
      return emptyMicrophoneTranscriptResult();
    }
    return {
      text: canonical.text ?? '',
      warnings: canonical.warnings ?? [],
      meta: {
        ...(canonical.meta ?? {}),
        detailLevel: canonical.meta?.detailLevel ?? 'text',
        isFinal: true,
      },
      segments: canonical.segments,
      sentences: canonical.sentences,
      words: canonical.words,
      tokens: canonical.tokens,
    };
  }

  function queueMicrophoneTranscription(pcm, sampleRate, sourceLabel, startTimeSeconds = null, context = null) {
    return new Promise((resolve) => {
      if (!pcm.length || isUnmountingRef.current) {
        resolve(emptyMicrophoneTranscriptResult());
        return;
      }
      if (loadModelRunningRef.current) {
        onMicStatus('Model is loading; microphone input is paused');
        resolve(emptyMicrophoneTranscriptResult());
        return;
      }

      // VAD contexts already own exact frame bounds. Manual capture may carry
      // long exact-zero device padding; preserve all nonzero and internal audio.
      let captureWindow = null;
      if (!context) {
        const prepared = prepareCapturedPcm(pcm, sampleRate);
        captureWindow = { originalFrames: prepared.originalFrames, startFrame: prepared.startFrame,
          endFrame: prepared.endFrame, policy: prepared.policy };
        pcm = prepared.pcm;
        if (startTimeSeconds !== null) startTimeSeconds += prepared.startFrame / sampleRate;
      }
      const durationSeconds = pcm.length / sampleRate;
      if (durationSeconds * 1000 < MIC_MIN_UTTERANCE_MS) {
        onMicStatus(isMicActiveRef.current ? 'Listening for speech…' : 'Microphone stopped');
        resolve(emptyMicrophoneTranscriptResult());
        return;
      }

      if (!modelRef.current) {
        setStatus(`Captured ${sourceLabel} (${durationSeconds.toFixed(2)} s). Load a model to transcribe.`);
        resolve(emptyMicrophoneTranscriptResult());
        return;
      }
      const transcriber = micTranscriberRef.current ?? modelRef.current;
      const transcriberLabel = transcriber === micWorkerClientRef.current ? 'worker' : 'main';

      const options = buildTranscriptionOptions(selectedModel, {
        sourceLanguage: selectedLanguage,
        targetLanguage: effectiveCanaryTargetLanguage,
        task: canaryTask,
        punctuate: canaryPnc,
        timestamps: supportsCanaryPrompting ? canaryTimestamps : true,
        frameStride,
        enableProfiling,
      });
      const task = supportsCanaryPrompting ? canaryTask : 'asr';
      const targetLanguage = supportsCanaryPrompting ? effectiveCanaryTargetLanguage : null;

      micPendingJobsRef.current += 1;
      setIsTranscribing(true);
      setReferenceText('');
      setSampleDownload(null);
      micTranscriptionQueueRef.current.push({
        transcriber,
        transcriberLabel,
        context,
        captureTranscript: captureTranscriptRef.current,
        pcm,
        sampleRate,
        sourceLabel,
        durationSeconds,
        startTimeSeconds,
        options,
        task,
        targetLanguage,
        dumpDetail,
        settle: (result) => resolve(rebaseCapturedTranscriptTimes(
          result, captureWindow?.startFrame ?? 0, sampleRate,
        )),
      });
      logMicrophoneQueue('enqueue', {
        sourceLabel,
        context,
        captureWindow,
        durationSeconds: Number(durationSeconds.toFixed(2)),
        pending: micTranscriptionQueueRef.current.length,
        transcriber: transcriberLabel,
      });
      setStatus(`Transcribing microphone queue (${micTranscriptionQueueRef.current.length} pending)…`);
      void drainMicrophoneTranscriptionQueue();
    });
  }

  const {
    isMicActive,
    micStatus,
    micError,
    micMode,
    setMicMode,
    hudVisible,
    setHudVisible,
    profileId,
    applyPreset,
    updateConfig: updateStreamingConfig,
    resetToDefaults: resetStreamingDefaults,
    defaultMode,
    monitor: streamingMonitor,
    captureInfo: streamingCaptureInfo,
    latency: streamingLatency,
    start: startMicrophoneCapture,
    stop: stopMicrophoneCapture,
    flush: flushMicrophoneUtterance,
    presets: streamingPresets,
  } = useStreamingCaptureController({
    modelId: selectedModel,
    isRealtimeEouModel,
    supportsMicrophoneInput,
    transcribe: (request) =>
      queueMicrophoneTranscription(
        request.pcm,
        request.sampleRate,
        `microphone-${request.segmentReason ?? request.reason}-${new Date().toLocaleTimeString()}`,
        request.startTimeSeconds,
        request.context,
      ),
    onStatus: (nextStatus) => setStatus(resolveAppStatus(nextStatus)),
  });
  const streamingSnapshot = useStreamingMonitor({
    monitor: streamingMonitor,
    captureInfo: streamingCaptureInfo,
  });

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  function onMicStatus(nextStatus) {
    if (nextStatus) {
      setStatus(resolveAppStatus(nextStatus));
    }
  }

  async function handleStartMicrophoneCapture() {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      setReferenceText('');
      setSampleDownload(null);
      captureTranscriptRef.current = createCaptureTranscript(text);
      await startMicrophoneCapture();
    } catch (error) {
      console.error('[Mic] Failed to start microphone:', error);
      setStatus(`Microphone error: ${error.message}`);
    }
  }

  async function handleStopMicrophoneCapture(options = { flush: true }) {
    await stopMicrophoneCapture(options);
  }

  // Get available languages for test samples
  const testLanguageOptions = Object.entries(SPEECH_DATASETS)
    .filter(([code]) => !modelConfig?.languages?.length || modelConfig.languages.includes(code))
    .map(([code, config]) => ({
      code,
      displayName: config.displayName,
    }));

  // Auto-adjust quant presets when backend changes (within available options).
  useEffect(() => {
    setEncoderQuant((current) =>
      encoderQuantOptions.includes(current) ? current : pickPreferredQuant(encoderQuantOptions, backend, 'encoder')
    );
    setDecoderQuant((current) =>
      decoderQuantOptions.includes(current) ? current : pickPreferredQuant(decoderQuantOptions, backend, 'decoder')
    );
  }, [backend, encoderQuantOptions, decoderQuantOptions]);

  // Keep model revision pinned to canonical branch per model.
  useEffect(() => {
    if (modelSource !== MODEL_SOURCE_OPTIONS.HUGGINGFACE) return;
    setModelRevision(getCanonicalRevision(selectedModel));
  }, [selectedModel, modelSource]);

  useEffect(() => {
    const resolved = resolveDemoModelSource(selectedModel, modelSource);
    if (resolved && resolved !== modelSource) {
      setModelSource(resolved);
      setStatus(`Using ${resolved} source for this model.`);
    }
  }, [modelSource, selectedModel]);

  useEffect(() => {
    if (!testLanguageOptions.length) return;
    if (testLanguageOptions.some((option) => option.code === selectedLanguage)) return;
    setSelectedLanguage(testLanguageOptions[0].code);
  }, [selectedLanguage, testLanguageOptions]);

  useEffect(() => {
    const loadingState = getDemoModelLoadingState({
      modelId: selectedModel,
      source: modelSource,
      entries: localEntries,
      backend,
      encoderBackend,
      decoderBackend,
      encoderQuant,
      decoderQuant,
    });

    setEncoderBackendOptions(modelConfig?.loading?.availableEncoderBackends || ['webgpu', 'wasm']);
    setDecoderBackendOptions(modelConfig?.loading?.availableDecoderBackends || ['webgpu', 'wasm']);
    setEncoderBackend(loadingState.encoderBackend);
    setDecoderBackend(loadingState.decoderBackend);
  }, [backend, decoderBackend, encoderBackend, encoderQuant, decoderQuant, localEntries, modelConfig, modelSource, selectedModel]);

  useEffect(() => {
    if (modelSource === MODEL_SOURCE_OPTIONS.LOCAL) return;
    const nextEncOptions = modelConfig?.loading?.availableEncoderQuantizations || ['fp32'];
    const nextDecOptions = modelConfig?.loading?.availableDecoderQuantizations || ['fp32'];
    const nextDefaultEnc = modelConfig?.loading?.defaultEncoderQuantization || nextEncOptions[0] || 'fp32';
    const nextDefaultDec = modelConfig?.loading?.defaultDecoderQuantization || nextDecOptions[0] || 'fp32';

    setEncoderQuantOptions(nextEncOptions);
    setDecoderQuantOptions(nextDecOptions);
    setEncoderQuant((current) => (nextEncOptions.includes(current) ? current : nextDefaultEnc));
    setDecoderQuant((current) => (nextDecOptions.includes(current) ? current : nextDefaultDec));
  }, [modelConfig, modelSource]);

  useEffect(() => {
    if (!supportsCanaryPrompting || !modelConfig?.languages?.length) return;

    if (canaryTask === 'asr') {
      if (canaryTargetLanguage !== selectedLanguage) {
        setCanaryTargetLanguage(selectedLanguage);
      }
      return;
    }

    if (
      !modelConfig.languages.includes(canaryTargetLanguage) ||
      canaryTargetLanguage === selectedLanguage
    ) {
      const fallbackTarget =
        modelConfig.languages.find((language) => language !== selectedLanguage) ??
        modelConfig.defaultTargetLanguage ??
        selectedLanguage;
      if (fallbackTarget !== canaryTargetLanguage) {
        setCanaryTargetLanguage(fallbackTarget);
      }
    }
  }, [
    canaryTargetLanguage,
    canaryTask,
    modelConfig,
    selectedLanguage,
    supportsCanaryPrompting,
  ]);

  useEffect(() => {
    if (!supportsPreprocessorBackend) return;

    setPreprocessor((current) => {
      if (modelSource === MODEL_SOURCE_OPTIONS.LOCAL) {
        if (localPreprocessorOptions.length > 0) {
          return localPreprocessorOptions.includes(current) ? current : localPreprocessorOptions[0];
        }
        return defaultPreprocessorName;
      }

      return defaultPreprocessorName;
    });

    setPreprocessorBackend((current) =>
      resolvePreprocessorBackendForSource(
        selectedModel,
        modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE ? defaultPreprocessorBackend : current,
        {
          modelSource,
          localPreprocessorCount: localPreprocessorOptions.length,
        },
      ),
    );
  }, [
    defaultPreprocessorBackend,
    defaultPreprocessorName,
    localPreprocessorOptions,
    modelSource,
    selectedModel,
    supportsPreprocessorBackend,
  ]);

  // Inspect selected repo+branch files and filter quantization options accordingly.
  useEffect(() => {
    if (modelSource !== MODEL_SOURCE_OPTIONS.HUGGINGFACE) return;

    let cancelled = false;
    const revision = modelRevision || getCanonicalRevision(selectedModel);

    (async () => {
      const detected = await detectSpeechModelRepoQuantizations(selectedModel, { revision });
      if (cancelled) return;
      const encOptions = [...detected.encoder];
      const decOptions = [...detected.decoder];
      const declared = getDemoModelLoadingState({
        modelId: selectedModel,
        source: modelSource,
        backend,
        encoderBackend,
        decoderBackend,
        encoderQuant,
        decoderQuant,
      });
      const nextEncOptions = encOptions.length ? encOptions : declared.encoderQuantOptions;
      const nextDecOptions = decOptions.length ? decOptions : declared.decoderQuantOptions;
      const nextDefaultEnc = modelConfig?.loading?.defaultEncoderQuantization || nextEncOptions[0] || 'fp32';
      const nextDefaultDec = modelConfig?.loading?.defaultDecoderQuantization || nextDecOptions[0] || 'fp32';

      setEncoderQuantOptions(nextEncOptions);
      setDecoderQuantOptions(nextDecOptions);
      setEncoderQuant((current) =>
        nextEncOptions.includes(current) ? current : pickPreferredQuant(nextEncOptions, backend, 'encoder') || nextDefaultEnc
      );
      setDecoderQuant((current) =>
        nextDecOptions.includes(current) ? current : pickPreferredQuant(nextDecOptions, backend, 'decoder') || nextDefaultDec
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [backend, decoderBackend, decoderQuant, encoderBackend, encoderQuant, modelConfig, modelRevision, modelSource, selectedModel]);

  // Detect SharedArrayBuffer and threading capabilities
  useEffect(() => {
    const sabAvailable = typeof SharedArrayBuffer !== 'undefined';
    const threads = sabAvailable ? (navigator.hardwareConcurrency || 1) : 1;
    setThreadingStatus({ sab: sabAvailable, threads });
  }, []);

  useEffect(() => {
    saveSettings({
      modelSource,
      selectedModel,
      modelRevision,
      selectedLanguage,
      canaryTask,
      canaryTargetLanguage,
      canaryPnc,
      canaryTimestamps,
      backend,
      encoderBackend,
      decoderBackend,
      encoderQuant,
      decoderQuant,
      preprocessor,
      preprocessorBackend,
      verboseLog,
      frameStride,
      dumpDetail,
      enableProfiling,
      darkMode,
      cpuThreads,
    });
  }, [
    modelSource,
    selectedModel,
    modelRevision,
    selectedLanguage,
    canaryTask,
    canaryTargetLanguage,
    canaryPnc,
    canaryTimestamps,
    backend,
    encoderBackend,
    decoderBackend,
    encoderQuant,
    decoderQuant,
    preprocessor,
    preprocessorBackend,
    verboseLog,
    frameStride,
    dumpDetail,
    enableProfiling,
    darkMode,
    cpuThreads,
  ]);

  // Cleanup audio URL when it changes and on unmount.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      revokeHistoryClipUrls(transcriptionsRef.current);
    };
  }, []);

  function playAudio() {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function pauseAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }

  function downloadCurrentSample() {
    if (!sampleDownload) return;

    try {
      setIsDownloadingSample(true);
      const blob = new Blob([sampleDownload.buffer], { type: sampleDownload.mimeType });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = sampleDownload.filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('[Dataset] Download failed:', error);
      alert(`Download failed: ${error.message}`);
    } finally {
      setIsDownloadingSample(false);
    }
  }

  function handleLanguageChange(nextLanguage) {
    if (nextLanguage === selectedLanguage) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setText('');
    setReferenceText('');
    setSampleDownload(null);
    setSelectedLanguage(nextLanguage);
  }

  function handleModelChange(nextModel) {
    if (nextModel === selectedModel) return;
    const nextConfig = DEMO_MODELS[nextModel];
    const nextSource = resolveDemoModelSource(nextModel, modelSource);
    if (!nextSource) return;
    setSelectedModel(nextModel);
    setModelSource(nextSource);
    setModelRevision(getCanonicalRevision(nextModel));
    setLoadedFromCache(false);
    setPreprocessor(getDescriptorDefaultPreprocessorName(nextModel));
    setPreprocessorBackend(
      resolvePreprocessorBackendForSource(nextModel, getDescriptorDefaultPreprocessorBackend(nextModel), {
        modelSource: nextSource,
        localPreprocessorCount: localPreprocessorOptions.length,
      }),
    );
    if (nextConfig?.capabilities?.supportsPromptControls) {
      setCanaryTargetLanguage(nextConfig.defaultTargetLanguage || 'en');
    }
  }

  function handleModelSourceChange(nextSource) {
    if (nextSource === modelSource) return;
    if (!modelSourceOptions.includes(nextSource)) return;
    setModelSource(nextSource);
    if (nextSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE) {
      setPreprocessor(getDescriptorDefaultPreprocessorName(selectedModel));
      setPreprocessorBackend(getDescriptorDefaultPreprocessorBackend(selectedModel));
      return;
    }

    setPreprocessor(defaultPreprocessorName);
    setPreprocessorBackend(
      resolvePreprocessorBackendForSource(selectedModel, preprocessorBackend, {
        modelSource: nextSource,
        localPreprocessorCount: localPreprocessorOptions.length,
      }),
    );
  }

  // Fetch random audio sample from HuggingFace speech dataset
  async function loadRandomSample() {
    await loadRandomSampleFlow({
      model: modelRef.current,
      selectedLanguage,
      selectedModel,
      getBuiltInModelLanguageName: getSpeechModelLanguageName,
      audioRef,
      audioUrl,
      isCanaryTranslationMode,
      dumpDetail,
      supportsCanaryPrompting,
      canaryTask,
      effectiveCanaryTargetLanguage,
      canaryPnc,
      canaryTimestamps,
      frameStride,
      enableProfiling,
      setIsLoadingSample,
      setReferenceText,
      setText,
      setSampleDownload,
      setIsPlaying,
      setAudioUrl,
      setStatus,
      setIsTranscribing,
      setLatestMetrics,
      setTranscriptions: updateTranscriptions,
    });
  }

  async function loadModel() {
    if (loadModelRunningRef.current) {
      setStatus('Model load already in progress');
      return;
    }
    if (
      isMicActiveRef.current ||
      micPendingJobsRef.current > 0 ||
      micTranscriptionQueueRef.current.length > 0
    ) {
      setStatus('Stop microphone capture and let the queue drain before loading another model');
      return;
    }

    loadModelRunningRef.current = true;
    try {
      await resetMicWorkerTranscriber();
      await loadModelFlow({
        modelSource,
        modelRef,
        localEntries,
        selectedModel,
        encoderBackend,
        decoderBackend,
        encoderQuant,
        decoderQuant,
        localTokenizerName,
        preprocessor,
        preprocessorBackend,
        backend,
        verboseLog,
        cpuThreads,
        enableProfiling,
        setIsModelLoading,
        setStatus,
        setProgressText,
        setProgressPct,
        setLoadedFromCache,
        releaseCurrentModel: (options) => releaseCurrentModel(modelRef, options),
        modelRevision,
        modelConfig,
        warmupAudioUrl,
        setModelLoaded,
      });
      micTranscriberRef.current = modelRef.current;
      if (modelRef.current) {
        void prepareMicWorkerTranscriber();
      }
    } finally {
      loadModelRunningRef.current = false;
    }
  }

  async function transcribeFile(e) {
    await transcribeUploadedFileFlow({
      model: modelRef.current,
      event: e,
      dumpDetail,
      selectedLanguage,
      selectedModel,
      supportsCanaryPrompting,
      canaryTask,
      effectiveCanaryTargetLanguage,
      canaryPnc,
      canaryTimestamps,
      frameStride,
      enableProfiling,
      setText,
      setReferenceText,
      setSampleDownload,
      setIsTranscribing,
      setStatus,
      setLatestMetrics,
      setTranscriptions: updateTranscriptions,
      fileInputRef,
    });
  }

  function clearTranscriptions() {
    updateTranscriptions((previous) => {
      revokeHistoryClipUrls(previous);
      return [];
    });
    setText('');
    setReferenceText('');
    setLatestMetrics(null);
    setSampleDownload(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      micTranscriptionQueueRef.current = [];
      Promise.resolve()
        .then(() => stopMicrophoneCapture({ flush: false }))
        .then(() => micWorkerClientRef.current?.dispose?.())
        .then(() => releaseCurrentModel(modelRef))
        .then(() => disposeHubDemoPipeline())
        .catch((error) => {
          console.warn('[App] Cleanup failed:', error);
        });
    };
  }, []);

  const asrjsVersion = typeof __ASRJS_VERSION__ !== 'undefined' ? __ASRJS_VERSION__ : 'unknown';
  const asrjsSource = typeof __ASRJS_SOURCE__ !== 'undefined' ? __ASRJS_SOURCE__ : 'unknown';
  const layoutApp = buildLayoutApp({
    asrjsVersion,
    asrjsSource,
    status,
    modelSource,
    loadedFromCache,
    isModelReady,
    isLoading,
    modelRevision,
    backend,
    setBackend,
    threadingStatus,
    progressPct,
    progressText,
    loadModel,
    setIsPlaying,
    getBuiltInModelLanguageName: getSpeechModelLanguageName,
    isInIframe,
    supportsLocalSource,
    modelSourceOptions,
    modelConfig,
    handleModelSourceChange,
    selectedModel,
    handleModelChange,
    MODEL_OPTIONS,
    modelFolderInputRef,
    handleLocalFolderInput,
    localFolderName,
    pickLocalModelFolder,
    localHandlePersistenceSupported,
    hasPersistedLocalHandle,
    needsLocalHandleReconnect,
    reconnectPersistedFolder,
    localEntries,
    localDetectedArtifacts,
    encoderBackend,
    setEncoderBackend,
    encoderBackendOptions,
    decoderBackend,
    setDecoderBackend,
    decoderBackendOptions,
    maxCores,
    cpuThreads,
    setCpuThreads,
    frameStride,
    setFrameStride,
    supportsSplitQuantization,
    encoderQuant,
    setEncoderQuant,
    encoderQuantOptions,
    decoderQuant,
    setDecoderQuant,
    decoderQuantOptions,
    supportsPreprocessorBackend,
    preprocessorBackend,
    setPreprocessorBackend,
    preprocessorBackendOptions,
    preprocessor,
    setPreprocessor,
    localPreprocessorOptions,
    hostedModelUsesJsFrontend,
    supportsCanaryPrompting,
    canaryTask,
    setCanaryTask,
    effectiveCanaryTargetLanguage,
    setCanaryTargetLanguage,
    canaryPnc,
    setCanaryPnc,
    canaryTimestamps,
    setCanaryTimestamps,
    localTokenizerName,
    setLocalTokenizerName,
    localTokenizerOptions,
    verboseLog,
    setVerboseLog,
    dumpDetail,
    setDumpDetail,
    enableProfiling,
    setEnableProfiling,
    micStatus,
    micError,
    micMode,
    setMicMode,
    isMicActive,
    supportsMicrophoneInput,
    handleStartMicrophoneCapture,
    handleStopMicrophoneCapture,
    flushMicrophoneUtterance,
    hudVisible,
    setHudVisible,
    streamingMonitor,
    streamingCaptureInfo,
    streamingLatency,
    streamingSnapshot,
    profileId,
    defaultMode,
    applyPreset,
    updateStreamingConfig,
    resetStreamingDefaults,
    streamingPresets,
    latestMetrics,
    audioUrl,
    audioRef,
    isPlaying,
    pauseAudio,
    playAudio,
    sampleDownload,
    downloadCurrentSample,
    isDownloadingSample,
    isLoadingSample,
    selectedLanguage,
    testLanguageOptions,
    handleLanguageChange,
    loadRandomSample,
    fileInputRef,
    transcribeFile,
    isTranscribing,
    text,
    copyToClipboard,
    referenceText,
    setReferenceText,
    isCanaryTranslationMode,
    transcriptions,
    clearTranscriptions,
  });

  return <BrowserConsoleLayout app={layoutApp} />;
}
