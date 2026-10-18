import { DEMO_MODELS } from '../shared/modelCatalog.js';
import { MODEL_SOURCE_OPTIONS } from './constants.js';

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
    modelSource = MODEL_SOURCE_OPTIONS.HUGGINGFACE,
    localPreprocessorCount = 0,
  } = {},
) {
  const availableBackends = getDescriptorPreprocessorBackendOptions(modelKey);
  const fallbackBackend = getDescriptorDefaultPreprocessorBackend(modelKey);
  const candidate = availableBackends.includes(requestedBackend) ? requestedBackend : fallbackBackend;

  if (
    modelSource === MODEL_SOURCE_OPTIONS.LOCAL &&
    candidate === 'onnx' &&
    localPreprocessorCount === 0
  ) {
    return availableBackends.includes('js') ? 'js' : fallbackBackend;
  }

  return candidate;
}
