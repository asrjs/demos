import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), configure: vi.fn() }));
vi.mock('@asrjs/speech-recognition/inference', () => ({ importUnifiedOrtModule: mocks.load, configureUnifiedOrtEnv: mocks.configure }));
import { initializeDemoRuntime, resolveDemoWasmPaths } from './browser-runtime.js';
describe('production ORT initialization', () => {
  beforeEach(() => vi.resetAllMocks());
  it('configures both real provider module instances under the app base', async () => {
    const wasm = {}, gpu = {};
    mocks.load.mockResolvedValueOnce(wasm).mockResolvedValueOnce(gpu);
    expect(await initializeDemoRuntime('/realtime/', 'https://example.test/realtime/')).toBe('https://example.test/realtime/ort/');
    expect(mocks.load.mock.calls).toEqual([['wasm'], ['webgpu']]);
    expect(mocks.configure.mock.calls).toEqual([[wasm, { wasmPaths: 'https://example.test/realtime/ort/' }], [gpu, { wasmPaths: 'https://example.test/realtime/ort/' }]]);
  });
  it('shares root ort directory when suiteBase is specified', async () => {
    const wasm = {}, gpu = {};
    mocks.load.mockResolvedValueOnce(wasm).mockResolvedValueOnce(gpu);
    expect(await initializeDemoRuntime('/realtime/', 'https://example.test/realtime/', { suiteBase: '/' })).toBe('https://example.test/ort/');
    expect(mocks.configure.mock.calls).toEqual([
      [wasm, { wasmPaths: 'https://example.test/ort/' }],
      [gpu, { wasmPaths: 'https://example.test/ort/' }],
    ]);
  });
  it('shares nested root ort directory when nested suiteBase is specified', async () => {
    const wasm = {}, gpu = {};
    mocks.load.mockResolvedValueOnce(wasm).mockResolvedValueOnce(gpu);
    expect(await initializeDemoRuntime('/demos/realtime/', 'https://example.test/demos/realtime/', { suiteBase: '/demos/' })).toBe('https://example.test/demos/ort/');
    expect(mocks.configure.mock.calls).toEqual([
      [wasm, { wasmPaths: 'https://example.test/demos/ort/' }],
      [gpu, { wasmPaths: 'https://example.test/demos/ort/' }],
    ]);
  });
  it('resolves demo wasm paths correctly via resolveDemoWasmPaths', () => {
    expect(resolveDemoWasmPaths('/realtime/', 'https://example.test/realtime/')).toBe('https://example.test/realtime/ort/');
    expect(resolveDemoWasmPaths('/realtime/', 'https://example.test/realtime/', { suiteBase: '/' })).toBe('https://example.test/ort/');
    expect(resolveDemoWasmPaths('/demos/realtime/', 'https://example.test/demos/realtime/', { suiteBase: '/demos/' })).toBe('https://example.test/demos/ort/');
    expect(resolveDemoWasmPaths('/realtime/', { origin: 'https://example.test/realtime/', suiteBase: '/' })).toBe('https://example.test/ort/');
  });
  it('uses global __ASRJS_SUITE_BASE__ when defined', () => {
    try {
      globalThis.__ASRJS_SUITE_BASE__ = '/suite-root/';
      expect(resolveDemoWasmPaths('/realtime/', 'https://example.test/realtime/')).toBe('https://example.test/suite-root/ort/');
    } finally {
      delete globalThis.__ASRJS_SUITE_BASE__;
    }
  });
  it('rejects startup when a provider cannot initialize', async () => {
    mocks.load.mockRejectedValue(new Error('provider unavailable'));
    await expect(initializeDemoRuntime('/', 'https://example.test/')).rejects.toThrow('provider unavailable');
    expect(mocks.configure).not.toHaveBeenCalled();
  });
});

