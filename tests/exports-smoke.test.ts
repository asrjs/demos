import { describe, expect, it } from 'vitest';

import * as api from '../src/index.js';

describe('public exports smoke', () => {
  it('exports primary classes and helpers', () => {
    expect(typeof api.FireRedStreamVad).toBe('function');
    expect(typeof api.FireRedVad).toBe('function');
    expect(typeof api.FireRedAed).toBe('function');
    expect(typeof api.non_stream_vad).toBe('function');
    expect(typeof api.stream_vad_full).toBe('function');
    expect(typeof api.non_stream_aed).toBe('function');
  });
});