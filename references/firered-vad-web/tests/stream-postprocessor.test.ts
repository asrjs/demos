import { describe, expect, it } from 'vitest';

import { StreamVadPostprocessor } from '../src/core/stream-postprocessor.js';

describe('StreamVadPostprocessor', () => {
  it('emits speech start and end with simple thresholds', () => {
    const post = new StreamVadPostprocessor({
      smoothWindowSize: 1,
      speechThreshold: 0.5,
      padStartFrame: 1,
      minSpeechFrame: 2,
      maxSpeechFrame: 200,
      minSilenceFrame: 2,
    });

    const probs = [0.1, 0.8, 0.9, 0.9, 0.1, 0.1];
    const results = probs.map((value) => post.processOneFrame(value));

    expect(results.some((r) => r.is_speech_start)).toBe(true);
    expect(results.some((r) => r.is_speech_end)).toBe(true);
  });
});