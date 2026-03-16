import {
  getBuiltInModelDescriptor,
  listBuiltInModelDescriptors,
  listBuiltInModelOptions,
} from '@asrjs/speech-recognition/presets';

export const DEMO_MODELS = Object.fromEntries(
  listBuiltInModelDescriptors()
    .filter((descriptor) => descriptor.loading.repoId)
    .map((descriptor) => [descriptor.modelId, descriptor]),
);

export const MODEL_OPTIONS = listBuiltInModelOptions().filter((option) => option.repoId);

export function getDemoModelConfig(modelId) {
  return getBuiltInModelDescriptor(modelId);
}
