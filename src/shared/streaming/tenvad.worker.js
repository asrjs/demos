/* eslint-disable no-restricted-globals */

let moduleInstance = null;
let vadHandle = 0;
let hopSize = 256;
let threshold = 0.5;
let audioPtr = 0;
let probPtr = 0;
let flagPtr = 0;
let handlePtr = 0;
let accumulator = null;
let accumulatorPos = 0;

self.onmessage = async (event) => {
  const message = event.data;

  try {
    switch (message.type) {
      case 'INIT':
        await handleInit(message.id, message.payload ?? {});
        break;
      case 'PROCESS':
        handleProcess(
          message.payload?.samples ?? new Float32Array(0),
          message.payload?.globalSampleOffset ?? 0,
        );
        break;
      case 'RESET':
        handleReset(message.id);
        break;
      case 'DISPOSE':
        handleDispose(message.id);
        break;
      default:
        break;
    }
  } catch (error) {
    respond({
      type: 'ERROR',
      id: message.id ?? 0,
      payload: String(error instanceof Error ? error.message : error),
    });
  }
};

async function handleInit(id, config) {
  hopSize = config.hopSize || 256;
  threshold = config.threshold || 0.5;
  const wasmPath = config.wasmPath || '/wasm/';
  const wasmUrl = new URL(`${wasmPath}ten_vad.js`, self.location.origin).href;
  const response = await fetch(wasmUrl);
  const jsText = await response.text();
  const blobUrl = URL.createObjectURL(
    new Blob([jsText], { type: 'application/javascript' }),
  );

  try {
    const { default: createVADModule } = await import(/* @vite-ignore */ blobUrl);
    moduleInstance = await createVADModule({
      locateFile(file) {
        if (file.endsWith('.wasm')) {
          return new URL(`${wasmPath}${file}`, self.location.origin).href;
        }
        return file;
      },
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  handlePtr = moduleInstance._malloc(4);
  audioPtr = moduleInstance._malloc(hopSize * 2);
  probPtr = moduleInstance._malloc(4);
  flagPtr = moduleInstance._malloc(4);

  const createStatus = moduleInstance._ten_vad_create(handlePtr, hopSize, threshold);
  if (createStatus !== 0) {
    throw new Error(`ten_vad_create failed with code ${createStatus}`);
  }
  vadHandle = moduleInstance.HEAP32[handlePtr >> 2];

  const versionPtr = moduleInstance._ten_vad_get_version();
  const version = moduleInstance.UTF8ToString
    ? moduleInstance.UTF8ToString(versionPtr)
    : `ptr@${versionPtr}`;

  accumulator = new Float32Array(hopSize);
  accumulatorPos = 0;

  respond({ type: 'INIT', id, payload: { success: true, version } });
}

function handleProcess(samples, globalSampleOffset) {
  if (!moduleInstance || !vadHandle || !accumulator) return;

  const maxHops = Math.ceil((samples.length + accumulatorPos) / hopSize);
  const probabilities = new Float32Array(maxHops);
  const flags = new Uint8Array(maxHops);
  let hopCount = 0;
  let sampleIndex = 0;
  let firstResultOffset = globalSampleOffset;
  let resultStartSet = false;

  while (sampleIndex < samples.length) {
    while (accumulatorPos < hopSize && sampleIndex < samples.length) {
      accumulator[accumulatorPos++] = samples[sampleIndex++];
    }

    if (accumulatorPos >= hopSize) {
      if (!resultStartSet) {
        firstResultOffset = globalSampleOffset + sampleIndex - hopSize;
        resultStartSet = true;
      }

      for (let index = 0; index < hopSize; index += 1) {
        const clamped = Math.max(-1, Math.min(1, accumulator[index]));
        moduleInstance.HEAP16[(audioPtr >> 1) + index] = Math.round(clamped * 32767);
      }

      const processStatus = moduleInstance._ten_vad_process(
        vadHandle,
        audioPtr,
        hopSize,
        probPtr,
        flagPtr,
      );

      if (processStatus === 0) {
        probabilities[hopCount] = moduleInstance.HEAPF32[probPtr >> 2];
        flags[hopCount] = moduleInstance.HEAP32[flagPtr >> 2];
        hopCount += 1;
      }

      accumulatorPos = 0;
    }
  }

  if (hopCount > 0) {
    const trimmedProbabilities = probabilities.slice(0, hopCount);
    const trimmedFlags = flags.slice(0, hopCount);
    self.postMessage(
      {
        type: 'RESULT',
        payload: {
          probabilities: trimmedProbabilities,
          flags: trimmedFlags,
          globalSampleOffset: firstResultOffset,
          hopCount,
        },
      },
      [trimmedProbabilities.buffer, trimmedFlags.buffer],
    );
  }
}

function handleReset(id) {
  if (accumulator) {
    accumulator.fill(0);
    accumulatorPos = 0;
  }

  if (moduleInstance && vadHandle) {
    moduleInstance._ten_vad_destroy(handlePtr);
    const createStatus = moduleInstance._ten_vad_create(handlePtr, hopSize, threshold);
    if (createStatus === 0) {
      vadHandle = moduleInstance.HEAP32[handlePtr >> 2];
    }
  }

  respond({ type: 'RESET', id, payload: { success: true } });
}

function handleDispose(id) {
  if (moduleInstance && vadHandle) {
    moduleInstance._ten_vad_destroy(handlePtr);
    moduleInstance._free(audioPtr);
    moduleInstance._free(probPtr);
    moduleInstance._free(flagPtr);
    moduleInstance._free(handlePtr);
  }

  moduleInstance = null;
  vadHandle = 0;
  accumulator = null;
  respond({ type: 'DISPOSE', id, payload: { success: true } });
}

function respond(message) {
  self.postMessage(message);
}
