import { MODELS as PARAKEET_MODELS } from '@asrjs/speech-recognition/presets/parakeet';
import { resolveMedAsrPresetManifest } from '@asrjs/speech-recognition/presets/medasr';

const medAsrManifest = resolveMedAsrPresetManifest('google/medasr');

export const DEMO_MODELS = {
  ...Object.fromEntries(
    Object.entries(PARAKEET_MODELS).map(([key, config]) => [
      key,
      {
        ...config,
        key,
        preset: 'parakeet',
        supportsLocalSource: true,
        supportsSplitQuantization: true,
        supportsPreprocessorBackend: true,
        warmupMode: 'expected-text',
      },
    ]),
  ),
  'google/medasr': {
    key: 'google/medasr',
    repoId: medAsrManifest?.source?.kind === 'huggingface' ? medAsrManifest.source.repoId : 'ysdede/medasr-onnx',
    displayName: 'Google MedASR (Medical English)',
    languages: medAsrManifest?.config.languages ?? ['en'],
    preset: 'medasr',
    supportsLocalSource: false,
    supportsSplitQuantization: false,
    supportsPreprocessorBackend: false,
    warmupMode: 'non-empty',
    description: medAsrManifest?.description,
  },
};

export const MODEL_OPTIONS = Object.values(DEMO_MODELS).map((model) => ({
  key: model.key,
  repoId: model.repoId,
  displayName: model.displayName,
  languages: model.languages,
  preset: model.preset,
}));

export function getDemoModelConfig(modelId) {
  return DEMO_MODELS[modelId];
}
