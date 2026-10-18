import {
  FireRedAed,
  FireRedStreamVad,
  FireRedVad,
  createFireRedBrowserWorkerClient,
} from '../dist/platform/browser/index.js';

const DEFAULTS = {
  modelDir: 'https://raw.githubusercontent.com/FireRedTeam/FireRedVAD/main/pretrained_models/onnx_models/',
  streamWavUrl: 'https://raw.githubusercontent.com/FireRedTeam/FireRedVAD/main/assets/hello_en.wav',
  vadWavUrl: 'https://raw.githubusercontent.com/FireRedTeam/FireRedVAD/main/assets/hello_zh.wav',
  aedWavUrl: 'https://raw.githubusercontent.com/FireRedTeam/FireRedVAD/main/assets/event.wav',
  runs: 5,
  warmups: 1,
  threads: 1,
};

const modelDirInput = document.getElementById('modelDir');
const streamWavInput = document.getElementById('streamWavUrl');
const vadWavInput = document.getElementById('vadWavUrl');
const aedWavInput = document.getElementById('aedWavUrl');
const runsInput = document.getElementById('runs');
const warmupsInput = document.getElementById('warmups');
const threadsInput = document.getElementById('threads');
const runBtn = document.getElementById('runBtn');
const statusEl = document.getElementById('status');
const resultsBody = document.getElementById('resultsBody');
const jsonOut = document.getElementById('jsonOut');
const downloadBtn = document.getElementById('downloadBtn');

let latestResult = null;

function setDefaults() {
  modelDirInput.value = DEFAULTS.modelDir;
  streamWavInput.value = DEFAULTS.streamWavUrl;
  vadWavInput.value = DEFAULTS.vadWavUrl;
  aedWavInput.value = DEFAULTS.aedWavUrl;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function readPositiveInt(input, fallback) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
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

function parseWavPcm16Mono(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readAscii = (start, len) => {
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += String.fromCharCode(view.getUint8(start + i));
    }
    return out;
  };
  if (readAscii(0, 4) !== 'RIFF' || readAscii(8, 4) !== 'WAVE') {
    throw new Error('Expected RIFF/WAVE PCM16.');
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = -1;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    offset += 8;
    if (id === 'fmt ') {
      const audioFormat = view.getUint16(offset, true);
      channels = view.getUint16(offset + 2, true);
      sampleRate = view.getUint32(offset + 4, true);
      bitsPerSample = view.getUint16(offset + 14, true);
      if (audioFormat !== 1) {
        throw new Error(`Unsupported WAV format ${audioFormat}; PCM required.`);
      }
    } else if (id === 'data') {
      dataOffset = offset;
      dataSize = size;
      break;
    }
    offset += size + (size % 2);
  }
  if (dataOffset < 0 || dataSize <= 0) {
    throw new Error('WAV data chunk missing.');
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Expected 16-bit PCM WAV, got ${bitsPerSample}-bit.`);
  }
  const interleaved = new Int16Array(bytes.buffer, bytes.byteOffset + dataOffset, dataSize / 2);
  if (channels <= 1) {
    return {
      sampleRate,
      pcm16: new Int16Array(interleaved),
      durationSec: interleaved.length / sampleRate,
    };
  }
  const frameCount = Math.floor(interleaved.length / channels);
  const mono = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    mono[i] = interleaved[i * channels];
  }
  return {
    sampleRate,
    pcm16: mono,
    durationSec: mono.length / sampleRate,
  };
}

async function fetchWavAsPcm16(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return parseWavPcm16Mono(arrayBuffer);
}

async function benchmarkCase({ name, durationSec, warmups, runs, fn }) {
  for (let i = 0; i < warmups; i += 1) {
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
    warmups,
    ...summary,
    rtf,
    rtfx,
  };
}

function renderTable(cases) {
  resultsBody.innerHTML = '';
  for (const item of cases) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.audioDurationSec.toFixed(3)}</td>
      <td>${item.meanMs.toFixed(2)}</td>
      <td>${item.p95Ms.toFixed(2)}</td>
      <td>${item.rtf.toFixed(4)}</td>
      <td>${item.rtfx.toFixed(2)}x</td>
    `;
    resultsBody.appendChild(tr);
  }
}

