import { describe, expect, it } from 'vitest';
import { StreamingSpeechDetector } from './detector.js';

function createChunk(length, amplitude) {
  const chunk = new Float32Array(length);
  chunk.fill(amplitude);
  return chunk;
}

class FakeTenVad {
  constructor(behavior = {}) {
    this.behavior = behavior;
    this.listeners = new Set();
    this.status = {
      state: behavior.failInit ? 'idle' : 'ready',
      error: null,
      probability: 0,
      speaking: false,
      threshold: 0.5,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async init() {
    if (this.behavior.failInit) {
      this.status = {
        ...this.status,
        state: 'degraded',
        error: 'boom',
      };
      throw new Error('boom');
    }
  }

  async reset() {}

  async dispose() {}

  updateConfig() {}

  process() {}

  getStatus() {
    return this.status;
  }

  findFirstSpeechFrame(startFrame) {
    return this.behavior.startFrame ?? null;
  }

  getWindowSummary() {
    return {
      totalHops: this.behavior.hasRecentSpeech ? 4 : 0,
      speechHopCount: this.behavior.hasRecentSpeech ? 4 : 0,
      nonSpeechHopCount: this.behavior.hasRecentSpeech ? 0 : 4,
      maxConsecutiveSpeech: this.behavior.hasRecentSpeech ? 4 : 0,
      maxProbability: this.behavior.hasRecentSpeech ? 0.8 : 0,
      recent: [],
    };
  }

  hasRecentSpeech() {
    return this.behavior.hasRecentSpeech ?? false;
  }

  hasRecentSilence() {
    return this.behavior.hasRecentSilence ?? true;
  }
}

describe('StreamingSpeechDetector', () => {
  it('splits long speech at the configured max duration', async () => {
    const detector = new StreamingSpeechDetector({
      profileId: 'generic-streaming',
      config: {
        analysisWindowMs: 20,
        minSpeechDurationMs: 20,
        minSilenceDurationMs: 200,
        maxSegmentDurationMs: 60,
        tenVadEnabled: false,
      },
    });

    const events = [];
    detector.subscribe((event) => events.push(event));
    await detector.start({ sampleRate: 16000 });

    detector.processChunk(createChunk(320, 0.05), { startFrame: 0 });
    detector.processChunk(createChunk(320, 0.05), { startFrame: 320 });
    detector.processChunk(createChunk(320, 0.05), { startFrame: 640 });

    const segmentEvent = events.find((event) => event.type === 'segment-ready');
    expect(segmentEvent).toBeTruthy();
    expect(segmentEvent.payload.reason).toBe('max-duration');
  });

  it('falls back to rough-gate segmentation when TEN-VAD init fails', async () => {
    const detector = new StreamingSpeechDetector({
      profileId: 'generic-streaming',
      config: {
        analysisWindowMs: 20,
        energySmoothingWindows: 1,
        minSpeechDurationMs: 20,
        minSilenceDurationMs: 40,
      },
      tenVadFactory: () => new FakeTenVad({ failInit: true }),
    });

    const events = [];
    detector.subscribe((event) => events.push(event));
    await detector.start({ sampleRate: 16000 });

    detector.processChunk(createChunk(320, 0.05), { startFrame: 0 });
    detector.processChunk(createChunk(320, 0.001), { startFrame: 320 });
    detector.processChunk(createChunk(320, 0.001), { startFrame: 640 });
    detector.processChunk(createChunk(320, 0.001), { startFrame: 960 });

    const snapshot = detector.getSnapshot();
    expect(snapshot.tenVad.state).toBe('degraded');
    expect(events.some((event) => event.type === 'segment-ready')).toBe(true);
  });

  it('holds rough onset as a candidate until TEN-VAD confirms speech', async () => {
    let confirmed = false;
    const detector = new StreamingSpeechDetector({
      profileId: 'generic-streaming',
      config: {
        analysisWindowMs: 20,
        minSpeechDurationMs: 20,
        minSilenceDurationMs: 40,
      },
      tenVadFactory: () =>
        new FakeTenVad({
          startFrame: null,
          get hasRecentSpeech() {
            return confirmed;
          },
        }),
    });

    await detector.start({ sampleRate: 16000 });
    detector.processChunk(createChunk(320, 0.05), { startFrame: 0 });

    let snapshot = detector.getSnapshot();
    expect(snapshot.activeSegment).toBeNull();
    expect(snapshot.pendingSegmentStartFrame).not.toBeNull();

    confirmed = true;
    detector.processChunk(createChunk(320, 0.05), { startFrame: 320 });
    snapshot = detector.getSnapshot();

    expect(snapshot.activeSegment).not.toBeNull();
    expect(snapshot.pendingSegmentStartFrame).toBeNull();
  });
});
