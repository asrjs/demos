import {
  createParakeetLocalEntries,
  inspectParakeetLocalEntries,
} from '@asrjs/speech-recognition/presets/parakeet';
import {
  getDescriptorDefaultPreprocessorBackend,
  getDescriptorDefaultPreprocessorName,
  resolvePreprocessorBackendForSource,
} from './modelDescriptors.js';
import { pickPreferredQuant } from '../shared/modelSelection.js';

export function getLocalFolderNameFromEntries(entries) {
  return entries[0]?.path?.split('/')?.[0] || '';
}

export function buildLocalFolderSelection(entries, context) {
  const inspection = inspectParakeetLocalEntries(entries);
  const encOptions = [...inspection.encoderQuantizations];
  const decOptions = [...inspection.decoderQuantizations];
  const nextEncOptions = encOptions.length ? encOptions : ['fp32'];
  const nextDecOptions = decOptions.length ? decOptions : ['fp32'];
  const dedupedTokenizer = [...inspection.tokenizerNames];
  const dedupedPreprocessor = [...inspection.preprocessorNames];
  const defaultPreprocessorName = getDescriptorDefaultPreprocessorName(context.selectedModel);
  const defaultPreprocessorBackend = getDescriptorDefaultPreprocessorBackend(context.selectedModel);

  const tokenizerName = dedupedTokenizer.length
    ? (dedupedTokenizer.includes(context.currentTokenizerName)
      ? context.currentTokenizerName
      : dedupedTokenizer[0])
    : '';

  const nextPreprocessor = dedupedPreprocessor.length
    ? (dedupedPreprocessor.includes(context.currentPreprocessor)
      ? context.currentPreprocessor
      : dedupedPreprocessor[0])
    : defaultPreprocessorName;

  const nextPreprocessorBackend = resolvePreprocessorBackendForSource(
    context.selectedModel,
    dedupedPreprocessor.length > 0
      ? context.currentPreprocessorBackend
      : defaultPreprocessorBackend,
    {
      modelSource: context.modelSource,
      localPreprocessorCount: dedupedPreprocessor.length,
    },
  );

  return {
    localEntries: entries,
    localFolderName: getLocalFolderNameFromEntries(entries),
    encoderQuantOptions: nextEncOptions,
    decoderQuantOptions: nextDecOptions,
    encoderQuant: nextEncOptions.includes(context.currentEncoderQuant)
      ? context.currentEncoderQuant
      : pickPreferredQuant(nextEncOptions, context.backend, 'encoder'),
    decoderQuant: nextDecOptions.includes(context.currentDecoderQuant)
      ? context.currentDecoderQuant
      : pickPreferredQuant(nextDecOptions, context.backend, 'decoder'),
    localTokenizerOptions: dedupedTokenizer,
    localTokenizerName: tokenizerName,
    localPreprocessorOptions: dedupedPreprocessor,
    preprocessor: nextPreprocessor,
    preprocessorBackend: nextPreprocessorBackend,
    localDetectedArtifacts: {
      encoder: encOptions,
      decoder: decOptions,
      tokenizers: dedupedTokenizer,
      preprocessors: dedupedPreprocessor,
    },
    status: `Local folder selected (${entries.length} files)`,
  };
}

export function createLocalFolderEntriesFromFiles(files) {
  return createParakeetLocalEntries(files);
}
