import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = path.resolve(appDir, '../..');
import { copyOrtRuntimeAssets } from '../../../scripts/ort-assets.mjs';
export { copyOrtRuntimeAssets };

export function resolveOrtRuntimeDist(env = process.env, packageRootOverride) {
  const sourceMode = env.ASRJS_SOURCE === 'npm' ? 'package' : (env.ASRJS_SOURCE || 'package');
  if (sourceMode !== 'package' && sourceMode !== 'source') {
    throw new Error(`ASRJS_SOURCE must be "package" or "source"; received "${sourceMode}".`);
  }

  let libraryRoot;
  if (sourceMode === 'source') {
    libraryRoot = path.resolve(
      env.ASRJS_LIB_DIR || packageRootOverride || path.resolve(monorepoRoot, '../speech-recognition'),
    );
  } else if (packageRootOverride) {
    libraryRoot = path.resolve(packageRootOverride);
  } else {
    const requireFromApp = createRequire(path.join(appDir, 'package.json'));
    const libraryEntry = requireFromApp.resolve('@asrjs/speech-recognition');
    libraryRoot = path.resolve(path.dirname(libraryEntry), '..');
  }

  const requireFromLibrary = createRequire(path.join(libraryRoot, 'package.json'));
  return path.dirname(requireFromLibrary.resolve('onnxruntime-web'));
}

async function main() {
  const sourceDir = resolveOrtRuntimeDist();
  const targetDir = path.join(appDir, 'public', 'ort');
  const names = await copyOrtRuntimeAssets(sourceDir, targetDir);
  console.log(`Prepared ${names.length} ONNX Runtime Web WASM assets in ${targetDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
