export function buildLiveCodeSnippet({
  loadStrategy,
  modelId,
  backend,
  detail,
  responseFlavor,
  language,
  supportsStreaming = false,
}) {
  if (loadStrategy === 'universal-catalog') {
    const streamExample = supportsStreaming
      ? `if (model.supportsStreaming) {
  const streamer = await model.createStreamingTranscriber({ sampleRate: 16000 });
  try {
    const partial = await streamer.pushAudio(PcmAudioBuffer.fromMono(chunkFloat32, 16000));
    const finalTranscript = await streamer.finalize();
  } finally {
    await streamer.dispose();
  }
}`
      : `// model.supportsStreaming is false; the batch transcription above is the supported path.`;
    return `import { PcmAudioBuffer } from '@asrjs/speech-recognition';
import { loadBuiltInSpeechModel } from '@asrjs/speech-recognition/builtins';

const model = await loadBuiltInSpeechModel({
  modelId: '${modelId}',
  backend: '${backend}',
});

// Offline / Batch Transcription
const result = await model.transcribe(
  PcmAudioBuffer.fromMono(pcmFloat32, 16000),
  { detail: '${detail}', responseFlavor: '${responseFlavor}', language: '${language}' }
);

// Stateful Streaming (available only when the loaded model supports it)
${streamExample}`;
  }

  if (loadStrategy === 'root-helper') {
    return `import { loadSpeechModel, PcmAudioBuffer } from '@asrjs/speech-recognition';
import { createBrowserTranscriptionWorkerClient } from '@asrjs/speech-recognition/worker';

// Main-thread execution (worker clients transfer an owned copy of PCM):
const model = await loadSpeechModel({
  preset: 'parakeet',
  modelId: '${modelId}',
  backend: '${backend}',
});
const envelope = await model.transcribe(
  PcmAudioBuffer.fromMono(pcmFloat32, 16000),
  { detail: '${detail}', responseFlavor: '${responseFlavor}' }
);`;
  }

  return `import { loadModelWithFallback, ParakeetModel, getParakeetModel } from '@asrjs/speech-recognition/presets/parakeet';

const { model } = await loadModelWithFallback({
  repoIdOrModelKey: '${modelId}',
  options: { backend: '${backend}' },
  getParakeetModelFn: getParakeetModel,
  fromUrlsFn: ParakeetModel.fromUrls,
});
const nativeResult = await model.transcribe(pcmFloat32, 16000, { returnTimestamps: true });`;
}

export function buildCatalogLoadArguments(loadRequest, onProgress) {
  return { ...loadRequest, onProgress };
}
