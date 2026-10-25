import {
  getDescriptorDefaultPreprocessorBackend,
  getDescriptorDefaultPreprocessorName,
  resolvePreprocessorBackendForSource,
} from './modelDescriptors.js';
import {
  createSpeechModelLocalEntries,
  inspectSpeechModelLocalEntries,
} from '@asrjs/speech-recognition/browser';

export function getLocalFolderNameFromEntries(entries) {
  return entries[0]?.path?.split('/')?.[0] || '';
}

export function buildLocalFolderSelection(entries, context) {
  const inspection = context.loadingState.inspection
    || (context.loadingState.source === 'local'
      ? inspectSpeechModelLocalEntries(context.selectedModel, entries)
      : { encoderQuantizations: [], decoderQuantizations: [], tokenizerNames: [], preprocessorNames: [] });
  const encOptions = [...inspection.encoderQuantizations];
  const decOptions = [...inspection.decoderQuantizations];
  const nextEncOptions = context.loadingState.encoderQuantOptions;
  const nextDecOptions = context.loadingState.decoderQuantOptions;
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
    encoderQuant: context.loadingState.encoderQuant ?? context.currentEncoderQuant,
    decoderQuant: context.loadingState.decoderQuant ?? context.currentDecoderQuant,
    encoderBackend: context.loadingState.encoderBackend,
    decoderBackend: context.loadingState.decoderBackend,
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
  return createSpeechModelLocalEntries(files);
}
