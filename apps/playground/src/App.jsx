import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PcmAudioBuffer,
  loadSpeechModel,
  listSpeechModels,
  listExperimentalSpeechFamilies,
} from '@asrjs/speech-recognition';
import { loadBuiltInSpeechModel } from '@asrjs/speech-recognition/builtins';
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

const SETTINGS_STORAGE_KEY = 'asrjs.playground.settings.v4';
const MODEL_SOURCE_OPTIONS = { HUGGINGFACE: 'huggingface', LOCAL: 'local' };
const LOAD_STRATEGIES = {
  UNIVERSAL: 'universal-catalog',
  ROOT: 'root-helper',
  LEGACY: 'parakeet-helper',
};
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

function getFamilyGroupLabel(model) {
  const family = model.classification?.family || model.preset || 'Other';
  const famLower = family.toLowerCase();
  const idLower = (model.modelId || '').toLowerCase();
  if (idLower.includes('oruk') || famLower.includes('oruk')) return 'Orukeet (Turkish)';
  if (famLower.includes('parakeet') || idLower.includes('parakeet')) {
    if (idLower.includes('ctc')) return 'Parakeet CTC';
    return 'Parakeet TDT';
  }
  if (famLower.includes('whisper') || idLower.includes('whisper')) return 'Whisper';
  if (famLower.includes('canary') || idLower.includes('canary')) return 'Canary';
  if (famLower.includes('medasr') || idLower.includes('medasr')) return 'MedASR';
  if (famLower.includes('moonshine') || idLower.includes('moonshine')) return 'Moonshine';
  if (famLower.includes('qwen') || idLower.includes('qwen')) return 'Qwen3-ASR';
  if (famLower.includes('wav2vec2') || idLower.includes('wav2vec2')) {
    if (idLower.includes('turkish') || idLower.includes('xls-r')) return 'Wav2Vec2 (Turkish)';
    return 'Wav2Vec2';
  }
  if (famLower.includes('nemotron') || idLower.includes('nemotron')) return 'Nemotron';
  if (famLower.includes('omnilingual') || idLower.includes('omnilingual')) return 'Omnilingual CTC';
  if (famLower.includes('gigaam') || idLower.includes('gigaam')) return 'GigaAM';
  if (famLower.includes('sensevoice') || idLower.includes('sensevoice')) return 'SenseVoice';
  return family.toUpperCase();
}

