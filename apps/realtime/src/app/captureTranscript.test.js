import { describe, expect, it } from 'vitest';
import { createCaptureTranscript } from './captureTranscript.js';

describe('capture transcript ownership', () => {
  it('replaces a revised hypothesis without duplicating its prefix', () => {
    const capture = createCaptureTranscript('Earlier recording.');
    expect(capture.update('ask', { id: 'a', revision: 1 })).toBe('Earlier recording. ask');
    expect(capture.update('ask what you can do', { id: 'a', revision: 2 })).toBe('Earlier recording. ask what you can do');
    expect(capture.update('next turn', { id: 'b', revision: 1 })).toBe('Earlier recording. ask what you can do next turn');
  });
  it('allows corrections and empty replacements, rejects stale revisions', () => {
    const capture = createCaptureTranscript();
    capture.update('wrong', { id: 'a', revision: 1 });
    expect(capture.update('', { id: 'a', revision: 2 })).toBe('');
    expect(capture.update('stale', { id: 'a', revision: 1 })).toBe('');
    expect(capture.update('correct', { id: 'a', revision: 3 })).toBe('correct');
  });
  it('preserves intentional repeated words across distinct contexts and recordings', () => {
    const capture = createCaptureTranscript();
    capture.update('yes yes', { id: 'a', revision: 1 });
    expect(capture.update('yes', { id: 'b', revision: 1 })).toBe('yes yes yes');
    expect(capture.update('yes')).toBe('yes yes yes yes');
    expect(createCaptureTranscript().text()).toBe('');
  });
});
