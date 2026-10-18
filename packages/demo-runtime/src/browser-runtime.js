import { configureUnifiedOrtEnv, importUnifiedOrtModule } from '@asrjs/speech-recognition/inference';

export async function initializeDemoRuntime(baseUrl, origin = window.location.href) {
  const wasmPaths = new URL(`${baseUrl}ort/`, origin).href;
  // Both providers can be used by a hybrid model. Configure their actual library
  // module instances before the app can start creating sessions.
  for (const backend of ['wasm', 'webgpu']) {
    const ort = await importUnifiedOrtModule(backend);
    configureUnifiedOrtEnv(ort, { wasmPaths });
  }
  return wasmPaths;
}
