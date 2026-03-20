import React, { useState, useRef, useEffect } from 'react';
import {
  detectSpeechModelRepoQuantizations,
  getSpeechModelLanguageName,
  resolveSpeechModelComponentBackends,
} from '@asrjs/speech-recognition';
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
import { getInitialDarkMode, getHfThemeFromQuery, getThemeFromMessage } from './app/theme.js';
import { createTranscriptionRecordFromResult } from './app/transcriptionRecord.js';
import { buildTranscriptionOptions } from './app/transcriptionHelpers.js';
import { releaseCurrentModel } from './app/modelLifecycle.js';
import { useLocalModelFolder } from './app/useLocalModelFolder.js';
import {
  loadModelFlow,
  loadRandomSampleFlow,
  transcribeUploadedFileFlow,
} from './app/transcriptionFlows.js';
import { disposeHubDemoPipeline } from './shared/modelLoader.js';
import { DEMO_MODELS, MODEL_OPTIONS } from './shared/modelCatalog.js';
import { useStreamingMicrophone } from './shared/streaming/useStreamingMicrophone.js';
import { BrowserConsoleLayout } from './BrowserConsoleLayout.jsx';
import warmupAudioUrl from './assets/Harvard-L2-1.ogg?url';
import './App.css';

export default function App() {
  const initialSettings = loadSettings();
  const initialSelectedModel = initialSettings.selectedModel;
  const initialModelSource = initialSettings.modelSource;
  const resolvedInitialModel = DEMO_MODELS[initialSelectedModel] ? initialSelectedModel : 'parakeet-tdt-0.6b-v2';
  const resolvedInitialModelSource =
    initialModelSource === MODEL_SOURCE_OPTIONS.LOCAL && !isInIframe
      ? MODEL_SOURCE_OPTIONS.LOCAL
      : MODEL_SOURCE_OPTIONS.HUGGINGFACE;
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
  const [enableProfiling, setEnableProfiling] = useState(
    initialSettings.enableProfiling === undefined ? true : Boolean(initialSettings.enableProfiling)
  );
  const [audioUrl, setAudioUrl] = useState(null);
  const [sampleDownload, setSampleDownload] = useState(null);
  const [isDownloadingSample, setIsDownloadingSample] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [darkMode, setDarkMode] = useState(getInitialDarkMode(initialSettings));
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
  const micPendingQueueRef = useRef(Promise.resolve());
  const micPendingJobsRef = useRef(0);
  const isMicActiveRef = useRef(false);
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
    setPreprocessor,
    setPreprocessorBackend,
  });

  const isModelReady = modelLoaded;
  const isLoading = isModelLoading;
  const supportsLocalSource = modelConfig?.loading?.supportsLocalSource === true;
  const supportsSplitQuantization = modelConfig?.loading?.supportsSplitQuantization !== false;
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

  function queueMicrophoneTranscription(pcm, sampleRate, sourceLabel) {
    if (!pcm.length) return;

    const durationSeconds = pcm.length / sampleRate;
    if (durationSeconds * 1000 < MIC_MIN_UTTERANCE_MS) {
      onMicStatus(isMicActiveRef.current ? 'Listening for speech…' : 'Microphone stopped');
      return;
    }

    if (!modelRef.current) {
      setStatus(`Captured ${sourceLabel} (${durationSeconds.toFixed(2)} s). Load a model to transcribe.`);
      return;
    }

    micPendingJobsRef.current += 1;
    setIsTranscribing(true);
    setReferenceText('');
    setSampleDownload(null);
    setStatus(`Transcribing ${sourceLabel}…`);

    micPendingQueueRef.current = micPendingQueueRef.current
      .then(async () => {
        const result = await modelRef.current.transcribe(
          pcm,
          sampleRate,
          buildTranscriptionOptions(selectedModel, {
            sourceLanguage: selectedLanguage,
            targetLanguage: effectiveCanaryTargetLanguage,
            task: canaryTask,
            punctuate: canaryPnc,
            timestamps: supportsCanaryPrompting ? canaryTimestamps : true,
            frameStride,
            enableProfiling,
          }),
        );

        if (dumpDetail) {
          console.log('[Mic] Transcription result:', result);
        }

        setLatestMetrics(result.metrics);
        setText(result.utterance_text);
        setTranscriptions((prev) => [
          createTranscriptionRecordFromResult({
            result,
            filename: sourceLabel,
            duration: durationSeconds,
            task: supportsCanaryPrompting ? canaryTask : 'asr',
            targetLanguage: supportsCanaryPrompting ? effectiveCanaryTargetLanguage : null,
          }),
          ...prev,
        ]);
      })
      .catch((error) => {
        console.error('[Mic] Transcription failed:', error);
        setStatus(`Microphone transcription failed: ${error.message}`);
      })
      .finally(() => {
        micPendingJobsRef.current = Math.max(0, micPendingJobsRef.current - 1);
        if (micPendingJobsRef.current === 0) {
          setIsTranscribing(false);
        }
        setStatus(isMicActiveRef.current ? 'Microphone active' : 'Model ready');
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
    snapshot: streamingSnapshot,
    start: startMicrophoneCapture,
    stop: stopMicrophoneCapture,
    flush: flushMicrophoneUtterance,
    presets: streamingPresets,
  } = useStreamingMicrophone({
    modelId: selectedModel,
    isRealtimeEouModel,
    supportsMicrophoneInput,
    onUtterance({ pcm, sampleRate, sourceLabel }) {
      queueMicrophoneTranscription(pcm, sampleRate, sourceLabel);
    },
    onStatus: (nextStatus) => setStatus(resolveAppStatus(nextStatus)),
  });

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  function onMicStatus(nextStatus) {
    if (nextStatus) {
      setStatus(isMicActive ? 'Microphone active' : 'Model ready');
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
    if (supportsLocalSource || modelSource !== MODEL_SOURCE_OPTIONS.LOCAL) return;
    setModelSource(MODEL_SOURCE_OPTIONS.HUGGINGFACE);
    setStatus('This model is available through HuggingFace only.');
  }, [modelSource, supportsLocalSource]);

  useEffect(() => {
    if (!testLanguageOptions.length) return;
    if (testLanguageOptions.some((option) => option.code === selectedLanguage)) return;
    setSelectedLanguage(testLanguageOptions[0].code);
  }, [selectedLanguage, testLanguageOptions]);

  useEffect(() => {
    const nextEncOptions = modelConfig?.loading?.availableEncoderBackends || ['webgpu', 'wasm'];
    const nextDecOptions = modelConfig?.loading?.availableDecoderBackends || ['webgpu', 'wasm'];
    const resolvedBackends = resolveSpeechModelComponentBackends(selectedModel, {
      backend,
      encoderBackend,
      decoderBackend,
    });

    setEncoderBackendOptions(nextEncOptions);
    setDecoderBackendOptions(nextDecOptions);
    setEncoderBackend(resolvedBackends.encoderBackend);
    setDecoderBackend(resolvedBackends.decoderBackend);
  }, [backend, decoderBackend, encoderBackend, modelConfig, selectedModel]);

  useEffect(() => {
    const nextEncOptions = modelConfig?.loading?.availableEncoderQuantizations || ['fp32'];
    const nextDecOptions = modelConfig?.loading?.availableDecoderQuantizations || ['fp32'];
    const nextDefaultEnc = modelConfig?.loading?.defaultEncoderQuantization || nextEncOptions[0] || 'fp32';
    const nextDefaultDec = modelConfig?.loading?.defaultDecoderQuantization || nextDecOptions[0] || 'fp32';

    setEncoderQuantOptions(nextEncOptions);
    setDecoderQuantOptions(nextDecOptions);
    setEncoderQuant((current) => (nextEncOptions.includes(current) ? current : nextDefaultEnc));
    setDecoderQuant((current) => (nextDecOptions.includes(current) ? current : nextDefaultDec));
  }, [modelConfig]);

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
    if (!supportsSplitQuantization) {
      setEncoderQuantOptions(['fp32']);
      setDecoderQuantOptions(['fp32']);
      setEncoderQuant('fp32');
      setDecoderQuant('fp32');
      return () => {};
    }

    let cancelled = false;
    const revision = modelRevision || getCanonicalRevision(selectedModel);

    (async () => {
      const detected = await detectSpeechModelRepoQuantizations(selectedModel, { revision });
      if (cancelled) return;
      const encOptions = [...detected.encoder];
      const decOptions = [...detected.decoder];
      const nextEncOptions =
        encOptions.length || !modelConfig?.loading?.availableEncoderQuantizations?.length
          ? encOptions
          : modelConfig.loading.availableEncoderQuantizations;
      const nextDecOptions =
        decOptions.length || !modelConfig?.loading?.availableDecoderQuantizations?.length
          ? decOptions
          : modelConfig.loading.availableDecoderQuantizations;
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
  }, [modelConfig, modelRevision, modelSource, selectedModel, supportsSplitQuantization]);

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

  // Toggle dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Follow HF/parent theme when provided; otherwise fallback to system changes
  // if user has no saved explicit theme preference.
  useEffect(() => {
    const hfTheme = getHfThemeFromQuery();
    if (hfTheme !== null) {
      setDarkMode(hfTheme);
    }

    const onMessage = (event) => {
      const messageTheme = getThemeFromMessage(event?.data);
      if (messageTheme !== null) {
        setDarkMode(messageTheme);
      }
    };

    window.addEventListener('message', onMessage);

    if (typeof window.matchMedia !== 'function') {
      return () => window.removeEventListener('message', onMessage);
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = (event) => {
      if (getHfThemeFromQuery() !== null) return;
      if (typeof initialSettings.darkMode === 'boolean') return;
      setDarkMode(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onMediaChange);
    } else {
      mediaQuery.addListener(onMediaChange);
    }

    return () => {
      window.removeEventListener('message', onMessage);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', onMediaChange);
      } else {
        mediaQuery.removeListener(onMediaChange);
      }
    };
  }, [initialSettings.darkMode]);

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
    setSelectedModel(nextModel);
    setModelRevision(getCanonicalRevision(nextModel));
    setLoadedFromCache(false);
    setPreprocessor(getDescriptorDefaultPreprocessorName(nextModel));
    setPreprocessorBackend(
      resolvePreprocessorBackendForSource(nextModel, getDescriptorDefaultPreprocessorBackend(nextModel), {
        modelSource,
        localPreprocessorCount: localPreprocessorOptions.length,
      }),
    );
    if (nextConfig?.capabilities?.supportsPromptControls) {
      setCanaryTargetLanguage(nextConfig.defaultTargetLanguage || 'en');
    }
  }

  function handleModelSourceChange(nextSource) {
    if (nextSource === modelSource) return;
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
      setTranscriptions,
    });
  }

  async function loadModel() {
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
      setTranscriptions,
      fileInputRef,
    });
  }

  function clearTranscriptions() {
    setTranscriptions([]);
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
      Promise.resolve()
        .then(() => stopMicrophoneCapture({ flush: false }))
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
    darkMode,
    setDarkMode,
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

