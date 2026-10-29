import { DEMO_MODELS, MODEL_OPTIONS, getCanonicalRevision, getDescriptorEncoderQuantOptions, getDescriptorDecoderQuantOptions, getDescriptorDefaultEncoderQuant, getDescriptorDefaultDecoderQuant, getDescriptorEncoderBackendOptions, getDescriptorDecoderBackendOptions, getDescriptorPreprocessorBackendOptions, getDescriptorDefaultPreprocessorName, getDescriptorDefaultPreprocessorBackend, resolvePreprocessorBackendForSource } from "@asrjs/demo-runtime";
import { resolveProfilingSetting } from '@asrjs/demo-runtime';
import React, { useState, useRef, useEffect } from 'react';
import { getDemoModelSourceOptions, resolveDemoModelSource, getDemoModelLoadingState, loadDemoLocalModel, matchesWarmupResult } from '@asrjs/demo-runtime';
import {
  buildSpeechTranscriptionOptions,
  detectSpeechModelRepoQuantizations,
  getSpeechModelLanguageName,
  resolveSpeechModelComponentBackends,
} from '@asrjs/speech-recognition';
import {
  collectSpeechModelLocalEntries,
  createSpeechModelLocalEntries,
  encodeMonoPcmToWavBlob,
} from '@asrjs/speech-recognition/browser';
import { fetchRandomSample, hasTestSamples, SPEECH_DATASETS } from './utils/speechDatasets';
import { pickPreferredQuant } from '@asrjs/speech-recognition/io';
import {
  disposeHubDemoPipeline,
  loadHubDemoModel,
} from './shared/modelLoader.js';
import warmupAudioUrl from './assets/Harvard-L2-1.ogg?url';
import { WordPills, useDemoTheme } from '@asrjs/demo-ui';
import './App.css';

const SETTINGS_STORAGE_KEY = 'asrjs.browser-demo.settings.v2';
const LOCAL_MODEL_DB_NAME = 'asrjs-browser-demo-local-model';
const LOCAL_MODEL_STORE_NAME = 'handles';
const LOCAL_MODEL_DIR_KEY = 'directory-handle';
const MODEL_SOURCE_OPTIONS = {
  HUGGINGFACE: 'huggingface',
  LOCAL: 'local',
};

// showDirectoryPicker is blocked in cross-origin iframes (e.g. HF Spaces)
function supportsDirectoryHandlePersistence() {
  if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function' || typeof indexedDB === 'undefined') return false;
  // showDirectoryPicker is blocked in cross-origin iframes (e.g. HF Spaces)
  try { if (window.self !== window.top) return false; } catch { return false; }
  return true;
}

function openLocalModelDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_MODEL_DB_NAME, 1);
    request.onerror = () => reject(new Error('Failed to open local model IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LOCAL_MODEL_STORE_NAME)) {
        db.createObjectStore(LOCAL_MODEL_STORE_NAME);
      }
    };
  });
}

async function readPersistedDirectoryHandle() {
  const db = await openLocalModelDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const closeDb = () => {
      try {
        db.close();
      } catch {
        // Ignore close errors.
      }
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const tx = db.transaction([LOCAL_MODEL_STORE_NAME], 'readonly');
    const store = tx.objectStore(LOCAL_MODEL_STORE_NAME);
    const req = store.get(LOCAL_MODEL_DIR_KEY);
    req.onerror = () => {
      closeDb();
      rejectOnce(new Error('Failed to read persisted folder handle'));
    };
    req.onsuccess = () => {
      closeDb();
      resolveOnce(req.result || null);
    };
    tx.onabort = () => {
      closeDb();
      rejectOnce(new Error('Failed to read persisted folder handle'));
    };
    tx.onerror = () => {
      closeDb();
      rejectOnce(new Error('Failed to read persisted folder handle'));
    };
  });
}

async function persistDirectoryHandle(dirHandle) {
  const db = await openLocalModelDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const closeDb = () => {
      try {
        db.close();
      } catch {
        // Ignore close errors.
      }
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const tx = db.transaction([LOCAL_MODEL_STORE_NAME], 'readwrite');
    const store = tx.objectStore(LOCAL_MODEL_STORE_NAME);
    const req = store.put(dirHandle, LOCAL_MODEL_DIR_KEY);
    req.onerror = () => {
      closeDb();
      rejectOnce(new Error('Failed to persist folder handle'));
    };
    req.onsuccess = () => {
      closeDb();
      resolveOnce();
    };
    tx.onabort = () => {
      closeDb();
      rejectOnce(new Error('Failed to persist folder handle'));
    };
    tx.onerror = () => {
      closeDb();
      rejectOnce(new Error('Failed to persist folder handle'));
    };
  });
}

async function clearPersistedDirectoryHandle() {
  const db = await openLocalModelDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const closeDb = () => {
      try {
        db.close();
      } catch {
        // Ignore close errors.
      }
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const tx = db.transaction([LOCAL_MODEL_STORE_NAME], 'readwrite');
    const store = tx.objectStore(LOCAL_MODEL_STORE_NAME);
    const req = store.delete(LOCAL_MODEL_DIR_KEY);
    req.onerror = () => {
      closeDb();
      rejectOnce(new Error('Failed to clear persisted folder handle'));
    };
    req.onsuccess = () => {
      closeDb();
      resolveOnce();
    };
    tx.onabort = () => {
      closeDb();
      rejectOnce(new Error('Failed to clear persisted folder handle'));
    };
    tx.onerror = () => {
      closeDb();
      rejectOnce(new Error('Failed to clear persisted folder handle'));
    };
  });
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

// Cache audio file (remote or local URL) to IndexedDB
async function getCachedAudioFile(url, cacheKey) {
  const dbName = 'asrjs-browser-demo-cache';
  const storeName = 'audio-files';

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = async (event) => {
      const db = event.target.result;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const getReq = store.get(cacheKey);

      getReq.onsuccess = async () => {
        if (getReq.result) {
          // Cache hit - return cached blob
          console.log(`[Cache] Using cached audio: ${cacheKey}`);
          resolve(getReq.result.blob);
        } else {
          // Cache miss - fetch from URL and cache
          console.log(`[Cache] Fetching audio from: ${url}`);
          try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();

            // Store in cache
            const writeTx = db.transaction(storeName, 'readwrite');
            const writeStore = writeTx.objectStore(storeName);
            writeStore.put({ key: cacheKey, blob, timestamp: Date.now() });
            writeTx.oncomplete = () => {
              console.log(`[Cache] Cached audio: ${cacheKey}`);
              resolve(blob);
            };
            writeTx.onerror = () => resolve(blob); // Fallback: return without caching
          } catch (err) {
            reject(err);
          }
        }
      };
      getReq.onerror = () => reject(new Error('Failed to read from cache'));
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'key' });
      }
    };
  });
}

