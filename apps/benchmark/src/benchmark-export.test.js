import { describe, expect, it } from 'vitest';
import { mean, runsToMarkdownLeaderboard } from './benchmark-utils.jsx';

function createMockRun({
  sampleKey = 'sample-1',
  repeatIndex = 1,
  isWarmup = false,
  phase = 'warm',
  totalMs = 150,
  error = '',
} = {}) {
  return {
    id: `run-${Date.now()}-${Math.random()}`,
    batchId: 'batch-1',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    sampleKey,
    sampleOrder: 1,
    rowIndex: 0,
    repeatIndex,
    isWarmup,
    phase,
    audioDurationSec: 5.0,
    transcription: 'test transcript',
    referenceText: 'test transcript',
    exactMatchToFirst: true,
    similarityToFirst: 1,
    wer: 0,
    cer: 0,
    referenceSimilarity: 1,
    metrics: {
      preprocess_ms: 10,
      encode_ms: 100,
      decode_ms: 40,
      total_ms: totalMs,
      rtfx: 5000 / totalMs,
    },
    rtfx: 5000 / totalMs,
    modelKey: 'parakeet-tdt-0.6b-v3',
    backend: 'webgpu-hybrid',
    encoderQuant: 'fp16',
    decoderQuant: 'int8',
    preprocessorBackend: 'js',
    error,
  };
}

function buildSnapshot({
  okRuns = [],
  modelKey = 'parakeet-tdt-0.6b-v3',
  backend = 'webgpu-hybrid',
  encoderQuant = 'fp16',
  decoderQuant = 'int8',
  preprocessorBackend = 'js',
  datasetId = 'librispeech-clean',
  audioSourceMode = 'manifest',
  snapshotName = '',
  hardware = { gpuLabel: 'nvidia / blackwell', webgpuAvailable: true },
  summary = { totalMean: 120, rtfxMedian: 15.0 },
} = {}) {
  const defaultLabel = `${modelKey} | ${backend} | e:${encoderQuant} d:${decoderQuant}`;
  const coldRuns = okRuns.filter((r) => r.phase === 'cold' || r.isWarmup);
  const warmRuns = okRuns.filter((r) => r.phase === 'warm' && !r.isWarmup);
  return {
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
    summary: {
      ...summary,
      coldInferenceMean: mean(coldRuns.map((r) => r.metrics?.total_ms).filter(Number.isFinite)),
      warmInferenceMean: mean(warmRuns.map((r) => r.metrics?.total_ms).filter(Number.isFinite)),
    },
    coldRuns,
    warmRuns,
    runs: okRuns.slice(0, 120),
  };
}

function buildTab5ExportPayload({
  snapshots = [],
  runs = [],
  okRuns = [],
  modelKey = 'parakeet-tdt-0.6b-v3',
  backend = 'webgpu-hybrid',
  encoderQuant = 'fp16',
  decoderQuant = 'int8',
  preprocessorBackend = 'js',
  datasetId = 'librispeech-clean',
  audioSourceMode = 'manifest',
  hardware = { gpuLabel: 'nvidia / blackwell', webgpuAvailable: true },
  summary = { totalMean: 120, rtfxMedian: 15.0 },
} = {}) {
  const coldRuns = okRuns.filter((r) => r.phase === 'cold' || r.isWarmup);
  const warmRuns = okRuns.filter((r) => r.phase === 'warm' && !r.isWarmup);
  return snapshots.length > 0 ? snapshots : (runs.length > 0 ? [{
    id: `snap-${Date.now()}`,
    createdAt: new Date().toISOString(),
    label: `${modelKey} | ${backend} | e:${encoderQuant} d:${decoderQuant}`,
    settings: {
      modelKey,
      backend,
      encoderQuant,
      decoderQuant,
      preprocessorBackend,
      datasetSource: audioSourceMode === 'local-folder' ? 'Local Audio Folder' : datasetId,
    },
    hardware,
    summary: {
      ...summary,
      coldInferenceMean: mean(coldRuns.map((r) => r.metrics?.total_ms).filter(Number.isFinite)),
      warmInferenceMean: mean(warmRuns.map((r) => r.metrics?.total_ms).filter(Number.isFinite)),
    },
    coldRuns,
    warmRuns,
    runs: okRuns.slice(0, 120),
  }] : []);
}

