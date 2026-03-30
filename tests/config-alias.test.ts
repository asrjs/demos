import { describe, expect, it } from 'vitest';

import { normalizeStreamVadConfig, normalizeVadConfig } from '../src/core/config.js';
import { ConfigAliasConflictError } from '../src/core/errors.js';

describe('config alias normalization', () => {
  it('throws on conflicting snake_case and camelCase values', () => {
    expect(() =>
      normalizeVadConfig({
        speech_threshold: 0.4,
        speechThreshold: 0.5,
      }),
    ).toThrow(ConfigAliasConflictError);
  });

  it('accepts identical snake_case and camelCase values', () => {
    const config = normalizeVadConfig({
      speech_threshold: 0.4,
      speechThreshold: 0.4,
    });
    expect(config.speech_threshold).toBe(0.4);
  });

  it('normalizes stream defaults', () => {
    const config = normalizeStreamVadConfig({});
    expect(config.smooth_window_size).toBe(5);
    expect(config.min_speech_frame).toBe(8);
  });
});