import { describe, expect, it } from 'vitest';
import { resolveEnergyGateNote, resolveEnergyGateState } from './SignalMeter.jsx';

describe('SignalMeter energy gate labels', () => {
  it('keeps the meter active while speech is latched through short energy dips', () => {
    expect(resolveEnergyGateState({ isSpeech: true, energyPass: false })).toBe('active');
    expect(resolveEnergyGateNote({ isSpeech: true, energyPass: false })).toBe('latched');
  });

  it('shows candidate before speech is fully active', () => {
    expect(resolveEnergyGateState({ isSpeech: false, energyPass: true })).toBe('candidate');
    expect(resolveEnergyGateNote({ isSpeech: false, energyPass: true, candidateReason: 'energy-threshold' })).toBe(
      'energy-threshold',
    );
  });
});
