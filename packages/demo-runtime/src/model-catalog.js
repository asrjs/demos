import {
  getSpeechModelDescriptor,
  listSpeechModels,
  listSpeechModelOptions,
} from '@asrjs/speech-recognition';
import { getDemoModelSourceOptions } from './model-loading.js';

export const DEMO_MODELS = Object.fromEntries(
  listSpeechModels()
    .filter((descriptor) => getDemoModelSourceOptions(descriptor.modelId).length > 0)
    .map((descriptor) => [descriptor.modelId, descriptor]),
);

export const MODEL_OPTIONS = listSpeechModelOptions().filter((option) => getDemoModelSourceOptions(option.key).length > 0);

export function getDemoModelConfig(modelId) {
  return getSpeechModelDescriptor(modelId);
}

// Catalog coverage markers describe a model; they are not decoder language tags.
export function getDemoModelLanguageOptions(modelId) {
  const languages = getSpeechModelDescriptor(modelId)?.languages ?? [];
  const concrete = languages.filter(language => language !== 'multilingual');
  return concrete.length ? concrete : ['auto'];
}

export function resolveDemoLanguage(language) {
  return language === 'auto' || language === 'multilingual' ? undefined : language;
}


export function getCanonicalRevision(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.defaultRevision || 'main';
}

export function getDescriptorEncoderQuantOptions(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.availableEncoderQuantizations || ['fp16', 'int8', 'fp32'];
}

export function getDescriptorDecoderQuantOptions(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.availableDecoderQuantizations || ['fp16', 'int8', 'fp32'];
}

export function getDescriptorDefaultEncoderQuant(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.defaultEncoderQuantization || 'fp32';
}

export function getDescriptorDefaultDecoderQuant(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.defaultDecoderQuantization || 'int8';
}

export function getDescriptorEncoderBackendOptions(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.availableEncoderBackends || ['webgpu', 'wasm'];
}

export function getDescriptorDecoderBackendOptions(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.availableDecoderBackends || ['webgpu', 'wasm'];
}

export function getDescriptorPreprocessorBackendOptions(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.preprocessorBackends || ['js', 'onnx'];
}

export function getDescriptorDefaultPreprocessorName(modelKey) {
  return DEMO_MODELS[modelKey]?.loading?.defaultPreprocessorName || 'nemo128';
}

export function getDescriptorDefaultPreprocessorBackend(modelKey) {
  const availableBackends = getDescriptorPreprocessorBackendOptions(modelKey);
  const preferredBackend = DEMO_MODELS[modelKey]?.loading?.defaultPreprocessorBackend || availableBackends[0] || 'js';
  return availableBackends.includes(preferredBackend) ? preferredBackend : (availableBackends[0] || 'js');
}

export function resolvePreprocessorBackendForSource(
  modelKey,
  requestedBackend,
  {
    modelSource = "huggingface",
    localPreprocessorCount = 0,
  } = {},
) {
  const availableBackends = getDescriptorPreprocessorBackendOptions(modelKey);
  const fallbackBackend = getDescriptorDefaultPreprocessorBackend(modelKey);
  const candidate = availableBackends.includes(requestedBackend) ? requestedBackend : fallbackBackend;

  if (
    modelSource === "local" &&
    candidate === 'onnx' &&
    localPreprocessorCount === 0
  ) {
    return availableBackends.includes('js') ? 'js' : fallbackBackend;
  }

  return candidate;
}
