import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  listSpeechModels,
  PcmAudioBuffer,
  resolveSpeechModelComponentBackends,
} from '@asrjs/speech-recognition';
import { loadBuiltInSpeechModel } from '@asrjs/speech-recognition/builtins';
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
import { fetchDatasetSplits, fetchRandomRows, fetchSequentialRows, getConfigsAndSplits, normalizeDatasetRow } from '@asrjs/speech-recognition/datasets';
import './App.css';

const SETTINGS_KEY = 'asrjs.benchmark-demo.settings.v2';
const VERSION = typeof __ASRJS_VERSION__ !== 'undefined' ? __ASRJS_VERSION__ : 'unknown';
const SOURCE = typeof __ASRJS_SOURCE__ !== 'undefined' ? __ASRJS_SOURCE__ : 'dev';
const BACKEND_MODES = [
  { value: 'webgpu-hybrid', label: 'WebGPU encoder + WASM decoder (hybrid)' },
  { value: 'webgpu', label: 'WebGPU pure' },
  { value: 'wasm', label: 'WASM pure (CPU)' },
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
    // Ignore storage failures in the demo.
  }
}

function normalizeBackendMode(value) {
  if (value === 'wasm') return 'wasm';
  if (value === 'webgpu') return 'webgpu';
  return 'webgpu-hybrid';
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function fmtMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '-';
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
}

function fmtNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function fmtBytes(value) {
  if (!Number.isFinite(value)) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let scaled = Math.abs(value);
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  const signed = value < 0 ? -scaled : scaled;
  return `${signed.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function monotonicNow() {
  return performance.now();
}

function fmtMemoryChange(record) {
  const delta = benchmarkMemoryDeltaBytes(record?.memoryBefore, record?.memoryAfter);
  if (Number.isFinite(delta)) return fmtBytes(delta);
  const reason = record?.memoryAfter?.reason ?? record?.memoryBefore?.reason;
  return reason ? `unavailable (${reason})` : '-';
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function summarizeRuns(runs) {
  const okRuns = runs.filter((run) => !run.error);
  const total = summarizeNumericSeries(okRuns.map((run) => run.metrics?.total_ms).filter(Number.isFinite));
  const encode = summarizeNumericSeries(okRuns.map((run) => run.metrics?.encode_ms).filter(Number.isFinite));
  const decode = summarizeNumericSeries(okRuns.map((run) => run.metrics?.decode_ms).filter(Number.isFinite));
  const similarity = summarizeNumericSeries(okRuns.map((run) => run.similarityToFirst).filter(Number.isFinite));
  const exactMatches = okRuns.filter((run) => run.exactMatchToFirst === true).length;
  const rtf = summarizeNumericSeries(okRuns.map((run) => run.metrics?.rtf).filter(Number.isFinite));
  const rtfx = summarizeNumericSeries(okRuns.map((run) => run.metrics?.rtfx ?? run.rtfx).filter(Number.isFinite));
  return {
    runCount: runs.length,
    okCount: okRuns.length,
    errorCount: runs.length - okRuns.length,
    total,
    encode,
    decode,
    similarity,
    exactRate: okRuns.length > 0 ? exactMatches / okRuns.length : null,
    rtf,
    rtfx,
  };
}

function collectConfigMap(items) {
  const grouped = getConfigsAndSplits(items);
  const configs = grouped.size > 0 ? [...grouped.keys()] : ['default'];
  const configToSplits = {};
  for (const [config, splits] of grouped.entries()) {
    configToSplits[config] = [...splits];
  }
  return {
    configs,
    configToSplits,
  };
}

export default function App() {
  const saved = loadSettings();
  const catalogModels = useMemo(() => listSpeechModels(), []);
  const initialModel = saved.modelKey && catalogModels.some((m) => m.modelId === saved.modelKey)
    ? saved.modelKey
    : 'parakeet-tdt-0.6b-v3';

  const [modelKey, setModelKey] = useState(initialModel);
  const [loaderMode, setLoaderMode] = useState(saved.loaderMode || 'catalog');
  const [backend, setBackend] = useState(normalizeBackendMode(saved.backend));
  const [encoderQuant, setEncoderQuant] = useState(saved.encoderQuant || 'fp16');
  const [decoderQuant, setDecoderQuant] = useState(saved.decoderQuant || 'int8');
  const [preprocessorBackend, setPreprocessorBackend] = useState(saved.preprocessorBackend || 'js');
  const [cpuThreads, setCpuThreads] = useState(Math.max(1, Number(saved.cpuThreads) || 4));
  const [enableProfiling, setEnableProfiling] = useState(saved.enableProfiling !== false);
  const [cacheModels, setCacheModels] = useState(saved.cacheModels === true);

  const [datasetId, setDatasetId] = useState(saved.datasetId || 'ysdede/parrot-radiology-asr-en');
  const [datasetConfig, setDatasetConfig] = useState(saved.datasetConfig || 'default');
  const [datasetSplit, setDatasetSplit] = useState(saved.datasetSplit || 'train');
  const [sampleCount, setSampleCount] = useState(Math.max(1, Number(saved.sampleCount) || 6));
  const [repeatCount, setRepeatCount] = useState(Math.max(1, Number(saved.repeatCount) || 3));
  const [startOffset, setStartOffset] = useState(Math.max(0, Number(saved.startOffset) || 0));
  const [randomize, setRandomize] = useState(saved.randomize !== false);
  const [randomSeed, setRandomSeed] = useState(saved.randomSeed || '42');

  const [status, setStatus] = useState('Idle');
  const [progressText, setProgressText] = useState('');
  const [progressValue, setProgressValue] = useState(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [modelReady, setModelReady] = useState(false);

  const [configs, setConfigs] = useState(['default']);
  const [configToSplits, setConfigToSplits] = useState({ default: ['train'] });
  const [splitCounts, setSplitCounts] = useState({});
  const [preparedSamples, setPreparedSamples] = useState([]);
  const [runs, setRuns] = useState([]);
  const [lifecycleRecords, setLifecycleRecords] = useState([]);
  const [lastBatchAt, setLastBatchAt] = useState('');
  const modelRef = useRef(null);
  const loadedModelProvenanceRef = useRef(null);

  const groupedCatalogModels = useMemo(() => {
    const groups = {};
    for (const m of catalogModels) {
      const group = getFamilyGroupLabel(m);
      if (!groups[group]) groups[group] = [];
      groups[group].push(m);
    }
    return groups;
  }, [catalogModels]);

  const selectedModelDescriptor = useMemo(
    () => catalogModels.find((m) => m.modelId === modelKey) || null,
    [catalogModels, modelKey]
  );
  const isParakeetPreset = Boolean(MODELS[modelKey]);
  const modelDisplayName = selectedModelDescriptor?.displayName || MODELS[modelKey]?.displayName || modelKey;
  const modelFamily = selectedModelDescriptor?.classification?.family || selectedModelDescriptor?.preset || (isParakeetPreset ? 'parakeet' : 'custom');
  const modelRepoId = selectedModelDescriptor?.loading?.repoId || MODELS[modelKey]?.repoId || '-';
  const modelLanguages = useMemo(() => {
    const langs = selectedModelDescriptor?.languages || MODELS[modelKey]?.languages || ['en'];
    return langs.map((code) => LANGUAGE_NAMES[code] || code).join(', ');
  }, [selectedModelDescriptor, modelKey]);

  const componentBackends = useMemo(
    () => resolveSpeechModelComponentBackends(modelKey, { backend }),
    [modelKey, backend]
  );
  const availableSplits = configToSplits[datasetConfig] || ['train'];
  const summary = useMemo(() => summarizeRuns(runs), [runs]);
  const recentRuns = useMemo(() => runs.slice(-20).reverse(), [runs]);
  const recentLifecycleRecords = useMemo(() => lifecycleRecords.slice(-8).reverse(), [lifecycleRecords]);
  const latestLifecycleRecord = recentLifecycleRecords[0] ?? null;

  useEffect(() => {
    saveSettings({
      modelKey,
      loaderMode,
      backend,
      encoderQuant,
      decoderQuant,
      preprocessorBackend,
      cpuThreads,
      enableProfiling,
      cacheModels,
      datasetId,
      datasetConfig,
      datasetSplit,
      sampleCount,
      repeatCount,
      startOffset,
      randomize,
      randomSeed,
    });
  }, [
    modelKey,
    loaderMode,
    backend,
    encoderQuant,
    decoderQuant,
    preprocessorBackend,
    cpuThreads,
    enableProfiling,
    cacheModels,
    datasetId,
    datasetConfig,
    datasetSplit,
    sampleCount,
    repeatCount,
    startOffset,
    randomize,
    randomSeed,
  ]);

  useEffect(() => () => {
    void modelRef.current?.dispose?.();
  }, []);

  useEffect(() => {
    let active = true;
    setStatus(`Loading dataset metadata for ${datasetId}…`);

    fetchDatasetSplits(datasetId)
      .then((items) => {
        if (!active) return;
        const { configs: nextConfigs, configToSplits: nextConfigToSplits } = collectConfigMap(items);
        const nextConfig = nextConfigs.includes(datasetConfig) ? datasetConfig : nextConfigs[0];
        const nextSplits = nextConfigToSplits[nextConfig] || ['train'];
        const nextSplit = nextSplits.includes(datasetSplit) ? datasetSplit : nextSplits[0];
        const counts = {};

        for (const item of items) {
          if (item.config && item.split && Number.isFinite(item.num_examples)) {
            counts[`${item.config}::${item.split}`] = item.num_examples;
          }
        }

        setConfigs(nextConfigs);
        setConfigToSplits(nextConfigToSplits);
        setSplitCounts(counts);
        if (nextConfig !== datasetConfig) setDatasetConfig(nextConfig);
        if (nextSplit !== datasetSplit) setDatasetSplit(nextSplit);
        setStatus(`Loaded ${items.length} split entries for ${datasetId}`);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        setConfigs(['default']);
        setConfigToSplits({ default: ['train'] });
        setStatus(`Dataset metadata failed: ${error.message}`);
      });

    return () => {
      active = false;
    };
  }, [datasetId]);

  useEffect(() => {
    const available = configToSplits[datasetConfig] || ['train'];
    if (!available.includes(datasetSplit)) {
      setDatasetSplit(available[0]);
    }
  }, [configToSplits, datasetConfig, datasetSplit]);

  async function loadModel() {
    setIsLoadingModel(true);
    setModelReady(false);
    setStatus(`Loading ${modelDisplayName}…`);
    setProgressText('');
    setProgressValue(0);

    const memoryBefore = await measureBrowserMemory();
    const startedAt = new Date().toISOString();
    const startedMs = monotonicNow();
    let loadError = '';

    try {
      await modelRef.current?.dispose?.();
      modelRef.current = null;
      loadedModelProvenanceRef.current = null;

      const useParakeetFallback = loaderMode === 'parakeet-fallback' && isParakeetPreset;

      if (useParakeetFallback) {
        const loaded = await loadModelWithFallback({
          repoIdOrModelKey: modelKey,
          options: {
            encoderQuant,
            decoderQuant,
            preprocessor: MODELS[modelKey]?.preprocessor || 'nemo128',
            preprocessorBackend,
            backend,
            encoderBackend: componentBackends.encoderBackend,
            decoderBackend: componentBackends.decoderBackend,
            cpuThreads,
            enableProfiling,
            cacheModels,
            progress: (event) => {
              const pct = event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0;
              setProgressText(`${event.file}: ${pct}%`);
              setProgressValue(event.total > 0 ? pct : 0);
            },
          },
          getParakeetModelFn: getParakeetModel,
          fromUrlsFn: ParakeetModel.fromUrls,
          onBeforeCompile: ({ attempt, modelUrls }) => {
            setStatus('Compiling model…');
            setProgressText(`encoder=${modelUrls.quantisation.encoder}, decoder=${modelUrls.quantisation.decoder}`);
            setProgressValue(null);
          },
        });

        modelRef.current = {
          transcribe: async (pcm, sampleRate, opts) => {
            const res = await loaded.model.transcribe(pcm, sampleRate, opts);
            const text = res.utterance_text || '';
            return {
              text,
              canonicalText: text,
              metrics: res.metrics || {},
            };
          },
          dispose: async () => loaded.model.dispose(),
        };

        loadedModelProvenanceRef.current = {
          modelKey,
          loader: 'loadModelWithFallback',
          backend,
          encoderBackend: componentBackends.encoderBackend,
          decoderBackend: componentBackends.decoderBackend,
          encoderQuant: loaded.modelUrls.quantisation.encoder,
          decoderQuant: loaded.modelUrls.quantisation.decoder,
          family: 'parakeet',
        };
      } else {
        // Universal catalog loading for all families via loadBuiltInSpeechModel
        const handle = await loadBuiltInSpeechModel({
          modelId: modelKey,
          backend,
          options: {
            cpuThreads,
            enableProfiling,
          },
          onProgress: (event) => {
            const pct = typeof event.percent === 'number'
              ? Math.round(event.percent)
              : event.total > 0
                ? Math.round((event.loaded / event.total) * 100)
                : null;
            setProgressText(event.message || event.phase);
            if (pct !== null) setProgressValue(pct);
          },
        });

        modelRef.current = {
          transcribe: async (pcm, sampleRate, opts) => {
            const audioBuffer = PcmAudioBuffer.fromMono(pcm, sampleRate);
            const res = await handle.transcribe(audioBuffer, {
              ...opts,
              responseFlavor: 'canonical+native',
            });
            const canonicalText = res.canonical?.text ?? res.text ?? res.utterance_text ?? '';
            const metrics = res.canonical?.meta?.metrics ?? res.metrics ?? {};
            return {
              text: canonicalText,
              canonicalText,
              metrics: {
                encode_ms: metrics.encodeMs ?? metrics.encode_ms ?? null,
                decode_ms: metrics.decodeMs ?? metrics.decode_ms ?? null,
                total_ms: metrics.totalMs ?? metrics.total_ms ?? null,
                rtf: metrics.rtf ?? null,
                rtfx: metrics.rtfx ?? (metrics.rtf ? 1 / metrics.rtf : null),
              },
              native: res.native,
            };
          },
          dispose: async () => handle.dispose(),
        };

        loadedModelProvenanceRef.current = {
          modelKey,
          loader: 'loadBuiltInSpeechModel',
          backend,
          family: modelFamily,
        };
      }

      setModelReady(true);
      setStatus('Model ready for benchmark');
    } catch (error) {
      console.error(error);
      loadError = error instanceof Error ? error.message : String(error);
      setStatus(`Model load failed: ${loadError}`);
    } finally {
      const finishedMs = monotonicNow();
      const finishedAt = new Date().toISOString();
      const memoryAfter = await measureBrowserMemory();
      setLifecycleRecords((records) => [
        ...records,
        {
          id: `model-load-${Date.now()}`,
          phase: 'model-load',
          startedAt,
          finishedAt,
          totalMs: finishedMs - startedMs,
          memoryBefore,
          memoryAfter,
          error: loadError,
          modelKey,
          backend,
        },
      ]);
      setIsLoadingModel(false);
    }
  }

  async function disposeModel() {
    const model = modelRef.current;
    if (!model) return;

    const provenance = loadedModelProvenanceRef.current;
    setIsLoadingModel(true);
    setStatus('Disposing model…');
    setProgressText('');
    setProgressValue(null);

    const memoryBefore = await measureBrowserMemory();
    const startedAt = new Date().toISOString();
    const startedMs = monotonicNow();
    let disposeError = '';

    try {
      await model.dispose();
      setStatus('Model disposed');
    } catch (error) {
      console.error(error);
      disposeError = error instanceof Error ? error.message : String(error);
      setStatus(`Model disposal failed: ${disposeError}`);
    } finally {
      const finishedMs = monotonicNow();
      const finishedAt = new Date().toISOString();
      modelRef.current = null;
      loadedModelProvenanceRef.current = null;
      setModelReady(false);
      const memoryAfter = await measureBrowserMemory();
      setLifecycleRecords((records) => [
        ...records,
        {
          id: `model-dispose-${Date.now()}`,
          phase: 'model-dispose',
          startedAt,
          finishedAt,
          totalMs: finishedMs - startedMs,
          memoryBefore,
          memoryAfter,
          error: disposeError,
          ...(provenance ?? {
            modelKey,
            backend,
          }),
        },
      ]);
      setIsLoadingModel(false);
    }
  }

  async function prepareDatasetRows() {
    setIsPreparing(true);
    setStatus(`Preparing ${sampleCount} samples from ${datasetId}…`);

    try {
      const rows = randomize
        ? await fetchRandomRows(datasetId, datasetConfig, datasetSplit, sampleCount, randomSeed)
        : await fetchSequentialRows(datasetId, datasetConfig, datasetSplit, startOffset, sampleCount);

      const normalized = rows
        .map((row, index) => normalizeDatasetRow(row, index, startOffset))
        .filter((row) => Boolean(row.audioUrl))
        .map((row) => ({
          ...row,
          sampleKey: `${datasetConfig}/${datasetSplit}#${row.rowIndex}`,
        }));

      setPreparedSamples(normalized);
      if (normalized.length === 0) {
        setStatus('No usable rows were prepared from the selected dataset.');
      } else {
        setStatus(`Prepared ${normalized.length} benchmark samples from ${datasetId}`);
      }
    } catch (error) {
      console.error(error);
      setStatus(`Dataset preparation failed: ${error.message}`);
    } finally {
      setIsPreparing(false);
    }
  }

  async function runBenchmark() {
    if (!modelRef.current) {
      alert('Load a model first.');
      return;
    }
    if (preparedSamples.length === 0) {
      alert('Prepare dataset rows first.');
      return;
    }

    setIsRunning(true);
    setRuns([]);
    setLastBatchAt(new Date().toISOString());
    setProgressValue(0);
    setProgressText('');

    const nextRuns = [];
    const baselineBySample = new Map();
    const audioCache = new Map();
    const batchId = `batch-${Date.now()}`;
    const runProvenance = loadedModelProvenanceRef.current ?? {
      modelKey,
      backend,
      family: modelFamily,
    };
    const totalTasks = preparedSamples.length * repeatCount;
    let finishedTasks = 0;

    try {
      for (let sampleIndex = 0; sampleIndex < preparedSamples.length; sampleIndex += 1) {
        const sample = preparedSamples[sampleIndex];

        if (!audioCache.has(sample.audioUrl)) {
          setStatus(`Decoding ${sample.sampleKey}…`);
          audioCache.set(sample.audioUrl, await decodeAudioSourceToMonoPcm(sample.audioUrl, { targetSampleRate: 16000 }));
        }
        const audio = audioCache.get(sample.audioUrl);

        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
          const startedAt = new Date().toISOString();
          setStatus(`Benchmarking ${sample.sampleKey} (repeat ${repeatIndex + 1}/${repeatCount})…`);

          try {
            const startMs = performance.now();
            const result = await modelRef.current.transcribe(audio.pcm, audio.sampleRate, {
              returnTimestamps: false,
              returnConfidences: false,
              enableProfiling,
            });
            const wallMs = performance.now() - startMs;
            const canonicalTranscript = result.canonicalText || result.text || '';
            const firstTranscript = baselineBySample.get(sample.sampleKey) ?? canonicalTranscript;
            if (!baselineBySample.has(sample.sampleKey)) {
              baselineBySample.set(sample.sampleKey, firstTranscript);
            }

            const audioDur = audio.durationSec || 1;
            const encodeMs = result.metrics?.encode_ms ?? null;
            const decodeMs = result.metrics?.decode_ms ?? null;
            const totalMs = result.metrics?.total_ms ?? (encodeMs && decodeMs ? encodeMs + decodeMs : wallMs);
            const rtf = result.metrics?.rtf ?? (totalMs ? (totalMs / 1000) / audioDur : null);
            const rtfx = result.metrics?.rtfx ?? (calcRtfx(audioDur, totalMs) ?? (rtf ? 1 / rtf : null));

            nextRuns.push({
              batchId,
              startedAt,
              finishedAt: new Date().toISOString(),
              id: `${sample.sampleKey}-${repeatIndex + 1}`,
              sampleKey: sample.sampleKey,
              sampleOrder: sampleIndex + 1,
              rowIndex: sample.rowIndex,
              repeatIndex: repeatIndex + 1,
              audioDurationSec: audio.durationSec,
              speaker: sample.speaker,
              gender: sample.gender,
              speed: sample.speed,
              volume: sample.volume,
              transcription: canonicalTranscript,
              referenceText: sample.referenceText,
              exactMatchToFirst: canonicalTranscript === firstTranscript,
              similarityToFirst: textSimilarity(canonicalTranscript, firstTranscript),
              metrics: {
                encode_ms: encodeMs,
                decode_ms: decodeMs,
                total_ms: totalMs,
                rtf,
                rtfx,
              },
              encodeMs,
              decodeMs,
              totalMs,
              rtfx,
              rtf,
              ...runProvenance,
            });
          } catch (error) {
            nextRuns.push({
              batchId,
              startedAt,
              finishedAt: new Date().toISOString(),
              id: `${sample.sampleKey}-${repeatIndex + 1}`,
              sampleKey: sample.sampleKey,
              sampleOrder: sampleIndex + 1,
              rowIndex: sample.rowIndex,
              repeatIndex: repeatIndex + 1,
              audioDurationSec: audio.durationSec,
              speaker: sample.speaker,
              gender: sample.gender,
              speed: sample.speed,
              volume: sample.volume,
              transcription: '',
              referenceText: sample.referenceText,
              error: error.message,
              ...runProvenance,
            });
          }

          finishedTasks += 1;
          setProgressValue(Math.round((finishedTasks / totalTasks) * 100));
          setProgressText(`${finishedTasks}/${totalTasks} runs complete`);
          setRuns([...nextRuns]);
        }
      }

      setStatus(`Benchmark complete: ${nextRuns.length} runs executed`);
    } finally {
      setIsRunning(false);
    }
  }

  function exportCsv() {
    if (runs.length === 0) return;
    downloadText(`asrjs-benchmark-${Date.now()}.csv`, benchmarkRunRecordsToCsv(runs), 'text/csv;charset=utf-8');
  }

  function exportLifecycleCsv() {
    if (lifecycleRecords.length === 0) return;
    downloadText(
      `asrjs-benchmark-lifecycle-${Date.now()}.csv`,
      benchmarkLifecycleRecordsToCsv(lifecycleRecords),
      'text/csv;charset=utf-8'
    );
  }

  function exportJson() {
    if (runs.length === 0 && lifecycleRecords.length === 0) return;
    downloadText(`asrjs-benchmark-${Date.now()}.json`, JSON.stringify({
      settings: {
        modelKey,
        loaderMode,
        backend,
        encoderQuant,
        decoderQuant,
        preprocessorBackend,
        cpuThreads,
        enableProfiling,
        cacheModels,
        datasetId,
        datasetConfig,
        datasetSplit,
        sampleCount,
        repeatCount,
        startOffset,
        randomize,
        randomSeed,
      },
      preparedSamples,
      summary,
      lifecycleRecords,
      runs,
    }, null, 2), 'application/json');
  }

  return (
    <div className="page-shell">
      <div className="page-grid">
        <aside className="panel stack">
          <div className="eyebrow">ASRJS benchmark lab</div>
          <h1>Multi-Model Speech Benchmark</h1>
          <p className="lede">
            Benchmark any built-in speech model (Parakeet, Whisper, Canary, MedASR, Moonshine, Wav2Vec2, Orukeet, Nemotron)
            against Hugging Face speech datasets, inspecting RTFx, encode/decode/total latency, and canonical transcripts side-by-side.
          </p>
          <div className="version-pill">@asrjs/speech-recognition {VERSION} ({SOURCE})</div>

          <section className="card stack">
            <h2>Model Configuration</h2>
            <label>
              Benchmark Model
              <select
                value={modelKey}
                onChange={(e) => setModelKey(e.target.value)}
                disabled={isLoadingModel || modelReady}
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
            </label>
            <p className="hint">
              Family: <strong>{modelFamily}</strong> • Repo: <code>{modelRepoId}</code> • Languages: {modelLanguages}
            </p>

            <div className="pair">
              <label>
                Loader API
                <select
                  value={loaderMode}
                  onChange={(e) => setLoaderMode(e.target.value)}
                  disabled={isLoadingModel || modelReady}
                >
                  <option value="catalog">loadBuiltInSpeechModel (Universal)</option>
                  {isParakeetPreset ? (
                    <option value="parakeet-fallback">loadModelWithFallback (Parakeet)</option>
                  ) : null}
                </select>
              </label>

              <label>
                Execution backend
                <select
                  value={backend}
                  onChange={(e) => setBackend(e.target.value)}
                  disabled={isLoadingModel || modelReady}
                >
                  {BACKEND_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="pair">
              <label>
                CPU threads
                <input
                  type="number"
                  min="1"
                  value={cpuThreads}
                  onChange={(e) => setCpuThreads(Math.max(1, Number(e.target.value) || 1))}
                  disabled={isLoadingModel || modelReady}
                />
              </label>
              {loaderMode === 'parakeet-fallback' && isParakeetPreset ? (
                <label>
                  Preprocessor backend
                  <select
                    value={preprocessorBackend}
                    onChange={(e) => setPreprocessorBackend(e.target.value)}
                    disabled={isLoadingModel || modelReady}
                  >
                    <option value="js">js</option>
                    <option value="onnx">onnx</option>
                  </select>
                </label>
              ) : null}
            </div>

            {loaderMode === 'parakeet-fallback' && isParakeetPreset ? (
              <div className="pair">
                <label>
                  Encoder Quant
                  <select
                    value={encoderQuant}
                    onChange={(e) => setEncoderQuant(e.target.value)}
                    disabled={isLoadingModel || modelReady}
                  >
                    {QUANTS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Decoder Quant
                  <select
                    value={decoderQuant}
                    onChange={(e) => setDecoderQuant(e.target.value)}
                    disabled={isLoadingModel || modelReady}
                  >
                    {QUANTS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            ) : null}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enableProfiling}
                onChange={(e) => setEnableProfiling(e.target.checked)}
                disabled={isLoadingModel || modelReady}
              />
              <span>Collect stage timing metrics</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={cacheModels}
                onChange={(e) => setCacheModels(e.target.checked)}
                disabled={isLoadingModel || modelReady}
              />
              <span>Cache model assets in IndexedDB</span>
            </label>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={loadModel}
                disabled={isLoadingModel || modelReady}
              >
                {modelReady ? 'Model Ready' : isLoadingModel ? 'Loading…' : 'Load Model'}
              </button>
              <button
                className="secondary-button"
                onClick={disposeModel}
                disabled={!modelReady || isLoadingModel || isRunning}
              >
                {isLoadingModel && modelReady ? 'Disposing…' : 'Unload'}
              </button>
            </div>
          </section>

          <section className="card stack">
            <h2>Dataset Selection</h2>
            <label>
              Dataset
              <input
                list="dataset-suggestions"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                disabled={isPreparing || isRunning}
              />
              <datalist id="dataset-suggestions">
                {DATASET_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
              </datalist>
            </label>
            <div className="pair">
              <label>
                Config
                <select
                  value={datasetConfig}
                  onChange={(e) => setDatasetConfig(e.target.value)}
                  disabled={isPreparing || isRunning}
                >
                  {configs.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Split
                <select
                  value={datasetSplit}
                  onChange={(e) => setDatasetSplit(e.target.value)}
                  disabled={isPreparing || isRunning}
                >
                  {availableSplits.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="pair">
              <label>
                Samples
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={sampleCount}
                  onChange={(e) => setSampleCount(Math.max(1, Number(e.target.value) || 1))}
                  disabled={isPreparing || isRunning}
                />
              </label>
              <label>
                Repeats
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(1, Number(e.target.value) || 1))}
                  disabled={isPreparing || isRunning}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={randomize}
                onChange={(e) => setRandomize(e.target.checked)}
                disabled={isPreparing || isRunning}
              />
              <span>Seeded random sample selection</span>
            </label>
            {randomize ? (
              <label>
                Random seed
                <input
                  value={randomSeed}
                  onChange={(e) => setRandomSeed(e.target.value)}
                  disabled={isPreparing || isRunning}
                />
              </label>
            ) : (
              <label>
                Start offset
                <input
                  type="number"
                  min="0"
                  value={startOffset}
                  onChange={(e) => setStartOffset(Math.max(0, Number(e.target.value) || 0))}
                  disabled={isPreparing || isRunning}
                />
              </label>
            )}
            <p className="hint">
              Known rows in split: {Number.isFinite(splitCounts[`${datasetConfig}::${datasetSplit}`]) ? splitCounts[`${datasetConfig}::${datasetSplit}`] : 'unknown'}
            </p>
            <button
              className="secondary-button"
              onClick={prepareDatasetRows}
              disabled={isPreparing || isRunning}
            >
              {isPreparing ? 'Preparing…' : 'Prepare benchmark rows'}
            </button>
          </section>

          <section className="card stack">
            <h2>Benchmark Execution</h2>
            <button
              className="primary-button"
              onClick={runBenchmark}
              disabled={!modelReady || preparedSamples.length === 0 || isRunning}
            >
              {isRunning ? 'Running benchmark…' : 'Run benchmark'}
            </button>
            <div className="button-row">
              <button className="secondary-button" onClick={exportCsv} disabled={runs.length === 0}>
                Export CSV
              </button>
              <button className="secondary-button" onClick={exportLifecycleCsv} disabled={lifecycleRecords.length === 0}>
                Export lifecycle CSV
              </button>
              <button className="secondary-button" onClick={exportJson} disabled={runs.length === 0 && lifecycleRecords.length === 0}>
                Export JSON
              </button>
            </div>
            <div className="status-box">
              <strong>{status}</strong>
              {progressText ? <span>{progressText}</span> : null}
              {progressValue !== null ? (
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressValue}%` }} />
                </div>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="content stack">
          <section className="hero-card">
            <div>
              <div className="eyebrow">Current batch</div>
              <h2>{lastBatchAt ? new Date(lastBatchAt).toLocaleString() : 'No benchmark run yet'}</h2>
              <p>
                Prepared {preparedSamples.length} samples from <code>{datasetId}</code> / <code>{datasetConfig}</code> / <code>{datasetSplit}</code>.
              </p>
            </div>
            <div className="hero-metadata">
              <span>{modelDisplayName}</span>
              <span>family: {modelFamily}</span>
              <span>backend: {backend}</span>
              <span>loader: {loaderMode}</span>
            </div>
          </section>

          <section className="metric-grid">
            <article className="metric-card">
              <div className="metric-label">Runs</div>
              <div className="metric-value">{summary.runCount}</div>
              <div className="metric-sub">{summary.okCount} ok / {summary.errorCount} errors</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Throughput (RTFx)</div>
              <div className="metric-value font-semibold text-emerald-600">
                {Number.isFinite(summary.rtfx.median) ? `${summary.rtfx.median.toFixed(2)}x` : '-'}
              </div>
              <div className="metric-sub">mean {fmtNumber(summary.rtfx.mean)}x</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Total Latency</div>
              <div className="metric-value">{fmtMs(summary.total.mean)}</div>
              <div className="metric-sub">p90 {fmtMs(summary.total.p90)}</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Encode Latency</div>
              <div className="metric-value">{fmtMs(summary.encode.mean)}</div>
              <div className="metric-sub">p90 {fmtMs(summary.encode.p90)}</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Decode Latency</div>
              <div className="metric-value">{fmtMs(summary.decode.mean)}</div>
              <div className="metric-sub">p90 {fmtMs(summary.decode.p90)}</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Repeat Exact</div>
              <div className="metric-value">{fmtPct(summary.exactRate)}</div>
              <div className="metric-sub">Similarity {fmtPct(summary.similarity.mean)}</div>
            </article>
          </section>

          <section className="card stack">
            <div className="section-head">
              <h2>Recent Runs (Side-by-Side Throughput, Latency & Transcript)</h2>
              <span>{recentRuns.length}</span>
            </div>
            {recentRuns.length === 0 ? (
              <p className="empty-text">Run a benchmark batch to inspect timings, throughput, and canonical transcripts.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Sample</th>
                      <th>Repeat</th>
                      <th>RTFx</th>
                      <th>Total</th>
                      <th>Encode</th>
                      <th>Decode</th>
                      <th>Canonical Transcript</th>
                      <th>Reference Text</th>
                      <th>Exact</th>
                      <th>Sim</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run) => (
                      <tr key={run.id}>
                        <td>{run.id}</td>
                        <td>{run.sampleKey}</td>
                        <td>{run.repeatIndex}</td>
                        <td className="font-semibold text-emerald-600">
                          {Number.isFinite(run.metrics?.rtfx ?? run.rtfx) ? `${(run.metrics?.rtfx ?? run.rtfx).toFixed(2)}x` : '-'}
                        </td>
                        <td>{fmtMs(run.metrics?.total_ms ?? run.totalMs)}</td>
                        <td>{fmtMs(run.metrics?.encode_ms ?? run.encodeMs)}</td>
                        <td>{fmtMs(run.metrics?.decode_ms ?? run.decodeMs)}</td>
                        <td className="text-column font-medium">{run.transcription || '-'}</td>
                        <td className="text-column text-slate-500">{run.referenceText || '-'}</td>
                        <td>{typeof run.exactMatchToFirst === 'boolean' ? (run.exactMatchToFirst ? 'yes' : 'no') : '-'}</td>
                        <td>{fmtPct(run.similarityToFirst)}</td>
                        <td className="text-column error-column">{run.error || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card stack">
            <div className="section-head">
              <h2>Sample Rollups</h2>
              <span>{preparedSamples.length}</span>
            </div>
            {preparedSamples.length === 0 ? (
              <p className="empty-text">No per-sample rollups yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sample</th>
                      <th>Runs</th>
                      <th>Avg RTFx</th>
                      <th>Total Mean</th>
                      <th>Encode Mean</th>
                      <th>Decode Mean</th>
                      <th>Similarity Mean</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preparedSamples.map((sample) => {
                      const perSample = runs.filter((run) => run.sampleKey === sample.sampleKey);
                      const ok = perSample.filter((run) => !run.error);
                      const totalMean = mean(ok.map((run) => run.metrics?.total_ms ?? run.totalMs).filter(Number.isFinite));
                      const encodeMean = mean(ok.map((run) => run.metrics?.encode_ms ?? run.encodeMs).filter(Number.isFinite));
                      const decodeMean = mean(ok.map((run) => run.metrics?.decode_ms ?? run.decodeMs).filter(Number.isFinite));
                      const rtfxMean = mean(ok.map((run) => run.metrics?.rtfx ?? run.rtfx).filter(Number.isFinite));
                      const similarityMean = mean(ok.map((run) => run.similarityToFirst).filter(Number.isFinite));

                      return (
                        <tr key={sample.sampleKey}>
                          <td>{sample.sampleKey}</td>
                          <td>{perSample.length}</td>
                          <td className="font-semibold text-emerald-600">
                            {Number.isFinite(rtfxMean) ? `${rtfxMean.toFixed(2)}x` : '-'}
                          </td>
                          <td>{fmtMs(totalMean)}</td>
                          <td>{fmtMs(encodeMean)}</td>
                          <td>{fmtMs(decodeMean)}</td>
                          <td>{fmtPct(similarityMean)}</td>
                          <td className="text-column">{sample.referenceText || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card stack">
            <div className="section-head">
              <h2>Model Lifecycle & Memory Tracking</h2>
              <span>{lifecycleRecords.length}</span>
            </div>
            {latestLifecycleRecord ? (
              <p className="hint">
                Latest: {latestLifecycleRecord.phase} in {fmtMs(latestLifecycleRecord.totalMs)} • memory {fmtMemoryChange(latestLifecycleRecord)} • cache {latestLifecycleRecord.cacheStatus ?? '-'}
              </p>
            ) : (
              <p className="empty-text">Load or unload a model to capture lifecycle timing and memory evidence.</p>
            )}
            {recentLifecycleRecords.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Phase</th>
                      <th>Total</th>
                      <th>Memory Δ</th>
                      <th>Model</th>
                      <th>Backend</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLifecycleRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{record.phase}</td>
                        <td>{fmtMs(record.totalMs)}</td>
                        <td>{fmtMemoryChange(record)}</td>
                        <td>{record.modelKey}</td>
                        <td>{record.backend}</td>
                        <td className="text-column error-column">{record.error || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card stack">
            <div className="section-head">
              <h2>Prepared Samples Preview</h2>
              <span>{preparedSamples.length}</span>
            </div>
            {preparedSamples.length === 0 ? (
              <p className="empty-text">Prepare rows to preview which dataset samples will be benchmarked.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Sample</th><th>Speaker</th><th>Gender</th><th>Rate</th><th>Reference</th></tr>
                  </thead>
                  <tbody>
                    {preparedSamples.slice(0, 12).map((sample) => (
                      <tr key={sample.sampleKey}>
                        <td>{sample.sampleKey}</td>
                        <td>{sample.speaker || '-'}</td>
                        <td>{sample.gender || '-'}</td>
                        <td>{sample.sampleRate}</td>
                        <td className="text-column">{sample.referenceText || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
