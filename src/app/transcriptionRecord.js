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
  return createTranscriptionRecord({
    id: id ?? Date.now() + Math.random(),
    filename,
    text: result?.utterance_text ?? '',
    timestamp,
    duration,
    wordCount: result?.words?.length || 0,
    confidence: result?.confidence_scores?.token_avg ?? result?.confidence_scores?.word_avg ?? null,
    metrics: result?.metrics,
    language: result?.native?.language ?? language,
    task,
    targetLanguage,
    reference,
  });
}
