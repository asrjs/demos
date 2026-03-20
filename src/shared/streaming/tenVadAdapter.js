const DEFAULT_TEN_VAD_CONFIG = {
  hopSize: 256,
  threshold: 0.5,
  confirmationWindowMs: 192,
  hangoverMs: 320,
  minSpeechHops: 4,
  minSpeechRatio: 0.5,
  minSilenceHops: 5,
  wasmPath: '/wasm/',
};

function defaultWorkerFactory() {
  return new Worker(new URL('./tenvad.worker.js', import.meta.url), {
    type: 'module',
  });
}

export class TenVadAdapter {
  constructor(config = {}, options = {}) {
    this.config = {
      ...DEFAULT_TEN_VAD_CONFIG,
      ...config,
    };
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.now = options.now ?? (() => Date.now());
    this.worker = null;
    this.messageId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.status = 'idle';
    this.lastError = null;
    this.recentResults = [];
    this.latestProbability = 0;
    this.latestSpeaking = false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(payload) {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  async init() {
    if (this.worker) {
      return;
    }

    this.status = 'initializing';
    this.worker = this.workerFactory();
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      const message = event?.message || 'TEN-VAD worker error';
      this.fail(new Error(message));
    };

    try {
      await this.sendRequest('INIT', {
        hopSize: this.config.hopSize,
        threshold: this.config.threshold,
        wasmPath: this.config.wasmPath,
      });
      this.status = 'ready';
      this.lastError = null;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  fail(error) {
    this.status = 'degraded';
    this.lastError = error instanceof Error ? error : new Error(String(error));
    for (const [, pending] of this.pending) {
      pending.reject(this.lastError);
    }
    this.pending.clear();
  }

  handleMessage(message) {
    if (message.type === 'RESULT') {
      this.recordResult(message.payload);
      this.emit({
        type: 'result',
        payload: message.payload,
      });
      return;
    }

    if (message.type === 'ERROR') {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        pending.reject(new Error(message.payload));
      }
      this.fail(new Error(message.payload));
      return;
    }

    const pending = this.pending.get(message.id);
    if (pending) {
      this.pending.delete(message.id);
      pending.resolve(message.payload);
    }
  }

  recordResult(result) {
    const hopSize = this.config.hopSize;
    for (let index = 0; index < result.hopCount; index += 1) {
      const startFrame = result.globalSampleOffset + index * hopSize;
      const endFrame = startFrame + hopSize;
      const probability = result.probabilities[index];
      const speaking = result.flags[index] === 1;

      this.recentResults.push({
        startFrame,
        endFrame,
        probability,
        speaking,
        createdAt: this.now(),
      });
      this.latestProbability = probability;
      this.latestSpeaking = speaking;
    }

    const maxAgeMs = Math.max(this.config.hangoverMs * 8, 5000);
    const cutoff = this.now() - maxAgeMs;
    this.recentResults = this.recentResults.filter((entry) => entry.createdAt >= cutoff);
  }

  process(samples, globalSampleOffset) {
    if (this.status !== 'ready' || !this.worker) {
      return false;
    }

    const copy = new Float32Array(samples);
    this.worker.postMessage(
      {
        type: 'PROCESS',
        payload: {
          samples: copy,
          globalSampleOffset,
        },
      },
      [copy.buffer],
    );
    return true;
  }

  async reset() {
    this.recentResults = [];
    this.latestProbability = 0;
    this.latestSpeaking = false;

    if (this.worker && this.status === 'ready') {
      await this.sendRequest('RESET', {});
    }
  }

  async dispose() {
    if (this.worker && this.status === 'ready') {
      try {
        await this.sendRequest('DISPOSE', {});
      } catch {
        // ignore dispose failures
      }
    }
    if (this.worker) {
      this.worker.terminate();
    }
    this.worker = null;
    this.status = 'idle';
  }

  updateConfig(config = {}) {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  getStatus() {
    return {
      state: this.status,
      error: this.lastError?.message ?? null,
      probability: this.latestProbability,
      speaking: this.latestSpeaking,
      threshold: this.config.threshold,
    };
  }

  findFirstSpeechFrame(startFrame, endFrame) {
    const recent = this.recentResults.filter(
      (entry) => entry.endFrame >= startFrame && entry.startFrame <= endFrame,
    );
    let runLength = 0;
    let runStart = null;
    for (const entry of recent) {
      if (entry.speaking) {
        if (runStart === null) {
          runStart = entry.startFrame;
          runLength = 1;
        } else {
          runLength += 1;
        }

        if (runLength >= this.config.minSpeechHops) {
          return runStart;
        }
      } else {
        runStart = null;
        runLength = 0;
      }
    }

    return null;
  }

  hasRecentSpeech(endFrame, windowMs, sampleRate) {
    const summary = this.getWindowSummary(endFrame, windowMs, sampleRate);
    const speechRatio =
      summary.totalHops > 0 ? summary.speechHopCount / summary.totalHops : 0;
    return (
      summary.speechHopCount >= this.config.minSpeechHops &&
      summary.maxConsecutiveSpeech >= this.config.minSpeechHops &&
      summary.maxProbability >= this.config.threshold &&
      speechRatio >= this.config.minSpeechRatio
    );
  }

  hasRecentSilence(endFrame, windowMs, sampleRate) {
    const summary = this.getWindowSummary(endFrame, windowMs, sampleRate);
    if (summary.totalHops < this.config.minSilenceHops) {
      return false;
    }
    return summary.nonSpeechHopCount >= this.config.minSilenceHops;
  }

  getWindowSummary(endFrame, windowMs, sampleRate) {
    const windowFrames = Math.ceil((windowMs / 1000) * sampleRate);
    const startFrame = Math.max(0, endFrame - windowFrames);
    const recent = this.recentResults.filter(
      (entry) => entry.endFrame >= startFrame && entry.startFrame <= endFrame,
    );

    let speechHopCount = 0;
    let nonSpeechHopCount = 0;
    let maxConsecutiveSpeech = 0;
    let consecutiveSpeech = 0;
    let maxProbability = 0;

    for (const entry of recent) {
      if (entry.speaking) {
        speechHopCount += 1;
        consecutiveSpeech += 1;
        maxConsecutiveSpeech = Math.max(maxConsecutiveSpeech, consecutiveSpeech);
      } else {
        nonSpeechHopCount += 1;
        consecutiveSpeech = 0;
      }
      maxProbability = Math.max(maxProbability, entry.probability ?? 0);
    }

    return {
      totalHops: recent.length,
      speechHopCount,
      nonSpeechHopCount,
      maxConsecutiveSpeech,
      maxProbability,
      recent,
    };
  }

  sendRequest(type, payload) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, payload, id });
    });
  }
}
