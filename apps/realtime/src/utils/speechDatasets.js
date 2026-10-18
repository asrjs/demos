import { decodeAudioBufferToMonoPcm } from '@asrjs/speech-recognition/browser';

export const SPEECH_DATASETS = {
  en: {
    displayName: 'English',
    dataset: 'MLCommons/peoples_speech',
    config: 'clean',
    split: 'test',
    textField: 'text',
  },
  fr: {
    displayName: 'French',
    dataset: 'facebook/multilingual_librispeech',
    config: 'french',
    split: 'test',
    textField: 'transcript',
  },
  de: { 
    displayName: 'German', 
    dataset: 'facebook/multilingual_librispeech',
    config: 'german',
    split: 'test',
    textField: 'transcript',
  },
  es: { 
    displayName: 'Spanish', 
    dataset: 'facebook/multilingual_librispeech',
    config: 'spanish',
    split: 'test',
    textField: 'transcript',
  },
  it: { 
    displayName: 'Italian', 
    dataset: 'facebook/multilingual_librispeech',
    config: 'italian',
    split: 'test',
    textField: 'transcript',
  },
  pt: { 
    displayName: 'Portuguese', 
    dataset: 'facebook/multilingual_librispeech',
    config: 'portuguese',
    split: 'test',
    textField: 'transcript',
  },
  nl: { 
    displayName: 'Dutch', 
    dataset: 'facebook/multilingual_librispeech',
    config: 'dutch',
    split: 'test',
    textField: 'transcript',
  },
  pl: { 
    displayName: 'Polish', 
    dataset: 'facebook/multilingual_librispeech',
    config: 'polish',
    split: 'test',
    textField: 'transcript',
  },
};

export function hasTestSamples(langCode) {
  return !!SPEECH_DATASETS[langCode?.toLowerCase()];
}

export function getDatasetUrl(langCode) {
  const config = SPEECH_DATASETS[langCode?.toLowerCase()];
  if (!config) return null;

  const url = `https://datasets-server.huggingface.co/first-rows?dataset=${config.dataset}&config=${config.config}&split=${config.split}`;

  return {
    url,
    textField: config.textField,
    dataset: config.dataset,
    displayName: config.displayName,
  };
}

export async function fetchDatasetRows(langCode) {
  const datasetInfo = getDatasetUrl(langCode);
  if (!datasetInfo) {
    throw new Error(`No test dataset available for language: ${langCode}`);
  }

  const response = await fetch(datasetInfo.url);
  if (!response.ok) {
    throw new Error(`Dataset API error: ${response.status}`);
  }
  
  const data = await response.json();
  const rows = data.rows || [];

  if (rows.length === 0) {
    throw new Error('No data returned from dataset API');
  }

  return rows.map((r) => ({
    ...(r.row || r),
    _textField: datasetInfo.textField,
    _dataset: datasetInfo.dataset,
  }));
}

export async function fetchRandomSample(langCode, options = {}) {
  const { targetSampleRate = 16000, onProgress } = options;

  onProgress?.({ stage: 'fetching_metadata', message: 'Fetching dataset...' });

  const rows = await fetchDatasetRows(langCode);

  // Pick a random row
  const randomIndex = Math.floor(Math.random() * rows.length);
  const row = rows[randomIndex];

  // Get the audio URL and transcription
  const audio = row.audio;
  const audioUrl = Array.isArray(audio) ? audio[0]?.src : audio?.src;
  const transcription = row[row._textField] || '';

  if (!audioUrl) {
    throw new Error('No audio URL in dataset response');
  }

  onProgress?.({ stage: 'downloading_audio', message: 'Downloading audio...' });

  // Fetch the audio
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Audio download failed: ${audioRes.status}`);
  }

  const audioBuffer = await audioRes.arrayBuffer();
  const sourceMimeType = audioRes.headers.get('content-type') || 'application/octet-stream';
  let sourceFilename = 'sample.bin';
  try {
    const pathname = new URL(audioUrl).pathname;
    const basename = pathname.split('/').pop();
    if (basename) {
      sourceFilename = basename;
    }
  } catch {
    // Keep fallback filename when the dataset URL cannot be parsed.
  }

  onProgress?.({ stage: 'decoding_audio', message: 'Decoding audio...' });
  const decoded = await decodeAudioBufferToMonoPcm(audioBuffer, { targetSampleRate });
  const pcm = decoded.pcm;
  const duration = decoded.durationSec;

  onProgress?.({ stage: 'complete', message: 'Ready' });

  return {
    audioBuffer,
    pcm,
    transcription,
    duration,
    sampleIndex: randomIndex,
    dataset: row._dataset,
    language: langCode,
    sourceAudioUrl: audioUrl,
    sourceFilename,
    sourceMimeType,
  };
}

/**
 * Get list of languages with available test samples.
 * @returns {Array<{code: string, displayName: string}>}
 */
export function getAvailableLanguages() {
  return Object.entries(SPEECH_DATASETS).map(([code, config]) => ({
    code,
    displayName: config.displayName,
  }));
}
