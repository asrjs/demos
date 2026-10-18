import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyOrtRuntimeAssets, resolveOrtRuntimeDist } from './prepare-ort-assets.mjs';

const temporaryDirectories = [];

async function makeTempDir() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'asrjs-ort-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true }),
  ));
});

describe('ONNX Runtime Web asset preparation', () => {
  it('copies only the runtime WASM modules and binaries into the public asset directory', async () => {
    const sourceDir = await makeTempDir();
    const targetDir = path.join(await makeTempDir(), 'public', 'ort');
    const names = [
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
      'ort.all.bundle.min.mjs',
      'ort-wasm-threaded.wasm',
    ];
    for (const name of names) await fs.writeFile(path.join(sourceDir, name), name);

    const copied = await copyOrtRuntimeAssets(sourceDir, targetDir);
    const expected = names.slice(0, 4).sort();
    expect(copied).toEqual(expected);
    expect(await fs.readdir(targetDir)).toEqual(expected);
    expect(await fs.readFile(path.join(targetDir, names[0]), 'utf8')).toBe(names[0]);
  });

  it('rejects a missing runtime module or binary instead of producing an incomplete build', async () => {
    const sourceDir = await makeTempDir();
    const targetDir = path.join(await makeTempDir(), 'public', 'ort');
    await fs.writeFile(path.join(sourceDir, 'ort-wasm-simd-threaded.wasm'), 'wasm');

    await expect(copyOrtRuntimeAssets(sourceDir, targetDir)).rejects.toThrow(
      /No complete ONNX Runtime Web WASM asset set/,
    );
  });

  it('resolves ONNX Runtime Web from the selected speech package installation', async () => {
    const libraryRoot = await makeTempDir();
    const runtimeDist = path.join(libraryRoot, 'node_modules', 'onnxruntime-web', 'dist');
    await fs.mkdir(runtimeDist, { recursive: true });
    await fs.writeFile(
      path.join(libraryRoot, 'package.json'),
      JSON.stringify({ name: '@asrjs/speech-recognition', version: '0.2.0' }),
    );
    await fs.writeFile(
      path.join(libraryRoot, 'node_modules', 'onnxruntime-web', 'package.json'),
      JSON.stringify({ name: 'onnxruntime-web', main: 'dist/ort.all.bundle.min.mjs' }),
    );
    await fs.writeFile(path.join(runtimeDist, 'ort.all.bundle.min.mjs'), '');

    expect(resolveOrtRuntimeDist({ ASRJS_SOURCE: 'package' }, libraryRoot)).toBe(runtimeDist);
  });
});
