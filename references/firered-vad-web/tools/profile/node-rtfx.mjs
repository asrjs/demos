#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  FireRedAed,
  FireRedStreamVad,
  FireRedVad,
  FireredVadStreamPacked,
} from '../../dist/index.js';

function getEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sortedValues[lo];
  }
  const t = idx - lo;
  return sortedValues[lo] * (1 - t) + sortedValues[hi] * t;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: mean,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

function readWavPcm16Mono(wavPath) {
  const buffer = fs.readFileSync(wavPath);
  if (buffer.length < 44) {
    throw new Error(`Invalid WAV: file too small (${wavPath})`);
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Invalid WAV header: ${wavPath}`);
  }

  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > buffer.length) {
      break;
    }
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(bodyStart),
        channels: buffer.readUInt16LE(bodyStart + 2),
        sampleRate: buffer.readUInt32LE(bodyStart + 4),
        bitsPerSample: buffer.readUInt16LE(bodyStart + 14),
      };
    } else if (id === 'data') {
      data = buffer.subarray(bodyStart, bodyEnd);
    }
    offset = bodyEnd + (size % 2);
  }

  if (!fmt || !data) {
    throw new Error(`WAV missing fmt/data chunk: ${wavPath}`);
  }
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(
      `WAV must be PCM16. Got format=${fmt.audioFormat}, bits=${fmt.bitsPerSample} (${wavPath})`,
    );
  }
  const allSamples = new Int16Array(
    data.buffer,
    data.byteOffset,
    Math.floor(data.byteLength / 2),
  );
  if (fmt.channels <= 1) {
    return {
      sampleRate: fmt.sampleRate,
      pcm16: new Int16Array(allSamples),
      durationSec: allSamples.length / fmt.sampleRate,
    };
  }

  const frameCount = Math.floor(allSamples.length / fmt.channels);
  const mono = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    mono[i] = allSamples[i * fmt.channels];
  }
  return {
    sampleRate: fmt.sampleRate,
    pcm16: mono,
    durationSec: mono.length / fmt.sampleRate,
  };
}

async function benchmarkCase({ name, durationSec, warmupRuns, runs, fn }) {
  for (let i = 0; i < warmupRuns; i += 1) {
    await fn();
  }

  const elapsedMs = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    await fn();
    const t1 = performance.now();
    elapsedMs.push(t1 - t0);
  }

  const summary = summarize(elapsedMs);
  const meanSec = summary.meanMs / 1000;
  const rtf = durationSec > 0 ? meanSec / durationSec : 0;
  const rtfx = durationSec > 0 && meanSec > 0 ? durationSec / meanSec : 0;
  return {
    name,
    audioDurationSec: durationSec,
    runs,
    warmupRuns,
    ...summary,
    rtf,
    rtfx,
  };
}

function formatCaseRow(item) {
  return {
    case: item.name,
    audioSec: item.audioDurationSec.toFixed(3),
    meanMs: item.meanMs.toFixed(2),
    p95Ms: item.p95Ms.toFixed(2),
    rtf: item.rtf.toFixed(4),
    rtfx: `${item.rtfx.toFixed(2)}x`,
  };
}

async function run() {
  const fireredRoot = process.env.FIRERED_ROOT || 'N:/github/FireRedVAD';
  const modelDir =
    process.env.FIRERED_ONNX_DIR || path.join(fireredRoot, 'pretrained_models', 'onnx_models');
  const assetsDir = process.env.FIRERED_ASSETS_DIR || path.join(fireredRoot, 'assets');
  const warmupRuns = Math.max(1, Math.floor(getEnvNumber('PROFILE_WARMUP_RUNS', 1)));
  const runs = Math.max(1, Math.floor(getEnvNumber('PROFILE_RUNS', 5)));
  const wasmNumThreads = Math.max(1, Math.floor(getEnvNumber('PROFILE_WASM_THREADS', 1)));

  const streamWav = path.join(assetsDir, 'hello_en.wav');
  const vadWav = path.join(assetsDir, 'hello_zh.wav');
  const aedWav = path.join(assetsDir, 'event.wav');
  const packedWav = streamWav;
  const packedAudio = readWavPcm16Mono(packedWav);
  if (packedAudio.sampleRate !== 16000) {
    throw new Error(
      `Packed stream benchmark expects 16kHz wav, got ${packedAudio.sampleRate} (${packedWav})`,
    );
  }

  const commonRuntime = {
    wasmNumThreads,
    cacheAssets: false,
  };

  const stream = await FireRedStreamVad.from_pretrained(modelDir, commonRuntime);
  const vad = await FireRedVad.from_pretrained(modelDir, commonRuntime);
  const aed = await FireRedAed.from_pretrained(modelDir, commonRuntime);
  const packed = await FireredVadStreamPacked.create({
    ...commonRuntime,
    modelUrl: path.join(modelDir, 'fireredvad_stream_vad_with_cache.onnx'),
  });

  try {
    const init = {
      generatedAt: new Date().toISOString(),
      fireredRoot,
      modelDir,
      assetsDir,
      runs,
      warmupRuns,
      wasmNumThreads,
    };

    let streamDurSec = 0;
    const streamCase = await benchmarkCase({
      name: 'stream-vad.detect_full',
      warmupRuns,
      runs,
      durationSec: 1,
      fn: async () => {
        const [, result] = await stream.detect_full(streamWav);
        streamDurSec = result.dur;
      },
    });
    streamCase.audioDurationSec = streamDurSec;
    streamCase.rtf = (streamCase.meanMs / 1000) / streamDurSec;
    streamCase.rtfx = streamDurSec / (streamCase.meanMs / 1000);

    let vadDurSec = 0;
    const vadCase = await benchmarkCase({
      name: 'vad.detect',
      warmupRuns,
      runs,
      durationSec: 1,
      fn: async () => {
        const [result] = await vad.detect(vadWav);
        vadDurSec = result?.dur ?? 0;
      },
    });
    vadCase.audioDurationSec = vadDurSec;
    vadCase.rtf = (vadCase.meanMs / 1000) / vadDurSec;
    vadCase.rtfx = vadDurSec / (vadCase.meanMs / 1000);

    let aedDurSec = 0;
    const aedCase = await benchmarkCase({
      name: 'aed.detect',
      warmupRuns,
      runs,
      durationSec: 1,
      fn: async () => {
        const [result] = await aed.detect(aedWav);
        aedDurSec = result.dur;
      },
    });
    aedCase.audioDurationSec = aedDurSec;
    aedCase.rtf = (aedCase.meanMs / 1000) / aedDurSec;
    aedCase.rtfx = aedDurSec / (aedCase.meanMs / 1000);

    const packedCase = await benchmarkCase({
      name: 'packed-stream.process_stream(10ms chunks)',
      warmupRuns,
      runs,
      durationSec: packedAudio.durationSec,
      fn: async () => {
        packed.reset();
        const chunkSize = 160;
        for (let i = 0; i < packedAudio.pcm16.length; i += chunkSize) {
          const chunk = packedAudio.pcm16.subarray(i, Math.min(i + chunkSize, packedAudio.pcm16.length));
          await packed.process_stream(chunk);
        }
      },
    });

    const cases = [streamCase, vadCase, aedCase, packedCase];
    const out = {
      ...init,
      cases,
    };

    const outDir = path.resolve('tools/profile/out');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'node-rtfx-latest.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

    console.log('\nFireRed VAD/AED Node WASM profiling (RTF/RTFx)');
    console.table(cases.map(formatCaseRow));
    console.log(`\nSaved JSON report: ${outPath}`);
  } finally {
    await Promise.all([stream.dispose(), vad.dispose(), aed.dispose(), packed.dispose()]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
