import { describe, expect, it, vi } from 'vitest';
import { buildCatalogLoadArguments, buildLiveCodeSnippet } from './codeSnippet.js';

const snippetOptions = {
  loadStrategy: 'universal-catalog',
  modelId: 'moonshine-tiny',
  backend: 'wasm',
  detail: 'words',
  responseFlavor: 'canonical',
  language: 'en',
};

describe('playground model examples', () => {
  it('preserves the exact catalog load request and its nested options', () => {
    const options = { cpuThreads: 4, enableProfiling: true, language: 'en' };
    const request = { modelId: 'moonshine-tiny', backend: 'wasm', options };
    const onProgress = vi.fn();
    const args = buildCatalogLoadArguments(request, onProgress);
    expect(args).toMatchObject(request);
    expect(args.options).toBe(options);
    expect(args.onProgress).toBe(onProgress);
  });

  it('shows the streaming path only for a model with streaming support', () => {
    const streaming = buildLiveCodeSnippet({ ...snippetOptions, supportsStreaming: true });
    const offline = buildLiveCodeSnippet({ ...snippetOptions, supportsStreaming: false });

    expect(streaming).toContain('if (model.supportsStreaming)');
    expect(streaming).toContain('model.createStreamingTranscriber');
    expect(offline).toContain('model.supportsStreaming is false');
    expect(offline).not.toContain('createStreamingTranscriber');
    expect(offline).toContain('model.transcribe(');
  });
});
