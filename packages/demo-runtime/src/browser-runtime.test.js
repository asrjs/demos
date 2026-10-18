import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), configure: vi.fn() }));
vi.mock('@asrjs/speech-recognition/inference', () => ({ importUnifiedOrtModule: mocks.load, configureUnifiedOrtEnv: mocks.configure }));
import { initializeDemoRuntime } from './browser-runtime.js';
describe('production ORT initialization', () => {
  beforeEach(() => vi.resetAllMocks());
  it('configures both real provider module instances under the app base', async () => {
    const wasm = {}, gpu = {};
    mocks.load.mockResolvedValueOnce(wasm).mockResolvedValueOnce(gpu);
    expect(await initializeDemoRuntime('/realtime/', 'https://example.test/realtime/')).toBe('https://example.test/realtime/ort/');
    expect(mocks.load.mock.calls).toEqual([['wasm'], ['webgpu']]);
    expect(mocks.configure.mock.calls).toEqual([[wasm, { wasmPaths: 'https://example.test/realtime/ort/' }], [gpu, { wasmPaths: 'https://example.test/realtime/ort/' }]]);
  });
  it('rejects startup when a provider cannot initialize', async () => {
    mocks.load.mockRejectedValue(new Error('provider unavailable'));
    await expect(initializeDemoRuntime('/', 'https://example.test/')).rejects.toThrow('provider unavailable');
    expect(mocks.configure).not.toHaveBeenCalled();
  });
});
