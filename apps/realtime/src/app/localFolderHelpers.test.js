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
      loadingState: {
        source: 'local', inspection: { encoderQuantizations: [], decoderQuantizations: [], tokenizerNames: [], preprocessorNames: [] },
        encoderQuantOptions: [], decoderQuantOptions: [], encoderQuant: undefined,
        decoderQuant: undefined, encoderBackend: 'wasm', decoderBackend: 'wasm',
      },
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
    expect(selection.encoderQuantOptions).toEqual([]);
    expect(selection.decoderQuantOptions).toEqual([]);
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

  it('uses the selected model adapter inspection and preserves real local quant choices', () => {
    const selection = buildLocalFolderSelection([
      { path: 'qwen/decoder-fp16.onnx', basename: 'decoder-fp16.onnx' },
    ], {
      loadingState: {
        source: 'local', inspection: { encoderQuantizations: ['fp16'], decoderQuantizations: ['fp16', 'int8'], tokenizerNames: ['tokenizer.json'], preprocessorNames: [] },
        encoderQuantOptions: ['fp16'], decoderQuantOptions: ['fp16', 'int8'],
        encoderQuant: 'fp16', decoderQuant: 'int8', encoderBackend: 'wasm', decoderBackend: 'wasm',
      },
      selectedModel: 'qwen3-asr-0.6b', modelSource: 'local', backend: 'wasm',
      currentEncoderQuant: 'fp16', currentDecoderQuant: 'int8', currentTokenizerName: 'tokenizer.json',
      currentPreprocessor: 'mel', currentPreprocessorBackend: 'js',
    });
    expect(selection.encoderQuantOptions).toEqual(['fp16']);
    expect(selection.decoderQuantOptions).toEqual(['fp16', 'int8']);
    expect(selection.decoderQuant).toBe('int8');
    expect(selection.localTokenizerName).toBe('tokenizer.json');
    expect(selection.localDetectedArtifacts.decoder).toEqual(['fp16', 'int8']);
  });
});
