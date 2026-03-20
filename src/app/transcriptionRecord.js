export function createTranscriptionRecord({
  id = Date.now(),
  filename,
  text,
  timestamp = new Date().toLocaleTimeString(),
  duration,
  wordCount,
  confidence,
  metrics,
  language,
  task,
  targetLanguage,
  reference = '',
}) {
  return {
    id,
    filename,
    text,
    timestamp,
    duration,
    wordCount,
    confidence,
    metrics,
    language,
    task,
    targetLanguage,
    reference,
  };
}

export function createTranscriptionRecordFromResult({
  result,
  filename,
  duration,
  reference = '',
  language,
  task,
  targetLanguage,
  timestamp,
  id,
}) {
  const canonical = result?.canonical ?? result ?? null;
  return createTranscriptionRecord({
    id: id ?? Date.now() + Math.random(),
    filename,
    text: canonical?.text ?? '',
    timestamp,
    duration,
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
  });
}
