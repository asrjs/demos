export function createTranscriptionRecord({
  id = Date.now(),
  filename,
  text,
  timestamp = new Date().toLocaleTimeString(),
  duration,
  audioDuration,
  startTimeSeconds,
  words,
  wordCount,
  confidence,
  metrics,
  language,
  task,
  targetLanguage,
  reference = '',
  clipUrl = null,
  clipFilename = null,
  clipMimeType = null,
}) {
  return {
    id,
    filename,
    text,
    timestamp,
    duration,
    audioDuration: audioDuration ?? duration,
    startTimeSeconds,
    words,
    wordCount,
    confidence,
    metrics,
    language,
    task,
    targetLanguage,
    reference,
    clipUrl,
    clipFilename,
    clipMimeType,
  };
}

export function createTranscriptionRecordFromResult({
  result,
  filename,
  duration,
  audioDuration,
  startTimeSeconds,
  reference = '',
  language,
  task,
  targetLanguage,
  timestamp,
  id,
  clipUrl,
  clipFilename,
  clipMimeType,
}) {
  const canonical = result?.canonical ?? result ?? null;
  return createTranscriptionRecord({
    id: id ?? Date.now() + Math.random(),
    filename,
    text: canonical?.text ?? '',
    timestamp,
    duration,
    audioDuration: audioDuration ?? duration,
    startTimeSeconds,
    words: canonical?.words ?? [],
    wordCount: canonical?.words?.length || 0,
    confidence:
      canonical?.meta?.averageTokenConfidence ??
      canonical?.meta?.averageWordConfidence ??
      canonical?.meta?.averageConfidence ??
      null,
    metrics: canonical?.meta?.metrics ?? null,
    language: result?.native?.language ?? language,
    task,
    targetLanguage,
    reference,
    clipUrl,
    clipFilename,
    clipMimeType,
  });
}
