import {
  fetchDatasetRows, fetchRandomRows, fetchSequentialRows,
  getConfigsAndSplits, normalizeDatasetRow,
} from '@asrjs/speech-recognition/datasets';

export function selectDatasetMetadata(payload, preferredConfig, preferredSplit) {
  const discovered = getConfigsAndSplits(payload);
  const configs = discovered.size ? [...discovered.keys()] : ['default'];
  const config = configs.includes(preferredConfig) ? preferredConfig : configs[0];
  const availableSplits = discovered.get(config) ?? [];
  const splits = availableSplits.length ? availableSplits : ['test'];
  const split = splits.includes(preferredSplit) ? preferredSplit : splits[0];
  return { configs, config, splits, split };
}

export async function fetchBenchmarkSamples({ dataset, config, split, randomize, sampleCount, seed, offset }) {
  const request = { dataset, config, split };
  let result;
  if (randomize) {
    const probe = await fetchDatasetRows({ ...request, offset: 0, length: 1 });
    const totalRows = probe.num_rows_total;
    if (!Number.isSafeInteger(totalRows) || totalRows < 0) {
      throw new Error('Dataset response does not provide a valid total row count for random sampling.');
    }
    if (totalRows === 0) return [];
    result = await fetchRandomRows({ ...request, totalRows, sampleCount, seed });
    if (result.failedOffsets.length) {
      throw new Error(`Could not fetch ${result.failedOffsets.length} selected dataset rows. Retry before benchmarking.`);
    }
  } else {
    result = await fetchSequentialRows({ ...request, startOffset: offset, limit: sampleCount });
  }
  return result.rows.map(normalizeDatasetRow).filter(row => row.audioUrl);
}