function getCanonicalResult(response) {
  return response?.canonical ?? response ?? null;
}

function getResultText(response) {
  return getCanonicalResult(response)?.text ?? '';
}

function getResultMetrics(response) {
  return getCanonicalResult(response)?.meta?.metrics ?? null;
}

function getResultWordCount(response) {
  return getCanonicalResult(response)?.words?.length || 0;
}

function getResultConfidence(response) {
  const canonical = getCanonicalResult(response);
  return (
    canonical?.meta?.averageTokenConfidence ??
    canonical?.meta?.averageWordConfidence ??
    canonical?.meta?.averageConfidence ??
    response?.native?.confidence?.tokenAverage ??
    response?.native?.confidence?.wordAverage ??
    response?.native?.confidence?.utterance ??
    null
  );
}

export default function App() {
  const initialSettings = loadSettings();
  const initialSelectedModel = initialSettings.selectedModel;
  const initialModelSource = initialSettings.modelSource;
  const resolvedInitialModel = DEMO_MODELS[initialSelectedModel] ? initialSelectedModel : 'parakeet-tdt-0.6b-v2';
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
  const [localEntries, setLocalEntries] = useState([]);
  const [localFolderName, setLocalFolderName] = useState('');
  const [hasPersistedLocalHandle, setHasPersistedLocalHandle] = useState(false);
  const [needsLocalHandleReconnect, setNeedsLocalHandleReconnect] = useState(false);
  const [localHandlePersistenceSupported] = useState(supportsDirectoryHandlePersistence());
  const [localTokenizerOptions, setLocalTokenizerOptions] = useState(['vocab.txt']);
  const [localTokenizerName, setLocalTokenizerName] = useState('vocab.txt');
  const [localPreprocessorOptions, setLocalPreprocessorOptions] = useState([]);
  const [localDetectedArtifacts, setLocalDetectedArtifacts] = useState({
    encoder: [],
    decoder: [],
    tokenizers: [],
    preprocessors: [],
  });
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

  const isModelReady = modelLoaded;
  const isLoading = isModelLoading;
  const modelSourceOptions = getDemoModelSourceOptions(selectedModel);
  const supportsSplitQuantization = modelConfig?.loading?.supportsSplitQuantization !== false;
  const supportsPreprocessorBackend = modelConfig?.loading?.supportsPreprocessorBackend !== false;
  const preprocessorBackendOptions = getDescriptorPreprocessorBackendOptions(selectedModel);
  const defaultPreprocessorName = getDescriptorDefaultPreprocessorName(selectedModel);
  const defaultPreprocessorBackend = getDescriptorDefaultPreprocessorBackend(selectedModel);
  const hostedModelUsesJsFrontend =
    modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE &&
    defaultPreprocessorBackend === 'js';
  const supportsCanaryPrompting = modelConfig?.capabilities?.supportsPromptControls === true;
  const effectiveCanaryTargetLanguage =
    canaryTask === 'asr' ? selectedLanguage : canaryTargetLanguage;
  const isCanaryTranslationMode =
    supportsCanaryPrompting &&
    canaryTask !== 'asr' &&
    effectiveCanaryTargetLanguage !== selectedLanguage;

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
    const nextSource = resolveDemoModelSource(selectedModel, modelSource);
    if (nextSource !== modelSource) setModelSource(nextSource);
  }, [modelSource, selectedModel]);

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
    const state = getDemoModelLoadingState({ modelId: selectedModel, source: modelSource, entries: localEntries });
    setEncoderQuantOptions(state.encoderQuantOptions);
    setDecoderQuantOptions(state.decoderQuantOptions);
    setEncoderQuant(current => state.encoderQuantOptions.includes(current) ? current : state.encoderQuant);
    setDecoderQuant(current => state.decoderQuantOptions.includes(current) ? current : state.decoderQuant);
  }, [modelConfig, selectedModel, modelSource, localEntries]);

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

  // Restore persisted local folder handle when local source is active.
  useEffect(() => {
    let cancelled = false;
    if (modelSource !== MODEL_SOURCE_OPTIONS.LOCAL) return () => { };
    if (!localHandlePersistenceSupported) return () => { };
    if (localEntries.length > 0) return () => { };

    (async () => {
      const restored = await restorePersistedLocalFolder({ requestPermission: false });
      if (cancelled || !restored) return;
      console.log('[LocalFolder] Local folder restored automatically from persisted handle');
    })();

    return () => {
      cancelled = true;
    };
  }, [modelSource, localHandlePersistenceSupported, localEntries.length]);

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
    setModelSource(nextSource);
    setSelectedModel(nextModel);
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
    if (localEntries.length > 0) {
      try { applyLocalEntries(localEntries, localFolderName, {
        modelId: nextModel,
        modelSource: nextSource,
        updateStatus: false,
      }); } catch {
        setLocalEntries([]);
        setLocalFolderName('');
      }
    }
  }

  function handleModelSourceChange(nextSource) {
    nextSource = resolveDemoModelSource(selectedModel, nextSource);
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
    if (localEntries.length > 0) {
      applyLocalEntries(localEntries, localFolderName, {
        modelId: selectedModel,
        modelSource: nextSource,
        updateStatus: false,
      });
    }
  }

  function buildTranscriptionOptions() {
    return buildSpeechTranscriptionOptions(selectedModel, {
      sourceLanguage: selectedLanguage,
      targetLanguage: effectiveCanaryTargetLanguage,
      task: canaryTask,
      punctuate: canaryPnc,
      timestamps: supportsCanaryPrompting ? canaryTimestamps : true,
      frameStride,
      returnConfidences: true,
      enableProfiling,
    });
  }

  function applyLocalEntries(
    entries,
    folderName = '',
    {
      modelId = selectedModel,
      modelSource: nextModelSource = MODEL_SOURCE_OPTIONS.LOCAL,
      updateStatus = true,
    } = {},
  ) {
    console.log('[LocalFolder] Parsing selected local folder entries…', { count: entries.length, folderName });
    setLocalEntries(entries);
    setLocalFolderName(folderName);

    const state = getDemoModelLoadingState({ modelId, source: 'local', entries, backend, encoderBackend, decoderBackend, encoderQuant, decoderQuant });
    const inspection = state.inspection;
    const nextEncOptions = state.encoderQuantOptions;
    const nextDecOptions = state.decoderQuantOptions;

    setEncoderQuantOptions(nextEncOptions);
    setDecoderQuantOptions(nextDecOptions);
    setEncoderQuant(state.encoderQuant);
    setDecoderQuant(state.decoderQuant);

    const dedupedTokenizer = [...inspection.tokenizerNames];
    if (dedupedTokenizer.length) {
      setLocalTokenizerOptions(dedupedTokenizer);
      setLocalTokenizerName((current) => (dedupedTokenizer.includes(current) ? current : dedupedTokenizer[0]));
    } else {
      setLocalTokenizerOptions([]);
      setLocalTokenizerName('');
    }

    const dedupedPreprocessor = [...inspection.preprocessorNames];
    if (dedupedPreprocessor.length) {
      setLocalPreprocessorOptions(dedupedPreprocessor);
      setPreprocessor((current) => (dedupedPreprocessor.includes(current) ? current : dedupedPreprocessor[0]));
    } else {
      setLocalPreprocessorOptions([]);
      setPreprocessor(getDescriptorDefaultPreprocessorName(modelId));
      if (resolvePreprocessorBackendForSource(modelId, preprocessorBackend, {
        modelSource: nextModelSource,
        localPreprocessorCount: 0,
      }) !== preprocessorBackend) {
        setPreprocessorBackend('js');
        console.log('[LocalFolder] No local nemo*.onnx detected; falling back preprocessorBackend to js');
      }
    }

    setLocalDetectedArtifacts({
      encoder: nextEncOptions,
      decoder: nextDecOptions,
      tokenizers: dedupedTokenizer,
      preprocessors: dedupedPreprocessor,
    });

    console.log('[LocalFolder] Detected artifacts', {
      encoder: nextEncOptions,
      decoder: nextDecOptions,
      tokenizers: dedupedTokenizer,
      preprocessors: dedupedPreprocessor,
    });
    if (updateStatus) {
      setStatus(`Local folder selected (${entries.length} files)`);
    }
  }

  async function restorePersistedLocalFolder({ requestPermission = false } = {}) {
    if (!localHandlePersistenceSupported) return false;
    try {
      const dirHandle = await readPersistedDirectoryHandle();
      if (!dirHandle) {
        setHasPersistedLocalHandle(false);
        setNeedsLocalHandleReconnect(false);
        return false;
      }

      setHasPersistedLocalHandle(true);
      const queryState = typeof dirHandle.queryPermission === 'function'
        ? await dirHandle.queryPermission({ mode: 'read' })
        : 'granted';

      let permissionState = queryState;
      if (permissionState !== 'granted' && requestPermission && typeof dirHandle.requestPermission === 'function') {
        permissionState = await dirHandle.requestPermission({ mode: 'read' });
      }

      if (permissionState !== 'granted') {
        setNeedsLocalHandleReconnect(true);
        console.log('[LocalFolder] Persisted folder found but permission is not granted yet');
        return false;
      }

      console.log('[LocalFolder] Restoring persisted directory handle', { name: dirHandle.name });
      const entries = await collectSpeechModelLocalEntries(dirHandle);
      applyLocalEntries(entries, dirHandle.name || '');
      setNeedsLocalHandleReconnect(false);
      setStatus(`Restored local folder "${dirHandle.name || ''}"`);
      return true;
    } catch (error) {
      console.warn('[LocalFolder] Failed to restore persisted handle, clearing it', error);
      try {
        await clearPersistedDirectoryHandle();
      } catch (clearError) {
        console.warn('[LocalFolder] Failed to clear persisted handle', clearError);
      }
      setHasPersistedLocalHandle(false);
      setNeedsLocalHandleReconnect(false);
      return false;
    }
  }

  async function pickLocalModelFolder() {
    try {
      console.log('[LocalFolder] Folder selection requested');
      if (supportsDirectoryHandlePersistence()) {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        console.log('[LocalFolder] Directory handle acquired', { name: dirHandle.name });
        const entries = await collectSpeechModelLocalEntries(dirHandle);
        applyLocalEntries(entries, dirHandle.name || '');
        if (localHandlePersistenceSupported) {
          try {
            await persistDirectoryHandle(dirHandle);
            setHasPersistedLocalHandle(true);
            setNeedsLocalHandleReconnect(false);
            console.log('[LocalFolder] Persisted directory handle for future visits');
          } catch (persistError) {
            console.warn('[LocalFolder] Could not persist directory handle', persistError);
          }
        }
        return;
      }

      if (modelFolderInputRef.current) {
        modelFolderInputRef.current.click();
        setStatus('Directory-handle persistence is unavailable in this browser. Folder will need to be reselected next visit.');
        return;
      }

      alert('Directory picker is not available in this browser. Use Chromium-based browser or provide local files via folder input.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[LocalFolder] Failed to read directory', error);
      setStatus(`Failed to read folder: ${error.message}`);
    }
  }

  function handleLocalFolderInput(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    console.log('[LocalFolder] Folder input fallback selected files', { count: files.length });
    const entries = createSpeechModelLocalEntries(files);
    const folderName = entries[0]?.path?.split('/')?.[0] || '';
    applyLocalEntries(entries, folderName);
    if (!localHandlePersistenceSupported) {
      setStatus(`Local folder selected (${entries.length} files). This browser cannot persist folder access; reselect next visit.`);
    }
    event.target.value = '';
  }

  async function reconnectPersistedFolder() {
    const restored = await restorePersistedLocalFolder({ requestPermission: true });
    if (!restored) {
      setStatus('Could not restore saved folder access. Please choose folder again.');
    }
  }

  // Fetch random audio sample from HuggingFace speech dataset
  async function loadRandomSample() {
    if (!modelRef.current) return;

    if (!hasTestSamples(selectedLanguage)) {
      alert(`No test dataset available for ${getSpeechModelLanguageName(selectedLanguage)}.`);
      return;
    }

    setIsLoadingSample(true);
    setReferenceText('');
    setText('');
    setSampleDownload(null);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      const sample = await fetchRandomSample(selectedLanguage, {
        targetSampleRate: 16000,
        onProgress: ({ message }) => setStatus(message),
      });

      // Create audio blob for playback
      const wavBlob = encodeMonoPcmToWavBlob(sample.pcm, { sampleRate: 16000 });
      const url = URL.createObjectURL(wavBlob);
      setAudioUrl(url);
      setSampleDownload({
        buffer: sample.audioBuffer,
        filename: sample.sourceFilename,
        mimeType: sample.sourceMimeType,
        sourceUrl: sample.sourceAudioUrl,
      });

      const canCompareAgainstReference = !isCanaryTranslationMode;
      setReferenceText(canCompareAgainstReference ? sample.transcription : '');
      console.log(`[Dataset] Reference: "${sample.transcription}"`);

      setStatus('Transcribing…');
      setIsTranscribing(true);

      console.time('Transcribe-Sample');
      const res = await modelRef.current.transcribeMonoPcm(
        sample.pcm,
        16000,
        buildTranscriptionOptions(),
      );
      console.timeEnd('Transcribe-Sample');

      if (dumpDetail) {
        console.log('[Dataset] Transcription result:', res);
      }

      setText(getResultText(res));
      setLatestMetrics(getResultMetrics(res));

      const langName = getSpeechModelLanguageName(selectedLanguage);
      const datasetName = sample.dataset.split('/').pop();
      const newTranscription = {
        id: Date.now(),
        filename: `${datasetName}-${langName}-#${sample.sampleIndex}`,
        text: getResultText(res),
        words: res?.canonical?.words || res?.native?.words || res?.words || [],
        reference: canCompareAgainstReference ? sample.transcription : '',
        timestamp: new Date().toLocaleTimeString(),
        duration: sample.duration,
        wordCount: getResultWordCount(res),
        confidence: getResultConfidence(res),
        metrics: getResultMetrics(res),
        language: res.native?.language ?? selectedLanguage,
        task: supportsCanaryPrompting ? canaryTask : 'asr',
        targetLanguage: supportsCanaryPrompting ? effectiveCanaryTargetLanguage : null,
      };
      setTranscriptions(prev => [newTranscription, ...prev]);
      setStatus('Model ready');

    } catch (error) {
      console.error('[Dataset] Error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoadingSample(false);
      setIsTranscribing(false);
    }
  }

  async function loadModel() {
    const isLocalSource = modelSource === MODEL_SOURCE_OPTIONS.LOCAL;
    setIsModelLoading(true);
    setStatus(isLocalSource ? 'Preparing local model…' : 'Downloading model…');
    setProgressText(isLocalSource ? '' : 'Resolving model request…');
    setProgressPct(null);
    setLoadedFromCache(false);
    console.time('LoadModel');

    try {
      await releaseCurrentModel();

      if (isLocalSource) {
        console.log('[LocalFolder] Starting model load from local artifacts');
        if (!localEntries.length) {
          throw new Error('Pick a local model folder first.');
        }

        setStatus('Compiling model…');
        setProgressText('Compiling local model artifacts');
        setProgressPct(null);

        const localLoadResult = await loadDemoLocalModel({
          modelId: selectedModel,
          entries: localEntries,
          encoderBackend,
          decoderBackend,
          encoderQuant,
          decoderQuant,
          tokenizerName: localTokenizerName,
          preprocessorName: preprocessor,
          preprocessorBackend,
          backend,
          verbose: verboseLog,
          cpuThreads,
          enableProfiling,
        });

        console.log('[LocalFolder] Selected artifacts', {
          encoder: localLoadResult.selection.encoderName,
          decoder: localLoadResult.selection.decoderName,
          tokenizer: localLoadResult.selection.tokenizerName,
          preprocessorBackend,
          preprocessor: localLoadResult.selection.preprocessorName ?? null,
        });
        modelRef.current = {
          ...localLoadResult,
          kind: 'loaded-model',
        };
        setLoadedFromCache(false);
        console.log('[LocalFolder] Model sessions created from local artifacts');
      } else {
        console.log('[Hub] Starting model load from HuggingFace');
        const progressCallback = (event) => {
          if (event.phase === 'asset:download') {
            const pct = event.percent ?? (event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0);
            setProgressText(event.file ? `${event.file}: ${pct}%` : event.message || 'Downloading model assets');
            setProgressPct(pct);
            return;
          }

          if (event.phase === 'resolve:start') {
            setProgressText(event.message || 'Resolving model request…');
            setProgressPct(null);
            return;
          }
          if (event.phase === 'resolve:complete') {
            setProgressText(event.message || 'Model request resolved.');
            setProgressPct(null);
            return;
          }
          if (event.phase === 'model-load:start' || event.phase === 'session-create:start') {
            setStatus('Compiling model…');
            setProgressPct(null);
            setProgressText(event.message || 'Compiling model…');
            return;
          }
          if (event.phase === 'model-load:complete' || event.phase === 'session-create:complete') {
            setProgressText(event.message || 'Model compile step complete.');
            setProgressPct(null);
            return;
          }
          if (event.phase === 'ready') {
            setProgressText(event.message || 'Model runtime ready.');
            setProgressPct(null);
            return;
          }
          if (event.message) {
            setProgressText(event.message);
          }
        };

        const modelLoadResult = await loadHubDemoModel({
          modelId: selectedModel,
          revision: modelRevision,
          encoderBackend,
          decoderBackend,
          encoderQuant,
          decoderQuant,
          preprocessor,
          preprocessorBackend,
          backend,
          cpuThreads,
          enableProfiling,
          onProgress: progressCallback,
        });

        modelRef.current = modelLoadResult.model;
        setLoadedFromCache(Boolean(modelLoadResult.fromCache));
        if (modelLoadResult.fromCache) {
          setStatus('Reusing cached model…');
          setProgressText('Loaded from cache. Running warm-up verification…');
          setProgressPct(null);
        }
        console.log('[Hub] Model sessions created from HuggingFace artifacts');
      }

      setStatus('Verifying…');
      setProgressText('Running test transcription');
      console.log('[LoadModel] Running warm-up verification transcription');
      const expectedTexts = modelConfig?.warmup?.expectedTexts || [];

      try {
        const warmupUrls = [
          // Prefer bundled local asset URL for deterministic local/prod behavior.
          warmupAudioUrl,
          // Fallback only if the deployed app is missing the local asset.
          'https://raw.githubusercontent.com/ysdede/parakeet.js/master/examples/demo/public/assets/Harvard-L2-1.ogg',
        ];
        let audioBlob = null;
        let warmupFetchError = null;
        for (const audioUrl of warmupUrls) {
          try {
            audioBlob = await getCachedAudioFile(audioUrl, 'Harvard-L2-1.ogg');
            break;
          } catch (e) {
            warmupFetchError = e;
            console.warn(`[App] Warm-up audio fetch failed for ${audioUrl}: ${e.message}`);
          }
        }
        if (!audioBlob) {
          throw warmupFetchError || new Error('Failed to load warm-up audio.');
        }
        const buf = await audioBlob.arrayBuffer();
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        const decoded = await audioCtx.decodeAudioData(buf);
        const pcm = decoded.getChannelData(0);

        const response = await modelRef.current.transcribeMonoPcm(pcm, 16000, {
          enableProfiling,
        });
        const transcriptText = getResultText(response);
        const matchedExpectedText = matchesWarmupResult(modelConfig, [transcriptText]);

        if (matchedExpectedText) {
          console.log('[App] Model verification successful.');
          setStatus('Model ready');
          setModelLoaded(true);
        } else {
          console.error(`[App] Verification failed! Expected one of: "${expectedTexts.join('" | "')}", Got: "${transcriptText}"`);
          setStatus('Verification failed');
          setModelLoaded(false);
          setLoadedFromCache(false);
          await releaseCurrentModel({ evictHub: true });
        }
      } catch (err) {
        console.error('[App] Warm-up failed', err);
        setStatus('Warm-up failed');
        setModelLoaded(false);
        setLoadedFromCache(false);
        await releaseCurrentModel({ evictHub: true });
      }

      console.timeEnd('LoadModel');
      setProgressText('');
      setProgressPct(null);
    } catch (e) {
      console.error(e);
      setStatus(`Failed: ${e.message}`);
      setModelLoaded(false);
      setLoadedFromCache(false);
      await releaseCurrentModel({ evictHub: true });
    } finally {
      setIsModelLoading(false);
    }
  }

  async function transcribeFile(e) {
    if (!modelRef.current) return alert('Load model first');
    const file = e.target.files?.[0];
    if (!file) return;

    setText('');
    setReferenceText('');
    setSampleDownload(null);
    setIsTranscribing(true);
    setStatus(`Transcribing "${file.name}"…`);

    try {
      const buf = await file.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const decoded = await audioCtx.decodeAudioData(buf);
      const pcm = decoded.getChannelData(0);

      console.time(`Transcribe-${file.name}`);
      const res = await modelRef.current.transcribeMonoPcm(
        pcm,
        16_000,
        buildTranscriptionOptions(),
      );
      console.timeEnd(`Transcribe-${file.name}`);

      if (dumpDetail) {
        console.log('[ASRJS Demo] Result:', res);
      }
      setLatestMetrics(getResultMetrics(res));

      const newTranscription = {
        id: Date.now(),
        filename: file.name,
        text: getResultText(res),
        words: res?.canonical?.words || res?.native?.words || res?.words || [],
        timestamp: new Date().toLocaleTimeString(),
        duration: pcm.length / 16000,
        wordCount: getResultWordCount(res),
        confidence: getResultConfidence(res),
        metrics: getResultMetrics(res),
        language: res.native?.language ?? selectedLanguage,
        task: supportsCanaryPrompting ? canaryTask : 'asr',
        targetLanguage: supportsCanaryPrompting ? effectiveCanaryTargetLanguage : null,
      };

      setTranscriptions(prev => [newTranscription, ...prev]);
      setText(getResultText(res));
      setStatus('Model ready');

    } catch (error) {
      console.error('Transcription failed:', error);
      setStatus('Transcription failed');
      alert(`Failed: ${error.message}`);
    } finally {
      setIsTranscribing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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

  async function releaseCurrentModel({ evictHub = false } = {}) {
    const current = modelRef.current;
    if (!current) return;

    try {
      if (current.kind === 'hub-pipeline') {
        if (evictHub && current.evict) {
          await current.evict();
        }
      } else if (current.dispose) {
        await current.dispose();
      }
    } finally {
      modelRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      Promise.resolve()
        .then(() => releaseCurrentModel())
        .then(() => disposeHubDemoPipeline())
        .catch((error) => {
          console.warn('[App] Cleanup failed:', error);
        });
    };
  }, []);

  return (
    <div className="demo-shell">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column - Model Configuration */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-5">
                Model Configuration
              </h2>
              <div className="space-y-4">
                {/* Model Selection */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Model Source
                  </label>
                  <div className="relative">
                    <select
                      value={modelSource}
                      onChange={(e) => handleModelSourceChange(e.target.value)}
                      disabled={isLoading || isModelReady}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                    >
                      {modelSourceOptions.map(source => (
                        <option key={source} value={source}>{source === 'local' ? 'Local folder' : 'Hugging Face'}</option>
                      ))}
                    </select>
                    <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                      expand_more
                    </span>
                  </div>
                </div>

                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        Model
                      </label>
                      <div className="relative">
                        <select
                          value={selectedModel}
                          onChange={e => handleModelChange(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                        >
                          {MODEL_OPTIONS.map(opt => (
                            <option key={opt.key} value={opt.key}>
                              {opt.displayName}
                            </option>
                          ))}
                        </select>
                        <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                          expand_more
                        </span>
                      </div>
                    </div>

                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && (
                  <div className="space-y-2">
                    <input
                      ref={modelFolderInputRef}
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleLocalFolderInput}
                      className="hidden"
                    />
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Local Model Folder
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 truncate">
                        {localFolderName || 'No folder selected'}
                      </div>
                      <button
                        onClick={pickLocalModelFolder}
                        disabled={isLoading || isModelReady}
                        title="Browse local model folder"
                        className="h-[38px] w-[38px] flex items-center justify-center rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 border border-yellow-500 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-outlined text-lg">folder_open</span>
                      </button>
                    </div>
                    {localHandlePersistenceSupported && hasPersistedLocalHandle && needsLocalHandleReconnect && (
                      <button
                        onClick={reconnectPersistedFolder}
                        disabled={isLoading || isModelReady}
                        className="w-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 font-medium py-2 px-4 rounded-lg transition border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Restore Saved Folder
                      </button>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {localEntries.length
                        ? `Selected ${localEntries.length} files${localFolderName ? ` from "${localFolderName}"` : ''}.`
                        : 'Pick a folder containing encoder/decoder ONNX files and tokenizer text. Optional nemo*.onnx frontend files are detected automatically when present.'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {localHandlePersistenceSupported
                        ? 'Folder access can be persisted in this browser (you may be asked permission on revisit).'
                        : 'This browser cannot persist folder access for local models. User must reselect folder on next visit.'}
                    </p>
                    {localEntries.length > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        <p>Encoder dtypes: {localDetectedArtifacts.encoder.length ? localDetectedArtifacts.encoder.join(', ') : 'none'}</p>
                        <p>Decoder dtypes: {localDetectedArtifacts.decoder.length ? localDetectedArtifacts.decoder.join(', ') : 'none'}</p>
                        <p>Tokenizers: {localDetectedArtifacts.tokenizers.length ? localDetectedArtifacts.tokenizers.join(', ') : 'none'}</p>
                        <p>Frontend ONNX: {localDetectedArtifacts.preprocessors.length ? localDetectedArtifacts.preprocessors.join(', ') : 'none'}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Backend and Precision */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Runtime Backend
                    </label>
                    <div className="relative">
                      <select
                        value={backend}
                        onChange={e => setBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                      >
                        <option value="webgpu-hybrid">WebGPU</option>
                        <option value="wasm">WASM</option>
                      </select>
                      <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Encoder Backend
                    </label>
                    <div className="relative">
                      <select
                        value={encoderBackend}
                        onChange={e => setEncoderBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                      >
                        {encoderBackendOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Decoder Backend
                    </label>
                    <div className="relative">
                      <select
                        value={decoderBackend}
                        onChange={e => setDecoderBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                      >
                        {decoderBackendOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Threads
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={maxCores}
                      value={cpuThreads}
                      onChange={e => setCpuThreads(Number(e.target.value))}
                      disabled={isLoading || isModelReady}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Stride
                    </label>
                    <input
                      type="number"
                      value={frameStride}
                      onChange={e => setFrameStride(Number(e.target.value))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white"
                    />
                  </div>
                </div>

                {(supportsSplitQuantization || modelSource === MODEL_SOURCE_OPTIONS.LOCAL) ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        Encoder
                      </label>
                      <div className="relative">
                        <select
                          value={encoderQuant}
                          onChange={e => setEncoderQuant(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                        >
                          {encoderQuantOptions.map((quant) => (
                            <option key={quant} value={quant}>{quant}</option>
                          ))}
                        </select>
                        <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                          expand_more
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        Decoder
                      </label>
                      <div className="relative">
                        <select
                          value={decoderQuant}
                          onChange={e => setDecoderQuant(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                        >
                          {decoderQuantOptions.map((quant) => (
                            <option key={quant} value={quant}>{quant}</option>
                          ))}
                        </select>
                        <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                          expand_more
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}

                {supportsPreprocessorBackend ? (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Frontend
                    </label>
                    <div className="relative">
                      <select
                        value={preprocessorBackend}
                        onChange={e => setPreprocessorBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                      >
                        {preprocessorBackendOptions.includes('js') && (
                          <option value="js">JS frontend</option>
                        )}
                        {preprocessorBackendOptions.includes('onnx') && (
                          <option
                            value="onnx"
                            disabled={
                              modelSource === MODEL_SOURCE_OPTIONS.LOCAL &&
                              localPreprocessorOptions.length === 0
                            }
                          >
                            ONNX frontend
                          </option>
                        )}
                      </select>
                      <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                        expand_more
                      </span>
                    </div>
                    {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && preprocessorBackend === 'onnx' && localPreprocessorOptions.length > 0 && (
                      <div className="relative mt-2">
                        <select
                          value={preprocessor}
                          onChange={(e) => setPreprocessor(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                        >
                          {localPreprocessorOptions.map((name) => (
                            <option key={name} value={name}>{name}.onnx</option>
                          ))}
                        </select>
                        <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                          expand_more
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {preprocessorBackend === 'js'
                        ? 'Shared pure-JS NeMo frontend. This is the expected path for hosted RNNT models and for local folders without nemo*.onnx frontend assets.'
                        : 'Optional ONNX frontend. Use this only when the selected repo or local folder actually includes a compatible nemo*.onnx asset.'}
                    </p>
                    {hostedModelUsesJsFrontend && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                        This hosted model is configured for the shared JS frontend by default. Separate nemo80/nemo128 ONNX preprocessors are optional, not required.
                      </p>
                    )}
                  </div>
                ) : null}

                {supportsCanaryPrompting && (
                  <div className="rounded-2xl border border-sky-200 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_55%),linear-gradient(135deg,rgba(14,165,233,0.08),rgba(59,130,246,0.03))] p-4 dark:border-sky-900/60 dark:bg-[radial-gradient(circle_at_top_left,rgba(12,74,110,0.62),transparent_55%),linear-gradient(135deg,rgba(8,47,73,0.72),rgba(15,23,42,0.4))]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          Canary Prompt Controls
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                          Source language follows the test sample or uploaded audio language. Target language, task,
                          timestamps, and punctuation are injected as decoder prompt tokens.
                        </p>
                      </div>
                      <span className="rounded-full border border-sky-300/70 bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 shadow-sm dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-200">
                        canary2
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          Task
                        </label>
                        <div className="relative mt-1">
                          <select
                            value={canaryTask}
                            onChange={(e) => setCanaryTask(e.target.value)}
                            disabled={isLoading || isModelReady}
                            className="w-full rounded-xl border border-sky-200 bg-white/85 px-3 py-2 text-sm text-gray-900 shadow-sm backdrop-blur dark:border-sky-800 dark:bg-slate-900/70 dark:text-white"
                          >
                            <option value="asr">ASR</option>
                            <option value="translation">Speech Translation</option>
                          </select>
                          <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                            expand_more
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          Target
                        </label>
                        <div className="relative mt-1">
                          <select
                            value={effectiveCanaryTargetLanguage}
                            onChange={(e) => setCanaryTargetLanguage(e.target.value)}
                            disabled={isLoading || isModelReady || canaryTask === 'asr'}
                            className="w-full rounded-xl border border-sky-200 bg-white/85 px-3 py-2 text-sm text-gray-900 shadow-sm backdrop-blur dark:border-sky-800 dark:bg-slate-900/70 dark:text-white disabled:opacity-60"
                          >
                            {(modelConfig?.languages || []).map((languageCode) => (
                              <option key={languageCode} value={languageCode}>
                              {getSpeechModelLanguageName(languageCode)}
                              </option>
                            ))}
                          </select>
                          <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                            expand_more
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCanaryPnc((current) => !current)}
                        disabled={isLoading || isModelReady}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          canaryPnc
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100'
                            : 'border-gray-200 bg-white/80 text-gray-700 dark:border-gray-700 dark:bg-slate-900/50 dark:text-gray-200'
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.16em]">PnC</div>
                        <div className="mt-1 text-sm">{canaryPnc ? 'Enabled' : 'Disabled'}</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCanaryTimestamps((current) => !current)}
                        disabled={isLoading || isModelReady}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          canaryTimestamps
                            ? 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100'
                            : 'border-gray-200 bg-white/80 text-gray-700 dark:border-gray-700 dark:bg-slate-900/50 dark:text-gray-200'
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.16em]">Timestamps</div>
                        <div className="mt-1 text-sm">{canaryTimestamps ? 'Requested' : 'Hidden'}</div>
                      </button>
                    </div>

                    <div className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                      <strong className="text-gray-900 dark:text-white">Prompt route:</strong>{' '}
                      {getSpeechModelLanguageName(selectedLanguage)} audio {'\u2192'}{' '}
                      {getSpeechModelLanguageName(effectiveCanaryTargetLanguage)}{' '}
                      {canaryTask === 'asr' ? 'transcription' : 'translation'}
                    </div>
                  </div>
                )}

                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Tokenizer
                    </label>
                    <div className="relative">
                      <select
                        value={localTokenizerName}
                        onChange={(e) => setLocalTokenizerName(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                      >
                        {localTokenizerOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                        expand_more
                      </span>
                    </div>
                  </div>
                )}

                {/* Toggles */}
                <div className="flex flex-col gap-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Verbose</span>
                    <div className="relative inline-block w-10 mr-2 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={verboseLog}
                        onChange={e => setVerboseLog(e.target.checked)}
                        disabled={isLoading || isModelReady}
                        className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 dark:border-gray-600"
                        id="verbose"
                      />
                      <label
                        htmlFor="verbose"
                        className="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 dark:bg-gray-700 cursor-pointer"
                      ></label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Log results</span>
                    <div className="relative inline-block w-10 mr-2 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={dumpDetail}
                        onChange={e => setDumpDetail(e.target.checked)}
                        className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 dark:border-gray-600"
                        id="log"
                      />
                      <label
                        htmlFor="log"
                        className="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 dark:bg-gray-700 cursor-pointer"
                      ></label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable profiling</span>
                    <div className="relative inline-block w-10 mr-2 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={enableProfiling}
                        onChange={e => setEnableProfiling(e.target.checked)}
                        className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 dark:border-gray-600"
                        id="profiling"
                      />
                      <label
                        htmlFor="profiling"
                        className="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 dark:bg-gray-700 cursor-pointer"
                      ></label>
                    </div>
                  </div>
                </div>

                {/* Load Model Button */}
                <button
                  onClick={loadModel}
                  disabled={isLoading || isModelReady || (modelSource === MODEL_SOURCE_OPTIONS.LOCAL && (!localEntries.length || !encoderQuantOptions.length || !decoderQuantOptions.length))}
                  className="w-full bg-primary hover:bg-opacity-90 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-icons-outlined text-sm">bolt</span>
                  {isModelReady ? 'Model Loaded' : isLoading ? 'Loading…' : 'Load Model'}
                </button>

                {/* Progress */}
                {progressPct !== null && (
                  <div className="space-y-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-primary h-full w-full origin-left transition-transform duration-200 ease-out"
                        style={{ transform: `scaleX(${Math.min(100, Math.max(0, progressPct)) / 100})` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{progressText}</p>
                  </div>
                )}
                {progressPct === null && progressText && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{progressText}</p>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 px-1">
              <span className="font-medium text-gray-900 dark:text-white">Status:</span>
              <span className={`font-medium ${isModelReady ? 'text-primary' : 'text-gray-600 dark:text-gray-400'}`}>
                {status}
              </span>
              {modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE && loadedFromCache && isModelReady && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span className="material-icons-outlined text-xs">cached</span>
                  Loaded from cache
                </span>
              )}
            </div>

            {/* Threading Status Indicator */}
            <div className="flex items-center gap-2 px-1 mt-2">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${threadingStatus.sab
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                }`}>
                <span className="material-icons-outlined text-xs">
                  {threadingStatus.sab ? 'check_circle' : 'warning'}
                </span>
                {threadingStatus.sab
                  ? `Multi-threaded (${threadingStatus.threads} cores)`
                  : 'Single-threaded'}
              </span>
            </div>
          </div>

          {/* Right Column - Test & Transcribe */}
          <div className="lg:col-span-2 space-y-6">
            {/* Test Section */}
            <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-5">
                Test & Transcribe
              </h2>

              {/* Language & Sample Controls */}
              <div className="flex flex-col md:flex-row gap-4 mb-6 items-end">
                <div className="flex-grow w-full md:w-auto">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    {supportsCanaryPrompting ? 'Input Language' : 'Language'}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedLanguage}
                      onChange={e => handleLanguageChange(e.target.value)}
                      disabled={!isModelReady}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary dark:text-white appearance-none"
                    >
                      {testLanguageOptions.map(lang => (
                        <option key={lang.code} value={lang.code}>
                          {lang.displayName}
                        </option>
                      ))}
                    </select>
                    <span className="material-icons-outlined absolute right-2 top-2 text-gray-400 pointer-events-none text-lg">
                      expand_more
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {audioUrl && (
                    <>
                      <audio
                        ref={audioRef}
                        src={audioUrl}
                        onEnded={() => setIsPlaying(false)}
                        onPause={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                      />
                      <button
                        onClick={isPlaying ? pauseAudio : playAudio}
                        className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-full w-[38px] h-[38px] flex items-center justify-center shadow-sm transition flex-shrink-0 group border border-gray-300 dark:border-gray-600"
                        title={isPlaying ? 'Pause' : 'Play Sample'}
                      >
                        <span className="material-icons-outlined text-lg text-primary group-hover:text-primary/80">
                          {isPlaying ? 'pause' : 'play_arrow'}
                        </span>
                      </button>
                      {sampleDownload && (
                        <button
                          onClick={downloadCurrentSample}
                          disabled={isDownloadingSample || isLoadingSample || isTranscribing}
                          className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-full w-[38px] h-[38px] flex items-center justify-center shadow-sm transition flex-shrink-0 group border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={sampleDownload.sourceUrl ? `Download original sample: ${sampleDownload.filename}` : 'Download original sample'}
                        >
                          <span className="material-icons-outlined text-lg text-primary group-hover:text-primary/80">
                            download
                          </span>
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={loadRandomSample}
                    disabled={!isModelReady || isLoadingSample || isTranscribing || isDownloadingSample}
                    className="bg-primary hover:bg-opacity-90 text-white font-medium py-2 px-4 rounded-lg whitespace-nowrap shadow-sm transition text-sm h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoadingSample ? 'Loading…' : `Load ${getSpeechModelLanguageName(selectedLanguage)} Sample`}
                  </button>
                </div>
              </div>

              {/* File Upload Area */}
              <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={transcribeFile}
                  disabled={!isModelReady || isTranscribing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="material-icons-outlined text-4xl text-gray-400 group-hover:text-primary mb-2 transition-colors">
                  cloud_upload
                </span>
                <p className="text-gray-500 dark:text-gray-400 font-medium">
                  Drag & drop audio file here, or click to select
                </p>
                <p className="text-xs text-gray-400 mt-1">Supports .wav, .mp3, .ogg</p>
              </div>
            </div>

            {/* Transcription Comparison */}
            <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col h-full">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-6">
                Transcription Comparison
              </h2>

              <div className="space-y-6">
                {/* Transcription */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Transcription
                    </label>
                    {text && (
                      <button
                        onClick={() => copyToClipboard(text)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 transition-colors"
                      >
                        <span className="material-icons-outlined text-xs">content_copy</span>
                        Copy
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 min-h-[160px]">
                    <p className="asr-transcript-text text-gray-800 dark:text-gray-200">
                      {text || 'Transcription will appear here...'}
                    </p>
                  </div>
                  {transcriptions[0]?.words?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                        Word-Level Timestamps ({transcriptions[0].words.length} words — click to seek audio)
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {transcriptions[0].words.map((w, idx) => {
                          const wText = w.text || w.word || '';
                          const t0 = w.startTime ?? w.start_time ?? w.start;
                          const t1 = w.endTime ?? w.end_time ?? w.end;
                          return (
                            <button
                              key={`${idx}-${wText}`}
                              type="button"
                              onClick={() => {
                                if (audioRef.current && Number.isFinite(t0)) {
                                  audioRef.current.currentTime = Math.max(0, Number(t0));
                                  audioRef.current.play().catch(() => {});
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs hover:border-primary transition-colors"
                            >
                              <span className="font-medium text-gray-800 dark:text-gray-100">{wText}</span>
                              {Number.isFinite(t0) && (
                                <span className="font-mono text-[10px] text-gray-400">
                                  {Number(t0).toFixed(2)}s{Number.isFinite(t1) ? `–${Number(t1).toFixed(2)}s` : ''}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reference Text */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Reference Text
                    </label>
                    {referenceText && (
                      <button
                        onClick={() => copyToClipboard(referenceText)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 transition-colors"
                      >
                        <span className="material-icons-outlined text-xs">content_copy</span>
                        Copy
                      </button>
                    )}
                  </div>
                  <textarea
                    value={referenceText}
                    onChange={e => setReferenceText(e.target.value)}
                    className="w-full min-h-[160px] bg-white dark:bg-gray-900/50 rounded-lg p-4 border border-primary dark:border-primary/50 text-lg leading-relaxed text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary focus:border-primary placeholder-gray-400 dark:placeholder-gray-600 resize-y"
                    placeholder="Paste or type reference text here for comparison..."
                  />
                  {isCanaryTranslationMode && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Reference comparison is hidden while Canary is translating from{' '}
                      {getSpeechModelLanguageName(selectedLanguage)} to{' '}
                      {getSpeechModelLanguageName(effectiveCanaryTargetLanguage)}.
                    </p>
                  )}
                </div>
              </div>

              {/* Performance Metrics */}
              {latestMetrics && (
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-600 dark:text-gray-400">
                    <span><strong className="text-gray-900 dark:text-white">RTF:</strong> {latestMetrics.rtf?.toFixed(2)}x</span>
                    <span><strong className="text-gray-900 dark:text-white">Total:</strong> {latestMetrics.totalMs?.toFixed(0)}ms</span>
                    <span><strong className="text-gray-900 dark:text-white">Encode:</strong> {latestMetrics.encodeMs?.toFixed(0)}ms</span>
                    <span><strong className="text-gray-900 dark:text-white">Decode:</strong> {latestMetrics.decodeMs?.toFixed(0)}ms</span>
                  </div>
                </div>
              )}
            </div>

            {/* History */}
            {transcriptions.length > 0 && (
              <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Transcription History ({transcriptions.length})
                  </h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(transcriptions, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'asrjs-transcriptions.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs font-medium text-gray-600 hover:text-primary dark:text-gray-300 dark:hover:text-primary transition-colors"
                    >
                      Export JSON
                    </button>
                    <button
                      onClick={clearTranscriptions}
                      className="text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {transcriptions.map(trans => (
                    <div key={trans.id} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {trans.filename}
                          {trans.language && (
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                              ({getSpeechModelLanguageName(trans.language)})
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {trans.timestamp}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-mono">
                        {trans.duration.toFixed(1)}s · {trans.wordCount} words
                        {trans.confidence && ` · ${(trans.confidence * 100).toFixed(0)}% conf`}
                        {trans.metrics && ` · RTF ${trans.metrics.rtf?.toFixed(2)}x`}
                        {trans.targetLanguage && ` · -> ${getSpeechModelLanguageName(trans.targetLanguage)}`}
                      </div>
                      {trans.reference && (
                        <div className="mb-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded text-sm text-emerald-800 dark:text-emerald-300">
                          <strong>Ref:</strong> {trans.reference}
                        </div>
                      )}
                      <div className="text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900/30 p-3 rounded border border-gray-200 dark:border-gray-700">
                        {trans.text}
                      </div>
                      <WordPills words={trans.words || []} className="mt-2 max-h-24" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Warning for SharedArrayBuffer */}
        {typeof SharedArrayBuffer === 'undefined' && backend === 'wasm' && (
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Warning:</strong> SharedArrayBuffer unavailable. WASM will run single-threaded.
          </div>
        )}
      </div>
    </div>
  );
}
