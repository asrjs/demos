import {
  getSpeechModelDescriptor,
  listSpeechModels,
  listSpeechModelOptions,
} from '@asrjs/speech-recognition';

export const DEMO_MODELS = Object.fromEntries(
  listSpeechModels()
    .filter((descriptor) => descriptor.loading.repoId)
    .map((descriptor) => [descriptor.modelId, descriptor]),
);

export const MODEL_OPTIONS = listSpeechModelOptions().filter((option) => option.repoId);

export function getDemoModelConfig(modelId) {
  return getSpeechModelDescriptor(modelId);
}
