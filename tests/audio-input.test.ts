import { describe, expect, it } from 'vitest';

import { normalizeAudioInput } from '../src/core/audio-input.js';

describe('normalizeAudioInput', () => {
  it('converts float samples to pcm16', async () => {
    const normalized = await normalizeAudioInput(new Float32Array([0, 0.5, -0.5]));
    expect(normalized.sampleRate).toBe(16000);
    expect(Array.from(normalized.pcm16)).toEqual([0, 16384, -16383]);
  });
});
