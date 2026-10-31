import { configureUnifiedOrtEnv, importUnifiedOrtModule } from '@asrjs/speech-recognition/inference';

export function resolveDemoWasmPaths(
  baseUrl = '/',
  origin = (typeof window !== 'undefined' ? window.location.href : 'http://localhost/'),
  options = {},
) {
  let originUrl = origin;
  let opts = options;
  if (typeof origin === 'object' && origin !== null) {
    opts = origin;
    originUrl = opts.origin || (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  }
  const suiteBase = opts.suiteBase ?? (typeof __ASRJS_SUITE_BASE__ !== 'undefined' ? __ASRJS_SUITE_BASE__ : '');
  const rawBase = (suiteBase || baseUrl || '/');
  const effectiveBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return new URL(`${effectiveBase}ort/`, originUrl).href;
}

export async function initializeDemoRuntime(
  baseUrl,
  origin = (typeof window !== 'undefined' ? window.location.href : 'http://localhost/'),
  options = {},
) {
  const wasmPaths = resolveDemoWasmPaths(baseUrl, origin, options);
  // Both providers can be used by a hybrid model. Configure their actual library
  // module instances before the app can start creating sessions.
  for (const backend of ['wasm', 'webgpu']) {
    const ort = await importUnifiedOrtModule(backend);
    configureUnifiedOrtEnv(ort, { wasmPaths });
  }
  return wasmPaths;
}

