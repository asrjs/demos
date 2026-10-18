import { decodeAudioBufferToMonoPcm } from '@asrjs/speech-recognition/browser';
import {
  fetchDatasetSplits,
  fetchRandomRows,
  normalizeDatasetRow,
} from '@asrjs/speech-recognition/datasets';

export const SPEECH_DATASETS = {
  en: {
    displayName: 'English',
    dataset: 'MLCommons/peoples_speech',
    config: 'clean',
    split: 'test',
  },
  fr: {
    displayName: 'French',
    dataset: 'facebook/multilingual_librispeech',
    config: 'french',
    split: 'test',
  },
  de: {
    displayName: 'German',
    dataset: 'facebook/multilingual_librispeech',
    config: 'german',
    split: 'test',
  },
  es: {
    displayName: 'Spanish',
    dataset: 'facebook/multilingual_librispeech',
    config: 'spanish',
    split: 'test',
  },
  it: {
    displayName: 'Italian',
    dataset: 'facebook/multilingual_librispeech',
    config: 'italian',
    split: 'test',
  },
  pt: {
    displayName: 'Portuguese',
    dataset: 'facebook/multilingual_librispeech',
    config: 'portuguese',
    split: 'test',
  },
  nl: {
    displayName: 'Dutch',
    dataset: 'facebook/multilingual_librispeech',
    config: 'dutch',
    split: 'test',
  },
  pl: {
    displayName: 'Polish',
    dataset: 'facebook/multilingual_librispeech',
    config: 'polish',
    split: 'test',
  },
};

function getDatasetConfig(langCode) {
  return SPEECH_DATASETS[langCode?.toLowerCase()] || null;
}

function getDatasetTotalRows(splits, config) {
  const splitInfo = splits.find(
    (entry) => entry.config === config.config && entry.split === config.split,
  );
  const totalRows = Number(splitInfo?.num_examples);
  return Number.isFinite(totalRows) && totalRows > 0 ? totalRows : 100;
}

export function hasTestSamples(langCode) {
  return Boolean(getDatasetConfig(langCode));
}

export async function fetchRandomSample(langCode, options = {}) {
  const config = getDatasetConfig(langCode);
  if (!config) {
    throw new Error(`No test dataset available for language: ${langCode}`);
  }

  const { targetSampleRate = 16000, onProgress } = options;

  onProgress?.({ stage: 'fetching_metadata', message: 'Fetching dataset...' });

  const splits = await fetchDatasetSplits(config.dataset);
  const totalRows = getDatasetTotalRows(splits, config);
  const selection = await fetchRandomRows({
    dataset: config.dataset,
    config: config.config,
    split: config.split,
    totalRows,
    sampleCount: 1,
  });

  const rowWrapper = selection.rows[0];
  if (!rowWrapper) {
    throw new Error('No data returned from dataset API');
  }

  const sample = normalizeDatasetRow(rowWrapper, selection.offsets[0] ?? 0);
  if (!sample.audioUrl) {
    throw new Error('No audio URL in dataset response');
  }

  onProgress?.({ stage: 'downloading_audio', message: 'Downloading audio...' });

  const audioRes = await fetch(sample.audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Audio download failed: ${audioRes.status}`);
  }

  const audioBuffer = await audioRes.arrayBuffer();
  const sourceMimeType = audioRes.headers.get('content-type') || 'application/octet-stream';
  let sourceFilename = 'sample.bin';
  try {
    const pathname = new URL(sample.audioUrl).pathname;
    const basename = pathname.split('/').pop();
    if (basename) {
      sourceFilename = basename;
    }
  } catch {
    // Keep fallback filename when the dataset URL cannot be parsed.
  }

  onProgress?.({ stage: 'decoding_audio', message: 'Decoding audio...' });

  const decoded = await decodeAudioBufferToMonoPcm(audioBuffer.slice(0), {
    targetSampleRate,
  });

  onProgress?.({ stage: 'complete', message: 'Ready' });

  return {
    audioBuffer,
    pcm: decoded.pcm,
    transcription: sample.referenceText,
    duration: decoded.durationSec,
    sampleIndex: sample.rowIndex,
    dataset: config.dataset,
    language: langCode,
    sourceAudioUrl: sample.audioUrl,
    sourceFilename,
    sourceMimeType,
  };
}

export function getAvailableLanguages() {
  return Object.entries(SPEECH_DATASETS).map(([code, config]) => ({
    code,
    displayName: config.displayName,
  }));
}
