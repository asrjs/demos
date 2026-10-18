import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBenchmarkSamples, selectDatasetMetadata } from './dataset-selection.js';

afterEach(() => vi.unstubAllGlobals());

describe('dataset metadata public Map contract', () => {
  it('preserves an available preferred config and split using the real library', () => {
    expect(selectDatasetMetadata([
      { config: 'default', split: 'test' },
      { config: 'tr', split: 'train' },
      { config: 'tr', split: 'validation' },
    ], 'tr', 'validation')).toEqual({
      configs: ['default', 'tr'], config: 'tr',
      splits: ['train', 'validation'], split: 'validation',
    });
  });

  it('selects available values when stored selections no longer exist', () => {
    expect(selectDatasetMetadata([{ config: 'en', split: 'validation' }], 'missing', 'test'))
      .toEqual({ configs: ['en'], config: 'en', splits: ['validation'], split: 'validation' });
  });

  it('handles an empty metadata response', () => {
    expect(selectDatasetMetadata([], 'missing', 'missing'))
      .toEqual({ configs: ['default'], config: 'default', splits: ['test'], split: 'test' });
  });
});

describe('dataset sampling public request/response contract', () => {
  const base = { dataset: 'example/audio', config: 'en', split: 'test', sampleCount: 3, seed: 42, offset: 4 };
  function installRows(total = 20) {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = new URL(input);
      calls.push(url);
      const offset = Number(url.searchParams.get('offset'));
      const count = Math.min(Number(url.searchParams.get('length')), total - offset);
      const rows = Array.from({ length: Math.max(0, count) }, (_, index) => ({
        row_idx: offset + index, row: { audio: [{ src: `https://audio.invalid/${offset + index}.wav` }], text: `row ${offset + index}` },
      }));
      return new Response(JSON.stringify({ rows, num_rows_total: total }), { status: 200 });
    }));
    return calls;
  }

  it('passes sequential offset and limit and unwraps the real library response', async () => {
    const calls = installRows();
    const rows = await fetchBenchmarkSamples({ ...base, randomize: false });
    expect(rows.map(row => row.rowIndex)).toEqual([4, 5, 6]);
    expect(calls[0].searchParams.get('dataset')).toBe(base.dataset);
    expect(calls[0].searchParams.get('offset')).toBe('4');
    expect(calls[0].searchParams.get('length')).toBe('3');
  });

  it('uses the full row population for seeded sampling, rather than defaulting to row zero', async () => {
    installRows();
    const first = await fetchBenchmarkSamples({ ...base, randomize: true });
    const second = await fetchBenchmarkSamples({ ...base, randomize: true });
    expect(first).toHaveLength(3);
    expect(new Set(first.map(row => row.rowIndex)).size).toBe(3);
    expect(first).toEqual(second);
  });

  it('returns no samples for an empty population', async () => {
    const calls = installRows(0);
    expect(await fetchBenchmarkSamples({ ...base, randomize: true })).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('rejects unknown population instead of silently sampling only row zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rows: [] }))));
    await expect(fetchBenchmarkSamples({ ...base, randomize: true })).rejects.toThrow('total row count');
  });
});
