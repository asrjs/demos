import { buildSpeechTranscriptionOptions } from '@asrjs/speech-recognition';

export function buildTranscriptionOptions(
  modelId,
  {
    sourceLanguage,
    targetLanguage,
    task = 'asr',
    punctuate = true,
    timestamps = true,
    frameStride = 1,
    returnConfidences = true,
    enableProfiling = false,
  } = {},
) {
  return {
    detail: timestamps ? 'words' : 'text',
    ...buildSpeechTranscriptionOptions(modelId, {
      sourceLanguage,
      targetLanguage,
      task,
      punctuate,
      timestamps,
      frameStride,
      returnConfidences,
      enableProfiling,
    }),
  };
}
