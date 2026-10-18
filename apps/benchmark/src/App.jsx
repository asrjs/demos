import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  listSpeechModels,
  PcmAudioBuffer,
  resolveSpeechModelComponentBackends,
} from '@asrjs/speech-recognition';
import { loadBuiltInSpeechModel } from '@asrjs/speech-recognition/builtins';
import {
  collectSpeechModelLocalEntries,
  createSpeechModelLocalEntries,
  loadSpeechModelFromLocalEntries,
} from '@asrjs/speech-recognition/browser';
import {
  MODELS,
  LANGUAGE_NAMES,
  ParakeetModel,
  getParakeetModel,
  loadModelWithFallback,
} from '@asrjs/speech-recognition/presets/parakeet';
import { decodeAudioSourceToMonoPcm } from '@asrjs/speech-recognition/browser/media';
import {
  benchmarkLifecycleRecordsToCsv,
  benchmarkMemoryDeltaBytes,
  benchmarkRunRecordsToCsv,
  calcRtfx,
  summarizeNumericSeries,
  textSimilarity,
} from '@asrjs/speech-recognition/bench';
import { measureBrowserMemory } from '@asrjs/speech-recognition/bench/browser';
import {
  ScatterPlotSvg as SharedScatterPlotSvg,
  StackedBarChartSvg as SharedStackedBarChartSvg,
  StageShareDoughnutSvg as SharedStageShareDoughnutSvg,
} from '@asrjs/demo-ui';
import { useDemoTheme } from '@asrjs/demo-ui';
import {
  fetchDatasetSplits,
} from '@asrjs/speech-recognition/datasets';
import {
  buildHistogram,
  buildTargetSamplePlan,
  computeWerCer,
  findSweetSpotBucket,
  formatSeconds,
  linearFit,
  mean,
  median,
  parseDurationTargets,
  percentile,
  runsToMarkdownLeaderboard,
  resolveEffectiveRepeatCount,
  stddev,
  suggestDurationTargets,
  summarizeBenchmarkBuckets,
} from './benchmark-utils.jsx';
import { fetchBenchmarkSamples, selectDatasetMetadata } from './dataset-selection.js';
import './App.css';

function ScatterPlotSvg({ series = [], ...props }) {
  const points = series.flatMap((entry) =>
    (entry.data || []).map((point) => ({ ...point, seriesName: entry.label })),
  );
  const colorMap = Object.fromEntries(series.map((entry) => [entry.label, entry.color]));
  return (
    <SharedScatterPlotSvg
      {...props}
      points={points}
      groupKey="seriesName"
      colorMap={colorMap}
    />
  );
}

function StackedBarChartSvg({ labels = [], datasets = [], yLabel = 'ms' }) {
  const stages = datasets.map((dataset) => dataset.label);
  const series = labels.map((label, index) => ({
    label,
    ...Object.fromEntries(datasets.map((dataset) => [dataset.label, dataset.data[index]])),
  }));
  const colors = Object.fromEntries(datasets.map((dataset) => [dataset.label, dataset.color]));
  return <SharedStackedBarChartSvg series={series} stages={stages} colors={colors} yUnit={yLabel} />;
}

function StageShareDoughnutSvg({ stages = [] }) {
  return <SharedStageShareDoughnutSvg shares={stages} />;
}

const SETTINGS_KEY = 'asrjs.benchmark-demo.settings.v3';
const SNAPSHOTS_KEY = 'asrjs.benchmark-demo.snapshots.v3';
const MAX_SNAPSHOTS = 24;

const BACKEND_MODES = [
  { value: 'webgpu-hybrid', label: 'WebGPU Hybrid (WebGPU enc + WASM dec)' },
  { value: 'webgpu', label: 'WebGPU Pure' },
  { value: 'wasm', label: 'WASM Pure (CPU)' },
];
const QUANTS = ['fp16', 'int8', 'fp32'];
const DATASET_SUGGESTIONS = [
  'ysdede/parrot-radiology-asr-en',
  'mozilla-foundation/common_voice_17_0',
  'MLCommons/peoples_speech',
  'facebook/multilingual_librispeech',
];

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

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function loadSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots) {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
  } catch {
    // ignore storage errors
  }
}

function fmtMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '-';
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
}

function fmtRtfx(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : '-';
}