function getRecommendedModelSettings(modelKey, backend) {
  const modelConfig = MODELS[modelKey] ?? MODELS['parakeet-tdt-0.6b-v2'];
  const weights = getParakeetDefaultWeightSetup(modelKey, backend);
  return {
    encoderQuant: weights.encoderDefault,
    decoderQuant: weights.decoderDefault,
    preprocessorBackend: 'js',
    preprocessor: modelConfig?.preprocessor || 'nemo128',
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
    rtfx: metrics.rtfx ?? (metrics.rtf ? 1 / metrics.rtf : null),
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
  return native?.utteranceText ?? native?.utterance_text ?? (result?.text || '');
}

function extractResultMetrics(result) {
  const canonical = extractCanonicalResult(result);
  if (canonical?.meta?.metrics) return normalizeMetrics(canonical.meta.metrics);
  const native = extractNativeResult(result);
  if (native?.metrics) return normalizeMetrics(native.metrics);
  return null;
}

function extractWordsList(result) {
  const canonical = extractCanonicalResult(result);
  if (Array.isArray(canonical?.words) && canonical.words.length > 0) return canonical.words;
  const native = extractNativeResult(result);
  if (Array.isArray(native?.words) && native.words.length > 0) return native.words;
  return [];
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

function buildLiveCodeSnippet({
  loadStrategy,
  modelId,
  backend,
  detail,
  responseFlavor,
  language,
}) {
  if (loadStrategy === LOAD_STRATEGIES.UNIVERSAL) {
    return `import { PcmAudioBuffer } from '@asrjs/speech-recognition';
import { loadBuiltInSpeechModel } from '@asrjs/speech-recognition/builtins';

const model = await loadBuiltInSpeechModel({
  modelId: '${modelId}',
  backend: '${backend}',
});

// 1. Offline / Batch Transcription
const result = await model.transcribe(
  PcmAudioBuffer.fromMono(pcmFloat32, 16000),
  { detail: '${detail}', responseFlavor: '${responseFlavor}', language: '${language}' }
);

// 2. Stateful Streaming (Chunk-by-Chunk)
const streamer = await model.createStreamingTranscriber({ sampleRate: 16000 });
const partial = await streamer.pushAudio(chunkFloat32);
const finalTranscript = await streamer.finalize();`;
  }

  if (loadStrategy === LOAD_STRATEGIES.ROOT) {
    return `import { loadSpeechModel, PcmAudioBuffer } from '@asrjs/speech-recognition';
import { createBrowserTranscriptionWorkerClient } from '@asrjs/speech-recognition/worker';

// Main-thread or Zero-Copy Web Worker execution:
const model = await loadSpeechModel({
  preset: 'parakeet',
  modelId: '${modelId}',
  backend: '${backend}',
});
const envelope = await model.transcribe(
  PcmAudioBuffer.fromMono(pcmFloat32, 16000),
  { detail: '${detail}', responseFlavor: '${responseFlavor}' }
);`;
  }

  return `import { loadModelWithFallback, ParakeetModel, getParakeetModel } from '@asrjs/speech-recognition/presets/parakeet';

const { model } = await loadModelWithFallback({
  repoIdOrModelKey: '${modelId}',
  options: { backend: '${backend}' },
  getParakeetModelFn: getParakeetModel,
  fromUrlsFn: ParakeetModel.fromUrls,
});
const nativeResult = await model.transcribe(pcmFloat32, 16000, { returnTimestamps: true });`;
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
    <label className="space-y-1.5 block">
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
      <input
        type="checkbox"
        className="toggle-checkbox h-4 w-4 rounded border-gray-300 dark:border-gray-700"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function JsonPanel({ title, value, placeholder, actions }) {
  return (
    <div className="demo-json-panel">
      <div className="demo-json-header">
        <span>{title}</span>
        {actions}
      </div>
      <pre className="json-output overflow-x-auto bg-[#fafcff] dark:bg-[#10161f] px-4 py-4 text-[11px] leading-6 text-slate-700 dark:text-slate-200">
        {value || placeholder}
      </pre>
    </div>
  );
}

function EventPanel({ title, events, emptyMessage }) {
  return (
    <div className="demo-json-panel">
      <div className="demo-json-header">{title}</div>
      <div className="max-h-[320px] divide-y divide-slate-200 overflow-y-auto">
        {events.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          events.map((event, index) => (
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
          ))
        )}
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

  // Catalog models from listSpeechModels() + experimental families
  const catalogModels = useMemo(() => {
    const list = [...listSpeechModels()];
    const existingIds = new Set(list.map((m) => m.modelId));
    if (typeof listExperimentalSpeechFamilies === 'function') {
      try {
        for (const exp of listExperimentalSpeechFamilies()) {
          if (!existingIds.has(exp.modelIdHint)) {
            list.push({
              modelId: exp.modelIdHint,
              displayName: `${exp.artifactLabel || exp.family} (experimental)`,
              preset: exp.family,
              classification: { family: exp.family },
              languages: exp.languages || ['en'],
              isExperimental: true,
            });
            existingIds.add(exp.modelIdHint);
          }
        }
      } catch {
        // Experimental list fallback
      }
    }
    return list;
  }, []);

  // Group catalog models by family / preset
  const groupedCatalogModels = useMemo(() => {
    const groups = {};
    for (const model of catalogModels) {
      const groupName = getFamilyGroupLabel(model);
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(model);
    }
    return groups;
  }, [catalogModels]);

  const [modelSource, setModelSource] = useState(initialSettings.modelSource || MODEL_SOURCE_OPTIONS.HUGGINGFACE);
  const [loadStrategy, setLoadStrategy] = useState(initialSettings.loadStrategy || LOAD_STRATEGIES.UNIVERSAL);
  const [selectedCatalogModelId, setSelectedCatalogModelId] = useState(
    initialSettings.selectedCatalogModelId || 'parakeet-tdt-0.6b-v2'
  );
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [language, setLanguage] = useState(initialSettings.language || initialModelConfig?.defaultLanguage || 'en');
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
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [localEntries, setLocalEntries] = useState([]);
  const [localFolderName, setLocalFolderName] = useState('');
  const [localTokenizerOptions, setLocalTokenizerOptions] = useState(['vocab.txt']);
  const [localTokenizerName, setLocalTokenizerName] = useState('vocab.txt');
  const [localPreprocessorOptions, setLocalPreprocessorOptions] = useState([initialModelConfig?.preprocessor || 'nemo128']);
  const [encoderOptions, setEncoderOptions] = useState(QUANT_OPTIONS);
  const [decoderOptions, setDecoderOptions] = useState(QUANT_OPTIONS);
  const [loadEvents, setLoadEvents] = useState([]);
  const [transcriptionEvents, setTranscriptionEvents] = useState([]);
  const [lastLoadRequest, setLastLoadRequest] = useState(null);
  const [lastLoadResult, setLastLoadResult] = useState(null);
  const [lastTranscriptionRequest, setLastTranscriptionRequest] = useState(null);
  const [wordsList, setWordsList] = useState([]);
  const [streamingRevisions, setStreamingRevisions] = useState([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('__theme');
      if (q === 'dark' || q === 'light') return q === 'dark';
      return window.localStorage.getItem('asrjs-playground-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const modelHandleRef = useRef(null);
  const audioInputRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const folderInputRef = useRef(null);
  const transcribeSectionRef = useRef(null);
  const benchmarkSectionRef = useRef(null);
  const [topTab, setTopTab] = useState('transcribe');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    try {
      window.localStorage.setItem('asrjs-playground-theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const modelOptions = useMemo(() => Object.entries(MODELS).map(([key, config]) => ({ key, config })), []);
  const selectedModelConfig = MODELS[selectedModel] || MODELS['parakeet-tdt-0.6b-v2'];
  const defaultWeights = getParakeetDefaultWeightSetup(selectedModel, backend);
  const recommendedSettings = useMemo(
    () => getRecommendedModelSettings(selectedModel, backend),
    [selectedModel, backend],
  );
  const previousRecommendedSettingsRef = useRef(recommendedSettings);

  const selectedCatalogModel = useMemo(
    () => catalogModels.find((m) => m.modelId === selectedCatalogModelId) || catalogModels[0],
    [catalogModels, selectedCatalogModelId]
  );

  const activeAvailableLanguages = useMemo(() => {
    if (loadStrategy === LOAD_STRATEGIES.UNIVERSAL) {
      return selectedCatalogModel?.languages || ['en'];
    }
    return selectedModelConfig?.languages || ['en'];
  }, [loadStrategy, selectedCatalogModel, selectedModelConfig]);

  const effectiveResponseFlavor = loadStrategy === LOAD_STRATEGIES.LEGACY ? 'native' : responseFlavor;
  const currentOutputLabel = loadStrategy === LOAD_STRATEGIES.LEGACY
    ? 'Parakeet native JSON'
    : describeResponseFlavor(effectiveResponseFlavor);
  const currentDetailLabel = loadStrategy === LOAD_STRATEGIES.LEGACY ? 'native fields' : detail;
  const currentContractSummary = loadStrategy === LOAD_STRATEGIES.UNIVERSAL
    ? 'Universal Catalog mode dynamically supports all built-in models (Parakeet, Whisper, Canary, MedASR, Moonshine, Qwen3-ASR, etc.) via loadBuiltInSpeechModel().'
    : loadStrategy === LOAD_STRATEGIES.ROOT
    ? 'Parakeet Easy mode keeps loading simple and lets you inspect canonical output, native output, or both together.'
    : 'Parakeet Native helper mode exposes the lower-level Parakeet response directly for debugging and parity checks.';

  const currentOptionsPreview = {
    strategy: loadStrategy,
    modelId: loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? selectedCatalogModelId : selectedModel,
    source: modelSource,
    backend,
    language,
    detail,
    responseFlavor: effectiveResponseFlavor,
    audioPrepMode,
    audioResamplerQuality,
    ...(loadStrategy !== LOAD_STRATEGIES.UNIVERSAL ? { encoderQuant, decoderQuant, preprocessorBackend } : {}),
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
      modelSource,
      loadStrategy,
      selectedCatalogModelId,
      selectedModel,
      language,
      backend,
      encoderQuant,
      decoderQuant,
      preprocessor,
      preprocessorBackend,
      detail,
      responseFlavor,
      audioPrepMode,
      audioResamplerQuality,
      cpuThreads,
      benchmarkRepeats,
      returnTokenIds,
      returnFrameIndices,
      returnLogProbs,
      returnTdtSteps,
      returnDecoderState,
      enableProfiling,
    });
  }, [
    modelSource,
    loadStrategy,
    selectedCatalogModelId,
    selectedModel,
    language,
    backend,
    encoderQuant,
    decoderQuant,
    preprocessor,
    preprocessorBackend,
    detail,
    responseFlavor,
    audioPrepMode,
    audioResamplerQuality,
    cpuThreads,
    benchmarkRepeats,
    returnTokenIds,
    returnFrameIndices,
    returnLogProbs,
    returnTdtSteps,
    returnDecoderState,
    enableProfiling,
  ]);

  useEffect(() => {
    if (!activeAvailableLanguages.includes(language)) {
      setLanguage(activeAvailableLanguages[0] || 'en');
    }
  }, [activeAvailableLanguages, language]);

  useEffect(() => {
    if (!['nemo80', 'nemo128'].includes(preprocessor)) {
      setPreprocessor(selectedModelConfig?.preprocessor || 'nemo128');
    }
  }, [preprocessor, selectedModelConfig]);

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

  useEffect(() => () => {
    void modelHandleRef.current?.dispose?.();
  }, []);

  async function disposeActiveModel() {
    if (!modelHandleRef.current) return;
    await modelHandleRef.current.dispose?.();
    modelHandleRef.current = null;
  }

  function resetResultPanels() {
    setTranscript('');
    setWordsList([]);
    setStreamingRevisions([]);
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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        const newUrl = URL.createObjectURL(blob);
        setAudioFile(blob);
        setAudioLabel(`Recorded microphone audio (${(blob.size / 1024).toFixed(1)} KB)`);
        setAudioUrl(newUrl);
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setStatus('Recorded audio ready.');
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatus('Recording from microphone… (click Stop when finished)');
    } catch (err) {
      console.error(err);
      setStatus(`Microphone recording failed: ${safeMessage(err)}`);
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  // Universal Catalog loader
  async function loadWithUniversalCatalog() {
    const descriptor = catalogModels.find((m) => m.modelId === selectedCatalogModelId);
    const loadRequest = {
      modelId: selectedCatalogModelId,
      backend,
      options: {
        cpuThreads,
        enableProfiling,
        ...(language ? { language } : {}),
      },
    };
    setLastLoadRequest(loadRequest);
    setLastLoadResult({
      strategy: LOAD_STRATEGIES.UNIVERSAL,
      modelId: selectedCatalogModelId,
      displayName: descriptor?.displayName,
      family: descriptor?.classification?.family || descriptor?.preset,
      backend,
      languages: descriptor?.languages,
    });
    const loaded = await loadBuiltInSpeechModel({
      modelId: selectedCatalogModelId,
      backend,
      onProgress: (event) => {
        const progressPct = resolveLoadEventProgress(event);
        appendLogEntry(setLoadEvents, {
          ...event,
          progress: progressPct === null ? undefined : progressPct / 100,
          timestamp: new Date().toLocaleTimeString(),
        });
        setLoadProgressText(describeLoadEvent(event));
        if (progressPct !== null) setLoadProgressPct(progressPct);
      },
    });
    return {
      label: `Catalog: ${descriptor?.displayName || selectedCatalogModelId}`,
      loadedBy: 'loadBuiltInSpeechModel()',
      supportsStreaming: loaded.supportsStreaming,
      createStreamingTranscriber: typeof loaded.createStreamingTranscriber === 'function'
        ? (opts) => loaded.createStreamingTranscriber(opts)
        : null,
      async dispose() {
        await loaded.dispose();
      },
      async transcribePrepared(prepared, options) {
        const audioBuffer = PcmAudioBuffer.fromMono(prepared.pcm, prepared.sampleRate);
        return loaded.transcribe(audioBuffer, options);
      },
    };
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
    return {
      detail,
      responseFlavor: effectiveResponseFlavor,
      language,
      returnTokenIds,
      returnFrameIndices,
      returnLogProbs,
      returnTdtSteps,
      returnDecoderState,
    };
  }

  function buildLegacyTranscriptionRequest() {
    return {
      returnTimestamps: detail !== 'text',
      returnTokenIds,
      returnFrameIndices,
      returnLogProbs,
      returnTdtSteps,
      returnDecoderState,
    };
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
        supportsStreaming: loaded.supportsStreaming,
        createStreamingTranscriber: typeof loaded.createStreamingTranscriber === 'function'
          ? (opts) => loaded.createStreamingTranscriber(opts)
          : null,
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
      supportsStreaming: loaded.supportsStreaming,
      createStreamingTranscriber: typeof loaded.createStreamingTranscriber === 'function'
        ? (opts) => loaded.createStreamingTranscriber(opts)
        : null,
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
    setStatus(
      loadStrategy === LOAD_STRATEGIES.UNIVERSAL
        ? `Loading ${selectedCatalogModel?.displayName || selectedCatalogModelId}…`
        : modelSource === MODEL_SOURCE_OPTIONS.LOCAL
        ? 'Preparing local model…'
        : 'Loading model from Hugging Face…'
    );
    setLoadEvents([]);
    setLoadProgressText('');
    setLoadProgressPct(0);
    resetResultPanels();
    try {
      await disposeActiveModel();
      let handle;
      if (loadStrategy === LOAD_STRATEGIES.UNIVERSAL) {
        handle = await loadWithUniversalCatalog();
      } else if (loadStrategy === LOAD_STRATEGIES.ROOT) {
        handle = await loadWithRootHelper();
      } else {
        handle = await loadWithLegacyHelper();
      }
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
    setStreamingRevisions([]);
    try {
      const prepared = await decodeAudioSourceToMonoPcm(audioFile || SAMPLE_URL, buildAudioPreparationOptions());
      setAudioPreparation({ ...prepared.metrics, sampleRate: prepared.sampleRate, numberOfChannels: prepared.numberOfChannels, durationSec: prepared.durationSec });
      const request = loadStrategy === LOAD_STRATEGIES.LEGACY ? buildLegacyTranscriptionRequest() : buildRootTranscriptionRequest();
      setLastTranscriptionRequest({ ...request, language, effectiveResponseFlavor });
      setStatus('Transcribing…');
      const transcribeOptions = loadStrategy === LOAD_STRATEGIES.LEGACY ? request : {
        ...request,
        onProgress: (event) => {
          appendLogEntry(setTranscriptionEvents, { ...event, timestamp: new Date().toLocaleTimeString() });
          setTranscribeProgressText(event.message || event.stage);
          setTranscribeProgressPct(Math.round((event.progress ?? 0) * 100));
        },
      };
      const result = await modelHandleRef.current.transcribePrepared(prepared, transcribeOptions);
      const canonical = extractCanonicalResult(result);
      const native = extractNativeResult(result);
      const metrics = extractResultMetrics(result);
      setTranscript(extractDisplayText(result));
      setWordsList(extractWordsList(result));
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

  async function runStreamingSimulation() {
    if (!modelHandleRef.current) {
      setStatus('Load a model first.');
      return;
    }
    setIsWorking(true);
    setStatus('Preparing audio for streaming simulation…');
    setStreamingRevisions([]);
    try {
      const prepared = await decodeAudioSourceToMonoPcm(audioFile || SAMPLE_URL, buildAudioPreparationOptions());
      setAudioPreparation({ ...prepared.metrics, sampleRate: prepared.sampleRate, numberOfChannels: prepared.numberOfChannels, durationSec: prepared.durationSec });
      const chunkSamples = Math.max(1600, Math.round(prepared.sampleRate * 0.64)); // 640ms steps
      const revisions = [];
      if (typeof modelHandleRef.current.createStreamingTranscriber === 'function') {
        const streamer = await modelHandleRef.current.createStreamingTranscriber({ detail: 'words', language });
        try {
          let stepIdx = 0;
          for (let offset = 0; offset < prepared.pcm.length; offset += chunkSamples) {
            stepIdx += 1;
            const slice = prepared.pcm.subarray(offset, Math.min(prepared.pcm.length, offset + chunkSamples));
            const t0 = performance.now();
            const partial = await streamer.pushAudio(PcmAudioBuffer.fromMono(slice, prepared.sampleRate));
            const stepMs = performance.now() - t0;
            if (partial && partial.text) {
              const rev = {
                step: stepIdx,
                revision: partial.revision ?? stepIdx,
                audioSec: Math.min(prepared.durationSec, (offset + slice.length) / prepared.sampleRate),
                stepMs,
                text: partial.text,
                isFinal: false,
              };
              revisions.push(rev);
              setStreamingRevisions([...revisions]);
              setTranscript(partial.text);
            }
          }
          const tFin = performance.now();
          const finalRes = await streamer.finalize();
          const finMs = performance.now() - tFin;
          const finalText = extractDisplayText(finalRes);
          revisions.push({
            step: revisions.length + 1,
            revision: 'final',
            audioSec: prepared.durationSec,
            stepMs: finMs,
            text: finalText,
            isFinal: true,
          });
          setStreamingRevisions([...revisions]);
          setTranscript(finalText);
          setWordsList(extractWordsList(finalRes));
          setRawJson(toJSON(finalRes));
        } finally {
          await streamer.dispose?.();
        }
      } else {
        // Progressive prefix simulation for non-streaming legacy handle
        const windowSteps = Math.min(6, Math.max(2, Math.ceil(prepared.durationSec / 1.5)));
        for (let i = 1; i <= windowSteps; i += 1) {
          const endSample = Math.min(prepared.pcm.length, Math.round((prepared.pcm.length * i) / windowSteps));
          const prefixPcm = prepared.pcm.subarray(0, endSample);
          const t0 = performance.now();
          const res = await modelHandleRef.current.transcribePrepared(
            { ...prepared, pcm: prefixPcm, durationSec: endSample / prepared.sampleRate },
            loadStrategy === LOAD_STRATEGIES.LEGACY ? buildLegacyTranscriptionRequest() : buildRootTranscriptionRequest(),
          );
          const stepMs = performance.now() - t0;
          const text = extractDisplayText(res);
          revisions.push({
            step: i,
            revision: i === windowSteps ? 'final' : i,
            audioSec: endSample / prepared.sampleRate,
            stepMs,
            text,
            isFinal: i === windowSteps,
          });
          setStreamingRevisions([...revisions]);
          setTranscript(text);
          if (i === windowSteps) {
            setWordsList(extractWordsList(res));
            setRawJson(toJSON(res));
          }
        }
      }
      setStatus(`Streaming simulation complete (${revisions.length} steps).`);
    } catch (error) {
      console.error(error);
      setStatus(`Streaming failed: ${safeMessage(error)}`);
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
      const request = loadStrategy === LOAD_STRATEGIES.LEGACY ? buildLegacyTranscriptionRequest() : buildRootTranscriptionRequest();
      const runs = [];
      for (let index = 0; index < benchmarkRepeats; index += 1) {
        setStatus(`Benchmark ${index + 1}/${benchmarkRepeats}…`);
        const startMs = performance.now();
        const result = await modelHandleRef.current.transcribePrepared(prepared, request);
        runs.push({
          index: index + 1,
          wallMs: performance.now() - startMs,
          metrics: extractResultMetrics(result),
          words: extractWordCount(result) ?? 0,
          tokens: extractTokenCount(result) ?? 0,
        });
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
            <button type="button" onClick={() => focusSection('transcribe')} className={`demo-tab ${topTab === 'transcribe' ? 'demo-tab-active' : 'demo-tab-idle'}`}>Transcribe & Inspect</button>
            <button type="button" onClick={() => focusSection('benchmark')} className={`demo-tab ${topTab === 'benchmark' ? 'demo-tab-active' : 'demo-tab-idle'}`}>Benchmark Lab</button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              className="compact-button-secondary text-[12px] py-1.5 px-3"
              title="Toggle Light / Dark theme"
            >
              {darkMode ? '☀ Light' : '🌙 Dark'}
            </button>
          </div>
        </div>
        <div className="demo-heading">
          <h1 className="demo-title">ASRJS Model Playground</h1>
          <p className="demo-subtitle">Universal 16-Family Developer Workbench, Envelope Inspector & Live Code Generator • @asrjs/speech-recognition {VERSION} ({SOURCE})</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[380px,minmax(0,1fr),470px]">
          <aside className="space-y-4 xl:sticky xl:top-4 self-start">
            <Panel title="Model Architecture & Loading Mode" subtitle="Choose between Universal Catalog loading for all built-in model families or direct Parakeet presets.">
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setLoadStrategy(LOAD_STRATEGIES.UNIVERSAL)}
                  disabled={isLoadingModel || modelLoaded}
                  className={`mode-card ${loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? 'mode-card-active-emerald' : 'mode-card-idle'}`}
                >
                  <p className="font-medium text-emerald-800 dark:text-emerald-300">Universal Catalog Mode</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Supports all built-in model families (Parakeet, Orukeet, Whisper, Canary, MedASR, Moonshine, Qwen3-ASR, Wav2Vec2, SenseVoice, GigaAM, Nemotron) via <code className="font-mono">loadBuiltInSpeechModel()</code>.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setLoadStrategy(LOAD_STRATEGIES.ROOT)}
                  disabled={isLoadingModel || modelLoaded}
                  className={`mode-card ${loadStrategy === LOAD_STRATEGIES.ROOT ? 'mode-card-active-emerald' : 'mode-card-idle'}`}
                >
                  <p className="font-medium">Parakeet Easy Mode</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Uses <code className="font-mono">loadSpeechModel()</code> with Parakeet options and dual canonical/native envelope.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setLoadStrategy(LOAD_STRATEGIES.LEGACY)}
                  disabled={isLoadingModel || modelLoaded}
                  className={`mode-card ${loadStrategy === LOAD_STRATEGIES.LEGACY ? 'mode-card-active-amber' : 'mode-card-idle'}`}
                >
                  <p className="font-medium">Parakeet Native Helper Mode</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Uses the direct Parakeet helper with lower-level native response fields for parity verification.
                  </p>
                </button>
              </div>
            </Panel>

            <Panel title="Model Setup" subtitle="Pick model, execution backend, and tuning parameters.">
              <div className="space-y-4">
                {loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? (
                  <>
                    <Field label="Catalog Model (Grouped by Family)">
                      <select
                        value={selectedCatalogModelId}
                        onChange={(event) => setSelectedCatalogModelId(event.target.value)}
                        disabled={isLoadingModel || modelLoaded}
                        className="compact-control"
                      >
                        {Object.entries(groupedCatalogModels).map(([groupName, groupModels]) => (
                          <optgroup key={groupName} label={groupName}>
                            {groupModels.map((m) => (
                              <option key={m.modelId} value={m.modelId}>
                                {m.displayName || m.modelId}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {selectedCatalogModel ? (
                        <div className="mt-1.5 rounded-[8px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                          <p><span className="font-semibold">ID:</span> <code className="font-mono">{selectedCatalogModel.modelId}</code></p>
                          <p><span className="font-semibold">Family:</span> {selectedCatalogModel.classification?.family || selectedCatalogModel.preset}</p>
                          {selectedCatalogModel.loading?.repoId ? (
                            <p><span className="font-semibold">Repo:</span> {selectedCatalogModel.loading.repoId}</p>
                          ) : null}
                          <p><span className="font-semibold">Languages:</span> {(selectedCatalogModel.languages || ['en']).map((l) => LANGUAGE_NAMES[l] || l).join(', ')}</p>
                        </div>
                      ) : null}
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Backend">
                        <select
                          value={backend}
                          onChange={(event) => setBackend(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          <option value="webgpu-hybrid">webgpu-hybrid</option>
                          <option value="webgpu">webgpu</option>
                          <option value="wasm">wasm</option>
                        </select>
                      </Field>
                      <Field label="CPU Threads">
                        <input
                          type="number"
                          min="1"
                          value={cpuThreads}
                          disabled={isLoadingModel || modelLoaded}
                          onChange={(event) => setCpuThreads(Math.max(1, Number(event.target.value) || 1))}
                          className="compact-control"
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Artifact source">
                      <select
                        value={modelSource}
                        onChange={(event) => setModelSource(event.target.value)}
                        disabled={isLoadingModel || modelLoaded}
                        className="compact-control"
                      >
                        <option value={MODEL_SOURCE_OPTIONS.HUGGINGFACE}>Hugging Face</option>
                        <option value={MODEL_SOURCE_OPTIONS.LOCAL}>Local folder</option>
                      </select>
                    </Field>
                    <Field label="Model">
                      <select
                        value={selectedModel}
                        onChange={(event) => setSelectedModel(event.target.value)}
                        disabled={isLoadingModel || modelLoaded}
                        className="compact-control"
                      >
                        {modelOptions.map(({ key, config }) => (
                          <option key={key} value={key}>{config.displayName}</option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedModelConfig.repoId} • {selectedModelConfig.languages.map((lang) => LANGUAGE_NAMES[lang] || lang).join(', ')}
                      </p>
                    </Field>
                    {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? (
                      <>
                        <button
                          type="button"
                          onClick={pickLocalFolder}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-button-secondary w-full"
                        >
                          Pick local model folder
                        </button>
                        <input
                          ref={folderInputRef}
                          type="file"
                          multiple
                          webkitdirectory=""
                          directory=""
                          className="hidden"
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            if (files.length === 0) return;
                            void handleLocalEntries(createParakeetLocalEntries(files), '');
                            event.target.value = '';
                          }}
                        />
                        <div className="rounded-[16px] border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">
                          {localFolderName || 'No folder selected yet.'}
                        </div>
                      </>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Backend">
                        <select
                          value={backend}
                          onChange={(event) => setBackend(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          <option value="webgpu-hybrid">webgpu-hybrid</option>
                          <option value="webgpu">webgpu</option>
                          <option value="webgpu-strict">webgpu-strict</option>
                          <option value="wasm">wasm</option>
                        </select>
                      </Field>
                      <Field label="Threads">
                        <input
                          type="number"
                          min="1"
                          value={cpuThreads}
                          disabled={isLoadingModel || modelLoaded}
                          onChange={(event) => setCpuThreads(Math.max(1, Number(event.target.value) || 1))}
                          className="compact-control"
                        />
                      </Field>
                    </div>
                    <div className="rounded-[16px] border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">ASRJS defaults</p>
                        <button
                          type="button"
                          onClick={applyOptimizedDefaults}
                          disabled={isLoadingModel || modelLoaded}
                          className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                        >
                          Apply defaults
                        </button>
                      </div>
                      <p className="text-[13px]">
                        Encoder {recommendedSettings.encoderQuant} • Decoder {recommendedSettings.decoderQuant} • Preprocessor {recommendedSettings.preprocessorBackend} ({recommendedSettings.preprocessor}) • Fallback {defaultWeights.encoderFallback}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Encoder quant">
                        <select
                          value={encoderQuant}
                          onChange={(event) => setEncoderQuant(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          {encoderOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </Field>
                      <Field label="Decoder quant">
                        <select
                          value={decoderQuant}
                          onChange={(event) => setDecoderQuant(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          {decoderOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Preprocessor backend">
                        <select
                          value={preprocessorBackend}
                          onChange={(event) => setPreprocessorBackend(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          <option value="js">js</option>
                          <option value="onnx">onnx</option>
                        </select>
                      </Field>
                      <Field label="Preprocessor model">
                        <select
                          value={preprocessor}
                          onChange={(event) => setPreprocessor(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          {(modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? localPreprocessorOptions : ['nemo128', 'nemo80']).map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? (
                      <Field label="Tokenizer file">
                        <select
                          value={localTokenizerName}
                          onChange={(event) => setLocalTokenizerName(event.target.value)}
                          disabled={isLoadingModel || modelLoaded}
                          className="compact-control"
                        >
                          {localTokenizerOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </Field>
                    ) : null}
                  </>
                )}

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),96px]">
                  <button
                    type="button"
                    onClick={loadModel}
                    disabled={isLoadingModel || modelLoaded}
                    className="compact-button-primary w-full"
                  >
                    {isLoadingModel ? 'Loading...' : modelLoaded ? 'Model Loaded' : 'Load Model'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await disposeActiveModel();
                      setModelLoaded(false);
                      setStatus('Disposed active model.');
                      setLoadProgressText('');
                      setLoadProgressPct(null);
                    }}
                    disabled={!modelLoaded || isLoadingModel}
                    className="compact-button-secondary w-full"
                  >
                    Dispose
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Transcription Options" subtitle="Controls language, detail level, and response format.">
              <div className="space-y-4">
                <Field label="Language">
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="compact-control"
                  >
                    {activeAvailableLanguages.map((lang) => (
                      <option key={lang} value={lang}>{LANGUAGE_NAMES[lang] || lang}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Canonical detail">
                    <select
                      value={detail}
                      onChange={(event) => setDetail(event.target.value)}
                      className="compact-control"
                    >
                      {DETAIL_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Response flavor" hint={loadStrategy !== LOAD_STRATEGIES.LEGACY ? 'canonical supported' : 'locked to native'}>
                    <select
                      value={effectiveResponseFlavor}
                      onChange={(event) => setResponseFlavor(event.target.value)}
                      disabled={loadStrategy === LOAD_STRATEGIES.LEGACY}
                      className="compact-control disabled:opacity-60"
                    >
                      {RESPONSE_FLAVORS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Audio prep">
                    <select
                      value={audioPrepMode}
                      onChange={(event) => setAudioPrepMode(event.target.value)}
                      className="compact-control"
                    >
                      <option value={AUDIO_PREP_MODES.NATIVE_LINEAR}>Native decode + linear resample</option>
                      <option value={AUDIO_PREP_MODES.BROWSER_TARGET_RATE}>Browser target-rate AudioContext</option>
                    </select>
                  </Field>
                  <Field label="Resampler" hint={audioPrepMode === AUDIO_PREP_MODES.NATIVE_LINEAR ? 'js path' : 'browser path'}>
                    <select
                      value={audioResamplerQuality}
                      onChange={(event) => setAudioResamplerQuality(event.target.value)}
                      disabled={audioPrepMode !== AUDIO_PREP_MODES.NATIVE_LINEAR}
                      className="compact-control disabled:opacity-60"
                    >
                      {RESAMPLER_QUALITY_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3">
                  <Toggle label="Return token ids" checked={returnTokenIds} onChange={setReturnTokenIds} />
                  <Toggle label="Return frame indices" checked={returnFrameIndices} onChange={setReturnFrameIndices} />
                  <Toggle label="Return log probabilities" checked={returnLogProbs} onChange={setReturnLogProbs} />
                  <Toggle label="Return TDT step details" checked={returnTdtSteps} onChange={setReturnTdtSteps} />
                  <Toggle label="Return decoder state snapshot" checked={returnDecoderState} onChange={setReturnDecoderState} />
                  <Toggle label="Enable ORT profiling" checked={enableProfiling} onChange={setEnableProfiling} />
                </div>
              </div>
            </Panel>

            <Panel title="Status" subtitle="Live load and transcription state.">
              <div className="space-y-3">
                <p className={`text-sm font-medium ${modelLoaded ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {status}
                </p>
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Load progress</p>
                  <p className="text-[12px] text-slate-600 dark:text-slate-400">{loadProgressText || 'No load activity yet.'}</p>
                  {loadProgressPct !== null ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-full bg-emerald-500" style={{ width: `${loadProgressPct}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Transcription progress</p>
                  <p className="text-[12px] text-slate-600 dark:text-slate-400">{transcribeProgressText || 'No transcription activity yet.'}</p>
                  {transcribeProgressPct !== null ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-full bg-sky-500" style={{ width: `${transcribeProgressPct}%` }} />
                    </div>
                  ) : null}
                </div>
              </div>
            </Panel>

            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 shadow-sm">
              <span className="demo-footer-chip">{cpuThreads} threads</span>
              <span>·</span>
              <span>{modelLoaded ? 'Ready' : 'Idle'}</span>
              <span>·</span>
              <span>{loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? selectedCatalogModelId : selectedModel}</span>
              <span>·</span>
              <span>{backend}</span>
            </div>
          </aside>

          <main className="space-y-4 min-w-0" ref={transcribeSectionRef}>
            <Panel title="Test & Transcribe Audio" subtitle="Upload an audio file, record from microphone, or use the bundled Harvard sentences sample.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),280px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`compact-button-secondary font-semibold flex items-center gap-1.5 ${isRecording ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/50' : ''}`}
                    >
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-500'}`} />
                      {isRecording ? 'Stop Recording' : 'Record Mic'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
                        setAudioFile(null);
                        setAudioLabel('Bundled sample');
                        setAudioUrl(SAMPLE_URL);
                      }}
                      className="compact-button-dark"
                    >
                      ▶ Sample
                    </button>
                  </div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
                      setAudioFile(file);
                      setAudioLabel(file.name);
                      setAudioUrl(URL.createObjectURL(file));
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className="demo-upload-zone w-full"
                  >
                    <div className="mb-2 text-[28px] text-[#688098]">☁</div>
                    <div>Drag & drop audio file here, or click to select</div>
                    <div className="mt-1 text-[11px] text-slate-400">Supports .wav, .mp3, .ogg, .flac, .webm</div>
                    <div className="mt-3 font-medium text-slate-600 dark:text-slate-300">{audioLabel}</div>
                  </button>
                  <audio ref={audioPlayerRef} controls src={audioUrl} className="w-full" />
                  <div className="demo-divider" />
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),115px,125px,110px]">
                    <Field label="Benchmark repeats">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={benchmarkRepeats}
                        onChange={(event) => setBenchmarkRepeats(Math.max(1, Number(event.target.value) || 1))}
                        className="compact-control"
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={runTranscription}
                      disabled={!modelLoaded || isWorking}
                      className="compact-button-dark self-end"
                    >
                      {isWorking ? 'Working…' : 'Transcribe'}
                    </button>
                    <button
                      type="button"
                      onClick={runStreamingSimulation}
                      disabled={!modelLoaded || isWorking}
                      className="compact-button-secondary self-end font-medium disabled:opacity-50"
                      title="Simulate stateful chunked streaming (createStreamingTranscriber)"
                    >
                      Stream Chunks
                    </button>
                    <button
                      type="button"
                      onClick={benchmarkCurrentAudio}
                      disabled={!modelLoaded || isWorking}
                      className="compact-button-secondary self-end font-medium disabled:opacity-50"
                    >
                      Benchmark
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="demo-soft-box">
                    <p className="metric-label">Current output</p>
                    <p className="mt-1 text-[13px] font-medium">{currentOutputLabel}</p>
                    <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
                      {loadStrategy === LOAD_STRATEGIES.LEGACY ? 'native Parakeet JSON' : '{ canonical, native }'}
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-400">
                      {loadStrategy === LOAD_STRATEGIES.UNIVERSAL
                        ? 'Universal catalog handles all models with a unified canonical transcript interface.'
                        : loadStrategy === LOAD_STRATEGIES.ROOT
                        ? 'Easy mode stays app-friendly while still letting you inspect canonical and native layers.'
                        : 'Native helper mode keeps lower-level Parakeet fields visible for debugging.'}
                    </p>
                  </div>
                  <div className="demo-soft-box">
                    <p className="metric-label">Selected options</p>
                    <pre className="mt-2 overflow-x-auto text-[11px] leading-5 text-slate-700 dark:text-slate-300">{toJSON(currentOptionsPreview)}</pre>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Transcript & Word Alignment" subtitle="Canonical or native text output with interactive click-to-seek word timestamps.">
              <div className="space-y-4">
                <div className="demo-soft-box p-5">
                  <p className="text-[1.08rem] leading-8 font-normal">{transcript || 'No transcript yet. Load a model and click Transcribe or Stream Chunks.'}</p>
                </div>
                {wordsList.length > 0 ? (
                  <div className="demo-soft-box">
                    <div className="flex items-center justify-between mb-2">
                      <p className="metric-label">Word-Level Timestamps ({wordsList.length} words — click any word to seek audio)</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {wordsList.map((w) => (
                        <button
                          key={w.index}
                          type="button"
                          onClick={() => {
                            if (audioPlayerRef.current && Number.isFinite(w.startTime)) {
                              audioPlayerRef.current.currentTime = Math.max(0, w.startTime);
                              audioPlayerRef.current.play().catch(() => {});
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[7px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[12px] hover:border-emerald-500 transition"
                          title={w.confidence != null ? `Confidence: ${(w.confidence * 100).toFixed(1)}%` : undefined}
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-100">{w.text}</span>
                          {Number.isFinite(w.startTime) ? (
                            <span className="font-mono text-[10px] text-slate-400">
                              {w.startTime.toFixed(2)}s{Number.isFinite(w.endTime) ? `–${w.endTime.toFixed(2)}s` : ''}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {streamingRevisions.length > 0 ? (
                  <div className="demo-soft-box">
                    <p className="metric-label mb-2">Stateful Streaming Revisions ({streamingRevisions.length} steps)</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto text-[12px]">
                      {streamingRevisions.map((rev) => (
                        <div key={rev.step} className="flex items-start gap-2 rounded-[7px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5">
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${rev.isFinal ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                            {rev.isFinal ? 'FINAL' : `rev #${rev.revision}`}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">
                            @{rev.audioSec.toFixed(2)}s ({rev.stepMs.toFixed(0)}ms)
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">{rev.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Panel>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr),minmax(0,1fr)]">
              <Panel title="Audio Preparation" subtitle="Browser-side decode, downmix, and sample-rate preparation before inference.">
                {audioPreparation ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      ['Duration', fmtSeconds(audioPreparation.durationSec)],
                      ['Input rate', audioPreparation.inputSampleRate ? `${audioPreparation.inputSampleRate} Hz` : '-'],
                      ['Output rate', `${audioPreparation.sampleRate} Hz`],
                      ['Channels', audioPreparation.numberOfChannels],
                      ['Strategy', audioPreparation.strategy],
                      ['Resampler', audioPreparation.resampler],
                      ['Quality', audioPreparation.resamplerQuality ?? '-'],
                      ['Decode', fmtMs(audioPreparation.decodeMs)],
                      ['Downmix', fmtMs(audioPreparation.downmixMs)],
                      ['Resample', fmtMs(audioPreparation.resampleMs)],
                      ['Total prep', fmtMs(audioPreparation.totalMs)],
                      ['Wall', fmtMs(audioPreparation.wallMs)],
                    ].map(([label, value]) => (
                      <div key={label} className="metric-cell">
                        <p className="metric-label">{label}</p>
                        <p className="mt-1 text-[13px] font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No audio prepared yet.</p>
                )}
              </Panel>
              <Panel title="Latest Inference Metrics" subtitle="Normalized metrics from canonical or native output.">
                <MetricGrid metrics={latestMetrics} />
              </Panel>
            </div>

            <div ref={benchmarkSectionRef}>
              <Panel title="Benchmark Lab" subtitle="Repeat the same audio through the loaded model to inspect throughput, stability, and latency.">
                {benchmarkSummary ? (
                  <div className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ['Runs', benchmarkSummary.count],
                        ['Avg wall', fmtMs(benchmarkSummary.avgWallMs)],
                        ['Avg wall RTFx', fmtRate(benchmarkSummary.avgWallRtfx)],
                        ['Avg model total', fmtMs(benchmarkSummary.avgTotalMs)],
                      ].map(([label, value]) => (
                        <div key={label} className="metric-cell">
                          <p className="metric-label">{label}</p>
                          <p className="mt-1 text-[13px] font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-x-auto rounded-[12px] border border-slate-200 dark:border-slate-800 bg-[#fafcff] dark:bg-slate-900">
                      <table className="w-full text-[12px]">
                        <thead className="text-left text-slate-500 dark:text-slate-400">
                          <tr>
                            <th className="px-3 py-2 pr-4">Run</th>
                            <th className="px-3 py-2 pr-4">Wall</th>
                            <th className="px-3 py-2 pr-4">Encode</th>
                            <th className="px-3 py-2 pr-4">Decode</th>
                            <th className="px-3 py-2 pr-4">Words</th>
                            <th className="px-3 py-2">Tokens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {benchmarkRuns.map((run) => (
                            <tr key={run.index} className="border-t border-slate-200 dark:border-slate-800">
                              <td className="px-3 py-2 pr-4">#{run.index}</td>
                              <td className="px-3 py-2 pr-4">{fmtMs(run.wallMs)}</td>
                              <td className="px-3 py-2 pr-4">{fmtMs(run.metrics?.encodeMs)}</td>
                              <td className="px-3 py-2 pr-4">{fmtMs(run.metrics?.decodeMs)}</td>
                              <td className="px-3 py-2 pr-4">{run.words}</td>
                              <td className="px-3 py-2">{run.tokens}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Run repeated inference to inspect stability, wall time, and model timings.</p>
                )}
              </Panel>
            </div>
            <JsonPanel title="Output JSON" value={rawJson} placeholder={'{\n  "status": "run a transcription"\n}'} />
          </main>

          <aside className="space-y-4 xl:sticky xl:top-4 self-start">
            <Panel title="Copyable Code Snippet" subtitle="Ready-to-run TypeScript/JavaScript code for your selected model, backend, and options.">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? '@asrjs/speech-recognition/builtins' : '@asrjs/speech-recognition'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const code = buildLiveCodeSnippet({
                        loadStrategy,
                        modelId: loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? selectedCatalogModelId : selectedModel,
                        backend,
                        language,
                        detail,
                        responseFlavor: effectiveResponseFlavor,
                        encoderQuant,
                        decoderQuant,
                        preprocessorBackend,
                      });
                      navigator.clipboard?.writeText(code);
                      setCodeCopied(true);
                      setTimeout(() => setCodeCopied(false), 1800);
                    }}
                    className="compact-button-secondary text-[11px] py-1 px-2.5"
                  >
                    {codeCopied ? '✓ Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="demo-json-pre max-h-[300px] overflow-auto">
                  {buildLiveCodeSnippet({
                    loadStrategy,
                    modelId: loadStrategy === LOAD_STRATEGIES.UNIVERSAL ? selectedCatalogModelId : selectedModel,
                    backend,
                    language,
                    detail,
                    responseFlavor: effectiveResponseFlavor,
                    encoderQuant,
                    decoderQuant,
                    preprocessorBackend,
                  })}
                </pre>
              </div>
            </Panel>
            <Panel title="API Contract" subtitle={currentContractSummary}>
              <div className="space-y-3">
                <div className="metric-cell">
                  <p className="metric-label">Current mode</p>
                  <p className="mt-1 text-[13px] font-medium">{loadStrategy}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Response: {currentOutputLabel}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Detail: {currentDetailLabel}</p>
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
