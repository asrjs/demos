
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PcmAudioBuffer, loadSpeechModel } from '@asrjs/speech-recognition';
import { decodeAudioSourceToMonoPcm } from '@asrjs/speech-recognition/browser';
import {
  ParakeetModel,
  collectParakeetLocalEntries,
  createParakeetLocalEntries,
  getParakeetDefaultWeightSetup,
  getParakeetModel,
  inspectParakeetLocalEntries,
  loadModelWithFallback,
  loadParakeetModelFromLocalEntries,
  MODELS,
  LANGUAGE_NAMES,
  resolveParakeetLocalEntries,
} from '@asrjs/speech-recognition/presets/parakeet';
import './App.css';

const SETTINGS_STORAGE_KEY = 'asrjs.parakeet-kitchen-sink.settings.v3';
const MODEL_SOURCE_OPTIONS = { HUGGINGFACE: 'huggingface', LOCAL: 'local' };
const LOAD_STRATEGIES = { ROOT: 'root-helper', LEGACY: 'parakeet-helper' };
const AUDIO_PREP_MODES = {
  BROWSER_TARGET_RATE: 'browser-target-rate',
  NATIVE_LINEAR: 'native-linear',
};
const RESPONSE_FLAVORS = ['canonical', 'canonical+native', 'native'];
const DETAIL_LEVELS = ['text', 'segments', 'words', 'detailed'];
const QUANT_OPTIONS = ['fp16', 'int8', 'fp32'];
const RESAMPLER_QUALITY_OPTIONS = ['linear'];
const SAMPLE_URL = `${import.meta.env.BASE_URL || '/'}assets/Harvard-L2-1.ogg`;
const VERSION = typeof __ASRJS_VERSION__ !== 'undefined' ? __ASRJS_VERSION__ : 'unknown';
const SOURCE = typeof __ASRJS_SOURCE__ !== 'undefined' ? __ASRJS_SOURCE__ : 'dev';
const MAX_LOG_ENTRIES = 32;

function getRecommendedModelSettings(modelKey, backend) {
  const modelConfig = MODELS[modelKey] ?? MODELS['parakeet-tdt-0.6b-v2'];
  const weights = getParakeetDefaultWeightSetup(modelKey, backend);
  return {
    encoderQuant: weights.encoderDefault,
    decoderQuant: weights.decoderDefault,
    preprocessorBackend: 'js',
    preprocessor: modelConfig.preprocessor,
  };
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}

function toJSON(value) {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function fmtMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '-';
}

