import { describe, expect, it } from 'vitest';

import { VadPostprocessor } from '../src/core/vad-postprocessor.js';

describe('VadPostprocessor', () => {
  it('creates segments from probability sequence', () => {
    const post = new VadPostprocessor({
      smoothWindowSize: 1,
      probThreshold: 0.5,
      minSpeechFrame: 1,
      maxSpeechFrame: 200,
      minSilenceFrame: 1,
      mergeSilenceFrame: 0,
      extendSpeechFrame: 0,
    });

    const decisions = post.process([0.1, 0.8, 0.9, 0.1]);
    const segments = post.decisionToSegment(decisions, 0.5);

    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0]![0]).toBeGreaterThanOrEqual(0);
  });
});
