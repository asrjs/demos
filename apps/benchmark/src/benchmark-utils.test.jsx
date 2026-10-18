import { describe, expect, it } from 'vitest';
import { resolveEffectiveRepeatCount } from './benchmark-utils.jsx';

describe('long-audio benchmark progress count', () => {
  it('includes boosted repeats only for audio at or above the threshold', () => {
    const options = { enabled: true, thresholdSec: 30, multiplier: 2 };
    expect(resolveEffectiveRepeatCount(3, 29.99, options)).toBe(3);
    expect(resolveEffectiveRepeatCount(3, 30, options)).toBe(6);
  });

  it('counts whole iterations when persisted repeat settings are fractional', () => {
    expect(resolveEffectiveRepeatCount(1.5, 60, {
      enabled: true,
      thresholdSec: 30,
      multiplier: 2,
    })).toBe(3);
  });
});
