import { describe, expect, it } from 'vitest';
import {
  buildLocalFolderSelection,
  getLocalFolderNameFromEntries,
} from './localFolderHelpers.js';

describe('local folder helpers', () => {
  it('derives a folder name from local entries', () => {
    expect(
      getLocalFolderNameFromEntries([
        { path: 'demo-folder/nemo128.onnx', basename: 'nemo128.onnx' },
      ]),
    ).toBe('demo-folder');
  });

  it('falls back to safe defaults when no local artifacts are present', () => {
    const selection = buildLocalFolderSelection([], {
      selectedModel: 'parakeet-tdt-0.6b-v2',
      modelSource: 'local',
      backend: 'webgpu-hybrid',
      currentEncoderQuant: 'fp16',
      currentDecoderQuant: 'int8',
      currentTokenizerName: 'vocab.txt',
      currentPreprocessor: 'nemo128',
      currentPreprocessorBackend: 'onnx',
    });

    expect(selection.localFolderName).toBe('');
    expect(selection.encoderQuantOptions).toEqual(['fp32']);
    expect(selection.decoderQuantOptions).toEqual(['fp32']);
    expect(selection.localTokenizerOptions).toEqual([]);
    expect(selection.localTokenizerName).toBe('');
    expect(selection.localPreprocessorOptions).toEqual([]);
    expect(selection.preprocessor).toBe('nemo128');
    expect(selection.preprocessorBackend).toBe('js');
    expect(selection.localDetectedArtifacts).toEqual({
      encoder: [],
      decoder: [],
      tokenizers: [],
      preprocessors: [],
    });
  });
});