function renderJson(result) {
  jsonOut.textContent = JSON.stringify(result, null, 2);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function runProfile() {
  runBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus('loading models and audio...');

  const modelDir = modelDirInput.value.trim();
  const streamWavUrl = streamWavInput.value.trim();
  const vadWavUrl = vadWavInput.value.trim();
  const aedWavUrl = aedWavInput.value.trim();
  const runs = readPositiveInt(runsInput, DEFAULTS.runs);
  const warmups = readPositiveInt(warmupsInput, DEFAULTS.warmups);
  const wasmNumThreads = readPositiveInt(threadsInput, DEFAULTS.threads);
  const runtimeOptions = {
    wasmNumThreads,
    cacheAssets: true,
  };

  const stream = await FireRedStreamVad.from_pretrained(modelDir, runtimeOptions);
  const vad = await FireRedVad.from_pretrained(modelDir, runtimeOptions);
  const aed = await FireRedAed.from_pretrained(modelDir, runtimeOptions);
  const workerClient = createFireRedBrowserWorkerClient();

  try {
    await workerClient.init({
      modelDir,
      wasmNumThreads,
      cacheAssets: true,
    });

    setStatus('fetching stream wav for worker benchmark...');
    const streamPcm = await fetchWavAsPcm16(streamWavUrl);
    if (streamPcm.sampleRate !== 16000) {
      throw new Error(`Stream WAV must be 16kHz for worker chunk test, got ${streamPcm.sampleRate}.`);
    }

    setStatus('profiling stream-vad.detect_full...');
    let streamDurSec = 0;
    const streamCase = await benchmarkCase({
      name: 'stream-vad.detect_full',
      durationSec: 1,
      warmups,
      runs,
      fn: async () => {
        const [, result] = await stream.detect_full(streamWavUrl);
        streamDurSec = result.dur;
      },
    });
    streamCase.audioDurationSec = streamDurSec;
    streamCase.rtf = (streamCase.meanMs / 1000) / streamDurSec;
    streamCase.rtfx = streamDurSec / (streamCase.meanMs / 1000);

    setStatus('profiling vad.detect...');
    let vadDurSec = 0;
    const vadCase = await benchmarkCase({
      name: 'vad.detect',
      durationSec: 1,
      warmups,
      runs,
      fn: async () => {
        const [result] = await vad.detect(vadWavUrl);
        vadDurSec = result?.dur ?? 0;
      },
    });
    vadCase.audioDurationSec = vadDurSec;
    vadCase.rtf = (vadCase.meanMs / 1000) / vadDurSec;
    vadCase.rtfx = vadDurSec / (vadCase.meanMs / 1000);

    setStatus('profiling aed.detect...');
    let aedDurSec = 0;
    const aedCase = await benchmarkCase({
      name: 'aed.detect',
      durationSec: 1,
      warmups,
      runs,
      fn: async () => {
        const [result] = await aed.detect(aedWavUrl);
        aedDurSec = result.dur;
      },
    });
    aedCase.audioDurationSec = aedDurSec;
    aedCase.rtf = (aedCase.meanMs / 1000) / aedDurSec;
    aedCase.rtfx = aedDurSec / (aedCase.meanMs / 1000);

    setStatus('profiling worker process(10ms chunks)...');
    const workerCase = await benchmarkCase({
      name: 'worker.process(10ms chunks)',
      durationSec: streamPcm.durationSec,
      warmups,
      runs,
      fn: async () => {
        await workerClient.reset();
        const chunkSize = 160;
        for (let i = 0; i < streamPcm.pcm16.length; i += chunkSize) {
          const chunk = streamPcm.pcm16.slice(i, Math.min(i + chunkSize, streamPcm.pcm16.length));
          await workerClient.process(chunk);
        }
      },
    });

    const cases = [streamCase, vadCase, aedCase, workerCase];
    latestResult = {
      generatedAt: new Date().toISOString(),
      mode: 'browser-worker',
      modelDir,
      streamWavUrl,
      vadWavUrl,
      aedWavUrl,
      runs,
      warmups,
      wasmNumThreads,
      cases,
    };

    renderTable(cases);
    renderJson(latestResult);
    downloadBtn.disabled = false;
    setStatus('done');
  } finally {
    await Promise.allSettled([
      stream.dispose(),
      vad.dispose(),
      aed.dispose(),
      workerClient.dispose(),
    ]);
    runBtn.disabled = false;
  }
}

downloadBtn.addEventListener('click', () => {
  if (!latestResult) {
    return;
  }
  downloadJson('browser-rtfx-latest.json', latestResult);
});

runBtn.addEventListener('click', async () => {
  try {
    await runProfile();
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), true);
    runBtn.disabled = false;
  }
});

setDefaults();
renderJson({});