function fmtSeconds(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} s` : '-';
}

function fmtRate(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : '-';
}

function fmtPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '-';
}

function fmtMiB(value) {
  return Number.isFinite(value) ? `${value.toFixed(value >= 100 ? 0 : 1)} MiB` : '-';
}

function formatTransferred(event) {
  if (Number.isFinite(event.loadedMiB) && Number.isFinite(event.totalMiB)) {
    return `${fmtMiB(event.loadedMiB)} / ${fmtMiB(event.totalMiB)}`;
  }
  if (Number.isFinite(event.loadedMiB)) {
    return fmtMiB(event.loadedMiB);
  }
  if (event.loaded !== undefined && event.total !== undefined) {
    return `${event.loaded}/${event.total}`;
  }
  return null;
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function appendLogEntry(setter, entry) {
  const eventId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  setter((current) => [{ ...entry, id: eventId }, ...current].slice(0, MAX_LOG_ENTRIES));
}

function phaseToProgress(phase) {
  const map = {
    'resolve:start': 0.05,
    'resolve:complete': 0.15,
    'model-load:start': 0.25,
    'model-load:complete': 0.7,
    'session-create:start': 0.8,
    'session-create:complete': 0.92,
    ready: 1,
  };
  return map[phase] ?? null;
}

function resolveLoadEventProgress(event) {
  if (Number.isFinite(event.percent)) {
    return Math.max(0, Math.min(100, Math.round(event.percent)));
  }
  if (Number.isFinite(event.loaded) && Number.isFinite(event.total) && event.total > 0) {
    return Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
  }
  const phaseProgress = phaseToProgress(event.phase);
  return phaseProgress === null ? null : Math.round(phaseProgress * 100);
}

function describeLoadEvent(event) {
  if (event.message) {
    if (Number.isFinite(event.percent)) {
      return `${event.message} ${event.percent}%`;
    }
    if (Number.isFinite(event.loadedMiB) && Number.isFinite(event.totalMiB)) {
      return `${event.message} ${fmtMiB(event.loadedMiB)} / ${fmtMiB(event.totalMiB)}`;
    }
    return event.message;
  }
  return event.phase;
}

function normalizeMetrics(metrics) {
  if (!metrics) return null;
  return {
    preprocessMs: metrics.preprocessMs ?? metrics.preprocess_ms ?? null,
    encodeMs: metrics.encodeMs ?? metrics.encode_ms ?? null,
    decodeMs: metrics.decodeMs ?? metrics.decode_ms ?? null,
    tokenizeMs: metrics.tokenizeMs ?? metrics.tokenize_ms ?? null,
    totalMs: metrics.totalMs ?? metrics.total_ms ?? null,
    wallMs: metrics.wallMs ?? metrics.wall_ms ?? null,
    audioDurationSec: metrics.audioDurationSec ?? metrics.audio_duration_sec ?? null,
    rtf: metrics.rtf ?? null,
    rtfx: metrics.rtfx ?? null,
    requestedPreprocessorBackend:
      metrics.requestedPreprocessorBackend ?? metrics.preprocessor_backend_requested ?? null,
    preprocessorBackend: metrics.preprocessorBackend ?? metrics.preprocessor_backend ?? null,
    encoderFrameCount: metrics.encoderFrameCount ?? metrics.encoder_frame_count ?? null,
    decodeIterations: metrics.decodeIterations ?? metrics.decode_iterations ?? null,
    emittedTokenCount: metrics.emittedTokenCount ?? metrics.emitted_token_count ?? null,
    emittedWordCount: metrics.emittedWordCount ?? metrics.emitted_word_count ?? null,
  };
}

function extractCanonicalResult(result) {
  if (!result || typeof result !== 'object') return null;
  if ('canonical' in result && result.canonical) return result.canonical;
  if ('text' in result && 'meta' in result) return result;
  return null;
}

function extractNativeResult(result) {
  if (!result || typeof result !== 'object') return null;
  if ('canonical' in result && 'native' in result) return result.native ?? null;
  if ('utteranceText' in result || 'utterance_text' in result) return result;
  if ('meta' in result && 'text' in result) return null;
  return result;
}

function extractDisplayText(result) {
  const canonical = extractCanonicalResult(result);
  if (canonical?.text) return canonical.text;
  const native = extractNativeResult(result);
  return native?.utteranceText ?? native?.utterance_text ?? '';
}

function extractResultMetrics(result) {
  const canonical = extractCanonicalResult(result);
  if (canonical?.meta?.metrics) return normalizeMetrics(canonical.meta.metrics);
  const native = extractNativeResult(result);
  if (native?.metrics) return normalizeMetrics(native.metrics);
  return null;
}

function extractWordCount(result) {
  const canonical = extractCanonicalResult(result);
  if (canonical?.words) return canonical.words.length;
  const native = extractNativeResult(result);
  return Array.isArray(native?.words) ? native.words.length : null;
}

function extractTokenCount(result) {
  const canonical = extractCanonicalResult(result);
  if (canonical?.tokens) return canonical.tokens.length;
  const native = extractNativeResult(result);
  return Array.isArray(native?.tokens) ? native.tokens.length : null;
}

function summarizeBenchmark(runs, durationSec) {
  const avgWallMs = average(runs.map((run) => run.wallMs));
  return {
    count: runs.length,
    durationSec,
    avgWallMs,
    avgWallRtfx: Number.isFinite(avgWallMs) && durationSec > 0 ? durationSec / (avgWallMs / 1000) : null,
    avgEncodeMs: average(runs.map((run) => run.metrics?.encodeMs ?? NaN)),
    avgDecodeMs: average(runs.map((run) => run.metrics?.decodeMs ?? NaN)),
    avgTotalMs: average(runs.map((run) => run.metrics?.totalMs ?? NaN)),
  };
}

function describeResponseFlavor(flavor) {
  if (flavor === 'canonical') return 'Canonical transcript';
  if (flavor === 'canonical+native') return 'Canonical + native envelope';
  if (flavor === 'native') return 'Native output';
  return flavor;
}

function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`panel-shell ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="field-label">{label}</span>
        {hint ? <span className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="compact-toggle">
      <span>{label}</span>
      <input type="checkbox" className="toggle-checkbox h-4 w-4 rounded border-gray-300 dark:border-gray-700" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function JsonPanel({ title, value, placeholder }) {
  return (
    <div className="demo-json-panel">
      <div className="demo-json-header">{title}</div>
      <pre className="json-output overflow-x-auto bg-[#fafcff] px-4 py-4 text-[11px] leading-6 text-slate-700">{value || placeholder}</pre>
    </div>
  );
}

function EventPanel({ title, events, emptyMessage }) {
  return (
    <div className="demo-json-panel">
      <div className="demo-json-header">{title}</div>
      <div className="max-h-[320px] divide-y divide-slate-200 overflow-y-auto">
        {events.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">{emptyMessage}</p> : events.map((event, index) => (
          <div key={event.id ?? `${event.timestamp}-${event.phase ?? event.stage ?? index}`} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{event.phase ?? event.stage ?? 'event'}</p>
              <p className="text-[10px] font-mono text-slate-400">{event.timestamp}</p>
            </div>
            {event.message ? <p className="mt-1 text-[12px] text-slate-600">{event.message}</p> : null}
            <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-500">
              {event.progress !== undefined ? <span>progress {fmtPercent(event.progress)}</span> : null}
              {formatTransferred(event) ? <span>{formatTransferred(event)}</span> : null}
              {event.elapsedMs !== undefined ? <span>elapsed {fmtMs(event.elapsedMs)}</span> : null}
              {event.remainingMs !== undefined ? <span>remaining {fmtMs(event.remainingMs)}</span> : null}
              {event.file ? <span>{event.file}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricGrid({ metrics }) {
  if (!metrics) return <p className="text-sm text-gray-500 dark:text-gray-400">No metrics yet.</p>;
  const rows = [
    ['Preprocess', fmtMs(metrics.preprocessMs)],
    ['Encode', fmtMs(metrics.encodeMs)],
    ['Decode', fmtMs(metrics.decodeMs)],
    ['Total', fmtMs(metrics.totalMs)],
    ['Wall', fmtMs(metrics.wallMs)],
    ['Audio duration', fmtSeconds(metrics.audioDurationSec)],
    ['RTF', fmtRate(metrics.rtf)],
    ['RTFx', fmtRate(metrics.rtfx)],
    ['Prep requested', metrics.requestedPreprocessorBackend ?? '-'],
    ['Prep effective', metrics.preprocessorBackend ?? '-'],
    ['Frames', metrics.encoderFrameCount ?? '-'],
    ['Decode iterations', metrics.decodeIterations ?? '-'],
    ['Tokens', metrics.emittedTokenCount ?? '-'],
    ['Words', metrics.emittedWordCount ?? '-'],
    ['Word count', metrics.words ?? '-'],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="metric-cell">
          <p className="metric-label">{label}</p>
          <p className="mt-1 text-[13px] font-medium">{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const initialSettings = loadSettings();
  const initialModel = MODELS[initialSettings.selectedModel] ? initialSettings.selectedModel : 'parakeet-tdt-0.6b-v2';
  const initialModelConfig = MODELS[initialModel];
  const initialBackend = initialSettings.backend || 'webgpu-hybrid';
  const initialRecommendedSettings = getRecommendedModelSettings(initialModel, initialBackend);
  const [modelSource, setModelSource] = useState(initialSettings.modelSource || MODEL_SOURCE_OPTIONS.HUGGINGFACE);
  const [loadStrategy, setLoadStrategy] = useState(initialSettings.loadStrategy || LOAD_STRATEGIES.ROOT);
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [language, setLanguage] = useState(initialSettings.language || initialModelConfig.defaultLanguage);
  const [backend, setBackend] = useState(initialBackend);
  const [encoderQuant, setEncoderQuant] = useState(initialSettings.encoderQuant || initialRecommendedSettings.encoderQuant);
  const [decoderQuant, setDecoderQuant] = useState(initialSettings.decoderQuant || initialRecommendedSettings.decoderQuant);
  const [preprocessor, setPreprocessor] = useState(initialSettings.preprocessor || initialRecommendedSettings.preprocessor);
  const [preprocessorBackend, setPreprocessorBackend] = useState(initialSettings.preprocessorBackend || initialRecommendedSettings.preprocessorBackend);
  const [detail, setDetail] = useState(initialSettings.detail || 'detailed');
  const [responseFlavor, setResponseFlavor] = useState(initialSettings.responseFlavor || 'canonical+native');
  const [audioPrepMode, setAudioPrepMode] = useState(initialSettings.audioPrepMode || AUDIO_PREP_MODES.NATIVE_LINEAR);
  const [audioResamplerQuality, setAudioResamplerQuality] = useState(initialSettings.audioResamplerQuality || 'linear');
  const [cpuThreads, setCpuThreads] = useState(Math.max(1, Number(initialSettings.cpuThreads) || 4));
  const [benchmarkRepeats, setBenchmarkRepeats] = useState(Math.max(1, Number(initialSettings.benchmarkRepeats) || 3));
  const [returnTokenIds, setReturnTokenIds] = useState(Boolean(initialSettings.returnTokenIds));
  const [returnFrameIndices, setReturnFrameIndices] = useState(Boolean(initialSettings.returnFrameIndices));
  const [returnLogProbs, setReturnLogProbs] = useState(Boolean(initialSettings.returnLogProbs));
  const [returnTdtSteps, setReturnTdtSteps] = useState(Boolean(initialSettings.returnTdtSteps));
  const [returnDecoderState, setReturnDecoderState] = useState(Boolean(initialSettings.returnDecoderState));
  const [enableProfiling, setEnableProfiling] = useState(initialSettings.enableProfiling !== false);
  const [status, setStatus] = useState('Idle');
  const [loadProgressText, setLoadProgressText] = useState('');
  const [loadProgressPct, setLoadProgressPct] = useState(null);
  const [transcribeProgressText, setTranscribeProgressText] = useState('');
  const [transcribeProgressPct, setTranscribeProgressPct] = useState(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [canonicalJson, setCanonicalJson] = useState('');
  const [nativeJson, setNativeJson] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [audioPreparation, setAudioPreparation] = useState(null);
  const [benchmarkRuns, setBenchmarkRuns] = useState([]);
  const [benchmarkSummary, setBenchmarkSummary] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioLabel, setAudioLabel] = useState('Bundled sample');
  const [audioUrl, setAudioUrl] = useState(SAMPLE_URL);
  const [localEntries, setLocalEntries] = useState([]);
  const [localFolderName, setLocalFolderName] = useState('');
  const [localTokenizerOptions, setLocalTokenizerOptions] = useState(['vocab.txt']);
  const [localTokenizerName, setLocalTokenizerName] = useState('vocab.txt');
  const [localPreprocessorOptions, setLocalPreprocessorOptions] = useState([initialModelConfig.preprocessor]);
  const [encoderOptions, setEncoderOptions] = useState(QUANT_OPTIONS);
  const [decoderOptions, setDecoderOptions] = useState(QUANT_OPTIONS);
  const [loadEvents, setLoadEvents] = useState([]);
  const [transcriptionEvents, setTranscriptionEvents] = useState([]);
  const [lastLoadRequest, setLastLoadRequest] = useState(null);
  const [lastLoadResult, setLastLoadResult] = useState(null);
  const [lastTranscriptionRequest, setLastTranscriptionRequest] = useState(null);
  const modelHandleRef = useRef(null);
  const audioInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const transcribeSectionRef = useRef(null);
  const benchmarkSectionRef = useRef(null);
  const [topTab, setTopTab] = useState('transcribe');
  const modelOptions = useMemo(() => Object.entries(MODELS).map(([key, config]) => ({ key, config })), []);
  const selectedModelConfig = MODELS[selectedModel];
  const defaultWeights = getParakeetDefaultWeightSetup(selectedModel, backend);
  const recommendedSettings = useMemo(
    () => getRecommendedModelSettings(selectedModel, backend),
    [selectedModel, backend],
  );
  const previousRecommendedSettingsRef = useRef(recommendedSettings);
  const effectiveResponseFlavor = loadStrategy === LOAD_STRATEGIES.ROOT ? responseFlavor : 'native';
  const currentOutputLabel = loadStrategy === LOAD_STRATEGIES.ROOT
    ? describeResponseFlavor(effectiveResponseFlavor)
    : 'Parakeet native JSON';
  const currentDetailLabel = loadStrategy === LOAD_STRATEGIES.ROOT ? detail : 'native fields';
  const currentContractSummary = loadStrategy === LOAD_STRATEGIES.ROOT
    ? 'Easy mode keeps loading simple and lets you inspect canonical output, native output, or both together.'
    : 'Native helper mode exposes the lower-level Parakeet response directly for debugging and parity checks.';
  const currentOptionsPreview = {
    source: modelSource,
    backend,
    language,
    detail,
    responseFlavor: effectiveResponseFlavor,
    audioPrepMode,
    audioResamplerQuality,
    encoderQuant,
    decoderQuant,
    preprocessorBackend,
  };

  function buildAudioPreparationOptions() {
    if (audioPrepMode === AUDIO_PREP_MODES.NATIVE_LINEAR) {
      return {
        targetSampleRate: 16000,
        strategy: 'native-rate',
        resamplerQuality: audioResamplerQuality,
      };
    }
    return {
      targetSampleRate: 16000,
      strategy: 'browser-target-rate',
    };
  }

  useEffect(() => {
    saveSettings({
      modelSource, loadStrategy, selectedModel, language, backend, encoderQuant, decoderQuant,
      preprocessor, preprocessorBackend, detail, responseFlavor, audioPrepMode, audioResamplerQuality, cpuThreads, benchmarkRepeats,
      returnTokenIds, returnFrameIndices, returnLogProbs, returnTdtSteps, returnDecoderState, enableProfiling,
    });
  }, [modelSource, loadStrategy, selectedModel, language, backend, encoderQuant, decoderQuant, preprocessor, preprocessorBackend, detail, responseFlavor, audioPrepMode, audioResamplerQuality, cpuThreads, benchmarkRepeats, returnTokenIds, returnFrameIndices, returnLogProbs, returnTdtSteps, returnDecoderState, enableProfiling]);

  useEffect(() => {
    if (!selectedModelConfig.languages.includes(language)) setLanguage(selectedModelConfig.defaultLanguage);
    if (!['nemo80', 'nemo128'].includes(preprocessor)) setPreprocessor(selectedModelConfig.preprocessor);
  }, [language, preprocessor, selectedModelConfig]);

  useEffect(() => {
    const previous = previousRecommendedSettingsRef.current;
    setEncoderQuant((current) =>
      current === previous.encoderQuant ? recommendedSettings.encoderQuant : current,
    );
    setDecoderQuant((current) =>
      current === previous.decoderQuant ? recommendedSettings.decoderQuant : current,
    );
    setPreprocessorBackend((current) =>
      current === previous.preprocessorBackend
        ? recommendedSettings.preprocessorBackend
        : current,
    );
    setPreprocessor((current) =>
      current === previous.preprocessor ? recommendedSettings.preprocessor : current,
    );
    previousRecommendedSettingsRef.current = recommendedSettings;
  }, [recommendedSettings]);

  useEffect(() => () => {
    if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => () => { void modelHandleRef.current?.dispose?.(); }, []);

  async function disposeActiveModel() {
    if (!modelHandleRef.current) return;
    await modelHandleRef.current.dispose?.();
    modelHandleRef.current = null;
  }

  function resetResultPanels() {
    setTranscript('');
    setCanonicalJson('');
    setNativeJson('');
    setRawJson('');
    setLatestMetrics(null);
    setAudioPreparation(null);
    setBenchmarkRuns([]);
    setBenchmarkSummary(null);
    setLastTranscriptionRequest(null);
    setTranscriptionEvents([]);
    setTranscribeProgressText('');
    setTranscribeProgressPct(null);
  }

  function applyOptimizedDefaults() {
    setEncoderQuant(recommendedSettings.encoderQuant);
    setDecoderQuant(recommendedSettings.decoderQuant);
    setPreprocessorBackend(recommendedSettings.preprocessorBackend);
    setPreprocessor(recommendedSettings.preprocessor);
  }

  async function handleLocalEntries(entries, folderName) {
    const inspected = inspectParakeetLocalEntries(entries);
    const nextEncoderOptions = inspected.encoderQuantizations.length > 0 ? [...inspected.encoderQuantizations] : ['fp32'];
    const nextDecoderOptions = inspected.decoderQuantizations.length > 0 ? [...inspected.decoderQuantizations] : ['fp32'];
    const nextTokenizerOptions = inspected.tokenizerNames.length > 0 ? [...inspected.tokenizerNames] : ['vocab.txt'];
    const nextPreprocessorOptions = inspected.preprocessorNames.length > 0 ? [...inspected.preprocessorNames] : [selectedModelConfig.preprocessor];
    setLocalEntries(entries);
    setLocalFolderName(folderName || '');
    setEncoderOptions(nextEncoderOptions);
    setDecoderOptions(nextDecoderOptions);
    setLocalTokenizerOptions(nextTokenizerOptions);
    setLocalPreprocessorOptions(nextPreprocessorOptions);
    setEncoderQuant(nextEncoderOptions[0]);
    setDecoderQuant(nextDecoderOptions[0]);
    setLocalTokenizerName(nextTokenizerOptions[0]);
    setPreprocessor(nextPreprocessorOptions[0]);
    setStatus(`Selected local model folder (${entries.length} files).`);
  }

  async function pickLocalFolder() {
    try {
      if (typeof window.showDirectoryPicker === 'function') {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        await handleLocalEntries(await collectParakeetLocalEntries(dirHandle), dirHandle.name);
      } else {
        folderInputRef.current?.click();
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus(`Folder read failed: ${safeMessage(error)}`);
    }
  }

  function buildRootHubLoadRequest() {
    return {
      preset: 'parakeet',
      modelId: selectedModel,
      backend,
      options: {
        source: {
          kind: 'huggingface',
          repoId: selectedModelConfig.repoId,
          encoderQuant,
          decoderQuant,
          preprocessorName: preprocessor,
          preprocessorBackend,
          cpuThreads,
          enableProfiling,
        },
      },
    };
  }

  function buildDirectSourceFromResolved(resolved) {
    return {
      kind: 'direct',
      artifacts: {
        encoderUrl: resolved.config.encoderUrl,
        decoderUrl: resolved.config.decoderUrl,
        tokenizerUrl: resolved.config.tokenizerUrl,
        preprocessorUrl: resolved.config.preprocessorUrl,
        encoderDataUrl: resolved.config.encoderDataUrl,
        decoderDataUrl: resolved.config.decoderDataUrl,
        encoderFilename: resolved.config.filenames?.encoder,
        decoderFilename: resolved.config.filenames?.decoder,
      },
      preprocessorBackend: resolved.config.preprocessorBackend,
      cpuThreads,
      enableProfiling,
    };
  }

  function buildRootTranscriptionRequest() {
    return { detail, responseFlavor: effectiveResponseFlavor, language, returnTokenIds, returnFrameIndices, returnLogProbs, returnTdtSteps, returnDecoderState };
  }

  function buildLegacyTranscriptionRequest() {
    return { returnTimestamps: detail !== 'text', returnTokenIds, returnFrameIndices, returnLogProbs, returnTdtSteps, returnDecoderState };
  }

  async function loadWithRootHelper() {
    if (modelSource === MODEL_SOURCE_OPTIONS.LOCAL) {
      if (localEntries.length === 0) throw new Error('Pick a local model folder first.');
      setStatus('Resolving local Parakeet artifacts…');
      const resolved = await resolveParakeetLocalEntries(localEntries, {
        modelId: selectedModel,
        encoderQuant,
        decoderQuant,
        tokenizerName: localTokenizerName,
        preprocessorName: preprocessor,
        preprocessorBackend,
        backend,
        cpuThreads,
        enableProfiling,
      });
      const loadRequest = { preset: 'parakeet', modelId: selectedModel, backend, options: { source: buildDirectSourceFromResolved(resolved) } };
      setLastLoadRequest(loadRequest);
      setLastLoadResult({ strategy: LOAD_STRATEGIES.ROOT, source: modelSource, selection: resolved.selection, localFolderName });
      let loaded;
      try {
        loaded = await loadSpeechModel({
          ...loadRequest,
          onProgress: (event) => {
            const progressPct = resolveLoadEventProgress(event);
            appendLogEntry(setLoadEvents, { ...event, progress: progressPct === null ? undefined : progressPct / 100, timestamp: new Date().toLocaleTimeString() });
            setLoadProgressText(describeLoadEvent(event));
            if (progressPct !== null) setLoadProgressPct(progressPct);
          },
        });
      } catch (error) {
        await Promise.all(resolved.assetHandles.map(async (handle) => handle.dispose()));
        throw error;
      }
      return {
        label: 'Root convenience loader',
        loadedBy: 'loadSpeechModel()',
        async dispose() {
          await loaded.dispose();
          await Promise.all(resolved.assetHandles.map(async (handle) => handle.dispose()));
        },
        async transcribePrepared(prepared, options) {
          return loaded.transcribe(PcmAudioBuffer.fromMono(prepared.pcm, prepared.sampleRate), options);
        },
      };
    }

    const loadRequest = buildRootHubLoadRequest();
    setLastLoadRequest(loadRequest);
    setLastLoadResult({ strategy: LOAD_STRATEGIES.ROOT, source: modelSource, repoId: selectedModelConfig.repoId, optimizedDefaults: defaultWeights });
    const loaded = await loadSpeechModel({
      ...loadRequest,
      onProgress: (event) => {
        const progressPct = resolveLoadEventProgress(event);
        appendLogEntry(setLoadEvents, { ...event, progress: progressPct === null ? undefined : progressPct / 100, timestamp: new Date().toLocaleTimeString() });
        setLoadProgressText(describeLoadEvent(event));
        if (progressPct !== null) setLoadProgressPct(progressPct);
      },
    });
    return {
      label: 'Root convenience loader',
      loadedBy: 'loadSpeechModel()',
      async dispose() { await loaded.dispose(); },
      async transcribePrepared(prepared, options) {
        return loaded.transcribe(PcmAudioBuffer.fromMono(prepared.pcm, prepared.sampleRate), options);
      },
    };
  }
  async function loadWithLegacyHelper() {
    if (modelSource === MODEL_SOURCE_OPTIONS.LOCAL) {
      if (localEntries.length === 0) throw new Error('Pick a local model folder first.');
      setLastLoadRequest({ helper: 'loadParakeetModelFromLocalEntries', modelId: selectedModel, encoderQuant, decoderQuant, tokenizerName: localTokenizerName, preprocessorName: preprocessor, preprocessorBackend, backend, cpuThreads, enableProfiling });
      const localResult = await loadParakeetModelFromLocalEntries(localEntries, { modelId: selectedModel, encoderQuant, decoderQuant, tokenizerName: localTokenizerName, preprocessorName: preprocessor, preprocessorBackend, backend, cpuThreads, enableProfiling });
      setLastLoadResult({ strategy: LOAD_STRATEGIES.LEGACY, source: modelSource, selection: localResult.selection, localFolderName });
      setLoadProgressText(`${localResult.selection.encoderName} + ${localResult.selection.decoderName}`);
      setLoadProgressPct(100);
      return {
        label: 'Parakeet compatibility helper',
        loadedBy: 'loadParakeetModelFromLocalEntries()',
        async dispose() { await localResult.model.dispose(); },
        async transcribePrepared(prepared, options) { return localResult.model.transcribe(prepared.pcm, prepared.sampleRate, options); },
      };
    }

    setLastLoadRequest({ helper: 'loadModelWithFallback', modelId: selectedModel, repoId: selectedModelConfig.repoId, encoderQuant, decoderQuant, preprocessor, preprocessorBackend, backend, cpuThreads, enableProfiling });
    const remoteResult = await loadModelWithFallback({
      repoIdOrModelKey: selectedModel,
      options: {
        encoderQuant,
        decoderQuant,
        preprocessor,
        preprocessorBackend,
        backend,
        cpuThreads,
        enableProfiling,
        progress: ({ loaded, total, file, percent, loadedMiB, totalMiB, isComplete }) => {
          const progress = total > 0 ? loaded / total : percent !== undefined ? percent / 100 : null;
          const message = `${file}${percent !== undefined ? ` • ${percent}%` : ''}${Number.isFinite(loadedMiB) ? ` • ${fmtMiB(loadedMiB)}` : ''}${Number.isFinite(totalMiB) ? ` / ${fmtMiB(totalMiB)}` : ''}${isComplete ? ' • complete' : ''}`;
          appendLogEntry(setLoadEvents, { phase: 'download', file, loaded, total, percent, loadedMiB, totalMiB, progress: progress ?? undefined, message, timestamp: new Date().toLocaleTimeString() });
          setLoadProgressText(message);
          setLoadProgressPct(progress === null ? null : Math.round(progress * 100));
        },
      },
      getParakeetModelFn: getParakeetModel,
      fromUrlsFn: ParakeetModel.fromUrls,
      onBeforeCompile: ({ modelUrls }) => {
        appendLogEntry(setLoadEvents, { phase: 'compile', message: `encoder=${modelUrls.quantisation.encoder}, decoder=${modelUrls.quantisation.decoder}`, timestamp: new Date().toLocaleTimeString() });
        setStatus('Compiling model…');
        setLoadProgressText(`encoder=${modelUrls.quantisation.encoder}, decoder=${modelUrls.quantisation.decoder}`);
        setLoadProgressPct(null);
      },
    });
    setLastLoadResult({ strategy: LOAD_STRATEGIES.LEGACY, source: modelSource, modelUrls: remoteResult.modelUrls, retryUsed: remoteResult.retryUsed });
    return {
      label: 'Parakeet compatibility helper',
      loadedBy: 'loadModelWithFallback()',
      async dispose() { await remoteResult.model.dispose(); },
      async transcribePrepared(prepared, options) { return remoteResult.model.transcribe(prepared.pcm, prepared.sampleRate, options); },
    };
  }

  async function loadModel() {
    setIsLoadingModel(true);
    setModelLoaded(false);
    setStatus(modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? 'Preparing local model…' : 'Loading model from Hugging Face…');
    setLoadEvents([]);
    setLoadProgressText('');
    setLoadProgressPct(modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? null : 0);
    resetResultPanels();
    try {
      await disposeActiveModel();
      const handle = loadStrategy === LOAD_STRATEGIES.ROOT ? await loadWithRootHelper() : await loadWithLegacyHelper();
      modelHandleRef.current = handle;
      setModelLoaded(true);
      setStatus(`${handle.label} ready.`);
      setLoadProgressText(`${handle.label} ready for transcription.`);
      setLoadProgressPct(100);
    } catch (error) {
      console.error(error);
      setStatus(`Failed: ${safeMessage(error)}`);
    } finally {
      setIsLoadingModel(false);
    }
  }

  async function runTranscription() {
    if (!modelHandleRef.current) {
      setStatus('Load a model first.');
      return;
    }
    setIsWorking(true);
    setStatus('Preparing audio…');
    setTranscriptionEvents([]);
    setTranscribeProgressText('');
    setTranscribeProgressPct(0);
    setBenchmarkRuns([]);
    setBenchmarkSummary(null);
    try {
      const prepared = await decodeAudioSourceToMonoPcm(audioFile || SAMPLE_URL, buildAudioPreparationOptions());
      setAudioPreparation({ ...prepared.metrics, sampleRate: prepared.sampleRate, numberOfChannels: prepared.numberOfChannels, durationSec: prepared.durationSec });
      const request = loadStrategy === LOAD_STRATEGIES.ROOT ? buildRootTranscriptionRequest() : buildLegacyTranscriptionRequest();
      setLastTranscriptionRequest({ ...request, language, effectiveResponseFlavor });
      setStatus('Transcribing…');
      const result = await modelHandleRef.current.transcribePrepared(prepared, loadStrategy === LOAD_STRATEGIES.ROOT ? {
        ...request,
        onProgress: (event) => {
          appendLogEntry(setTranscriptionEvents, { ...event, timestamp: new Date().toLocaleTimeString() });
          setTranscribeProgressText(event.message || event.stage);
          setTranscribeProgressPct(Math.round((event.progress ?? 0) * 100));
        },
      } : request);
      const canonical = extractCanonicalResult(result);
      const native = extractNativeResult(result);
      const metrics = extractResultMetrics(result);
      setTranscript(extractDisplayText(result));
      setCanonicalJson(toJSON(canonical));
      setNativeJson(toJSON(native));
      setRawJson(toJSON(result));
      setLatestMetrics({ ...metrics, words: extractWordCount(result), tokens: extractTokenCount(result) });
      setTranscribeProgressPct(100);
      setStatus('Transcription complete.');
    } catch (error) {
      console.error(error);
      setStatus(`Failed: ${safeMessage(error)}`);
    } finally {
      setIsWorking(false);
    }
  }

  async function benchmarkCurrentAudio() {
    if (!modelHandleRef.current) {
      setStatus('Load a model first.');
      return;
    }
    setIsWorking(true);
    setStatus('Preparing benchmark audio…');
    setBenchmarkRuns([]);
    setBenchmarkSummary(null);
    try {
      const prepared = await decodeAudioSourceToMonoPcm(audioFile || SAMPLE_URL, buildAudioPreparationOptions());
      setAudioPreparation({ ...prepared.metrics, sampleRate: prepared.sampleRate, numberOfChannels: prepared.numberOfChannels, durationSec: prepared.durationSec });
      const request = loadStrategy === LOAD_STRATEGIES.ROOT ? buildRootTranscriptionRequest() : buildLegacyTranscriptionRequest();
      const runs = [];
      for (let index = 0; index < benchmarkRepeats; index += 1) {
        setStatus(`Benchmark ${index + 1}/${benchmarkRepeats}…`);
        const startMs = performance.now();
        const result = await modelHandleRef.current.transcribePrepared(prepared, request);
        runs.push({ index: index + 1, wallMs: performance.now() - startMs, metrics: extractResultMetrics(result), words: extractWordCount(result) ?? 0, tokens: extractTokenCount(result) ?? 0 });
      }
      setBenchmarkRuns(runs);
      setBenchmarkSummary(summarizeBenchmark(runs, prepared.durationSec));
      setStatus('Benchmark complete.');
    } catch (error) {
      console.error(error);
      setStatus(`Failed: ${safeMessage(error)}`);
    } finally {
      setIsWorking(false);
    }
  }

  function focusSection(tab) {
    setTopTab(tab);
    const target = tab === 'benchmark' ? benchmarkSectionRef.current : transcribeSectionRef.current;
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="demo-shell">
      <div className="demo-container">
        <div className="demo-topbar">
          <div className="demo-tabs">
            <button type="button" onClick={() => focusSection('transcribe')} className={`demo-tab ${topTab === 'transcribe' ? 'demo-tab-active' : 'demo-tab-idle'}`}>Transcribe</button>
            <button type="button" onClick={() => focusSection('benchmark')} className={`demo-tab ${topTab === 'benchmark' ? 'demo-tab-active' : 'demo-tab-idle'}`}>Benchmark Lab</button>
          </div>
          <button type="button" className="demo-gear" aria-label="Demo settings">
            <span className="text-[18px] leading-none">⚙</span>
          </button>
        </div>
        <div className="demo-heading">
          <h1 className="demo-title">Parakeet TDT Demo</h1>
          <p className="demo-subtitle">@asrjs/speech-recognition {VERSION} ({SOURCE})</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[360px,minmax(0,1fr),470px]">
          <aside className="space-y-4 xl:sticky xl:top-4 self-start">
            <Panel title="Model Configuration" subtitle="Configure loading mode, artifacts, backend, and quantization just like the original demo control panel.">
              <div className="grid gap-2">
                <button type="button" onClick={() => setLoadStrategy(LOAD_STRATEGIES.ROOT)} disabled={isLoadingModel || modelLoaded} className={`mode-card ${loadStrategy === LOAD_STRATEGIES.ROOT ? 'mode-card-active-emerald' : 'mode-card-idle'}`}><p className="font-medium">Easy mode</p><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Uses <code className="font-mono">loadSpeechModel()</code> and can return canonical output, native output, or both.</p></button>
                <button type="button" onClick={() => setLoadStrategy(LOAD_STRATEGIES.LEGACY)} disabled={isLoadingModel || modelLoaded} className={`mode-card ${loadStrategy === LOAD_STRATEGIES.LEGACY ? 'mode-card-active-amber' : 'mode-card-idle'}`}><p className="font-medium">Native helper mode</p><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Uses the Parakeet helper and keeps the native response shape visible for debugging.</p></button>
              </div>
            </Panel>

            <Panel title="Model Setup" subtitle="Pick the model, artifact source, backend, and weight setup.">
              <div className="space-y-4">
                <Field label="Artifact source"><select value={modelSource} onChange={(event) => setModelSource(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control"><option value={MODEL_SOURCE_OPTIONS.HUGGINGFACE}>Hugging Face</option><option value={MODEL_SOURCE_OPTIONS.LOCAL}>Local folder</option></select></Field>
                <Field label="Model"><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control">{modelOptions.map(({ key, config }) => <option key={key} value={key}>{config.displayName}</option>)}</select><p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{selectedModelConfig.repoId} • {selectedModelConfig.languages.map((lang) => LANGUAGE_NAMES[lang] || lang).join(', ')}</p></Field>
                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? <><button type="button" onClick={pickLocalFolder} disabled={isLoadingModel || modelLoaded} className="compact-button-secondary w-full">Pick local model folder</button><input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length === 0) return; void handleLocalEntries(createParakeetLocalEntries(files), ''); event.target.value = ''; }} /><div className="rounded-[16px] border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">{localFolderName || 'No folder selected yet.'}</div></> : null}
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Backend"><select value={backend} onChange={(event) => setBackend(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control"><option value="webgpu-hybrid">webgpu-hybrid</option><option value="webgpu">webgpu</option><option value="webgpu-strict">webgpu-strict</option><option value="wasm">wasm</option></select></Field><Field label="Threads"><input type="number" min="1" value={cpuThreads} disabled={isLoadingModel || modelLoaded} onChange={(event) => setCpuThreads(Math.max(1, Number(event.target.value) || 1))} className="compact-control" /></Field></div>
                <div className="rounded-[16px] border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 p-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">ASRJS defaults</p><button type="button" onClick={applyOptimizedDefaults} disabled={isLoadingModel || modelLoaded} className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Apply defaults</button></div><p className="text-[13px]">Encoder {recommendedSettings.encoderQuant} • Decoder {recommendedSettings.decoderQuant} • Preprocessor {recommendedSettings.preprocessorBackend} ({recommendedSettings.preprocessor}) • Fallback {defaultWeights.encoderFallback}</p></div>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Encoder quant"><select value={encoderQuant} onChange={(event) => setEncoderQuant(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control">{encoderOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Decoder quant"><select value={decoderQuant} onChange={(event) => setDecoderQuant(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control">{decoderOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Preprocessor backend"><select value={preprocessorBackend} onChange={(event) => setPreprocessorBackend(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control"><option value="js">js</option><option value="onnx">onnx</option></select></Field><Field label="Preprocessor model"><select value={preprocessor} onChange={(event) => setPreprocessor(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control">{(modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? localPreprocessorOptions : ['nemo128', 'nemo80']).map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? <Field label="Tokenizer file"><select value={localTokenizerName} onChange={(event) => setLocalTokenizerName(event.target.value)} disabled={isLoadingModel || modelLoaded} className="compact-control">{localTokenizerOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field> : null}
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),96px]">
                  <button type="button" onClick={loadModel} disabled={isLoadingModel || modelLoaded} className="compact-button-primary w-full">{isLoadingModel ? 'Loading...' : modelLoaded ? 'Model Loaded' : 'Load Model'}</button>
                  <button type="button" onClick={async () => { await disposeActiveModel(); setModelLoaded(false); setStatus('Disposed active model.'); setLoadProgressText(''); setLoadProgressPct(null); }} disabled={!modelLoaded || isLoadingModel} className="compact-button-secondary w-full">Dispose</button>
                </div>
              </div>
            </Panel>

            <Panel title="Transcription Options" subtitle="These options affect native detail, canonical detail, or both depending on the chosen surface.">
              <div className="space-y-4">
                <Field label="Language"><select value={language} onChange={(event) => setLanguage(event.target.value)} className="compact-control">{selectedModelConfig.languages.map((lang) => <option key={lang} value={lang}>{LANGUAGE_NAMES[lang] || lang}</option>)}</select></Field>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Canonical detail"><select value={detail} onChange={(event) => setDetail(event.target.value)} className="compact-control">{DETAIL_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Response flavor" hint={loadStrategy === LOAD_STRATEGIES.ROOT ? 'root helper only' : 'locked to native'}><select value={effectiveResponseFlavor} onChange={(event) => setResponseFlavor(event.target.value)} disabled={loadStrategy !== LOAD_STRATEGIES.ROOT} className="compact-control disabled:opacity-60">{RESPONSE_FLAVORS.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Audio prep">
                    <select value={audioPrepMode} onChange={(event) => setAudioPrepMode(event.target.value)} className="compact-control">
                      <option value={AUDIO_PREP_MODES.NATIVE_LINEAR}>Native decode + linear resample</option>
                      <option value={AUDIO_PREP_MODES.BROWSER_TARGET_RATE}>Browser target-rate AudioContext</option>
                    </select>
                  </Field>
                  <Field label="Resampler" hint={audioPrepMode === AUDIO_PREP_MODES.NATIVE_LINEAR ? 'js path' : 'browser path'}>
                    <select value={audioResamplerQuality} onChange={(event) => setAudioResamplerQuality(event.target.value)} disabled={audioPrepMode !== AUDIO_PREP_MODES.NATIVE_LINEAR} className="compact-control disabled:opacity-60">
                      {RESAMPLER_QUALITY_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3"><Toggle label="Return token ids" checked={returnTokenIds} onChange={setReturnTokenIds} /><Toggle label="Return frame indices" checked={returnFrameIndices} onChange={setReturnFrameIndices} /><Toggle label="Return log probabilities" checked={returnLogProbs} onChange={setReturnLogProbs} /><Toggle label="Return TDT step details" checked={returnTdtSteps} onChange={setReturnTdtSteps} /><Toggle label="Return decoder state snapshot" checked={returnDecoderState} onChange={setReturnDecoderState} /><Toggle label="Enable ORT profiling" checked={enableProfiling} onChange={setEnableProfiling} /></div>
              </div>
            </Panel>

            <Panel title="Status" subtitle="Live load and transcription state from the current developer surface."><div className="space-y-3"><p className={`text-sm font-medium ${modelLoaded ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>{status}</p><div className="space-y-1.5"><p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Load progress</p><p className="text-[12px] text-slate-600 dark:text-slate-400">{loadProgressText || 'No load activity yet.'}</p>{loadProgressPct !== null ? <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-emerald-500" style={{ width: `${loadProgressPct}%` }} /></div> : null}</div><div className="space-y-1.5"><p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Transcription progress</p><p className="text-[12px] text-slate-600 dark:text-slate-400">{transcribeProgressText || 'No transcription activity yet.'}</p>{transcribeProgressPct !== null ? <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-sky-500" style={{ width: `${transcribeProgressPct}%` }} /></div> : null}</div></div></Panel>
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-500 shadow-sm">
              <span className="demo-footer-chip">{cpuThreads} threads</span>
              <span>·</span>
              <span>{modelLoaded ? 'Done' : 'Idle'}</span>
              <span>·</span>
              <span>{selectedModel}</span>
              <span>·</span>
              <span>{backend}</span>
            </div>
          </aside>

          <main className="space-y-4 min-w-0" ref={transcribeSectionRef}>
            <Panel title="Test & Transcribe" subtitle="Pick audio, run a transcription, and inspect timings and output from one place.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),280px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-end">
                    <button type="button" onClick={() => { if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl); setAudioFile(null); setAudioLabel('Bundled sample'); setAudioUrl(SAMPLE_URL); }} className="compact-button-dark">▶ Sample</button>
                  </div>
                  <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl); setAudioFile(file); setAudioLabel(file.name); setAudioUrl(URL.createObjectURL(file)); event.target.value = ''; }} />
                  <button type="button" onClick={() => audioInputRef.current?.click()} className="demo-upload-zone w-full">
                    <div className="mb-2 text-[28px] text-[#688098]">☁</div>
                    <div>Drag & drop audio file here, or click to select</div>
                    <div className="mt-1 text-[11px] text-slate-400">Supports .wav, .mp3, .ogg</div>
                    <div className="mt-3 font-medium text-slate-600">{audioLabel}</div>
                  </button>
                  <audio controls src={audioUrl} className="w-full" />
                  <div className="demo-divider" />
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),120px,120px]">
                    <Field label="Benchmark repeats"><input type="number" min="1" max="50" value={benchmarkRepeats} onChange={(event) => setBenchmarkRepeats(Math.max(1, Number(event.target.value) || 1))} className="compact-control" /></Field>
                    <button type="button" onClick={runTranscription} disabled={!modelLoaded || isWorking} className="compact-button-dark self-end">{isWorking ? 'Working…' : 'Transcribe'}</button>
                    <button type="button" onClick={benchmarkCurrentAudio} disabled={!modelLoaded || isWorking} className="compact-button-secondary self-end font-medium disabled:opacity-50">Benchmark</button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="demo-soft-box">
                    <p className="metric-label">Current output</p>
                    <p className="mt-1 text-[13px] font-medium">{currentOutputLabel}</p>
                    <p className="mt-1 text-[13px] text-slate-600">{loadStrategy === LOAD_STRATEGIES.ROOT ? '{ canonical, native }' : 'native Parakeet JSON'}</p>
                    <p className="mt-2 text-[12px] leading-5 text-slate-600">
                      {loadStrategy === LOAD_STRATEGIES.ROOT ? 'Easy mode stays app-friendly while still letting you inspect the canonical and native layers.' : 'Native helper mode keeps the lower-level Parakeet fields visible for debugging and parity work.'}
                    </p>
                  </div>
                  <div className="demo-soft-box">
                    <p className="metric-label">Selected options</p>
                    <pre className="mt-2 overflow-x-auto text-[11px] leading-5 text-slate-700">{toJSON(currentOptionsPreview)}</pre>
                  </div>
                </div>
              </div>
            </Panel>
            <Panel title="Transcript" subtitle="Current top-level text extracted from the selected response flavor or compatibility helper."><div className="demo-soft-box p-6"><p className="text-[1.1rem] leading-8">{transcript || 'No text yet.'}</p></div></Panel>
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr),minmax(0,1fr)]"><Panel title="Audio Preparation" subtitle="Browser-side decode, downmix, and sample-rate preparation before inference.">{audioPreparation ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{[['Duration', fmtSeconds(audioPreparation.durationSec)], ['Input rate', audioPreparation.inputSampleRate ? `${audioPreparation.inputSampleRate} Hz` : '-'], ['Output rate', `${audioPreparation.sampleRate} Hz`], ['Channels', audioPreparation.numberOfChannels], ['Strategy', audioPreparation.strategy], ['Resampler', audioPreparation.resampler], ['Quality', audioPreparation.resamplerQuality ?? '-'], ['Decode', fmtMs(audioPreparation.decodeMs)], ['Downmix', fmtMs(audioPreparation.downmixMs)], ['Resample', fmtMs(audioPreparation.resampleMs)], ['Total prep', fmtMs(audioPreparation.totalMs)], ['Wall', fmtMs(audioPreparation.wallMs)]].map(([label, value]) => <div key={label} className="metric-cell"><p className="metric-label">{label}</p><p className="mt-1 text-[13px] font-medium">{value}</p></div>)}</div> : <p className="text-sm text-slate-500 dark:text-slate-400">No audio prepared yet.</p>}</Panel><Panel title="Latest Inference Metrics" subtitle="Normalized metrics from canonical or native output."><MetricGrid metrics={latestMetrics} /></Panel></div>
            <div ref={benchmarkSectionRef}>
              <Panel title="Benchmark Lab" subtitle="Repeat the same audio through the current surface to inspect throughput and consistency.">{benchmarkSummary ? <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[['Runs', benchmarkSummary.count], ['Avg wall', fmtMs(benchmarkSummary.avgWallMs)], ['Avg wall RTFx', fmtRate(benchmarkSummary.avgWallRtfx)], ['Avg model total', fmtMs(benchmarkSummary.avgTotalMs)]].map(([label, value]) => <div key={label} className="metric-cell"><p className="metric-label">{label}</p><p className="mt-1 text-[13px] font-medium">{value}</p></div>)}</div><div className="overflow-x-auto rounded-[12px] border border-slate-200 bg-[#fafcff]"><table className="w-full text-[12px]"><thead className="text-left text-slate-500"><tr><th className="px-3 py-2 pr-4">Run</th><th className="px-3 py-2 pr-4">Wall</th><th className="px-3 py-2 pr-4">Encode</th><th className="px-3 py-2 pr-4">Decode</th><th className="px-3 py-2 pr-4">Words</th><th className="px-3 py-2">Tokens</th></tr></thead><tbody>{benchmarkRuns.map((run) => <tr key={run.index} className="border-t border-slate-200"><td className="px-3 py-2 pr-4">#{run.index}</td><td className="px-3 py-2 pr-4">{fmtMs(run.wallMs)}</td><td className="px-3 py-2 pr-4">{fmtMs(run.metrics?.encodeMs)}</td><td className="px-3 py-2 pr-4">{fmtMs(run.metrics?.decodeMs)}</td><td className="px-3 py-2 pr-4">{run.words}</td><td className="px-3 py-2">{run.tokens}</td></tr>)}</tbody></table></div></div> : <p className="text-sm text-slate-500">Run repeated inference to inspect stability, wall time, and model timings.</p>}</Panel>
            </div>
            <JsonPanel title="Output JSON" value={rawJson} placeholder={'{\n  "status": "run a transcription"\n}'} />
          </main>
          <aside className="space-y-4 xl:sticky xl:top-4 self-start">
            <Panel title="API Contract" subtitle={currentContractSummary}>
              <div className="space-y-3">
                <div className="metric-cell">
                  <p className="metric-label">Current mode</p>
                  <p className="mt-1 text-[13px] font-medium">{loadStrategy === LOAD_STRATEGIES.ROOT ? 'Easy mode' : 'Native helper mode'}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Response: {currentOutputLabel}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Detail: {currentDetailLabel}</p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-600 dark:text-slate-400">
                    {loadStrategy === LOAD_STRATEGIES.ROOT ? 'Top-level loading stays simple while you inspect canonical, native, or combined responses.' : 'This mode is closer to the raw Parakeet implementation and is better for debugging exact native fields.'}
                  </p>
                </div>
                <div className="metric-cell">
                  <p className="metric-label">Selected options</p>
                  <pre className="mt-1 overflow-x-auto text-[11px] leading-5 text-slate-700 dark:text-slate-300">{toJSON(currentOptionsPreview)}</pre>
                </div>
              </div>
            </Panel>
            <JsonPanel title="Load Request" value={toJSON(lastLoadRequest)} placeholder={'{\n  "status": "load a model to inspect the request"\n}'} />
            <JsonPanel title="Load Resolution" value={toJSON(lastLoadResult)} placeholder={'{\n  "status": "no resolution yet"\n}'} />
            <JsonPanel title="Transcription Request" value={toJSON(lastTranscriptionRequest)} placeholder={'{\n  "status": "run a transcription to inspect the request"\n}'} />
            <JsonPanel title="Canonical Output" value={canonicalJson} placeholder={'{\n  "status": "canonical output unavailable for this response"\n}'} />
            <JsonPanel title="Native Output" value={nativeJson} placeholder={'{\n  "status": "native output unavailable for this response"\n}'} />
            <EventPanel title="Load Events" events={loadEvents} emptyMessage="Load a model to inspect progress phases and asset activity." />
            <EventPanel title="Transcription Events" events={transcriptionEvents} emptyMessage="Run transcription to inspect per-stage progress, remaining time, and metrics." />
          </aside>
        </div>
      </div>
    </div>
  );
}