function simulateImportJson(jsonString, defaultHardware = {}, defaultSummary = {}) {
  const parsed = JSON.parse(jsonString);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map((data, idx) => {
    const importedRuns = Array.isArray(data.runs) ? data.runs : [];
    return {
      id: data.id || `import-${Date.now()}-${idx}`,
      createdAt: data.createdAt || data.generatedAt || new Date().toISOString(),
      label: data.label || 'imported',
      settings: data.settings || { modelKey: data.modelId || 'imported', backend: data.backendId || '-' },
      hardware: data.hardware || defaultHardware,
      summary: data.summary || defaultSummary,
      coldRuns: Array.isArray(data.coldRuns) ? data.coldRuns : importedRuns.filter((r) => r.phase === 'cold' || r.isWarmup),
      warmRuns: Array.isArray(data.warmRuns) ? data.warmRuns : importedRuns.filter((r) => r.phase === 'warm' && !r.isWarmup),
      runs: importedRuns.slice(0, 120),
    };
  });
}

describe('Benchmark Demo JSON Export & Schema Verification', () => {
  it('generates valid JSON with required cold/warm inference fields for standard runs', () => {
    const warmupRun = createMockRun({ repeatIndex: 0, isWarmup: true, phase: 'cold', totalMs: 500 });
    const warmRun1 = createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'warm', totalMs: 100 });
    const warmRun2 = createMockRun({ repeatIndex: 2, isWarmup: false, phase: 'warm', totalMs: 110 });
    const okRuns = [warmupRun, warmRun1, warmRun2];

    const snap = buildSnapshot({ okRuns });
    const serialized = JSON.stringify([snap], null, 2);

    expect(() => JSON.parse(serialized)).not.toThrow();
    const deserialized = JSON.parse(serialized);
    expect(Array.isArray(deserialized)).toBe(true);
    expect(deserialized).toHaveLength(1);

    const s = deserialized[0];
    expect(s).toHaveProperty('coldRuns');
    expect(s).toHaveProperty('warmRuns');
    expect(s.summary).toHaveProperty('coldInferenceMean');
    expect(s.summary).toHaveProperty('warmInferenceMean');

    expect(s.coldRuns).toHaveLength(1);
    expect(s.warmRuns).toHaveLength(2);
    expect(s.summary.coldInferenceMean).toBe(500);
    expect(s.summary.warmInferenceMean).toBe(105);
  });

  it('correctly handles runs with 0 warmups (first run is cold)', () => {
    const coldRun = createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'cold', totalMs: 400 });
    const warmRun = createMockRun({ repeatIndex: 2, isWarmup: false, phase: 'warm', totalMs: 120 });
    const okRuns = [coldRun, warmRun];

    const snap = buildSnapshot({ okRuns });
    expect(snap.coldRuns).toHaveLength(1);
    expect(snap.warmRuns).toHaveLength(1);
    expect(snap.summary.coldInferenceMean).toBe(400);
    expect(snap.summary.warmInferenceMean).toBe(120);
  });

  it('correctly handles all-cold runs (e.g. 1 single cold run, 0 warm)', () => {
    const coldRun = createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'cold', totalMs: 450 });
    const snap = buildSnapshot({ okRuns: [coldRun] });

    expect(snap.coldRuns).toHaveLength(1);
    expect(snap.warmRuns).toHaveLength(0);
    expect(snap.summary.coldInferenceMean).toBe(450);
    expect(snap.summary.warmInferenceMean).toBeNull();

    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json);
    expect(parsed.summary.warmInferenceMean).toBeNull();
  });

  it('Tab 4 Export JSON produces valid JSON array from snapshots', () => {
    const snap1 = buildSnapshot({
      okRuns: [createMockRun({ repeatIndex: 0, isWarmup: true, phase: 'cold', totalMs: 300 })],
      snapshotName: 'Config A',
    });
    const snap2 = buildSnapshot({
      okRuns: [createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'warm', totalMs: 80 })],
      snapshotName: 'Config B',
    });

    const snapshots = [snap1, snap2];
    const exportedText = JSON.stringify(snapshots, null, 2);

    expect(() => JSON.parse(exportedText)).not.toThrow();
    const parsed = JSON.parse(exportedText);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].label).toBe('Config A');
    expect(parsed[1].label).toBe('Config B');
    expect(parsed[0].coldRuns).toHaveLength(1);
    expect(parsed[1].warmRuns).toHaveLength(1);
  });

  it('Tab 5 Export JSON prefers saved snapshots if available', () => {
    const snap = buildSnapshot({
      okRuns: [createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'warm', totalMs: 95 })],
      snapshotName: 'Pre-saved Snapshot',
    });
    const uncommittedRuns = [createMockRun({ repeatIndex: 1, totalMs: 200 })];

    const payload = buildTab5ExportPayload({
      snapshots: [snap],
      runs: uncommittedRuns,
      okRuns: uncommittedRuns,
    });

    expect(payload).toHaveLength(1);
    expect(payload[0].label).toBe('Pre-saved Snapshot');
    expect(payload[0].summary.warmInferenceMean).toBe(95);
  });

  it('Tab 5 Export JSON synthesizes a snapshot with cold/warm runs when snapshots is empty', () => {
    const warmupRun = createMockRun({ repeatIndex: 0, isWarmup: true, phase: 'cold', totalMs: 600 });
    const warmRun = createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'warm', totalMs: 150 });
    const runs = [warmupRun, warmRun];

    const payload = buildTab5ExportPayload({
      snapshots: [],
      runs,
      okRuns: runs,
    });

    const json = JSON.stringify(payload, null, 2);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].coldRuns).toHaveLength(1);
    expect(parsed[0].warmRuns).toHaveLength(1);
    expect(parsed[0].summary.coldInferenceMean).toBe(600);
    expect(parsed[0].summary.warmInferenceMean).toBe(150);
  });

  it('Tab 5 Export JSON produces empty array when both snapshots and runs are empty', () => {
    const payload = buildTab5ExportPayload({ snapshots: [], runs: [], okRuns: [] });
    expect(payload).toEqual([]);
    expect(JSON.stringify(payload)).toBe('[]');
  });

  it('re-imports exported JSON snapshots faithfully (round-trip test)', () => {
    const warmup = createMockRun({ repeatIndex: 0, isWarmup: true, phase: 'cold', totalMs: 480 });
    const repeat1 = createMockRun({ repeatIndex: 1, isWarmup: false, phase: 'warm', totalMs: 120 });
    const snap = buildSnapshot({ okRuns: [warmup, repeat1], snapshotName: 'Roundtrip Test' });

    const exportedJson = JSON.stringify([snap], null, 2);
    const imported = simulateImportJson(exportedJson);

    expect(imported).toHaveLength(1);
    expect(imported[0].label).toBe('Roundtrip Test');
    expect(imported[0].coldRuns).toHaveLength(1);
    expect(imported[0].warmRuns).toHaveLength(1);
    expect(imported[0].summary.coldInferenceMean).toBe(480);
    expect(imported[0].summary.warmInferenceMean).toBe(120);
  });

  it('backward compatibility: derives coldRuns and warmRuns when importing legacy snapshot files', () => {
    // Legacy snapshot where coldRuns and warmRuns arrays were not stored
    const legacySnapshot = {
      id: 'legacy-snap-1',
      label: 'Legacy Run',
      runs: [
        { id: 'r1', phase: 'cold', isWarmup: true, metrics: { total_ms: 500 } },
        { id: 'r2', phase: 'warm', isWarmup: false, metrics: { total_ms: 100 } },
        { id: 'r3', phase: 'warm', isWarmup: false, metrics: { total_ms: 105 } },
      ],
      summary: { totalMean: 102.5 },
    };

    const imported = simulateImportJson(JSON.stringify(legacySnapshot));
    expect(imported).toHaveLength(1);
    expect(imported[0].coldRuns).toHaveLength(1);
    expect(imported[0].coldRuns[0].id).toBe('r1');
    expect(imported[0].warmRuns).toHaveLength(2);
    expect(imported[0].warmRuns[0].id).toBe('r2');
    expect(imported[0].warmRuns[1].id).toBe('r3');
  });

  it('Markdown leaderboard generation functions without crashing on cold/warm snapshots', () => {
    const snap1 = buildSnapshot({
      okRuns: [createMockRun({ repeatIndex: 0, isWarmup: true, phase: 'cold', totalMs: 300 })],
      snapshotName: 'Config 1',
    });
    const md = runsToMarkdownLeaderboard([snap1]);
    expect(typeof md).toBe('string');
    expect(md).toContain('Config 1');
    expect(md).toContain('Mean Total (ms)');
  });

  describe('Adversarial Stress & Edge Cases', () => {
    it('truncates snapshot runs to 120 items when okRuns has 500 items', () => {
      const hugeRuns = Array.from({ length: 500 }, (_, i) =>
        createMockRun({ repeatIndex: i, phase: 'warm', totalMs: 100 + (i % 10) })
      );
      const snap = buildSnapshot({ okRuns: hugeRuns });
      expect(snap.runs).toHaveLength(120);
      expect(snap.warmRuns).toHaveLength(500);
      expect(snap.summary.warmInferenceMean).toBeGreaterThan(0);
    });

    it('handles runs with undefined/null metrics and errors gracefully', () => {
      const errorRun = {
        id: 'err-1',
        isWarmup: false,
        phase: 'warm',
        error: 'CUDA/WebGPU device lost',
        metrics: undefined,
      };
      const okRun = createMockRun({ repeatIndex: 1, phase: 'warm', totalMs: 120 });
      const snap = buildSnapshot({ okRuns: [errorRun, okRun] });

      expect(snap.summary.coldInferenceMean).toBeNull();
      expect(snap.summary.warmInferenceMean).toBe(120);
    });

    it('Tab 5 Export JSON handles case where runs > 0 but okRuns is empty (all failed)', () => {
      const failedRun = { id: 'fail-1', isWarmup: false, phase: 'warm', error: 'Init failed' };
      const payload = buildTab5ExportPayload({
        snapshots: [],
        runs: [failedRun],
        okRuns: [],
      });

      expect(payload).toHaveLength(1);
      expect(payload[0].coldRuns).toEqual([]);
      expect(payload[0].warmRuns).toEqual([]);
      expect(payload[0].summary.coldInferenceMean).toBeNull();
      expect(payload[0].summary.warmInferenceMean).toBeNull();
      expect(payload[0].runs).toEqual([]);
    });

    it('catches malformed JSON on import without throwing unhandled exceptions', () => {
      let caughtError = null;
      try {
        simulateImportJson('{ corrupted json string');
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeInstanceOf(SyntaxError);
    });

    it('handles import of empty object or array without crashing', () => {
      const importedEmptyArray = simulateImportJson('[]');
      expect(importedEmptyArray).toEqual([]);

      const importedEmptyObj = simulateImportJson('{}');
      expect(importedEmptyObj).toHaveLength(1);
      expect(importedEmptyObj[0].coldRuns).toEqual([]);
      expect(importedEmptyObj[0].warmRuns).toEqual([]);
      expect(importedEmptyObj[0].settings.modelKey).toBe('imported');
    });
  });
});

