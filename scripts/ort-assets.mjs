import fs from 'node:fs/promises';
import path from 'node:path';

const assetPattern = /^ort-wasm-simd-threaded(?:\.(?:asyncify|jsep|jspi))?\.(?:mjs|wasm)$/;

export async function copyOrtRuntimeAssets(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && assetPattern.test(entry.name)).map(entry => entry.name).sort();
  if (!names.some(name => name.endsWith('.wasm')) || !names.some(name => name.endsWith('.mjs'))) {
    throw new Error(`No complete ONNX Runtime Web WASM asset set found in ${sourceDir}.`);
  }
  await fs.mkdir(targetDir, { recursive: true });
  for (const name of names) await fs.copyFile(path.join(sourceDir, name), path.join(targetDir, name));
  return names;
}