function fmtBytes(value) {
  if (!Number.isFinite(value)) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let scaled = Math.abs(value);
  let u = 0;
  while (scaled >= 1024 && u < units.length - 1) {
    scaled /= 1024;
    u += 1;
  }
  return `${(value < 0 ? -scaled : scaled).toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PIVOT_DIMENSIONS = [
  { key: 'model', label: 'Model', extract: (s) => s.settings?.modelKey || '-' },
  { key: 'backend', label: 'Backend', extract: (s) => s.settings?.backend || '-' },
  { key: 'quant', label: 'Quantization', extract: (s) => `e:${s.settings?.encoderQuant || '-'} d:${s.settings?.decoderQuant || '-'}` },
  { key: 'source', label: 'Dataset / Source', extract: (s) => s.settings?.datasetSource || s.settings?.datasetId || '-' },
  { key: 'gpu', label: 'GPU Adapter', extract: (s) => s.hardware?.gpuLabel || '-' },
];

export default function App() {
  const initial = useMemo(() => loadSettings(), []);
  const { theme } = useDemoTheme({ storageKey: 'asrjs-theme' });
  const [activeTab, setActiveTab] = useState('benchmark');

  const catalogModels = useMemo(() => listSpeechModels(), []);
  const catalogByKey = useMemo(() => {
    const map = {};
    for (const m of catalogModels) map[m.modelId] = m;
    return map;
  }, [catalogModels]);

  const groupedCatalog = useMemo(() => {
    const groups = {};
    for (const m of catalogModels) {
      const g = getFamilyGroupLabel(m);
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    }
    return groups;
  }, [catalogModels]);

  // Model & Runtime state
  const [modelSource, setModelSource] = useState(initial.modelSource || 'huggingface');
  const [modelKey, setModelKey] = useState(initial.modelKey || 'parakeet-tdt-0.6b-v2');
  const [backend, setBackend] = useState(initial.backend || 'webgpu-hybrid');
  const [encoderQuant, setEncoderQuant] = useState(initial.encoderQuant || 'fp16');
  const [decoderQuant, setDecoderQuant] = useState(initial.decoderQuant || 'int8');
  const [preprocessorBackend, setPreprocessorBackend] = useState(initial.preprocessorBackend || 'js');
  const [cpuThreads, setCpuThreads] = useState(
    initial.cpuThreads || Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
  );
  const [language, setLanguage] = useState(initial.language || 'auto');
  const [localModelEntries, setLocalModelEntries] = useState([]);
  const [localModelLabel, setLocalModelLabel] = useState('');

  // Dataset / Local Audio Catalog state (Dual Mode: HuggingFace Dataset vs Local Audio Folder)
  const [audioSourceMode, setAudioSourceMode] = useState(initial.audioSourceMode || 'hf-dataset');
  const [datasetId, setDatasetId] = useState(initial.datasetId || 'ysdede/parrot-radiology-asr-en');
  const [datasetConfig, setDatasetConfig] = useState(initial.datasetConfig || 'default');
  const [datasetSplit, setDatasetSplit] = useState(initial.datasetSplit || 'test');
  const [configs, setConfigs] = useState(['default']);
  const [splits, setSplits] = useState(['test']);
  const [sampleCount, setSampleCount] = useState(initial.sampleCount || 6);
  const [offset, setOffset] = useState(initial.offset || 0);
  const [randomize, setRandomize] = useState(initial.randomize ?? true);
  const [randomSeed, setRandomSeed] = useState(initial.randomSeed || '42');
  const [preparedSamples, setPreparedSamples] = useState([]);
  const [datasetStatus, setDatasetStatus] = useState('Idle');
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);

  // Local Audio Folder Catalog state (transformers-v4-parakeet-demo-bench style)
  const [localAudioCatalog, setLocalAudioCatalog] = useState([]);
  const [targetMode, setTargetMode] = useState(initial.targetMode || 'auto');
  const [targetsText, setTargetsText] = useState(initial.targetsText || '3, 6, 10, 15, 25, 40, 60');
  const [samplesPerTarget, setSamplesPerTarget] = useState(initial.samplesPerTarget || 1);
  const [windowOverlapSec, setWindowOverlapSec] = useState(initial.windowOverlapSec || 4);

  // Run Plan state
  const [repeatCount, setRepeatCount] = useState(initial.repeatCount || 2);
  const [warmups, setWarmups] = useState(initial.warmups ?? 1);
  const [longBoostEnabled, setLongBoostEnabled] = useState(initial.longBoostEnabled ?? false);
  const [longBoostThresholdSec, setLongBoostThresholdSec] = useState(initial.longBoostThresholdSec || 30);
  const [longBoostMultiplier, setLongBoostMultiplier] = useState(initial.longBoostMultiplier || 2);

  // Execution & Results state
  const [modelStatus, setModelStatus] = useState('No model loaded');
  const [modelProgress, setModelProgress] = useState('');
  const [resolvedBackendInfo, setResolvedBackendInfo] = useState('');
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [benchStatus, setBenchStatus] = useState('Ready');
  const [progress, setProgress] = useState({ current: 0, total: 0, stage: 'Idle' });
  const [errorText, setErrorText] = useState('');
  const [runs, setRuns] = useState([]);
  const [lifecycleRecords, setLifecycleRecords] = useState([]);
  const [snapshots, setSnapshots] = useState(() => loadSnapshots());
  const [snapshotName, setSnapshotName] = useState('');
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState([]);
  const [pivotGroupBy, setPivotGroupBy] = useState('model');
  const [hardware, setHardware] = useState({
    cpuLabel: `${navigator.hardwareConcurrency || '?'} logical cores`,
    gpuLabel: 'Probing WebGPU...',
    webgpuAvailable: Boolean(navigator.gpu),
    memoryLabel: navigator.deviceMemory ? `${navigator.deviceMemory} GiB` : 'n/a',
  });

  const modelRef = useRef(null);
  const stopRef = useRef(false);
  const localModelInputRef = useRef(null);
  const localAudioInputRef = useRef(null);

  const isParakeetLegacy = Boolean(MODELS[modelKey]);
  const selectedDescriptor = catalogByKey[modelKey];

  useEffect(() => {
    saveSettings({
      theme,
      modelSource,
      modelKey,
      backend,
      encoderQuant,
      decoderQuant,
      preprocessorBackend,
      cpuThreads,
      language,
      audioSourceMode,
      datasetId,
      datasetConfig,
      datasetSplit,
      sampleCount,
      offset,
      randomize,
      randomSeed,
      targetMode,
      targetsText,
      samplesPerTarget,
      windowOverlapSec,
      repeatCount,
      warmups,
      longBoostEnabled,
      longBoostThresholdSec,
      longBoostMultiplier,
    });
  }, [
    theme, modelSource, modelKey, backend, encoderQuant, decoderQuant,
    preprocessorBackend, cpuThreads, language, audioSourceMode, datasetId,
    datasetConfig, datasetSplit, sampleCount, offset, randomize, randomSeed,
    targetMode, targetsText, samplesPerTarget, windowOverlapSec,
    repeatCount, warmups, longBoostEnabled, longBoostThresholdSec, longBoostMultiplier,
  ]);

  useEffect(() => {
    saveSnapshots(snapshots);
  }, [snapshots]);

  // Probe WebGPU adapter info
  useEffect(() => {
    let active = true;
    (async () => {
      if (!navigator.gpu) {
        if (active) setHardware((h) => ({ ...h, gpuLabel: 'WebGPU unavailable', webgpuAvailable: false }));
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter || !active) return;
        const info = adapter.info || {};
        const label = [info.vendor, info.architecture, info.device || info.description].filter(Boolean).join(' / ') || 'WebGPU Adapter';
        setHardware((h) => ({ ...h, gpuLabel: label, webgpuAvailable: true }));
      } catch {
        if (active) setHardware((h) => ({ ...h, gpuLabel: 'WebGPU probe failed' }));
      }
    })();
    return () => { active = false; };
  }, []);

  async function refreshDatasetMeta(nextDatasetId = datasetId, preferredConfig = datasetConfig, preferredSplit = datasetSplit) {
    setIsLoadingDataset(true);
    setErrorText('');
    setDatasetStatus('Loading dataset metadata...');
    try {
      const payload = await fetchDatasetSplits(nextDatasetId);
      const { configs: nextConfigs, config: nextConfig, splits: nextSplits, split: nextSplit } =
        selectDatasetMetadata(payload, preferredConfig, preferredSplit);
      setConfigs(nextConfigs);
      setSplits(nextSplits);
      setDatasetConfig(nextConfig);
      setDatasetSplit(nextSplit);
      setDatasetStatus(`Ready: ${nextDatasetId} (${nextConfig}/${nextSplit})`);
    } catch (error) {
      setDatasetStatus(`Metadata error: ${error?.message || String(error)}`);
    } finally {
      setIsLoadingDataset(false);
    }
  }

  useEffect(() => {
    refreshDatasetMeta(datasetId, datasetConfig, datasetSplit);
  }, []);

  async function handlePickLocalModelFolder() {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        const entries = await collectSpeechModelLocalEntries(handle);
        setLocalModelEntries(entries);
        setLocalModelLabel(`${handle.name} (${entries.length} files)`);
        setIsModelReady(false);
        setModelStatus(`Selected folder ${handle.name}`);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    localModelInputRef.current?.click();
  }

  function handleLocalModelInputFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const entries = createSpeechModelLocalEntries(files);
    setLocalModelEntries(entries);
    setLocalModelLabel(`${files.length} local files`);
    setIsModelReady(false);
    setModelStatus(`Selected ${files.length} local files`);
  }

  async function loadSelectedModel() {
    setIsLoadingModel(true);
    setErrorText('');
    setModelStatus('Loading model...');
    setModelProgress('');
    const startedAt = performance.now();
    const memoryBefore = await measureBrowserMemory();

    try {
      if (modelRef.current) {
        await modelRef.current.dispose?.();
        modelRef.current = null;
        setIsModelReady(false);
      }

      if (modelSource === 'local') {
        if (!localModelEntries.length) {
          throw new Error('Select a local model directory first.');
        }
        const loaded = await loadSpeechModelFromLocalEntries({
          entries: localModelEntries,
          modelId: modelKey,
          backend,
          encoderQuant,
          decoderQuant,
          preprocessorBackend,
          cpuThreads,
        });
        modelRef.current = {
          type: 'local-handle',
          instance: loaded,
          dispose: () => loaded.dispose?.(),
        };
        setIsModelReady(true);
        setResolvedBackendInfo(`${loaded.selection?.modelId || modelKey} · ${backend} · local`);
        setModelStatus('Model ready (Local)');
      } else if (isParakeetLegacy) {
        const loaded = await loadModelWithFallback({
          modelId: modelKey,
          backend,
          encoderQuant,
          decoderQuant,
          preprocessor: 'nemo128',
          preprocessorBackend,
          cpuThreads,
          onProgress: ({ file, progress: pct }) => setModelProgress(`${file}: ${pct}%`),
          onStatus: (msg) => setModelStatus(msg),
        });
        const parakeet = await ParakeetModel.fromUrls({
          ...loaded.urls,
          filenames: loaded.filenames,
          backend: loaded.backend,
          preprocessorBackend: loaded.preprocessorBackend,
          cpuThreads,
        });
        modelRef.current = {
          type: 'parakeet',
          instance: parakeet,
          dispose: () => parakeet.dispose?.(),
        };
        setIsModelReady(true);
        setResolvedBackendInfo(
          `${modelKey} · ${loaded.backend} · e:${loaded.encoderQuant} d:${loaded.decoderQuant} · preproc:${loaded.preprocessorBackend}`,
        );
        setModelStatus('Model ready');
      } else {
        const componentBackends = resolveSpeechModelComponentBackends(modelKey, backend);
        const handle = await loadBuiltInSpeechModel({
          modelId: modelKey,
          preset: selectedDescriptor?.preset,
          backend,
          options: {
            quantization: encoderQuant,
            encoderQuant,
            decoderQuant,
            encoderBackend: componentBackends.encoderBackend,
            decoderBackend: componentBackends.decoderBackend,
            cpuThreads,
          },
          onProgress: (ev) => {
            if (ev?.file) setModelProgress(`${ev.file}: ${Math.round(ev.progress || 0)}%`);
          },
        });
        const session = await handle.createSession();
        modelRef.current = {
          type: 'universal',
          instance: handle,
          session,
          dispose: async () => {
            await session.dispose?.();
            await handle.dispose?.();
          },
        };
        setIsModelReady(true);
        setResolvedBackendInfo(`${modelKey} · ${backend} · ${encoderQuant}`);
        setModelStatus('Model ready');
      }

      const memoryAfter = await measureBrowserMemory();
      setLifecycleRecords((prev) => [
        {
          phase: 'load',
          modelKey,
          backend,
          durationMs: performance.now() - startedAt,
          memoryBefore,
          memoryAfter,
        },
        ...prev,
      ]);
    } catch (err) {
      setErrorText(err?.message || String(err));
      setModelStatus('Model load failed');
    } finally {
      setIsLoadingModel(false);
      setModelProgress('');
    }
  }

  async function handleLocalAudioFiles(e) {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|webm)$/i.test(f.name),
    );
    if (!files.length) return;
    setDatasetStatus(`Indexing ${files.length} local audio files...`);
    const indexed = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      let durationSec = 0;
      try {
        const decoded = await decodeAudioSourceToMonoPcm(f, 16000);
        durationSec = decoded.durationSeconds || decoded.pcm.length / 16000;
      } catch {
        durationSec = 0;
      }
      indexed.push({
        file: f,
        name: f.name,
        path: f.webkitRelativePath || f.name,
        durationSec,
        sizeBytes: f.size,
      });
    }
    setLocalAudioCatalog(indexed.filter((x) => x.durationSec > 0));
    setDatasetStatus(`Indexed ${indexed.length} local audio files.`);
  }

  const resolvedTargetDurations = useMemo(() => {
    if (targetMode === 'auto') return suggestDurationTargets(localAudioCatalog);
    return parseDurationTargets(targetsText);
  }, [targetMode, localAudioCatalog, targetsText]);

  const localTargetPlan = useMemo(
    () => buildTargetSamplePlan(localAudioCatalog, resolvedTargetDurations, samplesPerTarget),
    [localAudioCatalog, resolvedTargetDurations, samplesPerTarget],
  );

  async function prepareHfSamples() {
    setIsLoadingDataset(true);
    setDatasetStatus('Fetching dataset rows...');
    try {
      const normalized = await fetchBenchmarkSamples({
        dataset: datasetId, config: datasetConfig, split: datasetSplit,
        randomize, sampleCount, seed: randomSeed, offset,
      });
      setPreparedSamples(normalized);
      setDatasetStatus(`Prepared ${normalized.length} dataset samples.`);
      return normalized;
    } catch (err) {
      setErrorText(err?.message || String(err));
      setDatasetStatus('Sample fetch failed');
      return [];
    } finally {
      setIsLoadingDataset(false);
    }
  }

  async function executeSingleTranscribe(pcm, durationSec) {
    const wrapper = modelRef.current;
    const t0 = performance.now();
    if (wrapper.type === 'parakeet') {
      const res = await wrapper.instance.transcribe(pcm, 16000, {
        returnTimestamps: true,
        returnConfidences: true,
      });
      const wallMs = performance.now() - t0;
      const totalMs = res.metrics?.total_ms ?? wallMs;
      return {
        text: res.utterance_text || '',
        metrics: {
          preprocess_ms: res.metrics?.preprocess_ms ?? 0,
          encode_ms: res.metrics?.encode_ms ?? 0,
          decode_ms: res.metrics?.decode_ms ?? 0,
          tokenize_ms: res.metrics?.tokenize_ms ?? 0,
          total_ms: totalMs,
          rtf: durationSec > 0 ? totalMs / 1000 / durationSec : null,
          rtfx: calcRtfx(durationSec, totalMs),
        },
      };
    }
    if (wrapper.type === 'local-handle') {
      const env = await wrapper.instance.transcribeMonoPcm(pcm, 16000, {
        detail: 'words',
        responseFlavor: 'canonical+native',
      });
      const wallMs = performance.now() - t0;
      const canonical = env?.canonical ?? env;
      const nativeMetrics = env?.native?.metrics || canonical?.meta?.metrics || {};
      const totalMs = nativeMetrics.totalMs ?? nativeMetrics.total_ms ?? wallMs;
      return {
        text: canonical?.text || '',
        metrics: {
          preprocess_ms: nativeMetrics.preprocessMs ?? nativeMetrics.preprocess_ms ?? 0,
          encode_ms: nativeMetrics.encodeMs ?? nativeMetrics.encode_ms ?? 0,
          decode_ms: nativeMetrics.decodeMs ?? nativeMetrics.decode_ms ?? 0,
          tokenize_ms: nativeMetrics.tokenizeMs ?? nativeMetrics.tokenize_ms ?? 0,
          total_ms: totalMs,
          rtf: durationSec > 0 ? totalMs / 1000 / durationSec : null,
          rtfx: calcRtfx(durationSec, totalMs),
        },
      };
    }
    const audioBuffer = PcmAudioBuffer.fromMono(pcm, 16000);
    const env = await wrapper.session.transcribe(audioBuffer, {
      language: language === 'auto' ? undefined : language,
      detail: 'words',
      responseFlavor: 'canonical+native',
    });
    const wallMs = performance.now() - t0;
    const canonical = env?.canonical ?? env;
    const nativeMetrics = env?.native?.metrics || canonical?.meta?.metrics || {};
    const totalMs = nativeMetrics.totalMs ?? nativeMetrics.total_ms ?? wallMs;
    return {
      text: canonical?.text || '',
      metrics: {
        preprocess_ms: nativeMetrics.preprocessMs ?? nativeMetrics.preprocess_ms ?? 0,
        encode_ms: nativeMetrics.encodeMs ?? nativeMetrics.encode_ms ?? 0,
        decode_ms: nativeMetrics.decodeMs ?? nativeMetrics.decode_ms ?? 0,
        tokenize_ms: nativeMetrics.tokenizeMs ?? nativeMetrics.tokenize_ms ?? 0,
        total_ms: totalMs,
        rtf: durationSec > 0 ? totalMs / 1000 / durationSec : null,
        rtfx: calcRtfx(durationSec, totalMs),
      },
    };
  }

  async function runBenchmark() {
    if (!modelRef.current || !isModelReady) {
      setErrorText('Load a model before running the benchmark.');
      return;
    }

    let items = [];
    if (audioSourceMode === 'local-folder') {
      if (!localTargetPlan.length) {
        setErrorText('Select local audio files first to build a target duration plan.');
        return;
      }
      items = localTargetPlan.map((entry, idx) => ({
        sampleKey: `${entry.name} (${entry.durationSec.toFixed(1)}s)`,
        rowIndex: idx,
        file: entry.file,
        referenceText: '',
        durationSec: entry.durationSec,
      }));
    } else {
      const hfSamples = preparedSamples.length ? preparedSamples : await prepareHfSamples();
      if (!hfSamples.length) return;
      items = hfSamples.map((s, idx) => ({
        sampleKey: `${datasetSplit}:${s.rowIndex ?? idx}`,
        rowIndex: s.rowIndex ?? idx,
        audioUrl: s.audioUrl,
        referenceText: s.referenceText || '',
      }));
    }

    stopRef.current = false;
    setIsRunning(true);
    setErrorText('');
    setRuns([]);

    const batchId = `batch-${Date.now()}`;
    let totalSteps = items.length * (Math.ceil(warmups) + Math.ceil(repeatCount));
    let stepCursor = 0;
    const collected = [];

    try {
      for (let i = 0; i < items.length; i += 1) {
        if (stopRef.current) break;
        const item = items[i];
        const decoded = await decodeAudioSourceToMonoPcm(item.file || item.audioUrl, 16000);
        const durSec = item.durationSec || decoded.durationSeconds || decoded.pcm.length / 16000;

        for (let w = 0; w < Math.ceil(warmups); w += 1) {
          if (stopRef.current) break;
          stepCursor += 1;
          setProgress({ current: stepCursor, total: totalSteps, stage: `Warmup ${w + 1}/${warmups} · ${item.sampleKey}` });
          await executeSingleTranscribe(decoded.pcm, durSec);
        }

        const effectiveRepeats = resolveEffectiveRepeatCount(repeatCount, durSec, {
          enabled: longBoostEnabled,
          thresholdSec: longBoostThresholdSec,
          multiplier: longBoostMultiplier,
        });
        totalSteps += effectiveRepeats - Math.ceil(repeatCount);
        setProgress((current) => ({ ...current, total: totalSteps }));

        let firstTranscript = null;
        for (let r = 0; r < effectiveRepeats; r += 1) {
          if (stopRef.current) break;
          stepCursor += 1;
          setProgress({
            current: stepCursor,
            total: totalSteps,
            stage: `Run ${r + 1}/${effectiveRepeats} · ${item.sampleKey}`,
          });
          const startedAt = new Date().toISOString();
          try {
            const out = await executeSingleTranscribe(decoded.pcm, durSec);
            if (firstTranscript === null) firstTranscript = out.text;
            const simFirst = textSimilarity(firstTranscript, out.text);
            const refEval = computeWerCer(item.referenceText, out.text);
            collected.push({
              id: `${batchId}-${i}-${r}`,
              batchId,
              startedAt,
              finishedAt: new Date().toISOString(),
              sampleKey: item.sampleKey,
              sampleOrder: i + 1,
              rowIndex: item.rowIndex,
              repeatIndex: r + 1,
              audioDurationSec: durSec,
              transcription: out.text,
              referenceText: item.referenceText,
              exactMatchToFirst: firstTranscript === out.text,
              similarityToFirst: simFirst,
              wer: refEval.wer,
              cer: refEval.cer,
              referenceSimilarity: refEval.similarity,
              metrics: out.metrics,
              rtfx: out.metrics.rtfx,
              modelKey,
              backend,
              encoderQuant,
              decoderQuant,
              preprocessorBackend,
              error: '',
            });
          } catch (runErr) {
            collected.push({
              id: `${batchId}-${i}-${r}`,
              batchId,
              startedAt,
              finishedAt: new Date().toISOString(),
              sampleKey: item.sampleKey,
              sampleOrder: i + 1,
              rowIndex: item.rowIndex,
              repeatIndex: r + 1,
              audioDurationSec: durSec,
              transcription: '',
              referenceText: item.referenceText,
              exactMatchToFirst: false,
              similarityToFirst: null,
              wer: null,
              cer: null,
              referenceSimilarity: null,
              metrics: null,
              rtfx: null,
              modelKey,
              backend,
              encoderQuant,
              decoderQuant,
              preprocessorBackend,
              error: runErr?.message || String(runErr),
            });
          }
          setRuns([...collected]);
        }
      }
      setBenchStatus(stopRef.current ? `Stopped after ${collected.length} runs.` : `Completed ${collected.length} benchmark runs.`);
    } catch (err) {
      setErrorText(err?.message || String(err));
      setBenchStatus('Benchmark aborted');
    } finally {
      setIsRunning(false);
    }
  }

  // Compute summary metrics across current runs
  const okRuns = useMemo(() => runs.filter((r) => !r.error && r.metrics), [runs]);
  const summary = useMemo(() => {
    const totals = okRuns.map((r) => r.metrics?.total_ms).filter(Number.isFinite);
    const preprocs = okRuns.map((r) => r.metrics?.preprocess_ms).filter(Number.isFinite);
    const encodes = okRuns.map((r) => r.metrics?.encode_ms).filter(Number.isFinite);
    const decodes = okRuns.map((r) => r.metrics?.decode_ms).filter(Number.isFinite);
    const tokenizes = okRuns.map((r) => r.metrics?.tokenize_ms).filter(Number.isFinite);
    const rtfxs = okRuns.map((r) => r.rtfx ?? r.metrics?.rtfx).filter(Number.isFinite);
    const sims = okRuns.map((r) => r.similarityToFirst).filter(Number.isFinite);
    const refSims = okRuns.map((r) => r.referenceSimilarity).filter(Number.isFinite);
    const wers = okRuns.map((r) => r.wer).filter(Number.isFinite);
    const exactCount = okRuns.filter((r) => r.exactMatchToFirst).length;
    return {
      runCount: runs.length,
      okCount: okRuns.length,
      errorCount: runs.length - okRuns.length,
      totalMean: mean(totals),
      totalP90: percentile(totals, 90),
      preprocessMean: mean(preprocs),
      encodeMean: mean(encodes),
      decodeMean: mean(decodes),
      decodeStd: stddev(decodes),
      tokenizeMean: mean(tokenizes),
      rtfxMedian: median(rtfxs),
      rtfxMean: mean(rtfxs),
      exactRate: okRuns.length > 0 ? exactCount / okRuns.length : null,
      similarityMean: mean(sims),
      referenceSimilarityMean: mean(refSims),
      werMean: mean(wers),
    };
  }, [runs, okRuns]);

  const durationBuckets = useMemo(
    () => summarizeBenchmarkBuckets(okRuns, 10, windowOverlapSec),
    [okRuns, windowOverlapSec],
  );
  const sweetSpot = useMemo(() => findSweetSpotBucket(durationBuckets), [durationBuckets]);

  function saveSnapshot() {
    if (!okRuns.length) return;
    const defaultLabel = `${modelKey} | ${backend} | e:${encoderQuant} d:${decoderQuant}`;
    const snap = {
      id: `snap-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: snapshotName.trim() || defaultLabel,
      settings: {
        modelKey,
        backend,
        encoderQuant,
        decoderQuant,
        preprocessorBackend,
        datasetSource: audioSourceMode === 'local-folder' ? 'Local Audio Folder' : datasetId,
      },
      hardware,
      summary,
      runs: okRuns.slice(0, 120),
    };
    setSnapshots((prev) => [snap, ...prev].slice(0, MAX_SNAPSHOTS));
    setSnapshotName('');
    setBenchStatus(`Saved snapshot: ${snap.label}`);
  }

  function handleImportSnapshotJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || '{}'));
        const importedRuns = Array.isArray(data.runs) ? data.runs : [];
        const snap = {
          id: `import-${Date.now()}`,
          createdAt: data.generatedAt || new Date().toISOString(),
          label: data.label || file.name.replace(/\.json$/i, ''),
          settings: data.settings || { modelKey: data.modelId || 'imported', backend: data.backendId || '-' },
          hardware: data.hardware || hardware,
          summary: data.summary || summary,
          runs: importedRuns.slice(0, 120),
        };
        setSnapshots((prev) => [snap, ...prev].slice(0, MAX_SNAPSHOTS));
        setBenchStatus(`Imported snapshot from ${file.name}`);
      } catch (err) {
        setErrorText(`Failed to import JSON: ${err?.message || String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="app-shell">
      <input
        ref={localModelInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalModelInputFiles}
      />
      <input
        ref={localAudioInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalAudioFiles}
      />

      {/* ═══ UNIFIED ASRJS CONSOLE TOPBAR ═══ */}
      <header className="console-topbar">
        <div className="topbar-main-row">
          <div className="topbar-pills">
            <span className="status-pill">
              <span className={`dot ${hardware.webgpuAvailable ? 'dot--green' : 'dot--red'}`} />
              {hardware.gpuLabel}
            </span>
            <span className="status-pill">
              <span className={`dot ${isModelReady ? 'dot--green' : isLoadingModel ? 'dot--orange' : 'dot--muted'}`} />
              {modelStatus}
            </span>
            <span className="status-pill">
              <span className={`dot ${isRunning ? 'dot--orange' : okRuns.length > 0 ? 'dot--green' : 'dot--muted'}`} />
              {isRunning ? `Running ${progress.current}/${progress.total}` : `${okRuns.length} valid runs`}
            </span>
          </div>
        </div>
      </header>

      {/* ═══ 5-TAB NAVIGATION ═══ */}
      <nav className="tabs-bar">
        {[
          { id: 'benchmark', label: '⚙ Benchmark Setup' },
          { id: 'overview', label: '📊 Overview & Sweet-Spot', count: okRuns.length },
          { id: 'charts', label: '📈 Interactive Charts', count: okRuns.length ? 8 : 0 },
          { id: 'compare', label: '⚖ Compare & Pivot', count: snapshots.length },
          { id: 'data', label: '🗂 Run Data & Export', count: runs.length },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${activeTab === t.id ? 'tab-btn--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.count > 0 ? <span className="tab-badge">{t.count}</span> : null}
          </button>
        ))}
      </nav>

      {errorText ? <div className="error-banner">{errorText}</div> : null}

      {/* ═══ TAB 1: BENCHMARK SETUP ═══ */}
      {activeTab === 'benchmark' && (
        <div>
          <div className="config-grid">
            {/* Card 1: Model & Runtime */}
            <section className="console-card">
              <div className="card-header">
                <h2 className="card-title">1. Model &amp; Runtime</h2>
                <span className="mono status-note">{isParakeetLegacy ? 'Parakeet Preset' : 'Universal Catalog'}</span>
              </div>
              <div className="form-stack">
                <div className="mode-switch">
                  <button
                    type="button"
                    className={`mode-switch-btn ${modelSource === 'huggingface' ? 'mode-switch-btn--active' : ''}`}
                    onClick={() => setModelSource('huggingface')}
                  >
                    HuggingFace Hub
                  </button>
                  <button
                    type="button"
                    className={`mode-switch-btn ${modelSource === 'local' ? 'mode-switch-btn--active' : ''}`}
                    onClick={() => setModelSource('local')}
                  >
                    Local Folder
                  </button>
                </div>

                {modelSource === 'local' && (
                  <div className="btn-row">
                    <button type="button" className="btn btn-sm" onClick={handlePickLocalModelFolder}>
                      Pick Local Model Directory
                    </button>
                    <span className="status-note">{localModelLabel || 'No folder picked'}</span>
                  </div>
                )}

                <label className="field">
                  Model Family / Preset (All 16 Families)
                  <select
                    value={modelKey}
                    onChange={(e) => {
                      setModelKey(e.target.value);
                      setIsModelReady(false);
                    }}
                    disabled={isLoadingModel || isRunning}
                  >
                    {Object.entries(groupedCatalog).map(([groupLabel, items]) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {items.map((m) => (
                          <option key={m.modelId} value={m.modelId}>
                            {m.displayName || m.label || m.modelId}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <label className="field">
                  Execution Backend
                  <select
                    value={backend}
                    onChange={(e) => {
                      setBackend(e.target.value);
                      setIsModelReady(false);
                    }}
                    disabled={isLoadingModel || isRunning}
                  >
                    {BACKEND_MODES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="row-2">
                  <label className="field">
                    Encoder Quant
                    <select value={encoderQuant} onChange={(e) => setEncoderQuant(e.target.value)} disabled={isLoadingModel || isRunning}>
                      {QUANTS.map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Decoder Quant
                    <select value={decoderQuant} onChange={(e) => setDecoderQuant(e.target.value)} disabled={isLoadingModel || isRunning}>
                      {QUANTS.map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="row-2">
                  <label className="field">
                    Preprocessor
                    <select value={preprocessorBackend} onChange={(e) => setPreprocessorBackend(e.target.value)} disabled={isLoadingModel || isRunning}>
                      <option value="js">JS (Pure WebMel)</option>
                      <option value="onnx">ONNX (nemo128.onnx)</option>
                    </select>
                  </label>
                  <label className="field">
                    WASM Threads
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={cpuThreads}
                      onChange={(e) => setCpuThreads(Math.max(1, Number(e.target.value) || 1))}
                      disabled={isLoadingModel || isRunning}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={loadSelectedModel}
                  disabled={isLoadingModel || isRunning}
                >
                  {isLoadingModel ? 'Loading Model...' : isModelReady ? 'Reload Model ✓' : 'Load Model'}
                </button>
                {modelProgress ? <p className="status-note mono">{modelProgress}</p> : null}
                {resolvedBackendInfo ? <p className="status-note mono">{resolvedBackendInfo}</p> : null}
              </div>
            </section>

            {/* Card 2: Dual Dataset & Local Audio Catalog */}
            <section className="console-card">
              <div className="card-header">
                <h2 className="card-title">2. Audio Source &amp; Sampling Plan</h2>
              </div>
              <div className="form-stack">
                <div className="mode-switch">
                  <button
                    type="button"
                    className={`mode-switch-btn ${audioSourceMode === 'hf-dataset' ? 'mode-switch-btn--active' : ''}`}
                    onClick={() => setAudioSourceMode('hf-dataset')}
                  >
                    HuggingFace Dataset
                  </button>
                  <button
                    type="button"
                    className={`mode-switch-btn ${audioSourceMode === 'local-folder' ? 'mode-switch-btn--active' : ''}`}
                    onClick={() => setAudioSourceMode('local-folder')}
                  >
                    Local Duration Catalog
                  </button>
                </div>

                {audioSourceMode === 'hf-dataset' ? (
                  <>
                    <label className="field">
                      HuggingFace Dataset ID
                      <input
                        type="text"
                        list="hf-datasets-list"
                        value={datasetId}
                        onChange={(e) => setDatasetId(e.target.value)}
                        disabled={isRunning}
                      />
                      <datalist id="hf-datasets-list">
                        {DATASET_SUGGESTIONS.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                    </label>
                    <div className="row-2">
                      <label className="field">
                        Config
                        <select
                          value={datasetConfig}
                          onChange={(e) => refreshDatasetMeta(datasetId, e.target.value, datasetSplit)}
                          disabled={isRunning || isLoadingDataset}
                        >
                          {configs.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Split
                        <select value={datasetSplit} onChange={(e) => setDatasetSplit(e.target.value)} disabled={isRunning || isLoadingDataset}>
                          {splits.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="row-2">
                      <label className="field">
                        Offset
                        <input
                          type="number"
                          min="0"
                          value={offset}
                          onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
                          disabled={isRunning || randomize}
                        />
                      </label>
                      <label className="field">
                        Samples
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={sampleCount}
                          onChange={(e) => setSampleCount(Math.max(1, Number(e.target.value) || 1))}
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                    <div className="btn-row">
                      <button type="button" className="btn btn-sm" onClick={() => refreshDatasetMeta(datasetId, datasetConfig, datasetSplit)} disabled={isRunning}>
                        Refresh Splits
                      </button>
                      <button type="button" className="btn btn-sm" onClick={prepareHfSamples} disabled={isRunning || isLoadingDataset}>
                        Preview Samples ({preparedSamples.length})
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="btn-row">
                      <button type="button" className="btn btn-sm" onClick={() => localAudioInputRef.current?.click()} disabled={isRunning}>
                        Select Local Audio Folder / Files
                      </button>
                      <span className="status-note">{localAudioCatalog.length} files indexed</span>
                    </div>
                    <label className="field">
                      Target Duration Strategy (Sweet-Spot Discovery)
                      <select value={targetMode} onChange={(e) => setTargetMode(e.target.value)} disabled={isRunning}>
                        <option value="auto">Auto Quantile &amp; Growth Targets</option>
                        <option value="custom">Custom Duration Targets (seconds)</option>
                      </select>
                    </label>
                    {targetMode === 'custom' && (
                      <label className="field">
                        Target Durations (s)
                        <input type="text" value={targetsText} onChange={(e) => setTargetsText(e.target.value)} placeholder="3, 6, 10, 15, 30, 60" />
                      </label>
                    )}
                    <div className="row-2">
                      <label className="field">
                        Samples / Target
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={samplesPerTarget}
                          onChange={(e) => setSamplesPerTarget(Math.max(1, Number(e.target.value) || 1))}
                        />
                      </label>
                      <label className="field">
                        Window Overlap (s)
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={windowOverlapSec}
                          onChange={(e) => setWindowOverlapSec(Math.max(0, Number(e.target.value) || 0))}
                        />
                      </label>
                    </div>
                    <p className="status-note mono">
                      Planned files: {localTargetPlan.length} across targets [{resolvedTargetDurations.join(', ')}s]
                    </p>
                  </>
                )}
                <p className="status-note">{datasetStatus}</p>
              </div>
            </section>

            {/* Card 3: Run Plan & Snapshots */}
            <section className="console-card">
              <div className="card-header">
                <h2 className="card-title">3. Benchmark Execution &amp; Snapshots</h2>
              </div>
              <div className="form-stack">
                <div className="row-3">
                  <label className="field">
                    Repeats
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(Math.max(1, Number(e.target.value) || 1))}
                      disabled={isRunning}
                    />
                  </label>
                  <label className="field">
                    Warmups
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={warmups}
                      onChange={(e) => setWarmups(Math.max(0, Number(e.target.value) || 0))}
                      disabled={isRunning}
                    />
                  </label>
                  <label className="field">
                    Random Seed
                    <input
                      type="text"
                      value={randomSeed}
                      onChange={(e) => setRandomSeed(e.target.value)}
                      disabled={isRunning || !randomize}
                    />
                  </label>
                </div>

                <label className="check-field">
                  <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} disabled={isRunning} />
                  Seeded Random Sampling
                </label>

                <label className="check-field">
                  <input type="checkbox" checked={longBoostEnabled} onChange={(e) => setLongBoostEnabled(e.target.checked)} disabled={isRunning} />
                  Boost Repeats for Long Audio (&ge;{longBoostThresholdSec}s &rarr; {longBoostMultiplier}x)
                </label>

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={runBenchmark}
                    disabled={isRunning || isLoadingModel || !isModelReady}
                  >
                    {isRunning ? 'Running Benchmark...' : '▶ Start Benchmark'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => { stopRef.current = true; }}
                    disabled={!isRunning}
                  >
                    Stop
                  </button>
                </div>

                <div className="row-2">
                  <input
                    type="text"
                    placeholder="Snapshot label (optional)"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    disabled={isRunning}
                  />
                  <button type="button" className="btn" onClick={saveSnapshot} disabled={!okRuns.length || isRunning}>
                    Save Snapshot
                  </button>
                </div>

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => downloadText(`asrjs-bench-${Date.now()}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), settings: { modelKey, backend, encoderQuant, decoderQuant }, hardware, summary, runs }, null, 2), 'application/json')}
                    disabled={!runs.length}
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => downloadText(`asrjs-bench-${Date.now()}.csv`, benchmarkRunRecordsToCsv(runs), 'text/csv')}
                    disabled={!runs.length}
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setRuns([])}
                    disabled={!runs.length || isRunning}
                  >
                    Clear Runs
                  </button>
                </div>
                <p className="status-note">{benchStatus}</p>
              </div>
            </section>
          </div>

          {(isRunning || progress.total > 0) && (
            <div className="progress-box">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="progress-meta">
                <span>{progress.stage}</span>
                <span className="mono">{progress.current}/{progress.total} ({progressPct}%)</span>
              </div>
            </div>
          )}

          {/* Hardware Profile */}
          <section className="table-panel">
            <div className="table-panel-head">
              <h3>Hardware &amp; Lifecycle Telemetry</h3>
            </div>
            <div className="kv-grid">
              <div className="kv-item"><span>WebGPU Adapter</span><strong>{hardware.gpuLabel}</strong></div>
              <div className="kv-item"><span>CPU Concurrency</span><strong>{hardware.cpuLabel}</strong></div>
              <div className="kv-item"><span>Device Memory</span><strong>{hardware.memoryLabel}</strong></div>
              <div className="kv-item">
                <span>Last Model Load Time</span>
                <strong>{lifecycleRecords[0] ? fmtMs(lifecycleRecords[0].durationMs) : '-'}</strong>
              </div>
              <div className="kv-item">
                <span>Last Load Heap Delta</span>
                <strong>
                  {lifecycleRecords[0]
                    ? fmtBytes(benchmarkMemoryDeltaBytes(lifecycleRecords[0].memoryBefore, lifecycleRecords[0].memoryAfter))
                    : '-'}
                </strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ═══ TAB 2: OVERVIEW & SWEET-SPOT ═══ */}
      {activeTab === 'overview' && (
        <div>
          {sweetSpot && (
            <div className="sweetspot-banner">
              <div>
                <strong>Effective RTFx Sweet-Spot Window: {sweetSpot.label}</strong>
                <div className="status-note">
                  With {windowOverlapSec}s overlap on a 60m stream, {sweetSpot.label} achieves peak effective throughput ({sweetSpot.effectiveRtfx}x RTFx, {sweetSpot.overheadPct}% overlap overhead).
                </div>
              </div>
              <span className="mono" style={{ fontSize: 18, fontWeight: 800 }}>
                Peak {sweetSpot.effectiveRtfx}x RTFx
              </span>
            </div>
          )}

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total Latency (Mean)</div>
              <div className="kpi-value">{fmtMs(summary.totalMean)}</div>
              <div className="kpi-sub">p90: {fmtMs(summary.totalP90)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Median RTFx</div>
              <div className="kpi-value">{fmtRtfx(summary.rtfxMedian)}</div>
              <div className="kpi-sub">Mean: {fmtRtfx(summary.rtfxMean)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Preprocess</div>
              <div className="kpi-value">{fmtMs(summary.preprocessMean)}</div>
              <div className="kpi-sub">Audio &rarr; Mel features</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Encode Latency</div>
              <div className="kpi-value">{fmtMs(summary.encodeMean)}</div>
              <div className="kpi-sub">Acoustic encoder</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Decode Latency</div>
              <div className="kpi-value">{fmtMs(summary.decodeMean)}</div>
              <div className="kpi-sub">&sigma; = {fmtMs(summary.decodeStd)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Repeatability</div>
              <div className="kpi-value">{fmtPct(summary.exactRate)}</div>
              <div className="kpi-sub">Sim: {fmtPct(summary.similarityMean)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Reference Accuracy</div>
              <div className="kpi-value">{fmtPct(summary.referenceSimilarityMean)}</div>
              <div className="kpi-sub">Mean WER: {fmtPct(summary.werMean)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Valid / Total Runs</div>
              <div className="kpi-value">{summary.okCount} / {summary.runCount}</div>
              <div className="kpi-sub">Errors: {summary.errorCount}</div>
            </div>
          </div>

          <section className="table-panel">
            <div className="table-panel-head">
              <h3>Duration Bucket &amp; Overlapped Window Sweet-Spot Breakdown</h3>
            </div>
            <div className="table-scroll">
              <table className="bench-table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Runs</th>
                    <th>Avg Audio (s)</th>
                    <th>Preproc (ms)</th>
                    <th>Encode (ms)</th>
                    <th>Decode (ms)</th>
                    <th>Total (ms)</th>
                    <th>Raw RTFx</th>
                    <th>Effective RTFx ({windowOverlapSec}s overlap)</th>
                    <th>Overlap Overhead</th>
                  </tr>
                </thead>
                <tbody>
                  {durationBuckets.length ? (
                    durationBuckets.map((b) => (
                      <tr key={b.label}>
                        <td className="mono">{b.label}</td>
                        <td>{b.count}</td>
                        <td className="mono">{b.avgDurationSec}s</td>
                        <td className="mono">{fmtMs(b.avgPreprocessMs)}</td>
                        <td className="mono">{fmtMs(b.avgEncodeMs)}</td>
                        <td className="mono">{fmtMs(b.avgDecodeMs)}</td>
                        <td className="mono">{fmtMs(b.avgTotalMs)}</td>
                        <td className="mono">{fmtRtfx(b.avgRtfx)}</td>
                        <td className="mono"><strong>{fmtRtfx(b.effectiveRtfx)}</strong></td>
                        <td className="mono">{b.overheadPct}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={10}>Run a benchmark batch to populate duration buckets.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ═══ TAB 3: INTERACTIVE CHARTS ═══ */}
      {activeTab === 'charts' && (
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Audio Duration vs Total Latency + Regression Fit</h3>
              <span className="chart-badge">Regression</span>
            </div>
            <ScatterPlotSvg
              xLabel="Audio Duration (s)"
              yLabel="Total (ms)"
              series={[
                {
                  label: 'Total Latency (ms)',
                  color: '#4d8fd9',
                  data: okRuns.map((r) => ({ x: r.audioDurationSec, y: r.metrics?.total_ms, label: r.sampleKey })),
                },
              ]}
              fitLine={linearFit(
                okRuns.map((r) => r.audioDurationSec),
                okRuns.map((r) => r.metrics?.total_ms),
              )}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Audio Duration vs Effective RTFx (Scaling Curve)</h3>
              <span className="chart-badge">Sweet-Spot</span>
            </div>
            <ScatterPlotSvg
              xLabel="Audio Duration (s)"
              yLabel="RTFx (× real-time)"
              series={[
                {
                  label: 'Total RTFx',
                  color: '#5dba82',
                  data: okRuns.map((r) => ({ x: r.audioDurationSec, y: r.rtfx ?? r.metrics?.rtfx, label: r.sampleKey })),
                },
              ]}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Encoder vs Decoder Latency</h3>
              <span className="chart-badge">Scatter</span>
            </div>
            <ScatterPlotSvg
              xLabel="Encode (ms)"
              yLabel="Decode (ms)"
              series={[
                {
                  label: 'Encode vs Decode',
                  color: '#9b9fdf',
                  data: okRuns.map((r) => ({ x: r.metrics?.encode_ms, y: r.metrics?.decode_ms, label: r.sampleKey })),
                },
              ]}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Stage Bottleneck Share</h3>
              <span className="chart-badge">Doughnut</span>
            </div>
            <StageShareDoughnutSvg
              stages={[
                { label: 'Preprocess', value: summary.preprocessMean || 0, color: '#e0a94e' },
                { label: 'Encode', value: summary.encodeMean || 0, color: '#4d8fd9' },
                { label: 'Decode', value: summary.decodeMean || 0, color: '#5dba82' },
                { label: 'Tokenize', value: summary.tokenizeMean || 0, color: '#9b9fdf' },
              ]}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Duration Bucket Stacked Stage Latency</h3>
              <span className="chart-badge">Stacked Bar</span>
            </div>
            <StackedBarChartSvg
              labels={durationBuckets.map((b) => b.label)}
              yLabel="ms"
              stacked
              datasets={[
                { label: 'Preprocess', color: '#e0a94e', data: durationBuckets.map((b) => b.avgPreprocessMs) },
                { label: 'Encode', color: '#4d8fd9', data: durationBuckets.map((b) => b.avgEncodeMs) },
                { label: 'Decode', color: '#5dba82', data: durationBuckets.map((b) => b.avgDecodeMs) },
              ]}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Run Order vs RTFx (Warmup &amp; Thermal Stability)</h3>
              <span className="chart-badge">Stability</span>
            </div>
            <ScatterPlotSvg
              xLabel="Run Index (#)"
              yLabel="RTFx"
              series={[
                {
                  label: 'Run RTFx',
                  color: '#e0a94e',
                  data: okRuns.map((r, idx) => ({ x: idx + 1, y: r.rtfx ?? r.metrics?.rtfx, label: r.sampleKey })),
                },
              ]}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">Transcript Length (chars) vs Decode Time</h3>
              <span className="chart-badge">Scaling</span>
            </div>
            <ScatterPlotSvg
              xLabel="Transcript Length (chars)"
              yLabel="Decode (ms)"
              series={[
                {
                  label: 'Chars vs Decode ms',
                  color: '#5dba82',
                  data: okRuns.map((r) => ({ x: (r.transcription || '').length, y: r.metrics?.decode_ms, label: r.sampleKey })),
                },
              ]}
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <h3 className="chart-card-title">RTFx Distribution Histogram</h3>
              <span className="chart-badge">Histogram</span>
            </div>
            {(() => {
              const hist = buildHistogram(okRuns.map((r) => r.rtfx ?? r.metrics?.rtfx));
              return (
                <StackedBarChartSvg
                  labels={hist.labels}
                  yLabel="runs"
                  stacked={false}
                  datasets={[{ label: 'Run Count', color: '#4d8fd9', data: hist.counts }]}
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══ TAB 4: COMPARE & PIVOT ═══ */}
      {activeTab === 'compare' && (
        <div>
          <section className="table-panel">
            <div className="table-panel-head">
              <h3>Saved Benchmark Snapshots ({snapshots.length})</h3>
              <div className="btn-row">
                <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                  Import JSON Snapshot
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportSnapshotJson} />
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => downloadText(`asrjs-leaderboard-${Date.now()}.md`, runsToMarkdownLeaderboard(snapshots), 'text/markdown')}
                  disabled={!snapshots.length}
                >
                  Export Markdown Leaderboard
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table className="bench-table">
                <thead>
                  <tr>
                    <th>Baseline</th>
                    <th>Label</th>
                    <th>Model</th>
                    <th>Backend</th>
                    <th>Quant</th>
                    <th>Runs</th>
                    <th>Mean Total</th>
                    <th>Encode</th>
                    <th>Decode</th>
                    <th>Median RTFx</th>
                    <th>Delta vs Baseline</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.length ? (
                    snapshots.map((s, idx) => {
                      const base = snapshots.find((x) => selectedSnapshotIds[0] === x.id) || snapshots[0];
                      const baseRtfx = base?.summary?.rtfxMedian;
                      const curRtfx = s.summary?.rtfxMedian;
                      const deltaPct =
                        Number.isFinite(baseRtfx) && Number.isFinite(curRtfx) && baseRtfx > 0
                          ? ((curRtfx - baseRtfx) / baseRtfx) * 100
                          : null;
                      return (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="radio"
                              name="baseline-snap"
                              checked={(selectedSnapshotIds[0] || snapshots[0]?.id) === s.id}
                              onChange={() => setSelectedSnapshotIds([s.id])}
                            />
                          </td>
                          <td><strong>{s.label}</strong></td>
                          <td className="mono">{s.settings?.modelKey || '-'}</td>
                          <td className="mono">{s.settings?.backend || '-'}</td>
                          <td className="mono">e:{s.settings?.encoderQuant || '-'} d:{s.settings?.decoderQuant || '-'}</td>
                          <td>{s.summary?.okCount ?? s.summary?.runCount ?? 0}</td>
                          <td className="mono">{fmtMs(s.summary?.totalMean)}</td>
                          <td className="mono">{fmtMs(s.summary?.encodeMean)}</td>
                          <td className="mono">{fmtMs(s.summary?.decodeMean)}</td>
                          <td className="mono"><strong>{fmtRtfx(curRtfx)}</strong></td>
                          <td className="mono">
                            {idx === 0 && (selectedSnapshotIds[0] || snapshots[0]?.id) === s.id ? (
                              <span className="status-note">Baseline</span>
                            ) : Number.isFinite(deltaPct) ? (
                              <span className={deltaPct >= 0 ? 'delta-better' : 'delta-worse'}>
                                {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}% RTFx
                              </span>
                            ) : '-'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => setSnapshots((prev) => prev.filter((x) => x.id !== s.id))}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={12}>Save a snapshot on the Benchmark Setup tab or import a JSON receipt to compare configurations.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Pivot Table */}
          {snapshots.length > 0 && (
            <section className="table-panel">
              <div className="table-panel-head">
                <h3>Multi-Configuration Pivot Table</h3>
                <div className="btn-row">
                  <span className="status-note">Group by:</span>
                  {PIVOT_DIMENSIONS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={`btn btn-sm ${pivotGroupBy === d.key ? 'btn-primary' : ''}`}
                      onClick={() => setPivotGroupBy(d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-scroll">
                <table className="bench-table">
                  <thead>
                    <tr>
                      <th>{PIVOT_DIMENSIONS.find((d) => d.key === pivotGroupBy)?.label || 'Group'}</th>
                      <th>Snapshots</th>
                      <th>Mean Total (ms)</th>
                      <th>Mean Encode (ms)</th>
                      <th>Mean Decode (ms)</th>
                      <th>Mean RTFx</th>
                      <th>Mean Repeatability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const dim = PIVOT_DIMENSIONS.find((d) => d.key === pivotGroupBy) || PIVOT_DIMENSIONS[0];
                      const groups = {};
                      for (const s of snapshots) {
                        const k = dim.extract(s);
                        if (!groups[k]) groups[k] = [];
                        groups[k].push(s);
                      }
                      return Object.entries(groups).map(([k, items]) => (
                        <tr key={k}>
                          <td className="mono"><strong>{k}</strong></td>
                          <td>{items.length}</td>
                          <td className="mono">{fmtMs(mean(items.map((i) => i.summary?.totalMean)))}</td>
                          <td className="mono">{fmtMs(mean(items.map((i) => i.summary?.encodeMean)))}</td>
                          <td className="mono">{fmtMs(mean(items.map((i) => i.summary?.decodeMean)))}</td>
                          <td className="mono"><strong>{fmtRtfx(mean(items.map((i) => i.summary?.rtfxMedian)))}</strong></td>
                          <td className="mono">{fmtPct(mean(items.map((i) => i.summary?.exactRate)))}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══ TAB 5: RUN DATA & EXPORT ═══ */}
      {activeTab === 'data' && (
        <section className="table-panel">
          <div className="table-panel-head">
            <h3>Individual Benchmark Runs ({runs.length})</h3>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => downloadText(`asrjs-runs-${Date.now()}.csv`, benchmarkRunRecordsToCsv(runs), 'text/csv')}
                disabled={!runs.length}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => downloadText(`asrjs-lifecycle-${Date.now()}.csv`, benchmarkLifecycleRecordsToCsv(lifecycleRecords), 'text/csv')}
                disabled={!lifecycleRecords.length}
              >
                Download Lifecycle CSV
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="bench-table">
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Repeat</th>
                  <th>Audio Dur</th>
                  <th>Preproc</th>
                  <th>Encode</th>
                  <th>Decode</th>
                  <th>Total</th>
                  <th>RTFx</th>
                  <th>Ref Sim</th>
                  <th>Hypothesis</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {runs.length ? (
                  runs.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.sampleKey}</td>
                      <td>#{r.repeatIndex}</td>
                      <td className="mono">{formatSeconds(r.audioDurationSec)}</td>
                      <td className="mono">{fmtMs(r.metrics?.preprocess_ms)}</td>
                      <td className="mono">{fmtMs(r.metrics?.encode_ms)}</td>
                      <td className="mono">{fmtMs(r.metrics?.decode_ms)}</td>
                      <td className="mono">{fmtMs(r.metrics?.total_ms)}</td>
                      <td className="mono"><strong>{fmtRtfx(r.rtfx)}</strong></td>
                      <td className="mono">{fmtPct(r.referenceSimilarity ?? r.similarityToFirst)}</td>
                      <td className="text-col">{r.error ? <span className="delta-worse">{r.error}</span> : r.transcription}</td>
                      <td className="text-col">{r.referenceText || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={11}>No runs recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
