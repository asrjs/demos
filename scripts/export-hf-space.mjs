// Turns a suite build (built with base "/") into a prebuilt static Hugging Face Space.
//
// Hugging Face serves COOP/COEP from the README `custom_headers`, so the
// coi-serviceworker used on GitHub Pages is removed: on *.hf.space a service
// worker only adds a reload and can serve stale chunks after a redeploy.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COI_SCRIPT = /\s*<script\b[^>]*\bsrc=["'][^"']*coi-serviceworker\.js["'][^>]*>\s*<\/script>/gi;

export function stripCoiServiceWorker(html) {
  return html.replace(COI_SCRIPT, '');
}

export function createSpaceReadme({ commit = 'local', branch = 'local', sdkVersion = 'unknown' } = {}) {
  return `---
title: ASRJS Speech Recognition
emoji: 🎙️
colorFrom: indigo
colorTo: blue
sdk: static
app_file: index.html
pinned: true
header: mini
fullWidth: true
license: mit
short_description: In-browser speech recognition with WebGPU and WASM
models:
  - ysdede/parakeet-tdt-0.6b-v3-onnx
tags:
  - speech-recognition
  - asr
  - webgpu
  - wasm
  - onnx
  - parakeet
custom_headers:
  cross-origin-embedder-policy: require-corp
  cross-origin-opener-policy: same-origin
  cross-origin-resource-policy: cross-origin
---

# ASRJS Speech Recognition

Four workspaces for [\`@asrjs/speech-recognition\`](https://www.npmjs.com/package/@asrjs/speech-recognition): transcribe files, explore the API, run live microphone transcription and benchmark models. Everything runs in your browser.

Built by GitHub Actions from [asrjs/demos](https://github.com/asrjs/demos) at \`${commit}\` (${branch}) with SDK ${sdkVersion}. This Space serves prebuilt static files; Hugging Face does not run a build step.
`;
}

async function copyTree(source, target, skip) {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyTree(from, to, skip);
    else await fs.copyFile(from, to);
  }
}

async function listFiles(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else files.push(full);
  }
  return files;
}

export async function exportHfSpace({
  dist = path.join(root, 'dist'),
  out = path.join(root, 'hf_export'),
  commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local',
  branch = process.env.GITHUB_REF_NAME ?? 'local',
} = {}) {
  await fs.access(path.join(dist, 'index.html'));
  await fs.rm(out, { recursive: true, force: true });
  await copyTree(dist, out, (name) => name === '.asrjs-backups' || name === 'coi-serviceworker.js');

  let stripped = 0;
  for (const file of await listFiles(out)) {
    if (!file.endsWith('.html')) continue;
    const html = await fs.readFile(file, 'utf8');
    const next = stripCoiServiceWorker(html);
    if (next !== html) {
      stripped += 1;
      await fs.writeFile(file, next);
    }
  }

  const sdkPackage = JSON.parse(
    await fs.readFile(path.join(root, 'node_modules/@asrjs/speech-recognition/package.json'), 'utf8'),
  );
  await fs.writeFile(
    path.join(out, 'README.md'),
    createSpaceReadme({ commit, branch, sdkVersion: sdkPackage.version }),
  );
  await fs.writeFile(
    path.join(out, 'git-info.json'),
    `${JSON.stringify({ branch, commit, sdk: sdkPackage.version })}\n`,
  );
  return { out, stripped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { out, stripped } = await exportHfSpace();
  console.log(`HF Space export at ${out}; removed coi-serviceworker from ${stripped} page(s).`);
}
